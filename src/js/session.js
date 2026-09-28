// Keeps a running session across a restart: phones close apps left in the background, and the user
// finds "En cours · Reprendre" on the home screen. Pure: the caller stores the result as JSON.

export const SESSION_MAX_AGE = 12 * 3600e3; // an older session is dropped

const isCount = x => Number.isInteger(x) && x >= 0;

// A question answered but not yet left ("Continuer" not tapped) is already recorded: resume after it.
export const serializeSession = (s, now) => ({
  v: 1, at: now, mode: s.mode, label: s.label || null,
  queue: s.queue.map(q => [q.id, 0]), // [id, 0]: the 0 was a "second try" mark, kept for older versions
  index: s.answered ? s.index + 1 : s.index,
  size: s.size, correct: s.correct, total: s.total, unanswered: s.unanswered,
  byTheme: s.byTheme, mistakes: s.mistakes.map(q => q.id),
  deadline: s.deadline, warnMs: s.warnMs,
});

// Rebuilds the session from the current questions, or null when it is too old, damaged, finished,
// or refers to a question that no longer exists.
export function restoreSession(x, questions, now) {
  try {
    if (!x || x.v !== 1 || !Number.isFinite(x.at) || now - x.at > SESSION_MAX_AGE || x.at - now > 60e3) return null;
    if ((x.mode !== "review" && x.mode !== "test") || !Array.isArray(x.queue)) return null;
    const byId = new Map(questions.map(q => [q.id, q]));
    if (!x.queue.length || !x.queue.every(e => Array.isArray(e) && byId.has(e[0]))) return null;
    if (!isCount(x.index)) return null;
    // Sessions kept by 2.4 and before may hold second tries of missed questions: they are dropped.
    const index = x.queue.slice(0, x.index).filter(e => !e[1]).length;
    const queue = x.queue.filter(e => !e[1]).map(([id]) => byId.get(id));
    if (index >= queue.length) return null;
    if (![x.size, x.correct, x.total, x.unanswered].every(isCount) || x.correct > x.total) return null;
    if (x.deadline !== null && !Number.isFinite(x.deadline)) return null;
    return {
      mode: x.mode, label: typeof x.label === "string" ? x.label : null, queue, size: x.size, index,
      selected: new Set(), answered: false, order: null, lastCorrect: false, revealed: false,
      flagOpen: false, reliabilityOpen: false, unanswered: x.unanswered, deadline: x.deadline, warnMs: x.warnMs,
      byTheme: x.byTheme || {}, mistakes: (x.mistakes || []).map(id => byId.get(id)).filter(Boolean),
      correct: x.correct, total: x.total,
      finished: false, weak: [],
    };
  } catch {
    return null;
  }
}
