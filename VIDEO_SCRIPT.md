# Script de démonstration vidéo — Sodalis (C2.2.4)

Document de travail interne : conducteur pour l'enregistrement, ne fait **pas** partie des 17 éléments du dossier final. Objectif : 5 à 8 minutes, sans montage sophistiqué, prouvant que le logiciel est fonctionnel et manipulable en autonomie.

## Consignes avant de démarrer

- Filmer **pendant la session de recette fonctionnelle** (`CAHIER_DE_RECETTES.md`) — ne pas remonter la stack une seconde fois pour la vidéo.
- Deux navigateurs (ou deux profils/fenêtres de navigation privée) côte à côte : **Compte A** (créateur de la colocation) et **Compte B** (rejoint par code), pour rendre visibles les interactions temps réel.
- Pas de montage nécessaire ; une seule prise continue est suffisante.

## Conducteur minuté

| Minutage | Action | Compte |
|---|---|---|
| 0:00–0:30 | Introduction : montrer `docker compose ps` avec les 8 conteneurs `healthy`, rappeler la version/tag testée | — |
| 0:30–1:30 | Inscription puis création d'une colocation ; capturer l'écran affichant le code d'invitation généré | A |
| 1:30–2:15 | Inscription puis adhésion à la colocation via le code (second navigateur) | B |
| 2:15–3:15 | Création d'un ticket de maintenance en priorité **Urgent** depuis l'écran Corvées | A |
| 3:15–4:00 | Toujours sur le compte A : ouvrir l'onglet Corvées et montrer la tâche créée automatiquement par l'escalade (visible dans la liste, liée au ticket urgent) | A |
| 4:00–4:45 | Basculer sur le compte B : montrer le badge de la cloche de notification s'incrémenter en temps réel (sans rechargement de page), ouvrir le panneau, montrer la notification reçue | B |
| 4:45–5:45 | Créer un sondage depuis l'écran Chez nous (compte A), voter depuis le compte B, montrer la mise à jour des résultats en direct | A puis B |
| 5:45–6:30 | Revenir sur l'écran Accueil (tableau de bord) et montrer l'agrégation (scores, corvées, activité récente) | A |
| 6:30–7:00 | Conclusion : rappel que la stack tourne en conteneurs isolés (`docker compose ps` une dernière fois) | — |

## Points à ne pas manquer

- L'escalade automatique inter-services (ticket Urgent → tâche visible dans Corvées) est le passage le plus important : il prouve la communication gRPC entre `service-domus` et `service-labor`, pas seulement l'interface.
- La notification reçue par le compte B sans action de sa part (pas de clic « actualiser ») est ce qui prouve le temps réel (Socket.io), pas un simple rafraîchissement de page.
