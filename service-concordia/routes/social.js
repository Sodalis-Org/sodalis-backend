const { Router } = require('express');
const { randomUUID } = require('crypto');
const Complaint = require('../models/Complaint');
const Poll = require('../models/Poll');
const logger = require('../logger');
const incrementKarma = require('../services/karma');
const publisher = require('../redis-publisher');

function sanitize(complaint) {
    const obj = complaint.toObject ? complaint.toObject() : { ...complaint };
    obj.id = String(obj._id);
    delete obj._id;
    if (obj.is_anonymous) obj.creator_id = null;
    return obj;
}

function toPollObject(poll) {
    const obj = poll.toObject ? poll.toObject() : { ...poll };
    obj.id = String(obj._id);
    delete obj._id;
    return obj;
}

function checkColoc(user, coloc_id) {
    if (!user || (user.role !== 'ADMIN' && String(user.coloc_id) !== String(coloc_id))) {
        logger.warn({ userId: user?.id }, 'Accès refusé — appartenance à une autre colocation');
        const err = new Error("Non autorisé — Vous n'appartenez pas à cette colocation");
        err.status = 403;
        throw err;
    }
}

function canActOnComplaint(user, complaint) {
    return user.role === 'ADMIN' || String(user.id) === String(complaint.creator_id);
}

function canActOnPoll(user, poll) {
    return user.role === 'ADMIN' || String(user.id) === String(poll.creator_id);
}

const router = Router();

// ── Complaints ────────────────────────────────────────────────

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

        await publisher.publish(
            'sodalis_events',
            JSON.stringify({
                type: 'NEW_COMPLAINT',
                coloc_id,
                complaint_id: String(complaint._id),
                message: 'Nouvelle plainte signalée dans la colocation',
            }),
        );

        if (complaint.target_id) {
            await publisher.publish(
                'sodalis_events',
                JSON.stringify({
                    type: 'COMPLAINT_TARGETED',
                    coloc_id,
                    target_id: String(complaint.target_id),
                    complaint_id: String(complaint._id),
                    message: 'Vous avez été mentionné dans une plainte',
                }),
            );
        }

        logger.info({ coloc_id, complaint_id: complaint._id }, 'Nouvelle plainte créée');
        res.status(201).json(sanitize(complaint));
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
            return res
                .status(403)
                .json({ error: 'Seul le créateur ou un ADMIN peut résoudre cette plainte' });
        }

        complaint.status = 'RESOLVED';
        await complaint.save();

        await incrementKarma(req.user.id, complaint.coloc_id, 5);

        await publisher.publish(
            'sodalis_events',
            JSON.stringify({
                type: 'COMPLAINT_RESOLVED',
                coloc_id: String(complaint.coloc_id),
                complaint_id: String(complaint._id),
                message: 'Une plainte a été résolue',
            }),
        );

        logger.info({ complaint_id: complaint._id }, 'Plainte résolue');
        res.json(sanitize(complaint));
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
            return res
                .status(403)
                .json({ error: 'Seul le créateur ou un ADMIN peut supprimer cette plainte' });
        }

        const coloc_id = String(complaint.coloc_id);
        const complaint_id = String(complaint._id);
        await complaint.deleteOne();

        await publisher.publish(
            'sodalis_events',
            JSON.stringify({
                type: 'COMPLAINT_DELETED',
                coloc_id,
                complaint_id,
                message: 'Une plainte a été supprimée',
            }),
        );

        logger.info({ complaint_id: req.params.id }, 'Plainte supprimée');
        res.json({ success: true, coloc_id });
    } catch (err) {
        next(err);
    }
});

const VALID_COMPLAINT_STATUSES = ['OPEN', 'RESOLVED'];

router.get('/complaints', async (req, res, next) => {
    try {
        const { coloc_id, status, target_id } = req.query;
        if (!coloc_id || typeof coloc_id !== 'string') {
            return res.status(400).json({ error: 'coloc_id requis' });
        }

        checkColoc(req.user, coloc_id);

        // status/target_id viennent de req.query : Express 5 utilise par défaut un
        // query parser "simple" (pas de notation à crochets, donc pas d'objet injectable
        // via ?status[$ne]=...), mais une clé répétée (?status=A&status=B) produit un
        // tableau — sans ce contrôle de type, ce tableau serait injecté tel quel dans le
        // filtre Mongoose.
        if (status !== undefined && (typeof status !== 'string' || !VALID_COMPLAINT_STATUSES.includes(status))) {
            return res.status(400).json({ error: 'status invalide' });
        }
        if (target_id !== undefined && typeof target_id !== 'string') {
            return res.status(400).json({ error: 'target_id invalide' });
        }

        const filter = { coloc_id };
        if (status) filter.status = status;
        if (target_id) filter.target_id = target_id;

        const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
        res.json(complaints.map(sanitize));
    } catch (err) {
        next(err);
    }
});

// ── Polls ─────────────────────────────────────────────────────

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

        await publisher.publish(
            'sodalis_events',
            JSON.stringify({
                type: 'NEW_POLL',
                coloc_id,
                poll_id: String(poll._id),
                question: poll.question,
                message: `Nouveau sondage : ${poll.question}`,
            }),
        );

        logger.info({ coloc_id, poll_id: poll._id }, 'Nouveau sondage créé');
        res.status(201).json(toPollObject(poll));
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
        const alreadyVoted = poll.options.some((opt) => opt.voters.includes(userId));

        for (const opt of poll.options) {
            const idx = opt.voters.indexOf(userId);
            if (idx !== -1) opt.voters.splice(idx, 1);
        }

        const target = poll.options.find((o) => o.option_id === option_id);
        if (!target) return res.status(400).json({ error: 'Option invalide' });

        target.voters.push(userId);
        await poll.save();

        if (!alreadyVoted) {
            await incrementKarma(req.user.id, poll.coloc_id, 2);
        }

        await publisher.publish(
            'sodalis_events',
            JSON.stringify({
                type: 'POLL_UPDATED',
                coloc_id: String(poll.coloc_id),
                poll_id: String(poll._id),
                question: poll.question,
                message: `Un vote a été enregistré sur le sondage : ${poll.question}`,
            }),
        );

        logger.info({ poll_id: poll._id, option_id, user_id: userId }, 'Vote enregistré');
        res.json(toPollObject(poll));
    } catch (err) {
        next(err);
    }
});

router.patch('/polls/:id/close', async (req, res, next) => {
    try {
        const poll = await Poll.findById(req.params.id);
        if (!poll) return res.status(404).json({ error: 'Sondage introuvable' });

        checkColoc(req.user, poll.coloc_id);

        if (!canActOnPoll(req.user, poll)) {
            return res
                .status(403)
                .json({ error: 'Seul le créateur ou un ADMIN peut fermer ce sondage' });
        }

        if (poll.status === 'CLOSED') {
            return res.status(400).json({ error: 'Ce sondage est déjà fermé' });
        }

        poll.status = 'CLOSED';
        await poll.save();

        await publisher.publish(
            'sodalis_events',
            JSON.stringify({
                type: 'POLL_UPDATED',
                coloc_id: String(poll.coloc_id),
                poll_id: String(poll._id),
                question: poll.question,
                message: `Le sondage a été fermé : ${poll.question}`,
            }),
        );

        logger.info({ poll_id: poll._id }, 'Sondage fermé');
        res.json(toPollObject(poll));
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
        res.json(polls.map(toPollObject));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
