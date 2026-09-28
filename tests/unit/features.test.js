// "Mes erreurs", flags, regularity, backup reminder, flashcards, save schema additions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mistakePool, buildMistakesSession, buildReviewSession, activeQuestions, rightAnswerText } from "../../src/js/engine.js";
import { streak, calendar, disputed, backupDue, reportFile, reportMail, MAIL_BODY_MAX } from "../../src/js/summary.js";
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

test("signalée : écartée des séances tant que la fiche donne la même réponse, de retour si elle change", () => {
  const q = makeQuestions(1, 3);
  const seen = rightAnswerText(q[1]);
  const save = saveWith({}, { flags: { "t0-q1": { review: false, dispute: true, answer: seen }, "t0-q2": { review: true, dispute: false } } });
  assert.deepEqual(activeQuestions(q, save).map(x => x.id), ["t0-q0", "t0-q2"]);
  const fixed = q.map(x => x.id === "t0-q1" ? { ...x, answers: [{ text: "corrigée", correct: true }, { text: "faux", correct: false }] } : x);
  assert.deepEqual(activeQuestions(fixed, save).map(x => x.id), ["t0-q0", "t0-q1", "t0-q2"]);
  // Reported before answers were recorded: set aside until the report is withdrawn.
  const old = saveWith({}, { flags: { "t0-q0": { review: false, dispute: true } } });
  assert.deepEqual(activeQuestions(q, old).map(x => x.id), ["t0-q1", "t0-q2"]);
});

test("signalement : la raison est facultative, courte et en texte", () => {
  const ok = { flags: { "t0-q1": { review: false, dispute: true, note: "Le PDF dit autre chose." } } };
  assert.equal(validateSave({ ...saveWith(), ...ok }), null);
  assert.notEqual(validateSave({ ...saveWith(), flags: { "t0-q1": { review: false, dispute: true, answer: 42 } } }), null);
  for (const note of [42, "x".repeat(501)]) {
    assert.notEqual(validateSave({ ...saveWith(), flags: { "t0-q1": { review: false, dispute: true, note } } }), null, String(note).slice(0, 20));
  }
});

test("signalements : fichier à envoyer avec version, empreinte des fiches, réponse de la fiche et raison", () => {
  const q = makeQuestions(1, 3).map((x, i) => ({ ...x, page: i + 2 }));
  const save = saveWith({}, { flags: { "t0-q1": { review: false, dispute: true, note: "Page 3 : c'est l'inverse." }, "t0-q2": { review: true, dispute: false } } });
  const file = reportFile(q, save, { version: "2.2.0", fingerprint: "abc123", now: NOW });
  assert.deepEqual(file, {
    app: "envol", type: "signalements", version: "2.2.0", fiches: "abc123", date: isoDate(NOW),
    items: [{ id: "t0-q1", theme: q[1].theme, page: 3, question: q[1].question,
      reponse: q[1].answers.filter(a => a.correct).map(a => a.text).join(", "), note: "Page 3 : c'est l'inverse." }],
  });
});

test("signalements par e-mail : lien prérempli, coupé s'il est trop long", () => {
  const q = makeQuestions(1, 3).map((x, i) => ({ ...x, page: i + 2 }));
  const save = saveWith({}, { flags: { "t0-q1": { review: false, dispute: true, note: "C'est l'inverse & autre chose ?" } } });
  const link = reportMail(reportFile(q, save, { version: "2.5.0", fingerprint: "abc123", now: NOW }), "fiches@example.org");
  assert.match(link, /^mailto:fiches@example\.org\?subject=[^&]+&body=/);
  const params = new URLSearchParams(link.split("?")[1]);
  assert.equal(params.get("subject"), "Envol : 1 question signalée");
  assert.match(params.get("body"), /^Version 2\.5\.0, fiches abc123\n\n/);
  assert.match(params.get("body"), /Pourquoi : C'est l'inverse & autre chose \?/);

  const q6 = makeQuestions(1, 6);
  const many = saveWith({}, { flags: Object.fromEntries(q6.map(x => [x.id, { review: false, dispute: true, note: "x".repeat(500) }])) });
  const long = new URLSearchParams(reportMail(reportFile(q6, many, { version: "2.5.0", fingerprint: "abc123", now: NOW }), "a@b.c").split("?")[1]);
  assert.ok(long.get("body").length < MAIL_BODY_MAX + 100);
  assert.match(long.get("body"), /envoie aussi le fichier des signalements/);
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
  assert.deepEqual(r.questions, [{ id: "voc-001", theme: "Vocabulaire", question: "PAX ?", explanation: "", reliability: null, kind: "card", answer: "Un passager." }]);
  assert.equal(r.errors.length, 2);
});
