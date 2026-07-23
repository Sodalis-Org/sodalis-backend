// Mesure le P95 de la requête GraphQL getColocDashboard contre la stack docker-compose
// démarrée en local. Nécessite : docker-compose up -d --build (voir README / testing_guide.md).

const autocannon = require('autocannon');

const DOMUS_URL = process.env.DOMUS_URL || 'http://localhost:3001';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';
const P95_THRESHOLD_MS = Number(process.env.PERF_P95_THRESHOLD_MS || 200);

const TEST_EMAIL = 'perf-check@sodalis.test';
const TEST_PASSWORD = 'perf-check-password-123';

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
}

async function ensureTestUser() {
    const register = await fetchJson(`${DOMUS_URL}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Perf Check', email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (register.status !== 201 && register.status !== 409) {
        throw new Error(
            `Échec de la création de l'utilisateur de test : ${JSON.stringify(register.body)}`,
        );
    }

    const login = await fetchJson(`${DOMUS_URL}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (login.status !== 200) {
        throw new Error(
            `Échec de connexion de l'utilisateur de test : ${JSON.stringify(login.body)}`,
        );
    }

    return login.body;
}

async function ensureColoc(token, existingColocId) {
    if (existingColocId) return existingColocId;

    const res = await fetchJson(`${DOMUS_URL}/colocs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Perf Check Coloc' }),
    });

    if (res.status !== 201) {
        throw new Error(
            `Échec de la création de la colocation de test : ${JSON.stringify(res.body)}`,
        );
    }

    return res.body.coloc.id;
}

async function main() {
    console.log(`Préparation des données de test contre ${DOMUS_URL}...`);
    const { token, user } = await ensureTestUser();
    const colocId = await ensureColoc(token, user.coloc_id);

    console.log(`Charge sur ${GATEWAY_URL}/graphql (getColocDashboard, colocId=${colocId})...`);

    const result = await autocannon({
        url: `${GATEWAY_URL}/graphql`,
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            query: 'query($id: ID!) { getColocDashboard(colocId: $id) { open_complaints } }',
            variables: { id: colocId },
        }),
        connections: 10,
        duration: 10,
    });

    const p95 = result.latency.p97_5 ?? result.latency.p99;
    console.log(
        `P95 (approx.) : ${result.latency.p97_5} ms — moyenne : ${result.latency.average} ms`,
    );
    console.log(autocannon.printResult(result));

    if (result.errors > 0 || result.non2xx > 0) {
        console.error(`Échec : ${result.errors} erreurs, ${result.non2xx} réponses non-2xx`);
        process.exit(1);
    }

    if (result.latency.p97_5 >= P95_THRESHOLD_MS) {
        console.error(`Échec : P95 (${p95} ms) >= seuil (${P95_THRESHOLD_MS} ms)`);
        process.exit(1);
    }

    console.log(`OK — P95 (${p95} ms) < seuil (${P95_THRESHOLD_MS} ms)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
