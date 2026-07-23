const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockAxios = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
const mockCache = { get: vi.fn(), setEx: vi.fn(), del: vi.fn(), connect: vi.fn(), quit: vi.fn() };
mockRequire(require, 'axios', mockAxios);
mockRequire(require, '../cache', mockCache);

const createApp = require('../app');

describe('api-gateway app', () => {
    let app;

    beforeEach(async () => {
        vi.clearAllMocks();
        ({ app } = await createApp());
    });

    it('GET /health renvoie ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('POST /graphql exécute une requête authentifiée', async () => {
        mockCache.get.mockResolvedValueOnce(null);
        mockAxios.get
            .mockResolvedValueOnce({ data: [] })
            .mockResolvedValueOnce({ data: { data: [] } })
            .mockResolvedValueOnce({ data: [] })
            .mockResolvedValueOnce({ data: [] });

        const token = jwt.sign(
            { id: 'u1', coloc_id: 'coloc-1', role: 'ADMIN' },
            process.env.JWT_SECRET,
        );

        const res = await request(app)
            .post('/graphql')
            .set('Authorization', `Bearer ${token}`)
            .send({
                query: 'query($id: ID!) { getColocDashboard(colocId: $id) { open_complaints } }',
                variables: { id: 'coloc-1' },
            });

        expect(res.status).toBe(200);
        expect(res.body.data.getColocDashboard.open_complaints).toBe(0);
    });

    it('POST /graphql ignore un token invalide sans planter', async () => {
        const res = await request(app)
            .post('/graphql')
            .set('Authorization', 'Bearer not-a-valid-token')
            .send({ query: '{ __typename }' });

        expect(res.status).toBe(200);
        expect(res.body.data.__typename).toBe('Query');
    });
});
