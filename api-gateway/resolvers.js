const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('./logger');
const cache = require('./cache');
const { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } = require('./authCookie');

if (!process.env.JWT_SECRET) throw new Error('[FATAL] JWT_SECRET non défini — démarrage refusé');
const JWT_SECRET = process.env.JWT_SECRET;

const { DOMUS_URL, LABOR_URL, CONCORDIA_URL } = process.env;
const CACHE_TTL = 30;

// Propage l'identité et l'identifiant de corrélation vers les services en aval —
// x-request-id permet de retracer une requête de bout en bout dans les logs pino.
function forwardHeaders(req) {
    return {
        Authorization: req.headers.authorization,
        'x-request-id': req.headers['x-request-id'],
    };
}

const resolvers = {
    Query: {
        // Rehydrate le contexte d'authentification côté client : le jeton vit dans un
        // cookie httpOnly (illisible en JS), seule une requête au serveur permet de
        // savoir qui est connecté après un rechargement de page.
        me: (_, __, { user }) => user || null,

        myColoc: async (_, __, { user, req }) => {
            if (!user || !user.coloc_id) {
                throw new Error('Non autorisé — Aucune colocation associée');
            }
            const colocId = user.coloc_id;
            const { data } = await axios.get(`${DOMUS_URL}/colocs/${colocId}`, {
                headers: forwardHeaders(req),
            });
            return data;
        },

        usersByColoc: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }

            const authHeader = forwardHeaders(req);
            const [usersRes, karmaRes] = await Promise.all([
                axios.get(`${DOMUS_URL}/colocs/${colocId}/users`, { headers: authHeader }),
                axios.get(`${CONCORDIA_URL}/api/karma?coloc_id=${colocId}`, {
                    headers: authHeader,
                }),
            ]);

            const karmaMap = {};
            for (const profile of karmaRes.data) karmaMap[String(profile.user_id)] = profile.score;

            return usersRes.data.map((u) => ({ ...u, karma_score: karmaMap[String(u.id)] ?? 0 }));
        },

        notifications: async (_, { colocId, page = 1, limit = 20 }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }

            const { data } = await axios.get(
                `${CONCORDIA_URL}/notifications/coloc/${colocId}?page=${page}&limit=${limit}`,
                { headers: forwardHeaders(req) },
            );
            return data;
        },

        maintenanceTickets: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }

            const { data } = await axios.get(`${DOMUS_URL}/maintenance?coloc_id=${colocId}`, {
                headers: forwardHeaders(req),
            });
            return data;
        },

        tasksByColoc: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }

            const { data } = await axios.get(`${LABOR_URL}/tasks/coloc/${colocId}`, {
                headers: forwardHeaders(req),
            });
            return data.data || data;
        },

        complaints: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }
            const { data } = await axios.get(
                `${CONCORDIA_URL}/api/complaints?coloc_id=${colocId}`,
                { headers: forwardHeaders(req) },
            );
            return data;
        },

        polls: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }
            const { data } = await axios.get(`${CONCORDIA_URL}/api/polls?coloc_id=${colocId}`, {
                headers: forwardHeaders(req),
            });
            return data;
        },

        getColocDashboard: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }

            const cacheKey = `dashboard_coloc_${colocId}`;

            const cached = await cache.get(cacheKey);
            if (cached) {
                logger.info('Dashboard depuis le cache Redis');
                return JSON.parse(cached);
            }

            logger.info('Cache miss — appel des microservices...');

            const authHeader = forwardHeaders(req);
            const [usersRes, tasksRes, complaintsRes, karmaRes] = await Promise.all([
                axios.get(`${DOMUS_URL}/colocs/${colocId}/users`, { headers: authHeader }),
                axios.get(`${LABOR_URL}/tasks/coloc/${colocId}`, { headers: authHeader }),
                axios.get(`${CONCORDIA_URL}/api/complaints?coloc_id=${colocId}&status=OPEN`, {
                    headers: authHeader,
                }),
                axios.get(`${CONCORDIA_URL}/api/karma?coloc_id=${colocId}`, {
                    headers: authHeader,
                }),
            ]);

            const karmaMap = {};
            for (const profile of karmaRes.data) karmaMap[String(profile.user_id)] = profile.score;

            const dashboard = {
                users: usersRes.data.map((u) => ({
                    ...u,
                    karma_score: karmaMap[String(u.id)] ?? 0,
                })),
                tasks: tasksRes.data.data || tasksRes.data,
                open_complaints: complaintsRes.data.length,
            };

            await cache.setEx(cacheKey, CACHE_TTL, JSON.stringify(dashboard));

            return dashboard;
        },
    },

    Mutation: {
        register: async (_, { name, email, password }) => {
            const { data } = await axios.post(`${DOMUS_URL}/auth/register`, {
                name,
                email,
                password,
            });
            return data;
        },

        login: async (_, { email, password }, { res }) => {
            const { data } = await axios.post(`${DOMUS_URL}/auth/login`, { email, password });
            res.cookie(AUTH_COOKIE_NAME, data.token, AUTH_COOKIE_OPTIONS);
            return { user: data.user };
        },

        logout: async (_, __, { req, res }) => {
            const token = req.cookies?.[AUTH_COOKIE_NAME];

            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
                    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
                    if (decoded.jti && ttl > 0) {
                        await cache.setEx(`revoked_jwt:${decoded.jti}`, ttl, '1');
                    }
                } catch {
                    // Jeton déjà invalide/expiré — rien à révoquer.
                }
            }

            res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
            return true;
        },

        createColoc: async (_, { name }, { req, res }) => {
            const { data } = await axios.post(
                `${DOMUS_URL}/colocs`,
                { name },
                { headers: forwardHeaders(req) },
            );
            res.cookie(AUTH_COOKIE_NAME, data.token, AUTH_COOKIE_OPTIONS);
            return { coloc: data.coloc };
        },

        joinColoc: async (_, { invite_code }, { user, req, res }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${DOMUS_URL}/colocs/join`,
                { invite_code },
                { headers: forwardHeaders(req) },
            );
            res.cookie(AUTH_COOKIE_NAME, data.token, AUTH_COOKIE_OPTIONS);
            return { coloc: data.coloc };
        },

        createTask: async (_, { title, assignee_id, coloc_id, due_at }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== coloc_id)) {
                throw new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
            }
            const { data } = await axios.post(
                `${LABOR_URL}/tasks`,
                { title, assignee_id, coloc_id, due_at },
                { headers: forwardHeaders(req) },
            );
            return data;
        },

        updateTaskStatus: async (_, { id, status }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.patch(
                `${LABOR_URL}/tasks/${id}/status`,
                { status },
                { headers: forwardHeaders(req) },
            );
            return data;
        },

        createMaintenanceTicket: async (
            _,
            { title, description, category, priority, coloc_id },
            { user, req },
        ) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${DOMUS_URL}/maintenance`,
                { title, description, category, priority, coloc_id },
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${coloc_id}`);
            return data;
        },

        updateTicketStatus: async (_, { id, status }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.patch(
                `${DOMUS_URL}/maintenance/${id}/status`,
                { status },
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${data.coloc_id}`);
            return data;
        },

        assignTicket: async (_, { id, assigned_to }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.patch(
                `${DOMUS_URL}/maintenance/${id}/assign`,
                { assigned_to },
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${data.coloc_id}`);
            return data;
        },

        createComplaint: async (
            _,
            { coloc_id, message, target_id, is_anonymous },
            { user, req },
        ) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${CONCORDIA_URL}/api/complaints`,
                { coloc_id, message, target_id, is_anonymous },
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${coloc_id}`);
            return data;
        },

        deleteComplaint: async (_, { id }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.delete(`${CONCORDIA_URL}/api/complaints/${id}`, {
                headers: forwardHeaders(req),
            });
            if (data.coloc_id) await cache.del(`dashboard_coloc_${data.coloc_id}`);
            return true;
        },

        resolveComplaint: async (_, { id }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.patch(
                `${CONCORDIA_URL}/api/complaints/${id}/resolve`,
                {},
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${data.coloc_id}`);
            return data;
        },

        createPoll: async (_, { coloc_id, question, options }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${CONCORDIA_URL}/api/polls`,
                { coloc_id, question, options },
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${coloc_id}`);
            return data;
        },

        votePoll: async (_, { poll_id, option_id }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${CONCORDIA_URL}/api/polls/${poll_id}/vote`,
                { option_id },
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${data.coloc_id}`);
            return data;
        },

        thankUser: async (_, { target_id }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${CONCORDIA_URL}/api/karma/${target_id}/thank`,
                {},
                { headers: forwardHeaders(req) },
            );
            await cache.del(`dashboard_coloc_${user.coloc_id}`);
            return data;
        },
    },
};

module.exports = resolvers;
