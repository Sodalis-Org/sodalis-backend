const { Router } = require('express');
const KarmaProfile = require('../models/KarmaProfile');
const incrementKarma = require('../services/karma');

const router = Router();

// POST /karma/:target_id/thank — donne +3 karma à la cible
router.post('/karma/:target_id/thank', async (req, res) => {
    const { target_id } = req.params;

    if (String(target_id) === String(req.user.id)) {
        return res.status(400).json({ error: 'Vous ne pouvez pas vous remercier vous-même' });
    }

    try {
        const profile = await incrementKarma(target_id, req.user.coloc_id, 3);
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
        return res.status(403).json({ error: 'Non autorisé — Vous n\'appartenez pas à cette colocation' });
    }

    try {
        const profiles = await KarmaProfile.find({ coloc_id });
        res.json(profiles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
