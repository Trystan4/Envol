// Question deck: fiches/index.json lists the themes, one JSON file per theme.
// Two kinds of question: "mcq" (default, choices) and "card" (flashcard: hidden answer, self-graded).
// Optional per question: "page" (page of the source document), "excerpt" (passage of the document shown
// after a wrong answer: text, table and/or image) and "a_verifier" (doubtful: kept out of the app until
// checked) and "fiabilite" ({ niveau, note }: how sure the answer is, see RELIABILITY). Optional per file:
// "document", the name of the source document, and "fiabilite", the level of its questions by default.
// validateDeck is pure: the app skips invalid questions, CI refuses them (tools/check-deck.mjs).

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^[a-z0-9-]+\.json$/;
export const IMAGE = /^img\/[a-z0-9-]+\.webp$/;
// Reliability levels, shown as a coloured dot: checked against the source (green), to cross-check with other
// sources (orange), doubtful (red). The last two need a note that explains why.
export const RELIABILITY = ["verifiee", "a_recouper", "douteuse"];
const isText = x => typeof x === "string" && x.trim() !== "";
const isObject = x => x !== null && typeof x === "object" && !Array.isArray(x);
const isTextList = (x, n) => Array.isArray(x) && x.length > 0 && (n === undefined || x.length === n) && x.every(c => typeof c === "string");

function excerptError(x) {
  if (!isObject(x)) return "« excerpt » doit être un objet";
  if (x.text === undefined && x.table === undefined && x.image === undefined) return "« excerpt » vide (il faut « text », « table » ou « image »)";
  if (x.text !== undefined && !isText(x.text)) return "« excerpt.text » doit être du texte";
  if (x.table !== undefined) {
    const t = x.table;
    if (!isObject(t) || !isTextList(t.head)) return "« excerpt.table.head » : la liste des titres de colonnes";
    if (!Array.isArray(t.rows) || !t.rows.length || !t.rows.every(r => isTextList(r, t.head.length))) {
      return "« excerpt.table.rows » : des lignes avec autant de cases que « head »";
    }
    if (t.caption !== undefined && !isText(t.caption)) return "« excerpt.table.caption » doit être du texte";
  }
  if (x.image !== undefined && (!isObject(x.image) || !isText(x.image.src) || !IMAGE.test(x.image.src) || !isText(x.image.alt))) {
    return "« excerpt.image » : { \"src\": \"img/nom.webp\", \"alt\": \"description\" }";
  }
  return null;
}

const trimExcerpt = x => ({
  ...(x.text !== undefined && { text: x.text.trim() }),
  ...(x.table !== undefined && {
    table: {
      ...(x.table.caption !== undefined && { caption: x.table.caption.trim() }),
      head: x.table.head.map(c => c.trim()),
      rows: x.table.rows.map(r => r.map(c => c.trim())),
    },
  }),
  ...(x.image !== undefined && { image: { src: x.image.src, alt: x.image.alt.trim() } }),
});

function questionError(q) {
  if (!isObject(q)) return "n'est pas un objet";
  if (!isText(q.id) || !ID.test(q.id)) return "« id » manquant ou invalide (minuscules, chiffres et tirets)";
  if (q.type !== undefined && q.type !== "mcq" && q.type !== "card") return `type « ${q.type} » inconnu (« mcq » ou « card »)`;
  if (!isText(q.question)) return "« question » manquante";
  if (q.explanation !== undefined && typeof q.explanation !== "string") return "« explanation » doit être du texte";
  if (q.page !== undefined && !(Number.isInteger(q.page) && q.page > 0)) return "« page » doit être un numéro de page";
  if (q.excerpt !== undefined) {
    if (q.page === undefined) return "un « excerpt » doit indiquer sa « page »";
    const error = excerptError(q.excerpt);
    if (error) return error;
  }
  if (q.a_verifier !== undefined && typeof q.a_verifier !== "boolean") return "« a_verifier » doit valoir true ou false";
  if (q.fiabilite !== undefined) {
    const f = q.fiabilite;
    if (!isObject(f) || !RELIABILITY.includes(f.niveau)) return `« fiabilite.niveau » : ${RELIABILITY.join(", ")}`;
    if (f.note !== undefined && typeof f.note !== "string") return "« fiabilite.note » doit être du texte";
    if (f.niveau !== "verifiee" && !isText(f.note)) return "« fiabilite.note » : expliquer pourquoi la question n'est pas vérifiée";
  }
  if (q.type === "card") {
    if (!isText(q.answer)) return "une carte mémoire doit avoir une « answer » (le verso)";
    if (q.answers !== undefined) return "une carte mémoire n'a pas de liste « answers »";
    return null;
  }
  if (!Array.isArray(q.answers) || q.answers.length < 2) return "il faut au moins 2 réponses dans « answers »";
  if (q.answers.some(a => !isObject(a) || !isText(a.text) || typeof a.correct !== "boolean")) {
    return "chaque réponse doit avoir un « text » et un « correct » (true ou false)";
  }
  const right = q.answers.filter(a => a.correct).length;
  if (!right) return "aucune bonne réponse";
  if (right === q.answers.length) return "aucune mauvaise réponse";
  const texts = q.answers.map(a => a.text.trim());
  if (new Set(texts).size !== texts.length) return "deux réponses identiques";
  return null;
}

// index: parsed index.json. files: { "theme.json": parsed content | undefined }.
// Returns the playable questions, the errors, and the valid questions set aside with "a_verifier".
export function validateDeck(index, files) {
  const questions = [], errors = [], pending = [];
  if (!isObject(index) || !Array.isArray(index.themes) || !index.themes.length) {
    return { questions, errors: ["index.json : la liste « themes » est vide ou absente"], pending };
  }
  const themeIds = new Set(), questionIds = new Set();
  index.themes.forEach((t, i) => {
    const where = `index.json › thème ${i + 1}`;
    if (!isObject(t) || !isText(t.id) || !ID.test(t.id)) return errors.push(`${where} : « id » manquant ou invalide`);
    if (themeIds.has(t.id)) return errors.push(`${where} : l'id « ${t.id} » est déjà utilisé`);
    themeIds.add(t.id);
    if (!isText(t.title)) return errors.push(`${where} : « title » manquant`);
    if (!isText(t.file) || !FILE.test(t.file)) return errors.push(`${where} : « file » invalide (ex. « securite.json »)`);
    const data = files[t.file];
    if (!isObject(data) || !Array.isArray(data.questions)) {
      return errors.push(`${t.file} : fichier absent, illisible ou sans liste « questions »`);
    }
    if (data.document !== undefined && !isText(data.document)) return errors.push(`${t.file} : « document » doit être du texte`);
    if (data.fiabilite !== undefined && !RELIABILITY.includes(data.fiabilite)) return errors.push(`${t.file} : « fiabilite » : ${RELIABILITY.join(", ")}`);
    data.questions.forEach((q, k) => {
      const label = `${t.file} › ${isObject(q) && isText(q.id) ? q.id : `question ${k + 1}`}`;
      const error = questionError(q);
      if (error) return errors.push(`${label} : ${error}`);
      if (questionIds.has(q.id)) return errors.push(`${label} : l'id est déjà utilisé par une autre question`);
      questionIds.add(q.id);
      if (q.a_verifier) return pending.push({ id: q.id, file: t.file, page: q.page ?? null });
      const base = {
        id: q.id, theme: t.title.trim(), question: q.question.trim(), explanation: (q.explanation || "").trim(),
        ...(q.page !== undefined && { page: q.page, document: (data.document || "").trim() }),
        ...(q.excerpt !== undefined && { excerpt: trimExcerpt(q.excerpt) }),
        reliability: q.fiabilite ? { level: q.fiabilite.niveau, note: (q.fiabilite.note || "").trim() }
          : data.fiabilite ? { level: data.fiabilite, note: "" } : null,
      };
      questions.push(q.type === "card"
        ? { ...base, kind: "card", answer: q.answer.trim() }
        : {
          ...base, kind: "mcq",
          answers: q.answers.map(a => ({ text: a.text.trim(), correct: a.correct })),
          multi: q.answers.filter(a => a.correct).length > 1,
        });
    });
  });
  return { questions, errors, pending };
}

// Short hash of a text: 6 hex digits, FNV-1a.
function shortHash(text) {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

// Fingerprint of the questions the app runs. Shown in Réglages and written in reports, so a report
// can be matched to the exact fiches it was made with.
export const deckFingerprint = questions => shortHash(JSON.stringify(questions));

// One hash per question (its text and answers), kept on the device: at the next visit, tells which
// questions are new and which were corrected.
export const questionHashes = questions => Object.fromEntries(questions.map(q => [q.id, shortHash(JSON.stringify([q.question, q.answers || q.answer]))]));

// before: the hashes of the previous visit, or null on the first one (nothing to announce then).
export function deckChanges(before, now) {
  let added = 0, changed = 0;
  if (before) for (const [id, h] of Object.entries(now)) {
    if (!(id in before)) added++;
    else if (before[id] !== h) changed++;
  }
  return { added, changed };
}

// fetchJson(path) resolves to parsed JSON, or rejects.
export async function loadDeck(fetchJson) {
  const index = await fetchJson("fiches/index.json");
  const files = {};
  const themes = isObject(index) && Array.isArray(index.themes) ? index.themes : [];
  await Promise.all(themes.map(async t => {
    if (!isObject(t) || !isText(t.file) || !FILE.test(t.file)) return;
    try { files[t.file] = await fetchJson(`fiches/${t.file}`); } catch { files[t.file] = undefined; }
  }));
  return validateDeck(index, files);
}
