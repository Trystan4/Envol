// Reads a reports file sent from the app (Mes résultats › Envoyer mes signalements) and shows each
// reported question next to what the fiches say today, to check it against the source document.
// Usage: pnpm signalements <envol-signalements-AAAA-MM-JJ.json>

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDeck, deckFingerprint } from "../src/js/deck.js";
import { APP_VERSION } from "../src/js/config.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage : pnpm signalements <fichier envol-signalements-….json>");
  process.exit(1);
}
const report = JSON.parse(await readFile(path, "utf8"));
if (report.app !== "envol" || report.type !== "signalements" || !Array.isArray(report.items)) {
  console.error("Ce fichier n'est pas un fichier de signalements Envol.");
  process.exit(1);
}

const root = new URL("../src/", import.meta.url);
const { questions } = await loadDeck(async p => JSON.parse(await readFile(fileURLToPath(new URL(p, root)), "utf8")));
const byId = new Map(questions.map(q => [q.id, q]));
const fingerprint = deckFingerprint(questions);

console.log(`Signalements du ${report.date} : ${report.items.length} question(s).`);
console.log(`Envoyés depuis la version ${report.version}, fiches ${report.fiches}.`);
console.log(report.fiches === fingerprint
  ? `Les fiches n'ont pas changé depuis (version actuelle ${APP_VERSION}).`
  : `Attention : les fiches ont changé depuis (aujourd'hui : version ${APP_VERSION}, fiches ${fingerprint}). Comparer chaque question.`);

const answerOf = q => q.kind === "card" ? q.answer : q.answers.filter(a => a.correct).map(a => a.text).join(", ");
for (const item of report.items) {
  console.log(`\n━━ ${item.id} · ${item.theme}${item.page ? ` · page ${item.page}` : ""}`);
  console.log(`   Question   : ${item.question}`);
  console.log(`   Réponse vue: ${item.reponse}`);
  console.log(`   Pourquoi   : ${item.note || "(pas de raison donnée)"}`);
  const q = byId.get(item.id);
  if (!q) { console.log("   ⚠ Cette question n'existe plus dans les fiches (ou est marquée a_verifier)."); continue; }
  if (q.question !== item.question) console.log(`   ⚠ Question modifiée depuis : ${q.question}`);
  if (answerOf(q) !== item.reponse) console.log(`   ⚠ Réponse modifiée depuis : ${answerOf(q)}`);
  if (q.kind === "mcq") console.log(`   Choix      : ${q.answers.map(a => `${a.correct ? "✓" : "✗"} ${a.text}`).join(" | ")}`);
  const x = q.excerpt || {};
  if (x.text) console.log(`   Extrait    : ${x.text.replace(/\n/g, "\n                ")}`);
  if (x.table) console.log(`   Tableau    : ${x.table.head.join(" | ")}\n                ${x.table.rows.map(r => r.join(" | ")).join("\n                ")}`);
  if (x.image) console.log(`   Image      : src/${x.image.src} (${x.image.alt})`);
}
