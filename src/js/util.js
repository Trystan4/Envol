// Small pure helpers shared by the engine and the screens.

import { DAY } from "./config.js";

// Escapes HTML, and keeps French punctuation attached to its word (no lone "?" starting a line).
export const esc = s => String(s)
  .replace(/ ([?!:;»])/g, " $1").replace(/« /g, "« ")
  .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Seedable random generator (mulberry32), so the engine can be tested deterministically.
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };

// Whole days from today to an exam date "YYYY-MM-DD" (0 on the day itself), or null without a date.
export function daysUntil(examDate, now) {
  if (!examDate) return null;
  const [y, m, d] = examDate.split("-").map(Number);
  return Math.round((+new Date(y, m - 1, d) - startOfDay(now)) / DAY);
}

// Local calendar date "YYYY-MM-DD" (what <input type="date"> reads and writes).
export const isoDate = t => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const grade20 = (correct, total) => total ? Math.round(correct / total * 40) / 2 : 0;
export const formatGrade = x => String(x).replace(".", ",");
export const shortDate = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
// plural(2, "question") → "2 questions"; irregular or compound words pass their plural form.
export const plural = (n, singular, pluralForm = `${singular}s`) => `${n} ${n > 1 ? pluralForm : singular}`;
