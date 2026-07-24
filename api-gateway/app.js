require('dotenv').config();

const { randomUUID } = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const depthLimit = require('graphql-depth-limit');
const { getComplexity, simpleEstimator } = require('graphql-query-complexity');
const { GraphQLError } = require('graphql');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@as-integrations/express5');
const jwt = require('jsonwebtoken');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const cache = require('./cache');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { AUTH_COOKIE_NAME } = require('./authCookie');

if (!process.env.JWT_SECRET) throw new Error('[FATAL] JWT_SECRET non défini — démarrage refusé');
const JWT_SECRET = process.env.JWT_SECRET;

function parseCorsOriginsFromEnv() {
    const rawList = process.env.CORS_ORIGINS;
    const rawSingle = process.env.CORS_ORIGIN;

    const list = (rawList || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (list.length > 0) return new Set(list);
    if (rawSingle && rawSingle.trim()) return new Set([rawSingle.trim()]);

    return new Set(['http://localhost:3000']);
}

const CORS_ORIGINS = parseCorsOriginsFromEnv();
function corsOriginValidator(origin, cb) {
    // Autorise les requêtes sans header Origin (curl / server-to-server)
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`CORS refusé pour l'origine: ${origin}`));
}

const isProduction = process.env.NODE_ENV === 'production';

// Le schéma actuel est plat (aucun type récursif, getColocDashboard ne dépasse pas 4 niveaux) :
// ces limites sont préventives, pas correctives d'un risque déjà exploitable aujourd'hui.
const MAX_QUERY_DEPTH = 10;
const MAX_QUERY_COMPLEXITY = 1000;

// graphql-query-complexity a besoin des variables réelles de la requête pour estimer
// les champs dont le coût dépend d'un argument (ex. limit: $n) : on ne peut pas passer
// une règle de validation statique, donc le contrôle se fait via un plugin Apollo qui a
// accès à `request.variables` (après résolution de l'opération, avant exécution).
const complexityPlugin = {
    async requestDidStart() {
        return {
            async didResolveOperation({ request, document, schema, operationName }) {
                const complexity = getComplexity({
                    schema,
                    query: document,
                    variables: request.variables || {},
                    operationName: operationName || request.operationName,
                    estimators: [simpleEstimator({ defaultComplexity: 1 })],
                });

                if (complexity > MAX_QUERY_COMPLEXITY) {
                    throw new GraphQLError(
                        `Requête trop complexe (${complexity}) — maximum autorisé : ${MAX_QUERY_COMPLEXITY}`,
                    );
                }
            },
        };
    },
};

async function createApp() {
    const app = express();

    // Instancié à chaque appel (et non au niveau du module) pour que chaque app créée par les
    // tests ait son propre compteur en mémoire : un `graphqlLimiter` partagé au niveau module
    // ferait fuiter l'état entre fichiers de test exécutés dans le même worker Vitest. En
    // production, `createApp()` n'est appelé qu'une fois, donc ce changement est neutre.
    const graphqlLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Trop de requêtes — réessayez dans une minute' },
        handler: (req, res, _next, options) => {
            logger.warn({ ip: req.ip }, 'Rate limit dépassé sur /graphql');
            res.status(options.statusCode).json(options.message);
        },
    });

    const apolloServer = new ApolloServer({
        typeDefs,
        resolvers,
        introspection: !isProduction,
        validationRules: [depthLimit(MAX_QUERY_DEPTH)],
        plugins: [complexityPlugin],
    });
    await apolloServer.start();

    app.use(
        isProduction
            ? helmet({
                  contentSecurityPolicy: {
                      directives: {
                          defaultSrc: ["'self'"],
                          scriptSrc: ["'self'"],
                          styleSrc: ["'self'"],
                          imgSrc: ["'self'"],
                          connectSrc: ["'self'"],
                          frameAncestors: ["'none'"],
                      },
                  },
                  // Front Vite (:5173) et API (:4000) sont cross-origin en local / split hosting.
                  crossOriginResourcePolicy: { policy: 'cross-origin' },
              })
            : // Le Sandbox Apollo (landing page GraphQL en dev) charge un iframe
              // et des scripts depuis apollographql.com — CSP désactivée en dev uniquement.
              helmet({
                  contentSecurityPolicy: false,
                  crossOriginResourcePolicy: { policy: 'cross-origin' },
              }),
    );

    // Identifiant de corrélation propagé du client jusqu'aux services en aval (via
    // forwardHeaders dans resolvers.js), pour retracer une requête de bout en bout.
    app.use((req, res, next) => {
        req.headers['x-request-id'] = req.headers['x-request-id'] || randomUUID();
        res.setHeader('x-request-id', req.headers['x-request-id']);
        next();
    });

    app.use(pinoHttp({ logger, genReqId: (req) => req.headers['x-request-id'] }));
    app.use(cookieParser());

    app.use(
        '/graphql',
        cors({
            origin: corsOriginValidator,
            credentials: true,
            optionsSuccessStatus: 204,
        }),
        graphqlLimiter,
        express.json(),
        expressMiddleware(apolloServer, {
            context: async ({ req, res }) => {
                const token = req.cookies?.[AUTH_COOKIE_NAME];
                let user = null;

                if (token) {
                    try {
                        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
                        const revoked =
                            decoded.jti && (await cache.get(`revoked_jwt:${decoded.jti}`));

                        if (revoked) {
                            logger.warn({ userId: decoded.id }, 'Token révoqué ignoré');
                        } else {
                            user = decoded;
                            // Les services en aval (domus/labor/concordia) attendent toujours
                            // un en-tête Authorization — le cookie ne les concerne pas.
                            req.headers.authorization = `Bearer ${token}`;
                        }
                    } catch {
                        logger.warn('Token invalide ignoré');
                    }
                }

                return { user, req, res };
            },
        }),
    );

    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    return { app, apolloServer };
}

module.exports = createApp;
