import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCourse, searchCourse } from "../../src/js/course.js";

const q = (id, theme, page, excerpt) => ({ id, theme, page, document: "Cours", question: `${id} ?`, excerpt });
const questions = [
  q("a1", "Nuages", 4, { text: "Le cumulus : forme isolée." }),
  q("a2", "Nuages", 3, { text: "Un nuage est un ensemble visible." }),
  q("a3", "Nuages", 4, { text: "Le cumulus : forme isolée." }), // même passage : une seule fois
  q("b1", "Équipage", 2, { table: { head: ["Sigle", "Sens"], rows: [["ONU", "Organisation des Nations unies"]] } }),
  q("b2", "Équipage", 2, { image: { src: "img/x.webp", alt: "Schéma de l'équipage" } }),
  { id: "c1", theme: "Nuages", question: "sans extrait ?" },
];

test("cours : les passages de chaque thème, sans doublon, dans l'ordre des pages", () => {
  const course = buildCourse(questions);
  assert.deepEqual(course.map(t => t.theme), ["Nuages", "Équipage"]);
  assert.deepEqual(course[0].passages.map(p => [p.page, p.excerpt.text]), [[3, "Un nuage est un ensemble visible."], [4, "Le cumulus : forme isolée."]]);
  assert.equal(course[1].passages.length, 2);
});

test("cours : la recherche ignore accents et majuscules, et fouille textes, tableaux et légendes", () => {
  const course = buildCourse(questions);
  assert.deepEqual(searchCourse(course, "CUMULUS").map(p => p.theme), ["Nuages"]);
  assert.deepEqual(searchCourse(course, "nations").map(p => p.theme), ["Équipage"]);
  assert.deepEqual(searchCourse(course, "equipage").map(p => p.excerpt.image && p.excerpt.image.alt), ["Schéma de l'équipage"]);
  assert.deepEqual(searchCourse(course, " "), []);
  assert.deepEqual(searchCourse(course, "zzz"), []);
});
