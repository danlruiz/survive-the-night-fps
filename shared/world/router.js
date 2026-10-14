// The A* road router the island's roads are laid with (world/roads.js): a 4 m cost grid over the raw heightfield
// (slope, water, map edge, other places; existing roads are cheap so later roads merge into shared corridors, and a
// noise term adds natural meander), and the smoothing that turns a path of cells into a road's control points.
import { MAP_HALF, MAP_SIZE, GRID_N, GRID_STEP, WATER_LEVEL } from '../constants.js';
import { clamp } from '../rng.js';

const AG = 4;
const AN = Math.round(MAP_SIZE / AG);
const AN1 = AN + 1;

// route(ax, az, bx, bz): the control points of the cheapest way from a to b; markRoadCells(road): a road the next
// ones may share
export function createRouter({ heights, zones, rail, nB, nD }) {
  const N = GRID_N;
  const aH = new Float32Array(AN1 * AN1);
  const AS = AG / GRID_STEP;
  for (let j = 0; j <= AN; j++) for (let i = 0; i <= AN; i++) aH[j * AN1 + i] = heights[Math.min(N - 1, j * AS) * N + Math.min(N - 1, i * AS)];
  const aBase = new Float32Array(AN * AN);
  const aZone = new Int8Array(AN * AN).fill(-1);
  const aRoad = new Uint8Array(AN * AN);
  for (let j = 0; j < AN; j++) {
    for (let i = 0; i < AN; i++) {
      const h00 = aH[j * AN1 + i];
      const h10 = aH[j * AN1 + i + 1];
      const h01 = aH[(j + 1) * AN1 + i];
      const h11 = aH[(j + 1) * AN1 + i + 1];
      const sx = (h10 + h11 - h00 - h01) / (2 * AG);
      const sz = (h01 + h11 - h00 - h10) / (2 * AG);
      const s = Math.hypot(sx, sz);
      let c = 1 + s * s * 42 + (s > 0.28 ? (s - 0.28) * 70 : 0);
      if (Math.min(h00, h10, h01, h11) < WATER_LEVEL + 0.9) c += 500;
      const cx = -MAP_HALF + (i + 0.5) * AG;
      const cz = -MAP_HALF + (j + 0.5) * AG;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > MAP_HALF - 44) c += 80;
      c += (nD(cx * 0.009 + 3.1, cz * 0.009 - 7.7) + 1) * 2.4 + (nB(cx * 0.03 - 5.3, cz * 0.03 + 1.7) + 1) * 0.8;
      const k = j * AN + i;
      aBase[k] = c;
      for (let zi = 0; zi < zones.length; zi++) {
        const zn = zones[zi];
        if (Math.hypot(cx - zn.x, cz - zn.z) < (zn.reach || zn.flat) + 3) aZone[k] = zi;
      }
    }
  }
  if (rail) rail.cost(aBase, AG, AN); // (a road crosses the railway, it does not run along its bed)
  const markRoadCells = (road) => {
    const p = road.pts;
    for (let i = 0; i < p.length / 2; i++) {
      const ci = Math.floor((p[i * 2] + MAP_HALF) / AG);
      const cj = Math.floor((p[i * 2 + 1] + MAP_HALF) / AG);
      if (ci >= 0 && cj >= 0 && ci < AN && cj < AN) aRoad[cj * AN + ci] = 1;
    }
  };
  const aG = new Float32Array(AN * AN);
  const aFrom = new Int32Array(AN * AN);
  const aClosed = new Uint8Array(AN * AN);
  const heapK = new Int32Array(AN * AN * 8);
  const heapF = new Float32Array(AN * AN * 8);
  const route = (ax, az, bx, bz) => {
    const cell = (v) => clamp(Math.floor((v + MAP_HALF) / AG), 0, AN - 1);
    const s = cell(az) * AN + cell(ax);
    const t = cell(bz) * AN + cell(bx);
    const ti = t % AN;
    const tj = (t / AN) | 0;
    aG.fill(Infinity);
    aFrom.fill(-1);
    aClosed.fill(0);
    let hn = 0;
    const push = (k, f) => {
      let i = hn++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapF[p] <= f) break;
        heapF[i] = heapF[p];
        heapK[i] = heapK[p];
        i = p;
      }
      heapF[i] = f;
      heapK[i] = k;
    };
    const pop = () => {
      const top = heapK[0];
      const lk = heapK[--hn];
      const lf = heapF[hn];
      let i = 0;
      for (;;) {
        let l = i * 2 + 1;
        if (l >= hn) break;
        if (l + 1 < hn && heapF[l + 1] < heapF[l]) l++;
        if (heapF[l] >= lf) break;
        heapF[i] = heapF[l];
        heapK[i] = heapK[l];
        i = l;
      }
      heapF[i] = lf;
      heapK[i] = lk;
      return top;
    };
    const cost = (k) => aBase[k] * (aRoad[k] ? 0.42 : 1) + (aZone[k] >= 0 ? 30 : 0);
    aG[s] = 0;
    push(s, 0);
    while (hn > 0) {
      const k = pop();
      if (aClosed[k]) continue;
      aClosed[k] = 1;
      if (k === t) break;
      const ki = k % AN;
      const kj = (k / AN) | 0;
      const ck = cost(k);
      for (let n = 0; n < 8; n++) {
        const ni = ki + NDI[n];
        const nj = kj + NDJ[n];
        if (ni < 0 || nj < 0 || ni >= AN || nj >= AN) continue;
        const nk = nj * AN + ni;
        if (aClosed[nk]) continue;
        const g = aG[k] + (ck + cost(nk)) * 0.5 * (n >= 4 ? 1.4142 : 1);
        if (g < aG[nk]) {
          aG[nk] = g;
          aFrom[nk] = k;
          push(nk, g + Math.hypot(ni - ti, nj - tj) * 0.95);
        }
      }
    }
    const cells = [];
    for (let k = t; k >= 0; k = aFrom[k]) {
      cells.push(k);
      if (k === s) break;
    }
    cells.reverse();
    let pts = cells.map((k) => [-MAP_HALF + ((k % AN) + 0.5) * AG, -MAP_HALF + (((k / AN) | 0) + 0.5) * AG]);
    pts[0] = [ax, az];
    pts[pts.length - 1] = [bx, bz];
    // Chaikin smoothing + Douglas-Peucker simplification -> catmull control points
    for (let it = 0; it < 2; it++) {
      const o = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i];
        const [x1, z1] = pts[i + 1];
        o.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]);
      }
      o.push(pts[pts.length - 1]);
      pts = o;
    }
    return simplify(pts, 1.6);
  };
  return { route, markRoadCells };
}

// Douglas-Peucker polyline simplification
export function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    let md = 0;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / l;
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (md > eps && mi > 0) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const NDI = [1, -1, 0, 0, 1, 1, -1, -1];
const NDJ = [0, 0, 1, -1, 1, -1, 1, -1];
