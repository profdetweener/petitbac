/**
 * Orchestrateur principal de la page room.html.
 *
 * Role :
 *   - lit le code de room (URL) et le pseudo (sessionStorage)
 *   - ouvre la connexion WebSocket via RoomConnection
 *   - maintient un objet `state` partage avec les vues
 *   - dispatche les messages serveur vers les modules de vue appropries
 *   - bascule entre les 5 vues (lobby / round / validating / scoring / finished)
 */

import { RoomConnection } from "./ws.js";
import { showToast } from "./toast.js";
import { initLobbyView } from "./view-lobby.js";
import { initRoundView } from "./view-round.js";
import { initValidatingView } from "./view-validating.js";
import { initScoringView } from "./view-scoring.js";
import { initFinishedView } from "./view-finished.js";

// ===========================================
// 1. Contexte initial
// ===========================================

const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("code") || sessionStorage.getItem("petitbac_room") || "").toUpperCase();
const pseudo = sessionStorage.getItem("petitbac_pseudo") || "";

if (!roomCode || !pseudo) {
  window.location.href = "index.html";
}

document.getElementById("room-code").textContent = roomCode;

// ===========================================
// 2. Etat partage avec les vues
// ===========================================

const state = {
  myPseudo: pseudo,
  isHost: false,
  hostPseudo: "",
  players: [],
  phase: "lobby",
  config: null,
  currentRound: 0,
  letter: null,
  // Methodes implementees par les vues (renderPlayers, showError, ...)
};

// ===========================================
// 3. Gestion des vues
// ===========================================

const views = {
  lobby: document.getElementById("view-lobby"),
  in_round: document.getElementById("view-round"),
  validating: document.getElementById("view-validating"),
  scoring: document.getElementById("view-scoring"),
  finished: document.getElementById("view-finished"),
};

function showView(phase) {
  for (const [key, el] of Object.entries(views)) {
    el.style.display = key === phase ? "block" : "none";
  }
  // Stop le countdown si on quitte in_round
  if (phase !== "in_round" && state.stopRoundCountdown) {
    state.stopRoundCountdown();
  }
}

// ===========================================
// 4. Initialisation des vues
// ===========================================

const conn = new RoomConnection(roomCode);

initLobbyView(state, conn);
initRoundView(state, conn);
initValidatingView(state, conn);
initScoringView(state, conn);
initFinishedView(state, conn);

// ===========================================
// 5. Indicateur de connexion
// ===========================================

const connectionStatusEl = document.getElementById("connection-status");
conn.onStatus((status) => {
  connectionStatusEl.classList.remove("connected", "connecting", "disconnected");
  const textEl = connectionStatusEl.querySelector(".text");
  if (status === "open") {
    connectionStatusEl.classList.add("connected");
    textEl.textContent = "connecte";
    conn.send({ type: "join", pseudo: state.myPseudo });
  } else if (status === "connecting") {
    connectionStatusEl.classList.add("connecting");
    textEl.textContent = "connexion…";
  } else {
    connectionStatusEl.classList.add("disconnected");
    textEl.textContent = "deconnecte (reconnexion auto)";
  }
});

// ===========================================
// 6. Dispatch des messages serveur
// ===========================================

conn.on("joined", (msg) => {
  state.isHost = msg.isHost;
  state.hostPseudo = msg.hostPseudo;
  state.players = msg.players;
  state.phase = msg.phase;
  state.config = msg.config;
  state.currentRound = msg.currentRound;
  state.letter = msg.letter;

  state.renderPlayers();
  state.clearError && state.clearError();

  // Si je suis host et qu'une config existe deja (cas migration host en lobby),
  // synchroniser mes inputs avec la config courante
  if (msg.isHost && msg.phase === "lobby" && msg.config && state.applyConfigToHostInputs) {
    state.applyConfigToHostInputs(msg.config);
  }
  // Si je ne suis pas host et qu'une config existe deja, l'afficher en lecture seule
  if (!msg.isHost && msg.phase === "lobby" && msg.config && state.applyGuestConfig) {
    state.applyGuestConfig(msg.config);
  }

  // Si je suis host et qu'on est en lobby, pousser immediatement ma config
  // courante au serveur. Ca couvre :
  //   - le 1er chargement de la page (server.config = null au demarrage)
  //   - une migration d'hote (l'ancien hote a quitte, le nouveau pousse sa
  //     config locale, qui peut differer de la derniere connue du serveur)
  // De cette facon, les futurs joueurs qui rejoignent voient bien la config.
  if (msg.isHost && msg.phase === "lobby" && state.pushHostConfigNow) {
    state.pushHostConfigNow();
  }

  // Si on rejoint en cours de partie, reconstruire l'etat de la vue active
  if (msg.phase === "in_round" && msg.letter && msg.config) {
    state.renderRoundStart({
      roundNumber: msg.currentRound,
      totalRounds: msg.config.totalRounds,
      letter: msg.letter,
      categories: msg.config.categories,
      timerSeconds: msg.config.timerSeconds,
      roundEndsAt: msg.roundEndsAt ?? Date.now(),
      // Reconnexion / refresh : pre-remplit la grille avec les reponses
      // que le serveur a deja recues de notre part. null si on n'avait
      // rien envoye, ou si on rejoint pour la premiere fois en cours
      // de manche (on n'aura alors pas encore d'historique).
      previousAnswers: msg.myAnswers ?? null,
    });
  } else if (msg.phase === "validating" && msg.currentResult) {
    state.renderValidationStart({
      reason: "all_submitted",
      stoppedBy: null,
      categories: msg.config?.categories ?? [],
      totalRounds: msg.config?.totalRounds ?? 0,
      result: msg.currentResult,
    });
  } else if (msg.phase === "scoring" && msg.currentResult) {
    state.renderScoring({
      categories: msg.config?.categories ?? [],
      totalRounds: msg.config?.totalRounds ?? 0,
      result: msg.currentResult,
      players: msg.players,
    });
  } else if (msg.phase === "finished" && msg.finalRanking) {
    state.renderFinished(msg.finalRanking);
  }

  showView(msg.phase);
});

conn.on("room_state", (msg) => {
  state.players = msg.players;
  state.hostPseudo = msg.hostPseudo;
  const me = msg.players.find((p) => p.pseudo === state.myPseudo);
  const wasHost = state.isHost;
  state.isHost = me ? me.isHost : false;

  if (!wasHost && state.isHost) {
    showToast("Tu es devenu l'hote.", { type: "success" });
    // Migration d'hote en lobby : nos inputs affichaient la version "guest"
    // (lecture seule). On les synchronise avec la derniere config connue
    // pour que le nouvel hote reprenne exactement la config qui etait
    // en cours d'edition, et non les defauts locaux (sinon on perdrait
    // par exemple les categories ajoutees, le bareme modifie, etc.).
    if (state.phase === "lobby" && state.config && state.applyConfigToHostInputs) {
      state.applyConfigToHostInputs(state.config);
    }
    // Puis on pousse cette config au serveur pour rester source de verite
    // et pour que les futurs joueurs la voient bien.
    if (state.phase === "lobby" && state.pushHostConfigNow) {
      state.pushHostConfigNow();
    }
  }

  state.phase = msg.phase;

  // Le rendu depend de la phase active
  if (msg.phase === "lobby") {
    state.renderPlayers();
  }
  // Mettre a jour l'affichage des actions host pour les autres vues
  if (state.refreshValidationHostState) state.refreshValidationHostState();
  if (state.refreshScoringHostState) state.refreshScoringHostState();
  if (state.refreshFinishedHostState) state.refreshFinishedHostState();

  showView(msg.phase);
});

conn.on("kicked", (msg) => {
  conn.close();
  alert(`Tu as ete exclu de la partie.\nRaison : ${msg.reason || "non precisee"}`);
  window.location.href = "index.html";
});

conn.on("error", (msg) => {
  console.warn("Erreur serveur :", msg);
  switch (msg.code) {
    case "PSEUDO_TAKEN":
      state.showError && state.showError("Ce pseudo est deja pris.");
      conn.close();
      setTimeout(() => (window.location.href = "index.html"), 2500);
      break;
    case "ROOM_FULL":
    case "ROOM_NOT_FOUND":
    case "PSEUDO_INVALID":
      state.showError && state.showError(msg.message || "Erreur.");
      conn.close();
      setTimeout(() => (window.location.href = "index.html"), 2500);
      break;
    case "WRONG_PHASE":
      // Cas typique : on essaie de rejoindre une partie en cours
      if (state.phase === "lobby") {
        showToast(msg.message || "Action impossible dans cette phase.", { type: "error" });
      } else {
        state.showError && state.showError(msg.message || "Une partie est deja en cours.");
        conn.close();
        setTimeout(() => (window.location.href = "index.html"), 2500);
      }
      break;
    case "NOT_HOST":
      showToast("Seul l'hote peut faire ca.", { type: "error" });
      break;
    case "TARGET_NOT_FOUND":
    case "CANNOT_KICK_SELF":
    case "ALREADY_SUBMITTED":
    case "INVALID_CONFIG":
    case "NOT_ENOUGH_PLAYERS":
      showToast(msg.message || "Erreur.", { type: "error" });
      break;
    default:
      showToast(msg.message || "Erreur inconnue.", { type: "error" });
  }
});

// === Phase 4 ===

conn.on("config_update", (msg) => {
  console.log("[lobby] config_update reçu", {
    isHost: state.isHost,
    myPseudo: state.myPseudo,
    hasConfig: !!msg.config,
    categoriesLen: msg.config?.categories?.length ?? 0,
  });
  // Diffuse par le host : on met a jour notre state.config et la vue lecture seule
  state.config = msg.config;
  if (!state.isHost && state.applyGuestConfig) {
    state.applyGuestConfig(msg.config);
  }
});

conn.on("round_started", (msg) => {
  state.phase = "in_round";
  state.currentRound = msg.roundNumber;
  state.letter = msg.letter;
  // Garde la config a jour avec les donnees du message (defensif)
  if (msg.categories && state.config) {
    state.config.categories = msg.categories;
    state.config.totalRounds = msg.totalRounds ?? state.config.totalRounds;
  }
  state.renderRoundStart(msg);
  showView("in_round");
});

conn.on("answers_received", (msg) => {
  if (state.onAnswersReceived) state.onAnswersReceived(msg.pseudo);
});

conn.on("round_ended", (msg) => {
  state.phase = "validating";
  if (msg.categories && state.config) {
    state.config.categories = msg.categories;
    state.config.totalRounds = msg.totalRounds ?? state.config.totalRounds;
  }
  state.renderValidationStart(msg);
  showView("validating");
});

conn.on("cell_state_update", (msg) => {
  if (state.applyCellStateUpdate) state.applyCellStateUpdate(msg.cellStates);
});

conn.on("round_scored", (msg) => {
  state.phase = "scoring";
  state.players = msg.players;
  if (msg.categories && state.config) {
    state.config.categories = msg.categories;
    state.config.totalRounds = msg.totalRounds ?? state.config.totalRounds;
  }
  state.renderScoring(msg);
  showView("scoring");
});

conn.on("game_finished", (msg) => {
  state.phase = "finished";
  state.renderFinished(msg.ranking);
  showView("finished");
});

// ===========================================
// 7. Bouton "Copier le code"
// ===========================================

const copyBtn = document.getElementById("copy-btn");
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    showToast("Code copie !", { type: "success", duration: 1500 });
  } catch {
    const range = document.createRange();
    range.selectNode(document.getElementById("room-code"));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    showToast("Selectionne et copie le code (Ctrl+C).", { duration: 2500 });
  }
});

// ===========================================
// 8. Cleanup
// ===========================================

window.addEventListener("beforeunload", () => {
  conn.close();
});

// ===========================================
// 9. Connexion
// ===========================================

conn.connect();
