/**
 * Types des messages echanges entre client et serveur — phase 4.
 *
 * Convention : `type` est le discriminant. Tous les messages serveur ont
 * un champ `type` qui permet au client de router le traitement.
 */

// ===========================================
// Constantes de configuration
// ===========================================

export const ROOM_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 12,
  CODE_LENGTH: 6,
  // Caracteres sans ambiguite visuelle : pas de 0/O, pas de 1/I/L
  CODE_ALPHABET: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
} as const;

export const ROUND_CONFIG = {
  MIN_TIMER_SEC: 30,
  MAX_TIMER_SEC: 300,
  DEFAULT_TIMER_SEC: 90,
  // Lettres exclues du tirage par defaut (rares en francais)
  // Le tirage reste "aleatoire pur" dans l'alphabet ci-dessous.
  LETTERS: "ABCDEFGHIJLMNOPRSTUV",
  MIN_CATEGORIES: 2,
  MAX_CATEGORIES: 12,
  MAX_CATEGORY_LEN: 30,
  MAX_ANSWER_LEN: 50,
  MIN_ROUNDS: 1,
  MAX_ROUNDS: 20, // 0 = illimite
  // Bareme par defaut (classique)
  DEFAULT_SCORING: {
    aloneInCategory: 15, // seul a repondre dans toute la categorie
    uniqueAnswer: 10,    // bonne reponse non doublonnee, plusieurs repondants
    duplicateAnswer: 5,  // reponse en doublon
    invalidOrEmpty: 0,   // pas de reponse ou invalidee par vote
  },
} as const;

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
] as const;

// ===========================================
// Configuration de partie (definie par le host)
// ===========================================

export interface ScoringConfig {
  aloneInCategory: number;  // seul a repondre dans la categorie
  uniqueAnswer: number;     // reponse unique parmi plusieurs repondants
  duplicateAnswer: number;  // reponse en doublon
  invalidOrEmpty: number;   // vide ou invalide par vote
}

export interface GameConfig {
  categories: string[];        // liste finale des categories
  totalRounds: number;         // 0 = illimite (jusqu'a stop manuel)
  timerSeconds: number;        // duree du timer de la manche
  scoring: ScoringConfig;
}

// ===========================================
// Etat de la room (vu par le client)
// ===========================================

export type RoomPhase =
  | "lobby"
  | "in_round"      // manche en cours, joueurs remplissent
  | "validating"    // grille affichee, votes en cours
  | "scoring"       // affichage des scores de la manche
  | "finished";     // partie terminee, classement final

export interface PlayerInfo {
  pseudo: string;
  isHost: boolean;
  totalScore: number; // cumul sur toutes les manches
  isConnected: boolean;
}

export type VoteValue = "unique" | "duplicate" | "reject";

export interface RoundResult {
  roundNumber: number;
  letter: string;
  // grid[pseudo][category] = string (reponse brute saisie)
  answers: Record<string, Record<string, string>>;
  // cellStates[pseudo][category] = VoteValue (etat partage, modifie collaborativement)
  cellStates: Record<string, Record<string, VoteValue>>;
  // scores[pseudo][category] = number (apres calcul)
  cellScores: Record<string, Record<string, number>>;
  // scoreByPlayer[pseudo] = number (somme de la manche)
  scoreByPlayer: Record<string, number>;
}

// ===========================================
// Messages CLIENT -> SERVEUR
// ===========================================

export type ClientMessage =
  // Phase 3 (lobby)
  | { type: "join"; pseudo: string }
  | { type: "kick"; targetPseudo: string }
  | { type: "ping" }
  // Phase 4 (game)
  | { type: "start_game"; config: GameConfig }
  | { type: "config_update"; config: GameConfig } // host : diffuse la config live aux autres
  | { type: "submit_answers"; answers: Record<string, string> }
  | { type: "stop_round" }
  | {
      // Modifie collaborativement l'etat d'une cellule (n'importe qui peut le faire)
      type: "set_cell_state";
      targetPseudo: string;
      category: string;
      state: "unique" | "duplicate" | "reject";
    }
  | { type: "next_round" }
  | { type: "end_game" } // host : termine la partie tout de suite
  | { type: "back_to_lobby" };

// ===========================================
// Messages SERVEUR -> CLIENT
// ===========================================

export type ServerMessage =
  // Phase 3
  | {
      type: "joined";
      pseudo: string;
      isHost: boolean;
      players: PlayerInfo[];
      hostPseudo: string;
      roomCode: string;
      phase: RoomPhase;
      config: GameConfig | null;
      // Si on rejoint en cours de partie, on a besoin de l'etat courant
      currentRound: number;
      letter: string | null;
      roundEndsAt: number | null;       // timestamp epoch ms
      currentResult: RoundResult | null;
      finalRanking: PlayerInfo[] | null;
    }
  | {
      type: "room_state";
      players: PlayerInfo[];
      hostPseudo: string;
      phase: RoomPhase;
    }
  | { type: "kicked"; reason: string }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "pong" }
  // Phase 4
  | {
      // Diffuse la config courante du host aux autres joueurs (visu uniquement)
      type: "config_update";
      config: GameConfig;
    }
  | {
      type: "round_started";
      roundNumber: number;
      totalRounds: number;
      letter: string;
      categories: string[];
      timerSeconds: number;
      roundEndsAt: number;       // timestamp epoch ms (autoritatif serveur)
    }
  | {
      type: "answers_received";
      pseudo: string;
      // Indique simplement qui a fini de soumettre, pas le contenu
    }
  | {
      type: "round_ended";
      reason: "timer" | "stop" | "all_submitted";
      stoppedBy: string | null;
      categories: string[];      // categories de la manche (pour le rendu cote client)
      totalRounds: number;
      result: RoundResult;
    }
  | {
      type: "cell_state_update";
      // Etat collaboratif diffuse a chaque modification.
      // cellStates[pseudo][category] = VoteValue
      cellStates: Record<string, Record<string, VoteValue>>;
    }
  | {
      type: "round_scored";
      categories: string[];
      totalRounds: number;
      result: RoundResult;
      players: PlayerInfo[]; // avec totalScore mis a jour
    }
  | {
      type: "game_finished";
      ranking: PlayerInfo[];
    };

// ===========================================
// Codes d'erreur
// ===========================================

export type ErrorCode =
  // Phase 3
  | "PSEUDO_INVALID"
  | "PSEUDO_TAKEN"
  | "ROOM_FULL"
  | "ROOM_NOT_FOUND"
  | "NOT_HOST"
  | "TARGET_NOT_FOUND"
  | "CANNOT_KICK_SELF"
  | "INVALID_MESSAGE"
  | "ALREADY_JOINED"
  // Phase 4
  | "INVALID_CONFIG"
  | "WRONG_PHASE"
  | "NOT_ENOUGH_PLAYERS"
  | "ALREADY_SUBMITTED";
