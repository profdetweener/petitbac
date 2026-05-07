/**
 * Petit Bac Multijoueur — Worker (phase 1 : Hello World)
 *
 * Objectif minimal : valider la chaîne wrangler + déploiement Cloudflare.
 * Le Worker répond "OK" sur la racine et un petit JSON sur /ping.
 *
 * Phase 2 : ajout des Durable Objects et des WebSockets.
 */

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Endpoint de santé : utile pour vérifier que tout fonctionne
    if (url.pathname === "/ping") {
      return Response.json({
        status: "ok",
        service: "petitbac",
        phase: 1,
        timestamp: new Date().toISOString(),
      });
    }

    // Racine : un simple OK lisible dans le navigateur
    if (url.pathname === "/") {
      return new Response("OK — Petit Bac Worker (phase 1)\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
