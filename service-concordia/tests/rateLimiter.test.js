const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockKarmaProfile = { find: vi.fn(), findOneAndUpdate: vi.fn() };
const mockPublisher = { publish: vi.fn(), del: vi.fn(), get: vi.fn(), connect: vi.fn(), quit: vi.fn() };
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

function tokenFor(overrides = {}) {
    return jwt.sign(
        { id: 'user-1', email: 'a@test.com', coloc_id: COLOC_ID, role: 'ADMIN', ...overrides },
        process.env.JWT_SECRET,
    );
}

describe('rate limiting service-concordia', () => {
    it('renvoie 429 après dépassement de la limite globale sur /api', async () => {
        const app = createApp();
        mockKarmaProfile.find.mockResolvedValue([]);

        let lastStatus;
        for (let i = 0; i < 105; i++) {
            const res = await request(app)
                .get('/api/karma')
                .query({ coloc_id: COLOC_ID })
                .set('Authorization', `Bearer ${tokenFor()}`);
            lastStatus = res.status;
        }

        expect(lastStatus).toBe(429);
    });

    it('/health échappe à la limite globale', async () => {
        const app = createApp();
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
    });
});
