/**
 * Wrapper minimal autour de WebSocket.
 * Fournit envoi/reception JSON, et un systeme d'event listeners par type de message.
 */
class PetitBacClient {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.ws = null;
    this.listeners = new Map(); // type -> Set<callback>
    this.openListeners = new Set();
    this.closeListeners = new Set();
    this.errorListeners = new Set();
  }

  connect() {
    const url = `${PETITBAC_CONFIG.WORKER_WS_URL}/room/${encodeURIComponent(this.roomCode)}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this.openListeners.forEach((cb) => cb());
    });

    this.ws.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error("Message non-JSON reçu :", event.data);
        return;
      }
      const type = data.type;
      const set = this.listeners.get(type);
      if (set) set.forEach((cb) => cb(data));
    });

    this.ws.addEventListener("close", (event) => {
      this.closeListeners.forEach((cb) => cb(event));
    });

    this.ws.addEventListener("error", () => {
      this.errorListeners.forEach((cb) => cb());
    });
  }

  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket non pret, message ignore :", message);
      return false;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }

  close() {
    if (this.ws) this.ws.close();
  }

  on(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  onOpen(cb) { this.openListeners.add(cb); }
  onClose(cb) { this.closeListeners.add(cb); }
  onError(cb) { this.errorListeners.add(cb); }
}
