const jwt = require('jsonwebtoken');
const mockRequire = require('./helpers/mockRequire');

const mockRedis = { get: vi.fn(), publish: vi.fn(), connect: vi.fn(), quit: vi.fn() };
mockRequire(require, '../redis-publisher', mockRedis);

const { authenticateSocket, extractCookie } = require('../socketAuth');

function fakeSocket(cookieHeader) {
    return { id: 'sock-1', handshake: { headers: { cookie: cookieHeader } } };
}

describe('extractCookie', () => {
    it('renvoie null quand il n\'y a pas d\'en-tête cookie', () => {
        expect(extractCookie(undefined, 'sodalis_token')).toBeNull();
    });

    it('extrait la valeur du cookie demandé parmi plusieurs', () => {
        expect(extractCookie('a=1; sodalis_token=abc.def.ghi; b=2', 'sodalis_token')).toBe(
            'abc.def.ghi',
        );
    });

    it('renvoie null quand le cookie demandé est absent', () => {
        expect(extractCookie('a=1; b=2', 'sodalis_token')).toBeNull();
    });
});

describe('authenticateSocket', () => {
    beforeEach(() => vi.clearAllMocks());

    it('refuse la connexion sans cookie', async () => {
        const next = vi.fn();
        await authenticateSocket(fakeSocket(undefined), next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('refuse la connexion avec un jeton invalide', async () => {
        const next = vi.fn();
        await authenticateSocket(fakeSocket('sodalis_token=not-a-valid-token'), next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('refuse la connexion avec un jeton révoqué', async () => {
        mockRedis.get.mockResolvedValueOnce('1');
        const token = jwt.sign(
            { id: 'u1', coloc_id: 'c1', jti: 'jti-1' },
            process.env.JWT_SECRET,
            { algorithm: 'HS256' },
        );
        const next = vi.fn();
        await authenticateSocket(fakeSocket(`sodalis_token=${token}`), next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('accepte la connexion et attache socket.user avec un jeton valide', async () => {
        mockRedis.get.mockResolvedValueOnce(null);
        const token = jwt.sign(
            { id: 'u1', coloc_id: 'c1', jti: 'jti-2' },
            process.env.JWT_SECRET,
            { algorithm: 'HS256' },
        );
        const next = vi.fn();
        const socket = fakeSocket(`sodalis_token=${token}`);
        await authenticateSocket(socket, next);
        expect(next).toHaveBeenCalledWith();
        expect(socket.user.id).toBe('u1');
        expect(socket.user.coloc_id).toBe('c1');
    });
});
