# Déploiement — sodalis-backend

Ce document décrit les environnements du projet Sodalis, les composants qui les font fonctionner,
et les protocoles d'intégration et de livraison continues qui relient un commit à une version
exécutée en production. Il est le pendant narratif des workflows GitHub Actions présents dans
`.github/workflows/` : ceux-ci en sont la preuve technique, ce document en est l'exposé.

**Décision d'architecture assumée** : Sodalis ne vise aucun hébergement public de type PaaS
(Render, Vercel, Fly.io...). La cible de déploiement est un hôte Docker auto-hébergé (poste local
ou serveur), choisi pour deux raisons : garder la maîtrise complète de l'infrastructure (bases de
données, réseau, secrets) et démontrer une chaîne de livraison versionnée et traçable — ce que
masquerait un déploiement automatique par un PaaS. La contrepartie est que la promotion vers la
cible est une procédure documentée (section 4), pas un simple `git push`.

---

## 1. Environnements

| Environnement | Finalité | Accès | Ce qui y tourne |
|---|---|---|---|
| **Développement** | Travail quotidien sur le poste du développeur | `docker compose up -d` en local, ports publiés sur `localhost` | Les 4 services applicatifs + `domus-db`/`labor-db` (PostgreSQL 17), `redis` (Redis 7), `concordia-db` (MongoDB 7), tous définis dans [docker-compose.yml](docker-compose.yml). Les ports de bases de données (5432, 5433, 6379, 27017) sont publiés pour permettre l'inspection directe (client SQL, `redis-cli`, `mongosh`) depuis le poste. |
| **Intégration** | Vérification automatique de chaque évolution | Runners hébergés par GitHub (`ubuntu-latest`), déclenchés par `push`/`pull_request` | Les jobs de [`.github/workflows/ci.yml`](.github/workflows/ci.yml) : lint, tests avec couverture, audit de dépendances, scan de secrets, build des images Docker. Aucune base de données réelle n'est démarrée : la suite de tests mocke systématiquement `pg`, Redis et gRPC (voir section 3). |
| **Cible de déploiement** | Exécution en conditions réelles | Hôte Docker auto-hébergé (poste local ou serveur), accessible via les ports publiés par [docker-compose.prod.yml](docker-compose.prod.yml) | Les mêmes 4 services applicatifs, mais démarrés depuis des images versionnées tirées de GHCR plutôt que reconstruites, avec uniquement `api-gateway` (4000) et `service-concordia` (3003) exposés sur l'hôte. |

---

## 2. Composants mobilisés

- **Node.js 22** — moteur d'exécution des quatre microservices (CommonJS, aucune transpilation).
- **Express** — serveur d'application HTTP/REST des quatre services, et point d'entrée GraphQL
  (Apollo Server) de `api-gateway`.
- **Vite** — outil de build du frontend (`sodalis-frontend`, dépôt séparé).
- **Docker / Docker Compose** — runtime de conteneurs pour le développement
  ([docker-compose.yml](docker-compose.yml)) et la production
  ([docker-compose.prod.yml](docker-compose.prod.yml)).
- **Git et GitHub** — gestion de sources ; deux dépôts indépendants (`sodalis-backend`,
  `sodalis-frontend`).
- **GitHub Actions** — orchestrateur d'intégration continue ([`ci.yml`](.github/workflows/ci.yml))
  et de livraison continue ([`release.yml`](.github/workflows/release.yml)).
- **GitHub Container Registry (GHCR)** — registre d'artefacts recevant les images Docker
  versionnées et immuables publiées par `release.yml`.

---

## 3. Protocole d'intégration continue

Déclenché par tout `push` (toutes branches) et par toute `pull_request` vers `main`
([`ci.yml`](.github/workflows/ci.yml)) :

1. **Déclenchement** — GitHub Actions programme les jobs `quality`, `test`, `security` en
   parallèle, puis `build` une fois `quality` et `test` terminés avec succès.
2. **Installation** — chaque job effectue un `actions/checkout@v4` puis `npm ci` (jamais
   `npm install`, pour garantir une installation reproductible depuis `package-lock.json`).
3. **Lint** (job `quality`, **bloquant**) — `npm run lint` (ESLint, flat config +
   `eslint-plugin-n`) sur les 4 workspaces. `npm run format:check` (Prettier) est également lancé
   mais **non bloquant** (`continue-on-error: true`) : c'est un signal, pas un gate.
4. **Tests et couverture** (job `test`, **bloquant**) — `npm run test:coverage` (Vitest,
   provider v8) sur les 4 workspaces, seuil 60% lignes par service. Aucun service `postgres`/
   `redis`/`mongo` n'est démarré : les 17 fichiers de test mockent systématiquement les modules
   d'accès à l'infrastructure (`pg`, `redis-publisher`, `redis-subscriber`, clients gRPC) via un
   helper `mockRequire` maison. Le rapport de couverture est publié en artefact
   (`coverage-backend`).
5. **Audit de sécurité** (job `security`, **bloquant**) — `npm run audit` (`npm audit
   --audit-level=high`, 0 vulnérabilité haute/critique tolérée) puis le binaire CLI `gitleaks
   detect` (MIT) pour détecter tout secret commité par erreur. On n'utilise pas
   `gitleaks/gitleaks-action@v2` : cette Action exige une licence `GITLEAKS_LICENSE` dès que le
   dépôt appartient à une organisation GitHub (ici `Sodalis-Org`), alors que le CLI reste libre.
6. **Build des images** (job `build`, **bloquant**, dépend de `quality` et `test`) —
   `docker compose build` construit les 4 Dockerfiles multi-stage. Ce job ne pousse rien : il
   valide seulement que les images se construisent, avec des valeurs `JWT_SECRET`/
   `POSTGRES_PASSWORD` de type placeholder (jamais utilisées ailleurs).

Ce qui **bloque le merge** (une fois la protection de branche activée, section 5) : `lint`,
`test:coverage`, `audit`, `build`. Ce qui **ne bloque pas** : `format:check`.

---

## 4. Protocole de livraison continue

Déclenché par le push d'un tag `v*.*.*` ([`release.yml`](.github/workflows/release.yml)) :

1. **Merge sur `main`** — une fois la pull request validée par les checks de la section 3.
2. **Tag SemVer** — `git tag -a vX.Y.Z <commit> && git push origin vX.Y.Z` (règle
   d'incrémentation documentée dans [CHANGELOG.md](CHANGELOG.md)).
3. **Construction et publication** — le job `build-and-push` (matrice sur les 4 services)
   construit chaque image via `docker/build-push-action@v6` et la pousse sur
   `ghcr.io/<owner>/sodalis-<service>` avec trois tags : la version SemVer sans `v` (`X.Y.Z`),
   le tag Git brut (`vX.Y.Z`), et le SHA court du commit. Le tag `latest` n'est jamais utilisé —
   l'immuabilité des versions livrées est le point démontré. Un job suivant expose les packages
   GHCR en **public** (sinon le premier publish org les laisse privés et le `docker pull` exige
   un PAT).
4. **Création de la GitHub Release** — le job `github-release` extrait la section correspondante
   de `CHANGELOG.md` et crée la Release GitHub associée au tag.
5. **Récupération sur l'hôte cible** :
   ```bash
   GHCR_OWNER=<owner> SODALIS_VERSION=vX.Y.Z \
     docker compose -f docker-compose.prod.yml pull
   ```
6. **Démarrage** :
   ```bash
   GHCR_OWNER=<owner> SODALIS_VERSION=vX.Y.Z \
     docker compose -f docker-compose.prod.yml up -d
   ```
7. **Vérification des healthchecks** — `docker compose -f docker-compose.prod.yml ps` : les 4
   services applicatifs et les 4 services d'infrastructure doivent afficher `healthy` (chaque
   service applicatif expose `/health`, interrogé par le `HEALTHCHECK` embarqué dans son image).
8. **Retour arrière** — en cas d'anomalie, redéployer la version précédente en changeant
   uniquement `SODALIS_VERSION` :
   ```bash
   GHCR_OWNER=<owner> SODALIS_VERSION=<version_precedente> \
     docker compose -f docker-compose.prod.yml pull && \
     docker compose -f docker-compose.prod.yml up -d
   ```
   Aucune reconstruction n'est nécessaire : l'image précédente existe déjà, immuable, sur GHCR.

---

## 5. Critères de qualité et de performance

Reprise du tableau de [QUALITY.md](QUALITY.md), avec le job CI qui vérifie chaque critère :

| Critère | Seuil | Vérifié par |
|---|---|---|
| Couverture de tests | ≥ 60% lignes par service | Job `test` (`npm run test:coverage`) |
| Erreurs de lint | 0 | Job `quality` (`npm run lint`) |
| Vulnérabilités des dépendances | 0 high/critical | Job `security` (`npm run audit`) |
| Secrets commités | 0 | Job `security` (`gitleaks detect` CLI) |
| Construction des images | doit réussir | Job `build` (`docker compose build`) |
| P95 `getColocDashboard` (GraphQL) | < 200 ms | `npm run perf:check` (workflow manuel `perf.yml`, hors CI systématique — trop coûteux sur chaque push) |
| Démarrage de la stack complète | < 60 s | `npm run startup:check` (healthchecks Docker Compose) |

---

## 6. Traçabilité

Depuis une image en production jusqu'au commit et au run CI qui l'ont produite :

1. Le tag de l'image (`vX.Y.Z-<sha court>` via `docker/metadata-action@v5`, ou le tag `vX.Y.Z`
   seul) identifie directement le commit source : `git show <sha>` retrouve le commit exact.
2. Le tag Git `vX.Y.Z` correspondant existe dans l'historique du dépôt (`git tag -n99`) et pointe
   sur ce même commit.
3. Le run GitHub Actions qui a construit et publié l'image est listé dans l'onglet **Actions** du
   dépôt, filtré sur le workflow `Release` et le tag poussé — il référence le SHA du commit
   déclencheur.
4. La page **Packages** du dépôt (GHCR) liste, pour chaque image, l'historique de ses tags avec la
   date de publication, permettant de recouper avec le run CI correspondant.

<!-- CAPTURE : liste des packages GHCR (ghcr.io/<owner>/sodalis-*) -->

---

## 7. Protection de branche

Étape manuelle — l'agent ne peut pas la réaliser, elle doit être appliquée par l'utilisateur :

1. Sur GitHub, ouvrir le dépôt → **Settings** → **Branches**.
2. **Add branch protection rule** → pattern `main`.
3. Cocher **Require a pull request before merging**.
4. Cocher **Require status checks to pass before merging**, puis sélectionner les checks
   `quality`, `test`, `security`, `build` (et `lighthouse` côté frontend une fois rendu bloquant,
   cf. tâche 5.5 du chantier 5).
5. Cocher **Do not allow bypassing the above settings** pour interdire le push direct, y compris
   aux administrateurs.
6. **Save changes**.

<!-- CAPTURE : règle de protection de branche configurée sur main -->

---

## Captures à insérer

<!-- CAPTURE : run de CI vert (jobs quality/test/security/build) sur GitHub Actions -->
<!-- CAPTURE : docker compose -f docker-compose.prod.yml ps montrant les services "healthy" -->
