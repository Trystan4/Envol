// Full journeys in a real browser, on the real published files (src/).

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const KEY = "envol-v2";
const DAY = 864e5;

// Right answers of the real deck, by question text.
const deckDir = new URL("../../src/fiches/", import.meta.url);
const clean = s => s.replace(/ /g, " ").trim();
const RIGHT = new Map();
for (const t of JSON.parse(readFileSync(new URL("index.json", deckDir), "utf8")).themes) {
  for (const q of JSON.parse(readFileSync(new URL(t.file, deckDir), "utf8")).questions) {
    if (q.type === "card") continue; // flashcards are self-graded, see answer()
    RIGHT.set(clean(q.question), new Set(q.answers.filter(a => a.correct).map(a => clean(a.text))));
  }
}

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
  for (const t of targets) await choices.filter({ hasText: t }).first().click();
  const validate = page.locator('[data-act="validate"]');
  if (await validate.count()) await validate.click();
  const next = page.locator('[data-act="next"]');
  if (await next.count()) await next.click();
}

const onQuestion = page => page.locator("h2.question").count().then(n => n > 0);
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

test("premier lancement : guide d'installation, puis accueil, sans texte genré", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("envol-v2-guide-seen"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Installer Envol sur l'iPhone" })).toBeVisible();
  await page.getByRole("button", { name: "C'est fait" }).click();
  await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible();
  await expect(page.getByText("77 questions à découvrir")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await page.locator("body").innerText()).not.toMatch(/prête|prêt·e|prêt\(e\)/i);
});

test("révision : une séance complète, les erreurs reviennent, tout est gardé", async ({ page }) => {
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
  expect(themes.size).toBe(7);
  await expect(page.getByText("15 / 20")).toBeVisible();
  await expect(page.locator(".mistake")).toHaveCount(5);
  await page.getByRole("button", { name: /On s'y met|Retour à l'accueil/ }).first().click();

  await page.goto("/");
  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.getByText(/1 test\. Meilleure note : 15 \/ 20/)).toBeVisible();
  await expect(page.locator(".gauges").first().locator(".gauge")).toHaveCount(7);
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
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByText("maîtrisé, J-10")).toBeVisible();

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
  await expect(page.getByText(/La sauvegarde de cet iPhone était abîmée/)).toBeVisible();
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

test("drapeau : la question est marquée par l'utilisatrice, et les réponses douteuses sont listées", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Réviser" }).click();
  const question = clean(await page.locator("h2.question").innerText());
  await page.getByRole("button", { name: "Marquer cette question" }).click();
  await page.getByRole("button", { name: "À revoir" }).click();
  await page.getByRole("button", { name: "Réponse douteuse" }).click();
  await expect(page.getByRole("button", { name: /Réponse douteuse/ })).toHaveAttribute("aria-pressed", "true");
  const flags = (await saved(page)).flags;
  expect(Object.values(flags)).toEqual([{ review: true, dispute: true }]);

  await page.getByRole("button", { name: "Quitter" }).click();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Revoir mes erreurs (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Mes résultats" }).click();
  await expect(page.getByRole("heading", { name: "Réponses douteuses signalées" })).toBeVisible();
  await expect(page.locator(".mistake").filter({ hasText: question.replace(/ \?$/, "") })).toHaveCount(1);
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

test("cartes mémoire : on retourne la carte puis on se note", async ({ page }) => {
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
  await page.evaluate(() => {
    const d = k => { const x = new Date(Date.now() - k * 864e5); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
    const old = Date.now() - 10 * 864e5;
    localStorage.setItem("envol-v2", JSON.stringify({
      version: 2, examDate: null, tests: [], reviews: [],
      cards: { "securite-001": { level: 1, due: old, seen: 1, correct: 1, firstSeen: old, lastWrong: null } },
      activity: [d(3), d(2), d(1)], lastExport: null,
    }));
  });
  await page.reload();
  await expect(page.getByText("Aucune copie de sauvegarde pour l'instant.")).toBeVisible();
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
