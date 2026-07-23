const { computeHarmonyPoints } = require('../utils/scoring');

describe('computeHarmonyPoints', () => {
    it('attribue 10 points si la tâche est rendue avant la date limite', () => {
        const now = new Date('2026-01-10T12:00:00Z');
        const dueAt = '2026-01-11T00:00:00Z';
        expect(computeHarmonyPoints(dueAt, now)).toEqual({ is_on_time: true, points: 10 });
    });

    it('attribue 2 points si la tâche est rendue après la date limite', () => {
        const now = new Date('2026-01-12T00:00:00Z');
        const dueAt = '2026-01-11T00:00:00Z';
        expect(computeHarmonyPoints(dueAt, now)).toEqual({ is_on_time: false, points: 2 });
    });

    it('attribue 2 points et is_on_time=false si aucune due_at n\'est définie', () => {
        expect(computeHarmonyPoints(null)).toEqual({ is_on_time: false, points: 2 });
        expect(computeHarmonyPoints(undefined)).toEqual({ is_on_time: false, points: 2 });
    });

    it('considère un rendu exactement à la date limite comme à temps', () => {
        const now = new Date('2026-01-11T00:00:00Z');
        const dueAt = '2026-01-11T00:00:00Z';
        expect(computeHarmonyPoints(dueAt, now)).toEqual({ is_on_time: true, points: 10 });
    });
});
