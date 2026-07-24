# Manuel de déploiement — Sodalis

## Résumé pour le dossier de certification

Ce manuel s'adresse à l'opérateur qui installe et exploite Sodalis sur un hôte Docker (poste local ou serveur), par opposition à `DEPLOYMENT.md` qui décrit les protocoles d'intégration et de livraison continues (CI/CD, GitHub Actions). Il couvre : prérequis, récupération des sources, variables d'environnement, démarrage en développement et en production depuis les images GHCR, vérification, dépannage, arrêt/nettoyage, et la justification des choix technologiques structurants (renvoi à `ARCHITECTURE.md`).

---

## 1. Prérequis

**Matériels** : un hôte capable de faire tourner 8 conteneurs simultanément (4 services applicatifs + 2 PostgreSQL + Redis + MongoDB) — 2 Go de RAM disponibles et 2 cœurs suffisent pour un usage de démonstration.

**Logiciels** :
- Docker Engine + Docker Compose (v2, commande `docker compose`, pas `docker-compose`).
- Git, pour cloner les deux dépôts (`sodalis-backend`, `sodalis-frontend`).
- Un client capable d'exécuter des requêtes GraphQL (Apollo Sandbox intégré en développement, ou tout client HTTP) pour la vérification post-démarrage.
- En production, un accès à GitHub Container Registry (aucune authentification requise en lecture une fois les packages rendus publics, cf. section 5).

## 2. Récupération des sources

```bash
git clone <url-du-dépôt-sodalis-backend>
git clone <url-du-dépôt-sodalis-frontend>
```

Les deux dépôts sont indépendants ; ce manuel couvre le backend. Le frontend se déploie séparément (build statique servi par le serveur web de votre choix, ou `npm run dev` en développement).

## 3. Variables d'environnement

Copier `.env.example` vers `.env` à la racine de `sodalis-backend` (lu par `docker-compose.yml`/`docker-compose.prod.yml`) :

```bash
cp .env.example .env
```

| Variable | Rôle | Exemple | Obligatoire |
|---|---|---|---|
| `JWT_SECRET` | Secret de signature des JWT, partagé par les 4 services (stratégie JWT distribuée, §9.6 de `ARCHITECTURE.md`) | Généré avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **Oui** — les 4 services refusent de démarrer sans lui |
| `POSTGRES_USER` | Utilisateur PostgreSQL partagé par les deux instances | `admin` | Oui |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL | À changer en production | Oui |
| `POSTGRES_DB` | Nom de la base par défaut (domus) | `domus_db` | Oui |
| `DOMUS_DB_PORT` | Port publié pour `domus-db` (dev uniquement) | `5432` | Non (dev) |
| `LABOR_DB_PORT` | Port publié pour `labor-db` (dev uniquement) | `5433` | Non (dev) |
| `REDIS_PORT` | Port publié pour Redis (dev uniquement) | `6379` | Non (dev) |
| `MONGO_PORT` | Port publié pour MongoDB (dev uniquement) | `27017` | Non (dev) |
| `CORS_ORIGINS` | Liste des origines autorisées (séparées par virgules), prioritaire sur `CORS_ORIGIN` | `http://localhost:3000,http://localhost:5173` | Oui (au moins une origine front) |
| `CORS_ORIGIN` | Origine de repli si `CORS_ORIGINS` est vide | `http://localhost:3000` | Non |
| `LOG_LEVEL` | Niveau de journalisation pino | `info` | Non (défaut `info`) |
| `SODALIS_VERSION` | Tag SemVer des images GHCR à tirer (production uniquement) | `v1.0.1` | Oui en production |
| `GHCR_OWNER` | Propriétaire/organisation GHCR des images (production uniquement) | `sodalis-org` | Oui en production |

Chaque service lit aussi son propre `.env` local en développement hors conteneur (`DATABASE_URL`, `GRPC_PORT`, `REDIS_URL`, `MONGO_URL`, `DOMUS_URL`/`LABOR_URL`, `PORT`) — voir les exemples commentés dans `.env.example`. En Docker Compose, ces valeurs sont déjà câblées entre services par leur nom de conteneur ; il n'y a rien à ajuster.

## 4. Génération des secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copier la sortie dans `JWT_SECRET`. Ne jamais committer le fichier `.env` réel (`.gitignore` l'exclut déjà) ; `gitleaks detect` (voir `SECURITY.md`) vérifie l'absence de secrets commités.

## 5. Démarrage en développement

```bash
docker compose up -d
```

Démarre les 8 conteneurs (4 services applicatifs construits localement depuis leur `Dockerfile`, + `domus-db`, `labor-db`, `redis`, `concordia-db`). Tous les ports, y compris ceux des bases de données, sont publiés sur `localhost` pour permettre l'inspection directe (client SQL, `redis-cli`, `mongosh`).

## 6. Démarrage en production (images GHCR)

```bash
GHCR_OWNER=<owner> SODALIS_VERSION=vX.Y.Z \
  docker compose -f docker-compose.prod.yml pull
GHCR_OWNER=<owner> SODALIS_VERSION=vX.Y.Z \
  docker compose -f docker-compose.prod.yml up -d
```

Les images sont tirées depuis `ghcr.io/<owner>/sodalis-<service>:<version>` plutôt que reconstruites localement. Seuls `api-gateway` (port 4000) et `service-concordia` (port 3003, pour le WebSocket) sont exposés sur l'hôte ; les ports des bases de données ne sont **pas** publiés (durcissement sécurité, vérifiable par `docker compose -f docker-compose.prod.yml ps`).

**Prérequis** : les packages GHCR doivent avoir été rendus publics au moins une fois par le mainteneur (procédure manuelle documentée dans `DEPLOYMENT.md`, section 4) — sinon `pull` échoue avec une erreur d'authentification.

## 7. Vérification du bon démarrage

```bash
docker compose -f docker-compose.prod.yml ps
```

Les 8 services (4 applicatifs + 4 infrastructure) doivent afficher `healthy`. Chaque service applicatif expose `/health`, interrogé par le `HEALTHCHECK` embarqué dans son image.

Vérification fonctionnelle minimale :
```bash
curl http://localhost:4000/health          # api-gateway
curl http://localhost:3003/health          # service-concordia
```

Le démarrage complet de la stack est attendu en moins de 60 secondes (`npm run startup:check`, seuil documenté dans `QUALITY.md`).

## 8. Dépannage des erreurs fréquentes

| Symptôme | Cause probable | Action |
|---|---|---|
| Un service refuse de démarrer avec `[FATAL] JWT_SECRET non défini` | `.env` absent ou `JWT_SECRET` vide | Vérifier que `.env` existe à la racine et contient `JWT_SECRET` |
| `npm ci` échoue pendant `docker compose build` | `package-lock.json` désynchronisé du `package.json` (cf. anomalie ANM-04 dans `PLAN_CORRECTION_BOGUES.md`) | Régénérer le lock file du service concerné (`npm install` puis commit), ou vérifier qu'on utilise bien une version taguée cohérente |
| `docker compose -f docker-compose.prod.yml pull` échoue avec une erreur d'accès | Packages GHCR encore privés (cf. anomalie ANM-06) | Le mainteneur doit rendre les packages publics une fois via l'UI GitHub (Packages → Package settings → Change visibility) |
| Le frontend ne peut pas atteindre le gateway | Origine absente de `CORS_ORIGINS` | Ajouter l'URL exacte du frontend (protocole + hôte + port) à `CORS_ORIGINS` et redémarrer `api-gateway` |
| Les notifications temps réel n'arrivent jamais | Connexion Socket.io refusée (cookie absent/invalide) ou `service-concordia` non exposé | Vérifier que le cookie `sodalis_token` est bien envoyé (`withCredentials`) et que le port 3003 est joignable |
| Un conteneur reste `unhealthy` | Base de données pas encore prête au moment du premier healthcheck | Attendre quelques secondes (healthchecks avec retries) ; si persistant, consulter `docker compose logs <service>` |

## 9. Arrêt et nettoyage

```bash
docker compose down          # arrêt, conserve les volumes de données
docker compose down -v       # arrêt + suppression des volumes (reset complet, base vierge)
```

Utiliser `down -v` avant toute recette fonctionnelle pour repartir d'un état vierge reproductible (voir `CAHIER_DE_RECETTES.md`, section 3).

## 10. Justification des choix

Ce manuel s'appuie sur les décisions d'architecture détaillées dans `ARCHITECTURE.md`, section 9 (« Choix stratégiques »). En résumé, appliqué à l'exploitation :

- **Pourquoi Docker Compose plutôt qu'un orchestrateur plus lourd (Kubernetes)** : la cible de déploiement assumée est un hôte unique auto-hébergé (voir `DEPLOYMENT.md`, décision d'architecture en tête de document) — Docker Compose suffit à décrire 8 services avec leurs dépendances et healthchecks, sans la complexité opérationnelle d'un cluster.
- **Pourquoi quatre microservices** : isolation des pannes et scalabilité indépendante — voir `ARCHITECTURE.md` §9.1. Pour l'opérateur, cela signifie qu'un redémarrage de `service-concordia` (notifications) n'interrompt pas l'authentification ni la création de tâches.
- **Pourquoi deux PostgreSQL distincts plutôt qu'une base partagée** : `ARCHITECTURE.md` §9.5 (Database-per-Service) — `domus-db` et `labor-db` évoluent indépendamment, aucun schéma partagé à coordonner lors d'une mise à jour.
- **Pourquoi MongoDB pour Concordia** : schéma de notification volontairement flexible (chaque type d'événement embarque des champs différents), détaillé en `ARCHITECTURE.md` §5 et §9.5.
- **Pourquoi Redis pour le cache et le pub/sub** : un seul composant sert deux besoins (cache `getColocDashboard`, TTL 30s, et bus d'événements `sodalis_events`) — `ARCHITECTURE.md` §9.4 et §9.7. Pour l'opérateur, cela signifie qu'un `redis` indisponible dégrade à la fois la performance du dashboard (cache miss systématique) et la livraison des notifications (fire-and-forget, pas de file persistante).
