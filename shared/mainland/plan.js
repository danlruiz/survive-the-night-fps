// Where everything on the mainland is (mainland.js), before any of it is built: the city's frame and grid, its ring
// roads, the airport's frame, the sea, the lake and the islets, the river and the creek, the mountains and the
// tunnels through them, the forest, and the places (zones) - all from the picture (mainland-layout.js).
import { GRID_STEP } from '../constants.js';
import { ZONE } from '../defs.js';
import { fbm, smoothstep, lerp, clamp } from '../rng.js';
import { OUTLYING } from '../mainland-places.js';
import { SEA, LAKE, RIVER, CREEK, MOUNTAINS, TUNNELS, PLACES, FOREST } from '../mainland-layout.js';
import { fillPolys, signedDistance, signedDistanceNear, decodeForest, lineDist } from '../mainland-ground.js';
import { nearestSampler } from '../heightfield.js';
import { SIZE, HALF, N, PITCH, GRID, CITY_R, RIVER_HW, RIVER_REACH, CUT_HW, CUT_LEN, RUNWAY_LEN, FX, P } from './consts.js';

const PI = Math.PI;

// which way the river runs at (x, z), and how far from its bank (riverAt): { d, dx, dz, cx, cz } (and the nearest
// point of its middle line: cx, cz). riverP: its middle line [x, z, ...]
function riverFlow(riverP, riverAt) {
  return (x, z) => {
    const { leg, t } = lineDist(riverP, x, z);
    const ex = riverP[leg * 2 + 2] - riverP[leg * 2];
    const ez = riverP[leg * 2 + 3] - riverP[leg * 2 + 1];
    const el = Math.hypot(ex, ez) || 1;
    return { d: riverAt(x, z), dx: ex / el, dz: ez / el, cx: riverP[leg * 2] + ex * t, cz: riverP[leg * 2 + 1] + ez * t };
  };
}

// how thick the forest is at (x, z), 0 none .. 1 dense (FOR: the picture's grid of it, decoded)
function forestField(FOR) {
  return (x, z) => {
    const n = FOREST.n;
    const fx = clamp(((x + HALF) / SIZE) * n - 0.5, 0, n - 1.001);
    const fz = clamp(((z + HALF) / SIZE) * n - 0.5, 0, n - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const a = FOR[j * n + i] + (FOR[j * n + i + 1] - FOR[j * n + i]) * u;
    const b = FOR[(j + 1) * n + i] + (FOR[(j + 1) * n + i + 1] - FOR[(j + 1) * n + i]) * u;
    return (a + (b - a) * v) / 9;
  };
}

// nP: one of the mainland's noise fields (the mountains' outlines wobble with it). The world keeps seaAt, lakeAt,
// riverAt, flow, cliffAt and forestAt: each is made apart, so none of them holds the grids only the building needs.
export function planMainland({ nP }) {
  const G2 = (GRID * PITCH) / 2; // from the middle of the city to its edge streets
  // Town Center: the picture's grid inside its ring road. The city's grid of GRID x GRID blocks stands where that is
  // (its edge streets are the ring road), and a road of the picture that comes to the ring comes to the city's edge
  // at the same place along it - on the street nearest that, so it carries on down one.
  const RING = [0.257, 0.397, 0.402, 0.528];
  const city = { x: FX(0.3295), z: FX(0.455) };
  const onRing = (p) => p[0] >= RING[0] - 0.006 && p[0] <= RING[2] + 0.006 && p[1] >= RING[1] - 0.006 && p[1] <= RING[3] + 0.006;
  const snap = (v) => Math.round(v / PITCH) * PITCH;
  // (the city's grid is a little bigger than the picture's ring: what stands just outside the ring is pushed out with
  // it, less and less the further out it is, so that it stays outside the city and nothing further off moves)
  const RC = [(RING[0] + RING[2]) / 2, (RING[1] + RING[3]) / 2];
  const RH = [(RING[2] - RING[0]) / 2, (RING[3] - RING[1]) / 2];
  const GROW = [G2 / (RH[0] * SIZE), G2 / (RH[1] * SIZE)];
  const WARP = 0.07; // (fractions of the map past the ring where the push has died away)
  const W = (p) => {
    if (!onRing(p)) {
      const d = Math.hypot(Math.max(0, Math.abs(p[0] - RC[0]) - RH[0]), Math.max(0, Math.abs(p[1] - RC[1]) - RH[1]));
      if (d >= WARP) return P(p);
      const t = smoothstep(0, WARP, d);
      const at = (k) => FX(RC[k]) + (p[k] - RC[k]) * SIZE * lerp(GROW[k], 1, t) + (k ? city.z - FX(RC[1]) : city.x - FX(RC[0])) * (1 - t);
      return [at(0), at(1)];
    }
    let lx = ((clamp(p[0], RING[0], RING[2]) - RING[0]) / (RING[2] - RING[0])) * GRID * PITCH - G2;
    let lz = ((clamp(p[1], RING[1], RING[3]) - RING[1]) / (RING[3] - RING[1])) * GRID * PITCH - G2;
    // (on the ring: out to the edge street it is on, along it to the nearest crossing)
    const ex = Math.min(lx + G2, G2 - lx);
    const ez = Math.min(lz + G2, G2 - lz);
    if (ex < ez) {
      lx = lx < 0 ? -G2 : G2;
      lz = snap(lz);
    } else {
      lz = lz < 0 ? -G2 : G2;
      lx = snap(lx);
    }
    return [city.x + lx, city.z + lz];
  };
  const zb = FX(0.443); // where the bridge comes ashore...
  const SHORE = FX(0.2); // ...and the shore it comes to there
  const head = { x: SHORE + 44, z: zb };
  const inCity = (x, z, pad) => Math.abs(x - city.x) < G2 + pad && Math.abs(z - city.z) < G2 + pad;
  // The picture's Town Center: a plain grid, and in its middle a square, the town hall on it. The four blocks round
  // the middle are the square (Main Street runs through it; the cross street does not). (bi, bj: a block's column and
  // row.) The blocks on the diagonals once had avenues through them, corner to corner, out to the ring: they are
  // ordinary blocks now, of small lots, and come last in the blocks' shuffle so that it deals the others as it did.
  const SQ0 = GRID / 2 - 1, SQ1 = GRID / 2;
  const onSquare = (bi, bj) => bi >= SQ0 && bi <= SQ1 && bj >= SQ0 && bj <= SQ1;
  const onDiagonal = (bi, bj) => !onSquare(bi, bj) && (bi === bj || bi + bj === GRID - 1);
  // ...and its ring road is no square: as the picture draws it, it runs down the grid's edges and rounds each corner on
  // a curve of RING_R about the square's corner (RING_C in from the edge each way). Inside a corner the ring takes
  // the corner block and the outer corner of the two blocks beside it, whose paving follows the curve and whose lot
  // there is given up. (lx, lz: in the city's frame)
  const RING_R = 2 * PITCH;
  const RING_C = G2 - RING_R;
  const ringAt = (a) => (a <= RING_C ? G2 : RING_C + Math.sqrt(Math.max(0, RING_R * RING_R - (Math.min(a, G2) - RING_C) ** 2))); // (how far out the ring is, at |x| (or |z|) = a)
  const inRing = (lx, lz, margin = 0) => {
    const ax = Math.abs(lx), az = Math.abs(lz);
    if (ax > RING_C && az > RING_C) return Math.hypot(ax - RING_C, az - RING_C) <= RING_R - margin;
    return ax <= G2 - margin && az <= G2 - margin;
  };
  const RING_DIAG = RING_C + RING_R / Math.SQRT2; // (where the ring crosses a diagonal, each way from the middle)
  // ...and round it all the outer ring, as the picture draws the town's: out past the grid's own ring by thirty to fifty
  // metres to the north, the east and the south, never the same width twice, and into it on the west, where the bridge
  // and the docks come. Between the two the suburbs' lanes and houses come up to the grid. (a: the angle from the
  // middle, atan2(lz, lx))
  const RIN = new Float32Array(721); // (how far out the grid's ring is, every half degree)
  for (let k = 0; k <= 720; k++) {
    const a = (k / 720) * 2 * PI - PI;
    let lo = 0, hi = 260;
    for (let it = 0; it < 30; it++) {
      const m = (lo + hi) / 2;
      if (inRing(Math.cos(a) * m, Math.sin(a) * m, 0)) lo = m;
      else hi = m;
    }
    RIN[k] = lo;
  }
  const rIn = (a) => {
    const f = ((a + PI) / (2 * PI)) * 720;
    const k = Math.max(0, Math.min(719, Math.floor(f)));
    return RIN[k] + (RIN[k + 1] - RIN[k]) * (f - k);
  };
  const BAND_A = 0.7 * PI; // (past this angle either way - the west - the two rings are one)
  const bandW = (a) => (1 - smoothstep(0.52 * PI, BAND_A, Math.abs(a))) * (40 + 7 * Math.sin(3 * a + 1) + 5 * Math.sin(5 * a + 2));
  const rOut = (a) => rIn(a) + bandW(a);
  const goneBlock = (bi, bj) => (bi === 0 || bi === GRID - 1) && (bj === 0 || bj === GRID - 1); // (a corner: the ring's)
  const trimBlock = (bi, bj) => !goneBlock(bi, bj) && (bi === 0 || bi === GRID - 1 || bj === 0 || bj === GRID - 1) && (bi <= 1 || bi >= GRID - 2) && (bj <= 1 || bj >= GRID - 2);
  const cityW = [city.x - G2, city.z];
  const cityE = [city.x + G2, city.z];

  // ---- the airport: the runway's frame. The picture's runway runs from AIR_S (its south end) to AIR_N
  const AIR_S = P(PLACES.rwS);
  const AIR_N = P(PLACES.rwN);
  const AIR = { x: (AIR_S[0] + AIR_N[0]) / 2, z: (AIR_S[1] + AIR_N[1]) / 2, ry: Math.atan2(-(AIR_N[0] - AIR_S[0]), -(AIR_N[1] - AIR_S[1])) };
  const ac = Math.cos(AIR.ry);
  const as = Math.sin(AIR.ry);
  // the airport's frame -> world, and back (as a Builder at AIR turned by AIR.ry has it)
  const aw = (lx, lz) => [AIR.x + ac * lx + as * lz, AIR.z - as * lx + ac * lz];
  const al = (x, z) => [ac * (x - AIR.x) - as * (z - AIR.z), as * (x - AIR.x) + ac * (z - AIR.z)];
  const field = { x: AIR.x, z: AIR.z };
  const plane = aw(0, RUNWAY_LEN / 2 - 26);
  const APRON = { lx: 44, lz: 62, hx: 30, hz: 70 }; // (a rectangle of concrete east of the runway's south half)
  const HANGARS_AT = { lx: 96, lz: 70 };
  const TERMINAL_AT = { lx: -76, lz: -96 };
  const DEPOT_AT = { lx: 168, lz: -84 };
  const GATE_AT = { lx: -106, lz: -96 }; // where the road in from East Pass comes through the perimeter
  const FENCE = { x0: -100, x1: 128, z0: -176, z1: 172 }; // the perimeter, in the runway's frame (its south-west corner is the river's bank)
  const onField = (x, z, pad) => {
    const [lx, lz] = al(x, z);
    return lx > FENCE.x0 - pad && lx < FENCE.x1 + pad && lz > FENCE.z0 - pad && lz < FENCE.z1 + pad;
  };

  // ---- the water. The sea and the lake are the picture's outlines filled onto the heightfield; sd: signed distance
  // from their shore in metres (positive out on the water)
  const toW = (polys) => polys.map((poly) => poly.map(P));
  let seaMask = fillPolys(toW(SEA), N, GRID_STEP, HALF);
  let lakeMask = fillPolys(toW(LAKE), N, GRID_STEP, HALF);
  const seaD = signedDistance(seaMask, N, GRID_STEP, 160);
  const lakeD = signedDistanceNear(lakeMask, N, GRID_STEP, 80);
  const vi = (x) => clamp(Math.round((x + HALF) / GRID_STEP), 0, N - 1);
  const seaAt = nearestSampler(seaD, N, HALF);
  const lakeAt = nearestSampler(lakeD, N, HALF);
  // the islets: land the mainland's own does not join (a flood fill of the land from the middle of the city), 1 in the
  // sea, 2 in Pine Lake
  let islets = new Uint8Array(N * N);
  {
    const q = new Int32Array(N * N);
    const seen = new Uint8Array(N * N);
    let tail = 0;
    const k0 = vi(city.z) * N + vi(city.x);
    seen[k0] = 1;
    q[tail++] = k0;
    for (let h = 0; h < tail; h++) {
      const k = q[h];
      const i = k % N;
      for (let m = 0; m < 4; m++) {
        const nk = m === 0 ? (i > 0 ? k - 1 : -1) : m === 1 ? (i < N - 1 ? k + 1 : -1) : m === 2 ? k - N : k + N;
        if (nk < 0 || nk >= N * N || seen[nk] || seaMask[nk] || lakeMask[nk]) continue;
        seen[nk] = 1;
        q[tail++] = nk;
      }
    }
    for (let k = 0; k < N * N; k++) if (!seen[k] && !seaMask[k] && !lakeMask[k]) islets[k] = lakeD[k] > seaD[k] ? 2 : 1;
  }
  const isletAt = nearestSampler(islets, N, HALF);
  // The river: a line through the picture's points (a point every few metres), run on past the south edge. riverD:
  // how far every vertex of the heightfield is from its bank, as if it were RIVER_HW wide everywhere (its width
  // changes as the picture's does; out to 110 m, further is 1e4).
  const riverPts = [];
  const riverW = [];
  {
    const ctrl = RIVER.map(([x, y, w]) => [FX(x), FX(y), Math.max(6.5, w * SIZE)]);
    const last = ctrl[ctrl.length - 1];
    const prev = ctrl[ctrl.length - 2];
    const ex = last[0] - prev[0];
    const ez = last[1] - prev[1];
    const el = Math.hypot(ex, ez);
    ctrl.push([last[0] + (ex / el) * 60, last[1] + (ez / el) * 60, last[2]]);
    for (let i = 0; i < ctrl.length - 1; i++) {
      const [p0, p1, p2, p3] = [ctrl[Math.max(0, i - 1)], ctrl[i], ctrl[i + 1], ctrl[Math.min(ctrl.length - 1, i + 2)]];
      const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
        riverPts.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
        riverW.push(lerp(p1[2], p2[2], t));
      }
    }
    riverPts.push(ctrl[ctrl.length - 1][0], ctrl[ctrl.length - 1][1]);
    riverW.push(ctrl[ctrl.length - 1][2]);
  }
  // (out to RIVER_REACH from its banks - nothing asks further than 30 m - and 1e4 past that)
  const riverD = new Float32Array(N * N).fill(1e4);
  const reach = RIVER_REACH + Math.max(0, Math.max(...riverW) - RIVER_HW);
  for (let s = 0; s < riverPts.length / 2 - 1; s++) {
    const [ax, az, bx, bz] = [riverPts[s * 2], riverPts[s * 2 + 1], riverPts[s * 2 + 2], riverPts[s * 2 + 3]];
    const el2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + HALF) / GRID_STEP));
    const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + HALF) / GRID_STEP));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + HALF) / GRID_STEP));
    const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + HALF) / GRID_STEP));
    for (let j = j0; j <= j1; j++) {
      const z = -HALF + j * GRID_STEP;
      for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * GRID_STEP;
        const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / el2, 0, 1);
        const ex = x - ax - (bx - ax) * t;
        const ez = z - az - (bz - az) * t;
        const w = lerp(riverW[s], riverW[s + 1], t) - RIVER_HW;
        const lim = Math.min(RIVER_REACH, riverD[j * N + i]) + w; // (no nearer than what is there already: no root taken)
        if (lim <= 0 || ex * ex + ez * ez >= lim * lim) continue;
        const d = Math.hypot(ex, ez) - w;
        if (d < RIVER_REACH && d < riverD[j * N + i]) riverD[j * N + i] = d;
      }
    }
  }
  const riverAt = nearestSampler(riverD, N, HALF);
  const flow = riverFlow(new Float32Array(riverPts), riverAt);
  const creekP = new Float32Array(CREEK.flatMap(P));
  const creekBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < creekP.length; k += 2) creekBox.splice(0, 4, Math.min(creekBox[0], creekP[k] - 16), Math.min(creekBox[1], creekP[k + 1] - 16), Math.max(creekBox[2], creekP[k] + 16), Math.max(creekBox[3], creekP[k + 1] + 16));
  const creekAt = (x, z) => (x < creekBox[0] || z < creekBox[1] || x > creekBox[2] || z > creekBox[3] ? 1e4 : lineDist(creekP, x, z).d);

  // ---- the mountains: every outline filled (one over another is still mountain), less the river's deep water where it
  // runs at their foot. tunnels: where a road goes through one, the corridor it is cut along.
  // (a foot is no straight line between the points it was traced by: every outline is cut into lengths of WOB_LEN and
  // each point moved in or out along the outline's normal by up to WOB metres, by a noise of the ground there)
  let mtnMask = new Uint8Array(N * N);
  const WOB = 9;
  const WOB_LEN = 6;
  for (const m of MOUNTAINS) {
    const pts = m.pts.map(P);
    const out = [];
    for (let a = 0; a < pts.length; a++) {
      const [ax, az] = pts[a];
      const [bx, bz] = pts[(a + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / WOB_LEN));
      for (let k = 0; k < steps; k++) {
        const x = ax + ((bx - ax) * k) / steps;
        const z = az + ((bz - az) * k) / steps;
        // (out along the edge's normal; on the map's edge the outline stays where it is)
        const w = Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1 ? 0 : WOB * fbm(nP, x * 0.016 + 11.1, z * 0.016 - 5.5, 2);
        out.push([x - ((bz - az) / (len || 1)) * w, z + ((bx - ax) / (len || 1)) * w]);
      }
    }
    fillPolys([out], N, GRID_STEP, HALF, mtnMask, true);
  }
  // (the river's deep water is no mountain; its banks under a cliff are, so the wall at a cliff's foot stands in the
  // water and no strip of bank runs along under it)
  for (let k = 0; k < N * N; k++) if (riverD[k] < RIVER_HW - 2.5 || seaMask[k] || lakeMask[k]) mtnMask[k] = 0;
  const tunnels = TUNNELS.map((t) => {
    const a = P(t.a);
    const b = P(t.b);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { name: t.name, a, b, len, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len };
  });
  // how far (x, z) is from the line of a tunnel's road and along it (from mouth a), over its cuttings
  const tunnelOf = (x, z, pad = 0) => {
    for (const t of tunnels) {
      const s = (x - t.a[0]) * t.dx + (z - t.a[1]) * t.dz;
      if (s < -CUT_LEN - pad || s > t.len + CUT_LEN + pad) continue;
      const lat = Math.abs(-(x - t.a[0]) * t.dz + (z - t.a[1]) * t.dx);
      if (lat < CUT_HW + pad) return { t, s, lat };
    }
    return null;
  };
  let cut = new Uint8Array(N * N); // the corridors, where they are in a mountain
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (mtnMask[k] && tunnelOf(-HALF + i * GRID_STEP, -HALF + j * GRID_STEP)) cut[k] = 1;
    }
  }
  let wallMask = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) wallMask[k] = mtnMask[k] && !cut[k] ? 1 : 0;
  const mtnD = signedDistance(wallMask, N, GRID_STEP, 260);
  // The heights go by the mountains as they are drawn, the tunnels' corridors and all (mtnH): the mountain is whole
  // up to the edge of a corridor, which is cut down into it afterwards, and the cap over the gallery is that whole
  // mountain (below). The walls, and everything that asks how far it is inside a mountain (cliffAt), go by the
  // mountains less the corridors (mtnD).
  // (near a foot the distance is smoothed - a 5 x 5 box, twice - so that the cliff over it does not rise in 2 m steps
  // where the foot runs aslant of the grid)
  const mtnH = signedDistance(mtnMask, N, GRID_STEP, 260);
  for (let pass = 0; pass < 2; pass++) {
    const src = mtnH.slice();
    for (let j = 2; j < N - 2; j++) {
      for (let i = 2; i < N - 2; i++) {
        const k = j * N + i;
        if (src[k] > 24 || src[k] < -24) continue;
        let s = 0;
        for (let dj = -2 * N; dj <= 2 * N; dj += N) s += src[k + dj - 2] + src[k + dj - 1] + src[k + dj] + src[k + dj + 1] + src[k + dj + 2];
        mtnH[k] = s / 25;
      }
    }
  }
  const cliffAt = nearestSampler(mtnD, N, HALF);
  const mtnAt = nearestSampler(mtnH, N, HALF);

  // ---- the forest of the picture, as a field over the map (0 none .. 1 dense)
  const forestAt = forestField(decodeForest(FOREST));

  // ---- the places. Each where the picture has it, on ground of its own (flat: how far it is levelled)
  const spots = [];
  const spot = (id, at, flat, ry = 0, more = {}) => {
    const sp = { id, x: at[0], z: at[1], flat, ry, ...more };
    spots.push(sp);
    return sp;
  };
  // (which way a place faces: its front (-Z) to a point, a quarter turn at a time - its walls lie along the nav grid)
  const facing = (from, to) => Math.round(Math.atan2(from[0] - to[0], from[1] - to[1]) / (PI / 2)) * (PI / 2);
  spot(ZONE.BRIDGEHEAD, [head.x, head.z], 26, -PI / 2);
  const docks = spot(ZONE.INDUSTRIAL, P([0.222, 0.565]), 58, 0);
  spot(ZONE.SUBURB, W(PLACES.suburbsNE), 44, 0);
  spot(ZONE.WESTGATE, W(PLACES.suburbsE), 44, 0);
  spot(ZONE.NORTH_COAST, P([0.212, 0.142]), 52, 0);
  const gas = W([0.512, 0.596]);
  spot(ZONE.TRUCKSTOP, gas, 30, facing(gas, W([0.507, 0.612])));
  spot(ZONE.OUTPOST, P([0.903, 0.152]), 50, 0);
  spot(ZONE.TERMINAL, aw(TERMINAL_AT.lx, TERMINAL_AT.lz), 30, AIR.ry + PI / 2);
  spot(ZONE.HANGARS, aw(HANGARS_AT.lx, HANGARS_AT.lz), 50, AIR.ry + PI / 2); // (their doors face west: the apron)
  spot(ZONE.FUEL_DEPOT, aw(DEPOT_AT.lx, DEPOT_AT.lz), 31, AIR.ry - PI / 2); // (to the corners of its fence)
  spot(ZONE.AGGREGATES, P([0.585, 0.834]), OUTLYING[ZONE.AGGREGATES].flat, 0);
  spot(ZONE.PASSAGE, P([0.833, 0.788]), 34, 0);
  spot(ZONE.SOUTH_FOREST, P(PLACES.camp1), 14, 0);
  {
    const lh = P(PLACES.lighthouse);
    spot(ZONE.LIGHTHOUSE, lh, 12, facing(lh, P([0.098, 0.718]))); // (its front to the islet's middle)
  }
  // the picture's lesser buildings: the marina's dock on the lake's south shore, the cabins and the logging road on
  // its east shore, the firehouse's yard east of the suburbs
  {
    const m = P(PLACES.marinaS);
    const lc = P(PLACES.lake);
    spot(ZONE.MARINA, m, OUTLYING[ZONE.MARINA].flat, Math.atan2(lc[0] - m[0], lc[1] - m[1]), { fixed: true }); // (its pier, +Z, out over the water)
  }
  {
    const lc = P([0.630, 0.236]);
    spot(ZONE.LOGGING, lc, OUTLYING[ZONE.LOGGING].flat, facing(lc, P([0.626, 0.214]))); // (between the lake and the Ridge, its front to the road)
  }
  spot(ZONE.FIREHOUSE, W([0.569, 0.541]), OUTLYING[ZONE.FIREHOUSE].flat, 0);
  const camps = [P(PLACES.camp2), P(PLACES.camp3)];
  // the portals of the South Passage Mines (the workings are cut once everything else stands: below)
  const passageW = P(PLACES.mineB);
  const passageE = P([0.805, 0.8]); // (the other two camps of South Forest: sites, below)

  const zones = [];
  const put = (id, x, z, ry, spec) => zones.push({ id, x, z, ry, h: 0, blend: 26, ...spec });
  put(ZONE.CITY, city.x, city.z, 0, { flat: CITY_R, clear: CITY_R + 6, blend: 34, dirt: 1 });
  const SPECS = {
    [ZONE.BRIDGEHEAD]: { clear: 30, dirt: 0.35, blend: 22 }, // (its front faces east: inland)
    [ZONE.INDUSTRIAL]: { clear: 62, dirt: 0.8, blend: 20 },
    [ZONE.SUBURB]: { clear: 0, dirt: 0.15, blend: 40 },
    [ZONE.WESTGATE]: { clear: 0, dirt: 0.15, blend: 40 },
    [ZONE.NORTH_COAST]: { clear: 0, dirt: 0.2, blend: 30 },
    [ZONE.TRUCKSTOP]: { clear: 34, dirt: 0.3 },
    [ZONE.OUTPOST]: { clear: 16, dirt: 0.5 }, // (the woods come up to its wire: inside it is cleared, below)
    [ZONE.TERMINAL]: { clear: 36 }, // (its front faces west: the road in)
    [ZONE.HANGARS]: { clear: 54 },
    [ZONE.FUEL_DEPOT]: { clear: 32, dirt: 0.5 },
    [ZONE.PASSAGE]: { clear: 30, dirt: 0.7 },
    [ZONE.SOUTH_FOREST]: { clear: 10, dirt: 0.3, blend: 10 },
    [ZONE.LIGHTHOUSE]: { clear: 10, dirt: 0.2, blend: 6 },
  };
  for (const sp of spots) {
    const o = OUTLYING[sp.id];
    put(sp.id, sp.x, sp.z, sp.ry, { flat: sp.flat, fixed: sp.fixed, ...(o ? { clear: o.clear, dirt: o.dirt, raise: o.raise, inner: o.inner, street: o.street } : SPECS[sp.id]) });
  }
  const zoneById = {};
  for (const z of zones) zoneById[z.id] = z;
  // the lake, for whatever asks where it is (its middle and how far its shore is from that, about)
  const lake = { x: FX(PLACES.lake[0]), z: FX(PLACES.lake[1]), r: 0.1 * SIZE };
  const ponds = [];

  return { G2, city, W, zb, SHORE, head, inCity, SQ0, SQ1, onSquare, onDiagonal, RING_R, RING_C, ringAt, inRing, RING_DIAG, BAND_A, rOut, goneBlock, trimBlock, cityW, cityE, AIR, aw, al, field, plane, APRON, TERMINAL_AT, GATE_AT, FENCE, onField, seaMask, lakeMask, vi, seaAt, lakeAt, islets, isletAt, riverPts, riverD, riverAt, flow, creekP, creekAt, mtnMask, tunnels, tunnelOf, cut, wallMask, mtnH, cliffAt, mtnAt, forestAt, facing, docks, camps, passageW, passageE, zones, zoneById, lake, ponds };
}
