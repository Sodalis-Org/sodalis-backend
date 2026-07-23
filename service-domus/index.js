require('dotenv').config();

const logger = require('./logger');
const pool = require('./db');
const startGrpcServer = require('./grpc-server');
const publisher = require('./redis-publisher');
const subscriber = require('./redis-subscriber');
const createApp = require('./app');

async function main() {
    await startGrpcServer();

    const app = createApp();
    const PORT = process.env.PORT || 3001;
    const server = app.listen(PORT, () => {
        logger.info(`Service Domus démarré → http://localhost:${PORT}`);
    });

    async function shutdown(signal) {
        logger.info({ signal }, 'Arrêt en cours...');
        await new Promise((resolve) => server.close(resolve));
        await pool.end();
        await publisher.quit();
        await subscriber.quit();
        logger.info('Shutdown complet');
        process.exit(0);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
    logger.error({ err }, 'Erreur fatale au démarrage');
    process.exit(1);
});
