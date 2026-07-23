const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockComplaint = { create: vi.fn(), findById: vi.fn(), find: vi.fn() };
const mockPoll = { create: vi.fn(), findById: vi.fn(), find: vi.fn() };
const mockKarmaProfile = { find: vi.fn(), findOneAndUpdate: vi.fn() };
const mockNotification = { find: vi.fn(), countDocuments: vi.fn(), create: vi.fn() };
const mockPublisher = { publish: vi.fn(), del: vi.fn(), connect: vi.fn(), quit: vi.fn() };
mockRequire(require, '../models/Complaint', mockComplaint);
mockRequire(require, '../models/Poll', mockPoll);
mockRequire(require, '../models/KarmaProfile', mockKarmaProfile);
mockRequire(require, '../models/Notification', mockNotification);
mockRequire(require, '../redis-publisher', mockPublisher);

const { createApp } = require('../app');

const COLOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function tokenFor(overrides = {}) {
    return jwt.sign(
        { id: 'user-1', email: 'a@test.com', coloc_id: COLOC_ID, role: 'MEMBER', ...overrides },
        process.env.JWT_SECRET,
    );
}

describe('social routes — complaints', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
        mockPublisher.publish.mockResolvedValue(1);
    });

    it('POST /api/complaints renvoie 403 pour une autre coloc', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ coloc_id: 'other-coloc', message: 'Trop de bruit' });

        expect(res.status).toBe(403);
    });

    it('POST /api/complaints crée une plainte', async () => {
        mockComplaint.create.mockResolvedValueOnce({
            _id: 'c1',
            coloc_id: COLOC_ID,
            creator_id: 'user-1',
            message: 'Trop de bruit',
            is_anonymous: false,
            toObject() {
                return { ...this };
            },
        });

        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ coloc_id: COLOC_ID, message: 'Trop de bruit' });

        expect(res.status).toBe(201);
        expect(mockPublisher.publish).toHaveBeenCalled();
    });

    it('PATCH /api/complaints/:id/resolve renvoie 404 si introuvable', async () => {
        mockComplaint.findById.mockResolvedValueOnce(null);

        const res = await request(app)
            .patch('/api/complaints/c1/resolve')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(404);
    });

    it('PATCH /api/complaints/:id/resolve résout la plainte pour son créateur', async () => {
        mockComplaint.findById.mockResolvedValueOnce({
            _id: 'c1',
            coloc_id: COLOC_ID,
            creator_id: 'user-1',
            status: 'OPEN',
            save: vi.fn(function save() {
                return Promise.resolve(this);
            }),
            toObject() {
                return { _id: this._id, coloc_id: this.coloc_id, status: this.status };
            },
        });
        mockKarmaProfile.findOneAndUpdate.mockResolvedValueOnce({
            user_id: 'user-1',
            coloc_id: COLOC_ID,
            score: 5,
        });

        const res = await request(app)
            .patch('/api/complaints/c1/resolve')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('RESOLVED');
    });

    it('DELETE /api/complaints/:id renvoie 403 pour un non-créateur non-ADMIN', async () => {
        mockComplaint.findById.mockResolvedValueOnce({
            _id: 'c1',
            coloc_id: COLOC_ID,
            creator_id: 'someone-else',
        });

        const res = await request(app)
            .delete('/api/complaints/c1')
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(403);
    });

    it('GET /api/complaints renvoie 400 sans coloc_id', async () => {
        const res = await request(app)
            .get('/api/complaints')
            .set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(400);
    });

    it('GET /api/complaints liste les plaintes de la coloc', async () => {
        mockComplaint.find.mockReturnValueOnce({
            sort: vi
                .fn()
                .mockResolvedValueOnce([
                    { toObject: () => ({ _id: 'c1', message: 'Trop de bruit' }) },
                ]),
        });

        const res = await request(app)
            .get('/api/complaints')
            .query({ coloc_id: COLOC_ID })
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });
});

describe('social routes — polls', () => {
    let app;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
        mockPublisher.publish.mockResolvedValue(1);
    });

    it('POST /api/polls renvoie 400 avec moins de 2 options', async () => {
        const res = await request(app)
            .post('/api/polls')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ coloc_id: COLOC_ID, question: 'Pizza ou sushi ?', options: ['Pizza'] });

        expect(res.status).toBe(400);
    });

    it('POST /api/polls crée un sondage', async () => {
        mockPoll.create.mockResolvedValueOnce({
            _id: 'p1',
            coloc_id: COLOC_ID,
            question: 'Pizza ou sushi ?',
            options: [],
            toObject() {
                return { _id: this._id, question: this.question, options: this.options };
            },
        });

        const res = await request(app)
            .post('/api/polls')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({
                coloc_id: COLOC_ID,
                question: 'Pizza ou sushi ?',
                options: ['Pizza', 'Sushi'],
            });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe('p1');
    });

    it('POST /api/polls/:id/vote enregistre un vote', async () => {
        const options = [
            { option_id: 'opt-1', text: 'Pizza', voters: [] },
            { option_id: 'opt-2', text: 'Sushi', voters: [] },
        ];
        mockPoll.findById.mockResolvedValueOnce({
            _id: 'p1',
            coloc_id: COLOC_ID,
            question: 'Pizza ou sushi ?',
            status: 'OPEN',
            options,
            save: vi.fn(function save() {
                return Promise.resolve(this);
            }),
            toObject() {
                return { _id: this._id, question: this.question, options: this.options };
            },
        });
        mockKarmaProfile.findOneAndUpdate.mockResolvedValueOnce({
            user_id: 'user-1',
            coloc_id: COLOC_ID,
            score: 2,
        });

        const res = await request(app)
            .post('/api/polls/p1/vote')
            .set('Authorization', `Bearer ${tokenFor()}`)
            .send({ option_id: 'opt-1' });

        expect(res.status).toBe(200);
        expect(res.body.options[0].voters).toContain('user-1');
    });

    it('GET /api/polls liste les sondages de la coloc', async () => {
        mockPoll.find.mockReturnValueOnce({
            sort: vi
                .fn()
                .mockResolvedValueOnce([
                    { toObject: () => ({ _id: 'p1', question: 'Pizza ou sushi ?', options: [] }) },
                ]),
        });

        const res = await request(app)
            .get('/api/polls')
            .query({ coloc_id: COLOC_ID })
            .set('Authorization', `Bearer ${tokenFor()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });
});
