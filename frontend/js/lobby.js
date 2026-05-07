/**
 * Logique de la page room.html :
 *   - lit le code de room dans l'URL et le pseudo en sessionStorage
 *   - ouvre une connexion WebSocket via RoomConnection
 *   - envoie `join` avec le pseudo
 *   - rend la liste des joueurs a chaque `room_state`
 *   - permet au host de kicker (envoie `kick` avec targetPseudo)
 *   - affiche les erreurs serveur (PSEUDO_TAKEN, ROOM_FULL, ...)
 */

import { RoomConnection } from "./ws.js";
import { showToast } from "./toast.js";

// ===========================================
// 1. Lecture du contexte (code de room + pseudo)
// ===========================================

const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("code") || sessionStorage.getItem("petitbac_room") || "").toUpperCase();
const pseudo = sessionStorage.getItem("petitbac_pseudo") || "";

if (!roomCode || !pseudo) {
  // Sans contexte, on renvoie a l'accueil
  window.location.href = "index.html";
}

// ===========================================
// 2. References DOM
// ===========================================

const roomCodeEl = document.getElementById("room-code");
const copyBtn = document.getElementById("copy-btn");
const playersListEl = document.getElementById("players-list");
const playersCountEl = document.getElementById("players-count");
const hostActionsEl = document.getElementById("host-actions");
const connectionStatusEl = document.getElementById("connection-status");
const errorBox = document.getElementById("error-box");
const infoBox = document.getElementById("info-box");

roomCodeEl.textContent = roomCode;

// ===========================================
// 3. Etat local (mis a jour par les messages serveur)
// ===========================================

const localState = {
  myPseudo: pseudo,
  isHost: false,
  hostPseudo: "",
  players: [], // PlayerInfo[]
  joined: false, // true des qu'on a recu "joined"
};

// ===========================================
// 4. Connexion WebSocket
// ===========================================

const conn = new RoomConnection(roomCode);

// Indicateur visuel de l'etat de connexion
conn.onStatus((status) => {
  connectionStatusEl.classList.remove("connected", "connecting", "disconnected");
  const textEl = connectionStatusEl.querySelector(".text");

  if (status === "open") {
    connectionStatusEl.classList.add("connected");
    textEl.textContent = "connecte";
    // Au passage a OPEN, on (re)envoie le join
    conn.send({ type: "join", pseudo: localState.myPseudo });
  } else if (status === "connecting") {
    connectionStatusEl.classList.add("connecting");
    textEl.textContent = "connexion…";
  } else if (status === "closed" || status === "error" || status === "idle") {
    connectionStatusEl.classList.add("disconnected");
    textEl.textContent = "deconnecte (reconnexion auto)";
  }
});

// --- Reception du handshake `joined` ---
conn.on("joined", (msg) => {
  localState.joined = true;
  localState.isHost = msg.isHost;
  localState.hostPseudo = msg.hostPseudo;
  localState.players = msg.players;
  renderPlayers();
  renderHostActions();
  clearError();
  if (msg.isHost) {
    showInfo("Tu es l'hote de cette partie.");
  }
});

// --- Mises a jour de l'etat de la room ---
conn.on("room_state", (msg) => {
  localState.players = msg.players;
  localState.hostPseudo = msg.hostPseudo;
  // L'hote peut avoir change si l'ancien est parti
  const me = msg.players.find((p) => p.pseudo === localState.myPseudo);
  const wasHost = localState.isHost;
  localState.isHost = me ? me.isHost : false;
  if (!wasHost && localState.isHost) {
    showToast("Tu es devenu l'hote de la partie.", { type: "success" });
  }
  renderPlayers();
  renderHostActions();
});

// --- On a ete kicke ---
conn.on("kicked", (msg) => {
  conn.close();
  alert(`Tu as ete exclu de la partie.\nRaison : ${msg.reason || "non precisee"}`);
  window.location.href = "index.html";
});

// --- Erreur serveur ---
conn.on("error", (msg) => {
  console.warn("Erreur serveur :", msg);
  switch (msg.code) {
    case "PSEUDO_TAKEN":
      showError("Ce pseudo est deja pris dans cette partie. Reviens en arriere et choisis-en un autre.");
      conn.close();
      setTimeout(() => (window.location.href = "index.html"), 2500);
      break;
    case "ROOM_FULL":
      showError("La partie est pleine. Reviens en arriere et essaie une autre.");
      conn.close();
      setTimeout(() => (window.location.href = "index.html"), 2500);
      break;
    case "ROOM_NOT_FOUND":
      showError("Cette partie n'existe pas ou a expire.");
      conn.close();
      setTimeout(() => (window.location.href = "index.html"), 2500);
      break;
    case "PSEUDO_INVALID":
      showError(msg.message || "Pseudo invalide.");
      conn.close();
      setTimeout(() => (window.location.href = "index.html"), 2500);
      break;
    case "NOT_HOST":
      showToast("Seul l'hote peut faire ca.", { type: "error" });
      break;
    case "TARGET_NOT_FOUND":
      showToast("Joueur introuvable.", { type: "error" });
      break;
    case "CANNOT_KICK_SELF":
      showToast("Tu ne peux pas t'exclure toi-meme.", { type: "error" });
      break;
    default:
      showToast(msg.message || "Erreur inconnue.", { type: "error" });
  }
});

conn.connect();

// ===========================================
// 5. Rendu de la liste des joueurs
// ===========================================

function renderPlayers() {
  const players = localState.players;
  playersCountEl.textContent = `${players.length} joueur${players.length > 1 ? "s" : ""}`;
  playersListEl.innerHTML = "";

  for (const p of players) {
    const li = document.createElement("li");
    li.className = "player-item";
    if (p.isHost) li.classList.add("is-host");
    if (p.pseudo === localState.myPseudo) li.classList.add("is-self");

    const info = document.createElement("div");
    info.className = "player-info";

    const name = document.createElement("span");
    name.textContent = p.pseudo;
    info.appendChild(name);

    if (p.isHost) {
      const badge = document.createElement("span");
      badge.className = "player-badge host";
      badge.textContent = "Hote";
      info.appendChild(badge);
    }
    if (p.pseudo === localState.myPseudo) {
      const badge = document.createElement("span");
      badge.className = "player-badge self";
      badge.textContent = "Toi";
      info.appendChild(badge);
    }

    li.appendChild(info);

    // Bouton kick : visible uniquement si je suis host et que ce n'est pas moi
    if (localState.isHost && p.pseudo !== localState.myPseudo) {
      const kickBtn = document.createElement("button");
      kickBtn.className = "btn btn-danger btn-sm";
      kickBtn.textContent = "Exclure";
      kickBtn.addEventListener("click", () => {
        if (confirm(`Exclure ${p.pseudo} de la partie ?`)) {
          conn.send({ type: "kick", targetPseudo: p.pseudo });
        }
      });
      li.appendChild(kickBtn);
    }

    playersListEl.appendChild(li);
  }
}

// ===========================================
// 6. Affichage des actions du host
// ===========================================

function renderHostActions() {
  hostActionsEl.style.display = localState.isHost ? "block" : "none";
}

// ===========================================
// 7. Bouton "Copier le code"
// ===========================================

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    showToast("Code copie !", { type: "success", duration: 1500 });
  } catch {
    // Fallback : selection manuelle
    const range = document.createRange();
    range.selectNode(roomCodeEl);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    showToast("Selectionne et copie le code (Ctrl+C).", { duration: 2500 });
  }
});

// ===========================================
// 8. Helpers d'affichage des messages
// ===========================================

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("show");
  infoBox.classList.remove("show");
}

function clearError() {
  errorBox.classList.remove("show");
}

function showInfo(msg) {
  infoBox.textContent = msg;
  infoBox.classList.add("show");
}

// ===========================================
// 9. Sortie propre quand on quitte la page
// ===========================================

window.addEventListener("beforeunload", () => {
  conn.close();
});
