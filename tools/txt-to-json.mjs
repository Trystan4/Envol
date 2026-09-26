// Converts a text deck to the JSON deck read by the app (src/fiches/).
//
// Text format:
//   # Theme title
//   Q: question
//   + right answer (several allowed)
//   - wrong answer
//   > explanation (optional)
// Lines starting with // are ignored.
//
// Usage: node tools/txt-to-json.mjs fiches.txt [src/fiches]
// Ids are generated (theme prefix + number); once published, never change an id:
// progress is attached to it.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ARTICLES = /^(l|le|la|les|un|une|des|du|de|d)-/;
const slug = s => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(ARTICLES, "");

export function parseText(txt) {
  const themes = [];
  let theme = null, cur = null;
  const flush = () => { if (cur) theme.questions.push(cur); cur = null; };
  const ensureTheme = () => theme || (themes.push(theme = { title: "Général", questions: [] }), theme);
  for (const raw of txt.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    if (line.startsWith("#")) { flush(); themes.push(theme = { title: line.replace(/^#+\s*/, "") || "Général", questions: [] }); continue; }
    const m = line.match(/^(Q\s*:|\+|-|>)\s*(.*)$/i);
    if (m) {
      const kind = m[1][0].toUpperCase(), text = m[2];
      if (kind === "Q") { flush(); ensureTheme(); cur = { question: text, answers: [], explanation: "" }; }
      else if (!cur) continue;
      else if (kind === "+" || kind === "-") cur.answers.push({ text, correct: kind === "+" });
      else cur.explanation += (cur.explanation ? " " : "") + text;
    } else if (cur) {
      if (!cur.answers.length) cur.question += " " + line;
      else if (cur.explanation) cur.explanation += " " + line;
    }
  }
  flush();
  return themes.filter(t => t.questions.length);
}

export function toJsonDeck(themes) {
  const index = { themes: [] }, files = {};
  for (const t of themes) {
    const id = slug(t.title) || "general";
    const prefix = id.split("-")[0];
    const file = `${id}.json`;
    index.themes.push({ id, title: t.title, file });
    files[file] = {
      questions: t.questions.map((q, i) => ({
        id: `${prefix}-${String(i + 1).padStart(3, "0")}`,
        question: q.question,
        answers: q.answers,
        ...(q.explanation ? { explanation: q.explanation } : {}),
      })),
    };
  }
  return { index, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, out = "src/fiches"] = process.argv.slice(2);
  if (!source) { console.error("Usage : node tools/txt-to-json.mjs fiches.txt [src/fiches]"); process.exit(1); }
  const { index, files } = toJsonDeck(parseText(readFileSync(source, "utf8")));
  mkdirSync(out, { recursive: true });
  const write = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + "\n");
  write("index.json", index);
  for (const [name, data] of Object.entries(files)) write(name, data);
  console.log(`${index.themes.length} thèmes, ${Object.values(files).reduce((n, f) => n + f.questions.length, 0)} questions écrites dans ${out}.`);
  console.log("Vérifier ensuite avec : pnpm check:deck");
}
