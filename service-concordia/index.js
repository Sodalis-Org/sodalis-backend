require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const redis = require('redis');
const logger = require('./logger');
const Notification = require('./models/Notification');
const publisher = require('./redis-publisher');
const { createApp, corsOriginValidator } = require('./app');
const { routeEvent } = require('./services/eventRouter');
const { authenticateSocket } = require('./socketAuth');

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOriginValidator,
        credentials: true,
    },
});

io.use(authenticateSocket);

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

        await routeEvent(event, { Notification, io, logger });
    });
});

// ── WebSockets ───────────────────────────────────────────────
// La room jointe dépend uniquement de l'identité vérifiée par authenticateSocket
// (socket.user), jamais d'une valeur envoyée par le client au moment de la connexion.
io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.user.id }, 'Client connecté');

    if (socket.user.coloc_id) socket.join(`coloc_${socket.user.coloc_id}`);
    socket.join(`user_${socket.user.id}`);

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
