const request = require('supertest');
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

describe('auth routes', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
    });

    it('POST /auth/register crée un utilisateur', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'MEMBER' }],
        });

        const res = await request(app).post('/auth/register').send({
            name: 'Alice',
            email: 'alice@test.com',
            password: 'password123',
        });

        expect(res.status).toBe(201);
        expect(res.body.email).toBe('alice@test.com');
    });

    it('POST /auth/register renvoie 400 si le payload est invalide', async () => {
        const res = await request(app).post('/auth/register').send({
            name: '',
            email: 'not-an-email',
            password: '123',
        });

        expect(res.status).toBe(400);
    });

    it("POST /auth/register renvoie 409 si l'email existe déjà", async () => {
        const err = new Error('duplicate');
        err.code = '23505';
        mockPool.query.mockRejectedValueOnce(err);

        const res = await request(app).post('/auth/register').send({
            name: 'Alice',
            email: 'alice@test.com',
            password: 'password123',
        });

        expect(res.status).toBe(409);
    });

    it('POST /auth/login renvoie un token pour des identifiants valides', async () => {
        const bcrypt = require('bcrypt');
        const hashed = await bcrypt.hash('password123', 10);
        mockPool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 'u1',
                    name: 'Alice',
                    email: 'alice@test.com',
                    role: 'MEMBER',
                    coloc_id: null,
                    password: hashed,
                },
            ],
        });

        const res = await request(app).post('/auth/login').send({
            email: 'alice@test.com',
            password: 'password123',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('POST /auth/login renvoie 401 pour un mauvais mot de passe', async () => {
        const bcrypt = require('bcrypt');
        const hashed = await bcrypt.hash('password123', 10);
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: 'u1', email: 'alice@test.com', password: hashed }],
        });

        const res = await request(app).post('/auth/login').send({
            email: 'alice@test.com',
            password: 'wrong-password',
        });

        expect(res.status).toBe(401);
    });

    it("POST /auth/login renvoie 401 si l'utilisateur n'existe pas", async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).post('/auth/login').send({
            email: 'ghost@test.com',
            password: 'password123',
        });

        expect(res.status).toBe(401);
    });

    it('GET /health renvoie ok quand la base répond', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('GET /health renvoie 503 quand la base est injoignable', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('down'));
        const res = await request(app).get('/health');
        expect(res.status).toBe(503);
    });
});
