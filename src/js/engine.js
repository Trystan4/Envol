// Question selection engine. Pure: no DOM, no storage, time and randomness are passed in.
//
// Each question gets a weight from its past results (level, error rate, due date, recent mistake).
// Sessions are then drawn at random in proportion to those weights: a weak question is more
// likely to come up, a mastered one less likely, but never impossible. When there are no results
// yet, every weight is equal and the draw is a plain random shuffle.

import {
  DAY, INTERVALS, SESSION_SIZE, TEST_SIZE, NEW_PER_SESSION_MAX, NEW_PER_DAY_DEFAULT,
  NEW_PER_DAY_MIN, EXAM_MARGIN_DAYS, WEIGHTS, MASTERED_LEVEL, MISTAKES_WINDOW_DAYS, MISTAKE_BOOST_DAYS,
} from "./config.js";
import { shuffle, startOfDay, daysUntil } from "./util.js";

export const isSeen = card => !!(card && card.seen);

export function cardWeight(card, now) {
  if (!isSeen(card)) return WEIGHTS.unseen;
  const errorRate = (card.seen - card.correct + 1) / (card.seen + 2); // smoothed: 1 miss out of 1 is not 100 %
  const overdueDays = (now - card.due) / DAY;
  const due = overdueDays >= 0 ? 1 + Math.min(overdueDays, WEIGHTS.overdueCapDays) / WEIGHTS.overdueCapDays : WEIGHTS.notDue;
  // A review mistake is pushed for a day; a mock test mistake sets a longer boostUntil.
  const boostEnd = Math.max(card.boostUntil ?? 0, card.lastWrong === null ? 0 : card.lastWrong + MISTAKE_BOOST_DAYS.review * DAY);
  const recent = now < boostEnd ? WEIGHTS.recentMistake : 1;
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
// Today's plan for new questions: how many a day (perDay), how many are still to discover today (left),
// and in how many review sessions (a session brings at most NEW_PER_SESSION_MAX new ones).
export function dailyPlan(questions, save, now) {
  const today = startOfDay(now);
  let unseen = 0, introducedToday = 0;
  for (const q of questions) {
    const c = save.cards[q.id];
    if (!isSeen(c)) unseen++;
    else if (c.firstSeen >= today) introducedToday++;
  }
  const days = daysUntil(save.examDate, now);
  const perDay = days === null
    ? NEW_PER_DAY_DEFAULT
    : Math.max(NEW_PER_DAY_MIN, Math.ceil((unseen + introducedToday) / Math.max(1, days - EXAM_MARGIN_DAYS)));
  return { perDay, left: Math.max(0, Math.min(perDay - introducedToday, unseen)), sessions: Math.ceil(perDay / NEW_PER_SESSION_MAX) };
}

// New questions for the next review session.
export const newQuota = (questions, save, now) => Math.min(NEW_PER_SESSION_MAX, dailyPlan(questions, save, now).left);

// Marked "à revoir" by the user.
// The answer a question expects, as text: kept with a report to know whether the fiche changed since.
export const rightAnswerText = q => q.kind === "card" ? q.answer : q.answers.filter(a => a.correct).map(a => a.text).join(", ");

// Questions that can be drawn: a reported question is set aside while the fiche still gives the answer
// the user doubted (a report made before answers were recorded counts as such), until it is withdrawn.
export const activeQuestions = (questions, save) => questions.filter(q => {
  const f = save.flags[q.id];
  return !(f && f.dispute && (f.answer === undefined || f.answer === rightAnswerText(q)));
});

export const isFlagged = (save, id) => !!(save.flags && save.flags[id] && save.flags[id].review);

// size: SESSION_SIZE, or EXPRESS_SIZE for an express session (new questions in the same proportion).
export function buildReviewSession(questions, save, { now, rng = Math.random, focusThemes = null, size = SESSION_SIZE }) {
  const focus = q => (focusThemes && focusThemes.includes(q.theme) ? WEIGHTS.focusTheme : 1)
    * (isFlagged(save, q.id) ? WEIGHTS.flagged : 1);
  const unseen = questions.filter(q => !isSeen(save.cards[q.id]));
  const seen = questions.filter(q => isSeen(save.cards[q.id]));
  const maxNew = Math.round(size * NEW_PER_SESSION_MAX / SESSION_SIZE);
  const fresh = weightedSample(unseen, focus, Math.min(maxNew, newQuota(questions, save, now)), rng);
  const known = weightedSample(seen, q => cardWeight(save.cards[q.id], now) * focus(q), size - fresh.length, rng);
  let picked = fresh.concat(known);
  // Not enough known questions yet (first days): top up with more new ones.
  const room = Math.min(size - picked.length, NEW_PER_SESSION_MAX - fresh.length);
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

// New state of a question after an answer. mode: "review" or "test".
// A mock test mistake happened in exam conditions: the question starts again from level 0 and is
// pushed for longer. A right answer in a mock test counts like a review only when the question was
// new or due, so a test taken right after a review does not inflate levels.
export function applyAnswer(card, { correct, mode, now }) {
  const c = isSeen(card)
    ? { ...card }
    : { level: 0, due: now, seen: 0, correct: 0, firstSeen: now, lastWrong: null };
  const wasDue = !isSeen(card) || card.due <= now;
  c.seen++;
  if (!correct) {
    c.level = mode === "test" ? 0 : Math.max(0, c.level - 2);
    c.due = now;
    c.lastWrong = now;
    if (mode === "test") c.boostUntil = Math.max(c.boostUntil ?? 0, now + MISTAKE_BOOST_DAYS.test * DAY);
    return c;
  }
  c.correct++;
  if (mode === "test" && !wasDue) return c;
  c.level = Math.min(INTERVALS.length - 1, c.level + 1);
  c.due = now + INTERVALS[c.level] * DAY;
  return c;
}
