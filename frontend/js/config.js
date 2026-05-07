/**
 * Configuration globale du frontend.
 *
 * Un seul endroit a modifier pour pointer vers le bon Worker.
 * En dev : URL .workers.dev. En prod (phase 7) : meme chose ou domaine custom.
 */

export const CONFIG = {
  // URL du Worker Cloudflare. A remplacer par TON URL.
  // Tu l'as obtenue a la fin de `npx wrangler deploy` en phase 1.
  // Exemple : "https://petitbac.profdetweener.workers.dev"
  WORKER_URL: "https://petitbac.profdetweener.workers.dev",

  // Derive automatiquement l'URL WebSocket (ws:// ou wss://) a partir de WORKER_URL.
  get WS_URL() {
    return this.WORKER_URL.replace(/^http/, "ws");
  },

  // Delai avant tentative de reconnexion WebSocket (ms)
  WS_RECONNECT_DELAY: 2000,
};
