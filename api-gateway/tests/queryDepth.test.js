const { buildSchema, parse, validate, specifiedRules } = require('graphql');
const depthLimit = require('graphql-depth-limit');

// Le schéma applicatif réel (schema.js) est plat : aucun type récursif, profondeur
// maximale ~4 niveaux (voir app.js). Impossible d'y construire organiquement une
// requête dépassant la limite de profondeur (10) pour la tester en conditions réelles.
// Ce test vérifie donc directement la règle telle qu'elle est câblée dans app.js
// (validationRules: [depthLimit(10)]), sur un schéma récursif dédié.
const MAX_QUERY_DEPTH = 10;

const testSchema = buildSchema(`
    type Node {
        id: ID!
        child: Node
    }

    type Query {
        root: Node
    }
`);

function nestedQuery(depth) {
    let inner = 'id';
    for (let i = 0; i < depth; i++) inner = `child { ${inner} }`;
    return `{ root { ${inner} } }`;
}

describe('graphql-depth-limit (configuration utilisée par api-gateway/app.js)', () => {
    it('accepte une requête dans la limite', () => {
        const document = parse(nestedQuery(MAX_QUERY_DEPTH - 5));
        const errors = validate(testSchema, document, [
            ...specifiedRules,
            depthLimit(MAX_QUERY_DEPTH),
        ]);
        expect(errors).toHaveLength(0);
    });

    it('rejette une requête trop profonde', () => {
        const document = parse(nestedQuery(MAX_QUERY_DEPTH + 5));
        const errors = validate(testSchema, document, [
            ...specifiedRules,
            depthLimit(MAX_QUERY_DEPTH),
        ]);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toMatch(/exceeds maximum operation depth/);
    });
});
