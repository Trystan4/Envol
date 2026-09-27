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

test("détection de l'appareil pour le guide d'installation", async () => {
  const { detectPlatform } = await import("../../src/js/screens/guide.js");
  assert.equal(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"), "ios");
  assert.equal(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 5), "ios"); // iPad
  assert.equal(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 0), "desktop");
  assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"), "android");
  assert.equal(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36"), "desktop");
});
