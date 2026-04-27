const axios = require('axios');
const logger = require('./logger');
const cache = require('./cache');

const { DOMUS_URL, LABOR_URL, CONCORDIA_URL } = process.env;
const CACHE_TTL = 30;

const resolvers = {
    Query: {
        usersByColoc: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error('Non autorisé — Vous n\'appartenez pas à cette colocation');
            }

            const { data } = await axios.get(`${DOMUS_URL}/colocs/${colocId}/users`, {
                headers: { Authorization: req.headers.authorization },
            });
            return data;
        },

        notifications: async (_, { colocId, page = 1, limit = 20 }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error('Non autorisé — Vous n\'appartenez pas à cette colocation');
            }

            const { data } = await axios.get(
                `${CONCORDIA_URL}/notifications/coloc/${colocId}?page=${page}&limit=${limit}`,
                { headers: { Authorization: req.headers.authorization } },
            );
            return data;
        },

        maintenanceTickets: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error('Non autorisé — Vous n\'appartenez pas à cette colocation');
            }

            const { data } = await axios.get(`${DOMUS_URL}/maintenance?coloc_id=${colocId}`, {
                headers: { Authorization: req.headers.authorization },
            });
            return data;
        },

        tasksByColoc: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error('Non autorisé — Vous n\'appartenez pas à cette colocation');
            }

            const { data } = await axios.get(`${LABOR_URL}/tasks/coloc/${colocId}`, {
                headers: { Authorization: req.headers.authorization },
            });
            return data.data || data;
        },

        getColocDashboard: async (_, { colocId }, { user, req }) => {
            if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) {
                throw new Error('Non autorisé — Vous n\'appartenez pas à cette colocation');
            }

            const cacheKey = `dashboard_coloc_${colocId}`;

            const cached = await cache.get(cacheKey);
            if (cached) {
                logger.info('Dashboard depuis le cache Redis');
                return JSON.parse(cached);
            }

            logger.info('Cache miss — appel des microservices...');

            const [usersRes, tasksRes] = await Promise.all([
                axios.get(`${DOMUS_URL}/colocs/${colocId}/users`, {
                    headers: { Authorization: req.headers.authorization },
                }),
                axios.get(`${LABOR_URL}/tasks/coloc/${colocId}`, {
                    headers: { Authorization: req.headers.authorization },
                }),
            ]);

            const dashboard = {
                users: usersRes.data,
                tasks: tasksRes.data.data || tasksRes.data,
            };

            await cache.setEx(cacheKey, CACHE_TTL, JSON.stringify(dashboard));

            return dashboard;
        },
    },

    Mutation: {
        register: async (_, { name, email, password }) => {
            const { data } = await axios.post(`${DOMUS_URL}/auth/register`, { name, email, password });
            return data;
        },

        login: async (_, { email, password }) => {
            const { data } = await axios.post(`${DOMUS_URL}/auth/login`, { email, password });
            return data;
        },

        createColoc: async (_, { name }, { req }) => {
            const { data } = await axios.post(
                `${DOMUS_URL}/colocs`,
                { name },
                { headers: { Authorization: req.headers.authorization } },
            );
            return data;
        },

        joinColoc: async (_, { invite_code }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${DOMUS_URL}/colocs/join`,
                { invite_code },
                { headers: { Authorization: req.headers.authorization } },
            );
            return data;
        },

        createTask: async (_, { title, assignee_id, coloc_id }, { req }) => {
            const { data } = await axios.post(
                `${LABOR_URL}/tasks`,
                { title, assignee_id, coloc_id },
                { headers: { Authorization: req.headers.authorization } },
            );
            return data;
        },

        updateTaskStatus: async (_, { id, status }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.patch(
                `${LABOR_URL}/tasks/${id}/status`,
                { status },
                { headers: { Authorization: req.headers.authorization } },
            );
            return data;
        },

        createMaintenanceTicket: async (_, { title, description, category, priority, coloc_id }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.post(
                `${DOMUS_URL}/maintenance`,
                { title, description, category, priority, coloc_id },
                { headers: { Authorization: req.headers.authorization } },
            );
            await cache.del(`dashboard_coloc_${coloc_id}`);
            return data;
        },

        updateTicketStatus: async (_, { id, status }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.patch(
                `${DOMUS_URL}/maintenance/${id}/status`,
                { status },
                { headers: { Authorization: req.headers.authorization } },
            );
            await cache.del(`dashboard_coloc_${data.coloc_id}`);
            return data;
        },

        assignTicket: async (_, { id, assigned_to }, { user, req }) => {
            if (!user) throw new Error('Non autorisé');
            const { data } = await axios.patch(
                `${DOMUS_URL}/maintenance/${id}/assign`,
                { assigned_to },
                { headers: { Authorization: req.headers.authorization } },
            );
            await cache.del(`dashboard_coloc_${data.coloc_id}`);
            return data;
        },
    },
};

module.exports = resolvers;
