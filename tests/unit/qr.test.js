// QR codes written and read by hand (qr.js, qrscan.js), and the copy to another device (transfer.js).
// The encoder was checked module for module against an independent one (segno) for versions 1 to 40, at
// levels M and Q; these tests keep it that way through the round trip, on pictures as a phone camera takes
// them, with the logo in the middle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeQR, versionFor, capacityOf, rsEncode, sizeOf, alignmentPositions, formatBits, ALPHANUMERIC } from "../../src/js/qr.js";
import { decodeImage, readGrid, rsCorrect } from "../../src/js/qrscan.js";
import { packSave, unpackSave, toBase45, fromBase45, crc32, encodeFrames, collect, complete, received, assemble, FRAME_DATA, transferId } from "../../src/js/transfer.js";
import { validateSave } from "../../src/js/storage.js";
import { QR_MAX_VERSION, QR_SINGLE_MAX_VERSION } from "../../src/js/config.js";
import { createRng } from "../../src/js/util.js";
import { NOW, DAY, card, saveWith } from "./helpers.js";

const rng = createRng(42);
const text = n => Array.from({ length: n }, () => ALPHANUMERIC[Math.floor(rng() * 45)]).join("");

test("QR : tailles et tables de la norme", () => {
  assert.equal(sizeOf(1), 21);
  assert.equal(sizeOf(40), 177);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]); // the irregular one
  assert.equal(formatBits(0, 0), 0b101010000010010); // level M, mask 0 (ISO/IEC 18004, annex C)
  assert.equal(formatBits(3, 0), 0b011010101011111); // level Q, mask 0
  assert.equal(capacityOf(1, "M"), 20); // version 1-M: 20 alphanumeric characters
  assert.equal(capacityOf(15, "M"), 600);
  assert.equal(capacityOf(1), 16); // version 1-Q, what Envol writes
  assert.equal(capacityOf(15), 426);
  assert.equal(capacityOf(40), 2420);
  assert.equal(versionFor("A".repeat(16)), 1);
  assert.equal(versionFor("A".repeat(17)), 2);
  assert.equal(versionFor("A".repeat(20), "M"), 1);
  assert.throws(() => encodeQR("minuscules"), /alphabet/);
});

test("QR : Reed-Solomon corrige jusqu'à la moitié des codes de contrôle, et refuse au-delà", () => {
  const data = Array.from({ length: 40 }, () => Math.floor(rng() * 256));
  const block = data.concat(rsEncode(data, 18));
  for (let errors = 0; errors <= 10; errors++) {
    const b = block.slice();
    for (let i = 0; i < errors; i++) b[(i * 7 + 3) % b.length] ^= 1 + i;
    assert.equal(rsCorrect(b, 18) && b.every((v, i) => v === block[i]), errors <= 9, `${errors} erreurs`);
  }
});

test("QR : écrit puis relu, de la version 1 à 40, aux niveaux Q et M (les codes d'Envol 2.7)", () => {
  for (const level of ["Q", "M"]) for (const n of [1, 20, 100, 600, 1500, capacityOf(40, level)]) {
    const t = text(n), q = encodeQR(t, { level });
    assert.equal(readGrid(q.modules, q.version), t, `${n} caractères, niveau ${level}, version ${q.version}`);
  }
});

// Every module under the logo turned to its opposite: the worst a logo can do.
const underLogo = q => {
  const m = q.modules.slice(), { from, side } = q.logo;
  for (let y = from; y < from + side; y++) for (let x = from; x < from + side; x++) m[y * q.size + x] ^= 1;
  return { ...q, modules: m };
};

test("QR : le logo couvre un quart du côté, et le code se relit même si tout ce qu'il cache est faux", () => {
  for (let v = 3; v <= QR_SINGLE_MAX_VERSION; v++) {
    const t = text(capacityOf(v)), q = encodeQR(t);
    assert.equal(q.version, v);
    if (v >= 5) assert.ok(q.logo.side / q.size >= 0.2 && q.logo.side / q.size <= 0.27, `version ${v} : ${q.logo.side} modules sur ${q.size}`);
    assert.equal(readGrid(underLogo(q).modules, v), t, `version ${v}`);
  }
  assert.equal(encodeQR("A").logo, null); // too small a code for a logo
  assert.equal(encodeQR("A", { level: "M" }).logo, null);
});

// A camera picture of `q` as the screen shows it (the logo: a light margin, then dark with light lines):
// quiet zone, `px` pixels per module, turned by `angle`, seen at an angle (`tilt`,
// a true perspective), blurred, with noise and uneven light. Grey, one byte per pixel.
function photo(q, { px = 5, angle = 0, tilt = 0, contrast = 1, noise = 8 }) {
  if (q.logo) {
    const m = q.modules.slice(), { from, side } = q.logo, last = side - 1;
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      m[(from + y) * q.size + from + x] = x === 0 || y === 0 || x === last || y === last || x === last - y || y === last - 2 ? 0 : 1;
    }
    q = { ...q, modules: m };
  }
  const n = q.size + 8, side = n * px, W = Math.ceil(side * 1.6), H = W;
  const ca = Math.cos(angle), sa = Math.sin(angle), g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - W / 2, dy = y - H / 2, u0 = dx * ca + dy * sa, v0 = -dx * sa + dy * ca, z = 1 + tilt * v0 / side;
    const u = u0 / z / side * n + n / 2, v = v0 / z / side * n + n / 2, mx = Math.floor(u) - 4, my = Math.floor(v) - 4;
    const dark = mx >= 0 && my >= 0 && mx < q.size && my < q.size && q.modules[my * q.size + mx];
    g[y * W + x] = (128 + ((dark ? 40 : 215) - 128) * contrast) * (1 - 0.3 * x / W);
  }
  const img = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, k = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (g[(y + j) * W + x + i] !== undefined) { s += g[(y + j) * W + x + i]; k++; }
    img[y * W + x] = s / k + (rng() - 0.5) * 2 * noise;
  }
  return { img, W, H };
}

test("QR : lu sur une photo tournée, prise de biais, floue, avec reflet et bruit, logo compris", () => {
  const cases = [
    { px: 5 }, { px: 4, angle: 0.2 }, { px: 5, angle: -0.6, tilt: 0.1 }, { px: 5, angle: 1.5, tilt: 0.12 },
    { px: 5, angle: 3, tilt: 0.15 }, { px: 5, angle: 0.4, contrast: 0.35 }, { px: 5, angle: -1, noise: 20, contrast: 0.7 },
  ];
  for (const c of cases) {
    const t = text(capacityOf(QR_MAX_VERSION)), q = encodeQR(t);
    const { img, W, H } = photo(q, c);
    assert.equal(decodeImage(img, W, H), t, JSON.stringify(c));
  }
  // The single code, larger: its version is read in its version bits (blur makes its finders look larger).
  for (const c of [{ px: 4, angle: 0.2 }, { px: 5, angle: -0.6, tilt: 0.1 }, { px: 3.5, angle: -0.5, tilt: 0.15 }, { px: 5, angle: -1, noise: 20, contrast: 0.7 }, { px: 3, angle: 0.8, tilt: 0.1, contrast: 0.6 }]) {
    const t = text(capacityOf(QR_SINGLE_MAX_VERSION)), q = encodeQR(t);
    const { img, W, H } = photo(q, c);
    assert.equal(decodeImage(img, W, H), t, `code unique ${JSON.stringify(c)}`);
  }
});

test("QR : rien à lire sur une photo sans code", () => {
  const W = 300, img = new Uint8ClampedArray(W * W).map(() => 128 + (rng() - 0.5) * 60);
  assert.equal(decodeImage(img, W, W), null);
});

/* ---------- Copy to another device ---------- */

const fullSave = () => saveWith({
  "t0-q0": card({ level: 3, due: NOW + 2 * DAY + 1234 }),
  "t0-q1": card({ level: 0, lastWrong: NOW - 3600e3, boostUntil: NOW + 3 * DAY }),
}, {
  examDate: "2026-11-15",
  tests: [{ at: NOW - DAY, correct: 15, total: 20, byTheme: { "Thème 0": { correct: 3, total: 4 } } }],
  reviews: [{ at: NOW, correct: 12, total: 15 }],
  flags: { "t0-q1": { review: true, dispute: true, note: "La page dit « autre chose ».", answer: "bonne" } },
  activity: ["2026-09-30", "2026-10-01"], lastExport: NOW - 5 * DAY, timedTests: false,
  display: { largeText: true, theme: "dark" },
  history: [{ day: "2026-09-30", mastered: 1, learning: 1, total: 2 }],
});

// Times are kept to the minute.
const toMinute = save => JSON.parse(JSON.stringify(save, (k, v) => ["due", "firstSeen", "lastWrong", "boostUntil", "at"].includes(k) && v !== null ? Math.round(v / 60e3) * 60e3 : v));

test("copie par QR : la sauvegarde emballée puis déballée est la même, à la minute près", () => {
  const save = fullSave();
  const back = unpackSave(JSON.parse(JSON.stringify(packSave(save))));
  assert.equal(validateSave(back), null);
  assert.deepEqual(back, toMinute(save));
});

test("copie par QR : Base45 et CRC-32 suivent leurs normes", () => {
  assert.equal(toBase45(new TextEncoder().encode("AB")), "BB8"); // RFC 9285, 4.3
  assert.equal(toBase45(new TextEncoder().encode("Hello!!")), "%69 VD92EX0");
  assert.equal(new TextDecoder().decode(fromBase45("QED8WEX0")), "ietf!");
  assert.equal(fromBase45("GGW"), null); // 65536: too large
  assert.equal(fromBase45("a"), null);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("copie par QR : une petite progression tient dans un seul code, au logo", async () => {
  const save = fullSave();
  const frames = await encodeFrames(save, "AB12");
  assert.equal(frames.length, 1);
  const q = encodeQR(frames[0]);
  assert.ok(q.version <= QR_SINGLE_MAX_VERSION && q.logo, `version ${q.version}`);
  const state = collect(null, readGrid(underLogo(q).modules, q.version));
  assert.ok(complete(state));
  assert.deepEqual(await assemble(state), toMinute(save));
});

test("copie par QR : les codes arrivent dans le désordre, en double, mêlés à d'autres : la copie est entière", async () => {
  const save = fullSave();
  for (let i = 0; i < 300; i++) save.cards[`theme-${i}`] = card({ level: i % 6, due: NOW + i * 1e6, seen: 5, correct: i % 5 });
  const frames = await encodeFrames(save, transferId(rng));
  assert.ok(frames.length > 2, `${frames.length} codes`);
  for (const f of frames) assert.ok(f.length <= FRAME_DATA + 16 && encodeQR(f).version <= QR_MAX_VERSION, "code trop grand");
  let state = collect(null, "un autre QR code");
  state = collect(state, "EV1:ZZZZ:1:9:AUTRE COPIE"); // another copy seen first: dropped when this one starts
  const order = [0, 0, ...[...frames.keys()].slice(1).reverse()]; // the first one twice, then the others backwards
  for (const k of order) {
    assert.equal(complete(state), false);
    if (state && state.id !== "ZZZZ") await assert.rejects(assemble(state), /abîmée/); // a code missing: nothing is rebuilt
    state = collect(state, frames[k]);
  }
  state = collect(state, frames[1]); // seen again once complete: nothing changes
  assert.equal(received(state), frames.length);
  assert.ok(complete(state));
  const back = await assemble(state);
  assert.equal(validateSave(back), null);
  assert.deepEqual(back, toMinute(save));
});

test("copie par QR : un code abîmé fait refuser la copie entière", async () => {
  const frames = await encodeFrames(fullSave(), "AB12");
  let state = null;
  for (const f of frames) state = collect(state, f);
  const last = state.parts.length - 1, part = state.parts[last];
  const broken = { ...state, parts: [...state.parts.slice(0, last), (part[0] === "0" ? "1" : "0") + part.slice(1)] };
  await assert.rejects(assemble(broken), /abîmée/);
});
