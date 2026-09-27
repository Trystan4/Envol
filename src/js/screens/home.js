import { esc, plural } from "../util.js";
import { brand } from "./common.js";

const countdown = days => days === null ? "" : days > 0 ? `J-${days}` : days === 0 ? "Jour J" : "Examen passé";

// Today's answers against today's goal (summary.dayProgress), as a thin bar under the subtitle.
function dayBar({ done, goal }) {
  if (!goal) return "";
  const pct = Math.min(100, Math.round(done / goal * 100));
  const text = done >= goal ? "Objectif du jour atteint" : `Aujourd'hui : ${done} / ${goal}`;
  return `<div class="day-bar" role="img" aria-label="${text}"><span class="g" aria-hidden="true"><i style="width:${pct}%"></i></span><span class="n">${text}</span></div>`;
}

// ov: summary.overview(); progress: summary.dayProgress(); resume: { position, size, label } of a session
// left unfinished, or null; days: days until the exam or null; notices: messages to show on top;
// mistakes: size of the "Mes erreurs" pool; backupDays: days since the last copy when a reminder is due.
export function renderHome({ ov, progress, resume, days, firstTime, notices, mistakes, backupDays }) {
  const sub = firstTime ? `${plural(ov.total, "question")} à découvrir. On commence en douceur.`
    : ov.toDoToday ? `${plural(ov.toDoToday, "question")} à revoir aujourd'hui${ov.sessionsToday > 1 ? `, en ${ov.sessionsToday} séances` : ""}.`
    : "Tout est à jour. Un petit tour pour garder le rythme ?";
  const C = 2 * Math.PI * 76, arc = C * ov.pct / 100;
  const cd = countdown(days);
  const caption = cd ? `maîtrisé, ${cd}` : "maîtrisé";
  return `<main class="screen">
    ${brand()}
    ${notices.map(n => `<p class="notice" role="status">${esc(n)}</p>`).join("")}
    ${resume ? `<div class="reminder card" role="status"><p>Séance en cours : ${resume.position}/${resume.size}</p><button class="link" data-act="resume">Reprendre</button></div>` : ""}
    ${backupDays !== null ? `<div class="reminder card" role="status"><p>${backupDays === Infinity ? "Pas encore de copie" : `Copie il y a ${plural(backupDays, "jour")}`}</p><button class="link" data-act="backup">Faire une copie</button></div>` : ""}
    <h1 class="display">On décolle ?</h1>
    <p class="muted">${esc(sub)}</p>
    ${firstTime ? "" : dayBar(progress)}
    <div class="ring" role="img" aria-label="${ov.pct} % du programme maîtrisé${cd ? `, ${cd}` : ""}">
      <svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="76" fill="none" stroke="var(--line)" stroke-width="14"/>
      <circle cx="90" cy="90" r="76" fill="none" stroke="var(--cabine)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${arc} ${C}" transform="rotate(-90 90 90)" ${ov.pct ? "" : 'opacity="0"'}/>
      <text x="90" y="95" text-anchor="middle" fill="var(--ink)" style="font:700 40px var(--font)">${ov.pct} %</text>
      <text class="in-ring" x="90" y="121" text-anchor="middle" fill="var(--ink-muted)" style="font:600 14px var(--font)">${caption}</text></svg>
      <span class="ring-side" aria-hidden="true">${caption}</span>
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
