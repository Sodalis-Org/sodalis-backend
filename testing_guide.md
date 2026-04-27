# Guide de test manuel — Sodalis Backend

Scénario complet pour tester toutes les fonctionnalités : Auth, GraphQL, gRPC, Redis cache, tickets de maintenance, notifications temps réel.

**Outils nécessaires :** `curl`, un navigateur pour l'IDE GraphQL, et optionnellement un client Socket.io (ex: [socket.io-client REPL](https://npm.runkit.com/socket.io-client) ou Postman).

---

## Étape 0 — Démarrage

```bash
docker-compose down -v && docker-compose up -d --build
```

Attendre ~20 secondes, puis vérifier que tout est up :

```bash
docker-compose ps
```

Tous les services doivent être en état `running` (healthy pour les bases).

---

## Étape 1 — Créer deux utilisateurs

On a besoin d'un **ADMIN** et d'un **MEMBER** pour tester les restrictions de rôle.

### 1.1 Créer l'ADMIN

```bash
curl -s -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@test.com", "password": "password123"}' | jq
```

**Réponse attendue :**
```json
{
  "id": "<UUID_ALICE>",
  "name": "Alice",
  "email": "alice@test.com",
  "role": "MEMBER"
}
```

> Sauvegarde `<UUID_ALICE>`. Le register ne génère pas de token — il faut se connecter ensuite.

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@test.com", "password": "password123"}' | jq
```

**Réponse attendue :**
```json
{
  "token": "eyJ...",
  "user": { "id": "<UUID_ALICE>", "name": "Alice", "email": "alice@test.com", "role": "MEMBER" }
}
```

> Sauvegarde le `token` → **TOKEN_ALICE**.

### 1.2 Créer le MEMBER

```bash
curl -s -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Bob", "email": "bob@test.com", "password": "password123"}' | jq
```

Puis login :

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "bob@test.com", "password": "password123"}' | jq
```

> Sauvegarde `<UUID_BOB>` et le `token` → **TOKEN_BOB**.

---

## Étape 2 — Créer une colocation

Alice crée la coloc depuis l'API Gateway (GraphQL).

Ouvre **http://localhost:4000/graphql** dans ton navigateur.

Dans l'onglet **HTTP Headers** (en bas), colle :
```json
{ "Authorization": "Bearer TOKEN_ALICE" }
```

Exécute :
```graphql
mutation {
  createColoc(name: "Appart Lyon") {
    coloc {
      id
      name
      invite_code
    }
    token
  }
}
```

**Réponse attendue :**
```json
{
  "data": {
    "createColoc": {
      "coloc": { "id": "<UUID_COLOC>", "name": "Appart Lyon", "invite_code": "appart-lyon-xxxx" },
      "token": "eyJ..."
    }
  }
}
```

> La réponse contient un **nouveau token** mis à jour (il contient maintenant le `coloc_id`). Remplace **TOKEN_ALICE** par ce nouveau token.
> Sauvegarde `<UUID_COLOC>` et le `invite_code`.

**Ce qui s'est passé :** Alice est maintenant ADMIN de cette coloc.

---

## Étape 3 — Bob rejoint la colocation

Dans l'IDE GraphQL, change le header pour utiliser **TOKEN_BOB**, puis :

```graphql
mutation {
  joinColoc(invite_code: "appart-lyon-xxxx") {
    coloc {
      id
      name
    }
    token
  }
}
```

> Remplace **TOKEN_BOB** par le nouveau token reçu.

**Ce qui s'est passé :** Bob est maintenant MEMBER de la même coloc.

---

## Étape 4 — Créer une tâche

Teste le flux **GraphQL → service-labor → gRPC VerifyUser → service-domus**.

Avec **TOKEN_ALICE** dans le header :

```graphql
mutation {
  createTask(
    title: "Acheter du papier toilette"
    assignee_id: "<UUID_BOB>"
    coloc_id: "<UUID_COLOC>"
  ) {
    id
    title
    status
  }
}
```

**Réponse attendue :**
```json
{
  "data": {
    "createTask": {
      "id": "<UUID_TASK>",
      "title": "Acheter du papier toilette",
      "status": "TODO"
    }
  }
}
```

**Ce qui s'est passé en coulisses :**
1. La gateway a appelé `POST /tasks` sur service-labor
2. Service-labor a appelé `VerifyUser` sur service-domus via gRPC → confirmé que Bob appartient à la coloc
3. La tâche a été insérée en base
4. L'événement `NEW_TASK` a été publié sur Redis
5. Service-concordia a persisté une notification en MongoDB

**Test d'erreur gRPC :** Essaie avec un `assignee_id` inventé (n'importe quel UUID) — tu dois recevoir `403 Non autorisé`.

---

## Étape 5 — Mettre à jour le statut d'une tâche

```graphql
mutation {
  updateTaskStatus(id: "<UUID_TASK>", status: "IN_PROGRESS") {
    id
    status
  }
}
```

**Réponse attendue :** `status: "IN_PROGRESS"`

---

## Étape 6 — Dashboard et cache Redis

### 6.1 Premier appel (cache miss)

```graphql
query {
  getColocDashboard(colocId: "<UUID_COLOC>") {
    users { name }
    tasks { title status }
  }
}
```

Dans les logs de la gateway (`docker logs sodalis_gateway`), tu dois voir :
```
Cache miss — appel des microservices...
```

### 6.2 Deuxième appel immédiat (cache hit)

Relance exactement la même query. Dans les logs :
```
Dashboard depuis le cache Redis
```

### 6.3 Vérifier le cache dans Redis

```bash
docker exec sodalis_redis redis-cli GET "dashboard_coloc_<UUID_COLOC>"
```

Tu verras le JSON du dashboard sérialisé.

---

## Étape 7 — Tickets de maintenance

### 7.1 Créer un ticket normal (priorité LOW)

Avec **TOKEN_BOB** :

```bash
curl -s -X POST http://localhost:3001/maintenance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_BOB" \
  -d '{
    "title": "Robinet qui fuit",
    "description": "La cuisine, sous l évier",
    "category": "PLUMBING",
    "priority": "LOW",
    "coloc_id": "<UUID_COLOC>"
  }' | jq
```

**Réponse attendue :** `201` + ticket avec `status: "OPEN"`.

Vérifie dans les logs de service-concordia (`docker logs sodalis_concordia`) :
```
Événement reçu type=NEW_MAINTENANCE_TICKET
```

### 7.2 Créer un ticket URGENT (escalade gRPC)

```bash
curl -s -X POST http://localhost:3001/maintenance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_BOB" \
  -d '{
    "title": "Coupure électrique totale",
    "category": "ELECTRICITY",
    "priority": "URGENT",
    "coloc_id": "<UUID_COLOC>"
  }' | jq
```

**Réponse attendue :** `201` + ticket créé.

**Ce qui s'est passé en plus :**
- Service-domus a appelé `CreateTask` sur service-labor via gRPC
- Une tâche "Urgence : Coupure électrique totale" a été créée automatiquement dans service-labor

**Vérification :** Lance la query GraphQL `tasksByColoc` — tu dois voir la tâche d'urgence :

```graphql
query {
  tasksByColoc(colocId: "<UUID_COLOC>") {
    id
    title
  }
}
```

### 7.3 Mettre à jour le statut d'un ticket

Note le `id` (entier) du ticket créé en 7.1. Avec **TOKEN_ALICE** :

```bash
curl -s -X PATCH http://localhost:3001/maintenance/<ID_TICKET>/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ALICE" \
  -d '{"status": "IN_PROGRESS"}' | jq
```

**Réponse attendue :** ticket avec `status: "IN_PROGRESS"`.

Ou via GraphQL :
```graphql
mutation {
  updateTicketStatus(id: "<ID_TICKET>", status: "IN_PROGRESS") {
    id
    status
  }
}
```

### 7.4 Assigner un ticket (ADMIN seulement)

Avec **TOKEN_ALICE** (ADMIN) :

```bash
curl -s -X PATCH http://localhost:3001/maintenance/<ID_TICKET>/assign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ALICE" \
  -d '{"assigned_to": "<UUID_BOB>"}' | jq
```

**Réponse attendue :** ticket avec `assigned_to: "<UUID_BOB>"`.

**Test d'erreur de rôle :** Répète avec **TOKEN_BOB** (MEMBER) — tu dois recevoir `403 Réservé aux ADMINs`.

### 7.5 Lister les tickets de la coloc

Via GraphQL (TOKEN_ALICE ou TOKEN_BOB) :

```graphql
query {
  maintenanceTickets(colocId: "<UUID_COLOC>") {
    id
    title
    category
    priority
    status
    assigned_to
  }
}
```

**Réponse attendue :** liste de tous les tickets créés.

---

## Étape 8 — Notifications

### 8.1 Historique MongoDB (REST)

```bash
curl -s http://localhost:3003/notifications/coloc/<UUID_COLOC> \
  -H "Authorization: Bearer TOKEN_ALICE" | jq
```

**Réponse attendue :** liste de toutes les notifications générées depuis le début du test (`NEW_TASK`, `NEW_MAINTENANCE_TICKET`, `MAINTENANCE_TICKET_UPDATED`, `MAINTENANCE_TICKET_ASSIGNED`...).

### 8.2 Notifications temps réel (Socket.io)

Ouvre une console Node.js (ou [npm.runkit.com](https://npm.runkit.com)) et exécute :

```javascript
const { io } = require("socket.io-client");
const socket = io("http://localhost:3003");
socket.on(`coloc_<UUID_COLOC>_notifications`, (event) => {
  console.log("Notification reçue :", event);
});
```

Puis crée un nouveau ticket de maintenance depuis curl. Tu dois voir la notification apparaître **en temps réel** dans la console.

---

## Étape 9 — Tests de sécurité

### 9.1 Requête sans token

```bash
curl -s http://localhost:3001/maintenance?coloc_id=<UUID_COLOC>
```

**Réponse attendue :** `401 Accès non autorisé — Token manquant`

### 9.2 Accéder à la coloc d'un autre

Crée un troisième utilisateur "Charlie" (sans le faire rejoindre la coloc), récupère son token, et tente :

```graphql
query {
  maintenanceTickets(colocId: "<UUID_COLOC>") {
    id
  }
}
```

**Réponse attendue :** `Non autorisé — Vous n'appartenez pas à cette colocation`

### 9.3 Bob tente d'assigner un ticket (MEMBER)

```bash
curl -s -X PATCH http://localhost:3001/maintenance/<ID_TICKET>/assign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_BOB" \
  -d '{"assigned_to": "<UUID_BOB>"}' | jq
```

**Réponse attendue :** `403 Réservé aux ADMINs`

### 9.4 Validation des données

```bash
curl -s -X POST http://localhost:3001/maintenance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ALICE" \
  -d '{"title": "", "category": "INVALIDE", "priority": "LOW", "coloc_id": "<UUID_COLOC>"}' | jq
```

**Réponse attendue :** `400` avec un tableau d'erreurs de validation.

---

## Récapitulatif des vérifications

| Fonctionnalité | Signe que ça marche |
|---|---|
| Inscription / Login | `200` + token JWT |
| Créer / rejoindre coloc | Nouveau token contenant `coloc_id` |
| Créer une tâche | gRPC `VerifyUser` appelé (log labor), tâche en base |
| Dashboard cache miss | Log gateway : `Cache miss` |
| Dashboard cache hit | Log gateway : `Dashboard depuis le cache Redis` |
| Ticket LOW créé | `201` + concordia log : `NEW_MAINTENANCE_TICKET` |
| Ticket URGENT escalade | Tâche auto créée dans service-labor |
| Mise à jour statut ticket | `updated_at` change, événement concordia reçu |
| Assignation ticket ADMIN | `assigned_to` renseigné, événement concordia reçu |
| Invalidation cache après mutation | Clé Redis `dashboard_coloc_*` supprimée |
| Notifications MongoDB | Toutes les actions listées dans `/notifications/coloc/:id` |
| Socket.io temps réel | Notification reçue instantanément dans la console |
| Sécurité 401/403 | Refus sans token ou hors coloc |
