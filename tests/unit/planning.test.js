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
    mode: "review", queue: [q[2], q[0], { ...q[2], retry: true }], size: 2, index: 1, correct: 1, total: 1,
    byTheme: { "Thème 0": { correct: 1, total: 1 } }, missed: new Set(["t0-q2"]), retries: { "t0-q2": 1 }, mistakes: [q[2]],
    unanswered: 0, deadline: null, warnMs: 120000, label: "Thème 0",
  };
  const saved = serializeSession(s, NOW);
  const json = JSON.parse(JSON.stringify(saved));
  const back = restoreSession(json, q, NOW + 3600e3);
  assert.deepEqual(back.queue.map(x => [x.id, !!x.retry]), [["t0-q2", false], ["t0-q0", false], ["t0-q2", true]]);
  assert.equal(back.index, 1);
  assert.deepEqual([...back.missed], ["t0-q2"]);
  assert.deepEqual(back.mistakes.map(x => x.id), ["t0-q2"]);
  assert.equal(back.label, "Thème 0");
  // Trop vieille, abîmée, ou dont les questions ont disparu : ignorée.
  assert.equal(restoreSession(json, q, NOW + SESSION_MAX_AGE + 1), null);
  assert.equal(restoreSession({ nope: 1 }, q, NOW), null);
  assert.equal(restoreSession(json, [], NOW), null);
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
