/**
 * Petit Bac Multijoueur — Worker (phase 2 : squelette WebSocket)
 *
 * Routes :
 *   GET  /                 → "OK" (santé)
 *   GET  /ping             → JSON de santé
 *   GET  /room/:code       → upgrade WebSocket vers le Durable Object RoomDO
 *
 * Le Durable Object gère l'état de la room et fait l'echo des messages
 * (la vraie logique de jeu arrivera en phase 3+).
 */

export { RoomDO } from "./room";

export interface Env {
  ROOMS: DurableObjectNamespace;
}

// CORS minimal pour autoriser le frontend (GitHub Pages plus tard, local pour l'instant).
// En phase 2 on est encore en local (file:// ou http://localhost), donc on autorise tout.
// On restreindra à l'origine GitHub Pages exacte en phase 3.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Endpoint /ping (santé)
    if (url.pathname === "/ping") {
      return Response.json(
        {
          status: "ok",
          service: "petitbac",
          phase: 2,
          timestamp: new Date().toISOString(),
        },
        { headers: CORS_HEADERS }
      );
    }

    // Endpoint racine (santé lisible)
    if (url.pathname === "/") {
      return new Response("OK — Petit Bac Worker (phase 2)\n", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    // Endpoint WebSocket : /room/:code
    // Le code de room sert d'identifiant unique pour le Durable Object.
    const roomMatch = url.pathname.match(/^\/room\/([a-zA-Z0-9]{1,16})$/);
    if (roomMatch) {
      const roomCode = roomMatch[1].toUpperCase();

      // Upgrade WebSocket obligatoire : refuse si l'en-tête manque
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket upgrade", {
          status: 426,
          headers: CORS_HEADERS,
        });
      }

      // On délègue au Durable Object correspondant à ce code de room.
      // idFromName produit un ID déterministe à partir du nom : même code → même DO.
      const id = env.ROOMS.idFromName(roomCode);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
