import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardWeight, weightedSample, newQuota, dailyPlan, buildReviewSession, buildMockTest, allocateByTheme, applyAnswer,
} from "../../src/js/engine.js";
import { SESSION_SIZE, TEST_SIZE, NEW_PER_SESSION_MAX, NEW_PER_DAY_DEFAULT, WEIGHTS } from "../../src/js/config.js";
import { createRng } from "../../src/js/util.js";
import { overview } from "../../src/js/summary.js";
import { DAY, NOW, makeQuestions, card, saveWith } from "./helpers.js";

const iso = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test("poids : une question jamais vue est neutre", () => {
  assert.equal(cardWeight(undefined, NOW), WEIGHTS.unseen);
});

test("poids : plus d'erreurs, plus de chances de tomber", () => {
  const good = card({ seen: 6, correct: 6 });
  const bad = card({ seen: 6, correct: 1 });
  assert.ok(cardWeight(bad, NOW) > cardWeight(good, NOW));
});

test("poids : une question maîtrisée tombe moins souvent qu'une question fragile", () => {
  assert.ok(cardWeight(card({ level: 5, seen: 5, correct: 5 }), NOW) < cardWeight(card({ level: 1, seen: 5, correct: 5 }), NOW));
});

test("poids : pas encore à revoir, possible mais moins probable ; en retard, plus probable", () => {
  const notDue = cardWeight(card({ due: NOW + 3 * DAY }), NOW);
  const due = cardWeight(card({ due: NOW }), NOW);
  const late = cardWeight(card({ due: NOW - 7 * DAY }), NOW);
  assert.ok(notDue > 0 && notDue < due && due < late);
});

test("poids : une erreur dans les dernières 24 h double les chances", () => {
  const before = cardWeight(card({ seen: 2, correct: 1 }), NOW);
  const after = cardWeight(card({ seen: 2, correct: 1, lastWrong: NOW - 3600e3 }), NOW);
  assert.equal(after, before * WEIGHTS.recentMistake);
});

test("poids : jamais nul", () => {
  assert.ok(cardWeight(card({ level: 5, seen: 50, correct: 50, due: NOW + 30 * DAY }), NOW) >= WEIGHTS.min);
});

test("tirage : sans doublon et de la bonne taille", () => {
  const items = [...Array(30).keys()];
  const s = weightedSample(items, () => 1, 12, createRng(1));
  assert.equal(s.length, 12);
  assert.equal(new Set(s).size, 12);
  assert.deepEqual(weightedSample(items, () => 1, 0, createRng(1)), []);
  assert.equal(weightedSample(items, () => 1, 99, createRng(1)).length, 30);
});

test("tirage : sans résultat, chaque question a la même chance (mélange aléatoire)", () => {
  const rng = createRng(42), counts = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) counts[weightedSample([...Array(10).keys()], () => 1, 1, rng)[0]]++;
  for (const c of counts) assert.ok(Math.abs(c - 2000) < 200, `fréquence ${c} loin de 2000`);
});

test("tirage : la fréquence suit le poids", () => {
  const rng = createRng(7); let heavy = 0;
  for (let i = 0; i < 20000; i++) if (weightedSample(["lourd", "léger"], x => (x === "lourd" ? 3 : 1), 1, rng)[0] === "lourd") heavy++;
  assert.ok(Math.abs(heavy / 20000 - 0.75) < 0.02, `part ${heavy / 20000}`);
});

test("rythme : sans date d'examen, 10 nouvelles par jour", () => {
  assert.equal(newQuota(makeQuestions(), saveWith(), NOW), NEW_PER_DAY_DEFAULT);
});

test("rythme : avec une date d'examen, tout est découvert 3 jours avant", () => {
  const q = makeQuestions(10, 30); // 300 questions
  const save = saveWith({}, { examDate: iso(NOW + 30 * DAY) });
  assert.equal(newQuota(q, save, NOW), 12); // 300 questions sur 30 - 3 jours utiles
  assert.equal(newQuota(q, { ...save, examDate: iso(NOW + 5 * DAY) }, NOW), NEW_PER_SESSION_MAX); // plafond
});

test("rythme : le plan du jour dit combien de nouvelles il faut vraiment, et en combien de séances", () => {
  const q = makeQuestions(12, 24); // 288 questions
  const save = saveWith({}, { examDate: iso(NOW + 15 * DAY) });
  assert.deepEqual(dailyPlan(q, save, NOW), { perDay: 24, left: 24, sessions: 2 }); // 288 sur 15 - 3 jours utiles
  assert.equal(newQuota(q, save, NOW), NEW_PER_SESSION_MAX); // une séance n'en donne que 15…
  const after = saveWith(Object.fromEntries(q.slice(0, 15).map(x => [x.id, card({ firstSeen: NOW })])), { examDate: save.examDate });
  assert.equal(newQuota(q, after, NOW + 3600e3), 9); // …la deuxième donne le reste du jour
  assert.deepEqual(dailyPlan(q, saveWith(), NOW), { perDay: NEW_PER_DAY_DEFAULT, left: NEW_PER_DAY_DEFAULT, sessions: 1 });
});

test("rythme : le compte « à revoir aujourd'hui » inclut toutes les nouvelles du jour, pas seulement une séance", () => {
  const q = makeQuestions(12, 24);
  const ov = overview(q, saveWith({}, { examDate: iso(NOW + 15 * DAY) }), NOW);
  assert.equal(ov.toDoToday, 24);
  assert.equal(ov.sessionsToday, 2);
});

test("rythme : les nouvelles déjà vues aujourd'hui sont décomptées", () => {
  const q = makeQuestions();
  const cards = Object.fromEntries(q.slice(0, 10).map(x => [x.id, card({ firstSeen: NOW - 3600e3 })]));
  assert.equal(newQuota(q, saveWith(cards), NOW), 0);
});

test("révision : première séance = 15 nouvelles questions au hasard, sans doublon", () => {
  const s = buildReviewSession(makeQuestions(), saveWith(), { now: NOW, rng: createRng(3) });
  assert.equal(s.length, NEW_PER_SESSION_MAX);
  assert.equal(new Set(s.map(x => x.id)).size, s.length);
});

test("révision : séance de 20 dès qu'il y a assez de questions connues", () => {
  const q = makeQuestions();
  const cards = Object.fromEntries(q.slice(0, 25).map(x => [x.id, card()]));
  const s = buildReviewSession(q, saveWith(cards), { now: NOW, rng: createRng(4) });
  assert.equal(s.length, SESSION_SIZE);
  assert.equal(new Set(s.map(x => x.id)).size, SESSION_SIZE);
});

test("révision : les questions ratées tombent bien plus souvent que les acquises", () => {
  const q = makeQuestions(2, 30);
  const cards = {};
  q.forEach((x, i) => { cards[x.id] = i < 10 ? card({ level: 0, seen: 4, correct: 1, lastWrong: NOW - DAY / 2 }) : card({ level: 4, seen: 4, correct: 4, due: NOW + 5 * DAY, firstSeen: NOW - 20 * DAY }); });
  const weak = new Set(q.slice(0, 10).map(x => x.id));
  const rng = createRng(5); let weakDrawn = 0, total = 0;
  for (let i = 0; i < 200; i++) for (const x of buildReviewSession(q, saveWith(cards), { now: NOW, rng })) { total++; if (weak.has(x.id)) weakDrawn++; }
  assert.ok(weakDrawn / total > 0.45, `part des fragiles : ${weakDrawn / total}`); // 10 sur 60 → 17 % au hasard
});

test("révision : « On s'y met » favorise les thèmes ciblés", () => {
  const q = makeQuestions();
  const cards = Object.fromEntries(q.map(x => [x.id, card()]));
  const rng = createRng(6); let focused = 0, total = 0;
  for (let i = 0; i < 100; i++) for (const x of buildReviewSession(q, saveWith(cards), { now: NOW, rng, focusThemes: ["Thème 2"] })) { total++; if (x.theme === "Thème 2") focused++; }
  assert.ok(focused / total > 0.35, `part du thème ciblé : ${focused / total}`); // 25 % au hasard, 50 % au plus (10 questions sur 20 places)
});

test("test blanc : 20 questions, chaque thème représenté en proportion", () => {
  const q = makeQuestions(4, 10).concat(makeQuestions(6, 10).slice(40).map(x => ({ ...x, theme: "Gros thème", id: `g-${x.id}` })));
  const byTheme = {};
  for (const x of buildMockTest(q, saveWith(), { now: NOW, rng: createRng(8) })) byTheme[x.theme] = (byTheme[x.theme] || 0) + 1;
  assert.equal(Object.values(byTheme).reduce((a, b) => a + b, 0), TEST_SIZE);
  // 10/60 de 20 = 3,33 et 20/60 de 20 = 6,67 : le gros thème prend 7 places, un petit en prend 4.
  assert.equal(byTheme["Gros thème"], 7);
  assert.deepEqual([0, 1, 2, 3].map(i => byTheme[`Thème ${i}`]).sort(), [3, 3, 3, 4]);
});

test("test blanc : moins de questions que prévu, on prend tout", () => {
  const q = makeQuestions(2, 3);
  assert.equal(buildMockTest(q, saveWith(), { now: NOW, rng: createRng(1) }).length, 6);
  assert.equal(allocateByTheme(q, 20).reduce((s, g) => s + g.count, 0), 6);
});

test("test blanc : les points faibles sortent plus souvent, sans exclure le reste", () => {
  const q = makeQuestions(1, 40);
  const cards = Object.fromEntries(q.map((x, i) => [x.id, i < 10 ? card({ level: 0, seen: 3, correct: 0, lastWrong: NOW - 3600e3 }) : card({ level: 5, seen: 5, correct: 5, due: NOW + 9 * DAY })]));
  const rng = createRng(9); let weak = 0, strong = 0;
  for (let i = 0; i < 200; i++) for (const x of buildMockTest(q, saveWith(cards), { now: NOW, rng })) Number(x.id.split("q")[1]) < 10 ? weak++ : strong++;
  assert.ok(weak / (weak + strong) > 0.3 && strong > 0, `part des fragiles : ${weak / (weak + strong)}`); // 25 % au hasard
});

test("réponse : bonne du premier coup en révision, niveau +1 et intervalle", () => {
  const c = applyAnswer(undefined, { correct: true, mode: "review", now: NOW });
  assert.deepEqual(c, { level: 1, due: NOW + DAY, seen: 1, correct: 1, firstSeen: NOW, lastWrong: null });
  const c2 = applyAnswer(c, { correct: true, mode: "review", now: NOW + DAY });
  assert.equal(c2.level, 2);
  assert.equal(c2.due, NOW + DAY + 2 * DAY);
});

test("réponse : une erreur fait perdre 2 niveaux et rend la question à revoir tout de suite", () => {
  const c = applyAnswer(card({ level: 3 }), { correct: false, mode: "review", now: NOW });
  assert.equal(c.level, 1);
  assert.equal(c.due, NOW);
  assert.equal(c.lastWrong, NOW);
});

test("réponse : réussie après une erreur dans la séance, revue demain sans gagner de niveau", () => {
  const c = applyAnswer(card({ level: 0 }), { correct: true, mode: "review", retry: true, now: NOW });
  assert.equal(c.level, 0);
  assert.equal(c.due, NOW + DAY);
});

test("réponse : en test blanc, une bonne réponse ne fait pas grimper un niveau déjà acquis", () => {
  assert.equal(applyAnswer(card({ level: 3 }), { correct: true, mode: "test", now: NOW }).level, 3);
  assert.equal(applyAnswer(undefined, { correct: true, mode: "test", now: NOW }).level, 1);
});

test("réponse : l'état d'origine n'est jamais modifié", () => {
  const c = card();
  const copy = { ...c };
  applyAnswer(c, { correct: false, mode: "review", now: NOW });
  assert.deepEqual(c, copy);
});
