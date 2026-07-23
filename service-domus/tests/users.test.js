const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockPool = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
mockRequire(require, '../db', mockPool);
mockRequire(require, '../redis-publisher', {
    publish: vi.fn(),
    del: vi.fn(),
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

function tokenFor(role) {
    return jwt.sign(
        { id: 'admin-1', email: 'admin@test.com', coloc_id: 'coloc-1', role },
        process.env.JWT_SECRET,
    );
}

describe('users routes', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
    });

    it('POST /users renvoie 403 pour un non-ADMIN', async () => {
        const res = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${tokenFor('MEMBER')}`)
            .send({ name: 'Bob', email: 'bob@test.com' });

        expect(res.status).toBe(403);
    });

    it('POST /users renvoie 400 si name/email manquants', async () => {
        const res = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
            .send({ email: 'bob@test.com' });

        expect(res.status).toBe(400);
    });

    it('POST /users crée un utilisateur pour un ADMIN', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 'u2',
                    name: 'Bob',
                    email: 'bob@test.com',
                    coloc_id: 'coloc-1',
                    role: 'MEMBER',
                },
            ],
        });

        const res = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
            .send({ name: 'Bob', email: 'bob@test.com', coloc_id: 'coloc-1' });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Bob');
    });

    it('POST /users renvoie 500 si la base échoue', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('db error'));

        const res = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
            .send({ name: 'Bob', email: 'bob@test.com' });

        expect(res.status).toBe(500);
    });
});
