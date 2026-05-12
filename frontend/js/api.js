/**
 * Client HTTP pour les endpoints REST du Worker.
 *
 * Phase 3 : creation de room et verification d'existence.
 */

import { CONFIG } from "./config.js";

/**
 * Cree une nouvelle room et renvoie son code.
 * @returns {Promise<string>} le code de la room (ex: "ABC123")
 */
export async function createRoom() {
  const res = await fetch(`${CONFIG.WORKER_URL}/rooms`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Erreur creation room (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.code) {
    throw new Error("Réponse invalide du serveur (pas de code)");
  }
  return data.code;
}

/**
 * Verifie si une room existe.
 * @param {string} code
 * @returns {Promise<boolean>}
 */
export async function roomExists(code) {
  const res = await fetch(
    `${CONFIG.WORKER_URL}/rooms/${encodeURIComponent(code)}/exists`
  );
  if (!res.ok) {
    throw new Error(`Erreur vérification room (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data.exists === true;
}

/**
 * Verifie que le Worker est joignable (utilise sur la home pour informer
 * d'un eventuel probleme de connexion avant que l'utilisateur ne tente une action).
 * @returns {Promise<boolean>}
 */
export async function pingWorker() {
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/ping`);
    return res.ok;
  } catch {
    return false;
  }
}
