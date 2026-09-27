import { brand } from "./common.js";

// "ios" (iPhone, iPad — iPadOS says "Macintosh" but has a touch screen), "android" or "desktop".
export function detectPlatform(userAgent, maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}

const SHARE_ICON = `<svg width="18" height="22" viewBox="0 0 18 22" fill="none" stroke="var(--cabine)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M9 14V2M5 6l4-4 4 4M6 9H3v11h12V9h-3"/></svg>`;

const STEPS = {
  ios: [
    "Ouvre cette page dans <b>Safari</b>",
    `Touche <b>Partager</b> ${SHARE_ICON}`,
    "Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>",
  ],
  android: [
    "Ouvre cette page dans <b>Chrome</b>",
    "Touche le menu <b>⋮</b> en haut à droite",
    "Choisis <b>Installer l'application</b> (ou <b>Ajouter à l'écran d'accueil</b>)",
  ],
  desktop: [
    "Ouvre cette page dans <b>Chrome</b> ou <b>Edge</b>",
    "Clique sur l'icône d'installation dans la barre d'adresse, ou menu <b>⋮</b> → <b>Installer Envol</b>",
    "Sur Mac avec Safari : menu <b>Fichier</b> → <b>Ajouter au Dock</b>",
  ],
};

// platform: detectPlatform(); canPrompt: the browser offers a one-tap install (beforeinstallprompt).
export function renderGuide({ platform, canPrompt }) {
  return `<main class="screen">
    ${brand()}
    <h1 class="title">Installer Envol</h1>
    <p class="muted">Une seule fois, pour l'avoir comme une vraie app, même sans internet.</p>
    ${canPrompt
      ? `<div class="actions" style="margin-top:0;padding-top:22px"><button class="btn" data-act="install">Installer Envol</button></div>`
      : `<ol class="steps card">${STEPS[platform].map((s, i) => `<li><span class="num">${i + 1}</span><span>${s}</span></li>`).join("")}</ol>`}
    <p class="note">Ensuite, ouvre toujours Envol depuis son icône : c'est là que les progrès sont gardés.</p>
    <div class="actions">
      <button class="btn" data-act="guideDone">C'est fait</button>
      <button class="link" data-act="guideDone">Continuer dans le navigateur</button>
    </div>
  </main>`;
}

export function renderDeckError() {
  return `<main class="screen">
    ${brand()}
    <h1 class="title">Les fiches ne sont pas encore là</h1>
    <p class="muted">Les questions n'ont pas pu être lues. Connecte-toi à internet une fois, puis réessaie.</p>
    <div class="actions"><button class="btn" data-act="reload">Réessayer</button></div>
  </main>`;
}
