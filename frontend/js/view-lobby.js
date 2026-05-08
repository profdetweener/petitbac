/**
 * Vue "lobby" : liste des joueurs, code de room, configuration de partie.
 *
 * Deux modes selon que le joueur est host ou non :
 *   - host   : edite la config, chaque modif est diffusee aux autres via config_update
 *   - autre  : voit la config en lecture seule, mise a jour en temps reel
 */

import { CATEGORY_PRESETS, LIMITS } from "./constants.js";
import { showToast } from "./toast.js";

export function initLobbyView(state, conn) {
  // --- References DOM (host) ---
  const playersListEl = document.getElementById("players-list");
  const playersCountEl = document.getElementById("players-count");
  const hostActionsEl = document.getElementById("host-actions");
  const guestConfigEl = document.getElementById("guest-config");
  const errorBox = document.getElementById("error-box");
  const infoBox = document.getElementById("info-box");
  const presetsContainer = document.getElementById("categories-presets");
  const customInput = document.getElementById("custom-category-input");
  const addCategoryBtn = document.getElementById("add-category-btn");
  const selectedList = document.getElementById("categories-selected");
  const roundsInput = document.getElementById("rounds-input");
  const timerInput = document.getElementById("timer-input");
  const scoreInputs = {
    aloneInCategory: document.getElementById("score-alone"),
    uniqueAnswer: document.getElementById("score-unique"),
    duplicateAnswer: document.getElementById("score-duplicate"),
    invalidOrEmpty: document.getElementById("score-invalid"),
  };
  const startGameBtn = document.getElementById("btn-start-game");

  // --- References DOM (guest) ---
  const guestEls = {
    categories: document.getElementById("guest-categories"),
    rounds: document.getElementById("guest-rounds"),
    timer: document.getElementById("guest-timer"),
    scoreAlone: document.getElementById("guest-score-alone"),
    scoreUnique: document.getElementById("guest-score-unique"),
    scoreDuplicate: document.getElementById("guest-score-duplicate"),
    scoreInvalid: document.getElementById("guest-score-invalid"),
  };

  // --- Etat local de la config (host uniquement) ---
  const localCategories = new Set();

  // --- Debounce pour ne pas spammer le serveur a chaque keystroke ---
  let pushConfigTimeoutId = null;
  function pushConfigSoon() {
    if (!state.isHost) return;
    if (pushConfigTimeoutId) clearTimeout(pushConfigTimeoutId);
    pushConfigTimeoutId = setTimeout(() => {
      conn.send({ type: "config_update", config: buildCurrentConfig() });
    }, 150);
  }

  // Push immediat (utilise quand l'hote vient d'etre confirme via `joined`
  // ou via une migration d'hote, pour etre sur que le serveur ait notre
  // config avant que d'autres joueurs ne rejoignent).
  function pushConfigNow() {
    if (!state.isHost) return;
    if (pushConfigTimeoutId) {
      clearTimeout(pushConfigTimeoutId);
      pushConfigTimeoutId = null;
    }
    conn.send({ type: "config_update", config: buildCurrentConfig() });
  }
  state.pushHostConfigNow = pushConfigNow;

  function buildCurrentConfig() {
    const totalRounds = parseInt(roundsInput.value, 10);
    const timerSeconds = parseInt(timerInput.value, 10);
    const scoring = {
      aloneInCategory: parseInt(scoreInputs.aloneInCategory.value, 10) || 0,
      uniqueAnswer: parseInt(scoreInputs.uniqueAnswer.value, 10) || 0,
      duplicateAnswer: parseInt(scoreInputs.duplicateAnswer.value, 10) || 0,
      invalidOrEmpty: parseInt(scoreInputs.invalidOrEmpty.value, 10) || 0,
    };
    return {
      categories: [...localCategories],
      totalRounds: Number.isFinite(totalRounds) ? totalRounds : 5,
      timerSeconds: Number.isFinite(timerSeconds) ? timerSeconds : 90,
      scoring,
    };
  }

  // --- Rendu des chips presets ---
  for (const cat of CATEGORY_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-preset-btn";
    btn.textContent = cat;
    btn.dataset.category = cat;
    btn.addEventListener("click", () => {
      if (localCategories.has(cat)) {
        localCategories.delete(cat);
      } else {
        if (localCategories.size >= LIMITS.MAX_CATEGORIES) {
          showToast(`Max ${LIMITS.MAX_CATEGORIES} categories.`, { type: "error" });
          return;
        }
        localCategories.add(cat);
      }
      renderCategoriesHost();
      pushConfigSoon();
    });
    presetsContainer.appendChild(btn);
  }

  function renderCategoriesHost() {
    for (const btn of presetsContainer.children) {
      btn.classList.toggle("selected", localCategories.has(btn.dataset.category));
    }
    selectedList.innerHTML = "";
    for (const cat of localCategories) {
      const li = document.createElement("li");
      li.textContent = cat;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Retirer";
      remove.addEventListener("click", () => {
        localCategories.delete(cat);
        renderCategoriesHost();
        pushConfigSoon();
      });
      li.appendChild(remove);
      selectedList.appendChild(li);
    }
  }

  // --- Ajout categorie libre ---
  function addCustomCategory() {
    const value = customInput.value.trim();
    if (!value) return;
    if (value.length > 30) {
      showToast("Categorie trop longue (max 30 caracteres).", { type: "error" });
      return;
    }
    if (localCategories.size >= LIMITS.MAX_CATEGORIES) {
      showToast(`Max ${LIMITS.MAX_CATEGORIES} categories.`, { type: "error" });
      return;
    }
    if ([...localCategories].some((c) => c.toLowerCase() === value.toLowerCase())) {
      showToast("Categorie deja selectionnee.", { type: "error" });
      return;
    }
    localCategories.add(value);
    customInput.value = "";
    renderCategoriesHost();
    pushConfigSoon();
  }

  addCategoryBtn.addEventListener("click", addCustomCategory);
  customInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomCategory();
    }
  });

  // --- Push de config a chaque modif des autres champs ---
  for (const el of [roundsInput, timerInput, ...Object.values(scoreInputs)]) {
    el.addEventListener("change", pushConfigSoon);
    el.addEventListener("input", pushConfigSoon);
  }

  // --- Pre-selection : 5 categories classiques par defaut ---
  for (const c of ["Pays", "Ville", "Animal", "Prenom", "Metier"]) {
    localCategories.add(c);
  }
  renderCategoriesHost();

  // ===========================================
  // Rendu pour les non-hotes (lecture seule)
  // ===========================================

  state.applyGuestConfig = function (config) {
    if (!config) return;
    // Categories
    guestEls.categories.innerHTML = "";
    for (const cat of config.categories || []) {
      const li = document.createElement("li");
      li.textContent = cat;
      guestEls.categories.appendChild(li);
    }
    // Manches
    if (config.totalRounds === 0) {
      guestEls.rounds.textContent = "Illimite";
    } else {
      guestEls.rounds.textContent = `${config.totalRounds} manches`;
    }
    guestEls.timer.textContent = `${config.timerSeconds} sec`;
    if (config.scoring) {
      guestEls.scoreAlone.textContent = config.scoring.aloneInCategory;
      guestEls.scoreUnique.textContent = config.scoring.uniqueAnswer;
      guestEls.scoreDuplicate.textContent = config.scoring.duplicateAnswer;
      guestEls.scoreInvalid.textContent = config.scoring.invalidOrEmpty;
    }
  };

  // Si on rejoint et qu'on a deja recu une config (joined), on l'applique
  state.applyConfigToHostInputs = function (config) {
    // Utilise quand un nouveau host prend le relais (host migration en lobby)
    if (!config || !state.isHost) return;
    localCategories.clear();
    for (const c of config.categories || []) localCategories.add(c);
    renderCategoriesHost();
    if (config.totalRounds !== undefined) roundsInput.value = String(config.totalRounds);
    if (config.timerSeconds !== undefined) timerInput.value = String(config.timerSeconds);
    if (config.scoring) {
      scoreInputs.aloneInCategory.value = String(config.scoring.aloneInCategory);
      scoreInputs.uniqueAnswer.value = String(config.scoring.uniqueAnswer);
      scoreInputs.duplicateAnswer.value = String(config.scoring.duplicateAnswer);
      scoreInputs.invalidOrEmpty.value = String(config.scoring.invalidOrEmpty);
    }
  };

  // --- Rendu de la liste des joueurs ---
  state.renderPlayers = function () {
    const players = state.players;
    playersCountEl.textContent = `${players.length} joueur${players.length > 1 ? "s" : ""}`;
    playersListEl.innerHTML = "";
    for (const p of players) {
      const li = document.createElement("li");
      li.className = "player-item";
      if (p.isHost) li.classList.add("is-host");
      if (p.pseudo === state.myPseudo) li.classList.add("is-self");
      if (!p.isConnected) li.classList.add("disconnected");

      const info = document.createElement("div");
      info.className = "player-info";
      const name = document.createElement("span");
      name.textContent = p.pseudo;
      info.appendChild(name);
      if (p.isHost) {
        const b = document.createElement("span");
        b.className = "player-badge host";
        b.textContent = "Hote";
        info.appendChild(b);
      }
      if (p.pseudo === state.myPseudo) {
        const b = document.createElement("span");
        b.className = "player-badge self";
        b.textContent = "Toi";
        info.appendChild(b);
      }
      if (!p.isConnected) {
        const b = document.createElement("span");
        b.className = "player-badge disconnected";
        b.textContent = "Hors ligne";
        info.appendChild(b);
      }
      li.appendChild(info);

      if (state.isHost && p.pseudo !== state.myPseudo) {
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

    // Affiche la zone host OU la zone guest selon le role
    console.log("[lobby] renderPlayers", {
      isHost: state.isHost,
      hasConfig: !!state.config,
      configCategories: state.config?.categories?.length ?? 0,
      myPseudo: state.myPseudo,
    });
    if (state.isHost) {
      hostActionsEl.style.display = "block";
      guestConfigEl.style.display = "none";
    } else {
      hostActionsEl.style.display = "none";
      guestConfigEl.style.display = "block";
      // S'il n'y a pas encore de config diffusee, on utilise la config d'etat (ou rien)
      if (state.config) {
        state.applyGuestConfig(state.config);
      }
    }
  };

  // --- Bouton "Demarrer la partie" ---
  startGameBtn.addEventListener("click", () => {
    if (localCategories.size < LIMITS.MIN_CATEGORIES) {
      showToast(`Il faut au moins ${LIMITS.MIN_CATEGORIES} categories.`, { type: "error" });
      return;
    }
    const config = buildCurrentConfig();
    if ([config.scoring.aloneInCategory, config.scoring.uniqueAnswer, config.scoring.duplicateAnswer, config.scoring.invalidOrEmpty].some((n) => Number.isNaN(n))) {
      showToast("Bareme invalide.", { type: "error" });
      return;
    }
    conn.send({ type: "start_game", config });
  });

  // Note : le push initial de la config par l'hote ne se fait pas ici (race
  // avec l'arrivee du message `joined` : si le timer fire avant `joined`,
  // state.isHost vaut encore false et pushConfigSoon ne fait rien, ce qui
  // laisse le serveur avec config=null et les guests qui rejoignent ensuite
  // n'ont pas la config). On declenche pushConfigNow() directement depuis
  // lobby.js dans le handler `joined` quand on est confirme hote.

  // --- Helpers messages ---
  state.showError = function (msg) {
    errorBox.textContent = msg;
    errorBox.classList.add("show");
    infoBox.classList.remove("show");
  };
  state.clearError = function () {
    errorBox.classList.remove("show");
  };
  state.showInfo = function (msg) {
    infoBox.textContent = msg;
    infoBox.classList.add("show");
  };
}
