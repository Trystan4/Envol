import { esc, grade20, formatGrade, shortDate, plural } from "../util.js";
import { closeBar, gauge, stackedGauge, rightAnswer, sourceLine } from "./common.js";

const weekday = day => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };

const trendText = delta => delta === null ? ""
  : delta > 0 ? ` En hausse de ${formatGrade(delta)} point${delta > 1 ? "s" : ""} depuis le précédent.`
  : delta < 0 ? ` En baisse de ${formatGrade(-delta)} point${-delta > 1 ? "s" : ""} depuis le précédent.`
  : " Stable depuis le précédent.";

// "Mes résultats": overall progress, regularity, mastery by theme, mock tests, flagged questions.
export function renderSummary({ ov, themes, trend, tests, reviewsThisWeek, streak, days, disputed, message }) {
  const lastTests = tests.slice(-10).reverse();
  return `<main class="screen">
    ${closeBar()}
    <h1 class="title">Mes résultats</h1>
    <div class="figures">
      <div class="figure card"><b>${ov.pct} %</b><span>maîtrisé</span></div>
      <div class="figure card"><b>${ov.seen}/${ov.total}</b><span>questions vues</span></div>
      <div class="figure card"><b>${reviewsThisWeek}</b><span>${reviewsThisWeek > 1 ? "séances" : "séance"} en 7 j</span></div>
    </div>

    <h2 class="section">Régularité</h2>
    <div class="card">
      <p class="streak">${streak ? `${plural(streak, "jour")} d'affilée` : "Pas encore de série en cours"}</p>
      <div class="calendar" role="img" aria-label="${days.filter(d => d.active).length} jours actifs sur les ${days.length} derniers">
        ${days.map(d => `<span class="${d.active ? "on" : ""}${d.today ? " today" : ""}" title="${weekday(d.day)}"></span>`).join("")}
      </div>
      <p class="label" style="margin-top:8px">Les ${days.length} derniers jours, aujourd'hui en dernier</p>
    </div>

    <h2 class="section">Maîtrise par thème</h2>
    <div class="gauges card">${themes.map(t => stackedGauge(esc(t.theme), t.pct, `${t.pct} %`)).join("")}</div>

    <h2 class="section">Tests blancs</h2>
    ${trend.count
      ? `<p class="muted">${plural(trend.count, "test")}. Meilleure note : ${formatGrade(trend.best)} / 20, moyenne des ${Math.min(3, trend.count)} derniers : ${formatGrade(trend.average)} / 20.${trendText(trend.delta)}</p>
        <div class="gauges card" style="margin-top:12px">${lastTests.map(t => {
          const g = grade20(t.correct, t.total);
          return gauge(shortDate(t.at), g * 5, formatGrade(g));
        }).join("")}</div>`
      : `<p class="muted">Pas encore de test blanc. Il se lance depuis l'accueil, quand tu veux.</p>`}
    ${disputed.length ? `<h2 class="section">Questions signalées</h2>
      <div class="mistakes">${disputed.map(q => `<div class="mistake card"><b>${esc(q.question)}</b><span>✓ ${rightAnswer(q)}</span>${q.note ? `<span class="muted">Pourquoi : ${esc(q.note)}</span>` : ""}${q.page ? `<small class="source">${sourceLine(q)}</small>` : ""}<small class="muted">${q.setAside ? "Écartée des séances jusqu'à correction de la fiche." : "La fiche a changé depuis ton signalement : la question revient dans les séances."}</small><button class="small-link" data-act="withdraw" data-id="${esc(q.id)}">Retirer le signalement</button></div>`).join("")}</div>
      <button class="link" data-act="exportReports" style="align-self:center;margin-top:8px">Envoyer mes signalements</button>` : ""}
    ${message ? `<p class="success" role="status">${esc(message)}</p>` : ""}
    <div class="actions"><button class="btn" data-act="test">Faire un test blanc</button></div>
  </main>`;
}
