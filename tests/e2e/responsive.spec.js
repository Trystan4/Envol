// Every screen, on every phone size: no sideways scrolling, buttons big enough for a thumb,
// no Content-Security-Policy violation.

import { test, expect } from "@playwright/test";

const SIZES = {
  "iPhone SE (1re gén.)": { width: 320, height: 568 },
  "iPhone SE / 8": { width: 375, height: 667 },
  "iPhone 13–16": { width: 390, height: 844 },
  "iPhone Pro Max": { width: 430, height: 932 },
  "paysage": { width: 844, height: 390 },
  "Android": { width: 412, height: 915 },
  "iPad": { width: 768, height: 1024 },
  "iPad paysage": { width: 1024, height: 768 },
  "ordinateur": { width: 1440, height: 900 },
};

// Progress with some history, built with the app's own engine so it is always valid.
async function seed(page) {
  await page.evaluate(async () => {
    const { applyAnswer } = await import("/js/engine.js");
    const { loadDeck } = await import("/js/deck.js");
    const { isoDate } = await import("/js/util.js");
    const { questions } = await loadDeck(async p => (await fetch("/" + p)).json());
    const now = Date.now(), DAY = 864e5, cards = {};
    questions.slice(0, 40).forEach((q, i) => {
      let c;
      for (let d = 5; d >= 0; d--) c = applyAnswer(c, { correct: (i + d) % 4 !== 0, mode: "review", now: now - d * DAY });
      cards[q.id] = c;
    });
    const tests = [11, 14, 12, 16].map((g, i) => ({ at: now - (4 - i) * DAY, correct: g, total: 20, byTheme: {} }));
    const reviews = [1, 2, 3].map(i => ({ at: now - i * DAY, correct: 15, total: 20 }));
    localStorage.setItem("envol-v2", JSON.stringify({ version: 2, examDate: isoDate(now + 21 * DAY), cards, tests, reviews }));
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "On décolle ?" })).toBeVisible();
}

async function checkScreen(page, name) {
  const r = await page.evaluate(() => {
    const small = [...document.querySelectorAll("button")]
      .filter(b => b.offsetParent !== null)
      .map(b => ({ text: b.innerText.trim() || b.getAttribute("aria-label"), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))
      .filter(b => b.h < 44 || b.w < 44);
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, small };
  });
  expect(r.overflow, `${name} : défilement horizontal`).toBeLessThanOrEqual(0);
  expect(r.small, `${name} : boutons trop petits pour le pouce (< 44 px)`).toEqual([]);
}

for (const [label, viewport] of Object.entries(SIZES)) {
  test(`tous les écrans tiennent sur ${label} (${viewport.width}×${viewport.height})`, async ({ page }) => {
    const cspErrors = [];
    page.on("console", m => { if (/Content.Security.Policy|Refused to/i.test(m.text())) cspErrors.push(m.text()); });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await checkScreen(page, "guide");
    await page.getByRole("button", { name: "C'est fait" }).click();
    await seed(page);
    await checkScreen(page, "accueil");

    await page.getByRole("button", { name: "Réviser" }).click();
    await checkScreen(page, "question");
    if (await page.locator('[data-act="reveal"]').count()) { // flashcard drawn: turn it and grade it
      await page.locator('[data-act="reveal"]').click();
      await page.locator('[data-act="selfGrade"][data-v="0"]').click();
    } else {
      await page.locator(".choice").first().click();
      if (await page.locator('[data-act="validate"]').count()) await page.locator('[data-act="validate"]').click();
    }
    await checkScreen(page, "question corrigée");
    await page.getByRole("button", { name: "Quitter" }).click();
    await checkScreen(page, "bilan");

    await page.goto("/");
    await page.getByRole("button", { name: "Mes résultats" }).click();
    await checkScreen(page, "mes résultats");
    await page.getByRole("button", { name: "Retour" }).click();
    await page.getByRole("button", { name: "Sauvegarde" }).click();
    await checkScreen(page, "sauvegarde");
    await page.getByRole("button", { name: "Retour" }).click();
    await page.getByRole("button", { name: "Réglages" }).click();
    await checkScreen(page, "réglages");
    await page.getByRole("button", { name: "Comment marche Envol" }).click();
    await checkScreen(page, "comment marche Envol");
    await page.goto("/");
    await page.getByRole("button", { name: "Cours" }).click();
    await checkScreen(page, "cours");
    for (const summary of await page.locator(".course-theme summary").all()) await summary.click(); // every theme open: tables and diagrams
    await checkScreen(page, "cours, thèmes ouverts");

    expect(cspErrors, "violations de la politique de sécurité").toEqual([]);
  });
}
