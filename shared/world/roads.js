// The island's roads (world.js): Route 9 winding across the valley past the front of every place on it, the county
// roads and forest trails layout.js links the places with (routed over the hills with A*: world/router.js), and the
// streets inside a few places; then the roads are pressed into the heightfield and the queries on the finished ground
// are made (heightAt, roadDistAt, roadKindAt).
import { MAP_HALF, GRID_N, GRID_STEP, WATER_LEVEL } from '../constants.js';
import { ZONE } from '../defs.js';
import { smoothstep, lerp, clamp } from '../rng.js';
import { ROAD, gatePoint } from '../layout.js';
import { heightSampler, nearestSampler } from '../heightfield.js';
import { createRouter, simplify } from './router.js';

// streets inside places (local coords): [[lx,lz]...], kind, width
const STREETS = {
  [ZONE.VILLAGE]: [
    [[[0, -40], [1.5, -14], [0, 0], [-1.5, 16], [0, 40]], ROAD.DIRT, 3],
    [[[-40, 0], [-14, -1.2], [0, 0], [14, 1.2], [40, 0]], ROAD.DIRT, 2.8],
  ],
  [ZONE.TRAILERS]: [[[[0, -28], [0, -12], [2.5, 4], [0, 28]], ROAD.DIRT, 2.4]],
  [ZONE.CAMPGROUND]: [[[[0, -26], [5, -9], [4, 8], [0, 26]], ROAD.DIRT, 2.2]],
  [ZONE.DRIVEIN]: [[[[0, -30], [0, -20], [-1.5, -11]], ROAD.DIRT, 2.6]],
  [ZONE.FAIR]: [[[[0, -33], [0, -20], [0, -4], [0, 9]], ROAD.DIRT, 2.6]],
};

export function layRoads({ rng, nB, nD, zones, zoneById, nearZone, hwyAnchors, links, heights, rawH, rail }) {
  const N = GRID_N;
  const roadDist = new Float32Array(N * N).fill(1e4);
  const roadKind = new Uint8Array(N * N);
  const roadH = new Float32Array(N * N);
  const roadDir = new Float32Array(N * N * 2); // unit tangent of the nearest road (road textures follow it)

  // local <-> world for a place
  const zwx = (zn, lx, lz) => zn.x + Math.cos(zn.ry) * lx + Math.sin(zn.ry) * lz;
  const zwz = (zn, lx, lz) => zn.z - Math.sin(zn.ry) * lx + Math.cos(zn.ry) * lz;

  const roads = [];
  const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  const buildRoad = (ctrl, kind, width, name = '') => {
    // ctrl: [[x,z],...] ; densify with catmull-rom at ~2 m spacing
    const pts = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)];
      const p1 = ctrl[i];
      const p2 = ctrl[i + 1];
      const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(2, Math.ceil(len / 2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        pts.push(catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t));
      }
    }
    const last = ctrl[ctrl.length - 1];
    pts.push(last[0], last[1]);
    const n = pts.length / 2;
    const hs = new Float32Array(n);
    for (let i = 0; i < n; i++) hs[i] = rawH(pts[i * 2], pts[i * 2 + 1]);
    // smooth heights along the road (gentle grades)
    const win = kind === ROAD.TRAIL ? 4 : 8;
    for (let pass = 0; pass < 3; pass++) {
      const src = hs.slice();
      for (let i = 0; i < n; i++) {
        let s = 0;
        let c = 0;
        for (let k = -win; k <= win; k++) {
          const j = i + k;
          if (j < 0 || j >= n) continue;
          s += src[j];
          c++;
        }
        hs[i] = s / c;
      }
    }
    // ...but a road meets a place at the level of its yard, it does not cut a ramp into it
    for (let i = 0; i < n; i++) {
      for (const zn of zones) {
        const d = Math.hypot(pts[i * 2] - zn.x, pts[i * 2 + 1] - zn.z);
        if (d < zn.flat + 12) hs[i] = lerp(hs[i], zn.h, 1 - smoothstep(zn.flat * 0.75, zn.flat + 12, d));
      }
    }
    if (rail) rail.pinRoad(pts, hs); // (...and the railway at the level of its bed)
    let length = 0;
    for (let i = 1; i < n; i++) length += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    const road = { pts: new Float32Array(pts), hs, kind, width, name, length };
    roads.push(road);
    return road;
  };

  // Route 9: winding asphalt highway across the whole valley, past your broken-down car and the front of
  // every place that stands on it. Meander points between the anchors keep it from ever running straight.
  let highway;
  {
    const anchors = hwyAnchors;
    const ctrl = [anchors[0]];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [ax, az] = anchors[i];
      const [bx, bz] = anchors[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      const px = -dz / len;
      const pz = dx / len;
      const edgeSeg = i === 0 || i === anchors.length - 2;
      const amp = edgeSeg ? 6 : Math.min(16, len * 0.11);
      const s = rng.chance(0.5) ? 1 : -1;
      const o1 = s * rng.range(0.45, 1) * amp;
      const o2 = -s * rng.range(0.3, 1) * amp;
      ctrl.push([ax + dx * 0.34 + px * o1, az + dz * 0.34 + pz * o1]);
      ctrl.push([ax + dx * 0.68 + px * o2, az + dz * 0.68 + pz * o2]);
      ctrl.push([bx, bz]);
    }
    highway = buildRoad(ctrl, ROAD.ASPHALT, 3.6, 'Route 9');
  }
  // nearest point of Route 9 to (x,z): [x, z, index]
  const hwyPoint = (x, z) => {
    const p = highway.pts;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < p.length / 2; i++) {
      const d = Math.hypot(p[i * 2] - x, p[i * 2 + 1] - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return [p[best * 2], p[best * 2 + 1], best];
  };
  // places Route 9 runs through face along the road
  for (const zn of zones) {
    if (!zn.hwy) continue;
    const [hx, hz, i] = hwyPoint(zn.x, zn.z);
    const p = highway.pts;
    const a = Math.max(0, i - 3);
    const b = Math.min(p.length / 2 - 1, i + 3);
    const dx = p[b * 2] - p[a * 2];
    const dz = p[b * 2 + 1] - p[a * 2 + 1];
    zn.ry = Math.atan2(-dx, -dz); // front (-Z local) faces along the road
    zn.x = hx;
    zn.z = hz;
  }

  // the rest are routed with A* (world/router.js), merging into the corridors of the roads laid before them
  const { route, markRoadCells } = createRouter({ heights, zones, rail, nB, nD });
  markRoadCells(highway);
  const endpoint = (e) => {
    if (!e.zone) {
      const [x, z] = hwyPoint(e.x, e.z);
      return { x, z };
    }
    const zn = e.zone;
    const [x, z] = gatePoint(zn, e.gate);
    // driveway: the road runs on in from the gate - half way to the middle at the front, a little way into the
    // yard at the sides and back (unless one of the place's own streets meets it there)
    const street = (STREETS[zn.id] || []).some(([pts]) => [pts[0], pts[pts.length - 1]].some(([lx, lz]) => Math.hypot(zwx(zn, lx, lz) - x, zwz(zn, lx, lz) - z) < 6));
    const t = e.gate === 'f' ? 0.5 : 0.75;
    const inner = street ? null : [zn.x + (x - zn.x) * t, zn.z + (z - zn.z) * t];
    return { x, z, inner };
  };
  for (const [a, b, kind] of links) {
    const A = endpoint(a);
    const B = endpoint(b);
    // a bend waypoint keeps long roads from running dead straight across flat ground
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    let ctrl;
    if (L > 70) {
      const t = rng.range(0.38, 0.62);
      const off = rng.range(0.1, 0.2) * L * (rng.chance(0.5) ? 1 : -1);
      let wx = A.x + (B.x - A.x) * t + (-(B.z - A.z) / L) * off;
      let wz = A.z + (B.z - A.z) * t + ((B.x - A.x) / L) * off;
      wx = clamp(wx, -MAP_HALF + 50, MAP_HALF - 50);
      wz = clamp(wz, -MAP_HALF + 50, MAP_HALF - 50);
      // (not if the bend would drag the road through a place or the water)
      if (rawH(wx, wz) > WATER_LEVEL + 1.5 && !nearZone(wx, wz, 14)) {
        const a1 = route(A.x, A.z, wx, wz);
        const a2 = route(wx, wz, B.x, B.z);
        ctrl = simplify([...a1, ...a2.slice(1)], 1.6);
      }
    }
    if (!ctrl) ctrl = route(A.x, A.z, B.x, B.z);
    if (A.inner && kind !== ROAD.TRAIL) ctrl = [A.inner, ...ctrl];
    if (B.inner && kind !== ROAD.TRAIL) ctrl = [...ctrl, B.inner];
    const r = buildRoad(ctrl, kind, kind === ROAD.TRAIL ? 1.5 : 2.6);
    if (kind !== ROAD.TRAIL) markRoadCells(r);
  }
  for (const zid in STREETS) {
    const zn = zoneById[zid];
    if (!zn) continue;
    for (const [pts, kind, width] of STREETS[zid]) buildRoad(pts.map(([lx, lz]) => [zwx(zn, lx, lz), zwz(zn, lx, lz)]), kind, width);
  }

  // ---------------------------------------------------------------- heightfield (roads flattened in below)
  const ROAD_BLEND = 7.5;
  for (const road of roads) {
    const p = road.pts;
    const n = p.length / 2;
    const reach = road.width + ROAD_BLEND;
    for (let s = 0; s < n - 1; s++) {
      const ax = p[s * 2];
      const az = p[s * 2 + 1];
      const bx = p[s * 2 + 2];
      const bz = p[s * 2 + 3];
      const minx = Math.min(ax, bx) - reach;
      const maxx = Math.max(ax, bx) + reach;
      const minz = Math.min(az, bz) - reach;
      const maxz = Math.max(az, bz) + reach;
      const i0 = Math.max(0, Math.floor((minx + MAP_HALF) / GRID_STEP));
      const i1 = Math.min(N - 1, Math.ceil((maxx + MAP_HALF) / GRID_STEP));
      const j0 = Math.max(0, Math.floor((minz + MAP_HALF) / GRID_STEP));
      const j1 = Math.min(N - 1, Math.ceil((maxz + MAP_HALF) / GRID_STEP));
      const ex = bx - ax;
      const ez = bz - az;
      const el2 = ex * ex + ez * ez || 1;
      const el = Math.sqrt(el2);
      for (let j = j0; j <= j1; j++) {
        const z = -MAP_HALF + j * GRID_STEP;
        for (let i = i0; i <= i1; i++) {
          const x = -MAP_HALF + i * GRID_STEP;
          let t = ((x - ax) * ex + (z - az) * ez) / el2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = ax + ex * t;
          const cz = az + ez * t;
          const d = Math.hypot(x - cx, z - cz) - (road.width - 2.6);
          const k = j * N + i;
          if (d < roadDist[k]) {
            roadDist[k] = d;
            roadKind[k] = road.kind;
            roadH[k] = road.hs[s] + (road.hs[s + 1] - road.hs[s]) * t;
            roadDir[k * 2] = ex / el;
            roadDir[k * 2 + 1] = ez / el;
          }
        }
      }
    }
  }
  for (let k = 0; k < N * N; k++) {
    const d = roadDist[k];
    if (d < 2.6 + ROAD_BLEND) {
      const t = 1 - smoothstep(2.6 + 0.4, 2.6 + ROAD_BLEND, d);
      heights[k] = lerp(heights[k], roadH[k] - 0.05, t);
    }
  }

  const heightAt = heightSampler(heights, N, MAP_HALF);
  const roadDistAt = nearestSampler(roadDist, N, MAP_HALF);
  const roadKindAt = nearestSampler(roadKind, N, MAP_HALF);
  // the railway's cuttings and embankments, and its bed entered in the road grids
  if (rail) rail.grade({ heights, roadDist, roadKind, roadDir, heightAt });

  return { roads, highway, roadDist, roadKind, roadDir, heightAt, roadDistAt, roadKindAt };
}
