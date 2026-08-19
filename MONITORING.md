# Supervision et alertes — Sodalis

Ce document décrit la supervision externe de la stack Sodalis via **Uptime Kuma**, complémentaire aux healthchecks Docker embarqués dans chaque conteneur.

---

## 1. Objectif

- Surveiller en continu la disponibilité des 8 services de la stack (4 applicatifs + 4 infrastructure).
- Déclencher une alerte humaine après plusieurs échecs consécutifs.
- Conserver un historique de disponibilité (%) visible dans un tableau de bord web.

Uptime Kuma ne remplace pas les healthchecks Docker : il ajoute une **couche de supervision externe** avec notification et historique — utile pour la détection d'incident et la preuve de alerting.

---

## 2. Composant

| Élément | Valeur |
|---|---|
| Image | `louislam/uptime-kuma:1` |
| Conteneur | `sodalis_uptime_kuma` |
| UI locale | `http://localhost:3010` (port configurable via `UPTIME_KUMA_PORT`) |
| Réseau | `sodalis-net` (sondes via noms de service Docker internes) |
| Persistance | volume Docker `uptime_kuma_data` |
| Coût | 0 € (open source, auto-hébergé en local) |

Démarrage avec la stack :

```bash
cd sodalis-backend
docker compose up -d
```

Accès UI : ouvrir `http://localhost:3010` et créer un compte administrateur (configuration one-time, stockée dans le volume).

---

## 3. Tableau des sondes

Paramètres communs à **toutes** les sondes :

| Paramètre | Valeur |
|---|---|
| Intervalle | 60 s |
| Retries | 3 (alerte après ~3 min de panne) |
| Notification | Gmail SMTP (canal principal) |
| Prévenu | opérateur / développeur (adresse e-mail configurée dans Kuma) |
| Canal | SMTP (`smtp.gmail.com:587`) |

| Sonde | Type | Cible | Ce qu'elle vérifie | Intervalle | Seuil alerte | Prévenu | Canal |
|---|---|---|---|---|---|---|---|
| api-gateway | HTTP | `http://api-gateway:4000/health` | Point d'entrée GraphQL joignable, réponse `{ "status": "ok" }` | 60 s | 3 échecs consécutifs | opérateur | SMTP |
| service-domus | HTTP | `http://service-domus:3001/health` | Service auth/coloc + PostgreSQL domus (`SELECT 1`) | 60 s | 3 échecs consécutifs | opérateur | SMTP |
| service-labor | HTTP | `http://service-labor:3002/health` | Service tâches + PostgreSQL labor | 60 s | 3 échecs consécutifs | opérateur | SMTP |
| service-concordia | HTTP | `http://service-concordia:3003/health` | Service social + dépendances (MongoDB, Redis) | 60 s | 3 échecs consécutifs | opérateur | SMTP |
| domus-db | TCP | `domus-db:5432` | PostgreSQL domus accepte les connexions | 60 s | 3 échecs consécutifs | opérateur | SMTP |
| labor-db | TCP | `labor-db:5432` | PostgreSQL labor accepte les connexions | 60 s | 3 échecs consécutifs | opérateur | SMTP |
| redis | TCP | `redis:6379` | Cache, Pub/Sub, denylist JWT | 60 s | 3 échecs consécutifs | opérateur | SMTP |
| concordia-db | TCP | `concordia-db:27017` | MongoDB notifications / plaintes | 60 s | 3 échecs consécutifs | opérateur | SMTP |

**Tags recommandés dans Kuma** : `Applicatif` (4 sondes HTTP), `Infrastructure` (4 sondes TCP).

**Keyword HTTP (optionnel)** : pour les sondes applicatives, ajouter le mot-clé `"status":"ok"` dans les paramètres avancés du monitor.

---

## 4. Configuration initiale (UI Kuma)

### 4.1 Créer les 8 sondes

Pour chaque ligne du tableau ci-dessus :

1. **+ Add New Monitor**
2. Choisir le **Monitor Type** : `HTTP(s)` ou `TCP Port`
3. **Friendly Name** : nom de la sonde (ex. `service-concordia`)
4. **URL** (HTTP) ou **Hostname + Port** (TCP) : valeurs du tableau
5. **Heartbeat Interval** : `60` secondes
6. **Retries** : `3`
7. **Notifications** : cocher la notification e-mail (cf. 4.2)
8. Enregistrer

Capture de référence (intervalle, retries, notification) : [`Kuma-edit-monitor.png`](capture/monitoring/Kuma-edit-monitor.png).

Les sondes utilisent les **noms de service Docker** (`api-gateway`, `domus-db`, etc.), pas `localhost` — Kuma interroge le réseau interne `sodalis-net`.

### 4.2 Notification Gmail (canal principal)

1. **Settings → Notifications → Setup Notification**
2. Type : **Email (SMTP)**
3. Paramètres :

| Champ | Valeur |
|---|---|
| SMTP Host | `smtp.gmail.com` |
| SMTP Port | `587` |
| **Secure** | **décoché** (important — port 587 utilise STARTTLS, pas SSL direct ; cocher « Secure » provoque l'erreur `wrong version number`) |
| SMTP Username | votre adresse `@gmail.com` |
| SMTP Password | mot de passe d'application Google (pas le mot de passe Gmail habituel) |
| From Email | même adresse Gmail |
| To Email | adresse de réception des alertes |

**Alternative** : port `465` avec **Secure coché** (SSL implicite) — même identifiants.

4. **Test** → « Send test notification »
5. Associer cette notification à **chaque** monitor

**Prérequis Google** : validation en 2 étapes activée → compte Google → Sécurité → Mots de passe des applications.

**Ne jamais committer** le mot de passe SMTP ni l'URL de webhook : configuration UI Kuma uniquement.

### 4.3 Plan B — Discord webhook (secours jour J)

Si Gmail SMTP échoue le jour de la démo :

1. Discord → canal dédié (ex. `#sodalis-alerts`) → **Paramètres du canal → Intégrations → Webhooks → Nouveau webhook** → copier l'URL
2. Kuma → **Settings → Notifications → Discord** → coller l'URL
3. « Send test notification » → message visible dans Discord
4. Associer la notification Discord aux monitors (à la place ou en plus de l'e-mail)
5. Preuve jury alternative : capture du message Discord (horodaté, nom du monitor)

---

## 5. Procédure de test d'alerte (preuve jury)

```bash
cd sodalis-backend
docker compose up -d
# Attendre que les 8 sondes passent au vert dans Kuma (~2 min)

docker compose stop service-concordia
# Attendre ~3 min (3 échecs × 60 s) → alerte e-mail reçue

docker compose start service-concordia
# Vérifier retour au vert (e-mail de rétablissement optionnel)
```

**Astuce démo** : le jour J, passer temporairement l'intervalle à **30 s** sur la sonde testée → alerte en ~90 s au lieu de 3 min. Remettre 60 s ensuite (valeur documentée).

**Captures à conserver** (`capture/monitoring/`) :

1. Dashboard Kuma : sonde `service-concordia` en rouge + historique de disponibilité — [`Dashboard-kuma-rouge.png`](capture/monitoring/Dashboard-kuma-rouge.png)
2. E-mail d'alerte reçu (objet, horodatage, nom du monitor) — [`email-recu-a-cause-du-service-down.png`](capture/monitoring/email-recu-a-cause-du-service-down.png) — test d'incident du **2026-08-18** ; ou message Discord si Plan B
3. Graphique **Response Time** d'une sonde HTTP (preuve supervision latence) — [`kuma-response-time.png`](capture/monitoring/kuma-response-time.png)
4. Écran d'édition d'une sonde (intervalle 60 s, retries 3, notification cochée) — [`Kuma-edit-monitor.png`](capture/monitoring/Kuma-edit-monitor.png)

---

## 6. Indicateurs de qualité et de performance supervisés

Ce tableau répond au critère **C4.1.2** : critères de qualité et de performance adaptés au projet, avec outil de mesure, fréquence et action en cas de dépassement. Les seuils détaillés (couverture, lint, audit, Lighthouse frontend) sont dans [QUALITY.md](QUALITY.md) (backend) et [QUALITY.md](../sodalis-frontend/QUALITY.md) (frontend).

**Note dates** : le test d'alerte SMTP (§5, capture e-mail) date du **2026-08-18** ; le relevé indicateurs perf/P95/startup ci-dessous date du **2026-08-19** — deux mesures distinctes.

| Indicateur | Seuil | Outil | Fréquence | Dernière mesure | Action si dépassement |
|---|---|---|---|---|---|
| Disponibilité stack (8 services) | Alerte après 3 échecs consécutifs (× 60 s) | Uptime Kuma — sondes §3 | Continue (24/7) | — | Alerte SMTP ; investigation + `docker compose ps` |
| Temps de réponse `/health` (4 sondes HTTP) | < 500 ms (cible opérationnelle) | Uptime Kuma — graphique **Response Time** par monitor | Continue (60 s) | Voir [`kuma-response-time.png`](capture/monitoring/kuma-response-time.png) | Revue opérationnelle si latence persistante > 500 ms ; corréler avec charge hôte |
| P95 `getColocDashboard` (GraphQL) | < 200 ms | [`scripts/perf-check.js`](scripts/perf-check.js) (`PERF_P95_THRESHOLD_MS=200`) | Manuel : `npm run perf:check` ou workflow [`perf.yml`](.github/workflows/perf.yml) | **P95 ~6 ms** (moy. 2,4 ms — coloc de test vide, latence conforme) | Investiguer régression gateway / services internes |
| Démarrage stack complète | < 60 s | [`scripts/startup-check.sh`](scripts/startup-check.sh) (`STARTUP_THRESHOLD_S=60`) | Manuel : `npm run startup:check` ou `perf.yml` | **25 s** (tous conteneurs `healthy`) | Vérifier healthchecks Docker, logs de démarrage, ressources hôte |
| Couverture de tests | ≥ 60 % lignes | Vitest coverage | CI — chaque push/PR | Conforme (cf. QUALITY.md) | Corriger ou étendre les tests avant merge |
| Erreurs de lint | 0 | ESLint | CI — chaque push/PR | Gate bloquant | Corriger avant merge |
| Vulnérabilités dépendances | 0 high/critical | `npm audit` (job `security`) | CI — chaque push/PR | Exit code 0 | `npm audit fix` ou mise à jour manuelle |
| Lighthouse (frontend) | perf ≥ 90, a11y ≥ 95 | Lighthouse CI | CI — chaque push/PR | 0,98 / 1,0 (cf. QUALITY.md frontend) | Corriger régression avant merge |

**Commandes de vérification manuelle** (stack Docker démarrée) :

```bash
cd sodalis-backend
npm run startup:check   # redémarre la stack et mesure le temps jusqu'à healthy
npm run perf:check      # mesure le P95 getColocDashboard (stack déjà up)
```

---

## 7. Limites assumées

| Limite | Explication |
|---|---|
| Pas de métriques CPU/RAM | Uptime Kuma vérifie la disponibilité, pas la charge système |
| Pas de corrélation de logs | Pas de lien avec pino / `x-request-id` |
| Mac en veille | Les conteneurs sont suspendus → risque de fausses alertes |
| `docker compose down` complet | Uptime Kuma s'arrête aussi → pas d'alerte (normal) |
| Test d'incident | Utiliser `docker compose stop <service>` (un seul service), pas un arrêt total de la stack |
| Config UI | Sondes et notifications ne sont pas versionnées dans git (volume Docker persistant) |

---

## 8. Références

- Critères de qualité et seuils chiffrés : [QUALITY.md](QUALITY.md) (backend), [QUALITY.md](../sodalis-frontend/QUALITY.md) (frontend)
- Healthchecks Docker : [docker-compose.yml](docker-compose.yml), [docker-compose.prod.yml](docker-compose.prod.yml)
- Endpoints `/health` : `api-gateway`, `service-domus`, `service-labor`, `service-concordia`
- Déploiement et vérification de démarrage : [MANUEL_DEPLOIEMENT.md](MANUEL_DEPLOIEMENT.md) section 7
