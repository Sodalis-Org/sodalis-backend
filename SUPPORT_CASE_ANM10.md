# Retour utilisateur traité de bout en bout — ANM-10

Document de traçabilité pour la boucle de support (étape 3 certification). Complète [`SUPPORT.md`](SUPPORT.md) et le registre [`PLAN_CORRECTION_BOGUES.md`](PLAN_CORRECTION_BOGUES.md).

---

## 1. Contexte

| Élément | Détail |
|---|---|
| **Date** | 2026-08-19 |
| **Session** | Test utilisateur local (stack Docker + `npm run dev`) |
| **Testeur** | Utilisateur lambda — rôle MEMBER, coloc « Test Pilote » |
| **Parcours** | Concordia → voter sur un sondage ouvert |
| **Canal de signalement** | E-mail à `nerol.sessie@gmail.com` (testeur sans compte GitHub) |

---

## 2. Signalement initial (e-mail testeur)

**Objet :** `[Sodalis] Signalement de bug`

**Contenu :**

> J'ai essayé de voter sur le sondage « Qui fait la vaisselle ce week-end ? ». J'ai cliqué sur « Moi » mais rien ne s'est passé — pas de coche, pas de message. Je pensais que l'app était bloquée.
>
> Navigateur : Safari 18 / macOS 15  
> Coloc : Test Pilote, rôle MEMBER

---

## 3. Échanges support ↔ utilisateur

| Quand | Qui (rôle) | Message |
|---|---|---|
| J+0, 14h10 | **Support** | « Merci pour le signalement. Peux-tu retenter en rafraîchissant la page ? Le sondage était peut-être déjà fermé côté admin. » |
| J+0, 14h25 | **Utilisateur** | « J'ai rafraîchi — toujours pareil quand je clique, aucun retour. » |
| J+0, 16h00 | **Support** | « Reproduit de mon côté : le vote échoue silencieusement si le sondage vient d'être fermé. Correctif en cours. » |
| J+1, 10h30 | **Support** | « Correctif déployé en local — peux-tu retester ? Tu devrais voir un message d'erreur ou un indicateur de chargement. » |
| J+1, 11h00 | **Utilisateur** | « OK, cette fois j'ai un message « Poll is closed » quand je clique — c'est clair. » |

---

## 4. Qualification support

| Critère | Valeur |
|---|---|
| **ID registre** | ANM-10 |
| **Sévérité** | Mineure |
| **Criticité** | Faible |
| **Priorité** | Normale (UX, pas de perte de données) |
| **Statut initial** | Détectée → Qualifiée → Priorisée |

**Transcription issue GitHub** : issue #52 (créée par le support à partir de l'e-mail) :

- **Titre :** `[Bug] Vote sur sondage sans retour visuel en cas d'échec`
- **Template :** `bug_report.yml`
- **Labels :** `bug`

---

## 5. Diagnostic (développeur)

**Cause racine :** dans `sodalis-frontend/src/hooks/useConcordia.js`, la fonction `votePoll` interceptait les erreurs GraphQL via `console.error` sans les remonter à l'interface. `PollFeedItem.jsx` n'affichait ni chargement ni message d'erreur — l'utilisateur avait l'impression que le clic était ignoré.

**Scénario de reproduction :**

1. ADMIN crée un sondage et le ferme.
2. MEMBER (page non rafraîchie) clique une option.
3. La mutation `votePoll` échoue → aucun feedback UI.

---

## 6. Correctif

**Dépôt :** `sodalis-frontend`  
**Branche :** `dev` (PR #14 mergée `dev` → `main`, commit `4cc920b`)

| Fichier | Changement |
|---|---|
| `src/hooks/useConcordia.js` | `votePoll` retourne `{ ok: true }` ou `{ ok: false, error }` |
| `src/pages/Concordia/components/PollFeedItem.jsx` | Spinner pendant le vote, message `role="alert"` en cas d'échec |
| `tests/hooks/useConcordia.test.jsx` | Test « votePoll returns ok:false when the mutation fails » |

---

## 7. Validation CI

La CI frontend (`sodalis-frontend/.github/workflows/ci.yml`) exécute avant merge :

- lint (job `quality`)
- tests + couverture (job `test`)
- audit dépendances + gitleaks (job `security`)
- build (job `build`)
- Lighthouse perf ≥ 90 / a11y ≥ 95 (job `lighthouse`)

**Résultat constaté (2026-08-19)** : PR [#14](https://github.com/Sodalis-Org/sodalis-frontend/pull/14) « fix: retour utilisateur vote sondage (ANM-10) » mergée dans `main` (commit `4cc920b`).

CI run [#32228867580](https://github.com/Sodalis-Org/sodalis-frontend/actions/runs/32228867580) — **5 jobs SUCCESS, 10 checks GitHub passed** (GitHub compte aussi les checks auxiliaires : upload artifact, etc.) :

| Job | Résultat |
|---|---|
| Lint & format | SUCCESS |
| Tests & coverage | SUCCESS |
| Dependency audit & secret scan | SUCCESS |
| Build | SUCCESS |
| Performance & accessibilité (perf ≥ 90, a11y ≥ 95) | SUCCESS |

**Captures** :
- Issue #52 fermée — [`Issue-52-fermee.png`](capture/support/anm-10/Issue-52-fermee.png)
- PR #14 — [`PR-14-checks-verts.png`](capture/support/anm-10/PR-14-checks-verts.png)
- Release v1.1.0 frontend — [`Release-v1.1.0-frontend.png`](capture/support/anm-10/Release-v1.1.0-frontend.png)

**Version livrée** : correctif inclus dans la release frontend [**v1.1.0**](https://github.com/Sodalis-Org/sodalis-frontend/releases/tag/v1.1.0) (2026-08-19).

---

## 8. Clôture

| Étape processus | Statut |
|---|---|
| Corrigée | Oui |
| Test de non-régression ajouté | Oui |
| Vérifiée (retest utilisateur) | Oui — confirmation J+1 |
| Clôturée | Oui — issue [#52](https://github.com/Sodalis-Org/sodalis-backend/issues/52) fermée le 2026-08-20 sur GitHub |

---

## 9. Contribution des parties prenantes

| Rôle | Responsable | Contribution dans ce cas |
|---|---|---|
| **Utilisateur** | Testeur MEMBER (session pilote) | Signale le problème par e-mail, reproduit sur demande, confirme le correctif |
| **Support** | Mainteneur Sodalis | Accuse réception (< 24 h), qualifie ANM-10, transcrit l'e-mail en issue, communique l'avancement |
| **Développeur** | Mainteneur Sodalis (casquette distincte) | Reproduit, corrige, ajoute test, ouvre PR |
| **CI** | GitHub Actions | Valide lint/tests/audit/build — autorise le merge |

*En l'absence d'équipe dédiée, un seul opérateur porte les rôles Support et Développeur ; la séparation est maintenue dans le processus et la traçabilité (e-mail → issue → ANM-10 → PR → CI → confirmation).*
