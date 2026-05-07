/**
 * Logique de la page d'accueil :
 *   - validation cote client du pseudo
 *   - bouton "Creer" : POST /rooms puis redirection vers room.html
 *   - bouton "Rejoindre" : GET /rooms/:code/exists puis redirection
 *
 * Le pseudo et le code sont stockes en sessionStorage pour etre repris
 * dans la page room.html.
 */

import { createRoom, roomExists, pingWorker } from "./api.js";
import { showToast } from "./toast.js";

const PSEUDO_MIN = 3;
const PSEUDO_MAX = 20;

const pseudoInput = document.getElementById("pseudo-input");
const codeInput = document.getElementById("code-input");
const btnCreate = document.getElementById("btn-create");
const btnJoin = document.getElementById("btn-join");
const errorBox = document.getElementById("error-box");
const serverStatus = document.getElementById("server-status");

// --- Restauration du pseudo s'il existe deja en session ---
const savedPseudo = sessionStorage.getItem("petitbac_pseudo");
if (savedPseudo) {
  pseudoInput.value = savedPseudo;
}

// --- Verifie la dispo du serveur au chargement ---
(async () => {
  const ok = await pingWorker();
  if (ok) {
    serverStatus.textContent = "✓ serveur en ligne";
  } else {
    serverStatus.textContent = "✗ serveur injoignable";
    showError("Impossible de joindre le serveur. Verifie ta connexion ou la config.");
  }
})();

// --- Normalisation du code (uppercase) en saisie ---
codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

// --- Validation cote client ---
function validatePseudo() {
  const value = pseudoInput.value.trim();
  if (value.length < PSEUDO_MIN) {
    return { ok: false, error: `Pseudo trop court (min. ${PSEUDO_MIN} caracteres).` };
  }
  if (value.length > PSEUDO_MAX) {
    return { ok: false, error: `Pseudo trop long (max. ${PSEUDO_MAX} caracteres).` };
  }
  return { ok: true, value };
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("show");
}

function clearError() {
  errorBox.classList.remove("show");
  errorBox.textContent = "";
}

// --- Creation d'une room ---
btnCreate.addEventListener("click", async () => {
  clearError();
  const pseudoCheck = validatePseudo();
  if (!pseudoCheck.ok) {
    showError(pseudoCheck.error);
    pseudoInput.focus();
    return;
  }

  btnCreate.disabled = true;
  btnCreate.textContent = "Creation…";
  try {
    const code = await createRoom();
    sessionStorage.setItem("petitbac_pseudo", pseudoCheck.value);
    sessionStorage.setItem("petitbac_room", code);
    window.location.href = `room.html?code=${encodeURIComponent(code)}`;
  } catch (err) {
    console.error(err);
    showError("Impossible de creer la room. Reessaie dans un instant.");
    btnCreate.disabled = false;
    btnCreate.textContent = "Creer une partie";
  }
});

// --- Rejoindre une room ---
btnJoin.addEventListener("click", async () => {
  clearError();
  const pseudoCheck = validatePseudo();
  if (!pseudoCheck.ok) {
    showError(pseudoCheck.error);
    pseudoInput.focus();
    return;
  }

  const code = codeInput.value.trim().toUpperCase();
  if (code.length < 4) {
    showError("Saisis le code de la partie.");
    codeInput.focus();
    return;
  }

  btnJoin.disabled = true;
  btnJoin.textContent = "Verification…";
  try {
    const exists = await roomExists(code);
    if (!exists) {
      showError("Cette partie n'existe pas (ou a expire). Verifie le code.");
      btnJoin.disabled = false;
      btnJoin.textContent = "Rejoindre";
      return;
    }
    sessionStorage.setItem("petitbac_pseudo", pseudoCheck.value);
    sessionStorage.setItem("petitbac_room", code);
    window.location.href = `room.html?code=${encodeURIComponent(code)}`;
  } catch (err) {
    console.error(err);
    showError("Impossible de joindre le serveur. Reessaie dans un instant.");
    btnJoin.disabled = false;
    btnJoin.textContent = "Rejoindre";
  }
});

// --- Entree dans le champ code = rejoindre ---
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnJoin.click();
});
pseudoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && codeInput.value.trim().length >= 4) {
    btnJoin.click();
  }
});
