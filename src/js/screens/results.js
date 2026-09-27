import { esc, grade20, formatGrade, plural } from "../util.js";
import { brand, rightAnswer, excerptHtml } from "./common.js";

// End of a session. s: the finished session; strong / weak: theme names (summary.strengths).
export function renderResults({ s, strong, weak }) {
  const test = s.mode === "test";
  const rate = s.total ? s.correct / s.total : 0;
  const heading = rate >= 0.8 ? "Beau travail, le cap est tenu." : rate >= 0.6 ? "C'est en bonne voie." : "Chaque essai compte, on continue.";
  const score = test
    ? `<p class="score">${formatGrade(grade20(s.correct, s.total))} / 20</p>`
    : `<p class="muted">${plural(s.correct, "bonne réponse", "bonnes réponses")} du premier coup sur ${s.total}.</p>`;
  const mistakes = test && s.mistakes.length
    ? `<div class="block"><h3>Les réponses à retenir</h3></div><div class="mistakes">${s.mistakes.map(q =>
      `<div class="mistake card"><b>${esc(q.question)}</b><span>✓ ${rightAnswer(q)}</span>${q.excerpt ? `<details><summary>Voir l'extrait de la fiche</summary>${excerptHtml(q)}</details>` : ""}</div>`).join("")}</div>`
    : "";
  return `<main class="screen">
    ${brand()}
    <h1 class="title">${heading}</h1>
    ${score}
    ${s.unanswered ? `<p class="warning">Temps écoulé : ${plural(s.unanswered, "question")} sans réponse, ${s.unanswered > 1 ? "comptées fausses" : "comptée fausse"}.</p>` : ""}
    <div class="card block">
      ${strong.length ? `<div class="strong"><h3>✓ Points forts</h3><p>${strong.map(esc).join(", ")}</p></div>` : ""}
      ${weak.length
        ? `<div class="weak" style="margin-top:${strong.length ? 14 : 0}px"><h3>↻ À renforcer</h3><p>${weak.map(esc).join(", ")}</p></div>`
        : `<div class="weak" style="margin-top:${strong.length ? 14 : 0}px"><p class="muted">Rien à renforcer sur cette séance.</p></div>`}
    </div>
    ${mistakes}
    <div class="actions">
      ${weak.length
        ? `<button class="btn" data-act="focus">On s'y met</button><button class="link" data-act="home">Retour à l'accueil</button>`
        : `<button class="btn" data-act="home">Retour à l'accueil</button>`}
    </div>
  </main>`;
}
