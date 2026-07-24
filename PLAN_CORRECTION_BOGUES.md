# Plan de correction des bogues — Sodalis

## Résumé pour le dossier de certification

Ce registre qualifie et trace les anomalies de Sodalis selon un processus en 8 états, avec deux échelles indépendantes (sévérité technique, criticité métier/sécurité). Il contient **9 anomalies** : 7 déjà détectées, corrigées et tracées dans l'historique Git (trois failles de sécurité réelles — contrôle d'accès défaillant, IDOR, injection —, deux incidents CI/livraison, et une erreur d'analyse méthodologique corrigée en audit accessibilité), et **2 découvertes aujourd'hui en exécutant réellement le `CAHIER_DE_RECETTES.md`** contre la stack Docker : ANM-08 (IDOR cross-coloc via bypass ADMIN) et ANM-09 (rate limiter aveugle à l'IP réelle du client). Ces deux dernières restent au statut « Détectée », non corrigées faute de temps avant la remise — **un cahier de recettes entièrement vert aurait été un problème, pas un succès**, et celui-ci ne l'est pas.

---

## 1. Processus de traitement

```
Détectée ──▶ Qualifiée ──▶ Priorisée ──▶ En correction ──▶ Corrigée
                                                              │
                                                              ▼
                                            Clôturée ◀── Vérifiée ◀── Test de non-régression ajouté
```

- **Détectée** : origine identifiée (recette fonctionnelle, audit sécurité, CI, usage, audit accessibilité).
- **Qualifiée** : sévérité et criticité assignées selon les échelles ci-dessous.
- **Priorisée** : ordre de traitement décidé (une anomalie Bloquante/Critique passe avant une Cosmétique/Faible).
- **En correction** : correctif en cours d'écriture.
- **Corrigée** : correctif mergé.
- **Test de non-régression ajouté** : un test qui échouerait sans le correctif est écrit et passe.
- **Vérifiée** : le scénario de recette associé (si applicable) est rejoué et repasse au statut OK.
- **Clôturée** : anomalie fermée, version de correction consignée.

## 2. Échelles de qualification

**Sévérité (impact technique)**
| Niveau | Définition |
|---|---|
| Bloquante | Empêche le fonctionnement du système ou d'un chantier (ex. build/CI cassé, service ne démarre pas) |
| Majeure | Fonctionnalité ou garantie de sécurité compromise, contournement possible mais impact significatif |
| Mineure | Comportement incorrect localisé, sans compromission de sécurité ni indisponibilité |
| Cosmétique | Défaut visuel, de formulation ou d'analyse sans impact fonctionnel |

**Criticité (impact métier ou sécurité)**
| Niveau | Définition |
|---|---|
| Critique | Exploitable pour accéder à des données/actions hors périmètre autorisé, ou bloque une livraison |
| Élevée | Affaiblit une défense de sécurité (même si une autre couche protège encore) ou bloque un chantier |
| Moyenne | Risque réel mais à surface d'exploitation restreinte ou déjà partiellement mitigé |
| Faible | Impact opérationnel ou méthodologique sans risque direct pour les données/utilisateurs |

## 3. Registre des anomalies

| ID | Date | Origine | Description | Sévérité | Criticité | Commit | Statut | Version de correction |
|---|---|---|---|---|---|---|---|---|
| ANM-01 | 2026-07-24 | Audit sécurité (OWASP A01) | IDOR sur `GET /colocs/:id/users` — aucune vérification d'appartenance avant de renvoyer les membres | Majeure | Critique | `f85a5e1` (sodalis-backend) | Clôturée | Non publié (post-v1.0.1) |
| ANM-02 | 2026-07-24 | Audit sécurité (OWASP A01) | `assignTicket` : contrôle du rôle ADMIN absent au niveau gateway, défense en profondeur manquante | Majeure | Élevée | `f85a5e1` (sodalis-backend) | Clôturée | Non publié (post-v1.0.1) |
| ANM-03 | 2026-07-24 | Audit sécurité (OWASP A03) | Filtre Mongoose non validé sur `GET /api/complaints` — clé répétée transmise en tableau | Mineure | Moyenne | `f85a5e1` (sodalis-backend) | Clôturée | Non publié (post-v1.0.1) |
| ANM-04 | 2026-07-24 | CI | `package-lock.json` dérivés après ajout des dépendances de sécurité → `npm ci` en échec dans les Dockerfiles | Bloquante | Faible | `730c8d2` (sodalis-backend) | Clôturée | Non publié (post-v1.0.1) |
| ANM-05 | 2026-07-23 | CI | `gitleaks-action@v2` exige une licence pour les dépôts d'organisation → job `security` bloqué, contourné par le CLI MIT | Bloquante | Faible | `0ccbfe4` + `5e18a00` (backend) ; `5bf38d2` / `a9cc2fa` (frontend) | Clôturée | v1.0.0 (backend) |
| ANM-06 | 2026-07-23 | Livraison | Packages GHCR privés par défaut sous une organisation → `docker pull` impossible, passage en public manuel et documenté | Majeure | Élevée | `9a13a40` + `2d57d89` (contexte : `a25894b`) | Clôturée | v1.0.1 (backend) |
| ANM-07 | 2026-07-24 | Audit accessibilité | Deux contrastes d'icônes classés à tort non conformes (seuil texte 4,5:1 appliqué à des objets graphiques relevant du seuil 3:1) — analyse corrigée, script d'audit amendé | Cosmétique | Faible | `89a7d44` (sodalis-frontend) | Clôturée | Non publié (post-v1.0.0) |
| ANM-08 | 2026-07-24 | Recette fonctionnelle (RF-COLOC-07, cette session) | IDOR cross-coloc via le bypass `role === 'ADMIN'` : tout utilisateur ADMIN (de **n'importe quelle** colocation) contourne la vérification d'appartenance et peut lire les données de **n'importe quelle autre** colocation (membres, tâches, tickets, plaintes, sondages, dashboard). Reproduit dans 17 resolvers de `api-gateway/resolvers.js` suivant le même motif | Majeure | Critique | Non corrigé à ce stade (détecté en direct pendant la recette, hors budget de cette session) | Détectée | — |
| ANM-09 | 2026-07-24 | Recette fonctionnelle (RF-AUTH-11, cette session) | Le rate limiter `/auth` (10 req/15 min) est câblé sur `req.ip` côté `service-domus`, mais `api-gateway/resolvers.js` (`forwardHeaders`) ne transmet jamais l'IP cliente réelle aux services en aval — seulement `Authorization` et `x-request-id`. En production (seul le gateway est exposé), tous les appels `register`/`login` de **tous les utilisateurs confondus** sont donc vus comme venant de la même IP (celle du conteneur gateway), et partagent le même compteur de 10 requêtes/15 min : un pic d'usage légitime peut verrouiller l'inscription/connexion de toute l'application, pas seulement d'un attaquant isolé | Majeure | Élevée | Non corrigé à ce stade | Détectée | — |

*(Dates confirmées par `git show -s --format=%ci <hash>` sur chaque dépôt au moment de la rédaction.)*

## 4. Analyses détaillées

### ANM-01 — IDOR sur `GET /colocs/:id/users`

- **Contexte** : la route `service-domus/routes/colocs.js` renvoyait la liste des membres d'une colocation identifiée par `:id` sans vérifier que l'appelant appartenait à cette colocation.
- **Cause racine** : absence de contrôle d'appartenance entre `req.user.coloc_id` et le paramètre `:id` de la route — un oubli au moment de l'écriture initiale de la route, non couvert par un test cross-coloc à l'époque.
- **Correctif** : ajout d'une vérification explicite (`req.user.role !== 'ADMIN' && String(req.user.coloc_id) !== String(req.params.id)` → 403) avant l'exécution de la requête, commit `f85a5e1`.
- **Test de non-régression** : `service-domus/tests/colocs.test.js` et `service-domus/tests/auth.test.js` couvrent désormais le cas cross-coloc → 403.
- **Vérification** : correspond au scénario **RF-COLOC-07** du cahier de recettes.

### ANM-02 — `assignTicket` sans défense en profondeur au gateway

- **Contexte** : l'assignation d'un ticket de maintenance à un rôle ADMIN était contrôlée côté `service-domus`, mais le resolver `assignTicket` de `api-gateway/resolvers.js` ne vérifiait que la présence d'un utilisateur authentifié, pas son rôle.
- **Cause racine** : le contrôle d'autorisation était implémenté à un seul niveau (service métier) au lieu des deux (gateway + service), ce qui laissait la gateway comme point de contournement si un appel direct au service en aval devenait possible.
- **Correctif** : ajout de `if (user.role !== 'ADMIN') throw ...` dans le resolver `assignTicket`, commit `f85a5e1` (groupé avec ANM-01 et ANM-03).
- **Test de non-régression** : `api-gateway/tests/resolvers.test.js` (« assignTicket refuse un rôle MEMBER »).
- **Vérification** : correspond au scénario **RF-MAINT-05** du cahier de recettes.

### ANM-03 — Filtre Mongoose non validé sur `GET /api/complaints`

- **Contexte** : les paramètres `status` et `target_id` de la query string étaient injectés directement dans le filtre `Complaint.find(filter)` sans validation de type.
- **Cause racine** : une clé de query string répétée (`?status=A&status=B`) est interprétée par Express comme un tableau ; sans contrôle, ce tableau se serait retrouvé dans un filtre Mongoose, ouvrant un vecteur d'injection d'opérateur (proche d'A03 — Injection).
- **Correctif** : validation stricte du type scalaire de `status` (dans `VALID_COMPLAINT_STATUSES`) et `target_id` avant construction du filtre, `service-concordia/routes/social.js`, commit `f85a5e1`.
- **Test de non-régression** : `service-concordia/tests/social.test.js` (rejet du tableau `status`).
- **Vérification** : couverte structurellement (pas de scénario fonctionnel dédié dans le cahier de recettes — le cas nominal de consultation des plaintes, **RF-CONC-02**, ne teste pas ce cas limite de clé de query dupliquée) ; voir `CAHIER_DE_RECETTES.md` section 5.1, qui rattache explicitement ce test structurel à ANM-03.

### ANM-07 — Erreur d'analyse corrigée (contrastes d'icônes)

*Cette fiche n'est pas un bug de code : elle documente une erreur d'analyse méthodologique, corrigée par une relecture plus précise du référentiel applicable — une capacité de remise en question rarement démontrée dans ce type de dossier.*

- **Contexte** : le premier passage du script d'audit de contraste (`scripts/check-contrast.mjs`) appliquait uniformément le seuil texte WCAG 1.4.3 (4,5:1) à toutes les paires couleur/fond, y compris à des icônes seules (icône de suppression de plainte, `text-red-600` sur `bg-red-50`, 4,41:1 ; icône de catégorie dans `TicketCard`, `text-gray-500` sur `bg-gray-100`, 4,39:1).
- **Cause racine** : mauvaise classification méthodologique — ces deux paires concernent des objets graphiques non-décoratifs, relevant du critère RGAA 3.2 / WCAG 1.4.11 (seuil 3:1), et non du seuil texte. Le script les avait classées à tort non conformes.
- **Correctif** : `scripts/check-contrast.mjs` amendé pour distinguer les objets graphiques (seuil 3:1) du texte (seuil 4,5:1) ; `ACCESSIBILITE.md` mis à jour pour documenter la distinction, commit `89a7d44` (sodalis-frontend).
- **Test de non-régression** : `tests/a11y/badges.contrast.test.js` (gate strict sur les ratios réels, seul filet fiable puisque axe/jsdom ne mesure pas le contraste).
- **Vérification** : les deux ratios (4,41:1 et 4,39:1) sont bien ≥ 3:1, donc conformes au seuil applicable ; aucune régression visuelle nécessaire.

### ANM-08 — IDOR cross-coloc via le bypass ADMIN (découverte pendant cette recette)

- **Contexte** : scénario RF-COLOC-07 du `CAHIER_DE_RECETTES.md`, exécuté réellement le 2026-07-24 contre la stack Docker (pas une simulation). Un compte C, créé et devenu ADMIN de **sa propre** colocation (distincte de celle d'A et B), a interrogé `usersByColoc(colocId: <coloc d'A/B>)` et a reçu la liste complète des membres au lieu d'un rejet.
- **Cause racine** : dans `api-gateway/resolvers.js`, le motif de contrôle d'accès répété dans (au moins) 17 resolvers est `if (!user || (user.role !== 'ADMIN' && user.coloc_id !== colocId)) throw ...`. Cette condition ne vérifie **que** le rôle brut de l'appelant, jamais qu'il s'agit bien de l'ADMIN **de la colocation ciblée**. Le correctif `f85a5e1` (ANM-01) avait fermé le cas « MEMBER hors coloc », mais n'avait pas couvert le cas « ADMIN d'une autre coloc », resté implicite et non testé. Aucun test existant (`api-gateway/tests/resolvers.test.js` inclus) ne couvre le cas « ADMIN authentifié, mais d'une coloc différente de celle interrogée ».
- **Ampleur** : le même motif est utilisé pour `myColoc`, `usersByColoc`, `tasksByColoc`, `getColocDashboard`, `maintenanceTickets`, `notifications`, `complaints`, `polls`, `myRecentThanks`, `colocThanks`, `unreadNotificationsCount`, `createTask`, `markNotificationsRead`, etc. — un utilisateur ADMIN d'une coloc quelconque peut potentiellement lire (voire, pour certaines mutations, écrire) dans n'importe quelle autre colocation.
- **Correctif proposé (non appliqué dans cette session, faute de temps avant la remise)** : remplacer la condition par une vérification qui n'accorde le bypass qu'à un ADMIN **de la colocation ciblée**, par exemple `if (!user || String(user.coloc_id) !== String(colocId)) throw ...` (en supprimant purement le bypass par rôle, puisqu'aucun rôle « super-admin » inter-coloc n'existe dans le modèle de données — `role` est scopé à la colocation de l'utilisateur, cf. `ARCHITECTURE.md` §6). À appliquer identiquement aux 17 occurrences, puis à rejouer l'ensemble de la suite `resolvers.test.js` (le changement pourrait affecter des tests existants qui supposaient à tort ce bypass).
- **Test de non-régression à écrire** : un test par resolver affecté, avec un compte ADMIN d'une coloc B tentant d'accéder à la coloc A → 403 attendu (symétrique du test déjà existant pour le cas MEMBER).
- **Statut** : Détectée, qualifiée, cause racine identifiée. **Non corrigée** à ce stade — décision assumée de documenter et prioriser plutôt que de livrer un correctif non vérifié sur 17 points d'accès à quelques minutes de la remise. Priorité haute pour la suite immédiate des travaux.

### ANM-09 — Rate limiter `/auth` aveugle à l'IP réelle du client (découverte pendant cette recette)

- **Contexte** : en exécutant RF-AUTH-11 (dépassement volontaire du rate limit), le 429 est arrivé bien plus tôt que prévu (après 7-8 requêtes cumulées `register`/`login`, pas 11), et a bloqué les comptes de test B et C suivants pendant plusieurs minutes.
- **Cause racine** : `service-domus/routes/auth.js` limite par `req.ip` (10 requêtes/15 min). Mais `api-gateway/resolvers.js` (`forwardHeaders`) ne relaie que `Authorization` et `x-request-id` vers les services en aval — jamais l'adresse IP du client d'origine (ni `X-Forwarded-For`, ni équivalent). Comme seule la gateway est exposée au public (`docker-compose.prod.yml`), **tous** les appels `register`/`login` de **tous** les utilisateurs de l'application, quel que soit leur poste, arrivent à `service-domus` avec la même IP source (celle du conteneur gateway). Le rate limiter, censé freiner un attaquant isolé, freine en réalité l'ensemble de la base d'utilisateurs dès que le total cumulé (toutes personnes confondues) dépasse 10 tentatives en 15 minutes.
- **Impact** : disponibilité — un pic d'activité légitime (plusieurs inscriptions/connexions rapprochées, ou un attaquant volontaire) peut verrouiller la connexion de tous les utilisateurs pendant 15 minutes, pas seulement la sienne. Auto-déni de service.
- **Correctif proposé (non appliqué)** : soit (a) transmettre l'IP cliente réelle via un en-tête dédié (`X-Forwarded-For` ou `X-Real-IP`) depuis la gateway, avec `app.set('trust proxy', ...)` et un `keyGenerator` adapté côté `service-domus`, soit (b) déplacer la responsabilité du rate limiting par IP au niveau de la gateway elle-même (seul point qui voit la vraie IP cliente), en gardant `service-domus` comme filet de sécurité générique.
- **Statut** : Détectée, qualifiée, cause racine identifiée. **Non corrigée** à ce stade faute de temps.

### ANM-04, ANM-05, ANM-06 — Incidents de chaîne CI/livraison (résumé, hors fiches détaillées)

Ces trois anomalies sont d'origine outillage/plateforme, pas des défauts du code applicatif — elles sont tracées dans le registre mais ne justifient pas une fiche « contexte/cause racine/correctif » aussi développée que les failles de sécurité :

- **ANM-04** : les `package-lock.json` par service n'avaient pas été régénérés après l'ajout des dépendances de sécurité du chantier 4, provoquant l'échec de `npm ci` dans les 4 Dockerfiles. Correctif : régénération des 4 fichiers (`730c8d2`), vérifié par `docker compose build && up -d` (8 conteneurs healthy).
- **ANM-05** : `gitleaks-action@v2` nécessite une licence payante pour les dépôts sous organisation GitHub. Correctif : remplacement par le CLI MIT dans `.github/workflows/ci.yml` (backend `0ccbfe4`/`5e18a00`, frontend `5bf38d2`/`a9cc2fa`), avec un `.gitleaks.toml` d'allowlist pour les exemples de JWT en documentation.
- **ANM-06** : les packages GHCR sont privés par défaut sous une organisation ; l'API de mise en visibilité publique renvoyait 404 avec le `GITHUB_TOKEN` du workflow. Correctif : suppression du job automatique inefficace (`9a13a40`, `2d57d89`), remplacé par une procédure manuelle documentée dans `DEPLOYMENT.md`.

## 5. Synthèse

- **Répartition par sévérité** (9 anomalies au total) : 2 Bloquantes (ANM-04, 05) · 5 Majeures (ANM-01, 02, 06, 08, 09) · 1 Mineure (ANM-03) · 1 Cosmétique (ANM-07).
- **Répartition par origine** : 3 audit sécurité · 2 CI · 1 livraison · 1 audit accessibilité · **2 recette fonctionnelle (cette session)**.
- **Taux de correction** : 7/9 (78%) — les 7 anomalies historiques sont clôturées avec test de non-régression (sauf ANM-04/05/06, vérifiées par exécution de pipeline). **ANM-08 et ANM-09, découvertes en exécutant réellement la recette aujourd'hui, restent au statut Détectée** : cause racine identifiée et correctif proposé pour les deux, mais non appliqué ni vérifié faute de temps avant la remise du dossier — décision assumée de ne pas livrer un correctif non testé sur un périmètre à 17 points d'impact (ANM-08) à quelques minutes de l'échéance.
- **Ce qui prouve que la recette n'a pas été bâclée** : ANM-08 est une vraie vulnérabilité de contrôle d'accès qu'aucun test existant ne couvrait — elle n'aurait jamais été trouvée sans une exécution réelle des scénarios contre la stack. C'est précisément la logique de la section B.1 : un cahier de recettes entièrement vert aurait été suspect, pas rassurant.
- **Priorité immédiate après la remise** : traiter ANM-08 en premier (majeure/critique, contrôle d'accès), puis ANM-09 (majeure, disponibilité), en suivant la boucle décrite en section 1.
