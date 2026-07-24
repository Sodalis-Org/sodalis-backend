# Manuel de mise à jour — Sodalis

## Résumé pour le dossier de certification

Ce manuel décrit comment faire évoluer une instance Sodalis déjà déployée vers une nouvelle version : détection de version disponible, procédure de montée de version depuis les images GHCR, sauvegarde préalable, gestion des évolutions de schéma (aucun outil de migration automatisé n'existe dans ce projet — voir section 5), vérification post-mise à jour, procédure de retour arrière, et mise à jour des dépendances.

---

## 1. Politique de versionnement

Sodalis suit [Semantic Versioning](https://semver.org/lang/fr/) (SemVer), documenté dans `CHANGELOG.md` :

- **MAJEUR** : rupture de compatibilité du contrat public (schéma GraphQL, contrat gRPC, format des événements Redis `sodalis_events`, variables d'environnement requises).
- **MINEUR** : nouvelle fonctionnalité rétrocompatible.
- **CORRECTIF** : correction de bug, durcissement, documentation, sans impact sur le contrat public.

Chaque version publiée est accompagnée d'une section datée dans `CHANGELOG.md` — c'est la première chose à lire avant toute montée de version, pour identifier un changement MAJEUR qui exigerait une action particulière (variable d'environnement supplémentaire, migration de données).

## 2. Comment savoir qu'une nouvelle version est disponible

- **Tags Git** : `git fetch --tags && git tag -l 'v*' --sort=-v:refname | head -5` sur `sodalis-backend` liste les versions publiées, la plus récente en premier.
- **GitHub Releases** : chaque tag `vX.Y.Z` génère automatiquement une Release GitHub reprenant la section correspondante du `CHANGELOG.md` (voir `DEPLOYMENT.md`, section 4).
- **Packages GHCR** : la page **Packages** du dépôt liste, pour chaque image (`sodalis-api-gateway`, `sodalis-service-domus`, `sodalis-service-labor`, `sodalis-service-concordia`), l'historique des tags publiés.

## 3. Procédure de montée de version

```bash
# 1. Identifier la version cible (ex. v1.1.0) et lire son CHANGELOG
git -C sodalis-backend fetch --tags
git -C sodalis-backend show v1.1.0:CHANGELOG.md | less

# 2. Sauvegarder les données (section 4, avant toute action)

# 3. Tirer les nouvelles images
GHCR_OWNER=<owner> SODALIS_VERSION=v1.1.0 \
  docker compose -f docker-compose.prod.yml pull

# 4. Appliquer les évolutions de schéma si le CHANGELOG en signale (section 5)

# 5. Redémarrer avec la nouvelle version
GHCR_OWNER=<owner> SODALIS_VERSION=v1.1.0 \
  docker compose -f docker-compose.prod.yml up -d

# 6. Vérifier (section 6)
```

Aucune reconstruction locale n'est nécessaire : les images sont déjà construites et publiées sur GHCR par le pipeline de livraison (`release.yml`), taguées par version SemVer et par SHA court, jamais `latest`.

## 4. Sauvegarde préalable des volumes de données

Sodalis persiste ses données dans 4 volumes Docker nommés (`domus_data`, `labor_data`, `concordia_data`, plus le volume Redis implicite — Redis n'est ici qu'un cache/bus, pas une source de vérité, donc sa perte n'est pas critique).

```bash
# PostgreSQL — domus
docker exec <conteneur_domus-db> pg_dump -U "$POSTGRES_USER" domus_db > backup_domus_$(date +%Y%m%d).sql

# PostgreSQL — labor
docker exec <conteneur_labor-db> pg_dump -U "$POSTGRES_USER" labor_db > backup_labor_$(date +%Y%m%d).sql

# MongoDB — concordia
docker exec <conteneur_concordia-db> mongodump --archive > backup_concordia_$(date +%Y%m%d).archive
```

Conserver ces trois fichiers hors du conteneur (l'hôte ou un stockage externe) avant de poursuivre.

## 5. Évolutions de schéma

**Il n'existe pas d'outil de migration automatisé dans ce projet.** Chaque service PostgreSQL initialise son schéma via des scripts SQL numérotés dans son dossier `db-init/` (ex. `service-domus/db-init/01-init.sql`, `02-harmony-score.sql`, `02-maintenance-tickets.sql`), exécutés par l'image officielle `postgres` **uniquement au tout premier démarrage d'un volume vide** (convention `docker-entrypoint-initdb.d`). Sur une instance déjà initialisée, ces scripts ne se rejouent **pas** automatiquement.

Procédure manuelle à suivre si le `CHANGELOG.md` de la version cible mentionne une évolution de schéma (nouvelle colonne, nouvelle table) :

1. Identifier le(s) nouveau(x) fichier(s) SQL ajoutés dans `db-init/` entre l'ancienne et la nouvelle version (`git diff <ancien_tag> <nouveau_tag> -- '*/db-init/'`).
2. Après la sauvegarde (section 4), appliquer manuellement ce fichier sur la base déjà en service :
   ```bash
   docker exec -i <conteneur_domus-db> psql -U "$POSTGRES_USER" -d domus_db < service-domus/db-init/02-nouveau-fichier.sql
   ```
3. Vérifier que la commande s'exécute sans erreur (une colonne déjà existante ferait échouer un `ALTER TABLE ADD COLUMN` sans clause `IF NOT EXISTS` — adapter au besoin avant application, ou vérifier que le script cible en est déjà pourvu).

MongoDB (`concordia-db`) est schemaless (Mongoose applique la validation applicative, pas de migration de schéma nécessaire côté base).

## 6. Vérification post-mise à jour

```bash
docker compose -f docker-compose.prod.yml ps
```

Les 8 services doivent repasser `healthy`. Puis rejouer un sous-ensemble représentatif du `CAHIER_DE_RECETTES.md` — au minimum : connexion (RF-AUTH-05), consultation du tableau de bord (RF-GW-01), et tout scénario lié à une fonctionnalité modifiée par la version (voir le `CHANGELOG.md` de la version cible).

## 7. Procédure de retour arrière

Aucune reconstruction n'est nécessaire : l'image de la version précédente existe déjà, immuable, sur GHCR.

```bash
GHCR_OWNER=<owner> SODALIS_VERSION=<version_précédente> \
  docker compose -f docker-compose.prod.yml pull
GHCR_OWNER=<owner> SODALIS_VERSION=<version_précédente> \
  docker compose -f docker-compose.prod.yml up -d
```

**Si une évolution de schéma a été appliquée** (section 5) et qu'elle n'est pas rétrocompatible (ex. colonne `NOT NULL` sans défaut), le retour arrière applicatif seul ne suffit pas : restaurer aussi la sauvegarde de la section 4 (`psql < backup_domus_*.sql` / `mongorestore --archive=backup_concordia_*.archive`) avant de redémarrer sur l'ancienne version.

## 8. Mise à jour des dépendances

- **Dependabot** (`.github/dependabot.yml`) ouvre automatiquement des pull requests hebdomadaires pour chaque écosystème `npm` (racine + 4 workspaces) et pour les actions GitHub — ces PR passent par la même CI que tout changement (lint, tests, audit, build).
- **Audit ponctuel** : `npm run audit` (racine, tous workspaces) doit rester à 0 vulnérabilité haute ou critique — c'est un job bloquant en CI (`security`), donc toute dépendance vulnérable introduite est détectée avant merge, pas seulement lors d'un audit manuel a posteriori.

## 9. Fréquence recommandée

- **Correctifs de sécurité** (Dependabot, alertes `npm audit`) : appliqués dès qu'une pull request Dependabot passe la CI, sans attendre un cycle de version planifié.
- **Montées de version mineure/correctif** : au fil de l'eau, dès publication, en suivant la procédure de la section 3 — le risque est faible (pas de rupture de contrat par définition).
- **Montées de version majeure** : planifiées, avec relecture du `CHANGELOG.md` et un passage complet (ou au moins ciblé) du `CAHIER_DE_RECETTES.md` avant et après, en raison du risque de rupture de compatibilité.

## 10. Justification des choix

Ce manuel s'appuie sur les décisions documentées dans `ARCHITECTURE.md`, section 9. Le versionnement SemVer strict et l'immuabilité des images GHCR (jamais `latest`, cf. `DEPLOYMENT.md` section 4 et `SECURITY.md` A08) sont ce qui rend le retour arrière de la section 7 possible sans reconstruction : chaque version déployée reste disponible indéfiniment sur le registre, identifiable par son tag exact.
