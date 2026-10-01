import { esc } from "../util.js";
import { closeBar } from "./common.js";

// message: success text; error: failure text; canUndo: a pre-import state is kept.
export function renderBackup({ message, error, canUndo }) {
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
    <input type="file" id="file" accept=".json,application/json" hidden>
  </main>`;
}
