/**
 * Vue "in_round" : grille de saisie + timer + bouton STOP.
 *
 * Strategie de sauvegarde :
 *   - le client envoie un submit_answers debounced 500ms apres chaque modif
 *   - le serveur ecrase ses reponses precedentes (dernier gagne)
 *   - quand la manche finit (timer ou STOP), le serveur a la derniere version
 *   - le STOP marque le joueur comme "fini" et termine la manche pour tous
 *
 * Le timer affiche est purement decoratif : c'est le serveur qui decide
 * autoritairement quand la manche se termine (via le message round_ended).
 */

import { LIMITS } from "./constants.js";
import { showToast } from "./toast.js";

export function initRoundView(state, conn) {
  const formEl = document.getElementById("answers-form");
  const roundNumberEl = document.getElementById("round-number");
  const roundTotalEl = document.getElementById("round-total");
  const letterValueEl = document.getElementById("letter-value");
  const timerDisplayEl = document.getElementById("timer-display");
  const timerValueEl = document.getElementById("timer-value");
  const stopBtn = document.getElementById("btn-stop");
  const submissionStatusEl = document.getElementById("submission-status");

  let timerIntervalId = null;
  let inputs = {};       // category -> input element
  let saveTimeoutId = null;
  let stopped = false;   // l'utilisateur a clique STOP

  /**
   * Construit le formulaire avec un input par categorie.
   */
  state.renderRoundStart = function (msg) {
    stopped = false;
    stopBtn.disabled = true; // grise par defaut, active quand toutes les cases sont remplies
    stopBtn.textContent = "🛑 STOP — j'ai termine";
    submissionStatusEl.textContent = "Remplis toutes les cases pour pouvoir cliquer STOP.";

    roundNumberEl.textContent = msg.roundNumber;
    const total = msg.totalRounds ?? state.config?.totalRounds ?? 0;
    if (total > 0) {
      roundTotalEl.textContent = `/ ${total}`;
    } else {
      roundTotalEl.textContent = "";
    }
    letterValueEl.textContent = msg.letter;

    // Construire le formulaire
    formEl.innerHTML = "";
    inputs = {};
    msg.categories.forEach((category, idx) => {
      const row = document.createElement("div");
      row.className = "answer-row";
      const label = document.createElement("label");
      label.textContent = `${category} en ${msg.letter}…`;
      label.htmlFor = `answer-${idx}`;
      const input = document.createElement("input");
      input.type = "text";
      input.id = `answer-${idx}`;
      input.maxLength = LIMITS.MAX_ANSWER_LEN;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.category = category;
      row.appendChild(label);
      row.appendChild(input);
      formEl.appendChild(row);
      inputs[category] = input;
    });

    // Focus sur la premiere case
    const firstInput = formEl.querySelector("input");
    if (firstInput) firstInput.focus();

    // Demarrer le compte a rebours
    startCountdown(msg.roundEndsAt);
  };

  function startCountdown(roundEndsAt) {
    if (timerIntervalId) clearInterval(timerIntervalId);
    function tick() {
      const remainingMs = roundEndsAt - Date.now();
      if (remainingMs <= 0) {
        timerValueEl.textContent = "00:00";
        timerDisplayEl.classList.add("critical");
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        return;
      }
      const totalSec = Math.ceil(remainingMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      timerValueEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      timerDisplayEl.classList.remove("warning", "critical");
      if (totalSec <= 5) {
        timerDisplayEl.classList.add("critical");
      } else if (totalSec <= 15) {
        timerDisplayEl.classList.add("warning");
      }
    }
    tick();
    timerIntervalId = setInterval(tick, 200);
  }

  state.stopRoundCountdown = function () {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }
  };

  function collectAnswers() {
    const answers = {};
    for (const [cat, input] of Object.entries(inputs)) {
      answers[cat] = input.value.slice(0, LIMITS.MAX_ANSWER_LEN);
    }
    return answers;
  }

  /**
   * Envoie l'etat courant des reponses au serveur.
   * Appele en debounced sur input, et immediatement avant un STOP.
   */
  function pushAnswers() {
    if (stopped) return;
    conn.send({ type: "submit_answers", answers: collectAnswers() });
  }

  /**
   * Verifie si toutes les cases sont remplies (au moins un caractere non blanc).
   * Active/desactive le bouton STOP en consequence.
   * Note : on ne verifie PAS que la lettre est correcte (laissant les joueurs
   * libres de soumettre quelque chose qui sera invalide au vote).
   */
  function refreshStopButton() {
    if (stopped) return;
    const allFilled = Object.values(inputs).every(
      (input) => input.value.trim().length > 0
    );
    stopBtn.disabled = !allFilled;
    if (allFilled) {
      submissionStatusEl.textContent = "";
    } else {
      const filled = Object.values(inputs).filter(
        (i) => i.value.trim().length > 0
      ).length;
      const total = Object.keys(inputs).length;
      submissionStatusEl.textContent = `${filled} / ${total} cases remplies — remplis toutes les cases pour pouvoir cliquer STOP.`;
    }
  }

  // --- Sauvegarde continue ---
  formEl.addEventListener("input", () => {
    if (stopped) return;
    refreshStopButton();
    if (saveTimeoutId) clearTimeout(saveTimeoutId);
    saveTimeoutId = setTimeout(pushAnswers, 500);
  });

  // --- STOP ---
  stopBtn.addEventListener("click", () => {
    if (stopped) return;
    // Defense en profondeur : meme si le bouton n'etait pas grise (cas non prevu),
    // on refuse le STOP si la grille n'est pas complete.
    const allFilled = Object.values(inputs).every(
      (input) => input.value.trim().length > 0
    );
    if (!allFilled) {
      console.warn("[round] STOP refuse : grille incomplete", {
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([k, v]) => [k, v.value])
        ),
      });
      showToast("Remplis toutes les cases avant de cliquer STOP.", { type: "error" });
      refreshStopButton();
      return;
    }
    stopped = true;
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }
    // Envoie immediat des reponses courantes, puis stop_round
    conn.send({ type: "submit_answers", answers: collectAnswers() });
    conn.send({ type: "stop_round" });
    stopBtn.disabled = true;
    stopBtn.textContent = "Manche stoppee, en attente de la suite…";
    submissionStatusEl.textContent = "Tes reponses ont ete envoyees.";
    showToast("STOP envoye.", { type: "success", duration: 1500 });
  });

  // --- Navigation au clavier ---
  formEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    const allInputs = formEl.querySelectorAll("input");
    const idx = Array.from(allInputs).indexOf(e.target);
    if (idx === allInputs.length - 1) {
      // Dernier champ : STOP seulement si la grille est complete
      if (!stopBtn.disabled) {
        stopBtn.click();
      }
    } else {
      allInputs[idx + 1].focus();
    }
  });

  // --- Notifications "X a fini" ---
  state.onAnswersReceived = function (pseudo) {
    if (pseudo === state.myPseudo) return;
    submissionStatusEl.textContent = `${pseudo} a termine.`;
  };
}
