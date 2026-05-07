# Petit Bac multijoueur

Petit Bac multijoueur en temps réel, conçu pour les lives Twitch.

**Statut** : en cours de développement (phase 1 — Hello World Worker validée).

## Architecture

- `worker/` — backend Cloudflare Workers + Durable Objects (TypeScript, WebSocket)
- `frontend/` — *(à venir)* HTML/CSS/JS vanilla, hébergé sur GitHub Pages

## Stack

- **Frontend** : HTML/CSS/JS vanilla, GitHub Pages
- **Backend** : Cloudflare Workers + Durable Objects
- **Persistance** : aucune (état en mémoire dans les Durable Objects)
- **Authentification** : aucune (pseudo éphémère par room)

## Déploiement

Voir `worker/README.md` pour le déploiement du backend.

## Licence

À définir.
