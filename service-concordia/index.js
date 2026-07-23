require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const redis = require('redis');
const logger = require('./logger');
const Notification = require('./models/Notification');
const publisher = require('./redis-publisher');
const { createApp, corsOriginValidator } = require('./app');

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOriginValidator,
        credentials: true,
    },
});

// ── MongoDB ──────────────────────────────────────────────────
mongoose
    .connect(process.env.MONGO_URL || 'mongodb://localhost:27017/concordia_db')
    .then(() => logger.info('Concordia connecté à MongoDB'))
    .catch((err) => logger.error({ err }, 'Erreur MongoDB'));

// ── Redis Subscriber ─────────────────────────────────────────
const subscriber = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
});

subscriber.on('error', (err) => logger.error({ err }, 'Erreur Redis'));

subscriber.connect().then(async () => {
    logger.info('Concordia écoute les événements Redis');

    await subscriber.subscribe('sodalis_events', async (message) => {
        let event;
        try {
            event = JSON.parse(message);
        } catch (err) {
            logger.error({ err }, 'Événement Redis malformé — message ignoré');
            return;
        }
        logger.info({ type: event.type, coloc_id: event.coloc_id }, 'Événement reçu');

        try {
            await Notification.create({
                coloc_id: event.coloc_id,
                type: event.type,
                message: event.message,
            });
        } catch (err) {
            logger.error({ err }, 'Erreur persistence notification');
        }

        if (event.type === 'NEW_TASK' || event.type === 'TASK_UPDATED') {
            io.emit(`coloc_${event.coloc_id}_notifications`, {
                type: event.type,
                message: event.message,
                ...(event.task_id && { task_id: event.task_id }),
                ...(event.status && { status: event.status }),
            });
        }

        const MAINTENANCE_EVENTS = [
            'NEW_MAINTENANCE_TICKET',
            'MAINTENANCE_TICKET_UPDATED',
            'MAINTENANCE_TICKET_ASSIGNED',
        ];
        if (MAINTENANCE_EVENTS.includes(event.type)) {
            io.emit(`coloc_${event.coloc_id}_notifications`, {
                type: event.type,
                message: event.message,
                ...(event.ticket_id && { ticket_id: event.ticket_id }),
                ...(event.priority && { priority: event.priority }),
                ...(event.status && { status: event.status }),
                ...(event.assigned_to && { assigned_to: event.assigned_to }),
            });
        }

        if (['NEW_COMPLAINT', 'COMPLAINT_RESOLVED', 'COMPLAINT_DELETED'].includes(event.type)) {
            io.emit(`coloc_${event.coloc_id}_notifications`, {
                type: event.type,
                message: event.message,
                ...(event.complaint_id && { complaint_id: event.complaint_id }),
            });
        }

        if (event.type === 'COMPLAINT_TARGETED') {
            io.emit(`user_${event.target_id}_notifications`, {
                type: event.type,
                message: event.message,
                ...(event.complaint_id && { complaint_id: event.complaint_id }),
            });
        }

        if (['NEW_POLL', 'POLL_UPDATED'].includes(event.type)) {
            io.emit(`coloc_${event.coloc_id}_notifications`, {
                type: event.type,
                message: event.message,
                ...(event.poll_id && { poll_id: event.poll_id }),
                ...(event.question && { question: event.question }),
            });
        }

        if (event.type === 'KARMA_UPDATED') {
            io.emit(`coloc_${event.coloc_id}_notifications`, {
                type: event.type,
                message: event.message,
                user_id: event.user_id,
                new_score: event.new_score,
            });
        }
    });
});

// ── WebSockets ───────────────────────────────────────────────
io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connecté');
    socket.on('disconnect', () => logger.info({ socketId: socket.id }, 'Client déconnecté'));
});

// ── Démarrage ────────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
server.listen(PORT, () => logger.info(`Service Concordia démarré → http://localhost:${PORT}`));

async function shutdown(signal) {
    logger.info({ signal }, 'Arrêt en cours...');
    io.close();
    await new Promise((resolve) => server.close(resolve));
    await publisher.quit();
    await subscriber.quit();
    await mongoose.connection.close();
    logger.info('Shutdown complet');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
