// Entry point: loads the deck and the save, keeps the running session, dispatches button actions.
// Every action updates `state`, then renders one screen. Screens only build HTML.

import { EXPRESS_SIZE, DAY, REVIEWS_KEPT, ACTIVITY_DAYS_KEPT, TEST_DURATION_MIN, TIMER_WARNING_SEC, APP_VERSION, REPORT_NOTE_MAX, REPORT_EMAIL, CURVE_TESTS, QR_FRAME_MS } from "./config.js";
import { loadDeck, deckFingerprint, questionHashes, deckChanges } from "./deck.js";
import { createStore, validateSave, isValidExamDate, MAX_IMPORT_BYTES, KEY } from "./storage.js";
import { serializeSession, restoreSession } from "./session.js";
import { buildReviewSession, buildMockTest, buildMistakesSession, mistakePool, applyAnswer, activeQuestions, rightAnswerText, dailyPlan } from "./engine.js";
import { overview, themeBreakdown, testTrend, strengths, reviewCount, streak, calendar, disputed, backupDue, reportFile, mostMissed, discoveryForecast, dayProgress, correctedReports, reportMail, byFragility, noteProgress, masteryCurve } from "./summary.js";
import { shuffle, daysUntil, isoDate } from "./util.js";
import { renderHome } from "./screens/home.js";
import { renderQuestion, formatClock } from "./screens/question.js";
import { renderResults } from "./screens/results.js";
import { renderSummary } from "./screens/summary.js";
import { renderBackup } from "./screens/backup.js";
import { renderSettings } from "./screens/settings.js";
import { renderGuide, renderDeckError, detectPlatform } from "./screens/guide.js";
import { renderHelp } from "./screens/help.js";
import { renderCourse, renderCourseList } from "./screens/course.js";
import { renderSend, renderReceive, qrSvg, scanDots } from "./screens/transfer.js";
import { encodeQR } from "./qr.js";
import { decodeImage } from "./qrscan.js";
import { canTransfer, encodeFrames, transferId, collect, received, complete, assemble } from "./transfer.js";
import { buildCourse } from "./course.js";

const $app = document.getElementById("app");

// Some private modes refuse localStorage outright: the app still runs, and says it cannot save.
function phoneStorage() {
  try { const s = window.localStorage; s.getItem("envol-probe"); return s; } catch {
    return { getItem: () => null, setItem: () => { throw new Error("stockage indisponible"); }, removeItem: () => {} };
  }
}
const device = phoneStorage();
const store = createStore(device);

// The running session, kept on the phone so it can be resumed after the app was closed (see session.js).
const SESSION_KEY = `${KEY}-session`;
const keepSession = () => { try { device.setItem(SESSION_KEY, JSON.stringify(serializeSession(state.session, Date.now()))); } catch { /* not kept: nothing else to do */ } };
const dropSession = () => { try { device.removeItem(SESSION_KEY); } catch { /* already gone */ } };
function savedSession() {
  try { return restoreSession(JSON.parse(device.getItem(SESSION_KEY)), state.questions, Date.now()); } catch { return null; }
}

// What the fiches looked like at the last visit (one hash per question, kept on this device only):
// new and corrected questions are announced on the home screen until "Compris".
const DECK_KEY = `${KEY}-deck`;
const keepDeck = () => { try { device.setItem(DECK_KEY, JSON.stringify(questionHashes(state.questions))); } catch { /* announced again next time */ } };
function noteDeckChanges() {
  let before = null;
  try { before = JSON.parse(device.getItem(DECK_KEY)); } catch { /* unreadable: treated as a first visit */ }
  state.deckNews = deckChanges(before, questionHashes(state.questions));
  if (!before) keepDeck(); // first visit: every question is new, nothing to announce
}

// Display settings (larger text, forced light or dark theme), applied to the whole page.
function applyDisplay() {
  const { largeText, theme } = state.save.display;
  const root = document.documentElement;
  if (largeText) root.dataset.text = "large"; else delete root.dataset.text;
  if (theme === "auto") delete root.dataset.theme; else root.dataset.theme = theme;
}

const state = {
  questions: [],
  fingerprint: "", // of the loaded fiches, see deckFingerprint
  deckNews: { added: 0, changed: 0 }, // questions new or corrected since the last visit
  save: null,
  session: null,
  storageFull: false, // the last write was refused by the phone
  recovered: false, // an unreadable save was set aside at startup
};

// root: a screen the phone's back button leaves the app from (home, first-launch guide, deck error).
// Every other screen sits on one extra history entry, so the back button comes back into the app.
//
// A new screen starts at the top, read from its title (or from its [data-focus] element, such as the
// verdict after an answer). The same screen drawn again (a switch, a flag, an answer) keeps its scroll
// position, and the control used from the keyboard keeps the focus. [data-announce] messages are read
// aloud through the #live region, wherever the focus is.
function render(html, root = false) {
  guideOnScreen = false;
  if (leaving) { const stop = leaving; leaving = null; stop(); } // codes going by, camera: stopped with their screen
  drawn++;
  const heading = () => { const h = $app.querySelector("h1, h2"); return h ? h.textContent : null; };
  const before = heading(), scroll = window.scrollY;
  const kept = keyboardControl();
  $app.innerHTML = html;
  syncHistory(root);
  const same = before !== null && before === heading();
  window.scrollTo(0, same ? scroll : 0);
  const again = same && kept && $app.querySelector(kept);
  if (again && !again.disabled) again.focus({ preventScroll: true });
  else {
    const target = $app.querySelector("[data-focus]") || $app.querySelector("h1, h2");
    if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
  }
  announce($app.querySelector("[data-announce]"));
}

// The control focused from the keyboard, as a selector to find it again once the screen is redrawn.
function keyboardControl() {
  const el = document.activeElement;
  if (!el || !$app.contains(el) || !el.dataset.act) return null;
  try { if (!el.matches(":focus-visible")) return null; } catch { return null; } // unknown before iOS 15.4
  return ["act", "k", "v", "theme", "id"].filter(k => el.dataset[k] !== undefined)
    .map(k => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join("");
}

// Live regions only speak when their text changes after they were on the page: #live stays, its text changes.
const $live = document.getElementById("live");
let announcing = null;
function announce(el) {
  clearTimeout(announcing); // a screen drawn just before never speaks over this one
  $live.textContent = "";
  if (el) announcing = setTimeout(() => { $live.textContent = el.textContent; }, 100);
}
function persist() { state.storageFull = !store.save(state.save); }
// The questions that can be drawn now (reported ones are set aside, see activeQuestions).
const pool = () => activeQuestions(state.questions, state.save);

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
    course = null;
    state.fingerprint = deckFingerprint(questions);
    noteDeckChanges();
  } catch (e) {
    console.warn("Fiches illisibles :", e);
    state.questions = [];
  }
}

/* ---------- Screens ---------- */

function showHome() {
  state.session = null;
  if (!state.questions.length) return render(renderDeckError(), true);
  const notices = [];
  if (state.storageFull) notices.push("Le stockage de cet appareil refuse d'enregistrer : les derniers progrès ne sont pas gardés. Fais une copie depuis Sauvegarde.");
  if (state.recovered) notices.push("La sauvegarde de cet appareil était abîmée : l'app repart de zéro. Si tu as une copie, reprends-la depuis Sauvegarde.");
  const now = Date.now();
  const firsts = Object.values(state.save.cards).map(c => c.firstSeen);
  const since = state.save.lastExport ?? (firsts.length ? Math.min(...firsts) : now);
  const resume = savedSession();
  render(renderHome({
    ov: overview(pool(), state.save, now),
    progress: dayProgress(pool(), state.save, now),
    corrected: correctedReports(state.questions, state.save).length,
    deckNews: state.deckNews,
    resume: resume && { position: resume.index + 1, size: resume.size, label: resume.label },
    days: daysUntil(state.save.examDate, now),
    firstTime: !Object.keys(state.save.cards).length,
    notices,
    mistakes: mistakePool(pool(), state.save, now).length,
    backupDays: backupDue(state.save, now) ? (state.save.lastExport === null ? Infinity : Math.floor((now - since) / DAY)) : null,
  }), true);
}

function showSummary(message = "") {
  const now = Date.now();
  const ov = overview(pool(), state.save, now);
  render(renderSummary({
    streak: streak(state.save.activity, now),
    days: calendar(state.save.activity, now),
    disputed: disputed(state.questions, state.save).map(q => ({
      ...q, note: state.save.flags[q.id].note || "", setAside: !pool().includes(q),
    })),
    message,
    ov,
    curve: masteryCurve(state.save.history, ov, now),
    themes: byFragility(themeBreakdown(pool(), state.save)),
    missed: mostMissed(pool(), state.save, MISSED_SHOWN),
    forecast: discoveryForecast(pool(), state.save, now),
    trend: testTrend(state.save.tests),
    tests: state.save.tests,
    recentTests: state.save.tests.slice(-CURVE_TESTS),
    reviewsThisWeek: reviewCount(state.save, now - 7 * DAY),
    mail: REPORT_EMAIL ? reportMail(currentReport(now), REPORT_EMAIL) : null,
  }));
}

const MISSED_SHOWN = 10; // questions listed under "Les plus ratées"

const showHelp = () => render(renderHelp());
let course = null; // built once, on first opening
const showCourse = () => render(renderCourse(course || (course = buildCourse(state.questions))));
const showBackup = (feedback = {}) => render(renderBackup({ ...feedback, canUndo: store.canUndoImport(), qr: canTransfer() }));
const showSettings = (feedback = {}) => render(renderSettings({
  ...feedback, examDate: state.save.examDate, today: isoDate(Date.now()), timed: state.save.timedTests, minutes: TEST_DURATION_MIN,
  installed: isInstalled(), version: APP_VERSION, fingerprint: state.fingerprint, count: state.questions.length,
  plan: dailyPlan(pool(), state.save, Date.now()), display: state.save.display,
}));

/* ---------- Session ---------- */

// mode: "review" or "test"; "mistakes" is a review session drawn from recent mistakes only.
// only: { theme } (review that theme alone) or { missed: true } (the most missed questions).
function startSession(mode, focusThemes = null, only = null) {
  if (!state.questions.length) return render(renderDeckError(), true);
  const now = Date.now();
  const questions = pool();
  const queue = mode === "test" ? buildMockTest(questions, state.save, { now })
    : mode === "mistakes" ? buildMistakesSession(questions, state.save, { now })
    : only && only.theme ? buildReviewSession(questions.filter(q => q.theme === only.theme), state.save, { now })
    : only && only.express ? buildReviewSession(questions, state.save, { now, size: EXPRESS_SIZE })
    : only && only.missed ? shuffle(mostMissed(questions, state.save, MISSED_SHOWN).map(q => questions.find(x => x.id === q.id)))
    : buildReviewSession(questions, state.save, { now, focusThemes });
  if (!queue.length) return showHome();
  const timed = mode === "test" && state.save.timedTests;
  state.session = {
    mode: mode === "test" ? "test" : "review", queue, size: queue.length, index: 0, selected: new Set(), answered: false, order: null,
    lastCorrect: false, revealed: false, flagOpen: false, reliabilityOpen: false, unanswered: 0,
    deadline: timed ? now + TEST_DURATION_MIN * 60e3 : null, warnMs: TIMER_WARNING_SEC * 1000,
    byTheme: {}, mistakes: [], correct: 0, total: 0, finished: false, weak: [],
    label: only && only.theme ? only.theme : only && only.missed ? "Les plus ratées" : only && only.express ? "Séance express" : null,
  };
  if (timed) startTimer();
  showQuestion();
}

function resumeSession() {
  const s = savedSession();
  if (!s) return showHome();
  state.session = s;
  if (s.deadline) startTimer();
  showQuestion();
}

const flagOf = id => state.save.flags[id] || { review: false, dispute: false };

function showQuestion() {
  const s = state.session;
  if (s.index >= s.queue.length) return finishSession();
  const q = s.queue[s.index];
  if (!s.order && q.kind === "mcq") s.order = shuffle(q.answers.map((_, k) => k));
  keepSession();
  render(renderQuestion(s, flagOf(q.id), Date.now()));
}

// The user's own marks on a question: "à revoir" (drawn more often) and "réponse douteuse" (reported,
// with an optional reason). A mark with nothing left is removed.
function setFlag(id, flag) {
  if (!flag.dispute) { delete flag.note; delete flag.answer; }
  if (flag.review || flag.dispute) state.save.flags[id] = flag; else delete state.save.flags[id];
  persist();
}
const currentId = () => state.session.queue[state.session.index].id;
function toggleFlag(kind) {
  const q = state.session.queue[state.session.index];
  const flag = { ...flagOf(q.id), [kind]: !flagOf(q.id)[kind] };
  if (kind === "dispute" && flag.dispute) flag.answer = rightAnswerText(q);
  setFlag(q.id, flag);
  showQuestion();
}
// From Mes résultats: the report is withdrawn, the question can be drawn again.
function withdraw(button) {
  const id = button.dataset.id;
  if (state.save.flags[id]) setFlag(id, { ...state.save.flags[id], dispute: false });
  showSummary("Signalement retiré : la question revient dans les séances.");
}
// Reporting keeps the answer the fiche gave: the question stays out of sessions until that answer changes.
function report() {
  const s = state.session, q = s.queue[s.index];
  setFlag(q.id, { ...flagOf(q.id), dispute: true, answer: rightAnswerText(q) });
  showQuestion();
  const note = document.getElementById("reportNote");
  if (note) note.focus();
}
const saveReportNote = text => setFlag(currentId(), { ...flagOf(currentId()), note: text.trim().slice(0, REPORT_NOTE_MAX) });

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

// A missed question is not asked again in the same session: the engine brings it back in the next ones.
function record(q, correct) {
  const s = state.session;
  state.save.cards[q.id] = applyAnswer(state.save.cards[q.id], { correct, mode: s.mode, now: Date.now() });
  const today = isoDate(Date.now());
  if (state.save.activity[state.save.activity.length - 1] !== today) {
    state.save.activity = state.save.activity.concat(today).slice(-ACTIVITY_DAYS_KEPT);
  }
  state.save.history = noteProgress(state.save.history, today, overview(pool(), state.save, Date.now())); // progress curve
  const t = s.byTheme[q.theme] || (s.byTheme[q.theme] = { correct: 0, total: 0 });
  s.total++; t.total++;
  if (correct) { s.correct++; t.correct++; } else s.mistakes.push(q);
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
  s.index++; s.selected = new Set(); s.answered = false; s.order = null; s.revealed = false; s.flagOpen = false; s.reliabilityOpen = false;
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
  dropSession();
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

async function quit() {
  const s = state.session;
  if (s && s.mode === "test" && !s.finished) {
    if (await ask("Arrêter le test ?", "Il ne sera pas noté.", "Arrêter", "Continuer le test", { safe: true }) && state.session === s && !s.finished) {
      stopTimer(); dropSession(); showHome();
    }
  } else if (s && s.total && !s.finished) finishSession();
  else { dropSession(); showHome(); }
}

/* ---------- In-app confirmation ---------- */

// A question asked in the app's own window, never the browser's: resolves to true on `yes`.
// Closing it any other way (Échap, back button) means no. safe: the big button is `no` (the choice
// that loses nothing), otherwise it is `yes`.
const $ask = document.getElementById("ask");
function ask(title, text, yes, no, { safe = false } = {}) {
  $ask.querySelector("h2").textContent = title;
  $ask.querySelector("p").textContent = text;
  const [primary, secondary] = $ask.querySelectorAll("[data-ask]");
  primary.textContent = safe ? no : yes;
  primary.value = safe ? "no" : "yes";
  secondary.textContent = safe ? yes : no;
  secondary.value = safe ? "yes" : "no";
  $ask.returnValue = "";
  $ask.showModal();
  return new Promise(resolve => $ask.addEventListener("close", () => resolve($ask.returnValue === "yes"), { once: true }));
}
$ask.addEventListener("click", e => {
  const button = e.target.closest("[data-ask]");
  if (button) $ask.close(button.value);
});

/* ---------- Back button ---------- */

// The phone's back button (and the browser's) goes back inside the app instead of leaving it: every
// screen but the root ones keeps one history entry above the root, and going back runs the screen's
// own way out (its ✕ button, or leaving the session). From a root screen, back leaves the app.
let pushed = false; // the extra history entry exists
let dropping = false; // a history.back() of ours is under way: its popstate is not the user's
let onRoot = true;
function syncHistory(root) {
  onRoot = root;
  if (!root && !pushed) { history.pushState({ envol: 1 }, ""); pushed = true; }
  else if (root && pushed) { pushed = false; dropping = true; history.back(); }
}
window.addEventListener("popstate", () => {
  if (dropping) { dropping = false; return; }
  pushed = false;
  if ($ask.open) $ask.close("no");
  else if (state.session && !state.session.finished) quit();
  else if (!onRoot) {
    const close = $app.querySelector(".top .close[data-act]");
    if (close) actions[close.dataset.act](close); else showHome();
  }
  syncHistory(onRoot); // still inside the app (the test goes on, a dialog is open): back stays in the app
});

/* ---------- Backup ---------- */

// Hands a JSON file to the user: share sheet on phones (to send or keep it), download elsewhere.
// Resolves to false when the share sheet was closed without doing anything.
async function saveFile(name, text, title) {
  const blob = new Blob([text], { type: "application/json" });
  try {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return false; // share sheet closed
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

async function exportBackup() {
  if (await saveFile(`envol-sauvegarde-${isoDate(Date.now())}.json`, store.exportText(state.save), "Sauvegarde Envol")) markExported();
}

function markExported() {
  state.save.lastExport = Date.now();
  persist();
  showBackup({ message: "Copie enregistrée. Garde-la en lieu sûr (Fichiers, message…)." });
}

// The reported questions as a file, to send to whoever checks the fiches (read by tools/signalements.mjs).
const currentReport = now => reportFile(state.questions, state.save, { version: APP_VERSION, fingerprint: state.fingerprint, now });
async function exportReports() {
  const file = currentReport(Date.now());
  if (await saveFile(`envol-signalements-${file.date}.json`, JSON.stringify(file, null, 2), "Signalements Envol")) {
    showSummary("Fichier prêt : envoie-le à la personne qui vérifie les fiches.");
  }
}

function importBackup(file) {
  // Checked before reading, so a huge file picked by mistake never loads into memory.
  if (file.size > MAX_IMPORT_BYTES) return showBackup({ error: "Import impossible : ce fichier est bien trop gros pour être une sauvegarde Envol. Rien n'a été modifié." });
  const reader = new FileReader();
  reader.onerror = () => showBackup({ error: "Import impossible : le fichier n'a pas pu être lu." });
  reader.onload = async () => {
    const text = String(reader.result);
    let error;
    try { error = validateSave(JSON.parse(text)); } catch { error = "ce fichier n'est pas une sauvegarde Envol"; }
    if (error) return showBackup({ error: `Import impossible : ${error}. Rien n'a été modifié.` });
    if (!await ask("Remplacer les progrès ?", "Les progrès de cet appareil seront remplacés par ceux de la copie.", "Remplacer", "Annuler")) return;
    replaceProgress(text, "C'est fait, les progrès de la copie sont de retour.");
  };
  reader.readAsText(file);
}

// Keeps the state before the import (for "Annuler le dernier import"), then puts the copy in place.
function replaceProgress(text, message) {
  const r = store.importText(text, state.save);
  if (!r.ok) return showBackup({ error: `Import impossible : ${r.error}. Rien n'a été modifié.` });
  state.save = r.data;
  state.recovered = false;
  applyDisplay();
  showBackup({ message });
}

/* ---------- Copy to another device (QR codes) ---------- */

// What the current screen runs in the background (codes going by, camera), stopped by the next render().
let leaving = null;
let drawn = 0; // screens drawn so far: tells whether the screen is still the same after waiting

// The code of the progress, or its codes shown in turn; the screen stays awake meanwhile.
async function sendQR() {
  const frames = await encodeFrames(state.save, transferId());
  const codes = frames.map(f => qrSvg(encodeQR(f)));
  render(renderSend({ count: codes.length }));
  const $qr = document.getElementById("qr"), $count = document.getElementById("qrCount");
  let i = 0, lock = null, gone = false;
  const show = () => { $qr.innerHTML = codes[i]; if ($count) $count.textContent = `Code ${i + 1} sur ${codes.length}`; i = (i + 1) % codes.length; };
  show();
  const timer = codes.length > 1 ? setInterval(show, QR_FRAME_MS) : null;
  // The phone drops the lock when the app goes to the background: asked again on coming back.
  const awake = async () => {
    if (document.hidden || gone) return;
    try { lock = await navigator.wakeLock.request("screen"); if (gone) lock.release().catch(() => {}); } catch { /* not offered: the screen may dim */ }
  };
  document.addEventListener("visibilitychange", awake);
  leaving = () => { gone = true; clearInterval(timer); document.removeEventListener("visibilitychange", awake); if (lock) lock.release().catch(() => {}); };
  awake();
}

// Films the codes of the other device until every one is received, then offers to replace the progress.
async function receiveQR() {
  render(renderReceive());
  const screen = drawn;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    return render(renderReceive({ error: e && e.name === "NotAllowedError"
      ? "L'accès à la caméra est refusé. Autorise-le dans les réglages de l'appareil, ou passe par une copie en fichier."
      : "Pas de caméra disponible sur cet appareil : passe par une copie en fichier." }));
  }
  if (drawn !== screen) { stream.getTracks().forEach(t => t.stop()); return; } // left while the camera opened
  let copy = null, timer = null, stopped = false;
  leaving = () => { stopped = true; clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); };
  const video = document.getElementById("scanVideo");
  video.srcObject = stream;
  video.play().catch(() => {});
  const $status = document.getElementById("scanStatus"), $dots = document.getElementById("scanDots");
  $status.textContent = "Vise l'écran de l'autre appareil.";
  // Android's own reader when there is one (faster); otherwise Envol's (qrscan.js).
  let detector = null;
  try { if ((await BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch { /* none */ }
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  // The phone may stop the camera (app sent to the background): say so rather than wait for nothing.
  stream.getVideoTracks().forEach(t => t.addEventListener("ended", () => {
    if (!stopped) render(renderReceive({ error: "La caméra s'est arrêtée. Relance la réception : les codes déjà lus sont à reprendre." }));
  }));
  const read = async () => {
    if (stopped) return;
    try { await readPicture(); } catch { /* an unreadable picture: the next one */ }
    if (stopped) return;
    if (complete(copy)) { leaving(); leaving = null; return finishReceive(copy); }
    timer = setTimeout(read, 60);
  };
  const readPicture = async () => {
    if (video.readyState >= 2 && video.videoWidth) {
      let texts = [];
      if (detector) { try { texts = (await detector.detect(video)).map(c => c.rawValue); } catch { /* next picture */ } }
      if (!texts.length) {
        // The square in the middle of the picture (what the frame on screen shows), at most 800 px.
        const side = Math.min(video.videoWidth, video.videoHeight), size = Math.min(side, 800);
        canvas.width = canvas.height = size;
        ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
        const rgba = ctx.getImageData(0, 0, size, size).data, gray = new Uint8ClampedArray(size * size);
        for (let i = 0; i < gray.length; i++) gray[i] = rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29 >> 8;
        const text = decodeImage(gray, size, size);
        if (text) texts = [text];
      }
      for (const text of texts) {
        const before = received(copy), next = collect(copy, text);
        if (next === copy || (received(next) === before && next.id === copy.id)) continue;
        copy = next;
        $status.textContent = `Codes reçus : ${received(copy)} sur ${copy.count}`;
        $dots.innerHTML = scanDots(copy.count, copy.parts);
      }
    }
  };
  read();
}

async function finishReceive(copy) {
  let save;
  try { save = await assemble(copy); } catch { return render(renderReceive({ error: "Les codes reçus sont abîmés. Recommence : rien n'a été modifié." })); }
  const error = validateSave(save);
  if (error) return showBackup({ error: `Import impossible : ${error}. Rien n'a été modifié.` });
  if (!await ask("Remplacer les progrès ?", "Les progrès de cet appareil seront remplacés par ceux de l'autre appareil.", "Remplacer", "Annuler")) return showBackup();
  replaceProgress(JSON.stringify(save), "C'est fait, les progrès de l'autre appareil sont là.");
}

function undoImport() {
  const data = store.undoImport();
  if (!data) return showBackup({ error: "Il n'y a plus d'import à annuler." });
  state.save = data;
  applyDisplay();
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

/* ---------- Updates ---------- */

// A new version installs by itself in the background (sw.js); the running page keeps the old one
// until it reloads. The bar offers that reload, so the user picks the moment (never mid-question).
let registration = null;
let lastUpdateCheck = 0;
const UPDATE_CHECK_EVERY = 30 * 60e3;

function watchForUpdates() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller; // false on the very first install
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) document.getElementById("update").hidden = false;
  });
  navigator.serviceWorker.register("sw.js").then(r => { registration = r; }).catch(() => {});
  // An installed app can stay open for days: look for a new version each time it comes back.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !registration || Date.now() - lastUpdateCheck < UPDATE_CHECK_EVERY) return;
    lastUpdateCheck = Date.now();
    registration.update().catch(() => {});
  });
}

async function checkUpdate() {
  if (!registration) return showSettings({ error: "Les mises à jour ne sont pas disponibles dans ce navigateur." });
  try {
    lastUpdateCheck = Date.now();
    await registration.update();
  } catch {
    return showSettings({ error: "Pas de connexion : impossible de chercher une mise à jour." });
  }
  if (registration.installing || registration.waiting) return showSettings({ message: "Nouvelle version trouvée : elle se télécharge, un bandeau proposera de mettre à jour." });
  showSettings({ message: `Envol est à jour (version ${APP_VERSION}).` });
}

document.getElementById("update").addEventListener("click", e => {
  const button = e.target.closest("[data-update]");
  if (!button) return;
  if (button.dataset.update === "reload") location.reload();
  else document.getElementById("update").hidden = true; // "Plus tard": the next launch runs the new version anyway
});

/* ---------- Actions ---------- */

const actions = {
  review: () => startSession("review"),
  resume: resumeSession,
  express: () => startSession("review", null, { express: true }),
  deckSeen: () => { keepDeck(); state.deckNews = { added: 0, changed: 0 }; showHome(); },
  themeReview: button => startSession("review", null, { theme: button.dataset.theme }),
  missedReview: () => startSession("review", null, { missed: true }),
  help: showHelp,
  course: showCourse,
  largeText: () => { state.save.display = { ...state.save.display, largeText: !state.save.display.largeText }; persist(); applyDisplay(); showSettings(); },
  theme: button => { state.save.display = { ...state.save.display, theme: button.dataset.theme }; persist(); applyDisplay(); showSettings(); },
  mistakes: () => startSession("mistakes"),
  flagMenu: () => { state.session.flagOpen = !state.session.flagOpen; showQuestion(); },
  flagReview: () => toggleFlag("review"),
  flagDispute: () => toggleFlag("dispute"),
  reveal: () => { state.session.revealed = true; showQuestion(); },
  selfGrade: button => validate(button.dataset.v === "1"),
  report,
  withdraw,
  exportReports,
  reliability: () => { state.session.reliabilityOpen = !state.session.reliabilityOpen; showQuestion(); },
  toggleTimed: () => { state.save.timedTests = !state.save.timedTests; persist(); showSettings(); },
  test: () => startSession("test"),
  focus: () => startSession("review", state.session && state.session.weak),
  home: showHome,
  summary: () => showSummary(),
  backup: () => showBackup(),
  settings: () => showSettings(),
  export: exportBackup,
  sendQR,
  receiveQR,
  import: () => document.getElementById("file").click(),
  undoImport,
  saveExam,
  clearExam,
  checkUpdate,
  guideDone: () => { store.markGuideSeen(); showHome(); },
  guide: () => showGuide(false),
  install,
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

// Computer keyboard, during a session: 1 to 9 pick the answers in the order shown (on a flashcard turned
// over, 1 "Je savais" and 2 "Pas encore"), Entrée presses the main button (Valider, Continuer…).
// Left alone while typing, with a key modifier or a window open, and when a focused control takes Entrée.
document.addEventListener("keydown", e => {
  const s = state.session;
  if (!s || s.finished || $ask.open || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest("input, textarea, select")) return;
  let button = null;
  if (/^[1-9]$/.test(e.key)) {
    button = s.revealed && !s.answered
      ? $app.querySelector(`[data-act="selfGrade"][data-v="${e.key === "1" ? 1 : 0}"]`)
      : $app.querySelectorAll(".choice")[Number(e.key) - 1];
    if (e.key > "2" && s.revealed) button = null;
  } else if (e.key === "Enter" && !e.target.closest("button, a, summary")) {
    button = $app.querySelector(".actions .btn");
  }
  if (!button || button.disabled) return;
  e.preventDefault();
  button.click();
});

$app.addEventListener("input", e => {
  if (e.target.id === "reportNote") saveReportNote(e.target.value);
  // Search in the course: only the list is redrawn, so the field keeps the focus and the keyboard.
  if (e.target.id === "courseSearch") document.getElementById("courseList").innerHTML = renderCourseList(course, e.target.value);
});

$app.addEventListener("change", e => {
  if (e.target.id !== "file" || !e.target.files[0]) return;
  importBackup(e.target.files[0]);
  e.target.value = ""; // the same file can be picked again
});

/* ---------- Installation ---------- */

const isInstalled = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

// Chrome and Edge (Android, computer) offer a one-tap install; iOS only has the manual steps.
let installPrompt = null;
let guideOnScreen = false;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  installPrompt = e;
  if (guideOnScreen) showGuide();
});

// root: the guide shown at first launch, in place of the home screen (back leaves the app from it).
let guideIsRoot = false;
function showGuide(root = guideIsRoot) {
  guideIsRoot = root;
  render(renderGuide({ platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints), canPrompt: !!installPrompt }), root);
  guideOnScreen = true;
}

async function install() {
  if (!installPrompt) return showGuide();
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  if (outcome === "accepted") { store.markGuideSeen(); showHome(); } else showGuide();
}

/* ---------- Startup ---------- */

(async function start() {
  const { data, recovered } = store.load();
  state.save = data;
  state.recovered = recovered;
  applyDisplay();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  watchForUpdates();
  await loadQuestions();
  if (!isInstalled() && !store.guideSeen()) showGuide(true);
  else showHome();
})();
