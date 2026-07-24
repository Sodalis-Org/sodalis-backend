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

    it('POST /colocs renvoie 409 si déjà dans une coloc', async () => {
        const res = await request(app)
            .post('/colocs')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ name: 'Chez nous' });

        expect(res.status).toBe(409);
        expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('POST /colocs/leave quitte la coloc et promeut un admin si besoin', async () => {
        mockClient.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({}) // UPDATE leave
            .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // no admin left
            .mockResolvedValueOnce({ rows: [{ id: 'user-2' }] }) // promote candidate
            .mockResolvedValueOnce({}) // promote UPDATE
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(app)
            .post('/colocs/leave')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`);

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('POST /colocs/regenerate-invite est réservé aux ADMINs', async () => {
        const res = await request(app)
            .post('/colocs/regenerate-invite')
            .set('Authorization', `Bearer ${tokenFor({ role: 'MEMBER' })}`);

        expect(res.status).toBe(403);
    });

    it('POST /colocs/regenerate-invite renvoie un nouveau code', async () => {
        mockPool.query
            .mockResolvedValueOnce({
                rows: [{ id: AUTH_COLOC_ID, name: 'Chez nous', invite_code: 'old-code' }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: AUTH_COLOC_ID, name: 'Chez nous', invite_code: 'chez-nous-ffff' }],
            });

        const res = await request(app)
            .post('/colocs/regenerate-invite')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`);

        expect(res.status).toBe(200);
        expect(res.body.coloc.invite_code).toBeDefined();
        expect(res.body.coloc.invite_code).not.toBe('old-code');
    });

    it('POST /colocs/members/:userId/kick expulse un membre', async () => {
        mockPool.query
            .mockResolvedValueOnce({ rows: [{ id: 'user-2', role: 'MEMBER' }] })
            .mockResolvedValueOnce({});

        const res = await request(app)
            .post('/colocs/members/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/kick')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`);

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('POST /colocs/transfer-admin transfère le rôle', async () => {
        const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        mockClient.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: targetId, role: 'MEMBER' }] })
            .mockResolvedValueOnce({}) // promote target
            .mockResolvedValueOnce({}) // demote self
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(app)
            .post('/colocs/transfer-admin')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`)
            .send({ userId: targetId });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('GET /colocs/:id masque invite_code pour un MEMBER', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: AUTH_COLOC_ID, name: 'Chez nous', invite_code: 'chez-nous-ab12' }],
        });

        const res = await request(app)
            .get(`/colocs/${AUTH_COLOC_ID}`)
            .set('Authorization', `Bearer ${tokenFor({ role: 'MEMBER' })}`);

        expect(res.status).toBe(200);
        expect(res.body.invite_code).toBeNull();
    });

    it('GET /colocs/:id expose invite_code pour un ADMIN', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: AUTH_COLOC_ID, name: 'Chez nous', invite_code: 'chez-nous-ab12' }],
        });

        const res = await request(app)
            .get(`/colocs/${AUTH_COLOC_ID}`)
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`);

        expect(res.status).toBe(200);
        expect(res.body.invite_code).toBe('chez-nous-ab12');
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
            rows: [
                {
                    id: 'user-1',
                    name: 'Alice',
                    email: 'a@test.com',
                    role: 'MEMBER',
                    coloc_id: AUTH_COLOC_ID,
                },
            ],
        });

        const res = await request(app)
            .get(`/colocs/${AUTH_COLOC_ID}/users`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].coloc_id).toBe(AUTH_COLOC_ID);
        expect(mockPool.query).toHaveBeenCalledWith(
            expect.stringContaining('coloc_id'),
            [AUTH_COLOC_ID],
        );
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
