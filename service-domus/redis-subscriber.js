const redis = require('redis');
const logger = require('./logger');
const pool = require('./db');

const subscriber = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
});

subscriber.on('error', (err) => logger.error({ err }, 'Erreur Redis (subscriber)'));

subscriber.connect().then(async () => {
    logger.info('Domus écoute les événements Redis');

    await subscriber.subscribe('sodalis_events', async (message) => {
        let event;
        try {
            event = JSON.parse(message);
        } catch (err) {
            logger.error({ err }, 'Événement Redis malformé');
            return;
        }

        if (event.type !== 'TASK_COMPLETED_SCORE_UPDATE') return;

        try {
            await pool.query(
                'UPDATE users SET harmony_score = harmony_score + $1 WHERE id = $2',
                [event.points, event.user_id],
            );
            logger.info(
                { user_id: event.user_id, points: event.points, is_on_time: event.is_on_time },
                'Harmony score mis à jour',
            );
        } catch (err) {
            logger.error({ err, event }, 'Erreur mise à jour harmony_score');
        }
    });
}).catch((err) => logger.error({ err }, 'Impossible de connecter le subscriber Redis'));

module.exports = subscriber;
