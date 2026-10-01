import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, validateSave, emptySave, isValidExamDate, KEY, BACKUP_KEY, CORRUPT_KEY, MAX_IMPORT_BYTES } from "../../src/js/storage.js";
import { NOW, card, saveWith, memoryStorage } from "./helpers.js";

const full = () => saveWith({ "t0-q0": card(), "t0-q1": card({ level: 0, lastWrong: NOW, boostUntil: NOW + 3 * 864e5 }) }, {
  examDate: "2026-11-15",
  tests: [{ at: NOW, correct: 15, total: 20, byTheme: { "Thème 0": { correct: 3, total: 4 } } }],
  reviews: [{ at: NOW, correct: 12, total: 15 }],
  history: [{ day: "2026-09-30", mastered: 1, learning: 1, total: 2 }],
});

test("une sauvegarde complète est valide", () => {
  assert.equal(validateSave(full()), null);
  assert.equal(validateSave(emptySave()), null);
});

test("import : les fichiers mal formés sont tous refusés", () => {
  const bad = {
    "pas un objet": [],
    "ancienne version": { ...full(), version: 1 },
    "cartes en tableau": { ...full(), cards: [] },
    "cartes nulles": { ...full(), cards: null },
    "test nul (plantait l'historique)": { ...full(), tests: [null] },
    "test sans note": { ...full(), tests: [{ foo: 1 }] },
    "test à 0 question": { ...full(), tests: [{ at: NOW, correct: 0, total: 0, byTheme: {} }] },
    "plus de bonnes que de questions": { ...full(), tests: [{ at: NOW, correct: 21, total: 20, byTheme: {} }] },
    "niveau 7": saveWith({ x: card({ level: 7 }) }),
    "compteurs négatifs": saveWith({ x: card({ seen: -1 }) }),
    "plus de bonnes que de réponses": saveWith({ x: card({ seen: 1, correct: 2 }) }),
    "date de révision en texte": saveWith({ x: card({ due: "demain" }) }),
    "fin de rappel en texte": saveWith({ x: card({ boostUntil: "bientôt" }) }),
    "date d'examen impossible": { ...full(), examDate: "2026-02-30" },
    "révisions absentes": { ...full(), reviews: undefined },
    "identifiant de question piégé": saveWith({ "<img src=x onerror=alert(1)>": card() }),
    "historique en objet": { ...full(), history: {} },
    "historique au jour impossible": { ...full(), history: [{ day: "2026-02-30", mastered: 1, learning: 0, total: 2 }] },
    "historique incohérent": { ...full(), history: [{ day: "2026-09-30", mastered: 2, learning: 1, total: 2 }] },
    "identifiant __proto__": JSON.parse(`{"version":2,"examDate":null,"cards":{"__proto__":${JSON.stringify(card())}},"tests":[],"reviews":[]}`),
  };
  for (const [name, x] of Object.entries(bad)) assert.notEqual(validateSave(x), null, name);
});

test("date d'examen : format AAAA-MM-JJ et vraie date", () => {
  assert.ok(isValidExamDate(null));
  assert.ok(isValidExamDate("2028-02-29"));
  assert.ok(!isValidExamDate("2027-02-29"));
  assert.ok(!isValidExamDate("15/11/2026"));
});

test("sauvegarde puis rechargement : identique", () => {
  const s = memoryStorage(), store = createStore(s);
  assert.ok(store.save(full()));
  assert.deepEqual(store.load(), { data: full(), recovered: false });
});

test("premier lancement : sauvegarde vide", () => {
  assert.deepEqual(createStore(memoryStorage()).load(), { data: emptySave(), recovered: false });
});

test("sauvegarde abîmée : mise de côté, l'app repart au lieu de planter", () => {
  for (const raw of ["{abîmé", JSON.stringify({ ...full(), cards: [] })]) {
    const s = memoryStorage({ [KEY]: raw });
    const r = createStore(s).load();
    assert.deepEqual(r, { data: emptySave(), recovered: true });
    assert.equal(s.getItem(CORRUPT_KEY), raw);
  }
});

test("stockage plein : l'échec est signalé, pas ignoré", () => {
  const s = memoryStorage(); s.full = true;
  assert.equal(createStore(s).save(full()), false);
});

test("export puis import sur un autre téléphone : tout est retrouvé", () => {
  const text = createStore(memoryStorage()).exportText(full());
  const s = memoryStorage(), store = createStore(s);
  const r = store.importText(text, emptySave());
  assert.deepEqual(r, { ok: true, data: full() });
  assert.deepEqual(store.load().data, full());
});

test("import refusé : rien n'est modifié", () => {
  const s = memoryStorage(), store = createStore(s);
  store.save(full());
  const before = s.getItem(KEY);
  for (const text of ["pas du json", '{"coucou":1}', JSON.stringify({ ...full(), tests: [null] })]) {
    const r = store.importText(text, full());
    assert.equal(r.ok, false);
    assert.ok(r.error);
  }
  assert.equal(s.getItem(KEY), before);
  assert.equal(s.getItem(BACKUP_KEY), null);
});

test("import : l'état d'avant est gardé et « Annuler l'import » le remet", () => {
  const s = memoryStorage(), store = createStore(s);
  const mine = full();
  store.save(mine);
  assert.ok(store.importText(JSON.stringify(emptySave()), mine).ok);
  assert.ok(store.canUndoImport());
  assert.deepEqual(store.undoImport(), mine);
  assert.deepEqual(store.load().data, mine);
  assert.equal(store.canUndoImport(), false);
  assert.equal(store.undoImport(), null);
});

test("import : les champs inconnus ne sont pas recopiés", () => {
  const r = createStore(memoryStorage()).importText(JSON.stringify({ ...full(), pirate: "<script>" }), emptySave());
  assert.equal("pirate" in r.data, false);
});

test("import d'un fichier énorme : refusé sans être analysé", () => {
  const r = createStore(memoryStorage()).importText(" ".repeat(MAX_IMPORT_BYTES + 1), emptySave());
  assert.equal(r.ok, false);
  assert.match(r.error, /trop gros/);
});

test("import avec stockage plein : refusé proprement", () => {
  const s = memoryStorage(), store = createStore(s); s.full = true;
  const r = store.importText(JSON.stringify(full()), emptySave());
  assert.equal(r.ok, false);
  assert.match(r.error, /plein/);
});
