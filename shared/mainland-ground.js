// The tools the mainland's ground is made with (shared/mainland.js): the layout's outlines (mainland-layout.js) filled
// onto the vertices of the heightfield, how far every vertex is from the edge of what was filled, the forest's grid
// read back out of its code, and the edge of a filled mask as lines to stand walls along. All of it is O(vertices):
// a map of a million vertices fills, measures and traces in a few tens of milliseconds.

// Fill closed outlines (even-odd: an outline inside another is a hole) onto an n x n grid of vertices, `step` apart
// from -half. Each outline is [[x, z], ...] in world metres. -> Uint8Array, 1 inside.
// (or: set what is inside and leave what is set already - outlines that are one shape each, filled over what is there)
export function fillPolys(polys, n, step, half, out = new Uint8Array(n * n), or = false) {
  const xs = [];
  for (let j = 0; j < n; j++) {
    const z = -half + j * step;
    xs.length = 0;
    for (const poly of polys) {
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [ax, az] = poly[a];
        const [bx, bz] = poly[b];
        if (az > z === bz > z) continue;
        xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
      }
    }
    if (!xs.length) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] + half) / step));
      const i1 = Math.min(n - 1, Math.floor((xs[k + 1] + half) / step));
      if (or) out.fill(1, j * n + i0, j * n + i1 + 1);
      else for (let i = i0; i <= i1; i++) out[j * n + i] ^= 1;
    }
  }
  return out;
}

// Exact Euclidean distance (in cells) from every cell to the nearest cell whose mask is `to`, out to `cap` cells
// (Felzenszwalb and Huttenlocher: a lower envelope of parabolas along each row, then each column).
export function distanceTo(mask, n, to = 1, cap = 1e4) {
  const INF = 1e12;
  const f = new Float64Array(n * n);
  for (let k = 0; k < n * n; k++) f[k] = mask[k] === to ? 0 : INF;
  const line = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const zz = new Float64Array(n + 1);
  // (one line: line -> d. A line with nothing on it stays as it is; the rows and the columns are copied in and out
  // by plain loops, which a function call an element made twice as slow)
  const pass = () => {
    let k = 0;
    v[0] = 0;
    zz[0] = -INF;
    zz[1] = INF;
    for (let q = 1; q < n; q++) {
      if (line[q] >= INF && line[v[k]] >= INF) continue;
      let s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= zz[k]) {
        k--;
        s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      zz[k] = s;
      zz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (zz[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + line[v[k]];
    }
  };
  for (let j = 0; j < n; j++) {
    const o = j * n;
    let any = false;
    for (let q = 0; q < n; q++) {
      line[q] = f[o + q];
      any ||= line[q] < INF;
    }
    if (!any) continue;
    pass();
    for (let q = 0; q < n; q++) f[o + q] = d[q];
  }
  for (let i = 0; i < n; i++) {
    for (let q = 0; q < n; q++) line[q] = f[q * n + i];
    pass();
    for (let q = 0; q < n; q++) f[q * n + i] = d[q];
  }
  const out = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) out[k] = Math.min(cap, Math.sqrt(f[k]));
  return out;
}

// Signed distance in metres from the edge of a mask: positive inside, negative outside, capped at `cap` either way.
export function signedDistance(mask, n, step, cap) {
  const inside = distanceTo(mask, n, 0, cap / step + 2); // (how far an inside vertex is from the outside)
  const outside = distanceTo(mask, n, 1, cap / step + 2);
  const out = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) out[k] = Math.max(-cap, Math.min(cap, mask[k] ? (inside[k] - 0.5) * step : -(outside[k] - 0.5) * step));
  return out;
}

// The same, measured only over the square that holds what is set in the mask and `cap` past it (a lake: a twentieth of
// the map): everywhere else is out past the cap, -cap. The same values as signedDistance where it measures.
export function signedDistanceNear(mask, n, step, cap) {
  let i0 = n;
  let j0 = n;
  let i1 = -1;
  let j1 = -1;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!mask[j * n + i]) continue;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
    }
  }
  const out = new Float32Array(n * n).fill(-cap);
  if (i1 < 0) return out;
  const pad = Math.ceil(cap / step) + 3;
  const side = Math.min(n, Math.max(i1 - i0, j1 - j0) + 1 + pad * 2);
  const si = Math.max(0, Math.min(n - side, i0 - pad));
  const sj = Math.max(0, Math.min(n - side, j0 - pad));
  const sub = new Uint8Array(side * side);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) sub[j * side + i] = mask[(sj + j) * n + si + i];
  const d = signedDistance(sub, side, step, cap);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) out[(sj + j) * n + si + i] = d[j * side + i];
  return out;
}

// The forest grid of mainland-layout.js, read back: Uint8Array of n * n, 0 (none) to 9 (dense), row by row from the
// north-west corner.
export function decodeForest({ n, rle }) {
  const out = new Uint8Array(n * n);
  let k = 0;
  for (let i = 0; i < rle.length; ) {
    const v = rle.charCodeAt(i) - 48;
    let run = 1;
    i++;
    if (rle[i] === '.') {
      run = parseInt(rle.slice(i + 1, i + 3), 36);
      i += 3;
    }
    out.fill(v, k, k + run);
    k += run;
  }
  return out;
}

// The edge of a mask of vertices (marching squares at half way between them), as polylines of world points, each
// simplified to within `tol` metres. Their inside is on their right, walking along them (x east, z south: to the
// right of a step (dx, dz) is (-dz, dx)). An edge that runs off the map is left open there.
export function maskEdges(mask, n, step, half, tol = 0.6) {
  // segments per cell, keyed by their start point (cell corner midpoints, in half-cell units)
  const next = new Map();
  const key = (a, b) => a * 8192 + b;
  const seg = (ax, az, bx, bz) => next.set(key(ax, az), [bx, bz]);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = mask[j * n + i];
      const b = mask[j * n + i + 1];
      const c = mask[(j + 1) * n + i + 1];
      const d = mask[(j + 1) * n + i];
      const code = a | (b << 1) | (c << 2) | (d << 3);
      if (code === 0 || code === 15) continue;
      // midpoints of the cell's sides in half-cell units: top (between a, b), right (b, c), bottom (d, c), left (a, d)
      const T = [i * 2 + 1, j * 2];
      const R = [i * 2 + 2, j * 2 + 1];
      const B = [i * 2 + 1, j * 2 + 2];
      const L = [i * 2, j * 2 + 1];
      // (oriented so the inside is on the right: x east, z south, so the right of a step east is south)
      switch (code) {
        case 1: seg(...T, ...L); break;
        case 2: seg(...R, ...T); break;
        case 3: seg(...R, ...L); break;
        case 4: seg(...B, ...R); break;
        case 5: seg(...T, ...R); seg(...B, ...L); break;
        case 6: seg(...B, ...T); break;
        case 7: seg(...B, ...L); break;
        case 8: seg(...L, ...B); break;
        case 9: seg(...T, ...B); break;
        case 10: seg(...L, ...T); seg(...R, ...B); break;
        case 11: seg(...R, ...B); break;
        case 12: seg(...L, ...R); break;
        case 13: seg(...T, ...R); break;
        case 14: seg(...L, ...T); break;
        default: break;
      }
    }
  }
  const lines = [];
  const toW = (p) => [-half + (p[0] / 2) * step, -half + (p[1] / 2) * step];
  while (next.size) {
    const [k0] = next.keys();
    const start = [Math.floor(k0 / 8192), k0 % 8192];
    const pts = [start];
    let p = start;
    for (;;) {
      const k = key(p[0], p[1]);
      const q = next.get(k);
      if (!q) break;
      next.delete(k);
      pts.push(q);
      p = q;
      if (q[0] === start[0] && q[1] === start[1]) break;
    }
    if (pts.length > 2) lines.push(simplify(pts.map(toW), tol));
  }
  return lines;
}

// Douglas-Peucker
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const ex = bx - ax;
    const ez = bz - az;
    const el = Math.hypot(ex, ez);
    let worst = -1;
    let wd = tol;
    for (let k = a + 1; k < b; k++) {
      const d = el > 1e-9 ? Math.abs((pts[k][0] - ax) * ez - (pts[k][1] - az) * ex) / el : Math.hypot(pts[k][0] - ax, pts[k][1] - az);
      if (d > wd) {
        wd = d;
        worst = k;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

// distance from (x, z) to a polyline of [x, z, ...] points (Float32Array or array), and the index of its nearest leg
export function lineDist(pts, x, z) {
  let best = Infinity;
  let leg = 0;
  let t0 = 0;
  for (let s = 0; s + 3 < pts.length; s += 2) {
    const ax = pts[s];
    const az = pts[s + 1];
    const ex = pts[s + 2] - ax;
    const ez = pts[s + 3] - az;
    const el2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / el2));
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < best) {
      best = d;
      leg = s >> 1;
      t0 = t;
    }
  }
  return { d: best, leg, t: t0 };
}
