const redis = require('redis');
const logger = require('./logger');

const publisher = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
});

publisher.on('error', (err) => logger.error({ err }, 'Erreur Redis publisher'));
publisher.connect().then(() => logger.info('Concordia connecté à Redis (Publisher)'));

module.exports = publisher;
