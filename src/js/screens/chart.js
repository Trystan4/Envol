// A small line chart in SVG (no library): one series, its value axis, the first and last labels under it.
// The text of the chart (label) describes it for VoiceOver; the exact values stay listed on the screen.

import { esc } from "../util.js";

const W = 320, H = 150, LEFT = 34, RIGHT = 14, TOP = 18, BOTTOM = 24;

// points: [{ y }] evenly spaced, oldest first; max: top of the axis; ticks: values with a grid line;
// format: value → text; first / last: labels under the two ends; label: what the chart says, in words;
// dots: a dot on every point (few points), otherwise on the last one only; area: shade under the line.
export function lineChart({ points, max, ticks, format, first, last, label, dots = false, area = false }) {
  const x = i => points.length > 1 ? LEFT + i * (W - LEFT - RIGHT) / (points.length - 1) : W - RIGHT;
  const y = v => H - BOTTOM - Math.max(0, Math.min(max, v)) / max * (H - TOP - BOTTOM);
  const xy = points.map((p, i) => [x(i), y(p.y)].map(n => Math.round(n * 10) / 10));
  const line = xy.map(([a, b], i) => `${i ? "L" : "M"}${a} ${b}`).join("");
  const [lx, ly] = xy[xy.length - 1];
  const grid = ticks.map(t => `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/>`
    + `<text x="${LEFT - 6}" y="${y(t) + 4}" text-anchor="end" class="tick">${esc(format(t))}</text>`).join("");
  const shade = area && points.length > 1 ? `<path d="${line}L${lx} ${H - BOTTOM}L${LEFT} ${H - BOTTOM}Z" fill="var(--cabine)" opacity=".1"/>` : "";
  const marks = (dots ? xy : [xy[xy.length - 1]]).map(([a, b]) => `<circle cx="${a}" cy="${b}" r="4.5" fill="var(--cabine)" stroke="var(--surface-raised)" stroke-width="2"/>`).join("");
  // The last value, written above its point (moved below when the point is at the top).
  const valueY = ly - 10 < TOP - 4 ? ly + 18 : ly - 10;
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${shade}
    <path d="${line}" fill="none" stroke="var(--cabine)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${marks}
    <text x="${lx}" y="${valueY}" text-anchor="end" class="value">${esc(format(points[points.length - 1].y))}</text>
    ${points.length > 1 ? `<text x="${LEFT}" y="${H - 6}" class="tick">${esc(first)}</text>` : ""}
    <text x="${W - RIGHT}" y="${H - 6}" text-anchor="end" class="tick">${esc(last)}</text></svg></figure>`;
}
