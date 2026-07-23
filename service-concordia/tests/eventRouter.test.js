const { routeEvent } = require('../services/eventRouter');

describe('routeEvent', () => {
    let Notification;
    let io;
    let emit;
    const COLOC_ID = 'coloc-1';

    beforeEach(() => {
        Notification = { create: vi.fn().mockResolvedValue({}) };
        emit = vi.fn();
        io = { to: vi.fn(() => ({ emit })) };
    });

    it('NEW_TASK persiste la notification et emit sur la room de la coloc', async () => {
        const event = { type: 'NEW_TASK', coloc_id: COLOC_ID, message: 'Nouvelle tâche' };

        await routeEvent(event, { Notification, io });

        expect(Notification.create).toHaveBeenCalledWith({
            coloc_id: COLOC_ID,
            type: 'NEW_TASK',
            message: 'Nouvelle tâche',
        });
        expect(io.to).toHaveBeenCalledWith(`coloc_${COLOC_ID}`);
        expect(emit).toHaveBeenCalledWith('notification', {
            type: 'NEW_TASK',
            message: 'Nouvelle tâche',
        });
    });

    it('TASK_UPDATED inclut task_id et status dans le payload emit', async () => {
        const event = {
            type: 'TASK_UPDATED',
            coloc_id: COLOC_ID,
            task_id: 'task-1',
            status: 'DONE',
            message: 'Tâche mise à jour',
        };

        await routeEvent(event, { Notification, io });

        expect(io.to).toHaveBeenCalledWith(`coloc_${COLOC_ID}`);
        expect(emit).toHaveBeenCalledWith('notification', {
            type: 'TASK_UPDATED',
            message: 'Tâche mise à jour',
            task_id: 'task-1',
            status: 'DONE',
        });
    });

    it.each(['NEW_MAINTENANCE_TICKET', 'MAINTENANCE_TICKET_UPDATED', 'MAINTENANCE_TICKET_ASSIGNED'])(
        '%s emit avec ticket_id/priority/status/assigned_to sur la room de la coloc',
        async (type) => {
            const event = {
                type,
                coloc_id: COLOC_ID,
                ticket_id: 'ticket-1',
                priority: 'URGENT',
                status: 'OPEN',
                assigned_to: 'user-2',
                message: 'Ticket',
            };

            await routeEvent(event, { Notification, io });

            expect(io.to).toHaveBeenCalledWith(`coloc_${COLOC_ID}`);
            expect(emit).toHaveBeenCalledWith('notification', {
                type,
                message: 'Ticket',
                ticket_id: 'ticket-1',
                priority: 'URGENT',
                status: 'OPEN',
                assigned_to: 'user-2',
            });
        },
    );

    it.each(['NEW_COMPLAINT', 'COMPLAINT_RESOLVED', 'COMPLAINT_DELETED'])(
        '%s emit avec complaint_id sur la room de la coloc',
        async (type) => {
            const event = { type, coloc_id: COLOC_ID, complaint_id: 'c-1', message: 'Plainte' };

            await routeEvent(event, { Notification, io });

            expect(io.to).toHaveBeenCalledWith(`coloc_${COLOC_ID}`);
            expect(emit).toHaveBeenCalledWith('notification', {
                type,
                message: 'Plainte',
                complaint_id: 'c-1',
            });
        },
    );

    it("COMPLAINT_TARGETED emit sur la room de l'utilisateur ciblé, pas de la coloc", async () => {
        const event = {
            type: 'COMPLAINT_TARGETED',
            coloc_id: COLOC_ID,
            target_id: 'user-3',
            complaint_id: 'c-1',
            message: 'Vous êtes visé par une plainte',
        };

        await routeEvent(event, { Notification, io });

        expect(io.to).toHaveBeenCalledWith('user_user-3');
        expect(io.to).not.toHaveBeenCalledWith(expect.stringContaining('coloc_'));
        expect(emit).toHaveBeenCalledWith('notification', {
            type: 'COMPLAINT_TARGETED',
            message: 'Vous êtes visé par une plainte',
            complaint_id: 'c-1',
        });
    });

    it.each(['NEW_POLL', 'POLL_UPDATED'])(
        '%s emit avec poll_id/question sur la room de la coloc',
        async (type) => {
            const event = {
                type,
                coloc_id: COLOC_ID,
                poll_id: 'poll-1',
                question: 'Qui fait la vaisselle ?',
                message: 'Sondage',
            };

            await routeEvent(event, { Notification, io });

            expect(io.to).toHaveBeenCalledWith(`coloc_${COLOC_ID}`);
            expect(emit).toHaveBeenCalledWith('notification', {
                type,
                message: 'Sondage',
                poll_id: 'poll-1',
                question: 'Qui fait la vaisselle ?',
            });
        },
    );

    it('KARMA_UPDATED emit avec user_id et new_score', async () => {
        const event = {
            type: 'KARMA_UPDATED',
            coloc_id: COLOC_ID,
            user_id: 'user-1',
            new_score: 42,
            message: 'Karma mis à jour',
        };

        await routeEvent(event, { Notification, io });

        expect(io.to).toHaveBeenCalledWith(`coloc_${COLOC_ID}`);
        expect(emit).toHaveBeenCalledWith('notification', {
            type: 'KARMA_UPDATED',
            message: 'Karma mis à jour',
            user_id: 'user-1',
            new_score: 42,
        });
    });

    it("persiste la notification mais n'émet rien pour un type d'événement inconnu", async () => {
        const event = { type: 'UNKNOWN_EVENT', coloc_id: COLOC_ID, message: 'Inconnu' };

        await routeEvent(event, { Notification, io });

        expect(Notification.create).toHaveBeenCalled();
        expect(io.to).not.toHaveBeenCalled();
    });

    it("n'échoue pas si la persistance MongoDB échoue et emit quand même", async () => {
        Notification.create.mockRejectedValueOnce(new Error('Mongo down'));
        const event = { type: 'NEW_TASK', coloc_id: COLOC_ID, message: 'Nouvelle tâche' };

        await expect(routeEvent(event, { Notification, io })).resolves.not.toThrow();
        expect(emit).toHaveBeenCalled();
    });
});
