import { esc } from "../util.js";

export const formatClock = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function choicesHtml(q, s) {
  return s.order.map(k => {
    const a = q.answers[k], picked = s.selected.has(k);
    let cls = "choice", mark = "", state = "";
    if (s.answered) {
      if (a.correct) { cls += " right"; mark = "✓"; state = picked ? "Bonne réponse" : "La bonne réponse"; }
      else if (picked) { cls += " wrong"; mark = "✗"; state = "Pas encore"; }
      else cls += " dim";
    } else if (picked) cls += " selected";
    return `<button class="${cls}" data-act="choose" data-k="${k}" ${s.answered ? "disabled" : ""} aria-pressed="${picked}"><span class="mark">${mark}</span><span class="text">${esc(a.text)}</span>${state ? `<span class="state">${state}</span>` : ""}</button>`;
  }).join("");
}

// Flag panel: the user marks the question "à revoir" or doubts its answer.
function flagPanel(flag) {
  const chip = (act, on, label) => `<button class="chip" data-act="${act}" aria-pressed="${on}">${on ? "✓ " : ""}${label}</button>`;
  return `<div class="flags" role="group" aria-label="Marquer cette question">
    ${chip("flagReview", flag.review, "À revoir")}
    ${chip("flagDispute", flag.dispute, "Réponse douteuse")}
  </div>`;
}

// s: the running session (see app.js). flag: { review, dispute } for the current question.
export function renderQuestion(s, flag, now) {
  const q = s.queue[s.index];
  const test = s.mode === "test";
  const card = q.kind === "card";
  const done = s.answered;
  // Position among the session's own questions; second tries of missed questions are not counted.
  const position = s.queue.slice(0, s.index + 1).filter(x => !x.retry).length;
  const counter = q.retry ? "Nouvel essai" : `${test ? "Test blanc, question" : "Question"} ${position} sur ${s.size}`;
  const flagged = flag.review || flag.dispute;
  const timer = s.deadline
    ? `<span class="timer${s.deadline - now <= s.warnMs ? " low" : ""}" id="timer" role="timer" aria-label="Temps restant">${formatClock(s.deadline - now)}</span>`
    : "";

  let body;
  if (card) {
    body = `<p class="hint">Carte mémoire : cherche la réponse, puis retourne la carte.</p>
      ${s.revealed ? `<div class="verso card" role="status"><span class="label">Réponse</span><p>${esc(q.answer)}</p></div>` : ""}`;
  } else {
    body = `${q.multi ? `<p class="hint">Plusieurs bonnes réponses</p>` : ""}<div class="choices">${choicesHtml(q, s)}</div>`;
  }

  let feedback = "";
  if (done) {
    const again = s.requeued ? "cette question reviendra un peu plus loin." : "elle reviendra lors d'une prochaine séance.";
    feedback = s.lastCorrect ? `<p class="success" role="status">Bien joué.</p>` : `<p class="warning" role="status">Pas encore : ${again}</p>`;
    if (q.explanation) feedback += `<p class="explanation">${esc(q.explanation)}</p>`;
  }

  let main = "";
  if (done) main = `<button class="btn" data-act="next">Continuer</button>`;
  else if (card && !s.revealed) main = `<button class="btn" data-act="reveal">Voir la réponse</button>`;
  else if (card) main = `<button class="btn" data-act="selfGrade" data-v="1">Je savais</button><button class="link" data-act="selfGrade" data-v="0">Pas encore</button>`;
  else if (test || q.multi) {
    const label = test ? (s.index + 1 < s.queue.length ? "Question suivante" : "Terminer le test") : "Valider";
    main = `<button class="btn" data-act="validate" ${s.selected.size ? "" : "disabled"}>${label}</button>`;
  }

  return `<main class="screen">
    <div class="top"><button class="close" data-act="quit" aria-label="Quitter">✕</button>
      <div class="bar" aria-hidden="true"><i style="width:${Math.round(s.index / s.queue.length * 100)}%"></i></div>
      ${timer}
      <button class="close flag${flagged ? " on" : ""}" data-act="flagMenu" aria-label="Marquer cette question" aria-expanded="${s.flagOpen}">⚑</button></div>
    ${s.flagOpen ? flagPanel(flag) : ""}
    <div class="meta"><p class="label">${counter}</p><p class="label">${esc(q.theme)}</p></div>
    <h2 class="question">${esc(q.question)}</h2>
    ${body}
    ${feedback}
    <div class="actions">${main}</div>
  </main>`;
}
