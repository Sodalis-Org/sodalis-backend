const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockPool = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
const mockPublisher = { publish: vi.fn(), del: vi.fn(), get: vi.fn(), connect: vi.fn(), quit: vi.fn() };
const mockGrpcClient = { verifyUser: vi.fn() };
mockRequire(require, '../db', mockPool);
mockRequire(require, '../redis-publisher', mockPublisher);
mockRequire(require, '../grpc-client', mockGrpcClient);

const createApp = require('../app');

const COLOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSIGNEE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function tokenFor(overrides = {}) {
    return jwt.sign(
        { id: 'user-1', email: 'a@test.com', coloc_id: COLOC_ID, role: 'MEMBER', ...overrides },
        process.env.JWT_SECRET,
    );
}

describe('tasks routes', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
        mockPublisher.publish.mockResolvedValue(1);
        mockPublisher.del.mockResolvedValue(1);
    });

    it('POST /tasks renvoie 401 sans token', async () => {
        const res = await request(app).post('/tasks').send({});
        expect(res.status).toBe(401);
    });

    it('POST /tasks renvoie 400 pour un payload invalide', async () => {
        const res = await request(app)
            .post('/tasks')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ title: '', assignee_id: 'not-a-uuid', coloc_id: COLOC_ID });

        expect(res.status).toBe(400);
    });

    it("POST /tasks renvoie 403 si l'assignee n'appartient pas à la coloc (gRPC)", async () => {
        mockGrpcClient.verifyUser.mockResolvedValueOnce({
            is_valid: false,
            message: 'Utilisateur hors coloc',
        });

        const res = await request(app)
            .post('/tasks')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ title: 'Vaisselle', assignee_id: ASSIGNEE_ID, coloc_id: COLOC_ID });

        expect(res.status).toBe(403);
    });

    it('POST /tasks crée une tâche', async () => {
        mockGrpcClient.verifyUser.mockResolvedValueOnce({ is_valid: true });
        mockPool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: TASK_ID,
                    title: 'Vaisselle',
                    assignee_id: ASSIGNEE_ID,
                    coloc_id: COLOC_ID,
                    status: 'TODO',
                },
            ],
        });

        const res = await request(app)
            .post('/tasks')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ title: 'Vaisselle', assignee_id: ASSIGNEE_ID, coloc_id: COLOC_ID });

        expect(res.status).toBe(201);
        expect(mockPublisher.publish).toHaveBeenCalled();
        expect(mockPublisher.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it("PATCH /tasks/:id/status renvoie 404 si la tâche n'existe pas", async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .patch(`/tasks/${TASK_ID}/status`)
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'DONE' });

        expect(res.status).toBe(404);
    });

    it('PATCH /tasks/:id/status renvoie 403 pour une autre coloc', async () => {
        mockPool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: TASK_ID,
                    coloc_id: 'other-coloc',
                    title: 'Vaisselle',
                    assignee_id: ASSIGNEE_ID,
                    status: 'TODO',
                },
            ],
        });

        const res = await request(app)
            .patch(`/tasks/${TASK_ID}/status`)
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'DONE' });

        expect(res.status).toBe(403);
    });

    it('PATCH /tasks/:id/status marque la tâche DONE à temps et publie le score', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString();
        mockPool.query
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: TASK_ID,
                        coloc_id: COLOC_ID,
                        title: 'Vaisselle',
                        assignee_id: ASSIGNEE_ID,
                        due_at: futureDate,
                        status: 'TODO',
                    },
                ],
            })
            .mockResolvedValueOnce({
                rows: [{ id: TASK_ID, coloc_id: COLOC_ID, title: 'Vaisselle', status: 'DONE' }],
            });

        const res = await request(app)
            .patch(`/tasks/${TASK_ID}/status`)
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'DONE' });

        expect(res.status).toBe(200);
        expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
        const scoreEvent = JSON.parse(mockPublisher.publish.mock.calls[1][1]);
        expect(scoreEvent).toMatchObject({
            type: 'TASK_COMPLETED_SCORE_UPDATE',
            user_id: ASSIGNEE_ID,
            coloc_id: COLOC_ID,
            is_on_time: true,
            points: 10,
        });
    });

    it('PATCH /tasks/:id/status marque la tâche DONE en retard et publie 2 points', async () => {
        const pastDate = new Date(Date.now() - 86400000).toISOString();
        mockPool.query
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: TASK_ID,
                        coloc_id: COLOC_ID,
                        title: 'Vaisselle',
                        assignee_id: ASSIGNEE_ID,
                        due_at: pastDate,
                        status: 'TODO',
                    },
                ],
            })
            .mockResolvedValueOnce({
                rows: [{ id: TASK_ID, coloc_id: COLOC_ID, title: 'Vaisselle', status: 'DONE' }],
            });

        const res = await request(app)
            .patch(`/tasks/${TASK_ID}/status`)
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'DONE' });

        expect(res.status).toBe(200);
        const scoreEvent = JSON.parse(mockPublisher.publish.mock.calls[1][1]);
        expect(scoreEvent).toMatchObject({
            type: 'TASK_COMPLETED_SCORE_UPDATE',
            is_on_time: false,
            points: 2,
        });
    });

    it('PATCH /tasks/:id/status ne republie pas de score si la tâche est déjà DONE', async () => {
        mockPool.query
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: TASK_ID,
                        coloc_id: COLOC_ID,
                        title: 'Vaisselle',
                        assignee_id: ASSIGNEE_ID,
                        due_at: null,
                        status: 'DONE',
                    },
                ],
            })
            .mockResolvedValueOnce({
                rows: [{ id: TASK_ID, coloc_id: COLOC_ID, title: 'Vaisselle', status: 'DONE' }],
            });

        const res = await request(app)
            .patch(`/tasks/${TASK_ID}/status`)
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ status: 'DONE' });

        expect(res.status).toBe(200);
        expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('GET /tasks renvoie 400 sans coloc_id', async () => {
        const res = await request(app).get('/tasks').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(400);
    });

    it('GET /tasks liste les tâches de la coloc', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ id: TASK_ID, title: 'Vaisselle' }] });

        const res = await request(app)
            .get('/tasks')
            .query({ coloc_id: COLOC_ID })
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('GET /tasks/coloc/:id renvoie une liste paginée', async () => {
        mockPool.query
            .mockResolvedValueOnce({ rows: [{ id: TASK_ID, title: 'Vaisselle' }] })
            .mockResolvedValueOnce({ rows: [{ total: '1' }] });

        const res = await request(app)
            .get(`/tasks/coloc/${COLOC_ID}`)
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.pagination.total).toBe(1);
    });

    it('GET /health renvoie ok', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
    });
});
