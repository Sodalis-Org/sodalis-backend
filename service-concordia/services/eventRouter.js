const MAINTENANCE_EVENTS = [
    'NEW_MAINTENANCE_TICKET',
    'MAINTENANCE_TICKET_UPDATED',
    'MAINTENANCE_TICKET_ASSIGNED',
];

const COMPLAINT_EVENTS = ['NEW_COMPLAINT', 'COMPLAINT_RESOLVED', 'COMPLAINT_DELETED'];

const POLL_EVENTS = ['NEW_POLL', 'POLL_UPDATED'];

async function routeEvent(event, { Notification, io, logger }) {
    logger?.info?.({ type: event.type, coloc_id: event.coloc_id }, 'Événement reçu');

    try {
        await Notification.create({
            coloc_id: event.coloc_id,
            type: event.type,
            message: event.message,
        });
    } catch (err) {
        logger?.error?.({ err }, 'Erreur persistence notification');
    }

    if (event.type === 'NEW_TASK' || event.type === 'TASK_UPDATED') {
        io.to(`coloc_${event.coloc_id}`).emit('notification', {
            type: event.type,
            message: event.message,
            ...(event.task_id && { task_id: event.task_id }),
            ...(event.status && { status: event.status }),
        });
    }

    if (MAINTENANCE_EVENTS.includes(event.type)) {
        io.to(`coloc_${event.coloc_id}`).emit('notification', {
            type: event.type,
            message: event.message,
            ...(event.ticket_id && { ticket_id: event.ticket_id }),
            ...(event.priority && { priority: event.priority }),
            ...(event.status && { status: event.status }),
            ...(event.assigned_to && { assigned_to: event.assigned_to }),
        });
    }

    if (COMPLAINT_EVENTS.includes(event.type)) {
        io.to(`coloc_${event.coloc_id}`).emit('notification', {
            type: event.type,
            message: event.message,
            ...(event.complaint_id && { complaint_id: event.complaint_id }),
        });
    }

    if (event.type === 'COMPLAINT_TARGETED') {
        io.to(`user_${event.target_id}`).emit('notification', {
            type: event.type,
            message: event.message,
            ...(event.complaint_id && { complaint_id: event.complaint_id }),
        });
    }

    if (POLL_EVENTS.includes(event.type)) {
        io.to(`coloc_${event.coloc_id}`).emit('notification', {
            type: event.type,
            message: event.message,
            ...(event.poll_id && { poll_id: event.poll_id }),
            ...(event.question && { question: event.question }),
        });
    }

    if (event.type === 'KARMA_UPDATED') {
        io.to(`coloc_${event.coloc_id}`).emit('notification', {
            type: event.type,
            message: event.message,
            user_id: event.user_id,
            new_score: event.new_score,
        });
    }
}

module.exports = { routeEvent, MAINTENANCE_EVENTS, COMPLAINT_EVENTS, POLL_EVENTS };
