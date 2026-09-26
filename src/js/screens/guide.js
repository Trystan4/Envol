import { brand } from "./common.js";

export function renderGuide() {
  return `<main class="screen">
    ${brand()}
    <h1 class="title">Installer Envol sur l'iPhone</h1>
    <p class="muted">Une seule fois, pour l'avoir comme une vraie app, même sans internet.</p>
    <ol class="steps card">
      <li><span class="num">1</span><span>Ouvre cette page dans <b>Safari</b></span></li>
      <li><span class="num">2</span><span>Touche <b>Partager</b> <svg width="18" height="22" viewBox="0 0 18 22" fill="none" stroke="var(--cabine)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M9 14V2M5 6l4-4 4 4M6 9H3v11h12V9h-3"/></svg> en bas de l'écran</span></li>
      <li><span class="num">3</span><span>Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b></span></li>
    </ol>
    <p class="note">Ensuite, ouvre toujours Envol depuis son icône : c'est là que les progrès sont gardés.</p>
    <div class="actions">
      <button class="btn" data-act="guideDone">C'est fait</button>
      <button class="link" data-act="guideDone">Continuer dans Safari</button>
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
