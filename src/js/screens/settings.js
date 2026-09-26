import { esc } from "../util.js";
import { closeBar } from "./common.js";

// examDate: "YYYY-MM-DD" or null; today: "YYYY-MM-DD"; timed: mock tests are timed; minutes: their duration.
export function renderSettings({ examDate, today, timed, minutes, message, error }) {
  return `<main class="screen">
    ${closeBar()}
    <h1 class="title">Réglages</h1>
    <p class="muted">Avec une date d'examen, Envol règle le rythme des nouvelles questions pour que tout soit vu trois jours avant. Sans date, la révision suit son cours, à ton rythme.</p>
    <label class="field">
      <span class="label">Date de l'examen</span>
      <input type="date" id="exam" value="${esc(examDate || "")}" min="${today}">
    </label>
    ${message ? `<p class="success" role="status">${esc(message)}</p>` : ""}
    ${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ""}
    <div class="setting card">
      <div><b>Test blanc chronométré</b><p class="muted">${minutes} minutes pour 20 questions, comme en examen. Les questions sans réponse comptent fausses.</p></div>
      <button class="switch" role="switch" aria-checked="${timed}" data-act="toggleTimed" aria-label="Test blanc chronométré"><span></span></button>
    </div>
    <div class="actions">
      <button class="btn" data-act="saveExam">Enregistrer la date</button>
      ${examDate ? `<button class="link" data-act="clearExam">Retirer la date</button>` : ""}
    </div>
  </main>`;
}
