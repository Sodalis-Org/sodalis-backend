const request = require('supertest');
const mockRequire = require('./helpers/mockRequire');

const mockPool = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
mockRequire(require, '../db', mockPool);
mockRequire(require, '../redis-publisher', {
    publish: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
});
mockRequire(require, '../redis-subscriber', {
    subscribe: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
});
mockRequire(require, '../grpc-labor-client', { createTask: vi.fn() });

const createApp = require('../app');

describe('helmet', () => {
    it('applique les en-têtes de sécurité HTTP par défaut', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        const app = createApp();
        const res = await request(app).get('/health');

        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });
});
