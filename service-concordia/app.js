require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');
const logger = require('./logger');
const Notification = require('./models/Notification');
const auth = require('./middleware/auth');
const socialRoutes = require('./routes/social');
const karmaRoutes = require('./routes/karma');

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
    const app = express();
    app.use(
        cors({
            origin: corsOriginValidator,
            credentials: true,
            optionsSuccessStatus: 204,
        }),
    );
    app.use(pinoHttp({ logger }));
    app.use(express.json());

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
            res.json({ data: notifications, pagination: { page, limit, total } });
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
