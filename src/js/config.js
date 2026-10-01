// Engine settings: every number worth tuning lives here, and nowhere else.

// Shown in Réglages to check that the phone runs the latest published version.
// Keep equal to "version" in package.json and VERSION in sw.js (a test checks it).
export const APP_VERSION = "2.8.0";

export const DAY = 864e5;

export const REPORT_NOTE_MAX = 500; // characters in the reason given with a reported question

// Address that receives reported questions by e-mail. Empty: no e-mail button, the file alone is offered.
export const REPORT_EMAIL = "";

// Spaced repetition: days before a question comes back, by level (0 to 5).
export const INTERVALS = [0, 1, 2, 4, 7, 15];
export const MASTERED_LEVEL = 3; // a question at this level or above counts as "maîtrisée"

export const SESSION_SIZE = 20; // questions per review session
export const EXPRESS_SIZE = 5; // questions per express session (a short moment)
export const TEST_SIZE = 20; // questions per mock test

// Pace of new questions.
export const NEW_PER_SESSION_MAX = 15;
export const NEW_PER_DAY_DEFAULT = 10; // without an exam date
export const NEW_PER_DAY_MIN = 3; // with an exam date
export const EXAM_MARGIN_DAYS = 3; // everything should be discovered this many days before the exam

// A missed question does not come back in the same session: it comes back in the next ones, drawn
// more often for a while (recentMistake), longer after a mistake in a mock test (exam conditions).
export const MISTAKE_BOOST_DAYS = { review: 1, test: 3 };

// Draw weights: the higher the weight, the more likely a question is drawn.
export const WEIGHTS = {
  unseen: 1, // never answered: neutral
  byLevel: [1, 0.8, 0.6, 0.4, 0.25, 0.15], // well-known questions come back less often
  errorBoost: 3, // weight × (1 + errorBoost × error rate)
  notDue: 0.3, // not due yet: still possible, just less likely
  overdueCapDays: 7, // overdue boost grows up to ×2 over this many days
  recentMistake: 2, // missed recently (see MISTAKE_BOOST_DAYS)
  focusTheme: 3, // themes targeted by "On s'y met"
  min: 0.05, // nothing is ever impossible
  testExponent: 0.5, // mock tests lean towards weak points, but more gently than reviews
  flagged: 3, // questions the user marked "à revoir"
};

export const REVIEWS_KEPT = 365; // review sessions kept for the summary
export const ACTIVITY_DAYS_KEPT = 400; // days with activity kept for the streak and calendar
export const CALENDAR_DAYS = 28; // days shown in the activity calendar
export const CURVE_DAYS = 56; // days shown in the mastery curve (Mes résultats)
export const CURVE_TESTS = 10; // mock tests shown in the grades curve (Mes résultats)

// "Mes erreurs": questions missed within this many days and not mastered since, plus flagged ones.
export const MISTAKES_WINDOW_DAYS = 14;

export const TEST_DURATION_MIN = 20; // timed mock test: minutes for the whole test
export const TIMER_WARNING_SEC = 120; // the timer turns orange below this

export const BACKUP_REMINDER_DAYS = 7; // suggest a backup copy after this many days without one

// Copy to another device by QR codes (transfer.js): a progress that fits in one code of
// QR_SINGLE_MAX_VERSION (117 × 117 modules, about 1,000 characters) is shown in that single code, which stays
// on screen (the camera has all the time it needs). A larger one goes in codes shown in turn, at or under
// QR_MAX_VERSION (77 × 77 modules, about 400 characters), small enough to be read in passing, at an angle.
export const QR_SINGLE_MAX_VERSION = 25;
export const QR_MAX_VERSION = 15;
export const QR_FRAME_MS = 300; // each code stays this long on screen
