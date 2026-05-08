/**
 * Constantes partagees cote frontend.
 * En miroir du fichier worker/src/messages.ts (CATEGORY_PRESETS, ROUND_CONFIG).
 */

export const CATEGORY_PRESETS = [
  "Pays",
  "Ville",
  "Animal",
  "Prenom",
  "Metier",
  "Fruit / Legume",
  "Couleur",
  "Sport",
  "Marque",
  "Film",
  "Personnage celebre",
  "Plat / Cuisine",
  "Objet de la maison",
  "Vetement",
  "Instrument de musique",
];

export const LIMITS = {
  MIN_CATEGORIES: 2,
  MAX_CATEGORIES: 12,
  MAX_ANSWER_LEN: 50,
};

/**
 * Normalisation pour comparaison (memes regles que cote serveur).
 * Insensible casse + accents + espaces multiples.
 */
export function normalizeAnswer(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Une reponse commence-t-elle par la lettre attendue (apres normalisation) ?
 */
export function answerMatchesLetter(answer, letter) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return false;
  return normalized.startsWith(normalizeAnswer(letter));
}
