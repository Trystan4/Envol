// Shared fixtures for unit tests.

import { emptySave } from "../../src/js/storage.js";

export const DAY = 864e5;
export const NOW = new Date(2026, 9, 1, 9, 0, 0).getTime(); // a fixed morning, 1 Oct 2026

// `themes` × `perTheme` well-formed questions.
export function makeQuestions(themes = 4, perTheme = 10) {
  const out = [];
  for (let t = 0; t < themes; t++) {
    for (let i = 0; i < perTheme; i++) {
      out.push({
        id: `t${t}-q${i}`, theme: `Thème ${t}`, question: `Question ${t}-${i} ?`, explanation: "", multi: false,
        answers: [{ text: "bonne", correct: true }, { text: "faux", correct: false }],
      });
    }
  }
  return out;
}

export const card = (over = {}) => ({ level: 1, due: NOW, seen: 1, correct: 1, firstSeen: NOW - 5 * DAY, lastWrong: null, ...over });

export function saveWith(cards = {}, over = {}) {
  return { ...emptySave(), cards, ...over };
}

// In-memory localStorage stand-in; `full` makes every write fail like a full phone.
export function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    full: false,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { if (this.full) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    removeItem: k => m.delete(k),
    map: m,
  };
}
