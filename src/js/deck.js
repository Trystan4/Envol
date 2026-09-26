// Question deck: fiches/index.json lists the themes, one JSON file per theme.
// Two kinds of question: "mcq" (default, choices) and "card" (flashcard: hidden answer, self-graded).
// validateDeck is pure: the app skips invalid questions, CI refuses them (tools/check-deck.mjs).

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^[a-z0-9-]+\.json$/;
const isText = x => typeof x === "string" && x.trim() !== "";
const isObject = x => x !== null && typeof x === "object" && !Array.isArray(x);

function questionError(q) {
  if (!isObject(q)) return "n'est pas un objet";
  if (!isText(q.id) || !ID.test(q.id)) return "« id » manquant ou invalide (minuscules, chiffres et tirets)";
  if (q.type !== undefined && q.type !== "mcq" && q.type !== "card") return `type « ${q.type} » inconnu (« mcq » ou « card »)`;
  if (!isText(q.question)) return "« question » manquante";
  if (q.explanation !== undefined && typeof q.explanation !== "string") return "« explanation » doit être du texte";
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
export function validateDeck(index, files) {
  const questions = [], errors = [];
  if (!isObject(index) || !Array.isArray(index.themes) || !index.themes.length) {
    return { questions, errors: ["index.json : la liste « themes » est vide ou absente"] };
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
    data.questions.forEach((q, k) => {
      const label = `${t.file} › ${isObject(q) && isText(q.id) ? q.id : `question ${k + 1}`}`;
      const error = questionError(q);
      if (error) return errors.push(`${label} : ${error}`);
      if (questionIds.has(q.id)) return errors.push(`${label} : l'id est déjà utilisé par une autre question`);
      questionIds.add(q.id);
      const base = { id: q.id, theme: t.title.trim(), question: q.question.trim(), explanation: (q.explanation || "").trim() };
      questions.push(q.type === "card"
        ? { ...base, kind: "card", answer: q.answer.trim() }
        : {
          ...base, kind: "mcq",
          answers: q.answers.map(a => ({ text: a.text.trim(), correct: a.correct })),
          multi: q.answers.filter(a => a.correct).length > 1,
        });
    });
  });
  return { questions, errors };
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
