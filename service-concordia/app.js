require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');
const logger = require('./logger');
const Notification = require('./models/Notification');
const NotificationReadState = require('./models/NotificationReadState');
const auth = require('./middleware/auth');
const socialRoutes = require('./routes/social');
const karmaRoutes = require('./routes/karma');

// Mongoose expose _id, pas id — le schéma GraphQL déclare Notification.id: ID! (non
// nullable). Sans ce mapping (déjà fait pour Complaint/Poll via toPollObject/sanitize
// dans routes/social.js), la query notifications() échoue dès qu'un document existe :
// "Cannot return null for non-nullable field Notification.id.", ce qui rendait
// l'historique invisible à chaque rechargement.
function toNotificationObject(notification) {
    const obj = notification.toObject ? notification.toObject() : { ...notification };
    obj.id = String(obj._id);
    delete obj._id;
    return obj;
}

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

function createApp() {
    // Instancié à chaque appel (et non au niveau du module) pour que chaque app créée par les
    // tests ait son propre compteur en mémoire : un `apiLimiter` partagé au niveau module ferait
    // fuiter l'état entre fichiers de test exécutés dans le même worker Vitest. En production,
    // `createApp()` n'est appelé qu'une fois (index.js), donc ce changement est neutre.
    const apiLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Trop de requêtes — réessayez dans une minute' },
        skip: (req) => req.path === '/health',
        handler: (req, res, _next, options) => {
            logger.warn({ ip: req.ip }, 'Rate limit dépassé sur service-concordia');
            res.status(options.statusCode).json(options.message);
        },
    });

    const app = express();
    app.use(helmet());
    app.use(
        cors({
            origin: corsOriginValidator,
            credentials: true,
            optionsSuccessStatus: 204,
        }),
    );
    app.use(pinoHttp({ logger, genReqId: (req) => req.headers['x-request-id'] }));
    app.use(express.json());
    app.use(apiLimiter);

    app.use('/api', auth, socialRoutes);
    app.use('/api', auth, karmaRoutes);

    app.get('/notifications/coloc/:id', auth, async (req, res) => {
        if (req.user.role !== 'ADMIN' && req.user.coloc_id !== req.params.id) {
            return res
                .status(403)
                .json({ error: "Non autorisé — Vous n'appartenez pas à cette colocation" });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        try {
            const [notifications, total] = await Promise.all([
                Notification.find({ coloc_id: req.params.id })
                    .sort({ created_at: -1 })
                    .skip(skip)
                    .limit(limit),
                Notification.countDocuments({ coloc_id: req.params.id }),
            ]);
            res.json({ data: notifications.map(toNotificationObject), pagination: { page, limit, total } });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Curseur "lu jusqu'à" par utilisateur — pas de suivi par notification, un horodatage suffit
    // (cf. NotificationReadState). Le badge non-lu se recalcule à partir de ce curseur au lieu
    // de vivre uniquement en mémoire côté client (perdu à chaque refresh sinon).
    app.get('/notifications/coloc/:id/unread-count', auth, async (req, res) => {
        if (req.user.role !== 'ADMIN' && req.user.coloc_id !== req.params.id) {
            return res
                .status(403)
                .json({ error: "Non autorisé — Vous n'appartenez pas à cette colocation" });
        }

        try {
            const state = await NotificationReadState.findOne({
                user_id: String(req.user.id),
                coloc_id: req.params.id,
            });
            const since = state?.last_read_at ?? new Date(0);
            const count = await Notification.countDocuments({
                coloc_id: req.params.id,
                created_at: { $gt: since },
            });
            res.json({ count });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/notifications/coloc/:id/read', auth, async (req, res) => {
        if (req.user.role !== 'ADMIN' && req.user.coloc_id !== req.params.id) {
            return res
                .status(403)
                .json({ error: "Non autorisé — Vous n'appartenez pas à cette colocation" });
        }

        try {
            const last_read_at = new Date();
            await NotificationReadState.findOneAndUpdate(
                { user_id: String(req.user.id), coloc_id: req.params.id },
                { last_read_at },
                { upsert: true },
            );
            res.json({ last_read_at });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        });
    });

    app.use((err, _req, res, _next) => {
        logger.error({ err }, 'Erreur non gérée');
        res.status(err.status || 500).json({
            error: err.message || 'Erreur interne du serveur',
        });
    });

    return app;
}

module.exports = { createApp, corsOriginValidator };
