/**
 * Logique de la page d'accueil :
 *   - validation cote client du pseudo
 *   - bouton "Creer" : POST /rooms puis redirection vers room.html
 *   - bouton "Rejoindre" : GET /rooms/:code/exists puis redirection
 *   - banniere "Reprendre la partie" si le pseudo et le code sont en
 *     localStorage (et que la room existe encore)
 *
 * Le pseudo et le code sont stockes en localStorage pour persister entre
 * fermetures d'onglet (necessaire pour la reconnexion en cas de fermeture
 * accidentelle de la page).
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
const resumeBanner = document.getElementById("resume-banner");
const resumeBannerCode = document.getElementById("resume-banner-code");
const resumeBannerPseudo = document.getElementById("resume-banner-pseudo");
const resumeBannerBtn = document.getElementById("resume-banner-btn");
const resumeBannerDismiss = document.getElementById("resume-banner-dismiss");

// --- Helper de stockage : localStorage par defaut, fallback sessionStorage
//     (Safari mode prive peut bloquer localStorage). ---
const storage = (() => {
  function tryStorage(s) {
    try {
      const k = "__pbac_test__";
      s.setItem(k, "1");
      s.removeItem(k);
      return s;
    } catch {
      return null;
    }
  }
  return tryStorage(window.localStorage) ?? tryStorage(window.sessionStorage) ?? {
    // Fallback in-memory (au cas extremement rare)
    _m: new Map(),
    getItem(k) { return this._m.get(k) ?? null; },
    setItem(k, v) { this._m.set(k, v); },
    removeItem(k) { this._m.delete(k); },
  };
})();

// --- Restauration du pseudo s'il existe deja ---
const savedPseudo = storage.getItem("petitbac_pseudo");
const savedRoom = storage.getItem("petitbac_room");
if (savedPseudo) {
  pseudoInput.value = savedPseudo;
}

// --- Banniere "Reprendre la partie" ---
// Affichee si pseudo + code sont en storage ET que la room existe encore.
async function maybeShowResumeBanner() {
  if (!savedPseudo || !savedRoom || !resumeBanner) return;
  // On verifie en silence que la room existe (sinon on cache la banniere)
  let exists = false;
  try {
    exists = await roomExists(savedRoom);
  } catch {
    return; // pas de banniere si serveur injoignable
  }
  if (!exists) {
    // Room expiree : on nettoie le storage pour ne pas redemander a chaque visite
    storage.removeItem("petitbac_room");
    return;
  }
  resumeBannerCode.textContent = savedRoom;
  resumeBannerPseudo.textContent = savedPseudo;
  resumeBanner.classList.add("show");
}

// --- Verifie la dispo du serveur au chargement ---
(async () => {
  const ok = await pingWorker();
  if (ok) {
    serverStatus.textContent = "✓ serveur en ligne";
    // Affiche la banniere de reprise APRES avoir confirme que le serveur est OK
    maybeShowResumeBanner();
  } else {
    serverStatus.textContent = "✗ serveur injoignable";
    showError("Impossible de joindre le serveur. Verifie ta connexion ou la config.");
  }
})();

// --- Bouton "Reprendre la partie" ---
if (resumeBannerBtn) {
  resumeBannerBtn.addEventListener("click", () => {
    // Le pseudo et le code sont deja en storage, on saute directement a la room.
    window.location.href = `room.html?code=${encodeURIComponent(savedRoom)}`;
  });
}
if (resumeBannerDismiss) {
  resumeBannerDismiss.addEventListener("click", () => {
    storage.removeItem("petitbac_room");
    resumeBanner.classList.remove("show");
  });
}

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
    storage.setItem("petitbac_pseudo", pseudoCheck.value);
    storage.setItem("petitbac_room", code);
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
    storage.setItem("petitbac_pseudo", pseudoCheck.value);
    storage.setItem("petitbac_room", code);
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
