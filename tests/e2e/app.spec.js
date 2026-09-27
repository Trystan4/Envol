// Full journeys in a real browser, on the real published files (src/).

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { allocateByTheme } from "../../src/js/engine.js";

const KEY = "envol-v2";
const DAY = 864e5;

// Right answers of the real deck, by question text.
const deckDir = new URL("../../src/fiches/", import.meta.url);
const clean = s => s.replace(/ /g, " ").trim();
const RIGHT = new Map();
const PLAYABLE = []; // questions shown by the app (not set aside with "a_verifier")
for (const t of JSON.parse(readFileSync(new URL("index.json", deckDir), "utf8")).themes) {
  for (const q of JSON.parse(readFileSync(new URL(t.file, deckDir), "utf8")).questions) {
    if (q.a_verifier) continue;
    PLAYABLE.push({ ...q, theme: t.title });
    if (q.type === "card") continue; // flashcards are self-graded, see answer()
    RIGHT.set(clean(q.question), new Set(q.answers.filter(a => a.correct).map(a => clean(a.text))));
  }
}
const THEMES = new Set(PLAYABLE.map(q => q.theme)).size;
const TEST_THEMES = allocateByTheme(PLAYABLE, 20).filter(g => g.count > 0).length;

let jsErrors;
test.beforeEach(async ({ page }) => {
  jsErrors = [];
  page.on("pageerror", e => jsErrors.push(e.message));
  // Install guide already seen, and a deterministic export path (no share sheet).
  await page.addInitScript(() => {
    localStorage.setItem("envol-v2-guide-seen", "1");
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
});
test.afterEach(() => expect(jsErrors, "erreurs JavaScript").toEqual([]));

// Clicks the choice whose text is exactly `text` (by position: several answers can contain
// one another, e.g. "Type I" and "Type III", so a text filter could click the wrong one).
async function clickChoice(page, text) {
  const texts = (await page.locator(".choice .text").allInnerTexts()).map(clean);
  const k = texts.indexOf(text);
  expect(k, `choix introuvable : ${text}`).toBeGreaterThanOrEqual(0);
  await page.locator(".choice").nth(k).click();
}

async function answer(page, right) {
  const reveal = page.locator('[data-act="reveal"]');
  if (await reveal.count()) { // flashcard: turn it, then grade it
    await reveal.click();
    await page.locator('[data-act="selfGrade"][data-v="' + (right ? 1 : 0) + '"]').click();
    const next = page.locator('[data-act="next"]');
    if (await next.count()) await next.click();
    return;
  }
  const question = clean(await page.locator("h2.question").innerText());
  const good = RIGHT.get(question);
  expect(good, `question inconnue : ${question}`).toBeTruthy();
  const choices = page.locator(".choice");
  const texts = (await choices.locator(".text").allInnerTexts()).map(clean);
  const targets = right ? texts.filter(t => good.has(t)) : [texts.find(t => !good.has(t))];
  for (const t of targets) await clickChoice(page, t);
  const validate = page.locator('[data-act="validate"]');
  if (await validate.count()) await validate.click();
  const next = page.locator('[data-act="next"]');
  if (await next.count()) await next.click();
}

// Answers the current multiple-choice question right and stays on the feedback (review mode).
async function answerWithoutMoving(page) {
  const good = RIGHT.get(clean(await page.locator("h2.question").innerText()));
  const texts = (await page.locator(".choice .text").allInnerTexts()).map(clean);
  for (const t of texts.filter(t => good.has(t))) await clickChoice(page, t);
  const validate = page.locator('[data-act="validate"]');
  if (await validate.count()) await validate.click();
  await expect(page.locator('[data-act="next"]')).toBeVisible();
}

const onQuestion = page => page.locator("h2.question").count().then(n => n > 0);
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

test("premier lancement : guide d'installation, puis accueil, sans texte genré", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("envol-v2-guide-seen"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Installer Envol" })).toBeVisible();
  await page.getByRole("button", { name: "C'est fait" }).click();
  await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible();
  await expect(page.getByText(`${PLAYABLE.length} questions à découvrir`)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await page.locator("body").innerText()).not.toMatch(/prête|prêt·e|prêt\(e\)/i);
});

test("révision : une séance complète, les erreurs reviennent, tout est gardé", async ({ page }) => {
  test.setTimeout(60_000); // a whole session, answered one question at a time
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  await expect(page.getByText(/Question 1 sur 15/)).toBeVisible();
  let first = 0;
  const seen = new Set();
  while (await onQuestion(page)) {
    const q = clean(await page.locator("h2.question").innerText());
    const isFirst = !seen.has(q);
    seen.add(q);
    if (isFirst) first++;
    await answer(page, !(isFirst && first <= 3)); // the 3 first questions: wrong the first time
  }
  await expect(page.getByText("12 bonnes réponses du premier coup sur 15.")).toBeVisible();
  const s = await saved(page);
  expect(Object.keys(s.cards)).toHaveLength(15);
  expect(s.reviews).toHaveLength(1);
  expect(Object.values(s.cards).filter(c => c.seen === 2)).toHaveLength(3); // missed, then right later

  await page.reload();
  await expect(page.getByText(/à revoir aujourd'hui|Tout est à jour/)).toBeVisible();
  expect(await saved(page)).toEqual(s);
});

test("test blanc : 20 questions sur tous les thèmes, noté sur 20, visible dans Mes résultats", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Faire un test blanc" }).click();
  const themes = new Set();
  for (let i = 0; i < 20; i++) {
    await expect(page.getByText(`Test blanc, question ${i + 1} sur 20`)).toBeVisible();
    themes.add(await page.locator(".meta .label").nth(1).innerText());
    await answer(page, i % 4 !== 0);
  }
  expect(themes.size).toBe(TEST_THEMES);
  await expect(page.getByText("15 / 20")).toBeVisible();
  await expect(page.locator(".mistake")).toHaveCount(5);
  await page.getByRole("button", { name: /On s'y met|Retour à l'accueil/ }).first().click();

  await page.goto("/");
  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.getByText(/1 test\. Meilleure note : 15 \/ 20/)).toBeVisible();
  await expect(page.locator(".gauges").first().locator(".gauge")).toHaveCount(THEMES);
});

test("quitter un test blanc : il n'est pas noté", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Faire un test blanc" }).click();
  await answer(page, true);
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Quitter" }).click();
  await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible();
  expect((await saved(page)).tests).toHaveLength(0);
});

test("réglages : la date d'examen règle le compte à rebours", async ({ page }) => {
  const d = new Date(Date.now() + 10 * DAY);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.locator("#exam").fill(iso);
  await page.getByRole("button", { name: "Enregistrer la date" }).click();
  await expect(page.getByText("Date enregistrée")).toBeVisible();
  expect((await saved(page)).examDate).toBe(iso);
  // Everything discovered 3 days before the exam: the pace and the number of sessions it takes.
  const perDay = Math.ceil(PLAYABLE.length / 7), sessions = Math.ceil(perDay / 15);
  await expect(page.locator(".plan")).toHaveText(`Rythme conseillé : environ ${perDay} nouvelles questions par jour, soit ${sessions} séances de révision par jour.`);
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("img", { name: /maîtrisé, J-10$/ })).toBeVisible();

  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Retirer la date" }).click();
  expect((await saved(page)).examDate).toBeNull();
});

test("sauvegarde : export, import sur un téléphone vide, refus des fichiers abîmés, annulation", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  for (let i = 0; i < 3; i++) await answer(page, true);
  await page.getByRole("button", { name: "Quitter" }).click(); // records the review session too
  await page.getByRole("button", { name: "Retour à l'accueil" }).click();
  const mine = await saved(page);
  expect(mine.reviews).toHaveLength(1);
  await page.getByRole("button", { name: "Sauvegarde" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Enregistrer une copie" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^envol-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
  const copy = info.outputPath("copie.json");
  await file.saveAs(copy);
  expect(JSON.parse(readFileSync(copy, "utf8"))).toEqual(mine);

  // "Another phone": empty storage.
  await page.evaluate(k => localStorage.removeItem(k), KEY);
  await page.reload();
  await page.getByRole("button", { name: "Sauvegarde" }).click();
  page.once("dialog", d => d.accept());
  await page.locator("#file").setInputFiles(copy);
  await expect(page.getByText("C'est fait, les progrès de la copie sont de retour.")).toBeVisible();
  expect(await saved(page)).toEqual(mine);

  // A malformed file (it used to break the history screen) is refused, nothing changes.
  await page.locator("#file").setInputFiles({ name: "abime.json", mimeType: "application/json", buffer: Buffer.from('{"version":2,"examDate":null,"cards":{},"tests":[null],"reviews":[]}') });
  await expect(page.getByText(/Import impossible\s:\stest blanc n°\s1 invalide/)).toBeVisible();
  await page.locator("#file").setInputFiles({ name: "texte.json", mimeType: "application/json", buffer: Buffer.from("pas du json") });
  await expect(page.getByText(/Import impossible\s:\sce fichier n.est pas une sauvegarde Envol/)).toBeVisible();
  expect(await saved(page)).toEqual(mine);
  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.getByRole("heading", { name: "Mes résultats" })).toBeVisible();

  // Undo the import: back to the empty state that was there before.
  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Sauvegarde" }).click();
  await page.getByRole("button", { name: "Annuler le dernier import" }).click();
  await expect(page.getByText("Import annulé")).toBeVisible();
  expect(Object.keys((await saved(page)).cards)).toHaveLength(0);
});

test("sauvegarde abîmée sur le téléphone : l'app repart et prévient", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible(); // deck loaded
  await page.evaluate(k => localStorage.setItem(k, "{abîmé"), KEY);
  await page.reload();
  await expect(page.getByText(/La sauvegarde de cet appareil était abîmée/)).toBeVisible();
  await page.getByRole("button", { name: "Réviser" }).click();
  await expect(page.locator("h2.question")).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k + "-corrupt"), KEY)).toBe("{abîmé");
});

test("hors ligne : l'app s'ouvre avec ses fiches et ses progrès", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "mode hors ligne simulé fiable uniquement sous Chromium");
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await page.getByRole("button", { name: "Réviser" }).click();
  await answer(page, true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible();
  await expect(page.getByText(/à revoir aujourd'hui/)).toBeVisible();
  await page.getByRole("button", { name: "Faire un test blanc" }).click();
  await expect(page.getByText("Test blanc, question 1 sur 20")).toBeVisible();
  await context.setOffline(false);
});

/* ---------- Évolutions ---------- */

test("drapeau : « à revoir » la fait revenir ; signalée, elle est écartée jusqu'au retrait du signalement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  const question = clean(await page.locator("h2.question").innerText());
  const expected = [...RIGHT.get(question)].join(", ");
  await page.getByRole("button", { name: "Marquer cette question" }).click();
  await page.getByRole("button", { name: "À revoir" }).click();
  await page.getByRole("button", { name: "Quitter" }).click();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Revoir mes erreurs (1)" })).toBeVisible();

  await page.getByRole("button", { name: "Revoir mes erreurs (1)" }).click();
  await page.getByRole("button", { name: "Marquer cette question" }).click();
  await page.getByRole("button", { name: "Réponse douteuse" }).click();
  await expect(page.getByRole("button", { name: /Réponse douteuse/ })).toHaveAttribute("aria-pressed", "true");
  const [flag] = Object.values((await saved(page)).flags);
  expect(flag).toMatchObject({ review: true, dispute: true });
  expect(flag.answer.split(", ").sort()).toEqual(expected.split(", ").sort());

  await page.getByRole("button", { name: "Quitter" }).click();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Revoir mes erreurs/ })).toHaveCount(0); // set aside
  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.getByRole("heading", { name: "Questions signalées" })).toBeVisible();
  const item = page.locator(".mistake").filter({ hasText: question.replace(/ \?$/, "") });
  await expect(item).toContainText("Écartée des séances");
  await item.getByRole("button", { name: "Retirer le signalement" }).click();
  await expect(page.getByText("Signalement retiré")).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).first().click();
  await expect(page.getByRole("button", { name: "Revoir mes erreurs (1)" })).toBeVisible();
});

test("signalement : après la réponse, on signale avec une raison, puis on envoie le fichier", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  const question = clean(await page.locator("h2.question").innerText());
  await answerWithoutMoving(page);
  await page.getByRole("button", { name: "Signaler une erreur dans cette question" }).click();
  await expect(page.getByText("Question signalée")).toBeVisible();
  await page.getByLabel("Pourquoi ? (facultatif)").fill("La page dit autre chose.");
  await expect.poll(async () => Object.values((await saved(page)).flags)).toEqual([{ review: false, dispute: true, answer: expect.any(String), note: "La page dit autre chose." }]);

  await page.getByRole("button", { name: "Quitter" }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.locator(".mistake").filter({ hasText: "Pourquoi : La page dit autre chose." })).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Envoyer mes signalements" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^envol-signalements-\d{4}-\d{2}-\d{2}\.json$/);
  const path = info.outputPath("signalements.json");
  await file.saveAs(path);
  const report = JSON.parse(readFileSync(path, "utf8"));
  expect(report).toMatchObject({ app: "envol", type: "signalements", version: expect.stringMatching(/^\d+\.\d+\.\d+$/), fiches: expect.stringMatching(/^[0-9a-f]{6}$/) });
  expect(report.items).toHaveLength(1);
  expect(clean(report.items[0].question)).toBe(question);
  expect(report.items[0].note).toBe("La page dit autre chose.");
  await expect(page.getByText("Fichier prêt")).toBeVisible();
});

test("ordre des réponses : la bonne réponse change de place d'un affichage à l'autre", async ({ page }) => {
  test.setTimeout(90_000); // four whole sessions
  await page.goto("/");
  const positions = [0, 0, 0, 0];
  while (positions.reduce((a, b) => a + b) < 60) {
    await page.getByRole("button", { name: "Réviser" }).click();
    while (await onQuestion(page)) {
      const good = RIGHT.get(clean(await page.locator("h2.question").innerText()));
      const texts = (await page.locator(".choice .text").allInnerTexts()).map(clean);
      positions[texts.findIndex(t => good.has(t))]++;
      await answer(page, true);
    }
    await page.goto("/");
  }
  // A fixed place would leave three positions empty; at random each gets about 15 of the 60.
  for (const n of positions) expect(n, `positions de la bonne réponse : ${positions.join(" / ")}`).toBeGreaterThan(3);
});

/* ---------- Version 2.3.0 ---------- */

// Progress with mistakes, an exam date and no backup copy for 8 days: every note of the home screen shows.
async function seedHistory(page) {
  await page.evaluate(async () => {
    const { applyAnswer } = await import("/js/engine.js");
    const { loadDeck } = await import("/js/deck.js");
    const { isoDate } = await import("/js/util.js");
    const { questions } = await loadDeck(async p => (await fetch("/" + p)).json());
    const now = Date.now(), DAY = 864e5, cards = {};
    questions.slice(0, 30).forEach((q, i) => {
      let c;
      for (let d = 8; d >= 0; d -= 2) c = applyAnswer(c, { correct: (i + d) % 3 !== 0, mode: "review", now: now - d * DAY });
      cards[q.id] = c;
    });
    localStorage.setItem("envol-v2", JSON.stringify({ version: 2, examDate: isoDate(now + 20 * DAY), cards, tests: [], reviews: [] }));
  });
  await page.reload();
}

test("accueil : tout tient sans défiler sur les petits téléphones, même avec toutes les notes", async ({ page }) => {
  await page.goto("/");
  await seedHistory(page);
  await page.getByRole("button", { name: "Réviser" }).click();
  await answer(page, true);
  await answer(page, false);
  await page.goto("/"); // session left unfinished: "Reprendre" shows
  await expect(page.getByRole("button", { name: "Reprendre" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Faire une copie" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Revoir mes erreurs/ })).toBeVisible();
  await expect(page.locator(".day-bar")).toBeVisible();
  // Fonts differ between phones and systems (Linux CI servers use a much wider one than Windows):
  // the second pass forces a wide font, so the layout must fit whatever the text widths.
  for (const font of ["police de l'appareil", "police large"]) {
    if (font === "police large") await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "* { font-family: Verdana, 'DejaVu Sans', sans-serif !important; letter-spacing: .01em; }";
      document.head.append(style);
    }));
    for (const [width, height] of [[360, 640], [375, 667], [360, 700], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.reload();
      await expect(page.getByRole("button", { name: "Réviser" })).toBeVisible();
      const scroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      expect(scroll, `accueil en ${width}×${height}, ${font} : défilement vertical`).toBeLessThanOrEqual(0);
    }
  }
});

test("reprendre une séance : l'app fermée en pleine séance, on reprend à la question suivante", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  await answer(page, true);
  await answer(page, true);
  await expect(page.locator(".meta .label").first()).toHaveText("Question 3 sur 15");
  await page.goto("/");
  await expect(page.getByText("En cours : 3/15")).toBeVisible();
  await page.getByRole("button", { name: "Reprendre" }).click();
  await expect(page.locator(".meta .label").first()).toHaveText("Question 3 sur 15");
  // Finished or left properly: nothing to resume.
  await page.getByRole("button", { name: "Quitter" }).click();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reprendre" })).toHaveCount(0);
});

test("Mes résultats : réviser un thème, les plus ratées, date de découverte", async ({ page }) => {
  await page.goto("/");
  await seedHistory(page);
  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.locator(".forecast")).toContainText(/30 \/ \d+ questions découvertes : à ce rythme, tout sera vu le \w+ \d+ \w+\./);
  await expect(page.getByRole("heading", { name: "Les plus ratées" })).toBeVisible();
  const listed = (await page.locator(".mistakes").first().locator(".mistake b").allInnerTexts()).map(clean);
  expect(listed.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Réviser ces questions" }).click();
  const seen = new Set();
  while (await onQuestion(page)) { seen.add(clean(await page.locator("h2.question").innerText())); await answer(page, true); }
  for (const q of seen) expect(listed, "question hors des plus ratées").toContain(q);

  await page.goto("/");
  await page.getByRole("button", { name: "Mes résultats" }).click();
  const row = page.locator(".theme-row").nth(2);
  const theme = clean(await row.locator(".name").innerText());
  await row.getByRole("button", { name: "Réviser ce thème" }).click();
  for (let i = 0; i < 5 && await onQuestion(page); i++) {
    await expect(page.locator(".meta .theme")).toHaveText(theme);
    await answer(page, true);
  }
});

test("affichage : texte agrandi et thème sombre, gardés après fermeture ; guide des fonctionnalités", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("switch", { name: "Texte agrandi" }).click();
  await page.getByRole("button", { name: "Sombre" }).click();
  await expect(page.getByRole("button", { name: "Sombre" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  expect(await page.evaluate(() => [document.documentElement.dataset.text, document.documentElement.dataset.theme])).toEqual(["large", "dark"]);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(15, 27, 45)");
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Clair" }).click();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(247, 243, 236)");

  await page.getByRole("button", { name: "Comment marche Envol" }).click();
  await expect(page.getByRole("heading", { name: "Comment marche Envol" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La pastille" })).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("heading", { name: "Réglages" })).toBeVisible();
});

/* ---------- Version 2.4.0 ---------- */

test("séance express : 5 questions depuis l'accueil", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Séance express : 5 questions" }).click();
  await expect(page.locator(".meta .label").first()).toHaveText("Question 1 sur 5");
  let n = 0;
  while (await onQuestion(page)) { await answer(page, true); n++; }
  expect(n).toBe(5);
});

test("fiches mises à jour : nouvelles et corrigées annoncées jusqu'à « Compris »", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Fiches mises à jour/)).toHaveCount(0); // first visit: nothing to announce
  await page.evaluate(() => {
    const before = JSON.parse(localStorage.getItem("envol-v2-deck"));
    const ids = Object.keys(before);
    delete before[ids[0]]; delete before[ids[1]]; // two questions "added" since
    before[ids[2]] = "000000"; // one "corrected"
    localStorage.setItem("envol-v2-deck", JSON.stringify(before));
  });
  await page.reload();
  await expect(page.getByText("Fiches mises à jour : 2 nouvelles questions, 1 question corrigée")).toBeVisible();
  await page.getByRole("button", { name: "Compris" }).click();
  await expect(page.getByText(/Fiches mises à jour/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Fiches mises à jour/)).toHaveCount(0);
});

test("signalement corrigé : l'accueil le dit, Mes résultats le montre", async ({ page }) => {
  await page.goto("/");
  const id = PLAYABLE[0].id;
  await page.evaluate(id => {
    const save = JSON.parse(localStorage.getItem("envol-v2") || "null") || { version: 2, examDate: null, cards: {}, tests: [], reviews: [] };
    save.flags = { [id]: { review: false, dispute: true, answer: "réponse d'avant la correction" } };
    localStorage.setItem("envol-v2", JSON.stringify(save));
  }, id);
  await page.reload();
  await expect(page.getByText("Ta question signalée est corrigée")).toBeVisible();
  await page.getByRole("button", { name: "Voir" }).click();
  await expect(page.getByText("La fiche a changé depuis ton signalement")).toBeVisible();
  await page.getByRole("button", { name: "Retirer le signalement" }).click();
  await page.getByRole("button", { name: "Retour" }).first().click();
  await expect(page.getByText("Ta question signalée est corrigée")).toHaveCount(0);
});

test("cours : lire un thème, chercher dans tous les thèmes, puis réviser le thème", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cours" }).click();
  await expect(page.getByRole("heading", { name: "Cours" })).toBeVisible();
  const themes = page.locator(".course-theme");
  await expect(themes).toHaveCount(THEMES);
  await themes.filter({ hasText: "Les nuages" }).locator("summary").click();
  await expect(themes.filter({ hasText: "Les nuages" }).locator(".excerpt-table table").first()).toBeVisible();

  const search = page.getByLabel("Chercher");
  await search.fill("cumulonimbus");
  await expect(page.getByText(/\d+ passages? trouvés?/)).toBeVisible();
  for (const text of await page.locator("#courseList .excerpt").allInnerTexts()) expect(text.toLowerCase()).toMatch(/cumulo-?nimbus/);
  await expect(search).toBeFocused(); // the list is redrawn, not the field
  await search.fill("mot introuvable");
  await expect(page.getByText("Aucun passage ne contient ces mots.")).toBeVisible();

  await search.fill("");
  const theme = themes.filter({ hasText: "Anatomie" });
  await theme.locator("summary").click();
  await theme.getByRole("button", { name: "Réviser ce thème" }).click();
  await expect(page.locator(".meta .theme")).toHaveText("Anatomie");
});

test("fiabilité : la pastille de chaque question explique son état", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  const dot = page.getByRole("button", { name: /^Fiabilité : / });
  await expect(dot).toBeVisible();
  await dot.click();
  await expect(page.locator(".reliability")).toContainText(/Vérifiée|À recouper|Douteuse/);
  await dot.click();
  await expect(page.locator(".reliability")).toHaveCount(0);
});

test("réglages : version, empreinte des fiches et recherche de mise à jour", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(page.locator(".version")).toHaveText(new RegExp(`^Version \\d+\\.\\d+\\.\\d+ · fiches [0-9a-f]{6} · ${PLAYABLE.length} questions$`));
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Rechercher une mise à jour" }).click();
  await expect(page.getByText(/Envol est à jour \(version \d+\.\d+\.\d+\)/)).toBeVisible();
});

test("Mes erreurs : une séance faite uniquement des questions ratées", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  const missed = new Set();
  for (let i = 0; i < 4; i++) { missed.add(clean(await page.locator("h2.question").innerText())); await answer(page, false); }
  await page.getByRole("button", { name: "Quitter" }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Revoir mes erreurs (4)" }).click();
  await expect(page.getByText("Question 1 sur 4")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    expect(missed.has(clean(await page.locator("h2.question").innerText()))).toBe(true);
    await answer(page, true);
  }
  await expect(page.getByText("4 bonnes réponses du premier coup sur 4.")).toBeVisible();
});

test.describe(() => {
  // The test theme is served by the test itself: the service worker must not answer first.
  test.use({ serviceWorkers: "block" });
  test("cartes mémoire : on retourne la carte puis on se note", async ({ page, context }) => {
    // The published deck has no flashcards: serve a test theme next to it.
    await context.route("**/fiches/index.json", async route => {
      const index = await (await route.fetch()).json();
      index.themes.push({ id: "test-cartes", title: "Cartes de test", file: "test-cartes.json" });
      await route.fulfill({ json: index });
    });
    await context.route("**/fiches/test-cartes.json", route => route.fulfill({ json: { questions: [1, 2, 3, 4, 5, 6].map(n => ({
      id: `test-carte-${n}`, type: "card", question: `Carte ${n} : recto`, answer: `Verso ${n}`,
    })) } }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible();
    // Only the flashcard theme is left to discover, so the session is made of cards.
    await page.evaluate(async () => {
      const { loadDeck } = await import("/js/deck.js");
      const { questions } = await loadDeck(async p => (await fetch("/" + p)).json());
      const now = Date.now(), cards = {};
      for (const q of questions) if (q.kind === "mcq") cards[q.id] = { level: 5, due: now + 9e8, seen: 3, correct: 3, firstSeen: now - 9e8, lastWrong: null };
      localStorage.setItem("envol-v2", JSON.stringify({ version: 2, examDate: null, cards, tests: [], reviews: [] }));
    });
    await page.reload();
    await page.getByRole("button", { name: "Réviser" }).click();
    // The 6 new flashcards are mixed with already known questions: move on until a card shows up.
    for (let i = 0; i < 20 && !(await page.locator('[data-act="reveal"]').count()); i++) await answer(page, true);
    expect(await page.locator(".choice").count()).toBe(0);
    await page.getByRole("button", { name: "Voir la réponse" }).click();
    await expect(page.locator(".verso")).toBeVisible();
    await page.getByRole("button", { name: "Je savais" }).click();
    await expect(page.getByText("Bien joué.")).toBeVisible();
  });
});

test("test blanc chronométré : le temps écoulé termine le test et compte le reste faux", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Faire un test blanc" }).click();
  await expect(page.locator("#timer")).toHaveText("20:00");
  for (let i = 0; i < 5; i++) await answer(page, true);
  await page.clock.runFor(10 * 60e3);
  await expect(page.locator("#timer")).toHaveText(/^(9:5\d|10:00)$/);
  await page.clock.runFor(11 * 60e3);
  await expect(page.getByText(/Temps écoulé\s:\s15 questions sans réponse/)).toBeVisible();
  await expect(page.getByText("5 / 20")).toBeVisible();
  expect((await saved(page)).tests[0]).toMatchObject({ correct: 5, total: 20 });
});

test("réglages : le chronomètre se désactive", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("switch", { name: "Test blanc chronométré" }).click();
  await expect(page.getByRole("switch", { name: "Test blanc chronométré" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Faire un test blanc" }).click();
  await expect(page.locator("#timer")).toHaveCount(0);
});

test("régularité et rappel de sauvegarde", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible();
  await page.evaluate(id => {
    const d = k => { const x = new Date(Date.now() - k * 864e5); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
    const old = Date.now() - 10 * 864e5;
    localStorage.setItem("envol-v2", JSON.stringify({
      version: 2, examDate: null, tests: [], reviews: [],
      cards: { [id]: { level: 1, due: old, seen: 1, correct: 1, firstSeen: old, lastWrong: null } },
      activity: [d(3), d(2), d(1)], lastExport: null,
    }));
  }, PLAYABLE[0].id);
  await page.reload();
  await expect(page.getByText("Aucune copie")).toBeVisible();
  await page.getByRole("button", { name: "Faire une copie" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Enregistrer une copie" }).click();
  await download;
  await expect(page.getByText("Copie enregistrée.")).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.locator(".reminder")).toHaveCount(0);

  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.getByText("3 jours d'affilée")).toBeVisible();
  await expect(page.locator(".calendar span.on")).toHaveCount(3);
});

test("erreur : l'extrait de la fiche s'affiche avec sa page, lisible sur un petit iPhone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  // Answer wrong until a question whose excerpt holds a table shows up.
  const withTable = PLAYABLE.filter(q => q.excerpt && q.excerpt.table).map(q => clean(q.question));
  let found = false;
  for (let i = 0; i < 40 && await onQuestion(page); i++) {
    const question = clean(await page.locator("h2.question").innerText());
    const good = RIGHT.get(question);
    const texts = (await page.locator(".choice .text").allInnerTexts()).map(clean);
    await clickChoice(page, texts.find(t => !good.has(t)));
    const validate = page.locator('[data-act="validate"]');
    if (await validate.count()) await validate.click();
    await expect(page.locator(".excerpt")).toBeVisible();
    await expect(page.locator(".excerpt figcaption")).toContainText(/, page \d+/);
    if (withTable.includes(question)) {
      await expect(page.locator(".excerpt-table table")).toBeVisible();
      found = true;
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "défilement horizontal de la page").toBeLessThanOrEqual(0);
    if (found) break;
    await page.locator('[data-act="next"]').click();
  }
  expect(found, "une question avec un tableau de la fiche").toBe(true);
});

for (const [device, ua, expected] of [
  ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", "Sur l'écran d'accueil"],
  ["Android", "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36", "Installer l'application"],
  ["ordinateur", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36", "barre d'adresse"],
]) {
  test.describe(() => {
    test.use({ userAgent: ua });
    test(`guide d'installation adapté : ${device}`, async ({ page }) => {
      await page.addInitScript(() => localStorage.removeItem("envol-v2-guide-seen"));
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Installer Envol" })).toBeVisible();
      await expect(page.locator(".steps")).toContainText(expected);
      await page.getByRole("button", { name: "Continuer dans le navigateur" }).click();
      await page.getByRole("button", { name: "Réglages" }).click();
      await page.getByRole("button", { name: "Installer Envol sur cet appareil" }).click();
      await expect(page.locator(".steps")).toContainText(expected);
    });
  });
}
