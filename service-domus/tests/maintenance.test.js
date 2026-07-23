const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockPool = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
const mockPublisher = { publish: vi.fn(), del: vi.fn(), connect: vi.fn(), quit: vi.fn() };
const mockGrpc = { createTask: vi.fn() };
mockRequire(require, '../db', mockPool);
mockRequire(require, '../redis-publisher', mockPublisher);
mockRequire(require, '../redis-subscriber', {
    subscribe: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
});
mockRequire(require, '../grpc-labor-client', mockGrpc);

const createApp = require('../app');

const COLOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function tokenFor(overrides = {}) {
    return jwt.sign(
        { id: 'user-1', email: 'a@test.com', coloc_id: COLOC_ID, role: 'MEMBER', ...overrides },
        process.env.JWT_SECRET,
    );
}

describe('maintenance routes', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
        mockPublisher.publish.mockResolvedValue(1);
        mockPublisher.del.mockResolvedValue(1);
    });

    it('POST /maintenance renvoie 400 pour une catégorie invalide', async () => {
        const res = await request(app)
            .post('/maintenance')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({
                title: 'Fuite',
                category: 'NOT_A_CATEGORY',
                priority: 'LOW',
                coloc_id: COLOC_ID,
            });

        expect(res.status).toBe(400);
    });

    it('POST /maintenance crée un ticket', async () => {
        mockPool.query
            .mockResolvedValueOnce({
                rows: [{ id: 1, title: 'Fuite', coloc_id: COLOC_ID, priority: 'LOW' }],
            })
            .mockResolvedValueOnce({ rows: [{ name: 'Alice' }] });

        const res = await request(app)
            .post('/maintenance')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ title: 'Fuite', category: 'PLUMBING', priority: 'LOW', coloc_id: COLOC_ID });

        expect(res.status).toBe(201);
        expect(mockPublisher.publish).toHaveBeenCalled();
    });

    it("POST /maintenance déclenche l'escalade gRPC pour une priorité URGENT", async () => {
        mockPool.query
            .mockResolvedValueOnce({
                rows: [{ id: 2, title: 'Incendie', coloc_id: COLOC_ID, priority: 'URGENT' }],
            })
            .mockResolvedValueOnce({ rows: [{ name: 'Alice' }] });
        mockGrpc.createTask.mockResolvedValueOnce({});

        const res = await request(app)
            .post('/maintenance')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({
                title: 'Incendie',
                category: 'ELECTRICITY',
                priority: 'URGENT',
                coloc_id: COLOC_ID,
            });

        expect(res.status).toBe(201);
        expect(mockGrpc.createTask).toHaveBeenCalled();
    });

    it('GET /maintenance renvoie 403 pour une autre coloc', async () => {
        const res = await request(app)
            .get('/maintenance')
            .query({ coloc_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
    });

    it('GET /maintenance liste les tickets de la coloc', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Fuite' }] });

        const res = await request(app)
            .get('/maintenance')
            .query({ coloc_id: COLOC_ID })
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it("PATCH /maintenance/:id/status renvoie 404 si le ticket n'existe pas", async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .patch('/maintenance/1/status')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'RESOLVED' });

        expect(res.status).toBe(404);
    });

    it('PATCH /maintenance/:id/status met à jour le ticket', async () => {
        mockPool.query
            .mockResolvedValueOnce({
                rows: [{ id: 1, coloc_id: COLOC_ID, title: 'Fuite', status: 'IN_PROGRESS' }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: 1, coloc_id: COLOC_ID, title: 'Fuite', status: 'RESOLVED' }],
            });

        const res = await request(app)
            .patch('/maintenance/1/status')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'RESOLVED' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('RESOLVED');
    });

    it('PATCH /maintenance/:id/status renvoie 409 pour une transition de statut invalide', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: 1, coloc_id: COLOC_ID, title: 'Fuite', status: 'RESOLVED' }],
        });

        const res = await request(app)
            .patch('/maintenance/1/status')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'OPEN' });

        expect(res.status).toBe(409);
    });

    it('PATCH /maintenance/:id/status renvoie 403 si le ticket appartient à une autre coloc', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: 1, coloc_id: 'other-coloc', title: 'Fuite', status: 'OPEN' }],
        });

        const res = await request(app)
            .patch('/maintenance/1/status')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'IN_PROGRESS' });

        expect(res.status).toBe(403);
    });

    it("POST /maintenance crée quand même le ticket si l'escalade gRPC échoue", async () => {
        mockPool.query
            .mockResolvedValueOnce({
                rows: [{ id: 3, title: 'Incendie', coloc_id: COLOC_ID, priority: 'URGENT' }],
            })
            .mockResolvedValueOnce({ rows: [{ name: 'Alice' }] });
        mockGrpc.createTask.mockRejectedValueOnce(new Error('gRPC indisponible'));

        const res = await request(app)
            .post('/maintenance')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({
                title: 'Incendie',
                category: 'ELECTRICITY',
                priority: 'URGENT',
                coloc_id: COLOC_ID,
            });

        expect(res.status).toBe(201);
        expect(mockPublisher.publish).toHaveBeenCalled();
    });

    it('PATCH /maintenance/:id/assign renvoie 403 pour un non-ADMIN', async () => {
        const res = await request(app)
            .patch('/maintenance/1/assign')
            .set('Authorization', `Bearer ${tokenFor({ role: 'MEMBER' })}`)
            .send({ assigned_to: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });

        expect(res.status).toBe(403);
    });

    it('PATCH /maintenance/:id/assign renvoie 403 si le ticket appartient à une autre coloc', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [{ id: 1, coloc_id: 'other-coloc', title: 'Fuite' }],
        });

        const res = await request(app)
            .patch('/maintenance/1/assign')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`)
            .send({ assigned_to: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });

        expect(res.status).toBe(403);
    });

    it("PATCH /maintenance/:id/assign renvoie 400 si l'assigné n'appartient pas à la coloc", async () => {
        mockPool.query
            .mockResolvedValueOnce({ rows: [{ id: 1, coloc_id: COLOC_ID, title: 'Fuite' }] })
            .mockResolvedValueOnce({ rowCount: 0 });

        const res = await request(app)
            .patch('/maintenance/1/assign')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`)
            .send({ assigned_to: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });

        expect(res.status).toBe(400);
    });

    it('PATCH /maintenance/:id/assign assigne le ticket pour un ADMIN', async () => {
        const assignee = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        mockPool.query
            .mockResolvedValueOnce({ rows: [{ id: 1, coloc_id: COLOC_ID, title: 'Fuite' }] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({
                rows: [{ id: 1, coloc_id: COLOC_ID, title: 'Fuite', assigned_to: assignee }],
            });

        const res = await request(app)
            .patch('/maintenance/1/assign')
            .set('Authorization', `Bearer ${tokenFor({ role: 'ADMIN' })}`)
            .send({ assigned_to: assignee });

        expect(res.status).toBe(200);
        expect(res.body.assigned_to).toBe(assignee);
    });
});
