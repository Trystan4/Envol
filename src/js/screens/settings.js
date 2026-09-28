import { esc, plural } from "../util.js";
import { closeBar } from "./common.js";

// examDate: "YYYY-MM-DD" or null; today: "YYYY-MM-DD"; timed: mock tests are timed; minutes: their duration.
// version, fingerprint (of the fiches) and count: tell exactly which release and which fiches the phone runs.
// plan: engine.dailyPlan(), the pace of new questions the exam date asks for.
// display: { largeText, theme } kept in the save (see storage.js).
export function renderSettings({ examDate, today, timed, minutes, installed, version, fingerprint, count, plan, display, message, error }) {
  const themeButton = (value, label) => `<button class="segment" data-act="theme" data-theme="${value}" aria-pressed="${display.theme === value}">${label}</button>`;
  return `<main class="screen">
    ${closeBar()}
    <h1 class="title">Réglages</h1>
    <p class="muted">Avec une date d'examen, Envol règle le rythme des nouvelles questions pour que tout soit vu trois jours avant. Sans date, la révision suit son cours, à ton rythme.</p>
    <label class="field">
      <span class="label">Date de l'examen</span>
      <input type="date" id="exam" value="${esc(examDate || "")}" min="${today}">
    </label>
    ${examDate && plan ? `<p class="muted plan">Rythme conseillé : environ ${plural(plan.perDay, "nouvelle question", "nouvelles questions")} par jour${plan.sessions > 1 ? `, soit ${plan.sessions} séances de révision par jour` : ""}.</p>` : ""}
    ${message ? `<p class="success" role="status">${esc(message)}</p>` : ""}
    ${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ""}
    <div class="setting card">
      <div><b>Test blanc chronométré</b><p class="muted">${minutes} minutes pour 20 questions, comme en examen. Les questions sans réponse comptent fausses.</p></div>
      <button class="switch" role="switch" aria-checked="${timed}" data-act="toggleTimed" aria-label="Test blanc chronométré"><span></span></button>
    </div>
    <div class="setting card">
      <div><b>Texte agrandi</b><p class="muted">Tout l'écran un peu plus grand, pour lire plus facilement.</p></div>
      <button class="switch" role="switch" aria-checked="${display.largeText}" data-act="largeText" aria-label="Texte agrandi"><span></span></button>
    </div>
    <div class="card display-theme">
      <b>Apparence</b>
      <div class="segments" role="group" aria-label="Apparence">${themeButton("auto", "Automatique")}${themeButton("light", "Clair")}${themeButton("dark", "Sombre")}</div>
    </div>
    <div class="actions">
      <button class="btn" data-act="saveExam">Enregistrer la date</button>
      ${examDate ? `<button class="link" data-act="clearExam">Retirer la date</button>` : ""}
      <button class="small-link" data-act="help">Comment marche Envol</button>
      ${installed ? "" : `<button class="small-link" data-act="guide">Installer Envol sur cet appareil</button>`}
    </div>
    <p class="version muted">Version ${esc(version)} · fiches ${esc(fingerprint)} · ${plural(count, "question")}</p>
    <p class="license muted">© 2026 Trystan4 · code sous licence AGPL-3.0. Le contenu des fiches reste la propriété de ses auteurs.</p>
    <button class="small-link" data-act="checkUpdate" style="align-self:center">Rechercher une mise à jour</button>
  </main>`;
}
