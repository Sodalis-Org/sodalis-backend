const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockNotification = { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn() };
const mockReadState = { findOne: vi.fn(), findOneAndUpdate: vi.fn() };
const mockPublisher = { publish: vi.fn(), del: vi.fn(), get: vi.fn(), connect: vi.fn(), quit: vi.fn() };
mockRequire(require, '../models/Notification', mockNotification);
mockRequire(require, '../models/NotificationReadState', mockReadState);
mockRequire(require, '../models/Complaint', { create: vi.fn(), findById: vi.fn(), find: vi.fn() });
mockRequire(require, '../models/Poll', { create: vi.fn(), findById: vi.fn(), find: vi.fn() });
mockRequire(require, '../models/KarmaProfile', { find: vi.fn(), findOneAndUpdate: vi.fn() });
mockRequire(require, '../redis-publisher', mockPublisher);

const { createApp } = require('../app');

const COLOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function tokenFor(overrides = {}) {
    return jwt.sign(
        { id: 'user-1', email: 'a@test.com', coloc_id: COLOC_ID, role: 'MEMBER', ...overrides },
        process.env.JWT_SECRET,
    );
}

describe('GET /notifications/coloc/:id', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
    });

    it('renvoie 401 sans token', async () => {
        const res = await request(app).get(`/notifications/coloc/${COLOC_ID}`);
        expect(res.status).toBe(401);
    });

    it('renvoie 403 pour une autre coloc', async () => {
        const res = await request(app)
            .get('/notifications/coloc/other-coloc')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
    });

    it('renvoie les notifications paginées pour un membre de la coloc', async () => {
        mockNotification.find.mockReturnValueOnce({
            sort: vi.fn().mockReturnValueOnce({
                skip: vi.fn().mockReturnValueOnce({
                    limit: vi
                        .fn()
                        .mockResolvedValueOnce([{ type: 'NEW_TASK', message: 'Nouvelle tâche' }]),
                }),
            }),
        });
        mockNotification.countDocuments.mockResolvedValueOnce(1);

        const res = await request(app)
            .get(`/notifications/coloc/${COLOC_ID}`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });

    it('expose un champ id (et non _id) — requis par le schéma GraphQL Notification.id: ID!', async () => {
        mockNotification.find.mockReturnValueOnce({
            sort: vi.fn().mockReturnValueOnce({
                skip: vi.fn().mockReturnValueOnce({
                    limit: vi.fn().mockResolvedValueOnce([
                        { _id: 'mongo-id-1', type: 'NEW_TASK', message: 'Nouvelle tâche', created_at: new Date() },
                    ]),
                }),
            }),
        });
        mockNotification.countDocuments.mockResolvedValueOnce(1);

        const res = await request(app)
            .get(`/notifications/coloc/${COLOC_ID}`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].id).toBe('mongo-id-1');
        expect(res.body.data[0]._id).toBeUndefined();
        expect(res.body.pagination.total).toBe(1);
    });

    it("un ADMIN peut consulter n'importe quelle coloc", async () => {
        mockNotification.find.mockReturnValueOnce({
            sort: vi.fn().mockReturnValueOnce({
                skip: vi.fn().mockReturnValueOnce({
                    limit: vi.fn().mockResolvedValueOnce([]),
                }),
            }),
        });
        mockNotification.countDocuments.mockResolvedValueOnce(0);

        const res = await request(app)
            .get('/notifications/coloc/any-coloc')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`);

        expect(res.status).toBe(200);
    });
});

describe('GET /notifications/coloc/:id/unread-count', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
    });

    it('renvoie 403 pour une autre coloc', async () => {
        const res = await request(app)
            .get('/notifications/coloc/other-coloc/unread-count')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
    });

    it("compte les notifications postérieures au dernier curseur de lecture de l'utilisateur", async () => {
        mockReadState.findOne.mockResolvedValueOnce({ last_read_at: new Date('2026-07-24T08:00:00Z') });
        mockNotification.countDocuments.mockResolvedValueOnce(3);

        const res = await request(app)
            .get(`/notifications/coloc/${COLOC_ID}/unread-count`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.count).toBe(3);
        expect(mockNotification.countDocuments).toHaveBeenCalledWith({
            coloc_id: COLOC_ID,
            created_at: { $gt: new Date('2026-07-24T08:00:00Z') },
        });
    });

    it("retombe sur l'epoch si l'utilisateur n'a jamais rien marqué comme lu", async () => {
        mockReadState.findOne.mockResolvedValueOnce(null);
        mockNotification.countDocuments.mockResolvedValueOnce(5);

        const res = await request(app)
            .get(`/notifications/coloc/${COLOC_ID}/unread-count`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.count).toBe(5);
        expect(mockNotification.countDocuments).toHaveBeenCalledWith({
            coloc_id: COLOC_ID,
            created_at: { $gt: new Date(0) },
        });
    });
});

describe('POST /notifications/coloc/:id/read', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
    });

    it('renvoie 403 pour une autre coloc', async () => {
        const res = await request(app)
            .post('/notifications/coloc/other-coloc/read')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
    });

    it("avance le curseur de lecture de l'utilisateur à maintenant", async () => {
        mockReadState.findOneAndUpdate.mockResolvedValueOnce({});

        const res = await request(app)
            .post(`/notifications/coloc/${COLOC_ID}/read`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.last_read_at).toBeDefined();
        expect(mockReadState.findOneAndUpdate).toHaveBeenCalledWith(
            { user_id: 'user-1', coloc_id: COLOC_ID },
            { last_read_at: expect.any(Date) },
            { upsert: true },
        );
    });
});

describe('GET /health', () => {
    it('renvoie le statut mongo', async () => {
        const { createApp: create } = require('../app');
        const app = create();
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});
