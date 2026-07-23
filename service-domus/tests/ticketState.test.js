const { canTransition, STATUS_TRANSITIONS } = require('../utils/ticketState');

describe('canTransition', () => {
    it('autorise OPEN → IN_PROGRESS', () => {
        expect(canTransition('OPEN', 'IN_PROGRESS')).toBe(true);
    });

    it('autorise OPEN → CANCELLED', () => {
        expect(canTransition('OPEN', 'CANCELLED')).toBe(true);
    });

    it('autorise IN_PROGRESS → RESOLVED', () => {
        expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    });

    it('autorise IN_PROGRESS → CANCELLED', () => {
        expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(true);
    });

    it('refuse OPEN → RESOLVED (saut direct)', () => {
        expect(canTransition('OPEN', 'RESOLVED')).toBe(false);
    });

    it('refuse RESOLVED → IN_PROGRESS (état terminal)', () => {
        expect(canTransition('RESOLVED', 'IN_PROGRESS')).toBe(false);
    });

    it('refuse CANCELLED → OPEN (état terminal)', () => {
        expect(canTransition('CANCELLED', 'OPEN')).toBe(false);
    });

    it('autorise une transition vers le même statut (no-op idempotent)', () => {
        expect(canTransition('IN_PROGRESS', 'IN_PROGRESS')).toBe(true);
        expect(canTransition('RESOLVED', 'RESOLVED')).toBe(true);
    });

    it("n'expose aucune transition sortante pour les états terminaux", () => {
        expect(STATUS_TRANSITIONS.RESOLVED).toEqual([]);
        expect(STATUS_TRANSITIONS.CANCELLED).toEqual([]);
    });
});
