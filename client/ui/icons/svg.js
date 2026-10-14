// The path helpers every icon is drawn with (icons.js, and each held item's own icon in this folder): SVG markup
// strings, numbers rounded to 0.01.
export const f = (n) => Math.round(n * 100) / 100;
export const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
export const E = (d, extra = '') => `<path fill-rule="evenodd" d="${d}"${extra}/>`;
export const S = (d, w = 2, extra = '') =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
export const circ = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
export const ell = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`;
export const rct = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;

export function gearPath(cx, cy, rOut, rIn, teeth) {
  let d = '';
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [rIn, a - step * 0.32],
      [rOut, a - step * 0.2],
      [rOut, a + step * 0.2],
      [rIn, a + step * 0.32],
    ];
    for (let k = 0; k < 4; k++) {
      const [r, t] = pts[k];
      d += (i === 0 && k === 0 ? 'M' : 'L') + f(cx + Math.cos(t) * r) + ' ' + f(cy + Math.sin(t) * r);
    }
  }
  return d + 'Z';
}

export function raysPath(cx, cy, r0, r1, n, rot = 0) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const t = rot + (i / n) * Math.PI * 2;
    d += `M${f(cx + Math.cos(t) * r0)} ${f(cy + Math.sin(t) * r0)}L${f(cx + Math.cos(t) * r1)} ${f(cy + Math.sin(t) * r1)}`;
  }
  return d;
}
// a star of n points (an explosion), the points at r0 and the notches between them at r1
export function burstPath(cx, cy, r0, r1, n, rot = 0) {
  let d = '';
  for (let i = 0; i < 2 * n; i++) {
    const t = rot + (i * Math.PI) / n;
    const r = i % 2 ? r1 : r0;
    d += `${i ? 'L' : 'M'}${f(cx + Math.cos(t) * r)} ${f(cy + Math.sin(t) * r)}`;
  }
  return d + 'Z';
}
// a rectangle with rounded corners
export const rrect = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
// a drop of blood, its tip at (cx, top), r wide either side of the middle
export const dropPath = (cx, top, r) => `M${f(cx)} ${f(top)}C${f(cx)} ${f(top)} ${f(cx - r)} ${f(top + r * 1.5)} ${f(cx - r)} ${f(top + r * 2.3)}A${f(r)} ${f(r)} 0 0 0 ${f(cx + r)} ${f(top + r * 2.3)}C${f(cx + r)} ${f(top + r * 1.5)} ${f(cx)} ${f(top)} ${f(cx)} ${f(top)}Z`;
// a foil pack's crimped edge: n teeth from x0 to x1 along y, pointing up (dir -1) or down (dir 1), as path steps
export function crimpPath(x0, x1, y, h, n, dir) {
  let d = '';
  const w = (x1 - x0) / n;
  for (let i = 1; i <= n; i++) d += `L${f(x0 + (i - 0.5) * w)} ${f(y + dir * h)}L${f(x0 + i * w)} ${f(y)}`;
  return d;
}

// a flame licking up from (x, y), s its size
export const flameTop = (x, y, s = 1) =>
  P(
    `M${f(x)} ${f(y)}Q${f(x + 6 * s)} ${f(y + 5 * s)} ${f(x + 4.5 * s)} ${f(y + 9 * s)}Q${f(x + 3.5 * s)} ${f(y + 11 * s)} ${f(x)} ${f(y + 11 * s)}` +
      `Q${f(x - 3.5 * s)} ${f(y + 11 * s)} ${f(x - 4.5 * s)} ${f(y + 9 * s)}Q${f(x - 5.5 * s)} ${f(y + 6 * s)} ${f(x - 3 * s)} ${f(y + 3.5 * s)}` +
      `Q${f(x - 3 * s)} ${f(y + 6.5 * s)} ${f(x - 1 * s)} ${f(y + 7 * s)}Q${f(x - 2 * s)} ${f(y + 3.5 * s)} ${f(x)} ${f(y)}Z`,
  );
