const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockKarmaProfile = { find: vi.fn(), findOneAndUpdate: vi.fn() };
const mockPublisher = { publish: vi.fn(), del: vi.fn(), connect: vi.fn(), quit: vi.fn() };
const mockComplaint = { create: vi.fn(), findById: vi.fn(), find: vi.fn() };
const mockPoll = { create: vi.fn(), findById: vi.fn(), find: vi.fn() };
const mockNotification = { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn() };
mockRequire(require, '../models/KarmaProfile', mockKarmaProfile);
mockRequire(require, '../models/Complaint', mockComplaint);
mockRequire(require, '../models/Poll', mockPoll);
mockRequire(require, '../models/Notification', mockNotification);
mockRequire(require, '../redis-publisher', mockPublisher);

const { createApp } = require('../app');

const COLOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function tokenFor(overrides = {}) {
    return jwt.sign(
        { id: 'user-1', email: 'a@test.com', coloc_id: COLOC_ID, role: 'MEMBER', ...overrides },
        process.env.JWT_SECRET,
    );
}

describe('karma routes', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
        mockPublisher.publish.mockResolvedValue(1);
    });

    it('POST /api/karma/:target_id/thank renvoie 400 si on se remercie soi-même', async () => {
        const res = await request(app)
            .post('/api/karma/user-1/thank')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(400);
    });

    it('POST /api/karma/:target_id/thank incrémente le karma de la cible', async () => {
        mockKarmaProfile.findOneAndUpdate.mockResolvedValueOnce({
            user_id: TARGET_ID,
            coloc_id: COLOC_ID,
            score: 8,
        });

        const res = await request(app)
            .post(`/api/karma/${TARGET_ID}/thank`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.score).toBe(8);
        expect(mockPublisher.publish).toHaveBeenCalled();
    });

    it('GET /api/karma renvoie 400 sans coloc_id', async () => {
        const res = await request(app)
            .get('/api/karma')
            .set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(400);
    });

    it('GET /api/karma renvoie 403 pour une autre coloc', async () => {
        const res = await request(app)
            .get('/api/karma')
            .query({ coloc_id: 'other-coloc' })
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
    });

    it('GET /api/karma liste les profils karma de la coloc', async () => {
        mockKarmaProfile.find.mockResolvedValueOnce([{ user_id: TARGET_ID, score: 8 }]);

        const res = await request(app)
            .get('/api/karma')
            .query({ coloc_id: COLOC_ID })
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });
});
