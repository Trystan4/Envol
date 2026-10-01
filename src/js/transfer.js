// Copy of the progress from one device to another by QR codes, with no file and no server.
// The save is packed (compact JSON, times to the minute), compressed (deflate), written in Base45 (the
// alphabet of the QR alphanumeric mode, 3 characters for 2 bytes), checked by a CRC-32, then cut into
// numbered codes that the screen shows in turn (a single one when it fits). The other device films them,
// keeps each one once, and rebuilds the save only when every code arrived and the check matches. Pure (no
// DOM); compression uses CompressionStream, present in browsers and in Node.

import { capacityOf, versionFor } from "./qr.js";
import { QR_MAX_VERSION, QR_SINGLE_MAX_VERSION } from "./config.js";

export const FRAME_TAG = "EV1"; // Envol transfer, format 1
const FRAME = /^EV1:([0-9A-Z]{4}):(\d{1,3}):(\d{1,3}):(.*)$/s;

/* ---------- Packing: the save in a compact form ---------- */

const MINUTE = 60e3;

// Times become minutes after the earliest one; cards, scores and history become arrays.
export function packSave(save) {
  const times = [];
  for (const c of Object.values(save.cards)) times.push(c.firstSeen, c.due);
  for (const t of [...save.tests, ...save.reviews]) times.push(t.at);
  const base = times.length ? Math.floor(Math.min(...times) / MINUTE) : 0;
  const m = t => t === null || t === undefined ? null : Math.round(t / MINUTE) - base;
  return {
    v: 2, b: base, e: save.examDate,
    c: Object.entries(save.cards).map(([id, c]) => [id, c.level, m(c.due), c.seen, c.correct, m(c.firstSeen), m(c.lastWrong), m(c.boostUntil)]),
    t: save.tests.map(t => [m(t.at), t.correct, t.total, Object.entries(t.byTheme).map(([k, s]) => [k, s.correct, s.total])]),
    r: save.reviews.map(r => [m(r.at), r.correct, r.total]),
    f: Object.entries(save.flags).map(([id, f]) => [id, f.review ? 1 : 0, f.dispute ? 1 : 0, f.note ?? null, f.answer ?? null]),
    a: save.activity, x: save.lastExport, tt: save.timedTests,
    d: [save.display.largeText ? 1 : 0, save.display.theme],
    h: save.history.map(h => [h.day, h.mastered, h.learning, h.total]),
  };
}

// The save again, from packSave(). Throws on a malformed object; the result still goes through
// validateSave (storage.js) before anything is kept.
export function unpackSave(p) {
  if (!p || p.v !== 2 || !Array.isArray(p.c)) throw new Error("copie illisible");
  const t = x => x === null || x === undefined ? null : (x + p.b) * MINUTE;
  const cards = {};
  for (const [id, level, due, seen, correct, firstSeen, lastWrong, boostUntil] of p.c) {
    cards[id] = { level, due: t(due), seen, correct, firstSeen: t(firstSeen), lastWrong: t(lastWrong) };
    if (boostUntil !== null && boostUntil !== undefined) cards[id].boostUntil = t(boostUntil);
  }
  const flags = {};
  for (const [id, review, dispute, note, answer] of p.f) {
    flags[id] = { review: !!review, dispute: !!dispute };
    if (note !== null) flags[id].note = note;
    if (answer !== null) flags[id].answer = answer;
  }
  return {
    version: 2, examDate: p.e, cards,
    tests: p.t.map(([at, correct, total, byTheme]) => ({ at: t(at), correct, total, byTheme: Object.fromEntries(byTheme.map(([k, c, n]) => [k, { correct: c, total: n }])) })),
    reviews: p.r.map(([at, correct, total]) => ({ at: t(at), correct, total })),
    flags, activity: p.a, lastExport: p.x, timedTests: p.tt,
    display: { largeText: !!p.d[0], theme: p.d[1] },
    history: p.h.map(([day, mastered, learning, total]) => ({ day, mastered, learning, total })),
  };
}

/* ---------- Base45 (RFC 9285) and CRC-32 ---------- */

const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function toBase45(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      out += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
    } else out += B45[bytes[i] % 45] + B45[Math.floor(bytes[i] / 45)];
  }
  return out;
}

// The bytes, or null when the text is not Base45.
export function fromBase45(text) {
  if (text.length % 3 === 1) return null;
  const out = [];
  for (let i = 0; i < text.length; i += 3) {
    const d = [...text.slice(i, i + 3)].map(c => B45.indexOf(c));
    if (d.includes(-1)) return null;
    const n = d[0] + d[1] * 45 + (d.length === 3 ? d[2] * 2025 : 0);
    if (d.length === 3) { if (n > 0xffff) return null; out.push(n >> 8, n & 255); } else { if (n > 255) return null; out.push(n); }
  }
  return Uint8Array.from(out);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ c >>> 8;
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- Compression ---------- */

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
export const canTransfer = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

/* ---------- Codes ---------- */

// Characters of data per code: what the largest version holds, less the header "EV1:ABCD:12:34:".
export const FRAME_DATA = capacityOf(QR_MAX_VERSION) - 16;

// The texts of the codes for `save`: a single one when it fits in QR_SINGLE_MAX_VERSION. id: 4 characters
// naming this copy, so codes of two different copies are never mixed.
export async function encodeFrames(save, id) {
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(packSave(save))), new CompressionStream("deflate-raw"));
  const crc = crc32(packed);
  const bytes = new Uint8Array(packed.length + 4);
  bytes.set(packed);
  bytes.set([crc >>> 24, crc >>> 16 & 255, crc >>> 8 & 255, crc & 255], packed.length);
  const text = toBase45(bytes);
  const whole = `${FRAME_TAG}:${id}:1:1:${text}`, version = versionFor(whole);
  if (version && version <= QR_SINGLE_MAX_VERSION) return [whole];
  const count = Math.ceil(text.length / FRAME_DATA);
  return Array.from({ length: count }, (_, i) => `${FRAME_TAG}:${id}:${i + 1}:${count}:${text.slice(i * FRAME_DATA, (i + 1) * FRAME_DATA)}`);
}

// A random name for a copy (4 characters).
export const transferId = (rng = Math.random) => Array.from({ length: 4 }, () => B45[Math.floor(rng() * 36)]).join("");

// The codes received so far: { id, count, parts: [text or undefined] }. Takes one code read by the
// camera and returns the new state (a code of another copy starts over, anything else is ignored).
export function collect(state, text) {
  const m = FRAME.exec(text || "");
  if (!m) return state;
  const [, id, i, n, data] = m;
  const index = Number(i) - 1, count = Number(n);
  if (count < 1 || index < 0 || index >= count) return state;
  const same = state && state.id === id && state.count === count;
  const parts = same ? state.parts.slice() : new Array(count).fill(undefined);
  parts[index] = data;
  return { id, count, parts };
}

export const received = state => state ? state.parts.filter(p => p !== undefined).length : 0;
export const complete = state => !!state && received(state) === state.count;

// The save carried by a complete set of codes. Throws when the codes do not make a valid copy (damaged,
// or not an Envol copy): the check (CRC-32) must match before anything is decompressed.
export async function assemble(state) {
  const bytes = fromBase45(state.parts.join(""));
  if (!bytes || bytes.length < 5) throw new Error("copie abîmée");
  const packed = bytes.slice(0, -4), end = bytes.length - 4;
  const crc = (bytes[end] << 24 | bytes[end + 1] << 16 | bytes[end + 2] << 8 | bytes[end + 3]) >>> 0;
  if (crc32(packed) !== crc) throw new Error("copie abîmée");
  const json = new TextDecoder().decode(await pipe(packed, new DecompressionStream("deflate-raw")));
  return unpackSave(JSON.parse(json));
}
