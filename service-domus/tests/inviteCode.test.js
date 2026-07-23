const { generateInviteCode } = require('../utils/inviteCode');

describe('generateInviteCode', () => {
    it('normalise les accents et espaces en minuscules avec tirets', () => {
        const code = generateInviteCode("Château de l'Été");
        expect(code).toMatch(/^chateau-de-l-et-[0-9a-f]{4}$/);
    });

    it('retombe sur le préfixe "coloc" si le nom ne contient aucun caractère alphanumérique', () => {
        const code = generateInviteCode('!!! 🎉🎉🎉 !!!');
        expect(code).toMatch(/^coloc-[0-9a-f]{4}$/);
    });

    it('tronque le slug à 15 caractères avant le suffixe', () => {
        const code = generateInviteCode('Une Colocation Extremement Longue');
        const [slug] = code.split(/-[0-9a-f]{4}$/);
        expect(slug.length).toBeLessThanOrEqual(15);
    });

    it('ajoute un suffixe hexadécimal de 4 caractères', () => {
        const code = generateInviteCode('Chez nous');
        expect(code).toMatch(/-[0-9a-f]{4}$/);
    });

    it('génère des suffixes différents à chaque appel', () => {
        const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode('Chez nous')));
        expect(codes.size).toBeGreaterThan(1);
    });

    it('remplace les caractères non alphanumériques par des tirets simples', () => {
        const code = generateInviteCode('Foo___Bar   Baz');
        const [slug] = code.split(/-[0-9a-f]{4}$/);
        expect(slug).toBe('foo-bar-baz');
    });
});
