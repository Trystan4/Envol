import { esc, plural } from "../util.js";
import { closeBar, excerptHtml } from "./common.js";
import { searchCourse } from "../course.js";

// The list under the search field: every theme (folded) without a search, the matching passages with one.
export function renderCourseList(course, query) {
  if (query.trim()) {
    const found = searchCourse(course, query);
    return `<p class="muted" role="status">${found.length ? plural(found.length, "passage trouvé", "passages trouvés") : "Aucun passage ne contient ces mots."}</p>
      ${found.map(p => excerptHtml(p, "")).join("")}`;
  }
  return course.map(t => `<details class="course-theme card">
      <summary><b>${esc(t.theme)}</b><span class="muted">${plural(t.passages.length, "passage")}</span></summary>
      ${t.passages.map(p => excerptHtml(p, "")).join("")}
      <button class="link" data-act="themeReview" data-theme="${esc(t.theme)}">Réviser ce thème</button>
    </details>`).join("");
}

// "Cours": read the course passages theme by theme, or search them, without leaving the app.
export function renderCourse(course, query = "") {
  return `<main class="screen wide">
    ${closeBar()}
    <h1 class="title">Cours</h1>
    <p class="muted">Les passages du cours, thème par thème. Tape un mot pour chercher dans tous les thèmes.</p>
    <label class="field"><span class="label">Chercher</span>
      <input type="search" id="courseSearch" value="${esc(query)}" placeholder="Ex. : cumulus, PAX, 1852" autocomplete="off"></label>
    <div id="courseList" class="course-list">${renderCourseList(course, query)}</div>
  </main>`;
}
