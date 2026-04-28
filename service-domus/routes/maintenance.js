const { Router } = require('express');
const { body, query, param } = require('express-validator');
const pool = require('../db');
const publisher = require('../redis-publisher');
const { createTask } = require('../grpc-labor-client');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const logger = require('../logger');

const router = Router();

const VALID_CATEGORIES = ['PLUMBING', 'ELECTRICITY', 'APPLIANCE', 'FURNITURE', 'INTERNET', 'OTHER'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const VALID_STATUSES   = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];

// POST /maintenance — Créer un ticket
router.post('/',
    auth,
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Titre requis (1-200 caractères)'),
    body('description').optional().trim(),
    body('category').isIn(VALID_CATEGORIES).withMessage(`category doit être : ${VALID_CATEGORIES.join(', ')}`),
    body('priority').isIn(VALID_PRIORITIES).withMessage(`priority doit être : ${VALID_PRIORITIES.join(', ')}`),
    body('coloc_id').isUUID().withMessage('coloc_id doit être un UUID valide'),
    validate,
    async (req, res, next) => {
        const { title, description, category, priority, coloc_id } = req.body;
        const created_by = req.user.id;

        if (req.user.coloc_id !== coloc_id) {
            return res.status(403).json({ error: 'Non autorisé — Vous n\'appartenez pas à cette colocation' });
        }

        try {
            const { rows } = await pool.query(
                `INSERT INTO maintenance_tickets (title, description, category, priority, coloc_id, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [title, description || null, category, priority, coloc_id, created_by],
            );

            const ticket = rows[0];

            const { rows: userRows } = await pool.query(
                'SELECT name FROM users WHERE id = $1',
                [created_by],
            );
            const creator_name = userRows[0]?.name ?? 'Inconnu';

            // Escalade automatique via gRPC pour les tickets URGENT
            if (priority === 'URGENT') {
                try {
                    await createTask({
                        title: `Urgence : ${title}`,
                        assignee_id: created_by,
                        coloc_id,
                    });
                } catch (err) {
                    // L'escalade est best-effort — le ticket est déjà créé
                    logger.error({ err }, 'Erreur gRPC CreateTask (URGENT)');
                }
            }

            await publisher.publish('sodalis_events', JSON.stringify({
                type: 'NEW_MAINTENANCE_TICKET',
                coloc_id,
                ticket_id: ticket.id,
                title,
                priority,
                creator_name,
                message: `Nouveau ticket [${priority}] signalé par ${creator_name} : ${title}`,
            }));

            await publisher.del(`dashboard_coloc_${coloc_id}`);

            res.status(201).json(ticket);
        } catch (err) {
            next(err);
        }
    },
);

// GET /maintenance?coloc_id=<uuid> — Lister les tickets d'une coloc
router.get('/',
    auth,
    query('coloc_id').isUUID().withMessage('coloc_id est requis et doit être un UUID valide'),
    validate,
    async (req, res, next) => {
        const { coloc_id } = req.query;

        if (req.user.coloc_id !== coloc_id) {
            return res.status(403).json({ error: 'Non autorisé — Vous n\'appartenez pas à cette colocation' });
        }

        try {
            const { rows } = await pool.query(
                'SELECT * FROM maintenance_tickets WHERE coloc_id = $1 ORDER BY created_at DESC',
                [coloc_id],
            );

            res.json(rows);
        } catch (err) {
            next(err);
        }
    },
);

// PATCH /maintenance/:id/status — Mettre à jour le statut
router.patch('/:id/status',
    auth,
    param('id').isInt({ min: 1 }).withMessage('id doit être un entier valide'),
    body('status').isIn(VALID_STATUSES).withMessage(`status doit être : ${VALID_STATUSES.join(', ')}`),
    validate,
    async (req, res, next) => {
        const { status } = req.body;
        const { id } = req.params;

        try {
            const { rows } = await pool.query(
                'SELECT id, coloc_id, title FROM maintenance_tickets WHERE id = $1',
                [id],
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Ticket introuvable' });
            }

            const ticket = rows[0];

            if (req.user.coloc_id !== ticket.coloc_id) {
                return res.status(403).json({ error: 'Non autorisé — Vous n\'appartenez pas à cette colocation' });
            }

            const { rows: updated } = await pool.query(
                'UPDATE maintenance_tickets SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
                [status, id],
            );

            await publisher.publish('sodalis_events', JSON.stringify({
                type: 'MAINTENANCE_TICKET_UPDATED',
                coloc_id: ticket.coloc_id,
                ticket_id: ticket.id,
                status,
                message: `Ticket "${ticket.title}" mis à jour : ${status}`,
            }));

            await publisher.del(`dashboard_coloc_${ticket.coloc_id}`);

            res.json(updated[0]);
        } catch (err) {
            next(err);
        }
    },
);

// PATCH /maintenance/:id/assign — Assigner un ticket (ADMIN de la coloc uniquement)
router.patch('/:id/assign',
    auth,
    param('id').isInt({ min: 1 }).withMessage('id doit être un entier valide'),
    body('assigned_to').isUUID().withMessage('assigned_to doit être un UUID valide'),
    validate,
    async (req, res, next) => {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Non autorisé — Réservé aux ADMINs' });
        }

        const { assigned_to } = req.body;
        const { id } = req.params;

        try {
            const { rows } = await pool.query(
                'SELECT id, coloc_id, title FROM maintenance_tickets WHERE id = $1',
                [id],
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Ticket introuvable' });
            }

            const ticket = rows[0];

            if (req.user.coloc_id !== ticket.coloc_id) {
                return res.status(403).json({ error: 'Non autorisé — Ce ticket n\'appartient pas à votre colocation' });
            }

            const { rowCount } = await pool.query(
                'SELECT 1 FROM users WHERE id = $1 AND coloc_id = $2',
                [assigned_to, ticket.coloc_id],
            );

            if (rowCount === 0) {
                return res.status(400).json({ error: 'L\'utilisateur assigné n\'appartient pas à cette colocation' });
            }

            const { rows: updated } = await pool.query(
                'UPDATE maintenance_tickets SET assigned_to = $1, updated_at = now() WHERE id = $2 RETURNING *',
                [assigned_to, id],
            );

            await publisher.publish('sodalis_events', JSON.stringify({
                type: 'MAINTENANCE_TICKET_ASSIGNED',
                coloc_id: ticket.coloc_id,
                ticket_id: ticket.id,
                assigned_to,
                message: `Ticket "${ticket.title}" assigné à un membre de la colocation`,
            }));

            await publisher.del(`dashboard_coloc_${ticket.coloc_id}`);

            res.json(updated[0]);
        } catch (err) {
            next(err);
        }
    },
);

module.exports = router;
