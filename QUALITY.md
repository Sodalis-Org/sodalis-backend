# Critères de qualité et de performance — sodalis-backend

Ce document liste les seuils chiffrés retenus pour ce backend, les outils qui les mesurent, et la commande exacte pour les vérifier. Tous les seuils sont pilotables depuis la racine du repo via les workspaces npm.

| Critère | Seuil | Outil | Commande |
|---|---|---|---|
| Couverture de tests | ≥ 60% lignes | Vitest coverage (provider v8) | `npm run test:coverage` |
| Erreurs de lint | 0 | ESLint (flat config, `eslint-plugin-n`) | `npm run lint` |
| Vulnérabilités des dépendances | 0 high/critical | `npm audit` | `npm run audit` |
| P95 `getColocDashboard` (GraphQL) | < 200 ms | autocannon | `npm run perf:check` |
| Démarrage de la stack complète | < 60 s | Healthchecks Docker Compose | `npm run startup:check` |

## Détails et prérequis

### Couverture de tests (≥ 60% lignes)

Chaque service (`api-gateway`, `service-domus`, `service-labor`, `service-concordia`) a son propre `vitest.config.js` avec un seuil de couverture sur les lignes fixé à 60% (`coverage.thresholds.lines`). La commande échoue si un service passe en dessous.

La stratégie de test est **unitaire avec mocks** : les dépendances d'infrastructure (PostgreSQL via `pg`, Redis, MongoDB via `mongoose`, gRPC) sont remplacées par des doublons de test — aucune base de données ni service externe n'est nécessaire pour lancer les tests. Le périmètre couvert par service (`coverage.include` dans chaque `vitest.config.js`) se limite volontairement à la logique applicative testable en isolation : assemblage Express (`app.js`), routes, middlewares, et services métier purs. Le bootstrap d'infrastructure (`index.js`, `db.js`, `grpc-*.js`, `redis-*.js`) est exclu — il ne contient pas de logique métier et nécessiterait des tests d'intégration contre de vrais services pour avoir de la valeur.

État actuel (lignes) : api-gateway 93.9%, service-domus 92.3%, service-labor 87.3%, service-concordia 88.9%.

### Erreurs de lint (0)

`eslint.config.js` à la racine (flat config ESLint 10) s'applique à tous les services : `@eslint/js` recommended + `eslint-plugin-n` (adapté CommonJS/Node) + `eslint-config-prettier` pour éviter les conflits avec Prettier. `npm run lint` doit rendre 0 erreur avant tout merge.

`.prettierrc` définit le style de formatage (4 espaces, guillemets simples, point-virgules). `npm run format:check` / `npm run format` sont disponibles mais ne bloquent pas la CI — seul ESLint est un gate dur.

### Vulnérabilités des dépendances (0 high/critical)

`npm run audit` exécute `npm audit --audit-level=high` sur les 4 workspaces + la racine. Les vulnérabilités `moderate` et en dessous sont tolérées (documentées si présentes) ; toute vulnérabilité `high` ou `critical` doit être corrigée avant merge (`npm audit fix`, ou mise à jour manuelle si un correctif nécessite un breaking change).

### P95 `getColocDashboard` < 200 ms

Mesuré par `scripts/perf-check.js` (autocannon) contre l'endpoint GraphQL de l'API Gateway. **Nécessite la stack complète démarrée** (`docker-compose up -d --build`) car ce test traverse réellement Gateway → Domus/Labor/Concordia → Postgres/Mongo/Redis. Le script s'authentifie via `service-domus`, crée/réutilise une colocation de test, puis charge `getColocDashboard` en continu pendant une courte fenêtre et échoue si le P95 dépasse 200 ms.

Ce check n'est pas exécuté sur chaque push (trop coûteux) — voir le workflow `perf.yml` en déclenchement manuel.

### Démarrage de la stack complète < 60 s

`scripts/startup-check.sh` relance la stack (`docker-compose down -v && docker-compose up -d --build`) et poll l'état de santé Docker de chaque conteneur (`docker inspect --format='{{.State.Health.Status}}'`) jusqu'à ce que tous soient `healthy`, en mesurant le temps écoulé. Les healthchecks sont déjà définis dans [docker-compose.yml](docker-compose.yml) pour les 6 services (2x Postgres, Redis, MongoDB, et les 4 services applicatifs via `/health`).

## Hors périmètre de ce document

Les critères Lighthouse (performance ≥ 90, accessibilité ≥ 95 via `eslint-plugin-jsx-a11y` + Lighthouse CI) concernent le frontend (`sodalis-frontend`), un repo séparé non présent ici.
