const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockClient = { query: vi.fn(), release: vi.fn() };
const mockPool = {
    query: vi.fn(),
    connect: vi.fn(() => Promise.resolve(mockClient)),
    end: vi.fn(),
};
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

const AUTH_COLOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function tokenFor(overrides = {}) {
    return jwt.sign(
        {
            id: 'user-1',
            email: 'a@test.com',
            coloc_id: AUTH_COLOC_ID,
            role: 'MEMBER',
            ...overrides,
        },
        process.env.JWT_SECRET,
    );
}

describe('colocs routes', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
    });

    it('POST /colocs sans token renvoie 401', async () => {
        const res = await request(app).post('/colocs').send({ name: 'Chez nous' });
        expect(res.status).toBe(401);
    });

    it('POST /colocs crée une coloc et assigne le créateur ADMIN', async () => {
        mockClient.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{ id: 'coloc-1', name: 'Chez nous', invite_code: 'chez-nous-ab12' }],
            }) // INSERT coloc
            .mockResolvedValueOnce({}) // UPDATE users
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(app)
            .post('/colocs')
            .set('Authorization', `Bearer ${tokenFor({ coloc_id: null })}`)
            .send({ name: 'Chez nous' });

        expect(res.status).toBe(201);
        expect(res.body.coloc.id).toBe('coloc-1');
        expect(res.body.token).toBeDefined();
    });

    it('POST /colocs/join rejoint une coloc via invite_code', async () => {
        mockPool.query
            .mockResolvedValueOnce({
                rows: [{ id: 'coloc-2', name: 'Autre coloc', invite_code: 'code-1234' }],
            })
            .mockResolvedValueOnce({});

        const res = await request(app)
            .post('/colocs/join')
            .set('Authorization', `Bearer ${tokenFor({ coloc_id: null })}`)
            .send({ invite_code: 'code-1234' });

        expect(res.status).toBe(200);
        expect(res.body.coloc.id).toBe('coloc-2');
    });

    it('POST /colocs/join renvoie 409 si déjà dans une coloc', async () => {
        const res = await request(app)
            .post('/colocs/join')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ invite_code: 'code-1234' });

        expect(res.status).toBe(409);
    });

    it('POST /colocs/join renvoie 404 pour un code invalide', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .post('/colocs/join')
            .set('Authorization', `Bearer ${tokenFor({ coloc_id: null })}`)
            .send({ invite_code: 'code-1234' });

        expect(res.status).toBe(404);
    });

    it("GET /colocs/:id renvoie 403 si l'utilisateur n'appartient pas à la coloc", async () => {
        const res = await request(app)
            .get('/colocs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
    });

    it('GET /colocs/:id renvoie 404 pour un id non-UUID', async () => {
        const res = await request(app)
            .get('/colocs/not-a-uuid')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(404);
    });

    it('GET /colocs/:id renvoie la coloc pour un membre', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: AUTH_COLOC_ID, name: 'Chez nous', invite_code: 'chez-nous-ab12' }],
        });

        const res = await request(app)
            .get(`/colocs/${AUTH_COLOC_ID}`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(AUTH_COLOC_ID);
    });

    it('GET /colocs/:id/users liste les membres', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: 'user-1', name: 'Alice', email: 'a@test.com', role: 'MEMBER' }],
        });

        const res = await request(app)
            .get(`/colocs/${AUTH_COLOC_ID}/users`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it("GET /colocs/:id/users renvoie 403 pour un membre d'une autre colocation", async () => {
        const res = await request(app)
            .get(`/colocs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/users`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
        expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('GET /colocs/:id/users autorise un ADMIN pour une autre colocation', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .get(`/colocs/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/users`)
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`);

        expect(res.status).toBe(200);
    });
});
