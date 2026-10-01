import { esc } from "../util.js";
import { closeBar } from "./common.js";

// message: success text; error: failure text; canUndo: a pre-import state is kept;
// qr: this browser can copy the progress to another device by QR codes (transfer.js).
export function renderBackup({ message, error, canUndo, qr }) {
  return `<main class="screen">
    ${closeBar()}
    <h1 class="title">Sauvegarde</h1>
    <p class="muted">Les progrès sont gardés automatiquement sur cet appareil. Garde aussi une copie, par exemple dans Fichiers ou envoyée par message : elle permet de tout retrouver sur un autre appareil.</p>
    ${message ? `<p class="success" data-announce>${esc(message)}</p>` : ""}
    ${error ? `<p class="notice" data-announce>${esc(error)}</p>` : ""}
    <div class="actions">
      <button class="btn" data-act="export">Enregistrer une copie</button>
      <button class="link" data-act="import">Reprendre depuis une copie</button>
      ${canUndo ? `<button class="small-link" data-act="undoImport">Annuler le dernier import</button>` : ""}
    </div>
    ${qr ? `<div class="card transfer">
      <b>Passer sur un autre appareil</b>
      <p class="muted">Sans fichier ni internet : un appareil montre des QR codes, l'autre les filme.</p>
      <div class="segments"><button class="segment" data-act="sendQR">Envoyer par QR code</button><button class="segment" data-act="receiveQR">Recevoir par QR code</button></div>
    </div>` : ""}
    <input type="file" id="file" accept=".json,application/json" hidden>
  </main>`;
}
