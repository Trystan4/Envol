// A month of revision, simulated: 300 questions, exam in 30 days, 80 % right answers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReviewSession, applyAnswer } from "../../src/js/engine.js";
import { overview } from "../../src/js/summary.js";
import { createRng, isoDate } from "../../src/js/util.js";
import { DAY, NOW, makeQuestions, saveWith } from "./helpers.js";

function simulate(sessionsPerDay, seed = 1) {
  const rng = createRng(seed);
  const questions = makeQuestions(12, 25);
  const save = saveWith({}, { examDate: isoDate(NOW + 30 * DAY) });
  const days = [];
  for (let d = 0; d < 30; d++) {
    for (let k = 0; k < sessionsPerDay; k++) {
      const now = NOW + d * DAY + k * 3 * 3600e3;
      for (const q of buildReviewSession(questions, save, { now, rng })) {
        save.cards[q.id] = applyAnswer(save.cards[q.id], { correct: rng() < 0.8, mode: "review", now });
      }
    }
    days.push(overview(questions, save, NOW + d * DAY + 20 * 3600e3));
  }
  return days;
}

test("tout le programme est découvert 3 jours avant l'examen, même à 1 séance par jour", () => {
  for (const perDay of [1, 2, 3]) assert.equal(simulate(perDay)[26].seen, 300, `${perDay} séance(s) par jour`);
});

test("plus on révise, plus la maîtrise monte", () => {
  const at30 = [1, 2, 3].map(n => simulate(n)[29].pct);
  assert.ok(at30[0] < at30[1] && at30[1] < at30[2], at30.join(" < "));
});
