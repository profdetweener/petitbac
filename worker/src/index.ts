/**
 * Petit Bac Multijoueur — Worker (phase 4 : routeur, inchange depuis la phase 3).
 *
 * Routes :
 *   GET  /                       → "OK" (sante)
 *   GET  /ping                   → JSON de sante
 *   POST /rooms                  → cree une nouvelle room avec un code unique
 *   GET  /rooms/:code/exists     → verifie si une room existe
 *   GET  /room/:code             → upgrade WebSocket vers le Durable Object RoomDO
 */

import { ROOM_CONFIG } from "./messages";
export { RoomDO } from "./room";

export interface Env {
  ROOMS: DurableObjectNamespace;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ROOM_CODE_REGEX = new RegExp(
  `^[${ROOM_CONFIG.CODE_ALPHABET}]{${ROOM_CONFIG.CODE_LENGTH}}$`
);

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function generateRoomCode(): string {
  const alphabet = ROOM_CONFIG.CODE_ALPHABET;
  let code = "";
  const buf = new Uint8Array(ROOM_CONFIG.CODE_LENGTH);
  crypto.getRandomValues(buf);
  for (let i = 0; i < ROOM_CONFIG.CODE_LENGTH; i++) {
    code += alphabet[buf[i] % alphabet.length];
  }
  return code;
}

async function roomExists(env: Env, code: string): Promise<boolean> {
  const id = env.ROOMS.idFromName(code);
  const stub = env.ROOMS.get(id);
  const res = await stub.fetch("https://internal/__internal/exists");
  const data = (await res.json()) as { exists: boolean };
  return data.exists;
}

async function markRoomInitialized(env: Env, code: string): Promise<void> {
  const id = env.ROOMS.idFromName(code);
  const stub = env.ROOMS.get(id);
  await stub.fetch("https://internal/__internal/init");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/ping") {
      return jsonResponse({
        status: "ok",
        service: "petitbac",
        phase: 4,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/") {
      return new Response("OK — Petit Bac Worker (phase 4)\n", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    // POST /rooms : creation d'une room avec code unique
    if (url.pathname === "/rooms" && request.method === "POST") {
      // On essaie quelques codes au cas ou collision (extremement rare)
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateRoomCode();
        const exists = await roomExists(env, code);
        if (!exists) {
          await markRoomInitialized(env, code);
          return jsonResponse({ code });
        }
      }
      return jsonResponse(
        { error: "Impossible de generer un code unique." },
        { status: 500 }
      );
    }

    // GET /rooms/:code/exists
    const existsMatch = url.pathname.match(/^\/rooms\/([A-Z0-9]+)\/exists$/);
    if (existsMatch && request.method === "GET") {
      const code = existsMatch[1].toUpperCase();
      if (!ROOM_CODE_REGEX.test(code)) {
        return jsonResponse({ exists: false });
      }
      const exists = await roomExists(env, code);
      return jsonResponse({ exists });
    }

    // GET /room/:code (upgrade WebSocket)
    const wsMatch = url.pathname.match(/^\/room\/([A-Z0-9]+)$/);
    if (wsMatch) {
      const code = wsMatch[1].toUpperCase();
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket upgrade", {
          status: 426,
          headers: CORS_HEADERS,
        });
      }
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
