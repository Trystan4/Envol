// Entry point: loads the deck and the save, keeps the running session, dispatches button actions.
// Every action updates `state`, then renders one screen. Screens only build HTML.

import { DAY, RETRY_LIMIT, RETRY_GAP, REVIEWS_KEPT, ACTIVITY_DAYS_KEPT, TEST_DURATION_MIN, TIMER_WARNING_SEC } from "./config.js";
import { loadDeck } from "./deck.js";
import { createStore, validateSave, isValidExamDate, MAX_IMPORT_BYTES } from "./storage.js";
import { buildReviewSession, buildMockTest, buildMistakesSession, mistakePool, applyAnswer } from "./engine.js";
import { overview, themeBreakdown, testTrend, strengths, reviewCount, streak, calendar, disputed, backupDue } from "./summary.js";
import { shuffle, daysUntil, isoDate } from "./util.js";
import { renderHome } from "./screens/home.js";
import { renderQuestion, formatClock } from "./screens/question.js";
import { renderResults } from "./screens/results.js";
import { renderSummary } from "./screens/summary.js";
import { renderBackup } from "./screens/backup.js";
import { renderSettings } from "./screens/settings.js";
import { renderGuide, renderDeckError } from "./screens/guide.js";

const $app = document.getElementById("app");

// Some private modes refuse localStorage outright: the app still runs, and says it cannot save.
function phoneStorage() {
  try { const s = window.localStorage; s.getItem("envol-probe"); return s; } catch {
    return { getItem: () => null, setItem: () => { throw new Error("stockage indisponible"); }, removeItem: () => {} };
  }
}
const store = createStore(phoneStorage());

const state = {
  questions: [],
  save: null,
  session: null,
  storageFull: false, // the last write was refused by the phone
  recovered: false, // an unreadable save was set aside at startup
};

function render(html) {
  $app.innerHTML = html;
  window.scrollTo(0, 0);
  // VoiceOver starts reading each new screen from its title.
  const title = $app.querySelector("h1, h2");
  if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
}
function persist() { state.storageFull = !store.save(state.save); }

async function loadQuestions() {
  const fetchJson = async path => {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path} : ${r.status}`);
    return r.json();
  };
  try {
    const { questions, errors } = await loadDeck(fetchJson);
    if (errors.length) console.warn("Fiches ignorées :", errors);
    state.questions = questions;
  } catch (e) {
    console.warn("Fiches illisibles :", e);
    state.questions = [];
  }
}

/* ---------- Screens ---------- */

function showHome() {
  state.session = null;
  if (!state.questions.length) return render(renderDeckError());
  const notices = [];
  if (state.storageFull) notices.push("Le stockage de l'iPhone refuse d'enregistrer : les derniers progrès ne sont pas gardés. Fais une copie depuis Sauvegarde.");
  if (state.recovered) notices.push("La sauvegarde de cet iPhone était abîmée : l'app repart de zéro. Si tu as une copie, reprends-la depuis Sauvegarde.");
  const now = Date.now();
  const firsts = Object.values(state.save.cards).map(c => c.firstSeen);
  const since = state.save.lastExport ?? (firsts.length ? Math.min(...firsts) : now);
  render(renderHome({
    ov: overview(state.questions, state.save, now),
    days: daysUntil(state.save.examDate, now),
    firstTime: !Object.keys(state.save.cards).length,
    notices,
    mistakes: mistakePool(state.questions, state.save, now).length,
    backupDays: backupDue(state.save, now) ? (state.save.lastExport === null ? Infinity : Math.floor((now - since) / DAY)) : null,
  }));
}

function showSummary(message = "") {
  const now = Date.now();
  render(renderSummary({
    streak: streak(state.save.activity, now),
    days: calendar(state.save.activity, now),
    disputed: disputed(state.questions, state.save),
    message,
    ov: overview(state.questions, state.save, now),
    themes: themeBreakdown(state.questions, state.save),
    trend: testTrend(state.save.tests),
    tests: state.save.tests,
    reviewsThisWeek: reviewCount(state.save, now - 7 * DAY),
  }));
}

const showBackup = (feedback = {}) => render(renderBackup({ ...feedback, canUndo: store.canUndoImport() }));
const showSettings = (feedback = {}) => render(renderSettings({
  ...feedback, examDate: state.save.examDate, today: isoDate(Date.now()), timed: state.save.timedTests, minutes: TEST_DURATION_MIN,
}));

/* ---------- Session ---------- */

// mode: "review" or "test"; "mistakes" is a review session drawn from recent mistakes only.
function startSession(mode, focusThemes = null) {
  if (!state.questions.length) return render(renderDeckError());
  const now = Date.now();
  const queue = mode === "test" ? buildMockTest(state.questions, state.save, { now })
    : mode === "mistakes" ? buildMistakesSession(state.questions, state.save, { now })
    : buildReviewSession(state.questions, state.save, { now, focusThemes });
  if (!queue.length) return showHome();
  const timed = mode === "test" && state.save.timedTests;
  state.session = {
    mode: mode === "test" ? "test" : "review", queue, size: queue.length, index: 0, selected: new Set(), answered: false, order: null,
    lastCorrect: false, requeued: false, revealed: false, flagOpen: false, unanswered: 0,
    deadline: timed ? now + TEST_DURATION_MIN * 60e3 : null, warnMs: TIMER_WARNING_SEC * 1000,
    byTheme: {}, mistakes: [], retries: {}, missed: new Set(), correct: 0, total: 0, finished: false, weak: [],
  };
  if (timed) startTimer();
  showQuestion();
}

const flagOf = id => state.save.flags[id] || { review: false, dispute: false };

function showQuestion() {
  const s = state.session;
  if (s.index >= s.queue.length) return finishSession();
  const q = s.queue[s.index];
  if (!s.order && q.kind === "mcq") s.order = shuffle(q.answers.map((_, k) => k));
  render(renderQuestion(s, flagOf(q.id), Date.now()));
}

// The user's own marks on a question: "à revoir" (drawn more often) and "réponse douteuse" (listed).
function toggleFlag(kind) {
  const s = state.session, id = s.queue[s.index].id;
  const flag = { ...flagOf(id), [kind]: !flagOf(id)[kind] };
  if (flag.review || flag.dispute) state.save.flags[id] = flag; else delete state.save.flags[id];
  persist();
  showQuestion();
}

/* ---------- Mock test timer ---------- */

let timer = null;
function startTimer() {
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}
function stopTimer() { clearInterval(timer); timer = null; }
function tick() {
  const s = state.session;
  if (!s || !s.deadline || s.finished) return stopTimer();
  const left = s.deadline - Date.now();
  if (left <= 0) return timeUp();
  const el = document.getElementById("timer");
  if (el) { el.textContent = formatClock(left); el.classList.toggle("low", left <= s.warnMs); }
}
// Time is up: questions left unanswered count as wrong in the grade (their progress is not touched).
function timeUp() {
  const s = state.session;
  stopTimer();
  for (const q of s.queue.slice(s.index)) {
    const t = s.byTheme[q.theme] || (s.byTheme[q.theme] = { correct: 0, total: 0 });
    s.total++; t.total++; s.unanswered++;
  }
  s.index = s.queue.length;
  finishSession();
}
// Back from another app: the deadline kept running, catch up at once.
document.addEventListener("visibilitychange", () => { if (!document.hidden && timer) tick(); });

function record(q, correct) {
  const s = state.session;
  const retry = s.missed.has(q.id);
  state.save.cards[q.id] = applyAnswer(state.save.cards[q.id], { correct, mode: s.mode, retry, now: Date.now() });
  const today = isoDate(Date.now());
  if (state.save.activity[state.save.activity.length - 1] !== today) {
    state.save.activity = state.save.activity.concat(today).slice(-ACTIVITY_DAYS_KEPT);
  }
  if (!retry) { // the score counts first attempts only
    const t = s.byTheme[q.theme] || (s.byTheme[q.theme] = { correct: 0, total: 0 });
    s.total++; t.total++;
    if (correct) { s.correct++; t.correct++; } else s.mistakes.push(q);
  }
  s.requeued = false;
  if (!correct && s.mode === "review") {
    s.missed.add(q.id);
    s.retries[q.id] = (s.retries[q.id] || 0) + 1;
    if (s.retries[q.id] <= RETRY_LIMIT) {
      // A marked copy: the counter shows "Nouvel essai" instead of growing the total.
      s.queue.splice(Math.min(s.index + RETRY_GAP, s.queue.length), 0, { ...q, retry: true });
      s.requeued = true;
    }
  }
  persist();
}

// selfGrade: the user's own verdict on a flashcard.
function validate(selfGrade) {
  const s = state.session, q = s.queue[s.index];
  const correct = q.kind === "card" ? selfGrade : q.answers.every((a, k) => a.correct === s.selected.has(k));
  record(q, correct);
  if (s.mode === "test") return next();
  s.answered = true;
  s.lastCorrect = correct;
  showQuestion();
}

function next() {
  const s = state.session;
  s.index++; s.selected = new Set(); s.answered = false; s.order = null; s.revealed = false; s.flagOpen = false;
  showQuestion();
}

function choose(k) {
  const s = state.session, q = s.queue[s.index];
  if (s.mode === "test" || q.multi) {
    if (s.selected.has(k)) s.selected.delete(k);
    else if (q.multi) s.selected.add(k);
    else s.selected = new Set([k]);
    showQuestion();
  } else {
    s.selected = new Set([k]);
    validate();
  }
}

function finishSession() {
  const s = state.session;
  stopTimer();
  if (!s.finished) {
    s.finished = true;
    const result = { at: Date.now(), correct: s.correct, total: s.total };
    if (s.total && s.mode === "test") state.save.tests.push({ ...result, byTheme: s.byTheme });
    if (s.total && s.mode === "review") state.save.reviews = state.save.reviews.concat(result).slice(-REVIEWS_KEPT);
    persist();
  }
  const { strong, weak } = strengths(s.byTheme);
  s.weak = weak;
  render(renderResults({ s, strong, weak }));
}

function quit() {
  const s = state.session;
  if (s && s.mode === "test") { if (confirm("Arrêter le test ? Il ne sera pas noté.")) { stopTimer(); showHome(); } }
  else if (s && s.total) finishSession();
  else showHome();
}

/* ---------- Backup ---------- */

async function exportBackup() {
  const name = `envol-sauvegarde-${isoDate(Date.now())}.json`;
  const blob = new Blob([store.exportText(state.save)], { type: "application/json" });
  try {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Sauvegarde Envol" });
      return markExported();
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // share sheet closed
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  markExported();
}

function markExported() {
  state.save.lastExport = Date.now();
  persist();
  showBackup({ message: "Copie enregistrée. Garde-la en lieu sûr (Fichiers, message…)." });
}

// Sends the list of doubtful answers (share sheet, or clipboard as a fallback).
async function shareDisputes() {
  const lines = disputed(state.questions, state.save).map(q =>
    `- [${q.id}] ${q.question}\n  Réponse de la fiche : ${q.kind === "card" ? q.answer : q.answers.filter(a => a.correct).map(a => a.text).join(", ")}`);
  const text = `Envol : réponses douteuses signalées\n\n${lines.join("\n")}`;
  try {
    if (navigator.share) { await navigator.share({ title: "Envol : réponses douteuses", text }); return; }
    await navigator.clipboard.writeText(text);
    showSummary("Liste copiée : colle-la dans un message.");
  } catch (e) {
    if (e && e.name === "AbortError") return;
    showSummary("Impossible d'envoyer la liste depuis ce navigateur.");
  }
}

function importBackup(file) {
  // Checked before reading, so a huge file picked by mistake never loads into memory.
  if (file.size > MAX_IMPORT_BYTES) return showBackup({ error: "Import impossible : ce fichier est bien trop gros pour être une sauvegarde Envol. Rien n'a été modifié." });
  const reader = new FileReader();
  reader.onerror = () => showBackup({ error: "Import impossible : le fichier n'a pas pu être lu." });
  reader.onload = () => {
    const text = String(reader.result);
    let error;
    try { error = validateSave(JSON.parse(text)); } catch { error = "ce fichier n'est pas une sauvegarde Envol"; }
    if (error) return showBackup({ error: `Import impossible : ${error}. Rien n'a été modifié.` });
    if (!confirm("Remplacer les progrès de cet iPhone par ceux de la copie ?")) return;
    const r = store.importText(text, state.save);
    if (!r.ok) return showBackup({ error: `Import impossible : ${r.error}. Rien n'a été modifié.` });
    state.save = r.data;
    state.recovered = false;
    showBackup({ message: "C'est fait, les progrès de la copie sont de retour." });
  };
  reader.readAsText(file);
}

function undoImport() {
  const data = store.undoImport();
  if (!data) return showBackup({ error: "Il n'y a plus d'import à annuler." });
  state.save = data;
  showBackup({ message: "Import annulé : les progrès d'avant sont de retour." });
}

/* ---------- Settings ---------- */

function saveExam() {
  const value = document.getElementById("exam").value;
  if (!value) return showSettings({ error: "Choisis d'abord une date." });
  if (!isValidExamDate(value)) return showSettings({ error: "Cette date n'est pas valide." });
  if (value < isoDate(Date.now())) return showSettings({ error: "Cette date est déjà passée." });
  state.save.examDate = value;
  persist();
  showSettings({ message: "Date enregistrée, le rythme est ajusté." });
}

function clearExam() {
  state.save.examDate = null;
  persist();
  showSettings({ message: "Date retirée." });
}

/* ---------- Actions ---------- */

const actions = {
  review: () => startSession("review"),
  mistakes: () => startSession("mistakes"),
  flagMenu: () => { state.session.flagOpen = !state.session.flagOpen; showQuestion(); },
  flagReview: () => toggleFlag("review"),
  flagDispute: () => toggleFlag("dispute"),
  reveal: () => { state.session.revealed = true; showQuestion(); },
  selfGrade: button => validate(button.dataset.v === "1"),
  shareDisputes,
  toggleTimed: () => { state.save.timedTests = !state.save.timedTests; persist(); showSettings(); },
  test: () => startSession("test"),
  focus: () => startSession("review", state.session && state.session.weak),
  home: showHome,
  summary: () => showSummary(),
  backup: () => showBackup(),
  settings: () => showSettings(),
  export: exportBackup,
  import: () => document.getElementById("file").click(),
  undoImport,
  saveExam,
  clearExam,
  guideDone: () => { store.markGuideSeen(); showHome(); },
  reload: async () => { await loadQuestions(); showHome(); },
  choose: button => choose(Number(button.dataset.k)),
  validate: () => validate(),
  next,
  quit,
};

$app.addEventListener("click", e => {
  const button = e.target.closest("[data-act]");
  if (!button || button.disabled) return;
  const action = actions[button.dataset.act];
  if (action) action(button);
});

$app.addEventListener("change", e => {
  if (e.target.id !== "file" || !e.target.files[0]) return;
  importBackup(e.target.files[0]);
  e.target.value = ""; // the same file can be picked again
});

/* ---------- Startup ---------- */

const isInstalled = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

(async function start() {
  const { data, recovered } = store.load();
  state.save = data;
  state.recovered = recovered;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  await loadQuestions();
  if (!isInstalled() && !store.guideSeen()) render(renderGuide());
  else showHome();
})();
