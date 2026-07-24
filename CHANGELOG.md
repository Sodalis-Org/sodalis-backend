# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et ce projet respecte le
[Semantic Versioning](https://semver.org/lang/fr/).

## Règle d'incrémentation retenue

- **MAJEUR** : rupture de compatibilité du contrat public (schéma GraphQL, contrat gRPC, format
  des événements Redis `sodalis_events`, variables d'environnement requises).
- **MINEUR** : nouvelle fonctionnalité rétrocompatible (nouveau service, nouvelle route/mutation,
  nouveau domaine métier).
- **CORRECTIF** : correction de bug, durcissement, documentation ou changement n'affectant pas le
  contrat public.

## [Non publié]

Chantier 4 (Sécurité) : couverture des dix catégories OWASP Top 10, voir `SECURITY.md`.

### Added

- Helmet sur les quatre services, avec une CSP restrictive en production sur `api-gateway`
  (permissive en développement pour l'Apollo Sandbox).
- Rate limiting global sur `/graphql` (api-gateway) et sur les routes REST de
  `service-concordia`, en plus du limiteur déjà présent sur `/auth`.
- Limite de profondeur (`graphql-depth-limit`, 10 niveaux) et de complexité
  (`graphql-query-complexity`, 1000) sur le schéma GraphQL ; introspection désactivée en
  production.
- Denylist Redis `revoked_jwt:<jti>` vérifiée par les quatre services, algorithme JWT épinglé
  explicitement en HS256.
- Migration du JWT vers un cookie `httpOnly`/`SameSite=Strict`/`Secure` sur `api-gateway`,
  avec une mutation `logout` qui alimente la denylist à partir du TTL restant du jeton.
- Query `me` pour réhydrater l'état d'authentification côté front depuis le cookie httpOnly
  après un rechargement de page.
- Authentification du handshake Socket.io et routage vers des rooms réelles par coloc et par
  utilisateur (le canal de notification n'était auparavant qu'une convention côté client).
- `.github/dependabot.yml` (écosystème npm par workspace + github-actions, hebdomadaire) et
  épinglage de toutes les actions GitHub sur leur SHA de commit.
- Identifiant de corrélation `x-request-id`, généré par la gateway si absent et propagé
  jusqu'aux trois services aval via les en-têtes et `pino-http`.
- Journalisation pino des échecs d'authentification, des refus d'accès (appartenance à une
  autre coloc, rôle ADMIN requis) et des dépassements de rate limit, sans jamais journaliser
  de mot de passe, de jeton ou de corps de requête d'authentification.
- `SECURITY.md` : tableau OWASP Top 10 à dix lignes (catégorie, risque, mesure, fichier, test)
  et section « Risques acceptés ».
- Tests de sécurité : en-têtes Helmet, journalisation des refus d'accès, 429 sur rate limit,
  403 sur `assignTicket` avec un rôle `MEMBER`, IDOR cross-coloc, longueur minimale de mot de
  passe, rejet d'une requête GraphQL trop profonde.

### Fixed

- IDOR sur `GET /colocs/:id/users` (service-domus) : la route n'effectuait aucune vérification
  d'appartenance à la coloc avant de renvoyer la liste des membres.
- Défense en profondeur manquante sur `assignTicket` (api-gateway) : le contrôle du rôle ADMIN
  n'existait que côté service-domus, pas au niveau de la gateway.
- Filtre non validé sur `GET /api/complaints` (service-concordia) : une clé répétée dans la
  query string pouvait être transmise sous forme de tableau au filtre Mongoose sans contrôle.
- `package-lock.json` de chaque service régénéré : ils avaient dérivé après l'ajout des
  nouvelles dépendances de sécurité, provoquant l'échec de `npm ci` dans les Dockerfiles.

### Changed

- `CLAUDE.md` mis à jour pour refléter le cookie httpOnly, la denylist Redis de révocation,
  la propagation de `x-request-id` et l'authentification du handshake Socket.io.

## [1.0.1] - 2026-07-23

### Changed

- Mise à jour de `CLAUDE.md` : les affirmations sur l'absence de runner de tests ne sont plus
  d'actualité (Vitest est configuré et exécuté en CI).
- Suppression du job Release qui tentait de rendre les packages GHCR publics via l'API
  (`GITHUB_TOKEN` org → 404) ; la visibilité publique reste une étape manuelle unique documentée
  dans `DEPLOYMENT.md`.

## [1.0.0] - 2026-07-23

Première version considérée prête pour un déploiement en production : pipeline CI/CD complet,
images Docker durcies, livraison versionnée et immuable sur GitHub Container Registry.

### Added

- Workflow de livraison (`release.yml`) : à chaque tag `v*.*.*`, build et publication des 4
  images sur `ghcr.io/<owner>/sodalis-<service>`, taguées par version et par SHA court (jamais
  `latest`), puis création d'une GitHub Release.
- Composition de production (`docker-compose.prod.yml`) : ports de bases de données non publiés,
  images tirées de GHCR plutôt que reconstruites, `restart: always`, `NODE_ENV=production`.
- `DEPLOYMENT.md` : protocoles d'intégration et de livraison continues, composants mobilisés,
  traçabilité image → commit → run CI.

### Changed

- CI restructurée en jobs distincts `quality`, `test`, `security`, `build` (`ci.yml`), au lieu
  d'un job unique.
- Les 4 Dockerfiles passent en multi-stage (`deps` / `runtime`), s'exécutent avec l'utilisateur
  non privilégié `node`, exposent un `HEALTHCHECK` sur `/health`, et épinglent l'image de base
  `node:22-alpine` par digest.
- `.dockerignore` étendu (tests, couverture, documentation, workflows).

## [0.4.0] - 2026-07-23

### Added

- Suite de tests unitaires étendue (gestion des invitations, état des tickets, routage des
  événements Concordia) et modularisation de la logique de service (chantier 2 — tests
  unitaires).

### Changed

- Refactorisation de l'API gateway et de la structure des services : configuration ESLint/
  Prettier, `QUALITY.md`, workflow de vérification de performance (chantier 1 — socle qualité).

## [0.3.0] - 2026-04-28

### Added

- Gestion du karma (incrément, remerciement d'utilisateur) publiée sur Redis.
- Documentation d'architecture (`ARCHITECTURE.md`, `APIDOCUMENTATION.md`) et diagramme dans le
  README.

## [0.2.0] - 2026-04-27

### Added

- Tickets de maintenance (GraphQL + Redis, déclenchement automatique d'une tâche Labor en
  priorité `URGENT`).
- Réclamations et sondages (`service-concordia`, GraphQL).

## [0.1.0] - 2026-04-27

### Added

- Version initiale des quatre microservices : `api-gateway` (GraphQL), `service-domus`
  (utilisateurs, colocations, auth), `service-labor` (tâches, gRPC vers domus), `service-concordia`
  (notifications, Socket.io). Infrastructure Docker Compose (PostgreSQL ×2, MongoDB, Redis).
