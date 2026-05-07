# Petit Bac — Worker

Backend Cloudflare Workers pour le Petit Bac multijoueur.

## Phase 1 — Hello World

Vérifie que la chaîne `wrangler` + déploiement Cloudflare fonctionne.

### Prérequis

- Node.js 18+ (`node --version`)
- Compte Cloudflare créé (sans CB enregistrée)

### Étapes

```bash
cd worker
npm install
npx wrangler login          # ouvre le navigateur pour s'authentifier
npx wrangler deploy
```

À la fin du `deploy`, wrangler affiche l'URL publique du Worker, du type :
`https://petitbac.profdetweener.workers.dev`

### Tests

- Ouvrir l'URL dans le navigateur → doit afficher `OK — Petit Bac Worker (phase 1)`
- Ouvrir `<URL>/ping` → doit afficher un JSON avec `status: "ok"`

### Phase suivante

Phase 2 : ajout des Durable Objects et des WebSockets (lobby de room).
