# Cahier de recettes — Sodalis

## Résumé pour le dossier de certification

Ce cahier de recettes couvre l'ensemble du périmètre fonctionnel de Sodalis (authentification, colocation, maintenance, tâches, social, agrégation gateway, interface) selon trois familles de tests exigées : **fonctionnels** (exécution manuelle guidée, 69 scénarios nominal + erreur), **structurels** (boîte blanche, 17 fichiers Vitest backend + suite de tests frontend, seuils de couverture bloquants en CI) et **sécurité** (automatisés + 7 vérifications manuelles non automatisables). Le plan de test ci-dessous a été rédigé avant toute exécution. Les colonnes « Résultat obtenu » ne sont remplies qu'après exécution réelle sur une stack démarrée — voir `PLAN_CORRECTION_BOGUES.md` pour le traitement des anomalies qui en résulteront.

---

## 1. Objet et périmètre

Sodalis est une application de gestion de colocation composée de 4 microservices Node.js/Express (`api-gateway` GraphQL, `service-domus` REST+gRPC, `service-labor` REST+gRPC, `service-concordia` REST+Socket.io) et d'un frontend React/Vite. Ce document couvre :

- Les fonctionnalités exposées par le schéma GraphQL de `api-gateway` (point d'entrée unique du client) et, en complément, les routes REST internes des services quand elles ne sont pas simplement proxyfiées.
- Les cinq pages réelles du frontend (Dashboard, Chores, Concordia, Profile, Onboarding) et leurs mécanismes transverses (protection de route, notifications temps réel, accessibilité clavier).
- Les trois familles de test : fonctionnel, structurel, sécurité.

**Hors périmètre** (et pourquoi) : tests de charge/performance (couverts séparément par `scripts/perf-check.js` et le seuil P95 documenté dans `QUALITY.md`, pas un critère de ce cahier) ; tests de compatibilité multi-navigateurs (un seul environnement de recette, Chromium, est utilisé) ; tests d'intrusion approfondis au-delà des 7 vérifications manuelles de la section 6 (l'analyse OWASP complète fait l'objet de `SECURITY.md`, document séparé et déjà validé).

---

## 2. Plan de test (rédigé avant exécution)

| Famille | Méthode | Environnement | Critère de réussite |
|---|---|---|---|
| **Structurel** (boîte blanche) | Suites Vitest existantes, une par service + frontend, exécutées via `npm run test:coverage` | CI (GitHub Actions, job `test`) et poste local | 100% des fichiers de test passent ; couverture ligne ≥ 60% par service/domaine frontend (seuil bloquant) |
| **Sécurité** | Automatisée (helmet, rate-limit, RBAC, IDOR, longueur de mot de passe, profondeur GraphQL) + 7 vérifications manuelles non automatisables (section 6.2) | CI pour l'automatisé ; stack Docker locale pour le manuel | Aucune régression sur les tests automatisés ; les 7 vérifications manuelles confirment l'attendu |
| **Fonctionnel** | Exécution manuelle scénario par scénario sur une stack Docker démarrée depuis une base vierge | `docker compose up --build` sur un tag figé, jeu de données créé pendant la recette | Chaque scénario atteint le statut OK, ou KO avec une entrée créée dans `PLAN_CORRECTION_BOGUES.md` — aucun scénario ne reste « Bloqué » sans explication |

Ce plan est rédigé le 2026-07-24, antérieurement à toute exécution des scénarios fonctionnels et sécurité manuels ci-dessous (colonnes « Résultat obtenu » vides à ce stade).

---

## 3. Environnement de recette

- **Version testée** : à figer par l'exécutant avant de commencer (tag Git précis des deux dépôts, ex. backend `v1.0.1-23-g037dc0c` / frontend `v1.0.0-26-g0768eb8` au moment de la rédaction — re-tagger si de nouveaux commits sont intervenus).
- **Démarrage** : `docker compose down -v && docker compose up --build` depuis `sodalis-backend/` (base vierge, cf. section 5 de la spec de phase). Frontend démarré séparément (`npm run dev` ou build servi).
- **Jeu de données initial** : aucun (base vierge). Les comptes de test sont créés pendant la recette elle-même (au minimum 2 comptes, une colocation partagée, pour couvrir les scénarios à deux acteurs — escalade, notifications ciblées, votes).
- **Comptes de test** (à compléter par l'exécutant avec les identifiants réellement utilisés — ne pas préremplir de mot de passe fictif) :

| Rôle | Email | Coloc | Remarque |
|---|---|---|---|
| Compte A (créateur, ADMIN) | À REMPLIR APRÈS EXÉCUTION | — | — |
| Compte B (rejoint via code, MEMBER) | À REMPLIR APRÈS EXÉCUTION | — | — |

---

## 4. Tests fonctionnels

Convention : chaque scénario est identifié `RF-<domaine>-<n>`. Sauf mention contraire, les mutations/queries s'exécutent via le point d'entrée GraphQL du gateway (`POST http://localhost:4000/graphql`), qui est le seul chemin réellement exposé côté client (en production, seuls `api-gateway:4000` et `service-concordia:3003` sont publiés — cf. `docker-compose.prod.yml`).

### 4.1 Authentification et compte (Domus, via gateway)

| ID | Fonctionnalité | Préconditions | Étapes | Résultat attendu | Résultat obtenu | Statut | Anomalie |
|---|---|---|---|---|---|---|---|
| RF-AUTH-01 | Inscription nominale | Aucun compte avec l'email utilisé | `mutation { register(name:"...", email:"...", password:"...") { id name email role } }` | 201, `RegisterPayload` renvoyé, `role` = `MEMBER` | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-02 | Email déjà utilisé | Un compte existe déjà avec cet email | Rejouer `register` avec le même email | Erreur GraphQL portant le code 409 (« Cet email est déjà utilisé ») | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-03 | Mot de passe trop court | — | `register` avec `password` < 8 caractères | Erreur 400, « Mot de passe : 8 caractères minimum » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-04 | Email invalide | — | `register` avec `email:"pas-un-email"` | Erreur 400, « Email invalide » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-05 | Connexion nominale | Compte existant | `mutation { login(email:"...", password:"...") { user { id name email role coloc_id } } }` | 200, cookie `sodalis_token` posé dans la réponse, `AuthPayload.user` renvoyé | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-06 | Mot de passe erroné | Compte existant | `login` avec mauvais mot de passe | Erreur 401, « Email ou mot de passe incorrect » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-07 | Email inconnu | — | `login` avec un email jamais enregistré | Erreur 401, même message (pas de fuite d'information sur l'existence du compte) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-08 | Pose du cookie httpOnly | Après `login`, `createColoc`, `joinColoc` ou `me` (renouvellement) | Inspecter les en-têtes `Set-Cookie` de la réponse | Cookie `sodalis_token` présent ; attributs détaillés vérifiés en RS-01 | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-09 | Réhydratation par `me` après rechargement | Session active (cookie posé) | Recharger la page frontend, observer l'appel `query { me { id name email role coloc_id harmony_score } } ` | L'utilisateur reste connecté, ses informations s'affichent sans nouvelle saisie | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-10 | Déconnexion → denylist → réutilisation refusée | Session active | `mutation { logout }`, puis rejouer une requête authentifiée avec l'ancien cookie capturé avant déconnexion | `logout` renvoie `true` et efface le cookie ; la requête rejouée avec l'ancien jeton est rejetée (jeton dans `revoked_jwt:<jti>`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-AUTH-11 | Dépassement du rate limit `/auth` | — | Effectuer 11 tentatives de `login` ou `register` en moins de 15 minutes depuis la même IP | La 11e requête renvoie 429, « Trop de tentatives — réessayez dans 15 minutes » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |

### 4.2 Colocation (Domus, via gateway)

| ID | Fonctionnalité | Préconditions | Étapes | Résultat attendu | Résultat obtenu | Statut | Anomalie |
|---|---|---|---|---|---|---|---|
| RF-COLOC-01 | Création de colocation | Compte A sans coloc | `mutation { createColoc(name:"...") { coloc { id name invite_code } } }` | 201, compte A devient `ADMIN`, `invite_code` généré et visible | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-02 | Création alors que déjà en coloc | Compte A déjà membre d'une coloc | Rejouer `createColoc` | Erreur 409, « Vous êtes déjà dans une colocation » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-03 | Adhésion par code (nominal) | Compte B sans coloc, code valide connu | `mutation { joinColoc(invite_code:"...") { coloc { id name } } }` | 200, compte B rejoint la coloc en tant que `MEMBER` | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-04 | Code inconnu | — | `joinColoc` avec un code inexistant | Erreur 404, « Code d'invitation invalide » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-05 | Adhésion alors que déjà en coloc | Compte B déjà membre d'une coloc | Rejouer `joinColoc` | Erreur 409, « Vous êtes déjà dans une colocation » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-06 | Consultation des membres | Compte A et B dans la même coloc | `query { usersByColoc(colocId:"...") { id name role karma_score } }` | 200, liste des deux membres avec leur rôle et karma agrégé depuis Concordia | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-07 | Consultation depuis une autre coloc | Compte C, ADMIN d'une coloc différente | `usersByColoc(colocId: <id de la coloc A/B>)` avec le jeton du compte C | Erreur 403 (vérifie le correctif IDOR ANM-01) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-08 | Régénération du code d'invitation | Compte A, ADMIN | `mutation { regenerateInviteCode { coloc { invite_code } } }` | 200, nouveau code différent de l'ancien ; l'ancien code n'est plus valide pour `joinColoc` | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-09 | Expulsion d'un membre (kick) | Compte A ADMIN, compte B membre | `mutation { kickMember(userId:"<id B>") { ok } }` | 200, B n'a plus de `coloc_id` ; expulsion par un non-ADMIN → 403 ; expulsion du dernier ADMIN restant → 400 | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-10 | Transfert d'administration | Compte A ADMIN, compte B membre | `mutation { transferAdmin(userId:"<id B>") { ok } }` | 200, B devient ADMIN, A redevient MEMBER (nouveau cookie posé) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-COLOC-11 | Quitter la colocation | Compte membre dans une coloc | `mutation { leaveColoc { ok } }` | 200, `coloc_id` remis à `null` ; si l'utilisateur était le dernier ADMIN, promotion automatique du membre le plus ancien | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |

### 4.3 Tickets de maintenance (Domus, via gateway)

| ID | Fonctionnalité | Préconditions | Étapes | Résultat attendu | Résultat obtenu | Statut | Anomalie |
|---|---|---|---|---|---|---|---|
| RF-MAINT-01 | Création nominale | Compte membre d'une coloc | `mutation { createMaintenanceTicket(title:"...", category:"PLUMBING", priority:"MEDIUM", coloc_id:"...") { id status } }` | 201, `status` = `OPEN` | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-MAINT-02 | Catégorie invalide | — | `createMaintenanceTicket` avec `category:"INVALID"` | Erreur 400 listant les catégories valides | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-MAINT-03 | `coloc_id` différent du jeton | Compte membre d'une coloc X | `createMaintenanceTicket` avec `coloc_id` d'une coloc Y | Erreur 403 | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-MAINT-04 | Assignation par un ADMIN | Ticket existant, compte A ADMIN | `mutation { assignTicket(id:"...", assigned_to:"<id membre>") { assigned_to } }` | 200, ticket assigné | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-MAINT-05 | Assignation par un MEMBER | Compte B, rôle MEMBER | Rejouer `assignTicket` avec le jeton de B | Erreur 403, « Réservé aux ADMINs » (vérifie le correctif de défense en profondeur ANM-02, contrôlé au gateway avant même l'appel à Domus) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-MAINT-06 | Transitions de statut valides | Ticket `OPEN` | `mutation { updateTicketStatus(id:"...", status:"IN_PROGRESS") { status } }` puis vers `RESOLVED` | 200 à chaque étape, statut mis à jour | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-MAINT-07 | Transition invalide refusée | Ticket `CANCELLED` (état terminal) | `updateTicketStatus(id:"...", status:"IN_PROGRESS")` | Erreur 409, « Transition de statut invalide » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-MAINT-08 | Escalade automatique URGENT → tâche Labor (inter-services) | Compte membre d'une coloc avec au moins un autre membre | `createMaintenanceTicket(..., priority:"URGENT", coloc_id:"...")` puis `query { tasksByColoc(colocId:"...") { title assignee_id } }` | Le ticket est créé ; un appel gRPC `CreateTask` déclenche la création automatique d'une tâche Labor titrée `Urgence : <titre>`, visible dans `tasksByColoc` | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |

### 4.4 Tâches (Labor, via gateway)

| ID | Fonctionnalité | Préconditions | Étapes | Résultat attendu | Résultat obtenu | Statut | Anomalie |
|---|---|---|---|---|---|---|---|
| RF-LABOR-01 | Création nominale | Compte membre, cible assignée membre de la même coloc | `mutation { createTask(title:"...", assignee_id:"...", coloc_id:"...") { id status } }` | 201, `status` = `TODO`, appel gRPC `VerifyUser` validé | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-LABOR-02 | Assignation à un utilisateur hors coloc | `assignee_id` d'un utilisateur d'une autre coloc | `createTask` avec cet `assignee_id` | Erreur 403 (gRPC `VerifyUser` renvoie `is_valid:false`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-LABOR-03 | Transitions de statut | Tâche `TODO` | `mutation { updateTaskStatus(id:"...", status:"IN_PROGRESS") { status } }` puis `DONE` | 200 à chaque étape | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-LABOR-04 | Retour en arrière | Tâche `DONE` | `updateTaskStatus(id:"...", status:"TODO")` | Accepté (service-labor n'implémente pas de machine à états contraignante, à la différence des tickets Domus — à documenter comme comportement réel, pas un défaut en soi) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-LABOR-05 | Publication de l'événement `NEW_TASK` et notification | Création d'une tâche | Observer, côté compte B connecté en Socket.io, la réception d'une notification `NEW_TASK` | Notification reçue dans la room `coloc_<id>` en quelques secondes | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-LABOR-06 | Invalidation du cache dashboard | `getColocDashboard` déjà en cache | Créer une tâche, puis rappeler `getColocDashboard` | Le second appel n'est pas servi depuis le cache (log « Cache miss ») — la clé `dashboard_coloc_<id>` a été supprimée | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-LABOR-07 | Score harmony — tâche terminée dans les temps | Tâche avec `due_at` dans le futur | Passer la tâche à `DONE` avant `due_at`, puis relire `me { harmony_score }` ou `usersByColoc` | `harmony_score` de l'assigné incrémenté de **+10** (persistant côté Postgres Domus, propagé par l'événement `TASK_COMPLETED_SCORE_UPDATE` consommé par `service-domus/redis-subscriber.js`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-LABOR-08 | Score harmony — tâche terminée en retard | Tâche avec `due_at` déjà dépassée | Passer la tâche à `DONE` après `due_at` | `harmony_score` incrémenté de **+2** seulement (branche alternative de `computeHarmonyPoints`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |

**Point d'attention méthodologique** : la spec de phase 2 attribuait la branche +10/+2 au remerciement (« thankUser »). La lecture du code (`service-labor/utils/scoring.js`, `service-domus/redis-subscriber.js`) montre qu'il s'agit en réalité de deux systèmes de score distincts : le **harmony_score** (Postgres, Domus) suit l'achèvement des tâches dans les temps ou en retard, tandis que le **karma_score** (Mongo, Concordia) suit les remerciements/plaintes résolues/votes — voir section 4.5. Les scénarios ci-dessus reflètent le code réel.

### 4.5 Social (Concordia, via gateway)

| ID | Fonctionnalité | Préconditions | Étapes | Résultat attendu | Résultat obtenu | Statut | Anomalie |
|---|---|---|---|---|---|---|---|
| RF-CONC-01 | Création d'une plainte | Compte membre | `mutation { createComplaint(coloc_id:"...", message:"...", is_anonymous:false) { id status } }` | 201, `status` = `OPEN` | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-02 | Consultation des plaintes | Plainte(s) existante(s) | `query { complaints(colocId:"...") { id message status } }` | 200, liste renvoyée (le créateur masqué si `is_anonymous:true`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-03 | Suppression par le créateur ou un ADMIN | Plainte existante | `mutation { deleteComplaint(id:"...") }` | 200, `true`, plainte supprimée | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-04 | Suppression non autorisée | Plainte d'un autre utilisateur, exécutant non-ADMIN | `deleteComplaint` par un tiers non créateur | Erreur 403 | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-05 | Résolution d'une plainte | Plainte `OPEN` | `mutation { resolveComplaint(id:"...") { status } }` puis vérifier le karma du résolveur | `status` → `RESOLVED`, karma du résolveur +5 | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-06 | Création d'un sondage avec options | Compte membre | `mutation { createPoll(coloc_id:"...", question:"...", options:["A","B"]) { id options { text } } }` | 201, 2 options créées | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-07 | Options insuffisantes | — | `createPoll` avec `options:["A"]` | Erreur 400, « nécessite au moins 2 options » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-08 | Vote nominal (premier vote) | Sondage ouvert | `mutation { votePoll(poll_id:"...", option_id:"...") { options { voters } } }` | 200, vote enregistré, karma du votant **+2** | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-09 | Re-vote et vote après clôture | Utilisateur ayant déjà voté / sondage fermé | Revoter pour une autre option ; puis `closePoll` et voter à nouveau | Le revote déplace la voix sans incrément de karma supplémentaire ; voter sur un sondage fermé → erreur 400 | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-10 | Consultation des résultats | Sondage avec votes | `query { polls(colocId:"...") { question options { text voters } } }` | 200, répartition des voix visible | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-11 | Remerciement d'un utilisateur | Deux comptes dans la même coloc | `mutation { thankUser(target_id:"<id B>") { score } }` | 200, karma de B +3, entrée créée dans le journal de remerciements (`ThankLog`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-12 | Auto-remerciement et cooldown | — | `thankUser(target_id: <son propre id>)` ; puis remercier deux fois la même personne en moins de 24h | Auto-remerciement → 400 ; second remerciement avant 24h → 429 avec `retry_after_seconds` | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-13 | Notification temps réel — événement de coloc | Compte B connecté en Socket.io (room `coloc_<id>`) | Compte A crée une plainte ou un sondage | B reçoit un événement `notification` en quelques secondes | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-14 | Notification ciblée (plainte visant un utilisateur) | Compte C (non visé) et compte visé tous deux connectés | A crée une plainte avec `target_id` = compte visé | Seul le compte visé reçoit l'événement `COMPLAINT_TARGETED` (room `user_<id>`) ; C ne le reçoit pas | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-CONC-15 | Compteur de non-lues et marquage lu | Notifications non lues accumulées | `query { unreadNotificationsCount(colocId:"...") }` puis `mutation { markNotificationsRead(colocId:"...") }` puis rappeler le compteur | Le compteur reflète le nombre réel puis retombe à 0 après marquage | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |

### 4.6 Gateway (agrégation, cache, garde-fous GraphQL)

| ID | Fonctionnalité | Préconditions | Étapes | Résultat attendu | Résultat obtenu | Statut | Anomalie |
|---|---|---|---|---|---|---|---|
| RF-GW-01 | Agrégation du dashboard | Coloc avec utilisateurs, tâches, plaintes | `query { getColocDashboard(colocId:"...") { users { id karma_score } tasks { id } open_complaints } }` | 200, les trois domaines agrégés en une réponse | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-GW-02 | Premier appel → cache miss | Cache Redis vide pour cette coloc (`dashboard_coloc_<id>` absent) | Appeler `getColocDashboard` | Log « Cache miss — appel des microservices... », requêtes sortantes vers Domus/Labor/Concordia observables | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-GW-03 | Second appel → cache hit | Rappel dans les 30 secondes suivant RF-GW-02 | Rappeler `getColocDashboard` | Log « Dashboard depuis le cache Redis », aucune requête sortante vers les 3 services | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-GW-04 | Invalidation par mutation | Dashboard en cache | Effectuer une mutation qui touche cette coloc (ex. `createMaintenanceTicket`, `createTask`, `createComplaint`, `votePoll`, `thankUser`) puis rappeler `getColocDashboard` | Cache miss au rappel — la clé a été supprimée par la mutation | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-GW-05 | Requête sans jeton | Aucun cookie envoyé | Appeler une query/mutation authentifiée sans cookie | Erreur « Non autorisé » | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-GW-06 | Profondeur/complexité excessive | — | Envoyer une requête GraphQL de profondeur > 10 ou de complexité estimée > 1000 | Rejet avant exécution (`graphql-depth-limit` / `graphql-query-complexity`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |

### 4.7 Interface (frontend)

| ID | Fonctionnalité | Préconditions | Étapes | Résultat attendu | Résultat obtenu | Statut | Anomalie |
|---|---|---|---|---|---|---|---|
| RF-FRONT-01 | Inscription puis redirection coloc | Nouveau compte, aucune coloc | S'inscrire via l'écran Onboarding | Redirection automatique vers `/onboarding/coloc` (créer/rejoindre une coloc), pas vers le tableau de bord | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-02 | Protection de route sans session | Aucune session active (cookie absent/expiré) | Accéder directement à `/`, `/chores`, `/concordia` ou `/profile` | Redirection vers `/onboarding` (`PrivateRoute` + `getPrivateRedirect`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-03 | Chargement de la page Dashboard | Session active, coloc rejointe | Naviguer vers `/` | Tableau de bord affiché sans erreur (agrégation gateway) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-04 | Chargement de la page Chores | idem | Naviguer vers `/chores` | Tickets de maintenance et tâches affichés | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-05 | Chargement de la page Concordia | idem | Naviguer vers `/concordia` | Fil plaintes/sondages/karma affiché | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-06 | Chargement de la page Profile | idem | Naviguer vers `/profile` | Informations coloc, code d'invitation (si ADMIN), liste des membres affichés | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-07 | Parcours Onboarding complet | Aucune session | Dérouler inscription → configuration coloc (créer ou rejoindre) | Parcours complet sans blocage jusqu'au tableau de bord | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-08 | Notification temps réel dans le panneau | Deux comptes, l'un déclenche un événement | Observer le `NotificationBell`/`NotificationDrawer` du second compte | Badge de compteur s'incrémente, notification visible dans le drawer sans rechargement de page | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-09 | Parcours clavier complet | — | Navigation Tab uniquement : activer le lien d'évitement (`#main-content`), ouvrir une modale (ex. création de ticket dans Chores), vérifier le piège de focus (Tab/Shift+Tab reste dans la modale), fermer avec Échap | Lien d'évitement fonctionnel, focus piégé dans la modale, fermeture Échap restaure le focus déclencheur (`useFocusTrap`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |
| RF-FRONT-10 | Accès direct sans coloc | Utilisateur connecté mais sans `coloc_id` | Accéder directement à `/chores` par URL | Redirection vers `/onboarding/coloc` (variante négative de `getPrivateRedirect`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté | |

---

## 5. Tests structurels (boîte blanche)

Recensement des 17 fichiers de tests Vitest backend + suite frontend, avec rattachement aux scénarios fonctionnels ci-dessus. La couverture de code est la preuve d'exécution continue (CI, job `test`, seuil bloquant 60% de lignes par service/domaine).

### 5.1 Backend

| Fichier de test | Scénarios RF couverts (indicatif) |
|---|---|
| `api-gateway/tests/app.test.js` | RF-GW-05, en-têtes de sécurité, 429 sur `/graphql` |
| `api-gateway/tests/queryDepth.test.js` | RF-GW-06 |
| `api-gateway/tests/resolvers.test.js` | RF-GW-01 à 04, RF-MAINT-05, RF-COLOC-06/07, RF-AUTH-10 (`logout`), la quasi-totalité des mutations gateway |
| `service-domus/tests/auth.test.js` | RF-AUTH-01 à 07, RF-AUTH-11 |
| `service-domus/tests/colocs.test.js` | RF-COLOC-01 à 11 |
| `service-domus/tests/helmet.test.js` | Sécurité transverse (en-têtes) |
| `service-domus/tests/inviteCode.test.js` | RF-COLOC-01, 02, 08 (génération du code) |
| `service-domus/tests/maintenance.test.js` | RF-MAINT-01 à 03, 06, 07 |
| `service-domus/tests/ticketState.test.js` | RF-MAINT-06, 07 (machine à états des tickets) |
| `service-domus/tests/users.test.js` | Création utilisateur réservée ADMIN (fonctionnalité annexe, hors périmètre A.4) |
| `service-labor/tests/helmet.test.js` | Sécurité transverse |
| `service-labor/tests/scoring.test.js` | RF-LABOR-07, 08 (calcul pur `computeHarmonyPoints`) |
| `service-labor/tests/tasks.test.js` | RF-LABOR-01 à 06 |
| `service-concordia/tests/eventRouter.test.js` | RF-CONC-13, RF-LABOR-05 (routage des événements vers Socket.io) |
| `service-concordia/tests/helmet.test.js` | Sécurité transverse |
| `service-concordia/tests/rateLimiter.test.js` | Sécurité (429 sur `/api`) |
| `service-concordia/tests/karma.test.js` | RF-CONC-11, 12 |
| `service-concordia/tests/notifications.test.js` | RF-CONC-15 |
| `service-concordia/tests/social.test.js` | RF-CONC-01 à 10 (complaints + polls, y compris le rejet du filtre `status` en tableau — ANM-03) |
| `service-concordia/tests/socketAuth.test.js` | RF-CONC-13, 14 (authentification du handshake) |

**Chiffres de couverture actuels** (v8, seuil CI 60% de lignes) : `api-gateway` 93,9% · `service-domus` 94,4% · `service-labor` 87,6% · `service-concordia` 89,9%.

### 5.2 Frontend

| Fichier/dossier de test | Scénarios RF couverts (indicatif) |
|---|---|
| `tests/hooks/*` (useAuth, useChores, useConcordia, useDashboard, useDomus) | Logique métier sous-jacente à RF-FRONT-03 à 07 |
| `tests/context/AuthContext.test.jsx` | RF-AUTH-09 |
| `tests/context/SocketContext.test.jsx` | RF-FRONT-08, RF-CONC-13 |
| `tests/lib/routeGuard.test.js` | RF-FRONT-01, 02, 10 |
| `tests/pages/Onboarding.coloc.test.jsx` | RF-COLOC-01, RF-FRONT-07 |
| `tests/pages/Profile.test.jsx` | RF-COLOC-06, RF-FRONT-06 |
| `tests/a11y/InputField.test.jsx`, `SelectField.test.jsx` | Accessibilité formulaires (support de RF-FRONT-09) |
| `tests/a11y/Modal.test.jsx` | RF-FRONT-09 (piège de focus, fermeture Échap — partiel, voir gap ci-dessous) |
| `tests/a11y/badges.contrast.test.js` | Contraste des badges (lié à ANM-07) |
| `tests/a11y/pages.audit.test.jsx` | Audit axe non bloquant sur 5 pages échantillon |

**Chiffres de couverture actuels** (seuil 60%, restreint à `hooks`/`context`/`lib`) : context 97,2% · hooks 91,9% · lib 100%.

### 5.3 Trous de couverture structurelle identifiés (à noter, pas à corriger dans ce document)

- **RF-MAINT-08** (escalade gRPC URGENT → tâche Labor) : aucun test automatisé dédié identifié parmi les 17 fichiers backend. `service-domus/routes/maintenance.js` traite l'échec gRPC en best-effort (log d'erreur, le ticket reste créé), mais l'escalade réussie inter-services n'est vérifiée qu'en recette fonctionnelle.
- **RF-FRONT-09** (lien d'évitement) : le skip-link de `src/App.jsx` (lignes 77-82) n'a pas de test dédié — seuls les audits axe génériques (`tests/a11y/pages.audit.test.jsx`) le traversent indirectement. Le piège de focus et Échap, en revanche, sont bien couverts par `tests/a11y/Modal.test.jsx`.

---

## 6. Tests de sécurité

### 6.1 Automatisés (déjà couverts, renvoi à `SECURITY.md`)

`SECURITY.md` documente la couverture des 10 catégories OWASP Top 10 avec, pour chacune, le fichier concerné et le test qui l'exerce. Synthèse des points les plus directement liés à ce cahier :

| Mesure | Fichier | Test |
|---|---|---|
| En-têtes Helmet sur les 4 services | `*/app.js` | `*/tests/helmet.test.js`, `api-gateway/tests/app.test.js` |
| Rate limiting `/auth` (10/15min), `/graphql` et `/api` (100/min) | `service-domus/routes/auth.js`, `api-gateway/app.js`, `service-concordia/app.js` | RF-AUTH-11, `api-gateway/tests/app.test.js`, `service-concordia/tests/rateLimiter.test.js` |
| RBAC `assignTicket` (défense en profondeur) | `api-gateway/resolvers.js` | RF-MAINT-05, `api-gateway/tests/resolvers.test.js` |
| IDOR cross-coloc (colocs, tickets, tâches, plaintes, sondages, karma) | tous les resolvers/routes | RF-COLOC-07 et équivalents, tests dédiés par service |
| Longueur minimale de mot de passe | `service-domus/routes/auth.js` | RF-AUTH-03 |
| Profondeur/complexité GraphQL | `api-gateway/app.js` | RF-GW-06, `api-gateway/tests/queryDepth.test.js` |

### 6.2 Manuels (non automatisables — à exécuter et consigner)

| ID | Vérification | Procédure | Résultat attendu | Résultat obtenu | Statut |
|---|---|---|---|---|---|
| RS-01 | Attributs du cookie d'authentification | Inspecter le cookie `sodalis_token` dans l'onglet réseau/stockage du navigateur après connexion | `HttpOnly`, `Secure` (en production), `SameSite=Strict` tous présents | À REMPLIR APRÈS EXÉCUTION | Non exécuté |
| RS-02 | Origine CORS non déclarée | Effectuer une requête vers le gateway depuis une origine absente de `CORS_ORIGINS` | Requête refusée | À REMPLIR APRÈS EXÉCUTION | Non exécuté |
| RS-03 | Révocation cross-service | Se déconnecter, puis rejouer une requête avec l'ancien jeton sur chacun des 4 services (via leurs middlewares respectifs) | Rejetée par les 4 services | À REMPLIR APRÈS EXÉCUTION | Non exécuté |
| RS-04 | Utilisateur d'exécution des conteneurs | `docker exec <conteneur> whoami` sur chacun des 4 services applicatifs | `node` (jamais `root`) | À REMPLIR APRÈS EXÉCUTION | Non exécuté |
| RS-05 | Ports base de données non exposés | `docker compose -f docker-compose.prod.yml ps` | Aucun port de `domus-db`, `labor-db`, `redis`, `concordia-db` publié sur l'hôte | À REMPLIR APRÈS EXÉCUTION | Non exécuté |
| RS-06 | Audit des dépendances | `npm run audit` (racine, tous les workspaces) | 0 vulnérabilité haute ou critique | À REMPLIR APRÈS EXÉCUTION | Non exécuté |
| RS-07 | Détection de secrets | `gitleaks detect` sur les deux dépôts | Aucun secret détecté | À REMPLIR APRÈS EXÉCUTION | Non exécuté |

---

## 7. Synthèse

- **Scénarios fonctionnels** : 69 (`RF-*`), répartis en 7 domaines (Auth 11, Coloc 11, Maintenance 8, Labor 8, Social 15, Gateway 6, Interface 10), chacun couvrant au moins un cas nominal et un cas d'erreur là où la fonctionnalité l'admet.
- **Tests structurels** : 17 fichiers Vitest backend + 10 zones de test frontend, couverture 87,6%–94,4% (backend) et 91,9%–100% (frontend, domaines sous seuil), seuil CI bloquant à 60%. Deux trous de couverture identifiés et documentés (section 5.3).
- **Tests de sécurité** : 6 mesures automatisées majeures + 7 vérifications manuelles (`RS-01` à `RS-07`).
- **Taux de réussite global** : à calculer après exécution — voir `PLAN_CORRECTION_BOGUES.md` pour le traitement de chaque anomalie détectée en recette (boucle recette → registre → correctif → nouveau passage).
