// Reading a QR code in a camera picture, written by hand: iPhone browsers have no QR reader of their own
// (BarcodeDetector), and Envol takes no library. Reads what qr.js draws: levels Q and M, any version, and
// the numeric, alphanumeric and byte modes; the error correction puts right what the logo hides. Pure: a
// grey picture in, the text out (or null).
//
// 1. Black and white: each pixel against the mean of its neighbourhood (light and shade vary across a photo).
// 2. The three finder squares: runs dark-light-dark-light-dark in the ratio 1:1:3:1:1, across, down and
//    on the diagonal; the corners of the code are the three seen most often, at a right angle.
// 3. The version, read in its 18 bits beside two finders (7 and up), or counted on the timing lines. The
//    fourth corner from the perspective the finders' sizes show, then the alignment square near it, so a
//    picture taken at an angle lines up.
// 4. One sample per module, then the format, the Reed-Solomon correction and the text.
// Checked on camera-like pictures in tests/unit/qr.test.js (turned, at an angle, blurred, glare, noise).

import { sizeOf, blocksOf, countBits, functionPatterns, dataCells, formatCells, formatBits, versionBits, MASKS, LEVEL_BITS, EXP, LOG, mul, ALPHANUMERIC } from "./qr.js";

/* ---------- 1. Black and white ---------- */

// 1 for dark: darker than the mean of a window around it (about an eighth of the picture) by 10 %. The
// margin keeps the noise of a plain background from turning into specks.
export function binarize(gray, w, h) {
  const sums = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sums[(y + 1) * (w + 1) + x + 1] = sums[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 16));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = sums[y1 * (w + 1) + x1] - sums[y0 * (w + 1) + x1] - sums[y1 * (w + 1) + x0] + sums[y0 * (w + 1) + x0];
      out[y * w + x] = gray[y * w + x] * (x1 - x0) * (y1 - y0) < sum * 0.9 ? 1 : 0;
    }
  }
  return out;
}

/* ---------- 2. Finder squares ---------- */

// Five run lengths in the ratio 1:1:3:1:1. A blurred picture thins the light rings and thickens the dark
// ones, so each run may be off by 70 % of a module (the centre by 1.5 module).
function finderRatio(c) {
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (total < 7 || !c.every(Boolean)) return false;
  const m = total / 7, tol = m * 0.7;
  return Math.abs(c[0] - m) < tol && Math.abs(c[1] - m) < tol && Math.abs(c[2] - 3 * m) < m * 1.5
    && Math.abs(c[3] - m) < tol && Math.abs(c[4] - m) < tol;
}

// From (x, y), the five runs along (dx, dy) centred on the dark centre: returns the centre position
// along that line and the total width, or null when the runs are not a finder square.
function crossCheck(bin, w, h, x, y, dx, dy, maxTotal) {
  const at = (k) => { const px = x + dx * k, py = y + dy * k; return px < 0 || py < 0 || px >= w || py >= h ? -1 : bin[py * w + px]; };
  if (at(0) !== 1) return null;
  const c = [0, 0, 0, 0, 0];
  let k = 0;
  while (at(k) === 1) { c[2]++; k--; }
  while (at(k) === 0) { c[1]++; k--; }
  while (at(k) === 1) { c[0]++; k--; }
  k = 1;
  while (at(k) === 1) { c[2]++; k++; }
  while (at(k) === 0) { c[3]++; k++; }
  while (at(k) === 1) { c[4]++; k++; }
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (!finderRatio(c) || total > maxTotal) return null;
  // Centre of the dark centre run, relative to (x, y): its far end minus half its length.
  const end = k - c[4] - c[3]; // first step past the centre run
  return { offset: end - c[2] / 2 - 0.5, total };
}

export function findFinders(bin, w, h) {
  const found = [];
  const step = h > 400 ? 2 : 1;
  for (let y = 0; y < h; y += step) {
    // Runs of the row: [start, length, colour].
    const runs = [];
    for (let x = 0; x < w;) {
      const v = bin[y * w + x];
      let n = 0;
      while (x + n < w && bin[y * w + x + n] === v) n++;
      runs.push([x, n, v]);
      x += n;
    }
    for (let i = 0; i + 4 < runs.length; i++) {
      if (runs[i][2] !== 1) continue;
      const c = [runs[i][1], runs[i + 1][1], runs[i + 2][1], runs[i + 3][1], runs[i + 4][1]];
      if (!finderRatio(c)) continue;
      const total = c.reduce((a, b) => a + b, 0);
      let cx = Math.round(runs[i + 2][0] + runs[i + 2][1] / 2 - 0.5);
      const down = crossCheck(bin, w, h, cx, y, 0, 1, total * 2);
      if (!down) continue;
      const cy = Math.round(y + down.offset);
      const across = crossCheck(bin, w, h, cx, cy, 1, 0, total * 2);
      if (!across) continue;
      const fx = cx + across.offset;
      cx = Math.round(fx);
      const again = crossCheck(bin, w, h, cx, cy, 0, 1, total * 2);
      if (!again) continue;
      // The data area holds such runs by chance across and down; a real finder has them on the diagonal too.
      if (!crossCheck(bin, w, h, cx, Math.round(cy + again.offset), 1, 1, total * 3)) continue;
      const fy = cy + again.offset, size = (across.total + again.total) / 14;
      const near = found.find(f => Math.abs(f.x - fx) <= f.size * 2 && Math.abs(f.y - fy) <= f.size * 2 && Math.abs(f.size - size) <= Math.max(1, f.size * 0.5));
      if (near) {
        const n = near.count;
        near.x = (near.x * n + fx) / (n + 1); near.y = (near.y * n + fy) / (n + 1); near.size = (near.size * n + size) / (n + 1);
        near.count++;
      } else found.push({ x: fx, y: fy, size, count: 1 });
    }
  }
  return found;
}

// Triples of finder squares that can be the corners of one code, most likely first:
// { tl, tr, bl } (top-left at the right angle, top-right on its right in reading order).
function triples(found) {
  const pool = found.slice().sort((a, b) => b.count - a.count).slice(0, 10);
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const out = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) for (let k = j + 1; k < pool.length; k++) {
    const p = [pool[i], pool[j], pool[k]];
    const sizes = p.map(f => f.size);
    if (Math.max(...sizes) / Math.min(...sizes) > 1.6) continue;
    // The top-left corner is opposite the longest side.
    const sides = [[d2(p[1], p[2]), 0], [d2(p[0], p[2]), 1], [d2(p[0], p[1]), 2]].sort((a, b) => b[0] - a[0]);
    const tl = p[sides[0][1]], [a, b] = p.filter(f => f !== tl);
    const [long, s1, s2] = sides.map(s => s[0]);
    const angle = Math.abs(s1 + s2 - long) / long, square = Math.abs(Math.sqrt(s1) - Math.sqrt(s2)) / Math.sqrt(Math.max(s1, s2));
    if (angle > 0.4 || square > 0.4) continue;
    const cross = (a.x - tl.x) * (b.y - tl.y) - (a.y - tl.y) * (b.x - tl.x);
    const [tr, bl] = cross > 0 ? [a, b] : [b, a];
    const modules = Math.sqrt(Math.max(s1, s2)) / ((tl.size + tr.size + bl.size) / 3);
    // Finders seen on many rows first (chance patterns are seen once or twice), then the best right angle.
    out.push({ tl, tr, bl, modules, score: angle + square + 2 / Math.min(tl.count, tr.count, bl.count) });
  }
  return out.sort((x, y) => x.score - y.score);
}

/* ---------- 3. Perspective ---------- */

// The transform taking module coordinates (u, v) to the picture, from four matching points.
function homography(from, to) {
  const m = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = from[i], [x, y] = to[i];
    m.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    m.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 9; k++) m[r][k] -= f * m[c][k];
    }
  }
  const h = m.map((row, i) => row[8] / row[i]);
  return (u, v) => {
    const z = h[6] * u + h[7] * v + 1;
    return [(h[0] * u + h[1] * v + h[2]) / z, (h[3] * u + h[4] * v + h[5]) / z];
  };
}

// The alignment square nearest to where it should be (`guess`, in module coordinates): the best match
// of its 5 × 5 pattern, searched within 4 modules, then further out (a picture taken at an angle moves
// it) with a stricter match, since a wide area of data can hold a near pattern by chance. Or null.
function findAlignment(bin, w, h, map, guess) {
  const [gx, gy] = map(guess, guess);
  const [ax, ay] = map(guess + 1, guess), [bx, by] = map(guess, guess + 1);
  const ux = [ax - gx, ay - gy], uy = [bx - gx, by - gy];
  const module = Math.hypot(...ux);
  const score = (px, py) => {
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const sx = Math.round(px + dx * ux[0] + dy * uy[0]), sy = Math.round(py + dx * ux[1] + dy * uy[1]);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h && bin[sy * w + sx] === (Math.max(Math.abs(dx), Math.abs(dy)) !== 1 ? 1 : 0)) n++;
    }
    return n;
  };
  for (const [reach, needed] of [[4, 22], [10, 24]]) {
    const r = Math.ceil(module * reach);
    let best = needed - 1, hits = [];
    for (let py = Math.round(gy) - r; py <= gy + r; py++) for (let px = Math.round(gx) - r; px <= gx + r; px++) {
      const n = score(px, py);
      if (n > best) { best = n; hits = [[px, py]]; } else if (n === best) hits.push([px, py]);
    }
    if (!hits.length) continue;
    // Equal matches side by side are the same square: their centre. Apart: the nearest to the guess.
    const near = hits.reduce((a, p) => Math.hypot(p[0] - gx, p[1] - gy) < Math.hypot(a[0] - gx, a[1] - gy) ? p : a);
    const group = hits.filter(p => Math.hypot(p[0] - near[0], p[1] - near[1]) <= module);
    return [group.reduce((s, p) => s + p[0], 0) / group.length, group.reduce((s, p) => s + p[1], 0) / group.length];
  }
  return null;
}

// Where the corner without a finder is, from the three finders and their apparent sizes: in a picture
// taken at an angle, the far side looks smaller. In a perspective transform the denominator w is linear
// in the module coordinates and the apparent size goes as w^(-3/2), so the sizes give w at the three
// finders, and with it the whole transform.
function fourthCorner(tl, tr, bl, size) {
  const span = size - 7, at = 3.5, end = size - 3.5;
  const w = f => (tl.size / f.size) ** (2 / 3);
  const g = (w(tr) - 1) / span, hh = (w(bl) - 1) / span, p = 1 - (g + hh) * at;
  const weight = (u, v) => p + g * u + hh * v;
  // x · w = a·u + b·v + c at the three finders, solved for a, b, c (and the same for y).
  const solve = k => {
    const [t, r, b] = [tl, tr, bl].map(f => f[k] * weight(...(f === tl ? [at, at] : f === tr ? [end, at] : [at, end])));
    const a = (r - t) / span, bb = (b - t) / span;
    return [a, bb, t - (a + bb) * at];
  };
  const [ax, bx, cx] = solve("x"), [ay, by, cy] = solve("y");
  const wb = weight(end, end);
  return [(ax * end + bx * end + cx) / wb, (ay * end + by * end + cy) / wb];
}

// The modules of a code of `version` placed by its three finders (and its alignment square when found).
function sample(bin, w, h, { tl, tr, bl }, version) {
  const size = sizeOf(version);
  const corners = [[3.5, 3.5], [size - 3.5, 3.5], [3.5, size - 3.5]];
  const points = [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y]];
  // Fourth corner from the perspective the finders show (see fourthCorner), refined by the alignment square.
  let map = homography([...corners, [size - 3.5, size - 3.5]], [...points, fourthCorner(tl, tr, bl, size)]);
  if (!map) return null;
  if (version > 1) {
    const align = findAlignment(bin, w, h, map, size - 6.5);
    if (align) map = homography([...corners, [size - 6.5, size - 6.5]], [...points, align]) || map;
  }
  const grid = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [px, py] = map(x + 0.5, y + 0.5);
    const ix = Math.round(px), iy = Math.round(py);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return null;
    grid[y * size + x] = bin[iy * w + ix];
  }
  return grid;
}

/* ---------- 4. Reading the modules ---------- */

const ones = n => { let c = 0; for (; n; n &= n - 1) c++; return c; };

// Corrects a block in place (data then error correction codewords). False when it cannot.
export function rsCorrect(block, n) {
  const len = block.length;
  const syn = [];
  let clean = true;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of block) s = mul(s, EXP[i]) ^ c;
    syn.push(s);
    if (s) clean = false;
  }
  if (clean) return true;
  // Berlekamp-Massey: the error locator, lowest degree first.
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let k = 0; k < n; k++) {
    let d = syn[k];
    for (let i = 1; i <= L; i++) d ^= mul(C[i] || 0, syn[k - i]);
    if (!d) { m++; continue; }
    const coef = EXP[(LOG[d] + 255 - LOG[b]) % 255];
    const next = C.slice();
    for (let i = 0; i < B.length; i++) next[i + m] = (next[i + m] || 0) ^ mul(coef, B[i]);
    if (2 * L <= k) { L = k + 1 - L; B = C; b = d; m = 1; } else m++;
    C = next;
  }
  const evalAt = (poly, x) => poly.reduceRight((acc, c) => mul(acc, x) ^ c, 0);
  // Error evaluator Ω = S·Λ mod xⁿ, and Λ' (the odd terms, one degree down).
  const omega = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < C.length && i + j < n; j++) omega[i + j] ^= mul(syn[i], C[j]);
  const deriv = C.map((c, i) => i % 2 ? c : 0).slice(1);
  let errors = 0;
  for (let p = 0; p < len; p++) {
    const xInv = EXP[(255 - p) % 255];
    if (evalAt(C, xInv)) continue;
    // Forney: the error value at this position is X · Ω(X⁻¹) / Λ'(X⁻¹), with X = αᵖ.
    const num = evalAt(omega, xInv), den = evalAt(deriv, xInv);
    if (!den) return false;
    block[len - 1 - p] ^= mul(EXP[p], num ? EXP[(LOG[num] + 255 - LOG[den]) % 255] : 0);
    errors++;
  }
  if (errors !== L) return false;
  for (let i = 0; i < n; i++) { let s = 0; for (const c of block) s = mul(s, EXP[i]) ^ c; if (s) return false; }
  return true;
}

// The text of a grid of modules (size × size, 1 for dark), or null.
export function readGrid(grid, version) {
  const size = sizeOf(version);
  // Format: the closest of the 32 valid patterns, from either copy, at most 3 bits off.
  let format = null, bestDist = 4;
  for (const copy of formatCells(size)) {
    const read = copy.reduce((acc, [x, y], i) => acc | grid[y * size + x] << i, 0);
    for (let level = 0; level < 4; level++) for (let mask = 0; mask < 8; mask++) {
      const dist = ones(read ^ formatBits(level, mask));
      if (dist < bestDist) { bestDist = dist; format = { level, mask }; }
    }
  }
  const level = format && Object.keys(LEVEL_BITS).find(k => LEVEL_BITS[k] === format.level);
  if (!level) return null;
  const { fn } = functionPatterns(version);
  const cells = dataCells(version, fn);
  const { ec, blocks } = blocksOf(version, level);
  const total = blocks.reduce((a, b) => a + b, 0) + ec * blocks.length;
  const words = new Uint8Array(total);
  for (let i = 0; i < total * 8; i++) {
    const cell = cells[i];
    const bit = grid[cell] ^ (MASKS[format.mask](cell % size, Math.floor(cell / size)) ? 1 : 0);
    words[i >> 3] |= bit << 7 - (i & 7);
  }
  // Undo the interleaving, correct each block.
  const split = blocks.map(n => ({ data: [], check: [], n }));
  let p = 0;
  for (let i = 0; i < Math.max(...blocks); i++) for (const b of split) if (i < b.n) b.data.push(words[p++]);
  for (let i = 0; i < ec; i++) for (const b of split) b.check.push(words[p++]);
  const data = [];
  for (const b of split) {
    const block = b.data.concat(b.check);
    if (!rsCorrect(block, ec)) return null;
    data.push(...block.slice(0, b.n));
  }
  return parseSegments(data, version);
}

function parseSegments(data, version) {
  let pos = 0;
  const read = n => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = v << 1 | (pos < data.length * 8 ? data[pos >> 3] >> 7 - (pos & 7) & 1 : 0);
    return v;
  };
  const left = () => data.length * 8 - pos;
  let text = "";
  while (left() >= 4) {
    const mode = read(4);
    if (mode === 0) break;
    if (mode === 2) {
      let count = read(countBits(version));
      for (; count >= 2; count -= 2) {
        const v = read(11);
        if (v >= 45 * 45) return null;
        text += ALPHANUMERIC[Math.floor(v / 45)] + ALPHANUMERIC[v % 45];
      }
      if (count) { const v = read(6); if (v >= 45) return null; text += ALPHANUMERIC[v]; }
    } else if (mode === 1) {
      let count = read(version < 10 ? 10 : version < 27 ? 12 : 14);
      for (; count >= 3; count -= 3) text += String(read(10)).padStart(3, "0");
      if (count === 2) text += String(read(7)).padStart(2, "0"); else if (count === 1) text += String(read(4));
    } else if (mode === 4) {
      const count = read(version < 10 ? 8 : 16);
      for (let i = 0; i < count; i++) text += String.fromCharCode(read(8));
    } else return null; // a mode Envol never writes
    if (left() < 0) return null;
  }
  return text;
}

// The version read on a timing line (the row or column of alternating modules joining two finders, three
// modules inside their centres): from one finder centre to the other it crosses 2 × version + 3 dark runs.
// The module size measured on the finders is too rough for large codes (blur widens dark modules).
function timingVersion(bin, w, h, from, to, side) {
  const ux = to.x - from.x, uy = to.y - from.y, len = Math.hypot(ux, uy);
  const nx = (side.x - from.x) / Math.hypot(side.x - from.x, side.y - from.y), ny = (side.y - from.y) / Math.hypot(side.x - from.x, side.y - from.y);
  const steps = Math.ceil(len * 2);
  let runs = 0, last = 0;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps, s = from.size + (to.size - from.size) * k; // module size along the way
    const px = Math.round(from.x + ux * k + nx * 3 * s), py = Math.round(from.y + uy * k + ny * 3 * s);
    if (px < 0 || py < 0 || px >= w || py >= h) return null;
    const v = bin[py * w + px];
    if (v && !last) runs++;
    last = v;
  }
  const version = (runs - 3) / 2;
  return Number.isInteger(version) && version >= 1 && version <= 40 ? version : null;
}

// The versions (7 and up) whose 18 version bits, beside the top-right or bottom-left finder, read back as
// that same version (at most 3 bits off), placed by the finders alone. These modules fall in place only
// for a version close to the true one, so each is tried: a wrong one reads as noise, not as itself.
// Sturdier than the timing lines on large codes, where blur makes the finders look larger than they are.
function versionsWritten(bin, w, h, { tl, tr, bl }) {
  const out = [];
  for (let v = 7; v <= 40; v++) {
    const size = sizeOf(v);
    const map = homography([[3.5, 3.5], [size - 3.5, 3.5], [3.5, size - 3.5], [size - 3.5, size - 3.5]],
      [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], fourthCorner(tl, tr, bl, size)]);
    if (!map) continue;
    const at = (x, y) => {
      const [px, py] = map(x + 0.5, y + 0.5), ix = Math.round(px), iy = Math.round(py);
      return ix < 0 || iy < 0 || ix >= w || iy >= h ? 0 : bin[iy * w + ix];
    };
    let right = 0, left = 0;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + i % 3, b = Math.floor(i / 3);
      right |= at(a, b) << i;
      left |= at(b, a) << i;
    }
    if (ones(right ^ versionBits(v)) <= 3 || ones(left ^ versionBits(v)) <= 3) out.push(v);
  }
  return out;
}

// The text of the QR code in a grey picture (one byte per pixel, row by row), or null.
export function decodeImage(gray, w, h) {
  const bin = binarize(gray, w, h);
  const found = findFinders(bin, w, h);
  // In a picture taken at a steep angle, the corner opposite the longest side may not be the top-left
  // one: each of the three is tried, the most likely first.
  const turns = ({ tl, tr, bl }) => [{ tl, tr, bl }, { tl: tr, tr: bl, bl: tl }, { tl: bl, tr: tl, bl: tr }];
  const options = triples(found).slice(0, 4).flatMap(t => turns(t).map((x, i) => ({ ...x, modules: i ? Math.hypot(x.tr.x - x.tl.x, x.tr.y - x.tl.y) / ((x.tl.size + x.tr.size + x.bl.size) / 3) : t.modules })));
  for (const t of options) {
    // The size measured on the finders is only an estimate (blur widens dark modules): the versions
    // around it are tried too, error correction rejects the wrong ones.
    const estimate = Math.round((t.modules + 7 - 17) / 4);
    const timed = [timingVersion(bin, w, h, t.tl, t.tr, t.bl), timingVersion(bin, w, h, t.tl, t.bl, t.tr)];
    for (const v of new Set([...versionsWritten(bin, w, h, t), ...timed.filter(Boolean), ...[0, -1, 1, -2, 2, -3, 3].map(d => estimate + d)])) {
      if (v < 1 || v > 40) continue;
      const grid = sample(bin, w, h, t, v);
      const text = grid && readGrid(grid, v);
      if (typeof text === "string") return text;
    }
  }
  return null;
}
