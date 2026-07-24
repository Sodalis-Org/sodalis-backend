const request = require('supertest');
const mockRequire = require('./helpers/mockRequire');

const mockPublisher = { publish: vi.fn(), del: vi.fn(), get: vi.fn(), connect: vi.fn(), quit: vi.fn() };
mockRequire(require, '../models/Complaint', { create: vi.fn(), findById: vi.fn(), find: vi.fn() });
mockRequire(require, '../models/Poll', { create: vi.fn(), findById: vi.fn(), find: vi.fn() });
mockRequire(require, '../models/KarmaProfile', { find: vi.fn(), findOneAndUpdate: vi.fn() });
mockRequire(require, '../models/Notification', { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn() });
mockRequire(require, '../redis-publisher', mockPublisher);

const { createApp } = require('../app');

describe('helmet', () => {
    it('applique les en-têtes de sécurité HTTP par défaut', async () => {
        const app = createApp();
        const res = await request(app).get('/health');

        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });
});
