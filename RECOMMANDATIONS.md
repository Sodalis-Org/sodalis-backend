# Recommandations d'évolution — Sodalis

Ce document recense les améliorations prioritaires identifiées après la phase de certification, calibrées pour la cible de déploiement **mono-hôte auto-hébergé** assumée dans [`DEPLOYMENT.md`](DEPLOYMENT.md). Chaque ligne repose sur un écart déjà documenté dans le projet — registre de bogues, manuels ops, cahier de recettes, monitoring — et non sur une refonte spéculative.

Documents sources : [`PLAN_CORRECTION_BOGUES.md`](PLAN_CORRECTION_BOGUES.md), [`MANUEL_MISE_A_JOUR.md`](MANUEL_MISE_A_JOUR.md), [`MONITORING.md`](MONITORING.md), [`CAHIER_DE_RECETTES.md`](CAHIER_DE_RECETTES.md).

---

## Tableau des recommandations

| Amélioration | Gain attendu | Charge estimée | Coût | Priorité |
|---|---|---|---|---|
| Corriger ANM-09 (rate limiter `/auth` aveugle) | Protection brute-force par IP cliente réelle ; supprime le risque de blocage collectif login/inscription (10 req/15 min partagées par tous les utilisateurs) | 0,5 j | 0 € | Haute |
| Mapper les erreurs d'autorisation GraphQL (ANM-11) | Codes HTTP/GraphQL corrects pour le client ; évite confusion 500 vs 403 lors des refus cross-coloc | 0,25 j | 0 € | Basse |
| Ajouter un outil de migration de schéma PostgreSQL | Supprime l'étape SQL manuelle risquée à chaque montée de version ; traçabilité des évolutions `db-init/` sur volumes déjà initialisés | 2 j | 0 € | Haute |
| Terminer les 25 scénarios de recette restants | Couverture fonctionnelle complète (36 % jamais exécutés : Labor ×8, Frontend ×8, Coloc admin ×4) ; détection des régressions sur parcours non couverts par les 203 tests structurels | 1 j | 0 € | Moyenne |
| Centraliser les logs pino (Promtail + Loki sur le même hôte) | Recherche corrélée sur les 4 services via `x-request-id` en une requête ; fin de la corrélation manuelle `docker logs` × 4 | 1 j | ~5 €/mois | Moyenne |
| Formaliser le déploiement frontend (`sodalis-frontend`, nginx + TLS) | Le build statique n'est pas dans `docker-compose.prod.yml` ; reverse proxy nginx unifie HTTPS, cookie `Secure` et `CORS_ORIGINS` — prérequis prod multi-utilisateurs (nginx sur l'hôte ou bloc compose léger, pas obligatoirement un 9e conteneur) | 1 j | 0 € | Moyenne |

---

## Hors scope volontaire

Options évaluées et écartées, cohérentes avec les choix documentés du projet :

- **Kubernetes / orchestrateur multi-nœuds** — incohérent avec la cible mono-hôte ; Docker Compose suffit au volume visé ([`DEPLOYMENT.md`](DEPLOYMENT.md)).
- **mTLS gRPC / Redis signé** — risque accepté tant que les services restent sur le réseau bridge interne ([`SECURITY.md`](SECURITY.md)).
- **CAPTCHA / vérification e-mail** — hors modèle métier (colocation par invitation), documenté comme risque accepté ([`SECURITY.md`](SECURITY.md)).

---

## Références par recommandation

| Recommandation | Preuve dans le dépôt |
|---|---|
| ANM-09 | [`PLAN_CORRECTION_BOGUES.md`](PLAN_CORRECTION_BOGUES.md) — ANM-09 statut « Détectée » ; `api-gateway/resolvers.js` (`forwardHeaders`) ne transmet que `Authorization` et `x-request-id` |
| ANM-11 | [`PLAN_CORRECTION_BOGUES.md`](PLAN_CORRECTION_BOGUES.md) — ANM-11 ; rejeu RF-COLOC-07, capture `capture/anm-08/preuve du bug corrigé.png` |
| Migrations PostgreSQL | [`MANUEL_MISE_A_JOUR.md`](MANUEL_MISE_A_JOUR.md) §5 — « Il n'existe pas d'outil de migration automatisé » |
| Recettes | [`CAHIER_DE_RECETTES.md`](CAHIER_DE_RECETTES.md) — 44 scénarios exécutés, 25 « Non exécuté » |
| Logs centralisés | [`MONITORING.md`](MONITORING.md) §6 — « Pas de corrélation de logs » |
| Déploiement frontend | [`DEPLOYMENT.md`](DEPLOYMENT.md) — frontend déployé séparément du compose prod ; artefact build dans le dépôt `sodalis-frontend` |
