// The mainland's roads (mainland.js): every road of the picture (mainland-layout.js) laid as a curve through the
// points it was traced by, its heights, and the ground graded to it (the terrain's grids: mainland/terrain.js).
import { GRID_STEP, WATER_LEVEL } from '../constants.js';
import { ZONE } from '../defs.js';
import { smoothstep, lerp, clamp } from '../rng.js';
import { ROAD } from '../layout.js';
import { ROADS } from '../mainland-layout.js';
import { heightSampler } from '../heightfield.js';
import { SIZE, HALF, N, PITCH, GRID, RIVER_HW, BRIDGE_UP, CUT_HW, CUT_LEN, RUNWAY_LEN, RUNWAY_HALF } from './consts.js';

const PI = Math.PI;

// rng: the mainland's own stream (its draws come here, between the terrain's and the kit's)
export function layMainRoads({ rng, plan, terrain }) {
  const { G2, city, W, zb, head, inCity, RING_R, RING_C, ringAt, inRing, RING_DIAG, BAND_A, rOut, cityW, cityE, aw, APRON, TERMINAL_AT, GATE_AT, FENCE, onField, seaAt, lakeAt, riverD, riverAt, tunnelOf, cliffAt, docks, passageE, zones, zoneById } = plan;
  const { cityH, fieldH, heights, roadDist, roadKind, roadH, roadDir, rawH } = terrain;
  // ---------------------------------------------------------------- roads
  // No router: every road is the picture's, a curve through the points it was traced by.
  const roads = [];
  // level: a road of a place keeps to the place's ground (a street, the runway); otherwise its heights are the
  // ground's, smoothed along it
  // endH: the height of the road it ends on, which it comes down (or up) to over its last stretch
  const buildRoad = (ctrl, kind, width, name = '', level = null, endH = null) => {
    const pts = [];
    // (a Catmull-Rom curve through its points, with each leg's two tangents held to the leg's own length: a short
    // leg after a long one would otherwise be overshot, and the road double back on itself)
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)];
      const p1 = ctrl[i];
      const p2 = ctrl[i + 1];
      const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const held = (ax, az) => {
        const l = Math.hypot(ax, az);
        return l > len ? [(ax * len) / l, (az * len) / l] : [ax, az];
      };
      const m1 = held((p2[0] - p0[0]) / 2, (p2[1] - p0[1]) / 2);
      const m2 = held((p3[0] - p1[0]) / 2, (p3[1] - p1[1]) / 2);
      const steps = Math.max(2, Math.ceil(len / 2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const [a, b2, c, d] = [2 * t * t * t - 3 * t * t + 1, t * t * t - 2 * t * t + t, -2 * t * t * t + 3 * t * t, t * t * t - t * t];
        pts.push(a * p1[0] + b2 * m1[0] + c * p2[0] + d * m2[0], a * p1[1] + b2 * m1[1] + c * p2[1] + d * m2[1]);
      }
    }
    pts.push(ctrl[ctrl.length - 1][0], ctrl[ctrl.length - 1][1]);
    const n = pts.length / 2;
    const hs = new Float32Array(n);
    for (let i = 0; i < n; i++) hs[i] = level ?? rawH(pts[i * 2], pts[i * 2 + 1]);
    // (over the river it is a bridge: the deck is this far over the water, whatever the bed does under it)
    const wet = (i) => riverAt(pts[i * 2], pts[i * 2 + 1]);
    if (level === null) for (let i = 0; i < n; i++) if (wet(i) < RIVER_HW + 12) hs[i] = Math.max(hs[i], WATER_LEVEL + BRIDGE_UP);
    if (level === null) {
      // (through a tunnel it is the corridor's level, not the mountain's over it)
      for (let i = 0; i < n; i++) {
        const on = tunnelOf(pts[i * 2], pts[i * 2 + 1]);
        if (on && on.lat < CUT_HW) hs[i] = lerp(on.t.y0, on.t.y1, clamp((on.s + CUT_LEN) / (on.t.len + CUT_LEN * 2), 0, 1));
      }
      for (let pass = 0; pass < 3; pass++) {
        const src = hs.slice();
        for (let i = 0; i < n; i++) {
          let s = 0;
          let c = 0;
          for (let k = Math.max(0, i - 8); k <= Math.min(n - 1, i + 8); k++) {
            s += src[k];
            c++;
          }
          hs[i] = s / c;
        }
      }
      // ...and it meets a place at the level of its ground
      for (let i = 0; i < n; i++) {
        for (const zn of zones) {
          const d = Math.hypot(pts[i * 2] - zn.x, pts[i * 2 + 1] - zn.z);
          if (d < zn.flat + 12) hs[i] = lerp(hs[i], zn.h, 1 - smoothstep(zn.flat, zn.flat + 12, d));
        }
        if (inCity(pts[i * 2], pts[i * 2 + 1], 6)) hs[i] = cityH;
        if (onField(pts[i * 2], pts[i * 2 + 1], -8)) hs[i] = fieldH;
      }
    }
    if (endH !== null) {
      let d = 0;
      for (let i = n - 1; i >= 0 && d < 30; i--) {
        hs[i] = lerp(endH, hs[i], smoothstep(0, 30, d));
        if (i) d += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      }
    }
    let length = 0;
    for (let i = 1; i < n; i++) length += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    // spans: [first, last] points of each stretch of it that is over the river
    const spans = [];
    for (let i = 0; i < n; i++) {
      if (level !== null || wet(i) >= RIVER_HW + 1) continue;
      if (spans.length && spans[spans.length - 1][1] === i - 1) spans[spans.length - 1][1] = i;
      else spans.push([i, i]);
    }
    // (its deck is level from bank to bank - one height, so it is one thing to walk on - and the road comes up to
    // that over a few metres either side)
    for (const [i0, i1] of spans) {
      const [a, e] = [Math.max(0, i0 - 3), Math.min(n - 1, i1 + 3)];
      let top = WATER_LEVEL + BRIDGE_UP;
      for (let i = a; i <= e; i++) top = Math.max(top, hs[i]);
      for (let i = a; i <= e; i++) hs[i] = top;
      for (let k = 1; k <= 6; k++) {
        if (a - k >= 0) hs[a - k] = lerp(top, hs[a - k], k / 7);
        if (e + k < n) hs[e + k] = lerp(top, hs[e + k], k / 7);
      }
    }
    const road = { pts: new Float32Array(pts), hs, kind, width, name, length, spans };
    roads.push(road);
    return road;
  };
  // Route 9 comes off the bridge, over the bluff and down Main Street through the city
  const highway = buildRoad([[head.x - 30, zb], [head.x + 20, zb], [cityW[0] - 34, lerp(zb, city.z, 0.7)], cityW, cityE], ROAD.ASPHALT, 3.8, 'Route 9');
  // the city's streets (Main Street is Route 9 itself)
  // the ring road: down the grid's edges, round each corner on its curve (a point every 6 degrees), all the way round
  {
    const ring = [];
    for (const [sx, sz, a0] of [[1, -1, -PI / 2], [1, 1, 0], [-1, 1, PI / 2], [-1, -1, PI]]) {
      for (let k = 0; k <= 15; k++) {
        const a = a0 + (k / 15) * (PI / 2);
        ring.push([city.x + sx * RING_C + Math.cos(a) * RING_R, city.z + sz * RING_C + Math.sin(a) * RING_R]);
      }
    }
    ring.push(ring[0]);
    buildRoad(ring, ROAD.ASPHALT, 3.6, 'Ring Road', cityH);
  }
  // the grid's streets inside it, each from the ring to the ring
  for (let i = 1; i < GRID; i++) {
    const o = -G2 + i * PITCH;
    const e = ringAt(Math.abs(o));
    if (i === GRID / 2) {
      // (the cross street up the middle stops at the square, from the north and from the south)
      buildRoad([[city.x + o, city.z - e], [city.x + o, city.z - PITCH]], ROAD.ASPHALT, 3.4, '', cityH);
      buildRoad([[city.x + o, city.z + PITCH], [city.x + o, city.z + e]], ROAD.ASPHALT, 3.4, '', cityH);
    } else buildRoad([[city.x + o, city.z - e], [city.x + o, city.z + e]], ROAD.ASPHALT, 3.4, '', cityH);
    if (i !== GRID / 2) buildRoad([[city.x - e, city.z + o], [city.x + e, city.z + o]], ROAD.ASPHALT, 3.4, '', cityH);
  }
  // the harbour streets: the town's grid carried out past the ring's south-west curve to the docks, as the picture has
  // them joined - its two streets west from the ring, and one down to the docks' road (two blocks between: below)
  {
    const xw = city.x - G2 - PITCH;
    buildRoad([[city.x - G2, city.z + PITCH], [xw, city.z + PITCH]], ROAD.ASPHALT, 3.4, '', cityH);
    buildRoad([[city.x - ringAt(2 * PITCH), city.z + 2 * PITCH], [xw, city.z + 2 * PITCH]], ROAD.ASPHALT, 3.4, '', cityH);
    buildRoad([[xw, city.z + PITCH], [xw, city.z + G2]], ROAD.ASPHALT, 3.4, '', cityH);
  }
  // ...and the streets out of the ring into the suburbs, as the picture runs them on: north from its top and south
  // from its foot, down the grid's lines, out until they meet a road, or the water, the rock or a place, or run 150 m
  {
    const hitsRoad = (x, z, self) => roads.some((r) => r !== self && r.width < 6 && (() => {
      const p = r.pts;
      for (let k = 0; k < p.length; k += 2) if (Math.abs(p[k] - x) < 5 && Math.abs(p[k + 1] - z) < 5) return true;
      return false;
    })());
    for (const [lx, sz] of [[0, -1], [PITCH, -1], [2 * PITCH, -1], [-PITCH, 1], [PITCH, 1]]) {
      const x = city.x + lx;
      const z0 = city.z + sz * ringAt(Math.abs(lx));
      let len = 0;
      for (let d = 12; d <= 150; d += 3) {
        const z = z0 + sz * d;
        if (seaAt(x, z) > -10 || lakeAt(x, z) > -10 || cliffAt(x, z) > -8 || riverAt(x, z) < RIVER_HW + 10 || zones.some((zn) => zn.id !== ZONE.CITY && Math.hypot(zn.x - x, zn.z - z) < zn.flat + 6)) break;
        len = d;
        if (d > 24 && hitsRoad(x, z, null)) break;
      }
      if (len >= 40) buildRoad([[x, z0], [x, z0 + sz * len]], ROAD.ASPHALT, 2.6, '', null);
    }
  }
  // the airfield: the runway, the taxiway down the apron, the perimeter road, the road in through the gate
  buildRoad([aw(0, -RUNWAY_LEN / 2), aw(0, RUNWAY_LEN / 2)], ROAD.ASPHALT, RUNWAY_HALF, 'Runway 36', fieldH);
  buildRoad([aw(RUNWAY_HALF + 8, -RUNWAY_LEN / 2 + 20), aw(RUNWAY_HALF + 8, APRON.lz - APRON.hz), aw(APRON.lx, APRON.lz - APRON.hz - 6)], ROAD.ASPHALT, 2.8, '', fieldH);
  {
    // (the perimeter road keeps to the fence: a rectangle with its corners rounded, not the oval a curve through its four
    // corners would be)
    const [x0, z0, x1, z1, rc] = [FENCE.x0 + 6, FENCE.z0 + 6, FENCE.x1 - 6, FENCE.z1 - 6, 16];
    const ring = [];
    for (const [cx, cz, a0] of [[x1 - rc, z0 + rc, -PI / 2], [x1 - rc, z1 - rc, 0], [x0 + rc, z1 - rc, PI / 2], [x0 + rc, z0 + rc, PI]]) for (let k = 0; k <= 3; k++) ring.push([cx + Math.cos(a0 + (k / 3) * (PI / 2)) * rc, cz + Math.sin(a0 + (k / 3) * (PI / 2)) * rc]);
    ring.push(ring[0]);
    buildRoad(ring.map(([lx, lz]) => aw(lx, lz)), ROAD.ASPHALT, 2.4, '', fieldH);
  }
  buildRoad([aw(GATE_AT.lx - 30, GATE_AT.lz - 14), aw(GATE_AT.lx, GATE_AT.lz), aw(TERMINAL_AT.lx - 26, TERMINAL_AT.lz)], ROAD.ASPHALT, 2.8, '', fieldH);
  // ...and every road of the picture
  const KIND = { main: [ROAD.ASPHALT, 3.6], secondary: [ROAD.ASPHALT, 2.8], dirt: [ROAD.DIRT, 2.4], trail: [ROAD.TRAIL, 1.3], lane: [ROAD.ASPHALT, 2.3] };
  for (const r of ROADS) {
    if (!KIND[r.kind]) continue; // (the airport's perimeter: its own, above)
    const ctrl = r.pts.map(W);
    // (a road the picture runs down to the river ends on its bank: nothing but the bridge's road goes over it)
    while (ctrl.length > 2 && riverAt(...ctrl[ctrl.length - 1]) < RIVER_HW + 5) ctrl.pop();
    while (ctrl.length > 2 && riverAt(...ctrl[0]) < RIVER_HW + 5) ctrl.shift();
    // (...and one it runs up into a mountain ends at its foot, unless it goes through it by a tunnel)
    while (ctrl.length > 2 && cliffAt(...ctrl[ctrl.length - 1]) > -6 && !tunnelOf(...ctrl[ctrl.length - 1], 4)) ctrl.pop();
    while (ctrl.length > 2 && cliffAt(...ctrl[0]) > -6 && !tunnelOf(...ctrl[0], 4)) ctrl.shift();
    // (two points of the picture's ring the city's grid puts on one crossing: once)
    for (let i = ctrl.length - 1; i > 0; i--) if (Math.hypot(ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1]) < 1) ctrl.splice(i, 1);
    // (a road that comes to a crossing of the grid's edge round a corner, where the ring is a curve, goes on in to it:
    // down the street's line to where that comes to the ring, or from the corner itself down the diagonal)
    const inTo = (q) => {
      const [lx, lz] = [q[0] - city.x, q[1] - city.z];
      if (inRing(lx, lz, -0.5) || Math.max(Math.abs(lx), Math.abs(lz)) > G2 + 0.5) return null;
      if (Math.abs(lx) > G2 - 0.5 && Math.abs(lz) > G2 - 0.5) return [city.x + Math.sign(lx) * RING_DIAG, city.z + Math.sign(lz) * RING_DIAG];
      if (Math.abs(lx) > G2 - 0.5) return [city.x + Math.sign(lx) * ringAt(Math.abs(lz)), q[1]];
      return [q[0], city.z + Math.sign(lz) * ringAt(Math.abs(lx))];
    };
    if (ctrl.length >= 2 && inTo(ctrl[ctrl.length - 1])) ctrl.push(inTo(ctrl[ctrl.length - 1]));
    if (ctrl.length >= 2 && inTo(ctrl[0])) ctrl.unshift(inTo(ctrl[0]));
    if (ctrl.length < 2) continue;
    if (r.name === 'airport spur') ctrl[ctrl.length - 1] = aw(GATE_AT.lx - 30, GATE_AT.lz - 14); // (to the road in through the gate)
    buildRoad(ctrl, KIND[r.kind][0], KIND[r.kind][1], r.name);
  }
  // the outer ring (after the picture's roads, which come to the grid's ring across it), and the grid's streets carried
  // on across to it where nothing already crosses there
  {
    const hitsRoad = (x, z) => roads.some((r) => r.width < 6 && (() => {
      const p = r.pts;
      for (let k = 0; k < p.length; k += 2) if (Math.abs(p[k] - x) < 5 && Math.abs(p[k + 1] - z) < 5) return true;
      return false;
    })());
    const outer = [];
    for (let a = -BAND_A; a <= BAND_A + 1e-6; a += PI / 180) outer.push([city.x + Math.cos(a) * rOut(a), city.z + Math.sin(a) * rOut(a)]);
    buildRoad(outer, ROAD.ASPHALT, 3.5, 'Outer Ring', cityH); // (a town's road: no pile-up, billboard or pole line of the highways' along it)
    const across = (lx, lz, ux, uz) => {
      let d = 0;
      while (d < 80 && Math.hypot(lx + ux * d, lz + uz * d) < rOut(Math.atan2(lz + uz * d, lx + ux * d))) d += 0.5;
      return d;
    };
    for (let i = 1; i < GRID; i++) {
      const o = -G2 + i * PITCH;
      const e = ringAt(Math.abs(o));
      for (const [lx, lz, ux, uz] of [[o, -e, 0, -1], [o, e, 0, 1], [e, o, 1, 0]]) {
        const d = across(lx, lz, ux, uz);
        const mx = city.x + lx + (ux * d) / 2, mz = city.z + lz + (uz * d) / 2;
        if (d < 18 || hitsRoad(mx, mz)) continue;
        buildRoad([[city.x + lx, city.z + lz], [city.x + lx + ux * (d + 1), city.z + lz + uz * (d + 1)]], ROAD.ASPHALT, 3.4, '', cityH);
      }
    }
  }
  // a place the picture's roads pass near but do not reach has a track of its own down to the nearest of them
  for (const zn of zones) {
    if (zn.id === ZONE.CITY || zn.id === ZONE.LIGHTHOUSE || zn.id === ZONE.BRIDGEHEAD) continue;
    let best = null;
    let bd = Infinity;
    for (const r of roads) {
      if (r.width > 6) continue;
      for (let k = 0; k < r.pts.length; k += 2) {
        const d = Math.hypot(r.pts[k] - zn.x, r.pts[k + 1] - zn.z);
        if (d < bd) {
          bd = d;
          best = [r.pts[k], r.pts[k + 1], r.hs[k >> 1]];
        }
      }
    }
    if (!best || bd < zn.flat + 4) continue;
    const ux = (best[0] - zn.x) / bd;
    const uz = (best[1] - zn.z) / bd;
    buildRoad([[zn.x + ux * (zn.flat + 1), zn.z + uz * (zn.flat + 1)], [zn.x + ux * (zn.flat + 7), zn.z + uz * (zn.flat + 7)], [best[0], best[1]]], ROAD.DIRT, 2.4, '', null, best[2]);
  }
  // the far portal of the passage under the river: the picture's track from it ends in the woods, so a track runs on
  // from its end to the nearest road of the airfield's side - whoever comes up out of the mines walks it to the
  // airfield (it was the woods). The nearest point of a road the straight way to which crosses neither the river nor
  // a mountain, of a road that is not one of the mines' own tracks
  {
    // (the end of the road that reaches the portal, the end further from it; or the portal itself)
    let from = passageE;
    for (const r of roads) {
      const n = r.pts.length;
      const d0 = Math.hypot(r.pts[0] - passageE[0], r.pts[1] - passageE[1]);
      const d1 = Math.hypot(r.pts[n - 2] - passageE[0], r.pts[n - 1] - passageE[1]);
      if (Math.min(d0, d1) < 25 && r.length > 40) from = d0 < d1 ? [r.pts[n - 2], r.pts[n - 1], r] : [r.pts[0], r.pts[1], r];
    }
    // (found over the ground, round what is in the way: a grid of 8 m cells, none in a mountain, the river, the lake
    // or the sea, a steep one dear; to the first cell a road of another kind passes through)
    const C8 = 8, NC = Math.ceil(SIZE / C8);
    const ci = (x) => clamp(Math.floor((x + HALF) / C8), 0, NC - 1);
    const roadCell = new Map();
    for (const r of roads) {
      if (r === from[2] || /^mine /.test(r.name || '') || r.width > 6) continue;
      for (let k = 0; k < r.pts.length; k += 2) roadCell.set(ci(r.pts[k + 1]) * NC + ci(r.pts[k]), [r.pts[k], r.pts[k + 1], r.hs[k >> 1]]);
    }
    const ok = new Map();
    const pass = (k) => {
      let v = ok.get(k);
      if (v === undefined) {
        const x = -HALF + ((k % NC) + 0.5) * C8, z = -HALF + (((k / NC) | 0) + 0.5) * C8;
        v = cliffAt(x, z) < -10 && riverAt(x, z) > RIVER_HW + 8 && lakeAt(x, z) < -6 && seaAt(x, z) < -6 && !tunnelOf(x, z, 8) && Math.abs(x) < HALF - 20 && Math.abs(z) < HALF - 20;
        // (round a place's yard, not through what will stand in it - out of the one it starts in by the shortest way)
        if (v && Math.hypot(x - from[0], z - from[1]) > 24) v = zones.every((zn) => Math.hypot(x - zn.x, z - zn.z) > zn.flat + 4);
        ok.set(k, v);
      }
      return v;
    };
    const cost = new Map(), prev = new Map(), open = [];
    const s0 = ci(from[1]) * NC + ci(from[0]);
    cost.set(s0, 0);
    open.push([0, s0]);
    let goal = -1;
    for (let guard = 0; open.length && guard < 200000; guard++) {
      let bi = 0;
      for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
      const [c, k] = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (c > cost.get(k)) continue;
      if (roadCell.has(k) && c > 30) { goal = k; break; }
      const kx = k % NC, kz = (k / NC) | 0;
      for (const [dx, dz, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
        const nx = kx + dx, nz = kz + dz;
        if (nx < 0 || nz < 0 || nx >= NC || nz >= NC) continue;
        const m = nz * NC + nx;
        if (!pass(m)) continue;
        const h0 = rawH(-HALF + (kx + 0.5) * C8, -HALF + (kz + 0.5) * C8), h1 = rawH(-HALF + (nx + 0.5) * C8, -HALF + (nz + 0.5) * C8);
        const nc = c + w * C8 * (1 + 6 * Math.max(0, Math.abs(h1 - h0) / (w * C8) - 0.08));
        if (nc < (cost.get(m) ?? Infinity)) { cost.set(m, nc); prev.set(m, k); open.push([nc, m]); }
      }
    }
    if (goal >= 0) {
      const cells = [];
      for (let k = goal; k !== undefined; k = prev.get(k)) cells.push(k);
      cells.reverse();
      const ctrl = [[from[0], from[1]]];
      for (let q = 3; q < cells.length - 1; q += 3) ctrl.push([-HALF + ((cells[q] % NC) + 0.5) * C8, -HALF + (((cells[q] / NC) | 0) + 0.5) * C8]);
      const end = roadCell.get(goal);
      ctrl.push([end[0], end[1]]);
      buildRoad(ctrl, ROAD.DIRT, 2.4, 'track from the mines', null, end[2]);
    }
  }
  // the docks' own: the quay road along the waterfront and the road in to it from the city's south-west corner (the
  // picture's road out of the ring there runs in from it down the diagonal)
  buildRoad([[docks.x - 40, docks.z - 120], [docks.x - 40, docks.z], [docks.x - 38, docks.z + 118]], ROAD.ASPHALT, 2.8, '', zoneById[ZONE.INDUSTRIAL].h);
  buildRoad([[city.x - G2, city.z + G2], [docks.x - 10, city.z + G2], [docks.x - 40, city.z + G2]], ROAD.ASPHALT, 2.8, '');

  // roads into the heightfield (as world.js does it)
  const ROAD_BLEND = 7.5;
  for (const road of roads) {
    const p = road.pts;
    const reach = road.width + ROAD_BLEND;
    for (let s = 0; s < p.length / 2 - 1; s++) {
      const ax = p[s * 2];
      const az = p[s * 2 + 1];
      const ex = p[s * 2 + 2] - ax;
      const ez = p[s * 2 + 3] - az;
      const el2 = ex * ex + ez * ez || 1;
      const el = Math.sqrt(el2);
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - reach + HALF) / GRID_STEP));
      const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, ax + ex) + reach + HALF) / GRID_STEP));
      const j0 = Math.max(0, Math.floor((Math.min(az, az + ez) - reach + HALF) / GRID_STEP));
      const j1 = Math.min(N - 1, Math.ceil((Math.max(az, az + ez) + reach + HALF) / GRID_STEP));
      for (let j = j0; j <= j1; j++) {
        const z = -HALF + j * GRID_STEP;
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * GRID_STEP;
          const t = clamp(((x - ax) * ex + (z - az) * ez) / el2, 0, 1);
          const d = Math.hypot(x - ax - ex * t, z - az - ez * t) - (road.width - 2.6);
          const k = j * N + i;
          if (riverD[k] < RIVER_HW + 0.6) continue; // (the river runs on under its bridge)
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
  // (...but not into the yard of a place a road runs past: the yard keeps its level, and a road in it is at that level)
  const yardOf = (x, z) => zones.find((zn) => zn.id !== ZONE.CITY && Math.hypot(x - zn.x, z - zn.z) < zn.flat - 1);
  for (let k = 0; k < N * N; k++) {
    const d = roadDist[k];
    if (d >= 2.6 + ROAD_BLEND) continue;
    const yd = yardOf(-HALF + (k % N) * GRID_STEP, -HALF + Math.floor(k / N) * GRID_STEP);
    if (yd && d > 3) continue;
    heights[k] = lerp(heights[k], roadH[k] - 0.05, 1 - smoothstep(3, 2.6 + ROAD_BLEND, d));
  }

  const heightAt = heightSampler(heights, N, HALF); // (triangle-consistent, as the mesh is split)

  return { roads, highway, heightAt };
}
