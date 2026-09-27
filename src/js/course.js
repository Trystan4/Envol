// "Cours": the passages of the course attached to the questions (excerpts), theme by theme, to read
// and search without leaving the app. Pure.

// Lower case, without accents, spaces collapsed: "Équipage" and "equipage" match.
const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Every searchable word of a passage: text, table (caption, titles, cells) and image description.
const passageText = x => [x.text, x.table && x.table.caption, ...(x.table ? [x.table.head, ...x.table.rows].flat() : []),
  x.image && x.image.alt].filter(Boolean).join(" ");

// Themes in the order of the fiches; in each, the distinct passages sorted by page. A passage shared
// by several questions appears once.
export function buildCourse(questions) {
  const themes = new Map();
  for (const q of questions) {
    if (!q.excerpt) continue;
    const t = themes.get(q.theme) || themes.set(q.theme, { theme: q.theme, passages: [], seen: new Set() }).get(q.theme);
    const key = JSON.stringify(q.excerpt);
    if (t.seen.has(key)) continue;
    t.seen.add(key);
    t.passages.push({ theme: q.theme, page: q.page, document: q.document, excerpt: q.excerpt, words: fold(passageText(q.excerpt)) });
  }
  return [...themes.values()].map(({ theme, passages }) => ({ theme, passages: passages.sort((a, b) => a.page - b.page) }));
}

// The passages containing the searched words (all of them, in any order), across every theme.
export function searchCourse(course, query) {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  return course.flatMap(t => t.passages).filter(p => words.every(w => p.words.includes(w)));
}
