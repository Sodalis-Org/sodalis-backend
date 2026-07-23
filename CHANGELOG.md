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

### Changed

- Mise à jour de `CLAUDE.md` : les affirmations sur l'absence de runner de tests ne sont plus
  d'actualité (Vitest est configuré et exécuté en CI).

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
