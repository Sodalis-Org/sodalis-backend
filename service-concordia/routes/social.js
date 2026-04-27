const { Router } = require('express');
const { randomUUID } = require('crypto');
const Complaint = require('../models/Complaint');
const Poll = require('../models/Poll');
const logger = require('../logger');

function sanitize(complaint) {
    const obj = complaint.toObject ? complaint.toObject() : { ...complaint };
    if (obj.is_anonymous) obj.creator_id = null;
    return obj;
}

function checkColoc(user, coloc_id) {
    if (!user || (user.role !== 'ADMIN' && String(user.coloc_id) !== String(coloc_id))) {
        const err = new Error('Non autorisé — Vous n\'appartenez pas à cette colocation');
        err.status = 403;
        throw err;
    }
}

function canActOnComplaint(user, complaint) {
    return user.role === 'ADMIN' || String(user.id) === String(complaint.creator_id);
}

module.exports = (io) => {
    const router = Router();

    // ── Complaints ────────────────────────────────────────────

    router.post('/complaints', async (req, res, next) => {
        try {
            const { coloc_id, message, target_id, is_anonymous = false } = req.body;
            checkColoc(req.user, coloc_id);

            const complaint = await Complaint.create({
                coloc_id,
                creator_id: String(req.user.id),
                target_id: target_id || undefined,
                message,
                is_anonymous,
            });

            const payload = sanitize(complaint);

            // Broadcast à toute la coloc
            io.emit(`coloc_${coloc_id}_notifications`, { type: 'NEW_COMPLAINT', complaint: payload });

            // Notification ciblée en plus si target_id est renseigné
            if (complaint.target_id) {
                io.emit(`user_${complaint.target_id}_notifications`, { type: 'COMPLAINT_TARGETED', complaint: payload });
            }

            logger.info({ coloc_id, complaint_id: complaint._id }, 'Nouvelle plainte créée');
            res.status(201).json(payload);
        } catch (err) {
            next(err);
        }
    });

    router.patch('/complaints/:id/resolve', async (req, res, next) => {
        try {
            const complaint = await Complaint.findById(req.params.id);
            if (!complaint) return res.status(404).json({ error: 'Plainte introuvable' });

            checkColoc(req.user, complaint.coloc_id);

            if (!canActOnComplaint(req.user, complaint)) {
                return res.status(403).json({ error: 'Seul le créateur ou un ADMIN peut résoudre cette plainte' });
            }

            complaint.status = 'RESOLVED';
            await complaint.save();

            const payload = sanitize(complaint);
            io.emit(`coloc_${complaint.coloc_id}_notifications`, { type: 'COMPLAINT_RESOLVED', complaint: payload });
            logger.info({ complaint_id: complaint._id }, 'Plainte résolue');

            res.json(payload);
        } catch (err) {
            next(err);
        }
    });

    router.delete('/complaints/:id', async (req, res, next) => {
        try {
            const complaint = await Complaint.findById(req.params.id);
            if (!complaint) return res.status(404).json({ error: 'Plainte introuvable' });

            checkColoc(req.user, complaint.coloc_id);

            if (!canActOnComplaint(req.user, complaint)) {
                return res.status(403).json({ error: 'Seul le créateur ou un ADMIN peut supprimer cette plainte' });
            }

            const coloc_id = complaint.coloc_id;
            await complaint.deleteOne();

            io.emit(`coloc_${coloc_id}_notifications`, { type: 'COMPLAINT_DELETED', complaint_id: req.params.id });
            logger.info({ complaint_id: req.params.id }, 'Plainte supprimée');

            res.json({ success: true });
        } catch (err) {
            next(err);
        }
    });

    router.get('/complaints', async (req, res, next) => {
        try {
            const { coloc_id, status, target_id } = req.query;
            if (!coloc_id) return res.status(400).json({ error: 'coloc_id requis' });

            checkColoc(req.user, coloc_id);

            const filter = { coloc_id };
            if (status) filter.status = status;
            if (target_id) filter.target_id = target_id;

            const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
            res.json(complaints.map(sanitize));
        } catch (err) {
            next(err);
        }
    });

    // ── Polls ─────────────────────────────────────────────────

    router.post('/polls', async (req, res, next) => {
        try {
            const { coloc_id, question, options } = req.body;
            checkColoc(req.user, coloc_id);

            if (!Array.isArray(options) || options.length < 2) {
                return res.status(400).json({ error: 'Un sondage nécessite au moins 2 options' });
            }

            const poll = await Poll.create({
                coloc_id,
                creator_id: String(req.user.id),
                question,
                options: options.map((text) => ({ option_id: randomUUID(), text, voters: [] })),
            });

            io.emit(`coloc_${coloc_id}_notifications`, { type: 'NEW_POLL', poll });
            logger.info({ coloc_id, poll_id: poll._id }, 'Nouveau sondage créé');

            res.status(201).json(poll);
        } catch (err) {
            next(err);
        }
    });

    router.post('/polls/:id/vote', async (req, res, next) => {
        try {
            const { option_id } = req.body;
            const poll = await Poll.findById(req.params.id);
            if (!poll) return res.status(404).json({ error: 'Sondage introuvable' });

            checkColoc(req.user, poll.coloc_id);

            if (poll.status === 'CLOSED') {
                return res.status(400).json({ error: 'Ce sondage est fermé' });
            }

            const userId = String(req.user.id);

            // Anti-doublon : retirer l'ancien vote si l'utilisateur a déjà voté
            for (const opt of poll.options) {
                const idx = opt.voters.indexOf(userId);
                if (idx !== -1) opt.voters.splice(idx, 1);
            }

            const target = poll.options.find((o) => o.option_id === option_id);
            if (!target) return res.status(400).json({ error: 'Option invalide' });

            target.voters.push(userId);
            await poll.save();

            io.emit(`coloc_${poll.coloc_id}_notifications`, { type: 'POLL_UPDATED', poll });
            logger.info({ poll_id: poll._id, option_id, user_id: userId }, 'Vote enregistré');

            res.json(poll);
        } catch (err) {
            next(err);
        }
    });

    router.get('/polls', async (req, res, next) => {
        try {
            const { coloc_id } = req.query;
            if (!coloc_id) return res.status(400).json({ error: 'coloc_id requis' });

            checkColoc(req.user, coloc_id);

            const polls = await Poll.find({ coloc_id }).sort({ createdAt: -1 });
            res.json(polls);
        } catch (err) {
            next(err);
        }
    });

    return router;
};
