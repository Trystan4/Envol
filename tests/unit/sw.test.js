// The offline copy must contain every published file: a forgotten file works online
// but breaks the app on the phone without network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../src/", import.meta.url));

function publishedFiles(dir = "") {
  return readdirSync(src + dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? publishedFiles(`${dir}${e.name}/`) : [`${dir}${e.name}`]);
}

const assets = () => {
  const list = readFileSync(src + "sw.js", "utf8").match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  return [...list.matchAll(/"([^"]+)"/g)].map(m => m[1]);
};

test("le service worker garde tous les fichiers de l'app hors ligne", () => {
  const expected = publishedFiles()
    .filter(f => f !== "sw.js" && f !== ".nojekyll" && !(f.startsWith("fiches/") && f !== "fiches/index.json"))
    .sort();
  const listed = assets().filter(a => a !== "./").sort();
  assert.deepEqual(listed, expected);
});

test("les fiches listées dans index.json existent toutes", () => {
  const index = JSON.parse(readFileSync(src + "fiches/index.json", "utf8"));
  const files = publishedFiles().filter(f => f.startsWith("fiches/"));
  for (const t of index.themes) assert.ok(files.includes(`fiches/${t.file}`), t.file);
});
