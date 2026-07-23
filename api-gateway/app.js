require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@as-integrations/express5');
const jwt = require('jsonwebtoken');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');

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

async function createApp() {
    const app = express();

    const apolloServer = new ApolloServer({
        typeDefs,
        resolvers,
        introspection: !isProduction,
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
              })
            : // Le Sandbox Apollo (landing page GraphQL en dev) charge un iframe
              // et des scripts depuis apollographql.com — CSP désactivée en dev uniquement.
              helmet({ contentSecurityPolicy: false }),
    );

    app.use(pinoHttp({ logger }));

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
            context: async ({ req }) => {
                const authHeader = req.headers.authorization;
                let user = null;

                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.split(' ')[1];
                    try {
                        user = jwt.verify(token, JWT_SECRET);
                    } catch {
                        logger.warn('Token invalide ignoré');
                    }
                }

                return { user, req };
            },
        }),
    );

    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    return { app, apolloServer };
}

module.exports = createApp;
