import { esc, plural } from "../util.js";
import { closeBar } from "./common.js";

// A QR code as SVG: black on white whatever the theme (cameras need that contrast), with its quiet zone,
// one path for the dark modules (row by row runs).
export function qrSvg({ size, modules }) {
  const n = size + 8;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size;) {
      if (!modules[y * size + x]) { x++; continue; }
      let run = 1;
      while (x + run < size && modules[y * size + x + run]) run++;
      d += `M${x + 4} ${y + 4}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// "Envoyer vers un autre appareil": the codes go by in turn (app.js puts them in #qr).
export function renderSend({ count }) {
  return `<main class="screen">
    ${closeBar("backup")}
    <h1 class="title">Envoyer vers un autre appareil</h1>
    <p class="muted">Sur l'autre appareil, ouvre Envol, puis Sauvegarde → Recevoir par QR code, et vise ces codes. Ils défilent tout seuls : laisse cet écran allumé, assez lumineux, bien en face.</p>
    <figure class="qr-show" role="img" aria-label="${plural(count, "code", "codes")} de ta progression, qui défilent">
      <div id="qr" class="qr"></div>
      <figcaption id="qrCount" class="muted" aria-hidden="true">Code 1 sur ${count}</figcaption>
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
    <p class="muted">Sur l'autre appareil, ouvre Envol, puis Sauvegarde → Envoyer par QR code. Vise ses codes avec cet appareil, à une vingtaine de centimètres, jusqu'à ce que tous soient reçus.</p>
    ${error ? `<p class="notice" data-announce>${esc(error)}</p>` : `<div class="scan"><video id="scanVideo" playsinline muted autoplay></video></div>
    <p id="scanStatus" class="muted scan-status" role="status">Ouverture de la caméra…</p>
    <div id="scanDots" class="scan-dots" aria-hidden="true"></div>`}
    <div class="actions"><button class="link" data-act="backup">Annuler</button></div>
  </main>`;
}
