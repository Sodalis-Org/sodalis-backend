require('dotenv').config();

const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const pool = require('./db');
const colocsRouter = require('./routes/colocs');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const maintenanceRouter = require('./routes/maintenance');

function createApp() {
    const app = express();

    app.use(pinoHttp({ logger }));
    app.use(express.json());

    app.use('/auth', authRouter);
    app.use('/colocs', colocsRouter);
    app.use('/users', usersRouter);
    app.use('/maintenance', maintenanceRouter);

    app.get('/health', async (_req, res) => {
        try {
            await pool.query('SELECT 1');
            res.json({ status: 'ok' });
        } catch {
            res.status(503).json({ status: 'db_unreachable' });
        }
    });

    app.use((err, _req, res, _next) => {
        logger.error(err);

        if (err.code === '23505') {
            return res.status(409).json({ error: 'Doublon — cette ressource existe déjà' });
        }

        res.status(err.status ?? 500).json({
            error: err.message ?? 'Erreur interne',
        });
    });

    return app;
}

module.exports = createApp;
