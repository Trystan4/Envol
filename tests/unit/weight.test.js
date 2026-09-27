// Weight budget: the whole app is downloaded again by phones at each update and kept offline,
// so it must stay light. Raise these limits only on purpose.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const MAX_TOTAL = 1_000_000; // bytes, every published file (about 840 KB in version 2.4.0)
const MAX_IMAGE = 80_000; // bytes per image

const files = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);

test("poids : l'app publiée reste sous 1 Mo", () => {
  const total = files(SRC).reduce((sum, f) => sum + statSync(f).size, 0);
  assert.ok(total <= MAX_TOTAL, `${total} octets publiés, limite ${MAX_TOTAL}`);
});

test("poids : chaque image est en WebP et sous 80 Ko", () => {
  for (const f of files(join(SRC, "img"))) {
    assert.match(f, /\.webp$/, f);
    assert.ok(statSync(f).size <= MAX_IMAGE, `${f} : ${statSync(f).size} octets`);
  }
});
