// Progress saved on the phone (localStorage), plus backup export / import.
// Everything read from outside (stored data, imported file) is fully validated before use:
// a file is accepted whole or refused whole, never half-applied.

import { REVIEWS_KEPT, ACTIVITY_DAYS_KEPT } from "./config.js";

export const KEY = "envol-v2";
export const BACKUP_KEY = `${KEY}-before-import`; // state kept before the last import, for "Annuler l'import"
export const CORRUPT_KEY = `${KEY}-corrupt`; // unreadable save set aside instead of being lost
export const GUIDE_KEY = `${KEY}-guide-seen`;

// A real save weighs a few dozen kB; anything far larger is not an Envol save.
export const MAX_IMPORT_BYTES = 2_000_000;
const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Fields added after the first v2 release are optional when reading, and filled in by clean().
export const emptySave = () => ({
  version: 2, examDate: null, cards: {}, tests: [], reviews: [],
  flags: {}, activity: [], lastExport: null, timedTests: true,
});

const isObject = x => x !== null && typeof x === "object" && !Array.isArray(x);
const isTime = x => typeof x === "number" && Number.isFinite(x) && x >= 0;
const isCount = x => Number.isInteger(x) && x >= 0;

export function isValidExamDate(s) {
  if (s === null) return true;
  return isDay(s);
}

// A real calendar day written "YYYY-MM-DD".
function isDay(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function cardError(c) {
  if (!isObject(c)) return "n'est pas un objet";
  if (!Number.isInteger(c.level) || c.level < 0 || c.level > 5) return "niveau invalide";
  if (!isTime(c.due)) return "date de révision invalide";
  if (!isCount(c.seen) || !isCount(c.correct) || c.correct > c.seen) return "compteurs invalides";
  if (!isTime(c.firstSeen)) return "date de découverte invalide";
  if (c.lastWrong !== null && !isTime(c.lastWrong)) return "date d'erreur invalide";
  return null;
}

const scoreOk = r => isObject(r) && isCount(r.correct) && Number.isInteger(r.total) && r.total > 0 && r.correct <= r.total;

// Returns null when the save is valid, otherwise a short French description of the problem.
export function validateSave(x) {
  if (!isObject(x)) return "ce n'est pas une sauvegarde Envol";
  if (x.version !== 2) return "version de sauvegarde inconnue";
  if (!isValidExamDate(x.examDate)) return "date d'examen invalide";
  if (!isObject(x.cards)) return "progression absente";
  for (const [id, c] of Object.entries(x.cards)) {
    if (id.length > 64 || !CARD_ID.test(id)) return "identifiant de question invalide";
    const e = cardError(c);
    if (e) return `question « ${id} » : ${e}`;
  }
  if (!Array.isArray(x.tests)) return "historique des tests absent";
  for (const [i, t] of x.tests.entries()) {
    if (!scoreOk(t) || !isTime(t.at) || !isObject(t.byTheme) || !Object.values(t.byTheme).every(scoreOk)) {
      return `test blanc n° ${i + 1} invalide`;
    }
  }
  if (!Array.isArray(x.reviews)) return "historique des révisions absent";
  for (const [i, r] of x.reviews.entries()) {
    if (!scoreOk(r) || !isTime(r.at)) return `révision n° ${i + 1} invalide`;
  }
  if (x.flags !== undefined) {
    if (!isObject(x.flags)) return "questions marquées invalides";
    for (const [id, f] of Object.entries(x.flags)) {
      if (id.length > 64 || !CARD_ID.test(id) || !isObject(f)) return "question marquée invalide";
      if (typeof f.review !== "boolean" || typeof f.dispute !== "boolean") return "question marquée invalide";
    }
  }
  if (x.activity !== undefined && (!Array.isArray(x.activity) || !x.activity.every(isDay))) return "jours d'activité invalides";
  if (x.lastExport !== undefined && x.lastExport !== null && !isTime(x.lastExport)) return "date de dernière copie invalide";
  if (x.timedTests !== undefined && typeof x.timedTests !== "boolean") return "réglage du chronomètre invalide";
  return null;
}

// Keeps only known fields, so nothing unexpected travels from an imported file.
const clean = x => ({
  version: 2, examDate: x.examDate, cards: x.cards, tests: x.tests, reviews: x.reviews.slice(-REVIEWS_KEPT),
  flags: x.flags || {}, activity: (x.activity || []).slice(-ACTIVITY_DAYS_KEPT),
  lastExport: x.lastExport ?? null, timedTests: x.timedTests ?? true,
});

export function createStore(storage) {
  const write = (key, value) => { try { storage.setItem(key, value); return true; } catch { return false; } };
  const read = key => { try { return storage.getItem(key); } catch { return null; } };

  return {
    // { data, recovered }: recovered is true when an unreadable save was set aside.
    load() {
      const raw = read(KEY);
      if (raw == null) return { data: emptySave(), recovered: false };
      try {
        const data = JSON.parse(raw);
        if (!validateSave(data)) return { data: clean(data), recovered: false };
      } catch { /* unreadable: set aside below */ }
      write(CORRUPT_KEY, raw);
      return { data: emptySave(), recovered: true };
    },
    // false when the phone refused to store (storage full or blocked).
    save(data) { return write(KEY, JSON.stringify(data)); },
    exportText(data) { return JSON.stringify(data); },
    // { ok: true, data } or { ok: false, error }. Keeps the current state for undoImport().
    importText(text, current) {
      if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "ce fichier est bien trop gros pour être une sauvegarde Envol" };
      let parsed;
      try { parsed = JSON.parse(text); } catch { return { ok: false, error: "ce fichier n'est pas une sauvegarde Envol" }; }
      const error = validateSave(parsed);
      if (error) return { ok: false, error };
      const data = clean(parsed);
      if (!write(BACKUP_KEY, JSON.stringify(current))) return { ok: false, error: "le stockage de l'iPhone est plein" };
      if (!write(KEY, JSON.stringify(data))) return { ok: false, error: "le stockage de l'iPhone est plein" };
      return { ok: true, data };
    },
    canUndoImport() { return read(BACKUP_KEY) != null; },
    // Puts back the state saved before the last import; returns it, or null if there is none.
    undoImport() {
      const raw = read(BACKUP_KEY);
      if (raw == null) return null;
      let data;
      try { data = JSON.parse(raw); } catch { return null; }
      if (validateSave(data) || !write(KEY, raw)) return null;
      try { storage.removeItem(BACKUP_KEY); } catch { /* the backup simply stays available */ }
      return clean(data);
    },
    guideSeen() { return read(GUIDE_KEY) === "1"; },
    markGuideSeen() { write(GUIDE_KEY, "1"); },
  };
}
