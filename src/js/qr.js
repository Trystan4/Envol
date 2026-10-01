// QR codes written by hand (no library), for the copy that goes from one phone to another (transfer.js).
// This file draws them, and holds what the reader (qrscan.js) shares with it: the module layout and the
// Reed-Solomon arithmetic. Only what Envol needs: alphanumeric mode (the 45 characters below), error
// correction level M (about 15 % of the code can be damaged), versions 1 to 40. Pure.

export const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

// Level M, by version (1 to 40): error correction codewords per block, then for each group of blocks
// [number of blocks, data codewords per block]. From ISO/IEC 18004, table 9.
const BLOCKS_M = [
  [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27], [18, 4, 31], [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37], [26, 4, 43, 1, 44], [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41], [24, 5, 41, 5, 42], [28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45], [26, 3, 41, 13, 42], [26, 17, 42], [28, 17, 46], [28, 4, 47, 14, 48], [28, 6, 45, 14, 46],
  [28, 8, 47, 13, 48], [28, 19, 46, 4, 47], [28, 22, 45, 3, 46], [28, 3, 45, 23, 46], [28, 21, 45, 7, 46],
  [28, 19, 47, 10, 48], [28, 2, 46, 29, 47], [28, 10, 46, 23, 47], [28, 14, 46, 21, 47], [28, 14, 46, 23, 47],
  [28, 12, 47, 26, 48], [28, 6, 47, 34, 48], [28, 29, 46, 14, 47], [28, 13, 46, 32, 47], [28, 40, 47, 7, 48],
  [28, 18, 47, 31, 48],
];
export const LEVEL_M = 0; // the two bits of level M in the format information

export const sizeOf = version => 17 + 4 * version;

// { ec: error correction codewords per block, blocks: data codewords of each block }.
export function blocksOf(version) {
  const [ec, ...groups] = BLOCKS_M[version - 1];
  const blocks = [];
  for (let i = 0; i < groups.length; i += 2) for (let k = 0; k < groups[i]; k++) blocks.push(groups[i + 1]);
  return { ec, blocks };
}
const dataCodewords = version => blocksOf(version).blocks.reduce((a, b) => a + b, 0);

// Bits of the character count, alphanumeric mode.
export const countBits = version => version < 10 ? 9 : version < 27 ? 11 : 13;

/* ---------- Reed-Solomon over GF(256), polynomial x⁸ + x⁴ + x³ + x² + 1 ---------- */

export const EXP = new Uint8Array(512);
export const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = EXP[i + 255] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 256) x ^= 0x11d;
}
export const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;

// Error correction codewords of `data` (the remainder of data·xⁿ divided by ∏ (x − αⁱ), i < n).
export function rsEncode(data, n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  const rest = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ rest.shift();
    rest.push(0);
    for (let j = 0; j < n; j++) rest[j] ^= mul(g[j + 1], factor);
  }
  return rest;
}

/* ---------- Layout ---------- */

// Centres of the alignment patterns, on each axis.
export function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2, size = sizeOf(version);
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

// The 15 bits of the format information (level, mask), and the 18 bits of the version (7 and up).
export function formatBits(level, mask) {
  const data = level << 3 | mask;
  let rest = data;
  for (let i = 0; i < 10; i++) rest = rest << 1 ^ (rest >> 9) * 0x537;
  return (data << 10 | rest) ^ 0x5412;
}
export function versionBits(version) {
  let rest = version;
  for (let i = 0; i < 12; i++) rest = rest << 1 ^ (rest >> 11) * 0x1f25;
  return version << 12 | rest;
}

// Where the two copies of the format bits go (bit i of each copy at [x, y]).
export function formatCells(size) {
  const first = [], second = [];
  for (let i = 0; i < 15; i++) {
    first.push(i < 6 ? [8, i] : i < 8 ? [8, i + 1] : i === 8 ? [7, 8] : [14 - i, 8]);
    second.push(i < 8 ? [size - 1 - i, 8] : [8, size - 15 + i]);
  }
  return [first, second];
}

// The fixed parts of a symbol: finders, timing, alignment, format and version areas. Returns
// { fn: 1 where a module is part of them, dark: their colour }, each size × size, row by row.
export function functionPatterns(version) {
  const size = sizeOf(version);
  const fn = new Uint8Array(size * size), dark = new Uint8Array(size * size);
  const set = (x, y, d) => { fn[y * size + x] = 1; dark[y * size + x] = d ? 1 : 0; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const align = alignmentPositions(version), last = align.length - 1;
  align.forEach((cx, i) => align.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; // under a finder
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  for (const copy of formatCells(size)) for (const [x, y] of copy) set(x, y, false); // filled in later
  set(8, size - 8, true); // always dark
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + i % 3, b = Math.floor(i / 3), d = bits >> i & 1;
      set(a, b, d); set(b, a, d);
    }
  }
  return { fn, dark };
}

// The data modules in reading order: two columns at a time from the right, up then down, skipping
// the vertical timing line and the fixed parts.
export function dataCells(version, fn) {
  const size = sizeOf(version), out = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = (right + 1 & 2) === 0;
    for (let v = 0; v < size; v++) {
      const y = upward ? size - 1 - v : v;
      for (const x of [right, right - 1]) if (!fn[y * size + x]) out.push(y * size + x);
    }
  }
  return out;
}

// The eight masks: true where a data module is flipped. x: column, y: row.
export const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => x * y % 2 + x * y % 3 === 0,
  (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
];

/* ---------- Encoding ---------- */

// Data codewords and error correction, interleaved block by block as the symbol stores them.
function codewords(text, version) {
  const bits = [];
  const put = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push(value >> i & 1); };
  put(0b0010, 4);
  put(text.length, countBits(version));
  for (let i = 0; i < text.length; i += 2) {
    const a = ALPHANUMERIC.indexOf(text[i]);
    if (i + 1 < text.length) put(a * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11); else put(a, 6);
  }
  const capacity = dataCodewords(version) * 8;
  put(0, Math.min(4, capacity - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
  for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);

  const { ec, blocks } = blocksOf(version);
  const split = [];
  let at = 0;
  for (const n of blocks) { split.push(data.slice(at, at + n)); at += n; }
  const checks = split.map(b => rsEncode(b, ec));
  const out = [];
  for (let i = 0; i < Math.max(...blocks); i++) for (const b of split) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const c of checks) out.push(c[i]);
  return out;
}

const bitsNeeded = (text, version) => 4 + countBits(version) + Math.floor(text.length / 2) * 11 + text.length % 2 * 6;

// The smallest version (from minVersion) that holds `text`, or null when even version 40 is too small.
export function versionFor(text, minVersion = 1) {
  for (let v = minVersion; v <= 40; v++) if (bitsNeeded(text, v) <= dataCodewords(v) * 8) return v;
  return null;
}

// How many characters a version holds.
export const capacityOf = version => {
  const free = dataCodewords(version) * 8 - 4 - countBits(version);
  return Math.floor(free / 11) * 2 + (free % 11 >= 6 ? 1 : 0);
};

// Penalty of a finished symbol (ISO/IEC 18004, 7.8.3): the mask with the lowest one is kept.
function penalty(m, size) {
  let score = 0;
  const at = (x, y) => m[y * size + x];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 0, last = -1, line = "";
      for (let b = 0; b < size; b++) {
        const v = pass ? at(a, b) : at(b, a);
        line += v;
        if (v === last) run++; else { if (run >= 5) score += run - 2; run = 1; last = v; }
      }
      if (run >= 5) score += run - 2;
      for (const p of ["10111010000", "00001011101"]) for (let i = line.indexOf(p); i >= 0; i = line.indexOf(p, i + 1)) score += 40;
    }
  }
  let darkCount = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    darkCount += at(x, y);
    if (x < size - 1 && y < size - 1) {
      const v = at(x, y);
      if (v === at(x + 1, y) && v === at(x, y + 1) && v === at(x + 1, y + 1)) score += 3;
    }
  }
  return score + Math.floor(Math.abs(darkCount * 20 - size * size * 10) / (size * size)) * 10;
}

// A QR code holding `text` (alphanumeric characters only), level M. mask: 0 to 7, or chosen.
// Returns { version, size, mask, modules: 1 for dark, size × size row by row }.
export function encodeQR(text, { minVersion = 1, mask = null } = {}) {
  if ([...text].some(c => !ALPHANUMERIC.includes(c))) throw new Error("caractère hors de l'alphabet du QR code");
  const version = versionFor(text, minVersion);
  if (!version) throw new Error("texte trop long pour un QR code");
  const size = sizeOf(version);
  const { fn, dark } = functionPatterns(version);
  const cells = dataCells(version, fn);
  const words = codewords(text, version);
  const build = k => {
    const m = dark.slice();
    cells.forEach((cell, i) => {
      const bit = i < words.length * 8 ? words[i >> 3] >> 7 - (i & 7) & 1 : 0;
      m[cell] = bit ^ (MASKS[k](cell % size, Math.floor(cell / size)) ? 1 : 0);
    });
    const f = formatBits(LEVEL_M, k);
    for (const copy of formatCells(size)) copy.forEach(([x, y], i) => { m[y * size + x] = f >> i & 1; });
    return m;
  };
  let best = null;
  for (const k of mask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask]) {
    const modules = build(k), score = mask === null ? penalty(modules, size) : 0;
    if (!best || score < best.score) best = { version, size, mask: k, modules, score };
  }
  delete best.score;
  return best;
}
