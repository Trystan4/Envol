// Question selection engine. Pure: no DOM, no storage, time and randomness are passed in.
//
// Each question gets a weight from its past results (level, error rate, due date, recent mistake).
// Sessions are then drawn at random in proportion to those weights: a weak question is more
// likely to come up, a mastered one less likely, but never impossible. When there are no results
// yet, every weight is equal and the draw is a plain random shuffle.

import {
  DAY, INTERVALS, SESSION_SIZE, TEST_SIZE, NEW_PER_SESSION_MAX, NEW_PER_DAY_DEFAULT,
  NEW_PER_DAY_MIN, EXAM_MARGIN_DAYS, WEIGHTS, MASTERED_LEVEL, MISTAKES_WINDOW_DAYS,
} from "./config.js";
import { shuffle, startOfDay, daysUntil } from "./util.js";

export const isSeen = card => !!(card && card.seen);

export function cardWeight(card, now) {
  if (!isSeen(card)) return WEIGHTS.unseen;
  const errorRate = (card.seen - card.correct + 1) / (card.seen + 2); // smoothed: 1 miss out of 1 is not 100 %
  const overdueDays = (now - card.due) / DAY;
  const due = overdueDays >= 0 ? 1 + Math.min(overdueDays, WEIGHTS.overdueCapDays) / WEIGHTS.overdueCapDays : WEIGHTS.notDue;
  const recent = card.lastWrong !== null && now - card.lastWrong < DAY ? WEIGHTS.recentMistake : 1;
  const w = WEIGHTS.byLevel[card.level] * (1 + WEIGHTS.errorBoost * errorRate) * due * recent;
  return Math.max(WEIGHTS.min, w);
}

// Weighted draw of k items without replacement: each item gets an exponential key of rate
// `weight`, the k smallest keys win. With equal weights this is a uniform random draw.
export function weightedSample(items, weightOf, k, rng = Math.random) {
  if (k <= 0) return [];
  return items
    .map(item => ({ item, key: -Math.log(1 - rng()) / weightOf(item) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, k)
    .map(x => x.item);
}

// How many never-seen questions to introduce now, so everything is discovered before the exam.
export function newQuota(questions, save, now) {
  const today = startOfDay(now);
  let unseen = 0, introducedToday = 0;
  for (const q of questions) {
    const c = save.cards[q.id];
    if (!isSeen(c)) unseen++;
    else if (c.firstSeen >= today) introducedToday++;
  }
  const left = daysUntil(save.examDate, now);
  const perDay = left === null
    ? NEW_PER_DAY_DEFAULT
    : Math.max(NEW_PER_DAY_MIN, Math.ceil((unseen + introducedToday) / Math.max(1, left - EXAM_MARGIN_DAYS)));
  return Math.max(0, Math.min(NEW_PER_SESSION_MAX, perDay - introducedToday, unseen));
}

// Marked "à revoir" by the user.
export const isFlagged = (save, id) => !!(save.flags && save.flags[id] && save.flags[id].review);

export function buildReviewSession(questions, save, { now, rng = Math.random, focusThemes = null }) {
  const focus = q => (focusThemes && focusThemes.includes(q.theme) ? WEIGHTS.focusTheme : 1)
    * (isFlagged(save, q.id) ? WEIGHTS.flagged : 1);
  const unseen = questions.filter(q => !isSeen(save.cards[q.id]));
  const seen = questions.filter(q => isSeen(save.cards[q.id]));
  const fresh = weightedSample(unseen, focus, newQuota(questions, save, now), rng);
  const known = weightedSample(seen, q => cardWeight(save.cards[q.id], now) * focus(q), SESSION_SIZE - fresh.length, rng);
  let picked = fresh.concat(known);
  // Not enough known questions yet (first days): top up with more new ones.
  const room = Math.min(SESSION_SIZE - picked.length, NEW_PER_SESSION_MAX - fresh.length);
  picked = picked.concat(weightedSample(unseen.filter(q => !fresh.includes(q)), focus, room, rng));
  return shuffle(picked, rng);
}

// "Mes erreurs": questions marked "à revoir", and questions missed recently and not mastered since.
export function mistakePool(questions, save, now) {
  return questions.filter(q => {
    if (isFlagged(save, q.id)) return true;
    const c = save.cards[q.id];
    return isSeen(c) && c.lastWrong !== null && now - c.lastWrong <= MISTAKES_WINDOW_DAYS * DAY && c.level < MASTERED_LEVEL;
  });
}

export function buildMistakesSession(questions, save, { now, rng = Math.random }) {
  const weight = q => cardWeight(save.cards[q.id], now) * (isFlagged(save, q.id) ? WEIGHTS.flagged : 1);
  return shuffle(weightedSample(mistakePool(questions, save, now), weight, SESSION_SIZE, rng), rng);
}

// Splits `size` slots between themes in proportion to their number of questions (largest remainder).
export function allocateByTheme(questions, size) {
  const groups = new Map();
  for (const q of questions) (groups.get(q.theme) || groups.set(q.theme, []).get(q.theme)).push(q);
  const total = Math.min(size, questions.length);
  const shares = [...groups].map(([theme, items]) => {
    const exact = items.length * total / questions.length;
    return { theme, items, count: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = total - shares.reduce((s, g) => s + g.count, 0);
  for (const g of shares.slice().sort((a, b) => b.rest - a.rest)) {
    if (!left) break;
    if (g.count < g.items.length) { g.count++; left--; }
  }
  return shares;
}

// Mock test: every theme represented in proportion, weak questions somewhat more likely.
export function buildMockTest(questions, save, { now, rng = Math.random }) {
  const weight = q => {
    const c = save.cards[q.id];
    return isSeen(c) ? cardWeight(c, now) ** WEIGHTS.testExponent : WEIGHTS.unseen;
  };
  const picked = allocateByTheme(questions, TEST_SIZE).flatMap(g => weightedSample(g.items, weight, g.count, rng));
  return shuffle(picked, rng);
}

// New state of a question after an answer. `retry`: already missed earlier in this review session.
export function applyAnswer(card, { correct, mode, retry = false, now }) {
  const c = isSeen(card)
    ? { ...card }
    : { level: 0, due: now, seen: 0, correct: 0, firstSeen: now, lastWrong: null };
  c.seen++;
  if (!correct) {
    c.level = Math.max(0, c.level - 2);
    c.due = now;
    c.lastWrong = now;
    return c;
  }
  c.correct++;
  if (mode === "test") {
    if (c.level === 0) { c.level = 1; c.due = now + DAY; }
  } else if (retry) {
    c.due = now + DAY; // right on the second try: back tomorrow, no level gained
  } else {
    c.level = Math.min(INTERVALS.length - 1, c.level + 1);
    c.due = now + INTERVALS[c.level] * DAY;
  }
  return c;
}
