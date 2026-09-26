import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeck, loadDeck } from "../../src/js/deck.js";

const q = (over = {}) => ({
  id: "secu-001", question: "Que signifie « Mayday » ?",
  answers: [{ text: "Détresse", correct: true }, { text: "Routine", correct: false }], ...over,
});
const index = (...themes) => ({ themes: themes.length ? themes : [{ id: "securite", title: "Sécurité cabine", file: "securite.json" }] });

test("un thème valide donne des questions prêtes à l'emploi", () => {
  const r = validateDeck(index(), { "securite.json": { questions: [q({ explanation: " Parce que. " })] } });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.questions, [{
    id: "secu-001", theme: "Sécurité cabine", question: "Que signifie « Mayday » ?",
    kind: "mcq", answers: [{ text: "Détresse", correct: true }, { text: "Routine", correct: false }], explanation: "Parce que.", multi: false,
  }]);
});

test("plusieurs bonnes réponses : question à choix multiples", () => {
  const r = validateDeck(index(), { "securite.json": { questions: [q({ answers: [{ text: "a", correct: true }, { text: "b", correct: true }, { text: "c", correct: false }] })] } });
  assert.equal(r.questions[0].multi, true);
});

test("chaque question mal saisie est signalée avec son fichier et son id, les autres restent", () => {
  const bad = [
    q({ id: "Secu 2" }),
    q({ id: "secu-003", answers: [{ text: "seule", correct: true }] }),
    q({ id: "secu-004", answers: [{ text: "a", correct: false }, { text: "b", correct: false }] }),
    q({ id: "secu-005", answers: [{ text: "a", correct: true }, { text: "b", correct: true }] }),
    q({ id: "secu-006", answers: [{ text: "a", correct: true }, { text: "a", correct: false }] }),
    q({ id: "secu-007", answers: [{ text: "a", correct: "oui" }, { text: "b", correct: false }] }),
    q({ id: "secu-008", question: "  " }),
    q({ id: "secu-009", type: "image" }),
    q({ id: "secu-001" }),
  ];
  const r = validateDeck(index(), { "securite.json": { questions: [q(), ...bad] } });
  assert.equal(r.questions.length, 1);
  assert.equal(r.errors.length, bad.length);
  assert.ok(r.errors.every(e => e.startsWith("securite.json › ")), r.errors.join("\n"));
  assert.match(r.errors.at(-1), /déjà utilisé/);
});

test("les ids doivent être uniques entre thèmes aussi", () => {
  const r = validateDeck(
    index({ id: "a", title: "A", file: "a.json" }, { id: "b", title: "B", file: "b.json" }),
    { "a.json": { questions: [q()] }, "b.json": { questions: [q()] } },
  );
  assert.equal(r.questions.length, 1);
  assert.match(r.errors[0], /^b\.json › secu-001 : .*déjà utilisé/);
});

test("index ou fichier de thème défaillant : signalé", () => {
  assert.equal(validateDeck({}, {}).errors.length, 1);
  assert.equal(validateDeck(index({ id: "a", title: "A", file: "../hors.json" }), {}).errors.length, 1);
  assert.match(validateDeck(index(), {}).errors[0], /securite\.json : fichier absent/);
});

test("chargement : un fichier de thème qui ne répond pas n'empêche pas les autres", async () => {
  const files = {
    "fiches/index.json": index({ id: "a", title: "A", file: "a.json" }, { id: "b", title: "B", file: "b.json" }),
    "fiches/a.json": { questions: [q()] },
  };
  const r = await loadDeck(async p => { if (!(p in files)) throw new Error("404"); return files[p]; });
  assert.equal(r.questions.length, 1);
  assert.equal(r.errors.length, 1);
});
