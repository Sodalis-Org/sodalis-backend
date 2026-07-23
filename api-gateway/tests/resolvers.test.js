const mockRequire = require('./helpers/mockRequire');

const mockAxios = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
const mockCache = { get: vi.fn(), setEx: vi.fn(), del: vi.fn(), connect: vi.fn(), quit: vi.fn() };
mockRequire(require, 'axios', mockAxios);
mockRequire(require, '../cache', mockCache);

const resolvers = require('../resolvers');

const req = { headers: { authorization: 'Bearer token123' }, cookies: {} };
const COLOC_ID = 'coloc-1';

function mockRes() {
    return { cookie: vi.fn(), clearCookie: vi.fn() };
}

describe('resolvers.Query', () => {
    beforeEach(() => vi.clearAllMocks());

    it('me renvoie null sans utilisateur authentifié', () => {
        expect(resolvers.Query.me(null, {}, { user: null })).toBeNull();
    });

    it('me renvoie les claims du jeton décodé', () => {
        const user = { id: 'u1', name: 'Alice', email: 'a@test.com', role: 'ADMIN' };
        expect(resolvers.Query.me(null, {}, { user })).toBe(user);
    });

    it('myColoc lève une erreur sans coloc_id', async () => {
        await expect(
            resolvers.Query.myColoc(null, {}, { user: { coloc_id: null }, req }),
        ).rejects.toThrow('Non autorisé');
    });

    it("myColoc récupère la coloc de l'utilisateur", async () => {
        mockAxios.get.mockResolvedValueOnce({ data: { id: COLOC_ID, name: 'Chez nous' } });
        const result = await resolvers.Query.myColoc(
            null,
            {},
            { user: { coloc_id: COLOC_ID }, req },
        );
        expect(result.id).toBe(COLOC_ID);
    });

    it("usersByColoc refuse un membre d'une autre coloc", async () => {
        await expect(
            resolvers.Query.usersByColoc(
                null,
                { colocId: COLOC_ID },
                { user: { role: 'MEMBER', coloc_id: 'other' }, req },
            ),
        ).rejects.toThrow('Non autorisé');
    });

    it('usersByColoc fusionne les scores karma', async () => {
        mockAxios.get
            .mockResolvedValueOnce({ data: [{ id: 'u1', name: 'Alice' }] })
            .mockResolvedValueOnce({ data: [{ user_id: 'u1', score: 12 }] });

        const result = await resolvers.Query.usersByColoc(
            null,
            { colocId: COLOC_ID },
            { user: { role: 'MEMBER', coloc_id: COLOC_ID }, req },
        );

        expect(result[0].karma_score).toBe(12);
    });

    it('tasksByColoc renvoie les tâches paginées', async () => {
        mockAxios.get.mockResolvedValueOnce({ data: { data: [{ id: 't1' }], pagination: {} } });
        const result = await resolvers.Query.tasksByColoc(
            null,
            { colocId: COLOC_ID },
            { user: { role: 'ADMIN', coloc_id: 'other' }, req },
        );
        expect(result).toEqual([{ id: 't1' }]);
    });

    it('getColocDashboard renvoie le cache si présent', async () => {
        mockCache.get.mockResolvedValueOnce(
            JSON.stringify({ users: [], tasks: [], open_complaints: 0 }),
        );
        const result = await resolvers.Query.getColocDashboard(
            null,
            { colocId: COLOC_ID },
            { user: { role: 'ADMIN', coloc_id: COLOC_ID }, req },
        );
        expect(result.open_complaints).toBe(0);
        expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('getColocDashboard agrège les microservices en cas de cache miss', async () => {
        mockCache.get.mockResolvedValueOnce(null);
        mockAxios.get
            .mockResolvedValueOnce({ data: [{ id: 'u1' }] })
            .mockResolvedValueOnce({ data: { data: [{ id: 't1' }] } })
            .mockResolvedValueOnce({ data: [{ id: 'c1' }] })
            .mockResolvedValueOnce({ data: [{ user_id: 'u1', score: 5 }] });

        const result = await resolvers.Query.getColocDashboard(
            null,
            { colocId: COLOC_ID },
            { user: { role: 'ADMIN', coloc_id: COLOC_ID }, req },
        );

        expect(result.users[0].karma_score).toBe(5);
        expect(result.open_complaints).toBe(1);
        expect(mockCache.setEx).toHaveBeenCalled();
    });
});

describe('resolvers.Mutation', () => {
    beforeEach(() => vi.clearAllMocks());

    it('register délègue à Domus', async () => {
        mockAxios.post.mockResolvedValueOnce({ data: { id: 'u1', email: 'a@test.com' } });
        const result = await resolvers.Mutation.register(null, {
            name: 'Alice',
            email: 'a@test.com',
            password: 'pw',
        });
        expect(result.id).toBe('u1');
    });

    it('login délègue à Domus et pose le cookie httpOnly', async () => {
        mockAxios.post.mockResolvedValueOnce({
            data: { token: 'tok', user: { id: 'u1', email: 'a@test.com' } },
        });
        const res = mockRes();
        const result = await resolvers.Mutation.login(
            null,
            { email: 'a@test.com', password: 'pw' },
            { res },
        );
        expect(result.user.id).toBe('u1');
        expect(res.cookie).toHaveBeenCalledWith('sodalis_token', 'tok', expect.any(Object));
    });

    it('createTask refuse un utilisateur non autorisé', async () => {
        await expect(
            resolvers.Mutation.createTask(
                null,
                { title: 'Vaisselle', assignee_id: 'u1', coloc_id: COLOC_ID },
                { user: { role: 'MEMBER', coloc_id: 'other' }, req },
            ),
        ).rejects.toThrow('Non autorisé');
    });

    it('createTask crée une tâche pour un membre de la coloc', async () => {
        mockAxios.post.mockResolvedValueOnce({ data: { id: 't1' } });
        const result = await resolvers.Mutation.createTask(
            null,
            { title: 'Vaisselle', assignee_id: 'u1', coloc_id: COLOC_ID },
            { user: { role: 'MEMBER', coloc_id: COLOC_ID }, req },
        );
        expect(result.id).toBe('t1');
    });

    it('createMaintenanceTicket invalide le cache dashboard', async () => {
        mockAxios.post.mockResolvedValueOnce({ data: { id: 'm1' } });
        await resolvers.Mutation.createMaintenanceTicket(
            null,
            {
                title: 'Fuite',
                description: '',
                category: 'PLUMBING',
                priority: 'LOW',
                coloc_id: COLOC_ID,
            },
            { user: { id: 'u1' }, req },
        );
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('thankUser lève une erreur sans utilisateur authentifié', async () => {
        await expect(
            resolvers.Mutation.thankUser(null, { target_id: 'u2' }, { user: null, req }),
        ).rejects.toThrow('Non autorisé');
    });

    it("thankUser invalide le cache dashboard de l'utilisateur", async () => {
        mockAxios.post.mockResolvedValueOnce({ data: { id: 'k1' } });
        await resolvers.Mutation.thankUser(
            null,
            { target_id: 'u2' },
            { user: { id: 'u1', coloc_id: COLOC_ID }, req },
        );
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('createColoc délègue à Domus et repose le cookie httpOnly', async () => {
        mockAxios.post.mockResolvedValueOnce({
            data: { coloc: { id: COLOC_ID, name: 'Chez nous' }, token: 'new-tok' },
        });
        const res = mockRes();
        const result = await resolvers.Mutation.createColoc(
            null,
            { name: 'Chez nous' },
            { req, res },
        );
        expect(result.coloc.id).toBe(COLOC_ID);
        expect(res.cookie).toHaveBeenCalledWith('sodalis_token', 'new-tok', expect.any(Object));
    });

    it('joinColoc refuse un utilisateur non authentifié', async () => {
        await expect(
            resolvers.Mutation.joinColoc(null, { invite_code: 'abcd' }, { user: null, req }),
        ).rejects.toThrow('Non autorisé');
    });

    it('joinColoc délègue à Domus et repose le cookie httpOnly', async () => {
        mockAxios.post.mockResolvedValueOnce({
            data: { coloc: { id: COLOC_ID }, token: 'new-tok' },
        });
        const res = mockRes();
        const result = await resolvers.Mutation.joinColoc(
            null,
            { invite_code: 'abcd' },
            { user: { id: 'u1' }, req, res },
        );
        expect(result.coloc.id).toBe(COLOC_ID);
        expect(res.cookie).toHaveBeenCalledWith('sodalis_token', 'new-tok', expect.any(Object));
    });

    it('logout révoque le jeton courant et efface le cookie', async () => {
        const jwt = require('jsonwebtoken');
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
        const token = jwt.sign({ id: 'u1', jti: 'jti-1' }, process.env.JWT_SECRET, {
            expiresIn: '1h',
        });
        const res = mockRes();
        const result = await resolvers.Mutation.logout(
            null,
            null,
            { req: { cookies: { sodalis_token: token } }, res },
        );
        expect(result).toBe(true);
        expect(mockCache.setEx).toHaveBeenCalledWith(
            'revoked_jwt:jti-1',
            expect.any(Number),
            '1',
        );
        expect(res.clearCookie).toHaveBeenCalledWith('sodalis_token', expect.any(Object));
    });

    it('logout efface simplement le cookie sans jeton', async () => {
        const res = mockRes();
        const result = await resolvers.Mutation.logout(null, null, { req: { cookies: {} }, res });
        expect(result).toBe(true);
        expect(mockCache.setEx).not.toHaveBeenCalled();
        expect(res.clearCookie).toHaveBeenCalled();
    });

    it('updateTaskStatus délègue à Labor', async () => {
        mockAxios.patch.mockResolvedValueOnce({ data: { id: 't1', status: 'DONE' } });
        const result = await resolvers.Mutation.updateTaskStatus(
            null,
            { id: 't1', status: 'DONE' },
            { user: { id: 'u1' }, req },
        );
        expect(result.status).toBe('DONE');
    });

    it('updateTicketStatus invalide le cache dashboard', async () => {
        mockAxios.patch.mockResolvedValueOnce({ data: { id: 'm1', coloc_id: COLOC_ID } });
        await resolvers.Mutation.updateTicketStatus(
            null,
            { id: 'm1', status: 'RESOLVED' },
            { user: { id: 'u1' }, req },
        );
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('assignTicket invalide le cache dashboard', async () => {
        mockAxios.patch.mockResolvedValueOnce({ data: { id: 'm1', coloc_id: COLOC_ID } });
        await resolvers.Mutation.assignTicket(
            null,
            { id: 'm1', assigned_to: 'u2' },
            { user: { id: 'u1' }, req },
        );
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('createComplaint invalide le cache dashboard', async () => {
        mockAxios.post.mockResolvedValueOnce({ data: { id: 'c1' } });
        await resolvers.Mutation.createComplaint(
            null,
            { coloc_id: COLOC_ID, message: 'Trop de bruit' },
            { user: { id: 'u1' }, req },
        );
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('deleteComplaint invalide le cache dashboard quand présent', async () => {
        mockAxios.delete.mockResolvedValueOnce({ data: { coloc_id: COLOC_ID } });
        const result = await resolvers.Mutation.deleteComplaint(
            null,
            { id: 'c1' },
            { user: { id: 'u1' }, req },
        );
        expect(result).toBe(true);
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('resolveComplaint invalide le cache dashboard', async () => {
        mockAxios.patch.mockResolvedValueOnce({ data: { id: 'c1', coloc_id: COLOC_ID } });
        await resolvers.Mutation.resolveComplaint(null, { id: 'c1' }, { user: { id: 'u1' }, req });
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('createPoll invalide le cache dashboard', async () => {
        mockAxios.post.mockResolvedValueOnce({ data: { id: 'p1' } });
        await resolvers.Mutation.createPoll(
            null,
            { coloc_id: COLOC_ID, question: 'Pizza ?', options: ['Oui', 'Non'] },
            { user: { id: 'u1' }, req },
        );
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });

    it('votePoll invalide le cache dashboard', async () => {
        mockAxios.post.mockResolvedValueOnce({ data: { id: 'p1', coloc_id: COLOC_ID } });
        await resolvers.Mutation.votePoll(
            null,
            { poll_id: 'p1', option_id: 'opt-1' },
            { user: { id: 'u1' }, req },
        );
        expect(mockCache.del).toHaveBeenCalledWith(`dashboard_coloc_${COLOC_ID}`);
    });
});

describe('resolvers.Query — autorisations', () => {
    beforeEach(() => vi.clearAllMocks());

    it("notifications refuse un membre d'une autre coloc", async () => {
        await expect(
            resolvers.Query.notifications(
                null,
                { colocId: COLOC_ID },
                { user: { role: 'MEMBER', coloc_id: 'other' }, req },
            ),
        ).rejects.toThrow('Non autorisé');
    });

    it('notifications renvoie les données pour un membre de la coloc', async () => {
        mockAxios.get.mockResolvedValueOnce({ data: { data: [], pagination: {} } });
        const result = await resolvers.Query.notifications(
            null,
            { colocId: COLOC_ID },
            { user: { role: 'MEMBER', coloc_id: COLOC_ID }, req },
        );
        expect(result.data).toEqual([]);
    });

    it('maintenanceTickets renvoie les tickets pour un ADMIN', async () => {
        mockAxios.get.mockResolvedValueOnce({ data: [{ id: 'm1' }] });
        const result = await resolvers.Query.maintenanceTickets(
            null,
            { colocId: COLOC_ID },
            { user: { role: 'ADMIN', coloc_id: 'other' }, req },
        );
        expect(result).toEqual([{ id: 'm1' }]);
    });

    it('complaints refuse un utilisateur non authentifié', async () => {
        await expect(
            resolvers.Query.complaints(null, { colocId: COLOC_ID }, { user: null, req }),
        ).rejects.toThrow('Non autorisé');
    });

    it('polls renvoie les sondages de la coloc', async () => {
        mockAxios.get.mockResolvedValueOnce({ data: [{ id: 'p1' }] });
        const result = await resolvers.Query.polls(
            null,
            { colocId: COLOC_ID },
            { user: { role: 'ADMIN', coloc_id: 'other' }, req },
        );
        expect(result).toEqual([{ id: 'p1' }]);
    });
});
