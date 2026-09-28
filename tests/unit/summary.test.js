import { test } from "node:test";
import assert from "node:assert/strict";
import { overview, themeBreakdown, testTrend, strengths } from "../../src/js/summary.js";
import { applyAnswer } from "../../src/js/engine.js";
import { NOW, DAY, makeQuestions, card, saveWith } from "./helpers.js";

test("vue d'ensemble : maîtrise, vues et à revoir", () => {
  const q = makeQuestions(2, 5);
  const save = saveWith({
    "t0-q0": card({ level: 3 }), "t0-q1": card({ level: 5, due: NOW + DAY }), "t1-q0": card({ level: 1, due: NOW - DAY }),
  });
  const o = overview(q, save, NOW);
  assert.equal(o.total, 10);
  assert.equal(o.seen, 3);
  assert.equal(o.mastered, 2);
  assert.equal(o.due, 2);
  assert.equal(o.pct, 20);
  assert.equal(o.learning, 1); // seen, level 1 or 2
  assert.equal(o.learningPct, 10);
});

test("résumé par thème : maîtrisées, en cours et vues", () => {
  const rows = themeBreakdown(makeQuestions(2, 4), saveWith({
    "t1-q0": card({ level: 4 }), "t1-q1": card(), "t1-q2": card({ level: 0, correct: 0 }),
  }));
  assert.deepEqual(rows, [
    { theme: "Thème 0", total: 4, seen: 0, mastered: 0, learning: 0, pct: 0, learningPct: 0, seenPct: 0 },
    { theme: "Thème 1", total: 4, seen: 3, mastered: 1, learning: 1, pct: 25, learningPct: 25, seenPct: 75 },
  ]);
});

test("résumé par thème : des questions réussies en test blanc font avancer la barre", () => {
  const q = makeQuestions(1, 10);
  const cards = {};
  for (const x of q.slice(0, 6)) cards[x.id] = applyAnswer(undefined, { correct: true, mode: "test", now: NOW });
  const [row] = themeBreakdown(q, saveWith(cards));
  assert.equal(row.pct, 0);
  assert.equal(row.learning, 6);
  assert.equal(row.learningPct, 60);
});

test("tendance des tests blancs", () => {
  assert.deepEqual(testTrend([]), { count: 0, best: null, last: null, average: null, delta: null });
  const t = testTrend([10, 14, 12, 16].map(c => ({ at: NOW, correct: c, total: 20, byTheme: {} })));
  assert.deepEqual(t, { count: 4, best: 16, last: 16, average: 14, delta: 4 });
});

test("points forts et à renforcer d'une séance", () => {
  const r = strengths({ A: { correct: 5, total: 5 }, B: { correct: 1, total: 4 }, C: { correct: 3, total: 5 } });
  assert.deepEqual(r, { strong: ["A"], weak: ["B", "C"] });
});
