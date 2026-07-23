require('dotenv').config();

const logger = require('./logger');
const cache = require('./cache');
const createApp = require('./app');

async function start() {
    const { app, apolloServer } = await createApp();

    const PORT = process.env.PORT || 4000;
    const httpServer = app.listen(PORT, () =>
        logger.info(`API Gateway démarrée → http://localhost:${PORT}/graphql`),
    );

    async function shutdown(signal) {
        logger.info({ signal }, 'Arrêt en cours...');
        await apolloServer.stop();
        await new Promise((resolve) => httpServer.close(resolve));
        await cache.quit();
        logger.info('Shutdown complet');
        process.exit(0);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
