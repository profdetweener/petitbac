/**
 * RoomDO — Durable Object représentant une room de Petit Bac.
 *
 * Phase 2 : version minimale pour valider la chaîne WebSocket.
 *   - Accepte les connexions WebSocket entrantes
 *   - Garde un compteur de connexions actives en mémoire
 *   - Fait l'echo des messages reçus, préfixés par "[echo]"
 *   - Envoie un message d'accueil à la connexion
 *
 * Phases suivantes : pseudos, host, manches, scoring, modération.
 */

export class RoomDO {
  private state: DurableObjectState;
  private connections: Set<WebSocket>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.connections = new Set();
  }

  async fetch(request: Request): Promise<Response> {
    // On ne fait que gérer l'upgrade WebSocket pour l'instant.
    // Le routeur principal (index.ts) a déjà filtré pour ne nous envoyer
    // que les requêtes /room/:code avec en-tête Upgrade: websocket.
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Initialise une session WebSocket côté serveur.
   * Phase 2 : echo simple. Phase 3+ : routage des messages typés.
   */
  private handleSession(ws: WebSocket): void {
    // accept() est obligatoire avant tout envoi/réception
    ws.accept();
    this.connections.add(ws);

    // Message d'accueil avec le nombre de connexions actives
    this.send(ws, {
      type: "welcome",
      message: "Connexion WebSocket etablie",
      activeConnections: this.connections.size,
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      // Echo : on renvoie le message reçu, préfixé pour qu'on voie clairement
      // que le round-trip serveur a bien eu lieu.
      let payload: unknown;
      try {
        payload =
          typeof event.data === "string"
            ? event.data
            : "(message binaire ignore)";
      } catch {
        payload = "(message illisible)";
      }

      this.send(ws, {
        type: "echo",
        received: payload,
        at: new Date().toISOString(),
      });
    });

    ws.addEventListener("close", () => {
      this.connections.delete(ws);
    });

    ws.addEventListener("error", () => {
      this.connections.delete(ws);
    });
  }

  /**
   * Helper d'envoi avec gestion d'erreur (le client peut s'être déconnecté
   * juste avant qu'on tente d'envoyer).
   */
  private send(ws: WebSocket, data: unknown): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Connexion fermée entre temps : on retire silencieusement
      this.connections.delete(ws);
    }
  }
}
