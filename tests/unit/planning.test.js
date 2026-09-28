// Version 2.3.0: most missed questions, discovery forecast, progress of the day, interrupted sessions,
// display settings.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mostMissed, discoveryForecast, dayProgress } from "../../src/js/summary.js";
import { serializeSession, restoreSession, SESSION_MAX_AGE } from "../../src/js/session.js";
import { validateSave, createStore } from "../../src/js/storage.js";
import { startOfDay } from "../../src/js/util.js";
import { DAY, NOW, makeQuestions, card, saveWith, memoryStorage } from "./helpers.js";

test("plus ratées : les questions avec le plus d'erreurs d'abord, jamais une question sans erreur", () => {
  const q = makeQuestions(1, 5);
  const save = saveWith({
    "t0-q0": card({ seen: 4, correct: 3 }), // 1 erreur
    "t0-q1": card({ seen: 5, correct: 1 }), // 4 erreurs
    "t0-q2": card({ seen: 3, correct: 3 }), // aucune
    "t0-q3": card({ seen: 2, correct: 0 }), // 2 erreurs, taux 100 %
  });
  assert.deepEqual(mostMissed(q, save, 10).map(x => [x.id, x.errors]), [["t0-q1", 4], ["t0-q3", 2], ["t0-q0", 1]]);
  assert.deepEqual(mostMissed(q, save, 2).map(x => x.id), ["t0-q1", "t0-q3"]);
});

test("découverte : combien sont vues, et le jour où tout sera vu à ce rythme", () => {
  const q = makeQuestions(1, 30);
  const today = startOfDay(NOW);
  // Sans date d'examen : 10 nouvelles par jour, 30 à voir, rien aujourd'hui : aujourd'hui + 2 jours.
  assert.deepEqual(discoveryForecast(q, saveWith(), NOW), { seen: 0, total: 30, date: today + 2 * DAY });
  // 10 déjà vues aujourd'hui : le quota du jour est fait, 20 restent, soit 2 jours de plus.
  const cards = Object.fromEntries(q.slice(0, 10).map(x => [x.id, card({ firstSeen: NOW })]));
  assert.deepEqual(discoveryForecast(q, saveWith(cards), NOW), { seen: 10, total: 30, date: today + 2 * DAY });
  // Tout vu : pas de date.
  const all = Object.fromEntries(q.map(x => [x.id, card()]));
  assert.equal(discoveryForecast(q, saveWith(all), NOW).date, null);
});

test("progression du jour : réponses données aujourd'hui et objectif du jour", () => {
  const q = makeQuestions(1, 30);
  const today = startOfDay(NOW);
  const save = saveWith({}, {
    reviews: [{ at: today - 3600e3, correct: 5, total: 20 }, { at: today + 3600e3, correct: 8, total: 10 }],
    tests: [{ at: today + 7200e3, correct: 15, total: 20, byTheme: {} }],
  });
  const p = dayProgress(q, save, NOW);
  assert.equal(p.done, 30); // 10 en révision + 20 en test blanc, aujourd'hui
  assert.equal(p.goal, 30 + 10); // plus les 10 nouvelles du jour pas encore vues
});

test("séance interrompue : gardée, puis reprise avec les mêmes questions", () => {
  const q = makeQuestions(1, 5);
  const s = {
    mode: "review", queue: [q[2], q[0], q[3]], size: 3, index: 1, correct: 0, total: 1,
    byTheme: { "Thème 0": { correct: 0, total: 1 } }, mistakes: [q[2]],
    unanswered: 0, deadline: null, warnMs: 120000, label: "Thème 0",
  };
  const saved = serializeSession(s, NOW);
  const json = JSON.parse(JSON.stringify(saved));
  const back = restoreSession(json, q, NOW + 3600e3);
  assert.deepEqual(back.queue.map(x => x.id), ["t0-q2", "t0-q0", "t0-q3"]);
  assert.equal(back.index, 1);
  assert.deepEqual(back.mistakes.map(x => x.id), ["t0-q2"]);
  assert.equal(back.label, "Thème 0");
  // Trop vieille, abîmée, ou dont les questions ont disparu : ignorée.
  assert.equal(restoreSession(json, q, NOW + SESSION_MAX_AGE + 1), null);
  assert.equal(restoreSession({ nope: 1 }, q, NOW), null);
  assert.equal(restoreSession(json, [], NOW), null);
});

test("séance gardée par une version qui reposait les questions ratées : reprise sans ces nouveaux essais", () => {
  const q = makeQuestions(1, 5);
  const old = {
    v: 1, at: NOW, mode: "review", label: null, queue: [["t0-q2", 0], ["t0-q0", 0], ["t0-q2", 1], ["t0-q3", 0]],
    index: 3, size: 3, correct: 1, total: 2, unanswered: 0, byTheme: {}, missed: ["t0-q2"], retries: { "t0-q2": 1 },
    mistakes: ["t0-q2"], deadline: null, warnMs: 120000,
  };
  const back = restoreSession(old, q, NOW + 60e3);
  assert.deepEqual(back.queue.map(x => x.id), ["t0-q2", "t0-q0", "t0-q3"]);
  assert.equal(back.index, 2); // still on t0-q3
  // Only a second try was left: the session is over, nothing to resume.
  assert.equal(restoreSession({ ...old, queue: old.queue.slice(0, 3), index: 2 }, q, NOW + 60e3), null);
});

test("affichage : texte agrandi et thème clair / sombre gardés, valeurs contrôlées", () => {
  const ok = { ...saveWith(), display: { largeText: true, theme: "dark" } };
  assert.equal(validateSave(ok), null);
  for (const display of [{ largeText: "oui", theme: "dark" }, { largeText: true, theme: "rose" }, []]) {
    assert.notEqual(validateSave({ ...saveWith(), display }), null, JSON.stringify(display));
  }
  // Absent dans les anciennes copies : réglages par défaut.
  const store = createStore(memoryStorage());
  const old = { version: 2, examDate: null, cards: {}, tests: [], reviews: [] };
  assert.deepEqual(store.importText(JSON.stringify(old), saveWith()).data.display, { largeText: false, theme: "auto" });
});

/* ---------- Version 2.4.0 ---------- */

test("fiches mises à jour : nouvelles et corrigées depuis la dernière visite, rien la première fois", async () => {
  const { questionHashes, deckChanges } = await import("../../src/js/deck.js");
  const q = makeQuestions(1, 4);
  const before = questionHashes(q);
  assert.equal(Object.keys(before).length, 4);
  assert.deepEqual(deckChanges(null, before), { added: 0, changed: 0 }); // first visit: nothing to announce
  const after = q.slice(0, 3).map(x => x.id === "t0-q1" ? { ...x, answers: [{ text: "corrigée", correct: true }, { text: "faux", correct: false }] } : x)
    .concat({ ...q[0], id: "t0-q9" }, { ...q[0], id: "t0-q8" });
  assert.deepEqual(deckChanges(before, questionHashes(after)), { added: 2, changed: 1 });
  assert.deepEqual(deckChanges(before, questionHashes(q)), { added: 0, changed: 0 });
});

test("signalement corrigé : la fiche a changé depuis le signalement", async () => {
  const { correctedReports } = await import("../../src/js/summary.js");
  const { rightAnswerText } = await import("../../src/js/engine.js");
  const q = makeQuestions(1, 3);
  const save = saveWith({}, { flags: {
    "t0-q0": { review: false, dispute: true, answer: rightAnswerText(q[0]) }, // pas encore corrigée
    "t0-q1": { review: false, dispute: true, answer: "ancienne réponse" }, // corrigée depuis
  } });
  assert.deepEqual(correctedReports(q, save).map(x => x.id), ["t0-q1"]);
});

test("séance express : 5 questions, tirées comme une séance de révision", async () => {
  const { buildReviewSession } = await import("../../src/js/engine.js");
  const { EXPRESS_SIZE } = await import("../../src/js/config.js");
  const { createRng } = await import("../../src/js/util.js");
  const q = makeQuestions(2, 20);
  const s = buildReviewSession(q, saveWith(), { now: NOW, rng: createRng(3), size: EXPRESS_SIZE });
  assert.equal(EXPRESS_SIZE, 5);
  assert.equal(s.length, 5);
  assert.equal(new Set(s.map(x => x.id)).size, 5);
});
