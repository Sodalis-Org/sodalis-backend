const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockNotification = { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn() };
const mockPublisher = { publish: vi.fn(), del: vi.fn(), get: vi.fn(), connect: vi.fn(), quit: vi.fn() };
mockRequire(require, '../models/Notification', mockNotification);
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

describe('GET /health', () => {
    it('renvoie le statut mongo', async () => {
        const { createApp: create } = require('../app');
        const app = create();
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});
