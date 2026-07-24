const { randomUUID } = require('crypto');
const { Router } = require('express');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { generateInviteCode } = require('../utils/inviteCode');
const logger = require('../logger');

if (!process.env.JWT_SECRET) throw new Error('[FATAL] JWT_SECRET non défini — démarrage refusé');
const JWT_SECRET = process.env.JWT_SECRET;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();

function signToken(claims) {
    return jwt.sign({ ...claims, jti: randomUUID() }, JWT_SECRET, {
        expiresIn: '24h',
        algorithm: 'HS256',
    });
}

function requireAdmin(req, res) {
    if (req.user.role !== 'ADMIN' || !req.user.coloc_id) {
        logger.warn({ userId: req.user.id }, 'Accès refusé — action réservée aux ADMINs');
        res.status(403).json({ error: 'Non autorisé — Réservé aux ADMINs' });
        return false;
    }
    return true;
}

// POST /colocs — Créer une coloc (transaction : crée + assigne le créateur comme ADMIN)
router.post(
    '/',
    auth,
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Nom requis (1-100 caractères)'),
    validate,
    async (req, res) => {
        if (req.user.coloc_id) {
            return res.status(409).json({ error: 'Vous êtes déjà dans une colocation' });
        }

        const { name } = req.body;
        const generatedCode = generateInviteCode(name);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                rows: [coloc],
            } = await client.query(
                'INSERT INTO colocs (name, invite_code) VALUES ($1, $2) RETURNING *',
                [name, generatedCode],
            );

            await client.query('UPDATE users SET coloc_id = $1, role = $2 WHERE id = $3', [
                coloc.id,
                'ADMIN',
                req.user.id,
            ]);

            await client.query('COMMIT');

            const token = signToken({
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                coloc_id: coloc.id,
                role: 'ADMIN',
            });

            res.status(201).json({ coloc, token });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },
);

// POST /colocs/join — Rejoindre une coloc via invite_code
router.post(
    '/join',
    auth,
    body('invite_code')
        .trim()
        .isLength({ min: 4, max: 20 })
        .withMessage("Code d'invitation invalide"),
    validate,
    async (req, res) => {
        const { invite_code } = req.body;

        if (req.user.coloc_id) {
            return res.status(409).json({ error: 'Vous êtes déjà dans une colocation' });
        }

        const { rows } = await pool.query(
            'SELECT id, name, invite_code FROM colocs WHERE invite_code = $1',
            [invite_code],
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Code d'invitation invalide" });
        }

        const coloc = rows[0];

        await pool.query('UPDATE users SET coloc_id = $1 WHERE id = $2', [coloc.id, req.user.id]);

        const token = signToken({
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            coloc_id: coloc.id,
            role: req.user.role,
        });

        res.json({ coloc, token });
    },
);

// POST /colocs/leave — Quitter sa colocation
router.post('/leave', auth, async (req, res) => {
    if (!req.user.coloc_id) {
        return res.status(400).json({ error: 'Vous n\'êtes dans aucune colocation' });
    }

    const colocId = req.user.coloc_id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE users SET coloc_id = NULL, role = 'MEMBER' WHERE id = $1`,
            [req.user.id],
        );

        const {
            rows: [adminLeft],
        } = await client.query(
            `SELECT COUNT(*)::int AS count FROM users WHERE coloc_id = $1 AND role = 'ADMIN'`,
            [colocId],
        );

        if (adminLeft.count === 0) {
            const { rows: candidates } = await client.query(
                `SELECT id FROM users WHERE coloc_id = $1 ORDER BY created_at ASC LIMIT 1`,
                [colocId],
            );
            if (candidates[0]) {
                await client.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [
                    candidates[0].id,
                ]);
            }
        }

        await client.query('COMMIT');

        const token = signToken({
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            coloc_id: null,
            role: 'MEMBER',
        });

        res.json({ token });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
});

// POST /colocs/regenerate-invite — ADMIN : nouveau code d'invitation
router.post('/regenerate-invite', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const {
        rows: [coloc],
    } = await pool.query('SELECT id, name, invite_code FROM colocs WHERE id = $1', [
        req.user.coloc_id,
    ]);

    if (!coloc) {
        return res.status(404).json({ error: 'Colocation introuvable' });
    }

    const invite_code = generateInviteCode(coloc.name);
    const {
        rows: [updated],
    } = await pool.query(
        'UPDATE colocs SET invite_code = $1 WHERE id = $2 RETURNING id, name, invite_code',
        [invite_code, coloc.id],
    );

    res.json({ coloc: updated });
});

// POST /colocs/transfer-admin — ADMIN : nommer un autre membre admin
router.post(
    '/transfer-admin',
    auth,
    body('userId').isUUID().withMessage('userId invalide'),
    validate,
    async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const { userId } = req.body;
        if (String(userId) === String(req.user.id)) {
            return res.status(400).json({ error: 'Vous êtes déjà administrateur' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                rows: [target],
            } = await client.query(
                'SELECT id, role FROM users WHERE id = $1 AND coloc_id = $2 FOR UPDATE',
                [userId, req.user.coloc_id],
            );

            if (!target) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Membre introuvable dans cette colocation' });
            }

            await client.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [userId]);
            await client.query(`UPDATE users SET role = 'MEMBER' WHERE id = $1`, [req.user.id]);

            await client.query('COMMIT');

            const token = signToken({
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                coloc_id: req.user.coloc_id,
                role: 'MEMBER',
            });

            res.json({ token });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },
);

// POST /colocs/members/:userId/kick — ADMIN : expulser un membre
router.post(
    '/members/:userId/kick',
    auth,
    param('userId').isUUID().withMessage('userId invalide'),
    validate,
    async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const { userId } = req.params;
        if (String(userId) === String(req.user.id)) {
            return res.status(400).json({ error: 'Utilisez leave pour quitter la colocation' });
        }

        const {
            rows: [target],
        } = await pool.query('SELECT id, role FROM users WHERE id = $1 AND coloc_id = $2', [
            userId,
            req.user.coloc_id,
        ]);

        if (!target) {
            return res.status(404).json({ error: 'Membre introuvable dans cette colocation' });
        }

        if (target.role === 'ADMIN') {
            const {
                rows: [admins],
            } = await pool.query(
                `SELECT COUNT(*)::int AS count FROM users WHERE coloc_id = $1 AND role = 'ADMIN'`,
                [req.user.coloc_id],
            );
            if (admins.count <= 1) {
                return res
                    .status(400)
                    .json({ error: 'Impossible d\'expulser le dernier administrateur' });
            }
        }

        await pool.query(
            `UPDATE users SET coloc_id = NULL, role = 'MEMBER' WHERE id = $1`,
            [userId],
        );

        res.json({ ok: true });
    },
);

// GET /colocs/:id — Détail d'une coloc (invite_code) — membres de la coloc uniquement
router.get('/:id', auth, async (req, res) => {
    const colocId = String(req.params.id);
    if (!UUID_RE.test(colocId)) {
        return res.status(404).json({ error: 'Colocation introuvable' });
    }
    if (!req.user.coloc_id || String(req.user.coloc_id) !== colocId) {
        logger.warn(
            { userId: req.user.id },
            'Accès refusé — détail de coloc hors de sa colocation',
        );
        return res
            .status(403)
            .json({ error: "Non autorisé — Vous n'appartenez pas à cette colocation" });
    }

    const { rows } = await pool.query('SELECT id, name, invite_code FROM colocs WHERE id = $1', [
        colocId,
    ]);

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Colocation introuvable' });
    }

    const coloc = rows[0];
    if (req.user.role !== 'ADMIN') {
        coloc.invite_code = null;
    }

    res.json(coloc);
});

// GET /colocs/:id/users — Membres d'une coloc
router.get('/:id/users', auth, async (req, res) => {
    if (req.user.role !== 'ADMIN' && String(req.user.coloc_id) !== String(req.params.id)) {
        logger.warn(
            { userId: req.user.id },
            'Accès refusé — liste des membres hors de sa colocation',
        );
        return res
            .status(403)
            .json({ error: "Non autorisé — Vous n'appartenez pas à cette colocation" });
    }

    const { rows } = await pool.query(
        'SELECT id, name, email, role, coloc_id, harmony_score, created_at FROM users WHERE coloc_id = $1',
        [req.params.id],
    );

    res.json(rows);
});

module.exports = router;
