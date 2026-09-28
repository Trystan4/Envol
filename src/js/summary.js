// Figures shown on the home, results and summary screens. Pure.

import { MASTERED_LEVEL, DAY, CALENDAR_DAYS, BACKUP_REMINDER_DAYS, NEW_PER_SESSION_MAX } from "./config.js";
import { isSeen, dailyPlan, rightAnswerText } from "./engine.js";
import { grade20, isoDate, startOfDay } from "./util.js";

export function overview(questions, save, now) {
  let seen = 0, mastered = 0, learning = 0, due = 0;
  for (const q of questions) {
    const c = save.cards[q.id];
    if (!isSeen(c)) continue;
    seen++;
    if (c.level >= MASTERED_LEVEL) mastered++;
    else if (c.level > 0) learning++;
    if (c.due <= now) due++;
  }
  const total = questions.length;
  const fresh = dailyPlan(questions, save, now).left;
  return {
    total, seen, mastered, learning, due,
    toDoToday: due + fresh, // every new question of the day, even beyond one session
    sessionsToday: Math.ceil(fresh / NEW_PER_SESSION_MAX), // sessions needed for today's new questions

    pct: total ? Math.round(mastered / total * 100) : 0,
    learningPct: total ? Math.round(learning / total * 100) : 0,
  };
}

// By theme, three steps: mastered (level MASTERED_LEVEL and up), learning (level 1 to below it),
// seen (answered, back at level 0). pct stays the share of mastered questions.
export function themeBreakdown(questions, save) {
  const rows = new Map();
  for (const q of questions) {
    const r = rows.get(q.theme) || rows.set(q.theme, { theme: q.theme, total: 0, seen: 0, mastered: 0, learning: 0 }).get(q.theme);
    const c = save.cards[q.id];
    r.total++;
    if (!isSeen(c)) continue;
    r.seen++;
    if (c.level >= MASTERED_LEVEL) r.mastered++;
    else if (c.level > 0) r.learning++;
  }
  const share = (n, r) => Math.round(n / r.total * 100);
  return [...rows.values()].map(r => ({ ...r, pct: share(r.mastered, r), learningPct: share(r.learning, r), seenPct: share(r.seen, r) }));
}

export function testTrend(tests) {
  const grades = tests.map(t => grade20(t.correct, t.total));
  const lastThree = grades.slice(-3);
  return {
    count: grades.length,
    best: grades.length ? Math.max(...grades) : null,
    last: grades.length ? grades[grades.length - 1] : null,
    average: lastThree.length ? Math.round(lastThree.reduce((a, b) => a + b, 0) / lastThree.length * 2) / 2 : null,
    delta: grades.length > 1 ? grades[grades.length - 1] - grades[grades.length - 2] : null,
  };
}

// Strong and weak themes of one session. byTheme: { theme: { correct, total } }.
export function strengths(byTheme) {
  const rows = Object.entries(byTheme)
    .map(([theme, v]) => ({ theme, rate: v.correct / v.total }))
    .sort((a, b) => b.rate - a.rate);
  let strong = rows.filter(x => x.rate >= 0.8).map(x => x.theme);
  if (!strong.length && rows.length && rows[0].rate > 0) strong = [rows[0].theme];
  const weak = rows.filter(x => x.rate < 0.7 && !strong.includes(x.theme)).reverse().slice(0, 3).map(x => x.theme);
  return { strong: strong.slice(0, 3), weak };
}

export const reviewCount = (save, since) => save.reviews.filter(r => r.at >= since).length;

// Consecutive days with activity, ending today (or yesterday: the day is not over yet).
export function streak(activity, now) {
  const days = new Set(activity);
  let d = new Date(now);
  if (!days.has(isoDate(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(isoDate(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// The last CALENDAR_DAYS days, oldest first: { day: "YYYY-MM-DD", active, today }.
export function calendar(activity, now) {
  const days = new Set(activity), out = [];
  const d = new Date(now);
  d.setDate(d.getDate() - (CALENDAR_DAYS - 1));
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    const day = isoDate(d);
    out.push({ day, active: days.has(day), today: i === CALENDAR_DAYS - 1 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// The questions missed most often (at least once): most errors first, then the highest error rate.
export const mostMissed = (questions, save, n) => questions
  .map(q => { const c = save.cards[q.id]; return isSeen(c) ? { q, errors: c.seen - c.correct, rate: (c.seen - c.correct) / c.seen } : null; })
  .filter(x => x && x.errors > 0)
  .sort((a, b) => b.errors - a.errors || b.rate - a.rate)
  .slice(0, n)
  .map(x => ({ ...x.q, errors: x.errors }));

// How many questions were discovered, and the day the last one will be at the current pace
// (the day's plan: 10 a day without an exam date). date is null once everything was seen.
export function discoveryForecast(questions, save, now) {
  const total = questions.length;
  const seen = questions.filter(q => isSeen(save.cards[q.id])).length;
  if (seen === total) return { seen, total, date: null };
  const { perDay, left } = dailyPlan(questions, save, now);
  const unseen = total - seen;
  const days = left > 0 ? Math.ceil((unseen - left) / perDay) : Math.ceil(unseen / perDay);
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() + days); // calendar days, right across daylight saving changes
  return { seen, total, date: +d };
}

// Answers given today (finished sessions and mock tests) and today's goal: those plus what is still
// to do today (due questions and the day's new ones).
export function dayProgress(questions, save, now) {
  const today = startOfDay(now);
  const done = [...save.reviews, ...save.tests].filter(r => r.at >= today).reduce((sum, r) => sum + r.total, 0);
  return { done, goal: done + overview(questions, save, now).toDoToday };
}

// Questions whose answer the user doubts, to send to whoever writes the fiches.
export const disputed = (questions, save) => questions.filter(q => save.flags[q.id] && save.flags[q.id].dispute);

// Reported questions whose fiche now gives another answer than the one doubted: corrected since.
export const correctedReports = (questions, save) => disputed(questions, save).filter(q => {
  const seen = save.flags[q.id].answer;
  return seen !== undefined && seen !== rightAnswerText(q);
});

// The file the user sends back: app version and fiches fingerprint say exactly what was on screen,
// the fiche's answer and the user's reason say what is doubted. Read by tools/signalements.mjs.
export const reportFile = (questions, save, { version, fingerprint, now }) => ({
  app: "envol", type: "signalements", version, fiches: fingerprint, date: isoDate(now),
  items: disputed(questions, save).map(q => ({
    id: q.id, theme: q.theme, page: q.page, question: q.question,
    reponse: rightAnswerText(q),
    note: save.flags[q.id].note || "",
  })),
});

// The same report as an e-mail link (see REPORT_EMAIL): one paragraph per question. Mail apps refuse
// very long links, so the body stops at MAIL_BODY_MAX characters and says the file holds the rest.
export const MAIL_BODY_MAX = 1800;
export function reportMail(file, address) {
  const items = file.items.map(x => [
    `${x.question} (${x.id}${x.page ? `, page ${x.page}` : ""})`,
    `Réponse de la fiche : ${x.reponse}`,
    x.note ? `Pourquoi : ${x.note}` : "",
  ].filter(Boolean).join("\n"));
  let body = `Version ${file.version}, fiches ${file.fiches}\n\n${items.join("\n\n")}`;
  if (body.length > MAIL_BODY_MAX) body = `${body.slice(0, MAIL_BODY_MAX)}…\n\n(Suite coupée : envoie aussi le fichier des signalements.)`;
  const subject = `Envol : ${file.items.length} question${file.items.length > 1 ? "s" : ""} signalée${file.items.length > 1 ? "s" : ""}`;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// True when there is progress worth keeping and no copy was made for BACKUP_REMINDER_DAYS days
// (counted from the first answer when no copy was ever made).
export function backupDue(save, now) {
  const firsts = Object.values(save.cards).map(c => c.firstSeen);
  if (!firsts.length) return false;
  const since = save.lastExport ?? Math.min(...firsts);
  return now - since > BACKUP_REMINDER_DAYS * DAY;
}
