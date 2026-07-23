require('dotenv').config();

const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const pool = require('./db');
const tasksRouter = require('./routes/tasks');

function createApp() {
    const app = express();

    app.use(pinoHttp({ logger }));
    app.use(express.json());

    app.use('/tasks', tasksRouter);

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

        if (err.code === 14) {
            return res.status(502).json({ error: 'Service Domus injoignable (gRPC)' });
        }

        res.status(err.status ?? 500).json({
            error: err.message ?? 'Erreur interne',
        });
    });

    return app;
}

module.exports = createApp;
