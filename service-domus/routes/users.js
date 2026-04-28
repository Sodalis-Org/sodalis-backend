const { Router } = require('express');
const pool = require('../db');
const bcrypt = require('bcrypt');
const auth = require('../middleware/auth');

const router = Router();

// POST /users — Créer un utilisateur (ADMIN uniquement)
router.post('/', auth, async (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Non autorisé — Réservé aux ADMINs' });
    }

    const { name, email, password, coloc_id, role } = req.body;

    if (!name || !email) {
        return res.status(400).json({ error: '"name" et "email" sont requis' });
    }

    try {
        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const { rows } = await pool.query(
            'INSERT INTO users (name, email, password, coloc_id, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, coloc_id, role, created_at',
            [name, email, hashedPassword, coloc_id ?? null, role ?? 'MEMBER'],
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
