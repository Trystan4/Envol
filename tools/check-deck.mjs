// Checks the published deck (src/fiches) with the same validation as the app.
// Fails (exit 1) on any malformed question: CI never deploys a broken deck.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDeck } from "../src/js/deck.js";

const root = new URL("../src/", import.meta.url);

const { questions, errors, pending } = await loadDeck(async path => {
  const text = await readFile(fileURLToPath(new URL(path, root)), "utf8");
  try { return JSON.parse(text); } catch (e) { throw new Error(`${path} : JSON invalide (${e.message})`); }
});

const byTheme = {};
for (const q of questions) byTheme[q.theme] = (byTheme[q.theme] || 0) + 1;
console.log(`${questions.length} questions valides dans ${Object.keys(byTheme).length} thèmes :`);
for (const [theme, n] of Object.entries(byTheme)) console.log(`  ${String(n).padStart(4)}  ${theme}`);

if (pending.length) {
  console.log(`
${pending.length} question(s) marquée(s) « a_verifier », gardée(s) hors de l'app :`);
  for (const p of pending) console.log(`  ? ${p.file} › ${p.id}${p.page ? ` (page ${p.page})` : ""}`);
}

if (errors.length) {
  console.error(`\n${errors.length} problème(s) à corriger :`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nAucun problème.");
