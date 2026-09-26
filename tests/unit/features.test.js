// "Mes erreurs", flags, regularity, backup reminder, flashcards, save schema additions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mistakePool, buildMistakesSession, buildReviewSession } from "../../src/js/engine.js";
import { streak, calendar, disputed, backupDue } from "../../src/js/summary.js";
import { validateSave, createStore } from "../../src/js/storage.js";
import { validateDeck } from "../../src/js/deck.js";
import { CALENDAR_DAYS, SESSION_SIZE } from "../../src/js/config.js";
import { createRng, isoDate } from "../../src/js/util.js";
import { DAY, NOW, makeQuestions, card, saveWith, memoryStorage } from "./helpers.js";

test("Mes erreurs : ratées récemment et pas encore maîtrisées, plus les questions marquées", () => {
  const q = makeQuestions(1, 5);
  const save = saveWith({
    "t0-q0": card({ level: 0, lastWrong: NOW - DAY }), // récente : oui
    "t0-q1": card({ level: 0, lastWrong: NOW - 30 * DAY }), // trop ancienne : non
    "t0-q2": card({ level: 4, lastWrong: NOW - DAY }), // re-maîtrisée : non
    "t0-q3": card(), // jamais ratée : non
  }, { flags: { "t0-q4": { review: true, dispute: false } } }); // jamais vue mais marquée : oui
  assert.deepEqual(mistakePool(q, save, NOW).map(x => x.id).sort(), ["t0-q0", "t0-q4"]);
  const s = buildMistakesSession(q, save, { now: NOW, rng: createRng(1) });
  assert.deepEqual(s.map(x => x.id).sort(), ["t0-q0", "t0-q4"]);
});

test("Mes erreurs : au plus une séance", () => {
  const q = makeQuestions(2, 20);
  const cards = Object.fromEntries(q.map(x => [x.id, card({ level: 0, lastWrong: NOW - DAY })]));
  assert.equal(buildMistakesSession(q, saveWith(cards), { now: NOW, rng: createRng(2) }).length, SESSION_SIZE);
});

test("une question marquée « à revoir » tombe plus souvent en révision", () => {
  const q = makeQuestions(1, 40);
  const cards = Object.fromEntries(q.map(x => [x.id, card()]));
  const save = saveWith(cards, { flags: { "t0-q0": { review: true, dispute: false } } });
  const rng = createRng(3); let hits = 0;
  for (let i = 0; i < 300; i++) if (buildReviewSession(q, save, { now: NOW, rng }).some(x => x.id === "t0-q0")) hits++;
  assert.ok(hits / 300 > 0.75, `présente dans ${hits / 300} des séances`); // 50 % sans marque
});

test("réponses douteuses : listées pour être corrigées", () => {
  const q = makeQuestions(1, 3);
  const save = saveWith({}, { flags: { "t0-q1": { review: false, dispute: true }, "t0-q2": { review: true, dispute: false } } });
  assert.deepEqual(disputed(q, save).map(x => x.id), ["t0-q1"]);
});

test("série : jours consécutifs jusqu'à aujourd'hui ou hier", () => {
  const day = k => isoDate(NOW - k * DAY);
  assert.equal(streak([], NOW), 0);
  assert.equal(streak([day(2), day(1), day(0)], NOW), 3);
  assert.equal(streak([day(3), day(2), day(1)], NOW), 3); // pas encore révisé aujourd'hui : la série tient
  assert.equal(streak([day(5), day(1), day(0)], NOW), 2);
});

test("calendrier : les derniers jours, aujourd'hui en dernier", () => {
  const c = calendar([isoDate(NOW), isoDate(NOW - 2 * DAY)], NOW);
  assert.equal(c.length, CALENDAR_DAYS);
  assert.deepEqual(c.at(-1), { day: isoDate(NOW), active: true, today: true });
  assert.equal(c.at(-3).active, true);
  assert.equal(c.filter(d => d.active).length, 2);
});

test("rappel de sauvegarde : après 7 jours sans copie, jamais sans progrès", () => {
  assert.equal(backupDue(saveWith(), NOW), false);
  assert.equal(backupDue(saveWith({ a: card({ firstSeen: NOW - 3 * DAY }) }), NOW), false);
  assert.equal(backupDue(saveWith({ a: card({ firstSeen: NOW - 8 * DAY }) }), NOW), true);
  assert.equal(backupDue(saveWith({ a: card({ firstSeen: NOW - 30 * DAY }) }, { lastExport: NOW - 2 * DAY }), NOW), false);
  assert.equal(backupDue(saveWith({ a: card({ firstSeen: NOW - 30 * DAY }) }, { lastExport: NOW - 9 * DAY }), NOW), true);
});

test("sauvegarde : les nouveaux champs sont validés, et facultatifs pour les anciennes copies", () => {
  const old = { version: 2, examDate: null, cards: {}, tests: [], reviews: [] };
  assert.equal(validateSave(old), null);
  const store = createStore(memoryStorage());
  const r = store.importText(JSON.stringify(old), saveWith());
  assert.deepEqual(r.data, saveWith());
  for (const bad of [{ flags: [] }, { flags: { a: { review: "oui", dispute: false } } }, { flags: { "<x>": { review: true, dispute: false } } },
    { activity: ["hier"] }, { lastExport: "jamais" }, { timedTests: "oui" }]) {
    assert.notEqual(validateSave({ ...saveWith(), ...bad }), null, JSON.stringify(bad));
  }
});

test("cartes mémoire : recto, verso, explication facultative", () => {
  const index = { themes: [{ id: "voc", title: "Vocabulaire", file: "voc.json" }] };
  const ok = { id: "voc-001", type: "card", question: "PAX ?", answer: "Un passager." };
  const r = validateDeck(index, { "voc.json": { questions: [ok, { ...ok, id: "voc-002", answer: " " }, { ...ok, id: "voc-003", answers: [] }] } });
  assert.deepEqual(r.questions, [{ id: "voc-001", theme: "Vocabulaire", question: "PAX ?", explanation: "", kind: "card", answer: "Un passager." }]);
  assert.equal(r.errors.length, 2);
});
