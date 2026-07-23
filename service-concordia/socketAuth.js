const jwt = require('jsonwebtoken');
const logger = require('./logger');
const redisClient = require('./redis-publisher');

if (!process.env.JWT_SECRET) throw new Error('[FATAL] JWT_SECRET non défini — démarrage refusé');
const JWT_SECRET = process.env.JWT_SECRET;

const AUTH_COOKIE_NAME = 'sodalis_token';

function extractCookie(cookieHeader, name) {
    if (!cookieHeader) return null;

    for (const part of cookieHeader.split(';')) {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) continue;
        const key = part.slice(0, separatorIndex).trim();
        if (key === name) return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }

    return null;
}

// Le handshake Socket.io n'envoyait auparavant aucune preuve d'identité : la room
// rejointe dépendait uniquement de ce que le client choisissait d'écouter. Ce middleware
// vérifie le cookie httpOnly avant d'accepter la connexion, pour que le serveur — jamais
// le client — décide de quelle(s) room(s) le socket peut faire partie (voir index.js).
async function authenticateSocket(socket, next) {
    const token = extractCookie(socket.handshake.headers.cookie, AUTH_COOKIE_NAME);

    if (!token) {
        logger.warn({ socketId: socket.id }, 'Connexion Socket.io refusée — cookie manquant');
        return next(new Error('Authentification requise'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

        if (decoded.jti) {
            const revoked = await redisClient.get(`revoked_jwt:${decoded.jti}`);
            if (revoked) {
                logger.warn({ socketId: socket.id }, 'Connexion Socket.io refusée — jeton révoqué');
                return next(new Error('Authentification requise'));
            }
        }

        socket.user = decoded;
        next();
    } catch {
        logger.warn({ socketId: socket.id }, 'Connexion Socket.io refusée — jeton invalide');
        next(new Error('Authentification requise'));
    }
}

module.exports = { authenticateSocket, extractCookie, AUTH_COOKIE_NAME };
