const { Router } = require('express');
const KarmaProfile = require('../models/KarmaProfile');
const ThankLog = require('../models/ThankLog');
const incrementKarma = require('../services/karma');
const logger = require('../logger');

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const router = Router();

// GET /karma/thanks?coloc_id=<id> — thanks récents (24h) de l'utilisateur courant
router.get('/karma/thanks', async (req, res) => {
    const { coloc_id } = req.query;

    if (!coloc_id) {
        return res.status(400).json({ error: 'coloc_id requis' });
    }

    if (req.user.role !== 'ADMIN' && req.user.coloc_id !== coloc_id) {
        logger.warn(
            { userId: req.user.id },
            'Accès refusé — thanks d\'une autre colocation',
        );
        return res
            .status(403)
            .json({ error: "Non autorisé — Vous n'appartenez pas à cette colocation" });
    }

    try {
        const since = new Date(Date.now() - COOLDOWN_MS);
        const logs = await ThankLog.find({
            from_id: String(req.user.id),
            coloc_id: String(coloc_id),
            createdAt: { $gte: since },
        }).sort({ createdAt: -1 });

        res.json(
            logs.map((log) => ({
                to_id: log.to_id,
                createdAt: log.createdAt,
            })),
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /karma/:target_id/thank — donne +3 karma à la cible (cooldown 24h par paire)
router.post('/karma/:target_id/thank', async (req, res) => {
    const { target_id } = req.params;

    if (String(target_id) === String(req.user.id)) {
        return res.status(400).json({ error: 'Vous ne pouvez pas vous remercier vous-même' });
    }

    try {
        const from_id = String(req.user.id);
        const to_id = String(target_id);
        const coloc_id = String(req.user.coloc_id);

        const last = await ThankLog.findOne({ from_id, to_id, coloc_id }).sort({ createdAt: -1 });

        if (last) {
            const elapsed = Date.now() - new Date(last.createdAt).getTime();
            if (elapsed < COOLDOWN_MS) {
                const retry_after_seconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
                return res.status(429).json({
                    error: 'Vous avez déjà remercié cette personne récemment',
                    retry_after_seconds,
                });
            }
        }

        const profile = await incrementKarma(to_id, coloc_id, 3);
        await ThankLog.create({ from_id, to_id, coloc_id });
        res.json(profile);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /karma?coloc_id=<id> — retourne tous les profils karma d'une coloc
router.get('/karma', async (req, res) => {
    const { coloc_id } = req.query;

    if (!coloc_id) {
        return res.status(400).json({ error: 'coloc_id requis' });
    }

    if (req.user.role !== 'ADMIN' && req.user.coloc_id !== coloc_id) {
        logger.warn(
            { userId: req.user.id },
            'Accès refusé — karma d\'une autre colocation',
        );
        return res
            .status(403)
            .json({ error: "Non autorisé — Vous n'appartenez pas à cette colocation" });
    }

    try {
        const profiles = await KarmaProfile.find({ coloc_id });
        res.json(profiles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
