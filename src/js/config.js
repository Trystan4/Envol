// Engine settings: every number worth tuning lives here, and nowhere else.

// Shown in Réglages to check that the phone runs the latest published version.
// Keep equal to "version" in package.json and VERSION in sw.js (a test checks it).
export const APP_VERSION = "2.2.0";

export const DAY = 864e5;

export const REPORT_NOTE_MAX = 500; // characters in the reason given with a reported question

// Spaced repetition: days before a question comes back, by level (0 to 5).
export const INTERVALS = [0, 1, 2, 4, 7, 15];
export const MASTERED_LEVEL = 3; // a question at this level or above counts as "maîtrisée"

export const SESSION_SIZE = 20; // questions per review session
export const TEST_SIZE = 20; // questions per mock test

// Pace of new questions.
export const NEW_PER_SESSION_MAX = 15;
export const NEW_PER_DAY_DEFAULT = 10; // without an exam date
export const NEW_PER_DAY_MIN = 3; // with an exam date
export const EXAM_MARGIN_DAYS = 3; // everything should be discovered this many days before the exam

// A missed question comes back later in the same session, at most RETRY_LIMIT times.
export const RETRY_LIMIT = 2;
export const RETRY_GAP = 4;

// Draw weights: the higher the weight, the more likely a question is drawn.
export const WEIGHTS = {
  unseen: 1, // never answered: neutral
  byLevel: [1, 0.8, 0.6, 0.4, 0.25, 0.15], // well-known questions come back less often
  errorBoost: 3, // weight × (1 + errorBoost × error rate)
  notDue: 0.3, // not due yet: still possible, just less likely
  overdueCapDays: 7, // overdue boost grows up to ×2 over this many days
  recentMistake: 2, // missed in the last 24 h
  focusTheme: 3, // themes targeted by "On s'y met"
  min: 0.05, // nothing is ever impossible
  testExponent: 0.5, // mock tests lean towards weak points, but more gently than reviews
  flagged: 3, // questions the user marked "à revoir"
};

export const REVIEWS_KEPT = 365; // review sessions kept for the summary
export const ACTIVITY_DAYS_KEPT = 400; // days with activity kept for the streak and calendar
export const CALENDAR_DAYS = 28; // days shown in the activity calendar

// "Mes erreurs": questions missed within this many days and not mastered since, plus flagged ones.
export const MISTAKES_WINDOW_DAYS = 14;

export const TEST_DURATION_MIN = 20; // timed mock test: minutes for the whole test
export const TIMER_WARNING_SEC = 120; // the timer turns orange below this

export const BACKUP_REMINDER_DAYS = 7; // suggest a backup copy after this many days without one
