import { test } from "node:test";
import assert from "node:assert/strict";
import { plural, esc, grade20, formatGrade, daysUntil, isoDate } from "../../src/js/util.js";
import { NOW, DAY } from "./helpers.js";

test("pluriel : mots simples et composés", () => {
  assert.equal(plural(1, "question"), "1 question");
  assert.equal(plural(0, "question"), "0 question");
  assert.equal(plural(3, "question"), "3 questions");
  assert.equal(plural(12, "bonne réponse", "bonnes réponses"), "12 bonnes réponses");
});

test("échappement HTML et espaces insécables avant la ponctuation", () => {
  assert.equal(esc('<b>"x"</b>'), "&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
  assert.equal(esc("Prêts ?"), "Prêts ?");
});

test("note sur 20 arrondie au demi-point", () => {
  assert.equal(grade20(15, 20), 15);
  assert.equal(formatGrade(grade20(13, 19)), "13,5");
  assert.equal(grade20(0, 0), 0);
});

test("compte à rebours de l'examen", () => {
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil(isoDate(NOW), NOW), 0);
  assert.equal(daysUntil(isoDate(NOW + 10 * DAY), NOW), 10);
  assert.equal(daysUntil(isoDate(NOW - DAY), NOW), -1);
});
