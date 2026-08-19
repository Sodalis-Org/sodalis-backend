# Support utilisateur — Sodalis

Ce document s'adresse aux **colocataires** qui utilisent Sodalis et rencontrent un problème. Il ne remplace pas la documentation développeur (`README.md`, `MANUEL_DEPLOIEMENT.md`).

---

## Comment signaler un problème

### Option 1 — Formulaire GitHub (recommandé)

1. Ouvrir [New issue → Signalement de bug](https://github.com/Sodalis-Org/sodalis-backend/issues/new?template=bug_report.yml).
2. Remplir tous les champs obligatoires : étapes pour reproduire, résultat attendu, résultat obtenu, navigateur, contexte colocation.
3. Joindre une capture d'écran si possible (glisser-déposer dans le commentaire après création).

### Option 2 — E-mail (sans compte GitHub)

Envoyer un message à **nerol.sessie@gmail.com** avec :

- objet `[Sodalis] Signalement de bug` ;
- les mêmes informations que le formulaire (étapes, attendu vs obtenu, navigateur, rôle ADMIN/MEMBER) ;
- une capture en pièce jointe si possible.

Le support transcrit ensuite votre signalement en issue GitHub pour assurer le suivi et la traçabilité.

---

## Délais de réponse

| Étape | Délai annoncé |
|---|---|
| Accusé de réception | **24 h** (jours ouvrés) |
| Correctif ou contournement | **72 h** (jours ouvrés), selon la gravité |

Ces délais s'appliquent au projet étudiant Sodalis ; un bug bloquant (impossible de se connecter, perte de données) est traité en priorité.

---

## Que se passe-t-il après votre signalement ?

Votre retour entre dans le **processus de correction des bogues** documenté dans [`PLAN_CORRECTION_BOGUES.md`](PLAN_CORRECTION_BOGUES.md) :

```
Détectée → Qualifiée → Priorisée → En correction → Corrigée
    → Test de non-régression → Vérifiée → Clôturée
```

En résumé :

1. **Accusé de réception** — confirmation que le signalement est bien reçu.
2. **Qualification** — reproduction du problème, évaluation de la gravité (sévérité technique et criticité métier).
3. **Priorisation** — ordre de traitement (un blocage de connexion passe avant un défaut visuel mineur).
4. **Correction** — développement du correctif sur une branche dédiée, revue, fusion.
5. **Validation automatique** — la CI (lint, tests, audit sécurité, build Docker) doit passer avant toute livraison.
6. **Retour vers vous** — demande de retest ; clôture après confirmation ou absence de réponse sous 7 jours.

---

## Qui fait quoi ?

En l'absence d'équipe dédiée, un seul opérateur porte plusieurs casquettes ; la séparation des rôles est maintenue dans le processus et la traçabilité (issue → registre ANM → PR → CI).

| Rôle | Responsable | Actions |
|---|---|---|
| **Utilisateur** | Colocataire / testeur | Utilise l'app, signale via formulaire ou e-mail, reproduit sur demande |
| **Support** | Mainteneur Sodalis | Accuse réception, demande précisions, qualifie et priorise, communique l'état |
| **Développeur** | Mainteneur Sodalis | Diagnostique, corrige, ajoute un test de non-régression si pertinent |
| **CI** | GitHub Actions | Valide lint, tests (seuil 60 %), audit dépendances, build Docker avant merge |

---

## Ce que nous ne traitons pas ici

| Demande | Où aller |
|---|---|
| Nouvelle fonctionnalité | Ouvrir une discussion GitHub ou contacter par e-mail (hors scope support bug) |
| Installation / déploiement développeur | [`README.md`](README.md), [`MANUEL_DEPLOIEMENT.md`](MANUEL_DEPLOIEMENT.md) |
| Utilisation de l'application | [`sodalis-frontend/MANUEL_UTILISATION.md`](https://github.com/Sodalis-Org/sodalis-frontend/blob/main/MANUEL_UTILISATION.md) |

---

## Session de test utilisateur (organisateur)

Pour lancer une campagne de test locale (2–3 personnes, 48 h de retours) :

```bash
# Terminal 1 — backend
cd sodalis-backend && docker compose up

# Terminal 2 — frontend
cd sodalis-frontend && npm run dev
```

**Scénario guidé (5–10 min par personne)** : créer/rejoindre une coloc → poster un ticket maintenance → créer/voter un sondage → vérifier les notifications.

**Consigne aux testeurs** : « Si quelque chose bloque ou surprend, signalez via le [formulaire](https://github.com/Sodalis-Org/sodalis-backend/issues/new?template=bug_report.yml) ou par e-mail à nerol.sessie@gmail.com avec capture. »

Relancer les testeurs à J+1 si aucun retour.
