import { esc, plural } from "../util.js";
import { brand } from "./common.js";

const countdown = days => days === null ? "" : days > 0 ? `J-${days}` : days === 0 ? "Jour J" : "Examen passé";

// ov: summary.overview(); days: days until the exam or null; notices: messages to show on top;
// mistakes: size of the "Mes erreurs" pool; backupDays: days since the last copy when a reminder is due.
export function renderHome({ ov, days, firstTime, notices, mistakes, backupDays }) {
  const sub = firstTime ? `${plural(ov.total, "question")} à découvrir. On commence en douceur.`
    : ov.toDoToday ? `${plural(ov.toDoToday, "question")} à revoir aujourd'hui${ov.sessionsToday > 1 ? `, en ${ov.sessionsToday} séances` : ""}.`
    : "Tout est à jour. Un petit tour pour garder le rythme ?";
  const C = 2 * Math.PI * 76, arc = C * ov.pct / 100;
  const cd = countdown(days);
  const caption = cd ? `maîtrisé, ${cd}` : "maîtrisé";
  return `<main class="screen">
    ${brand()}
    ${notices.map(n => `<p class="notice" role="status">${esc(n)}</p>`).join("")}
    ${backupDays !== null ? `<div class="reminder card" role="status"><p>${backupDays === Infinity ? "Aucune copie de sauvegarde pour l'instant." : `Dernière copie de sauvegarde il y a ${plural(backupDays, "jour")}.`} Supprimer l'app effacerait les progrès.</p><button class="link" data-act="backup">Faire une copie</button></div>` : ""}
    <h1 class="display">On décolle ?</h1>
    <p class="muted">${esc(sub)}</p>
    <div class="ring" role="img" aria-label="${ov.pct} % du programme maîtrisé${cd ? `, ${cd}` : ""}">
      <svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="76" fill="none" stroke="var(--line)" stroke-width="14"/>
      <circle cx="90" cy="90" r="76" fill="none" stroke="var(--cabine)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${arc} ${C}" transform="rotate(-90 90 90)" ${ov.pct ? "" : 'opacity="0"'}/>
      <text x="90" y="95" text-anchor="middle" fill="var(--ink)" style="font:700 40px var(--font)">${ov.pct} %</text>
      <text x="90" y="121" text-anchor="middle" fill="var(--ink-muted)" style="font:600 14px var(--font)">${caption}</text></svg>
    </div>
    <div class="actions">
      <button class="btn" data-act="review">Réviser</button>
      <button class="link" data-act="test">Faire un test blanc</button>
      ${mistakes ? `<button class="link" data-act="mistakes">Revoir mes erreurs (${mistakes})</button>` : ""}
    </div>
    <nav class="foot">
      <button class="small-link" data-act="summary">Mes résultats</button>
      <button class="small-link" data-act="backup">Sauvegarde</button>
      <button class="small-link" data-act="settings">Réglages</button>
    </nav>
  </main>`;
}
