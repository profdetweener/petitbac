/**
 * Logique de la page room :
 *  - Lit le code de room dans la query string
 *  - Recupere le pseudo depuis sessionStorage
 *  - Ouvre la WebSocket et envoie le `join`
 *  - Affiche la liste des joueurs en temps reel via `room_state`
 *  - Si on est host, affiche les boutons "kick"
 */

const $ = (id) => document.getElementById(id);

const errorBox = $("errorBox");
const warnBox = $("warnBox");
const statusEl = $("connectionStatus");
const roomCodeDisplay = $("roomCodeDisplay");
const playerListEl = $("playerList");
const playerCountEl = $("playerCount");
const hostControlsEl = $("hostControls");
const leaveBtn = $("leaveBtn");

// ===========================================
// Etat local
// ===========================================
const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("code") || "").toUpperCase();
let pseudo = "";
try { pseudo = sessionStorage.getItem("petitbac_pseudo") || ""; } catch { /* ignore */ }

let myPseudo = pseudo;
let isHost = false;
let hostPseudo = "";
let players = [];

// ===========================================
// Rendu
// ===========================================

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}
function showWarn(msg) {
  warnBox.textContent = msg;
  warnBox.classList.remove("hidden");
}
function setStatus(text) { statusEl.textContent = text; }

function renderPlayers() {
  playerListEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "player-info";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.pseudo;
    info.appendChild(nameSpan);

    if (p.isHost) {
      const badge = document.createElement("span");
      badge.className = "host-badge";
      badge.textContent = "HOST";
      info.appendChild(badge);
    }

    if (p.pseudo === myPseudo) {
      const you = document.createElement("span");
      you.className = "you-badge";
      you.textContent = "(toi)";
      info.appendChild(you);
    }

    li.appendChild(info);

    // Bouton kick : visible uniquement si je suis host et que ce n'est pas moi
    if (isHost && p.pseudo !== myPseudo) {
      const kickBtn = document.createElement("button");
      kickBtn.className = "danger tiny";
      kickBtn.textContent = "Kick";
      kickBtn.addEventListener("click", () => {
        if (confirm(`Kicker ${p.pseudo} ?`)) {
          client.send({ type: "kick", targetPseudo: p.pseudo });
        }
      });
      li.appendChild(kickBtn);
    }

    playerListEl.appendChild(li);
  }
  playerCountEl.textContent = `(${players.length})`;
  hostControlsEl.classList.toggle("hidden", !isHost);
}

// ===========================================
// Pre-conditions : on a bien un pseudo et un code
// ===========================================

if (!roomCode) {
  showError("Code de room manquant dans l'URL.");
  setStatus("erreur");
  throw new Error("Pas de code");
}
if (!pseudo) {
  showError("Pseudo manquant. Retourne sur l'accueil.");
  setStatus("erreur");
  setTimeout(() => { window.location.href = "index.html"; }, 1500);
  throw new Error("Pas de pseudo");
}

roomCodeDisplay.textContent = roomCode;

// ===========================================
// Connexion WebSocket
// ===========================================

const client = new PetitBacClient(roomCode);

client.onOpen(() => {
  setStatus("connecte — envoi du pseudo...");
  client.send({ type: "join", pseudo });
});

client.on("joined", (msg) => {
  setStatus(`connecte en tant que ${msg.pseudo}${msg.isHost ? " (host)" : ""}`);
  myPseudo = msg.pseudo;
  isHost = msg.isHost;
  hostPseudo = msg.hostPseudo;
  players = msg.players;
  renderPlayers();
});

client.on("room_state", (msg) => {
  hostPseudo = msg.hostPseudo;
  // On verifie si on est devenu host (cas host migration apres depart)
  const me = msg.players.find((p) => p.pseudo === myPseudo);
  if (me) {
    if (!isHost && me.isHost) {
      showWarn("Tu es devenu host (l'ancien host a quitte la room).");
    }
    isHost = me.isHost;
  }
  players = msg.players;
  renderPlayers();
});

client.on("kicked", (msg) => {
  showError(msg.reason || "Tu as ete kicke par le host.");
  setStatus("kicke");
  setTimeout(() => { window.location.href = "index.html"; }, 2500);
});

client.on("error", (msg) => {
  showError(`${msg.message} (${msg.code})`);
  // En cas d'erreur de pseudo (deja pris, invalide), on retourne a l'accueil
  if (msg.code === "PSEUDO_TAKEN" || msg.code === "PSEUDO_INVALID" || msg.code === "ROOM_FULL") {
    setTimeout(() => { window.location.href = "index.html"; }, 2500);
  }
});

client.onClose((event) => {
  // Code 4000 = kick par le host (geree au-dessus). Sinon : deconnexion normale ou reseau.
  if (event.code !== 4000) {
    setStatus("deconnecte");
  }
});

client.onError(() => {
  setStatus("erreur reseau");
  showError("Connexion au serveur impossible.");
});

leaveBtn.addEventListener("click", () => {
  client.close();
  window.location.href = "index.html";
});

// Demarre la connexion
client.connect();
