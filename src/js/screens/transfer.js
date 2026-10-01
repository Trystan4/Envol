import { esc, plural } from "../util.js";
import { closeBar } from "./common.js";

// The Envol logo, drawn as icon.png (512 × 512) but framed closer: a 360 × 360 square from (76, 81). The sun
// rising over the line, the flight path above it, cut from the sun by a gap of the background colour.
const LOGO = `<rect class="qr-ink" x="76" y="81" width="360" height="360" rx="80"/>
  <path class="qr-sun" d="M154 362a104 104 0 0 1 208 0z"/>
  <path class="qr-line" d="M200 370h197" stroke-width="20"/>
  <path class="qr-gap" d="M125 370C279.5 340.5 330.5 229.5 370 168" stroke-width="62"/>
  <path class="qr-line" d="M125 370C279.5 340.5 330.5 229.5 370 168" stroke-width="24"/>
  <circle class="qr-paper" cx="371" cy="166" r="24"/>`;

// A QR code as SVG: the app's dark blue on its cream whatever the theme (cameras need that contrast), with
// its quiet zone, one path for the dark modules (row by row runs), and the logo over the middle square
// that the error correction makes up for (qr.js, logoArea).
export function qrSvg({ size, modules, logo }) {
  const n = size + 8;
  const hidden = (x, y) => logo && x >= logo.from && x < logo.from + logo.side && y >= logo.from && y < logo.from + logo.side;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size;) {
      if (!modules[y * size + x] || hidden(x, y)) { x++; continue; }
      let run = 1;
      while (x + run < size && modules[y * size + x + run] && !hidden(x + run, y)) run++;
      d += `M${x + 4} ${y + 4}h${run}v1h-${run}z`;
      x += run;
    }
  }
  // The logo leaves a margin of half a module to the modules around it.
  const mark = logo ? `<g transform="translate(${logo.from + 4.5} ${logo.from + 4.5}) scale(${(logo.side - 1) / 360}) translate(-76 -81)" shape-rendering="geometricPrecision">${LOGO}</g>` : "";
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><rect class="qr-paper" width="${n}" height="${n}"/><path class="qr-ink" d="${d}"/>${mark}</svg>`;
}

// "Envoyer vers un autre appareil": one code, or codes going by in turn (app.js puts them in #qr).
export function renderSend({ count }) {
  const one = count === 1;
  return `<main class="screen">
    ${closeBar("backup")}
    <h1 class="title">Envoyer vers un autre appareil</h1>
    <p class="muted">Sur l'autre appareil, ouvre Envol, puis Sauvegarde → Recevoir par QR code, et vise ${one ? "ce code" : "ces codes. Ils défilent tout seuls"} : laisse cet écran allumé, assez lumineux, bien en face.</p>
    <figure class="qr-show" role="img" aria-label="${one ? "Le code de ta progression" : `${plural(count, "code", "codes")} de ta progression, qui défilent`}">
      <div id="qr" class="qr"></div>
      ${one ? "" : `<figcaption id="qrCount" class="muted" aria-hidden="true">Code 1 sur ${count}</figcaption>`}
    </figure>
    <div class="actions"><button class="btn" data-act="backup">C'est reçu</button></div>
  </main>`;
}

// One dot per code, filled once received.
export const scanDots = (count, parts) => Array.from({ length: count }, (_, i) => `<span class="${parts && parts[i] !== undefined ? "on" : ""}"></span>`).join("");

// "Recevoir d'un autre appareil": the camera (app.js plays it in #scanVideo) and the codes received.
export function renderReceive({ error } = {}) {
  return `<main class="screen">
    ${closeBar("backup")}
    <h1 class="title">Recevoir d'un autre appareil</h1>
    <p class="muted">Sur l'autre appareil, ouvre Envol, puis Sauvegarde → Envoyer par QR code. Vise son écran avec cet appareil, d'assez près pour que le code remplisse le cadre, jusqu'à ce que tout soit reçu.</p>
    ${error ? `<p class="notice" data-announce>${esc(error)}</p>` : `<div class="scan"><video id="scanVideo" playsinline muted autoplay></video></div>
    <p id="scanStatus" class="muted scan-status" role="status">Ouverture de la caméra…</p>
    <div id="scanDots" class="scan-dots" aria-hidden="true"></div>`}
    <div class="actions"><button class="link" data-act="backup">Annuler</button></div>
  </main>`;
}
