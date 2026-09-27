// Pieces shared by several screens.

import { esc } from "../util.js";

// The expected answer of any kind of question, escaped for display.
export const rightAnswer = q => esc(q.kind === "card" ? q.answer : q.answers.filter(a => a.correct).map(a => a.text).join(", "));

// Where the question comes from, so it can be found again in the course: "Thème · Document, page 4".
export const sourceLine = q => esc([q.theme, q.page ? `${q.document || "Fiche"}, page ${q.page}` : ""].filter(Boolean).join(" · "));

// The passage of the course that explains the answer: text, table (scrolls sideways on its own,
// never squeezed) and/or image, followed by its source.
export function excerptHtml(q) {
  const x = q.excerpt;
  if (!x) return "";
  const t = x.table;
  const table = t
    ? `<div class="excerpt-table" role="region" aria-label="Tableau de la fiche" tabindex="0"><table>${t.caption ? `<caption>${esc(t.caption)}</caption>` : ""}<thead><tr>${t.head.map(h => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : "";
  const image = x.image ? `<img src="${esc(x.image.src)}" alt="${esc(x.image.alt)}" loading="lazy" decoding="async">` : "";
  return `<figure class="excerpt"><p class="label">Extrait de la fiche</p>${x.text ? `<p class="excerpt-text">${esc(x.text)}</p>` : ""}${table}${image}<figcaption>${sourceLine(q)}</figcaption></figure>`;
}

export const LOGO = `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" aria-hidden="true"><defs><mask id="lg" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M8 50 Q34 47 53 13" stroke="#000" stroke-width="10" stroke-linecap="round"/></mask></defs><g mask="url(#lg)"><path d="M13 50 A19 19 0 0 1 51 50 Z" fill="var(--soleil)"/><path d="M6 50 H58" stroke="var(--cabine)" stroke-width="3.5" stroke-linecap="round"/></g><path d="M8 50 Q34 47 51.2 16" stroke="var(--cabine)" stroke-width="4" stroke-linecap="round"/><circle cx="53" cy="13" r="4.5" fill="var(--cabine)"/></svg>`;

export const brand = () => `<div class="brand">${LOGO}Envol</div>`;

export const closeBar = (action = "home", label = "Retour") =>
  `<div class="top"><button class="close" data-act="${action}" aria-label="${label}">✕</button></div>`;

// One gauge row: label, bar filled to `pct` %, value.
// Stacked variant for long labels: label and value on one line, full-width bar below.
export const stackedGauge = (name, pct, value) =>
  `<div class="gauge stacked"><span class="name">${name}</span><span class="n">${value}</span><span class="g" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span></div>`;

export const gauge = (name, pct, value) =>
  `<div class="gauge"><span class="name">${name}</span><span class="g" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="n">${value}</span></div>`;
