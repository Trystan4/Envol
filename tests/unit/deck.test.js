import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeck, loadDeck, deckFingerprint } from "../../src/js/deck.js";

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
    kind: "mcq", answers: [{ text: "Détresse", correct: true }, { text: "Routine", correct: false }], explanation: "Parce que.", multi: false, reliability: null,
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

test("extrait de la fiche : texte, tableau, image et page ; les questions « a_verifier » restent hors de l'app", () => {
  const excerpt = { text: " Passage. ", table: { head: ["A", "B"], rows: [["1", "2"]] }, image: { src: "img/schema.webp", alt: "Schéma" } };
  const r = validateDeck(index(), { "securite.json": { document: "Cours", questions: [
    q({ page: 4, excerpt }),
    q({ id: "secu-002", page: 5, excerpt: { text: "x" }, a_verifier: true }),
  ] } });
  assert.deepEqual(r.errors, []);
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].page, 4);
  assert.equal(r.questions[0].document, "Cours");
  assert.equal(r.questions[0].excerpt.text, "Passage.");
  assert.deepEqual(r.pending, [{ id: "secu-002", file: "securite.json", page: 5 }]);
});

test("extrait mal formé : refusé", () => {
  const bad = [
    q({ id: "secu-010", excerpt: { text: "sans page" } }),
    q({ id: "secu-011", page: 0 }),
    q({ id: "secu-012", page: 3, excerpt: {} }),
    q({ id: "secu-013", page: 3, excerpt: { table: { head: ["A", "B"], rows: [["seule case"]] } } }),
    q({ id: "secu-014", page: 3, excerpt: { image: { src: "https://ailleurs/x.webp", alt: "x" } } }),
    q({ id: "secu-015", page: 3, excerpt: { image: { src: "img/x.webp", alt: "" } } }),
    q({ id: "secu-016", a_verifier: "oui" }),
  ];
  const r = validateDeck(index(), { "securite.json": { questions: bad } });
  assert.equal(r.questions.length, 0);
  assert.equal(r.errors.length, bad.length);
});

test("empreinte des fiches : courte, stable, et change dès qu'une question ou une réponse change", () => {
  const deck = validateDeck(index(), { "securite.json": { questions: [q(), q({ id: "secu-002" })] } }).questions;
  const fp = deckFingerprint(deck);
  assert.match(fp, /^[0-9a-f]{6}$/);
  assert.equal(deckFingerprint(structuredClone(deck)), fp);
  const edited = structuredClone(deck);
  edited[1].answers[1].text = "Urgence";
  assert.notEqual(deckFingerprint(edited), fp);
  assert.notEqual(deckFingerprint(deck.slice(1)), fp);
});

test("fiabilité : niveau du fichier par défaut, précisé par question, note obligatoire hors « verifiee »", () => {
  const r = validateDeck(index(), { "securite.json": { fiabilite: "verifiee", questions: [
    q(),
    q({ id: "secu-002", fiabilite: { niveau: "a_recouper", note: " Le document est ambigu. " } }),
    q({ id: "secu-003", fiabilite: { niveau: "douteuse" } }),
    q({ id: "secu-004", fiabilite: { niveau: "sure", note: "x" } }),
  ] } });
  assert.deepEqual(r.questions.map(x => x.reliability), [{ level: "verifiee", note: "" }, { level: "a_recouper", note: "Le document est ambigu." }]);
  assert.equal(r.errors.length, 2);
  // Without any level, the app says nothing about reliability.
  assert.equal(validateDeck(index(), { "securite.json": { questions: [q()] } }).questions[0].reliability, null);
  assert.equal(validateDeck(index(), { "securite.json": { fiabilite: "certaine", questions: [q()] } }).errors.length, 1);
});
