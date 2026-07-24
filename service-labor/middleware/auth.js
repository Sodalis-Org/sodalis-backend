const jwt = require('jsonwebtoken');
const logger = require('../logger');
const redisClient = require('../redis-publisher');

if (!process.env.JWT_SECRET) throw new Error('[FATAL] JWT_SECRET non défini — démarrage refusé');
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn({ path: req.path }, 'Échec authentification — token manquant');
        return res.status(401).json({ error: 'Accès non autorisé — Token manquant' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

        if (decoded.jti) {
            const revoked = await redisClient.get(`revoked_jwt:${decoded.jti}`);
            if (revoked) {
                logger.warn({ userId: decoded.id }, 'Échec authentification — token révoqué');
                return res.status(401).json({ error: 'Token invalide ou expiré' });
            }
        }

        req.user = decoded; // { id, email, coloc_id, role, jti }
        next();
    } catch {
        logger.warn({ path: req.path }, 'Échec authentification — token invalide');
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
};
