// The mainland: the second map of a run (act 2, shared/acts.js), built from the same seed as the island the team
// escaped from and with the same kit (worldkit.js), so it is drawn, walked and fought on by the code that runs the
// island. Its layout is "Mainland Layout 12" (issue #232), one to one: mainland-layout.js holds the picture's coast,
// islands, lake, river, mountains, tunnels, roads and places as fractions of the map square, and this file builds
// them at MAINLAND_SIZE (2048 m across). In short:
//
//   the sea and its islands along the west | the bridge from the island comes ashore at the Industrial Docks |
//   Town Center, the two Suburbs, North Coast Village, Pine Lake and the Gas Station on the city side |
//   The Ridge, a range of mountains north to south, and the river down its far side: nobody crosses either |
//   the airport on the far side, reached only by the north road (North Pass, a tunnel; North Ridge Outpost; East
//   Pass) or under the ground (South Forest, the Quarry, the South Passage Mines, under the river)
//
// What a seed changes is what stands in every place and on every lot, and everything scattered: never where a
// place, a road, the coast, the lake, the river or a mountain is.
//
// A world made here has every field createWorld's has (world.js); what the island has and this map does not (the
// railway, the fair, the clinic, the cemetery) is null. On top of those:
//   bridge   where the bridge is (bridge.js): the cutscene drives the car along it, and the client draws it
//   runway   the runway and what stands on it: { x, z, ry (its heading: the plane takes off along -Z turned by it),
//            z0, z1 (its ends along that line, from its middle), half (its half width), y, truck: { x, y, z, ry } }
//   car      is the plane: the thing this act's supplies go into and its final stand is fought at (plane: true)
//   partSpots[i].supply   which of the plane's parts lies there (an index into PLANE_PARTS): they are at set places
//   props[i].live   set on the car at the bridgehead and on the plane: the client draws those two itself, because its
//            cutscenes move them (the car drives to that very spot; the plane is swapped for the one that flies)
//   city     { x, z, pitch, grid, lots: [{ x, z, w, d, ry, what }] }: what was built on every lot of Town Center; and
//            what its buildings are drawn from (buildings, rooms, shells, heaps, fallen, pancakes, signs: see
//            "What the city is drawn from" below, and client/render/citykit.js)
//   parts[i].hidden   a solid that is not drawn as the box it is (the kit draws that building, wall or heap)
//   river    { pts, hw, bridges, flow(x, z) }: its middle line, half its width, where a road crosses it, and its current
//   walls    the outline of every mountain, as the lines its hidden walls stand along: [[x, z, ...], ...]
//   cliffAt(x, z)   how far (x, z) is inside a mountain (m; negative outside it)
//   tunnels  [{ name, a: [x, z], b: [x, z], y0, y1, len }]: the road tunnels, mouth to mouth
//   mine     the South Passage Mines' workings (mine.js), under the river
import { GRID_STEP, WATER_LEVEL } from './constants.js';
import { ZONE, CONT } from './defs.js';
import { PROPS, collidersOf } from './props.js';
import { mulberry32, createNoise2D, fbm, smoothstep, lerp, clamp, hash2 } from './rng.js';
import { makeCyl, makeBox, makeTree, COL } from './collision.js';
import { ROAD } from './layout.js';
import { createKit } from './worldkit.js';
import { WORLD, MAINLAND_SIZE } from './acts.js';
import { POS_SCALE_WIDE } from './protocol.js';
import { planBridge } from './bridge.js';
import { OUTLYING } from './mainland-places.js';
import { SEA, LAKE, RIVER, CREEK, MOUNTAINS, TUNNELS, ROADS, PLACES, AREAS, FOREST } from './mainland-layout.js';
import { fillPolys, signedDistance, signedDistanceNear, decodeForest, lineDist } from './mainland-ground.js';
import { heightSampler, bilinearSampler } from './heightfield.js';
import { groundQueries } from './worldquery.js';
import { createCityKit } from './mainland/citykit.js';
import { cityBuildings } from './mainland/buildings.js';
import { buildCity } from './mainland/city.js';
import { buildDocks } from './mainland/docks.js';
import { buildHomes } from './mainland/homes.js';
import { buildRiverBridges, buildVillage, buildOutpost, buildLighthouse, buildCamps, buildBrokenBridge, buildTruckStop } from './mainland/places.js';
import { buildTunnels, buildWalls } from './mainland/mountains.js';
import { buildAirfield } from './mainland/airfield.js';
import { landReach, placeSites, buildFarm, postRoadSigns, dressMainRoads } from './mainland/sites.js';
import { sinkPassage, dressQuarryPit, buildPassageYard } from './mainland/passage.js';
import { scatterSpawns } from './mainland/spawns.js';
import { mapMainland } from './mainland/fieldmap.js';
import { SIZE, HALF, N, FLOOR, BLUFF, PITCH, GRID, CITY_R, QUAY_LX, QUAY_HZ, LEDGES, SMOKES, FIRES, RIVER_HW, RIVER_REACH, RIVER_BANK, RIVER_DEPTH, RIVER_FLOW, BRIDGE_UP, CREEK_HW, CLIFF, CLIFF_IN, MASS, MASS_IN, PEAK, FOOTHILL, FOOTHILL_IN, CUT_HW, TUNNEL_H, CUT_LEN, RUNWAY_LEN, RUNWAY_HALF, TREE_R, ROCK_R, FX, P } from './mainland/consts.js';

const PI = Math.PI;

export function createMainland(seed) {
  const rng = mulberry32((seed ^ 0x3a17d) >>> 0); // (streams of its own: the island of the same seed draws from others)
  const nA = createNoise2D(seed + 11);
  const nB = createNoise2D(seed + 12);
  const nD = createNoise2D(seed + 14);
  const nE = createNoise2D(seed + 15);
  const nP = createNoise2D(seed + 16);
  const prng = mulberry32((seed ^ 0x9e1b3) >>> 0);

  // ---------------------------------------------------------------- the plan
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
  const seaAt = (x, z) => seaD[vi(z) * N + vi(x)];
  const lakeAt = (x, z) => lakeD[vi(z) * N + vi(x)];
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
  const isletAt = (x, z) => islets[vi(z) * N + vi(x)];
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
  const riverAt = (x, z) => riverD[vi(z) * N + vi(x)];
  // which way the river runs at (x, z), and how far from its bank (as riverAt): { d, dx, dz, cx, cz }
  const riverP = new Float32Array(riverPts);
  // (and the nearest point of its middle line: cx, cz)
  const flow = (x, z) => {
    const { leg, t } = lineDist(riverP, x, z);
    const ex = riverP[leg * 2 + 2] - riverP[leg * 2];
    const ez = riverP[leg * 2 + 3] - riverP[leg * 2 + 1];
    const el = Math.hypot(ex, ez) || 1;
    return { d: riverAt(x, z), dx: ex / el, dz: ez / el, cx: riverP[leg * 2] + ex * t, cz: riverP[leg * 2 + 1] + ez * t };
  };
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
  const cliffAt = (x, z) => mtnD[vi(z) * N + vi(x)];
  const mtnAt = (x, z) => mtnH[vi(z) * N + vi(x)];

  // ---- the forest of the picture, as a field over the map (0 none .. 1 dense)
  const FOR = decodeForest(FOREST);
  const forestAt = (x, z) => {
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
  const quarry = spot(ZONE.AGGREGATES, P([0.585, 0.834]), OUTLYING[ZONE.AGGREGATES].flat, 0);
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

  // ---------------------------------------------------------------- terrain
  // Lowland along the coast that rises into wooded hills inland; the mountains stand out of it on cliffs.
  const relief = (x, z) => fbm(nA, x * 0.0028, z * 0.0028, 4) * 9 + fbm(nB, x * 0.013, z * 0.013, 3) * 2.4 + (1 - Math.abs(nE(x * 0.006 + 5.1, z * 0.006 - 2.3))) ** 2 * 3;
  // the peaks: ridged noise (1 - |n| is sharp along the noise's zero lines: crests), a broad octave for the peaks, a
  // finer one for the spurs off them and a third for the gullies down their faces
  const ridged = (x, z) => {
    const a = 1 - Math.abs(nD(x * 0.0072, z * 0.0072));
    const b = 1 - Math.abs(nE(x * 0.019 + 3.3, z * 0.019 - 7.1));
    const c = 1 - Math.abs(nP(x * 0.047 - 1.9, z * 0.047 + 4.4));
    return a * a * a * 0.62 + b * b * (0.12 + 0.18 * a) + c * c * 0.08;
  };
  const RL = 4;
  const RLN = SIZE / RL + 2;
  let reliefGrid = new Float32Array(RLN * RLN);
  for (let j = 0; j < RLN; j++) for (let i = 0; i < RLN; i++) reliefGrid[j * RLN + i] = relief(-HALF + i * RL, -HALF + j * RL);
  const reliefAt = (x, z) => {
    const fx = clamp((x + HALF) / RL, 0, RLN - 1.001);
    const fz = clamp((z + HALF) / RL, 0, RLN - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const k = j * RLN + i;
    const a = reliefGrid[k] + (reliefGrid[k + 1] - reliefGrid[k]) * (fx - i);
    const b = reliefGrid[k + RLN] + (reliefGrid[k + RLN + 1] - reliefGrid[k + RLN]) * (fx - i);
    return a + (b - a) * (fz - j);
  };
  const H0 = (x, z) => {
    const micro = fbm(nD, x * 0.09, z * 0.09, 2) * 0.22;
    const inland = smoothstep(-10, 260, -seaAt(x, z)); // (how far it is from the sea)
    const hills = 0.35 + forestAt(x, z) * 0.75;
    const a = (FLOOR + 1 + inland * (3 + Math.max(0, reliefAt(x, z)) * hills) - FLOOR) * 0.9;
    return FLOOR + 0.5 * (a + Math.sqrt(a * a + 4)) + micro + foothill(x, z, mtnAt(x, z)) * smoothstep(-10, 80, -seaAt(x, z));
  };
  // inside a mountain: the cliff at its foot, then the range over it - its mass up to the crest, the peaks on that
  // (the cliff is no even band: its height and how far in it climbs come and go along the foot, and over it the
  // mountain goes on up at once; a range rises and falls along its length)
  // A range is a row of peaks, as the picture draws it: pyramids, each of four faces turned its own way (a face is a
  // plane falling away from the summit at PEAK_SLOPE; where two meet is an arete, between two peaks a saddle), put down a
  // PEAK_GAP apart over every mountain where it is wide enough, the higher the further in. The pyramids are held under
  // the range's envelope - the cliff at the foot, then the mass up to the crest - so the foot follows the outline.
  const PEAK_GAP = 64;
  const PEAK_SLOPE = 1.25;
  const peaks = []; // [x, z, height, c0, s0, c1, s1] (the faces' directions: (c0, s0), (c1, s1) and their opposites)
  const peakCells = new Map(); // 128 m cells -> the peaks whose pyramid reaches into them
  {
    const pr = mulberry32((seed ^ 0x51ee7) >>> 0);
    for (let gz = -HALF; gz < HALF; gz += PEAK_GAP) {
      for (let gx = -HALF; gx < HALF; gx += PEAK_GAP) {
        const x = gx + pr() * PEAK_GAP;
        const z = gz + pr() * PEAK_GAP;
        const r0 = pr();
        const a = pr() * PI;
        const t = (pr() - 0.5) * 0.7;
        const d = mtnH[vi(z) * N + vi(x)];
        if (d < 22) continue;
        const h = (Math.min(d, 150) * 1.15 + 70) * (0.72 + 0.56 * r0);
        peaks.push([x, z, h, Math.cos(a), Math.sin(a), Math.cos(a + PI / 2 + t), Math.sin(a + PI / 2 + t)]);
      }
    }
    for (const pk of peaks) {
      const reach = pk[2] / PEAK_SLOPE;
      for (let ci = Math.floor((pk[0] - reach) / 128); ci <= Math.floor((pk[0] + reach) / 128); ci++) {
        for (let cj = Math.floor((pk[1] - reach) / 128); cj <= Math.floor((pk[1] + reach) / 128); cj++) {
          const key = ci * 1024 + cj;
          if (!peakCells.has(key)) peakCells.set(key, []);
          peakCells.get(key).push(pk);
        }
      }
    }
  }
  const pyramids = (x, z) => {
    let best = 0;
    for (const pk of peakCells.get(Math.floor(x / 128) * 1024 + Math.floor(z / 128)) || []) {
      const dx = x - pk[0];
      const dz = z - pk[1];
      const e = Math.hypot(dx, dz);
      if (pk[2] - PEAK_SLOPE * e * 0.75 <= best) continue;
      const f = Math.max(Math.abs(dx * pk[3] + dz * pk[4]), Math.abs(dx * pk[5] + dz * pk[6]));
      const h = pk[2] - PEAK_SLOPE * (f * 0.7 + e * 0.3);
      if (h > best) best = h;
    }
    return best;
  };
  const mountainUp = (x, z, d) => {
    if (d <= 0) return 0;
    const v = 0.5 + 0.5 * nB(x * 0.011 + 9.3, z * 0.011 - 4.1);
    const inTo = CLIFF_IN * (0.7 + 0.8 * v);
    // (cut by gullies: where a narrow band of the noise crosses the foot the cliff stands half as high, a notch a few
    // metres wide down the face)
    const notch = smoothstep(0.82, 0.97, 1 - Math.abs(nP(x * 0.043 + 2.7, z * 0.043 - 9.1)));
    const cliff = CLIFF * (0.6 + 0.8 * v) * smoothstep(0, inTo, d) * (1 - 0.5 * notch);
    const env = cliff + MASS * 1.9 * (1 - Math.exp(-d / (MASS_IN * 1.5)));
    // (gullies down the faces, spurs between them: ridged noise, more of it the higher up)
    const g = (ridged(x, z) - 0.35) * PEAK * 0.22 * smoothstep(inTo, 50, d);
    // (and crags: the faces broken up into buttresses and ledges a few metres deep)
    const crag = (Math.abs(nP(x * 0.031 + 4.2, z * 0.031 - 8.8)) * 2 - 0.6) * 10 + nB(x * 0.083, z * 0.083) * 3.2;
    // (and from its very foot the rock is broken: slabs, ribs and ledges a metre or three proud, every few metres - the
    // face a survivor stands under is no smooth bank)
    const rough = nB(x * 0.21 + 1.7, z * 0.21 - 3.3) * 1.5 + Math.abs(nP(x * 0.11 - 2.4, z * 0.11 + 5.1)) * 3.4 - 1.3;
    const hm = Math.max(cliff + d * 0.9, Math.min(env, pyramids(x, z) + g)) + crag * smoothstep(inTo, 36, d) + rough * smoothstep(0, 8, d);
    // (and the faces stepped in ledges: a band of rock 8-13 m high, its riser near sheer, its ledge nearly flat - where
    // a few trees take hold - the bands wandering across the face, so it reads as strata and shelves, not one smooth bank)
    const L = 8 + 5 * (0.5 + 0.5 * nB(x * 0.017 + 3.3, z * 0.017 - 1.1));
    const off = (0.5 + 0.5 * nB(x * 0.009 - 5.1, z * 0.009 + 2.2)) * L;
    const t = (hm + off) / L;
    const stepped = (Math.floor(t) + smoothstep(0.3, 0.95, t - Math.floor(t))) * L - off;
    return lerp(hm, stepped, 0.8 * smoothstep(2, 14, d) * LEDGES);
  };
  // outside one, near its foot: the foothills, rising toward the cliff (none of it on the water)
  const foothill = (x, z, d) => (d > -FOOTHILL_IN ? FOOTHILL * (1 - smoothstep(0, FOOTHILL_IN, -d)) ** 1.6 * (0.55 + 0.45 * (0.5 + 0.5 * nB(x * 0.008 - 2.2, z * 0.008 + 6.4))) : 0);
  // the quarry's pit: terraces down into the ground, a ramp round them
  // Five benches, each a ledge of level ground 6.4 m wide and a face of rock nearly sheer under it (the face itself is
  // built - pitFaces, below - over the heightfield's riser), down to a floor 52 m across; the haul road cut down round
  // them from the rim to the floor (ramp: from angle a0 at the rim, turning `turn` by the floor, hw half its width).
  const PIT = { x: FX(PLACES.quarry[0]), z: FX(PLACES.quarry[1]), r: 58, steps: 5, drop: 4.8, floor: 26, turn: PI * 1.4, hw: 4 };
  // (it is cut into a rise of its own, high enough that its floor stays over the water: the ground round it comes up to
  // its rim over 60 m)
  PIT.top = Math.max(H0(PIT.x, PIT.z), WATER_LEVEL + 2 + PIT.steps * PIT.drop);
  PIT.bw = (PIT.r - PIT.floor) / PIT.steps;
  {
    const yd = zoneById[ZONE.AGGREGATES];
    PIT.a0 = Math.atan2(yd.x - PIT.x, yd.z - PIT.z) + 0.55; // (the ramp starts beside the belt's line up to the yard)
  }
  // a point's distance out from the pit's middle as its benches are laid out (they wander a few metres round)
  const pitD = (x, z) => Math.hypot(x - PIT.x, z - PIT.z) + nE(x * 0.05, z * 0.05) * 3;
  // the haul road at a point: [how far along it, 0 at the rim .. 1 on the floor; how far off its middle] (null: not near)
  const pitRamp = (x, z, d) => {
    let rel = Math.atan2(x - PIT.x, z - PIT.z) - PIT.a0;
    rel = ((rel % (PI * 2)) + PI * 2) % (PI * 2);
    const s = rel / PIT.turn;
    if (s > 1.08) return null;
    const rad = PIT.r - 1.5 - Math.min(1, Math.max(0, s)) * (PIT.r - 1.5 - (PIT.floor - 3));
    return [s, Math.abs(d - rad)];
  };
  // the ground of the built-up places is one level each: the city's, the airfield's
  const cityH = Math.max(FLOOR + 1.4, H0(city.x, city.z) * 0.5 + 1);
  const fieldH = Math.max(FLOOR + 1.4, H0(field.x, field.z) * 0.6 + 1.5);
  for (const zn of zones) {
    if (zn.id === ZONE.BRIDGEHEAD) zn.h = BLUFF;
    else if (zn.id === ZONE.CITY) zn.h = cityH;
    else if (zn.id === ZONE.TERMINAL || zn.id === ZONE.HANGARS || zn.id === ZONE.FUEL_DEPOT) zn.h = fieldH;
    else if (zn.id === ZONE.MARINA) zn.h = WATER_LEVEL + 1.5;
    else if (zn.id === ZONE.INDUSTRIAL) zn.h = cityH; // (its quays at the city's level: the two meet)
    else if (zn.id === ZONE.AGGREGATES) zn.h = PIT.top; // (the quarry's yard is on the rise its pit is cut into)
    else zn.h = Math.max(FLOOR + 1, H0(zn.x, zn.z) * 0.55 + 0.8 + (zn.raise || 0));
  }
  // rectangles of level ground [x, z, half x, half z, height, blend, turned]: the airfield, the city, the quay
  const flats = [
    [AIR.x, AIR.z, (FENCE.x1 - FENCE.x0) / 2 + 10, (FENCE.z1 - FENCE.z0) / 2 + 10, fieldH, 40, AIR.ry, (FENCE.x0 + FENCE.x1) / 2, (FENCE.z0 + FENCE.z1) / 2], // (to past its fence)
    [SHORE + 26, zb, 26, 10, BLUFF, 9], // the bluff out to the abutment: the road off the bridge
    [docks.x - 22, docks.z, 70, 128, cityH, 16], // the docks, out to their quays
    [city.x, city.z, G2 + 16, G2 + 16, cityH, 30], // the city, to its corners (they lie outside the circle of its zone)
    [city.x - G2 - PITCH / 2 + 2, city.z + G2 - PITCH, PITCH / 2 + 4, PITCH + 4, cityH, 12], // the harbour streets, between the two (below)
  ];
  // (H1 is asked of every vertex of the heightfield, a million of them: what only depends on a flat or a zone is worked
  // out once, and the distance to a zone only taken where it can matter)
  for (const f of flats) {
    while (f.length < 9) f.push(0); // (not turned, no offset)
    f.push(Math.cos(f[6]), Math.sin(f[6]));
  }
  // (which zones and flats can reach into each 64 m cell, in their own order: a vertex asks only those)
  const ZC = 64;
  const ZCN = Math.ceil(SIZE / ZC);
  const zoneCells = Array.from({ length: ZCN * ZCN }, () => []);
  const flatCells = Array.from({ length: ZCN * ZCN }, () => []);
  const cellsOf = (x, z, r, into, item) => {
    for (let j = Math.max(0, Math.floor((z - r + HALF) / ZC)); j <= Math.min(ZCN - 1, Math.floor((z + r + HALF) / ZC)); j++) for (let i = Math.max(0, Math.floor((x - r + HALF) / ZC)); i <= Math.min(ZCN - 1, Math.floor((x + r + HALF) / ZC)); i++) into[j * ZCN + i].push(item);
  };
  for (const zn of zones) cellsOf(zn.x, zn.z, zn.flat + zn.blend, zoneCells, zn);
  for (const f of flats) cellsOf(f[0], f[1], Math.hypot(f[2] + Math.abs(f[7]), f[3] + Math.abs(f[8])) + f[5], flatCells, f);
  const VILLAGE = [FX(AREAS.village[0]), FX(AREAS.village[1]), FX(AREAS.village[2]), FX(AREAS.village[3])];
  const H1 = (x, z) => {
    const dM = mtnAt(x, z);
    let h = H0(x, z);
    const zc = Math.min(ZCN - 1, Math.max(0, Math.floor((z + HALF) / ZC))) * ZCN + Math.min(ZCN - 1, Math.max(0, Math.floor((x + HALF) / ZC)));
    const zoneHere = zoneCells[zc];
    for (const zn of zoneHere) {
      const lim = zn.flat + zn.blend;
      if ((x - zn.x) ** 2 + (z - zn.z) ** 2 >= lim * lim) continue;
      const d = Math.hypot(x - zn.x, z - zn.z);
      if (d < lim) h = lerp(h, zn.h, 1 - smoothstep(zn.flat, lim, d));
    }
    for (const [fx, fz, hx, hz, fh, blend, , ox, oz, c, s] of flatCells[zc]) {
      const lx = c * (x - fx) - s * (z - fz) - ox;
      const lz = s * (x - fx) + c * (z - fz) - oz;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - hx), Math.max(0, Math.abs(lz) - hz));
      if (d < blend) h = lerp(h, fh, 1 - smoothstep(0, blend, d));
    }
    // the quarry's pit: its benches, level ledges with a riser nearly sheer between them (the rock face built over it),
    // and the haul road down round them
    {
      const d = (x - PIT.x) ** 2 + (z - PIT.z) ** 2 < (PIT.r + 64) ** 2 ? pitD(x, z) : 1e4;
      if (d < PIT.r + 60) h = Math.max(h, lerp(h, PIT.top, 1 - smoothstep(PIT.r, PIT.r + 60, d)));
      if (d < PIT.r + 4) {
        const ring = clamp((PIT.r - d) / PIT.bw, 0, PIT.steps);
        const k = Math.floor(ring);
        const f = ring - k;
        const rim = smoothstep(-4, 2, PIT.r - d);
        const benches = h - (k + smoothstep(0.84, 0.99, f)) * PIT.drop * rim;
        const ramp = pitRamp(x, z, d);
        h = benches;
        if (ramp && ramp[1] < PIT.hw + 3) {
          const road = PIT.top - clamp(ramp[0], 0, 1) * PIT.steps * PIT.drop;
          h = lerp(benches, Math.min(road, h), (1 - smoothstep(PIT.hw, PIT.hw + 3, ramp[1])) * rim);
        }
      }
    }
    // the mountains
    h += mountainUp(x, z, dM);
    // (the marina's yard stays as it was levelled, up to where its pier starts: the lake's shore wanders, the yard's does not)
    const mz = zoneById[ZONE.MARINA];
    const mzd = Math.hypot(x - mz.x, z - mz.z);
    const keepYard = mzd < mz.flat + mz.blend ? (1 - smoothstep(mz.flat, mz.flat + mz.blend, mzd)) * (1 - smoothstep(9.5, 13.5, (x - mz.x) * Math.sin(mz.ry) + (z - mz.z) * Math.cos(mz.ry))) : 0;
    // the lake (as the island's are dug: a shore, then a bowl)
    const dl = lakeAt(x, z);
    if (dl > -50) {
      h = lerp(h, Math.min(h, WATER_LEVEL + 1.0), 1 - smoothstep(-2, 40, -dl) * 1);
      if (dl > -6) h = Math.min(h, lerp(WATER_LEVEL + 1.0, WATER_LEVEL - 5.5, smoothstep(-2, 26, dl)));
      // (an islet of the lake: a wooded mound)
      if (isletAt(x, z) === 2) h = Math.max(h, WATER_LEVEL + 0.9 + Math.min(-dl, 26) * 0.34 * smoothstep(0, 4, -dl) + (0.5 + 0.5 * nB(x * 0.07, z * 0.07)) * smoothstep(0, 5, -dl));
    }
    // the river: a ravine down to the water, the bed well under it, steep at its banks
    const dR = riverAt(x, z);
    if (dR < RIVER_HW + RIVER_BANK + 4) {
      const dn = dR + nE(x * 0.04, z * 0.04) * 1.6;
      h = lerp(h, Math.min(h, WATER_LEVEL + 1.1), 1 - smoothstep(RIVER_HW + 1.5, RIVER_HW + RIVER_BANK, dn));
      h = lerp(h, WATER_LEVEL - RIVER_DEPTH, 1 - smoothstep(RIVER_HW * 0.6, RIVER_HW + 0.4, dn));
    }
    // the creek: a shallow bed, waded
    const dc = creekAt(x, z);
    if (dc < CREEK_HW + 8) {
      h = lerp(h, Math.min(h, WATER_LEVEL + 0.5), 1 - smoothstep(CREEK_HW, CREEK_HW + 8, dc));
      h = lerp(h, WATER_LEVEL - 0.3, 1 - smoothstep(CREEK_HW * 0.5, CREEK_HW, dc));
    }
    if (keepYard > 0) h = lerp(h, mz.h, keepYard);
    // (a place's yard keeps its level, whatever the shore of the lake or the creek does round it)
    for (const zn of zoneHere) {
      if (zn.id === ZONE.CITY || zn.id === ZONE.MARINA || zn.id === ZONE.LIGHTHOUSE || (x - zn.x) ** 2 + (z - zn.z) ** 2 >= zn.flat * zn.flat) continue;
      const d = Math.hypot(x - zn.x, z - zn.z);
      if (d < zn.flat) h = lerp(h, zn.h, 1 - smoothstep(zn.flat - 4, zn.flat, d));
    }
    // the sea: the land goes down to the beach and on under the water. The bluff at the bridge falls straight in.
    const s = -seaAt(x, z); // (positive on land)
    // (at the bridge's bluff and along the docks' quays the land stands to the water's edge and drops into it)
    const bluff = x < SHORE + 120 ? 1 - smoothstep(34, 70, Math.abs(z - zb)) : 0;
    const near = Math.max(bluff, 1 - smoothstep(docks.flat + 8, docks.flat + 30, Math.hypot(x - docks.x, z - docks.z)));
    const beach = 1 - smoothstep(-2, lerp(40, 10, near), s);
    // (the coast is rock for long stretches, as the picture draws it - a low cliff into deep water - and coves and
    // beaches between; an islet is rock all round, a mound of it)
    const isl = isletAt(x, z) === 1;
    // (not along the village: its houses come down to its shore)
    const villageD = Math.hypot(Math.max(0, VILLAGE[0] - x, x - VILLAGE[2]), Math.max(0, VILLAGE[1] - z, z - VILLAGE[3]));
    const rocky = isl ? 1 : (1 - near) * smoothstep(-0.12, 0.22, nP(x * 0.0055 + 7.7, z * 0.0055 - 1.3)) * smoothstep(15, 60, villageD);
    if (rocky > 0.001 && s > -40 && s < 60) {
      const top = 2.5 + 6.5 * (0.5 + 0.5 * nP(x * 0.031 - 3.1, z * 0.031 + 2.2));
      const rough = (1 - Math.abs(nE(x * 0.11 + 1.3, z * 0.11 - 0.7))) * 1.6;
      const rise = isl ? (top + Math.min(s, 34) * 0.5) * smoothstep(-0.5, 3, s) + rough * smoothstep(0, 4, s) : top * smoothstep(-0.5, 3.5, s) * (1 - 0.55 * smoothstep(8, 40, s)) + rough * smoothstep(0, 4, s) * (1 - smoothstep(10, 30, s));
      let hr = s <= 0 ? lerp(WATER_LEVEL - 9, WATER_LEVEL - 1.2, smoothstep(-16, 0, s)) : Math.max(isl ? WATER_LEVEL : h, WATER_LEVEL + rise);
      // (the lighthouse's islet has a level top round the tower)
      if (isl) {
        const lh = zoneById[ZONE.LIGHTHOUSE];
        const dl = Math.hypot(x - lh.x, z - lh.z);
        if (dl < 18 && s > 0) hr = lerp(Math.min(hr, WATER_LEVEL + 4.2), hr, smoothstep(9, 18, dl));
      }
      const hb = lerp(lerp(h, WATER_LEVEL + 0.6, beach * (1 - near * smoothstep(-2, 10, s))), WATER_LEVEL - 7, 1 - smoothstep(-34, lerp(-1, 4, near), s));
      h = lerp(hb, hr, rocky);
    } else {
      h = lerp(h, WATER_LEVEL + 0.6, beach * (1 - near * smoothstep(-2, 10, s)));
      h = lerp(h, WATER_LEVEL - 7, 1 - smoothstep(-34, lerp(-1, 4, near), s));
    }
    // THE DOCKS' QUAY: the ground stands level out to its edge and drops there into water dredged deep, the length of
    // the waterfront (its face is the quay wall: the docks, below)
    {
      const ql = x - (docks.x + QUAY_LX); // (+ inland of the edge)
      const qz = Math.abs(z - docks.z);
      if (qz < QUAY_HZ + 30 && ql > -120 && ql < 110) {
        const along = 1 - smoothstep(QUAY_HZ, QUAY_HZ + 30, qz);
        if (ql < 0) h = lerp(h, Math.min(h, WATER_LEVEL - 7), along * (1 - smoothstep(-120, -95, ql)));
        else h = lerp(h, zoneById[ZONE.INDUSTRIAL].h, along * (1 - smoothstep(80, 110, ql)));
      }
    }
    // (the bluff the bridge lands on, out to the abutment: whatever the shore does)
    const db = Math.hypot(Math.max(0, Math.abs(x - SHORE - 26) - 26), Math.max(0, Math.abs(z - zb) - 10));
    if (db < 9) h = lerp(h, BLUFF, 1 - smoothstep(0, 9, db));
    // (...and the yard of the bridgehead on it, whatever the city's ground does beyond)
    const dh = Math.hypot(x - head.x, z - head.z);
    if (dh < 70) h = lerp(h, BLUFF, 1 - smoothstep(26, 70, dh));
    return h;
  };

  const heights = new Float32Array(N * N);
  const roadDist = new Float32Array(N * N).fill(1e4);
  const roadKind = new Uint8Array(N * N);
  let roadH = new Float32Array(N * N);
  let roadDir = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = H1(-HALF + i * GRID_STEP, -HALF + j * GRID_STEP);
  // the tunnels' corridors: the road's own level from mouth to mouth (the ground in front of either mouth), cut down
  // into the mountain with a cutting either side
  for (const t of tunnels) {
    const ground = (x, z) => H1(x, z) - mountainUp(x, z, mtnAt(x, z));
    t.y0 = ground(t.a[0] - t.dx * (CUT_LEN + 10), t.a[1] - t.dz * (CUT_LEN + 10));
    t.y1 = ground(t.b[0] + t.dx * (CUT_LEN + 10), t.b[1] + t.dz * (CUT_LEN + 10));
    // where the gallery is: the stretch of the road's line that is in the mountain
    let s0 = Infinity;
    let s1 = -Infinity;
    for (let s = -CUT_LEN; s <= t.len + CUT_LEN; s += 1) {
      if (mtnMask[vi(t.a[1] + t.dz * s) * N + vi(t.a[0] + t.dx * s)]) {
        s0 = Math.min(s0, s);
        s1 = Math.max(s1, s);
      }
    }
    if (s0 > s1) continue;
    t.s0 = Math.max(-CUT_LEN + 4, s0 - 3);
    t.s1 = Math.min(t.len + CUT_LEN - 4, s1 + 3);
    // The cap: the mountain as it stood over the gallery, before its corridor was cut (the heightfield is one level:
    // the road's, inside), drawn by the client over the gallery's roof so the mountain is whole over the tunnel and its
    // mouths are holes in a rock face, not the ends of a slot. Over the first metres in from either mouth it comes down
    // to the top of the face over the mouth. A grid CAP_STEP apart, along the road (s) and across it (lat).
    const level = (s) => lerp(t.y0, t.y1, clamp((s + CUT_LEN) / (t.len + CUT_LEN * 2), 0, 1));
    const CAP_STEP = 2;
    const CAP_LAT = CUT_HW + 5;
    const n = Math.ceil((t.s1 - t.s0) / CAP_STEP) + 1;
    const m = Math.round((CAP_LAT * 2) / CAP_STEP) + 1;
    const h = new Float32Array(n * m);
    for (let a = 0; a < n; a++) {
      const s = Math.min(t.s1, t.s0 + a * CAP_STEP);
      const top = level(s) + TUNNEL_H + 6.9;
      const inMouth = Math.min(s - t.s0, t.s1 - s);
      for (let b = 0; b < m; b++) {
        const lat = -CAP_LAT + b * CAP_STEP;
        const x = t.a[0] + t.dx * s - t.dz * lat;
        const z = t.a[1] + t.dz * s + t.dx * lat;
        h[a * m + b] = Math.max(top, Math.min(heights[vi(z) * N + vi(x)], top + Math.max(0, inMouth - 1.4) * 1.3));
      }
    }
    t.cap = { s0: t.s0, step: CAP_STEP, lat: CAP_LAT, n, m, h };
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * GRID_STEP;
      const z = -HALF + j * GRID_STEP;
      const on = tunnelOf(x, z, 6);
      if (!on || cliffAt(x, z) < -16) continue;
      const { t, s, lat } = on;
      const level = lerp(t.y0, t.y1, clamp((s + CUT_LEN) / (t.len + CUT_LEN * 2), 0, 1));
      const k = j * N + i;
      heights[k] = lerp(level, heights[k], smoothstep(CUT_HW - 1, CUT_HW + 5, lat));
    }
  }
  const rawH = bilinearSampler(heights, N, HALF);

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
  // a to b by way of `n` points that wander up to `amp` of the leg off the straight line
  const wander = (a, b, n, amp) => {
    const out = [a];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    let s = rng.chance(0.5) ? 1 : -1;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      const o = s * rng.range(0.35, 1) * amp * len;
      s = -s;
      out.push([a[0] + dx * t - (dz / len) * o, a[1] + dz * t + (dx / len) * o]);
    }
    out.push(b);
    return out;
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
  // (is the ground under a prop's footprint level enough to set it down on: within 0.8 m corner to corner?)
  const levelUnder = (type, x, z, ry) => {
    const [sx, , sz] = PROPS[type]?.size || [2, 1, 4];
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    let lo = Infinity;
    let hi = -Infinity;
    for (const [lx, lz] of [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]]) {
      const h = heightAt(x + c * lx + sn * lz, z - sn * lx + c * lz);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    // (...and no hollow under its middle: it is seated on its lowest corner, and over a ditch it would hang in the air)
    return hi - lo < 0.8 && heightAt(x, z) > lo - 0.06;
  };
  const sampleGrid = (arr, x, z) => arr[clamp(Math.round((z + HALF) / GRID_STEP), 0, N - 1) * N + clamp(Math.round((x + HALF) / GRID_STEP), 0, N - 1)];
  const roadDistAt = (x, z) => sampleGrid(roadDist, x, z);
  const roadKindAt = (x, z) => sampleGrid(roadKind, x, z);
  const inWater = (x, z) => heightAt(x, z) < WATER_LEVEL + 0.35;
  const nearZone = (x, z, pad) => zones.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.flat + pad) || null;

  // ---------------------------------------------------------------- what it is built with
  const kit = createKit({ rng, heightAt, half: HALF });
  const { staticGrid, structGrid, parts, props, lootSpawns, containers, partSpots, openings, extraTrees, lights, roofs, clears, addPropColliders, seatY, propBlocked, Builder, door, win, gap } = kit;
  const place = (id, build) => {
    const zn = zoneById[id];
    const b = new Builder(zn.x, zn.z, zn.ry, zn.h);
    b.zone = id;
    b.yard = { x: zn.x, z: zn.z, flat: zn.flat - 2.5 }; // (what stands nearer the edge of the levelled ground than a cell of the heightfield stands on the ground as it is)
    build(b, zn);
  };
  // a hiding place of the plane's part `supply` (PLANE_PARTS[supply]) in the builder's frame
  const part = (b, supply, lx, lz, ly = 0.02) => {
    b.partSpot(lx, lz, ly);
    partSpots[partSpots.length - 1].supply = supply;
  };
  const spawnPoints = [];
  // where the gun crates stand for a game that starts on the mainland (acts.js MAINLAND_START): { x, z, ry }. Not
  // props: the game puts them down as crates (ENT.CRATE), and only for such a game
  const startCrates = [];
  // a window with the glass gone (a way in, over the sill), and a city window: as often broken as not
  const hole = (at, w = 1.2, y0 = 1.05, y1 = 2.0) => ({ at, w, y0, y1 });
  const cw = (...a) => (rng.chance(0.55) ? hole(...a) : win(...a));
  // what has grown since: a clump of weeds or brush at a spot of a builder's frame (they go in with the bushes)
  const weeds = [];
  const weed = (b, lx, lz, scale = 1, ly = null, variant = null) => weeds.push([b.wx(lx, lz), b.wz(lx, lz), scale, ly === null ? null : b.y0 + ly, variant]);
  // what the field map names inside a place (the city's hospital, its station...): { x, z, name }
  const landmarks = [];
  // columns of smoke and fires still burning (world.lights: the client's effects draw them, and they are what the
  // skyline is known by from the bridge): so many to a map, the first that ask
  let towers = 0; // (how many big towers have a name so far)
  let smokes = 0;
  let fires = 0;
  const smoke = (b, lx, ly, lz) => smokes++ < SMOKES && b.light(lx, ly, lz, 'smoke');
  const fire = (b, lx, ly, lz) => fires++ < FIRES && b.light(lx, ly, lz, 'fire');
  const afloat = (p) => {
    props[props.length - 1].afloat = true; // (a boat on the water: nothing is under it, and nothing should be)
    return p;
  };
  const K = { rng, door, win, gap, hole, afloat }; // (what a place of mainland-places.js is built with)

  // THE BRIDGEHEAD: the bluff the bridge comes ashore on. The car is where it stopped, the span behind it in the
  // water; a checkpoint somebody held here once, and gave up.
  const bridge = planBridge({ seed, z: zb, shore: SHORE, deckY: BLUFF });
  place(ZONE.BRIDGEHEAD, (b) => {
    // (local frame: -Z is east, inland; +Z is back out along the bridge; +X is north)
    // (live: the client draws these two itself - the crossing's cutscene drives the car to this very spot)
    b.prop('car', 0, 16, 0.08, { seed: 7 });
    props[props.length - 1].live = true;
    for (let i = 0; i < 8; i++) spawnPoints.push({ x: b.wx(-5 + (i % 4) * 3.2, -2 - Math.floor(i / 4) * 3), z: b.wz(-5 + (i % 4) * 3.2, -2 - Math.floor(i / 4) * 3) });
    // the gun crates: a row on the road behind where the team stands, a shorter one behind it (clear of the
    // sandbags at -7, -9 and the car wreck at 5.4, -14)
    for (const [lx, lz, ry] of [[-3.4, -8.4, 0.1], [-0.8, -8.6, -0.15], [1.8, -8.4, 0.2], [4.4, -8.6, -0.05], [-2.1, -11, 0.25], [0.5, -11.2, -0.2]]) startCrates.push({ x: b.wx(lx, lz), z: b.wz(lx, lz), ry: b.ry + ry });
    // what is left of the last span's end: the edge of the abutment, shut off
    for (const lx of [-3.6, 3.6]) b.prop('jersey_barrier', lx, 37.4, 0, { seed: 1 }); // (the car came through between them)
    b.prop('road_sign', -6.4, 30, PI, { seed: 3 });
    // the checkpoint
    b.prop('military_tent', 13, -6, PI / 2, { seed: 1 });
    b.prop('sandbags', -7, -9, 0.1, { seed: 0 });
    b.prop('sandbags', -9.4, -7, PI / 2 - 0.2, { seed: 1 });
    b.prop('sandbags', 7.4, 4, PI / 2, { seed: 0 });
    b.cont(CONT.AMMO_BOX, 9.4, -9.6, { prop: 'military_crate', ry: 0.3 });
    b.cont(CONT.DUFFEL, 8.6, -1.2, { prop: 'duffel_bag', ry: 0.7, nocollide: true });
    b.cont(CONT.CRATE, -11, 3, { prop: 'crate', ry: 0.2 });
    b.prop('barrel', -8.6, -11.4, 0, { seed: 2 });
    b.light(-8.6, 1.0, -11.4, 'embers');
    b.wreck('pickup_truck', -5.5, -19, 0.2, { seed: 1 });
    b.wreck('car_wreck', 5.4, -14, PI - 0.3, { seed: 2 });
    b.prop('jersey_barrier', 3.4, -20.5, 0.5, { seed: 2 });
    b.prop('streetlight', -6.5, -4, PI / 2, { seed: 0 });
    b.prop('body_bag', 15.5, 1.5, 0.3, { nocollide: true, seed: 0 });
    b.prop('body_bag', 16.6, 2.2, 0.2, { nocollide: true, seed: 1 });
    b.loot(-10, -4);
    b.loot(11, -3);
    b.loot(2, -8);
    b.clear(0, 6, 14);
  });

  // (what the stages in mainland/ read of the plan, and of the ground with its roads)
  const plan = { head, city, G2, SQ0, SQ1, onSquare, onDiagonal, inRing, RING_R, RING_C, goneBlock, trimBlock, W, inCity, onField, AIR, aw, al, field, plane, APRON, GATE_AT, FENCE, seaAt, lakeAt, riverAt, cliffAt, forestAt, tunnels, tunnelOf, facing, camps, passageW, passageE, zones, zoneById, lake };
  const ground = { heights, roadDist, roads, cityH, fieldH, PIT, pitRamp, heightAt, levelUnder, roadDistAt, inWater, nearZone };

  // PORT CALDER: what its buildings are made with (mainland/citykit.js), what stands on a lot by what was dealt to it
  // (mainland/buildings.js), and the lots, the square, the streets and the harbour streets (mainland/city.js)
  const cityKit = createCityKit({ rng, heightAt, kit, smoke });
  const { buildings, rooms, shells, heaps, ships, fallenBits, pancakes, signs, solid, block, groundRoom, partition, jagged, heap, signAt, longClear, fits, extra } = cityKit;
  const lotBuilders = cityBuildings({ rng, kit, part, hole, cw, weed, landmarks, nextTower: () => towers++, smoke, fire, ck: cityKit });
  const { BUILD } = lotBuilders;
  const lots = buildCity({ seed, rng, plan, ground, kit, weed, landmarks, burning: () => fires, smoke, fire, ck: cityKit, lotBuilders });

  // THE BRIDGES: wherever a road crosses the river (mainland/places.js)
  const bridges = buildRiverBridges({ rng, roads, heightAt, kit });

  // INDUSTRIAL DOCKS (mainland/docks.js)
  buildDocks({ seed, zoneById, kit, place, hole, smoke, afloat, ck: cityKit });

  Object.assign(K, { block, groundRoom, partition, signAt, heap, extra, jagged, weed, fits, roadDistAt, heightAt, solid }); // (what the third pass's places are built with)

  // THE SUBURBS, THE STREETS ROUND TOWN CENTER AND NORTH COAST VILLAGE: their houses (mainland/homes.js)
  const homes = buildHomes({ seed, rng, plan, ground, kit, weed, K, fits });

  // NORTH COAST VILLAGE's church and harbour, NORTH RIDGE OUTPOST, THE LIGHTHOUSE, SOUTH FOREST's camps
  // (mainland/places.js)
  buildVillage({ seed, plan, ground, kit, afloat, BUILD });
  buildOutpost({ seed, rng, kit, place, part, extra });
  buildLighthouse({ heightAt, kit, place });
  buildCamps({ rng, plan, ground, kit, place });

  // THE ROAD TUNNELS' galleries and cuttings (mainland/mountains.js)
  buildTunnels({ plan, roads, kit, landmarks });

  // what the field map names that is no place: the range, the lake
  landmarks.push({ x: FX(0.668), z: FX(0.395), name: 'The Ridge', big: true }, { x: lake.x, z: lake.z + 30, name: 'Pine Lake', big: true });

  // THE MOUNTAINS' WALLS, nobody sees, along the foot of every cliff (mainland/mountains.js)
  const walls = buildWalls({ wallMask, heightAt, staticGrid });

  // East Pass's road ran on over the river to the Ridge: the bridge is gone (mainland/places.js)
  buildBrokenBridge({ roads, kit });

  // ...and the lesser places of the picture (mainland-places.js): the marina, the logging camp, the firehouse, the quarry's yard
  for (const zn of zones) if (OUTLYING[zn.id] && zn.id !== ZONE.WESTGATE) place(zn.id, (b) => OUTLYING[zn.id].build(b, K, zn));

  // MILE 9 TRUCK STOP (mainland/places.js)
  buildTruckStop({ kit, place });

  // CALDER FIELD (mainland/airfield.js)
  const { car, runway } = buildAirfield({ rng, plan, ground, kit, place, part, ck: cityKit });

  // ---------------------------------------------------------------- the land a body walks to (mainland/sites.js)
  const reachAt = landReach({ head, heightAt, cliffAt });

  // ---------------------------------------------------------------- roadside & countryside sites, a farm, road signs
  // (mainland/sites.js)
  const { sites, builtNear } = placeSites({ seed, rng, plan, ground, roadH, kit, longClear, fits, extra, homes, reachAt });
  buildFarm({ plan, ground, kit, landmarks, K, fits, homes, reachAt, sites, builtNear });
  postRoadSigns({ seed, plan, ground, kit, builtNear });

  // THE SOUTH PASSAGE MINES, the quarry's pit and the mine's yard (mainland/passage.js)
  const { mine, sealed } = sinkPassage({ seed, plan, ground, kit });
  dressQuarryPit({ seed, nE, zoneById, ground, kit, fits });
  buildPassageYard({ zoneById, kit, place, groundRoom, sealed });

  // hoardings and power poles along the main roads (mainland/sites.js)
  dressMainRoads({ plan, ground, kit, signs, homes, sites });

  // ---------------------------------------------------------------- vegetation
  // The forest where the picture has it (forestAt: thick enough to be a wall off the roads where it is dense), thinner
  // up the mountains' flanks and none on their heights; a tree here and there in the open. Nothing grows on the
  // city's paving but what has broken through it (the dead trees the blocks plant with Builder.tree).
  // (what is taken, as a bitmap of 1 m cells: a disc is set into it, and a disc asked about is clear when no cell of it
  // is set - one lookup per cell, where a list of discs was 25 lists searched for every tree tried)
  const OS = SIZE;
  let occ = new Uint8Array(OS * OS);
  const occupied = (x, z, r) => {
    const i0 = Math.max(0, Math.floor(x - r + HALF));
    const i1 = Math.min(OS - 1, Math.floor(x + r + HALF));
    const j0 = Math.max(0, Math.floor(z - r + HALF));
    const j1 = Math.min(OS - 1, Math.floor(z + r + HALF));
    const r2 = (r + 0.71) ** 2;
    for (let j = j0; j <= j1; j++) {
      const dz = j + 0.5 - HALF - z;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - HALF - x;
        if (occ[j * OS + i] && dx * dx + dz * dz < r2) return true;
      }
    }
    return false;
  };
  const occupy = (x, z, r) => {
    const i0 = Math.max(0, Math.floor(x - r + HALF));
    const i1 = Math.min(OS - 1, Math.floor(x + r + HALF));
    const j0 = Math.max(0, Math.floor(z - r + HALF));
    const j1 = Math.min(OS - 1, Math.floor(z + r + HALF));
    for (let j = j0; j <= j1; j++) {
      const dz = j + 0.5 - HALF - z;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - HALF - x;
        if (dx * dx + dz * dz < r * r) occ[j * OS + i] = 1;
      }
    }
    const ci = Math.floor(x + HALF);
    const cj = Math.floor(z + HALF);
    if (ci >= 0 && cj >= 0 && ci < OS && cj < OS) occ[cj * OS + ci] = 1;
  };
  for (const p of props) occupy(p.x, p.z, Math.max(2.5, Math.hypot(...(PROPS[p.type]?.size || [2, 0, 2]).filter((_, i) => i !== 1)) / 2 + 0.6));
  for (const [x, z, r] of clears) occupy(x, z, Math.min(r, 6));
  // (what is to be kept clear, in 16 m cells: thousands of them, asked of by every tree and rock tried)
  let clearCells = null;
  const clearHit = (x, z, pad) => {
    if (!clearCells) {
      clearCells = new Map();
      for (const c of clears) {
        const e = c[2] + 1; // (pads are up to 1 m)
        for (let i = Math.floor((c[0] - e) / 16); i <= Math.floor((c[0] + e) / 16); i++) {
          for (let j = Math.floor((c[1] - e) / 16); j <= Math.floor((c[1] + e) / 16); j++) {
            const k = i * 65536 + j;
            if (!clearCells.has(k)) clearCells.set(k, []);
            clearCells.get(k).push(c);
          }
        }
      }
    }
    const arr = clearCells.get(Math.floor(x / 16) * 65536 + Math.floor(z / 16));
    return !!arr && arr.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + pad) ** 2);
  };
  const zoneClear = (x, z) => zones.some((zn) => (x - zn.x) ** 2 + (z - zn.z) ** 2 < zn.clear * zn.clear) || onField(x, z, 6);
  const onRoad = (x, z, r) => roadDistAt(x, z) < (roadKindAt(x, z) === ROAD.TRAIL ? 2.2 : 5.5) + r;
  // does a trunk or a boulder of radius r at (x, z) stand in an upright piece somebody built (a wall, a post)?
  let partCells = null;
  const partBlocked = (x, z, r) => {
    if (!partCells) {
      partCells = new Map();
      for (const p of parts) {
        if (p.rx || p.rz || p.sy < 1 || (p.shape !== 'box' && p.shape !== 'cyl')) continue;
        const e = Math.hypot(p.sx, p.sz) / 2;
        for (let i = Math.floor((p.x - e) / 8); i <= Math.floor((p.x + e) / 8); i++) {
          for (let j = Math.floor((p.z - e) / 8); j <= Math.floor((p.z + e) / 8); j++) {
            const k = i * 65536 + j;
            if (!partCells.has(k)) partCells.set(k, []);
            partCells.get(k).push(p);
          }
        }
      }
    }
    for (let i = Math.floor((x - r) / 8); i <= Math.floor((x + r) / 8); i++) {
      for (let j = Math.floor((z - r) / 8); j <= Math.floor((z + r) / 8); j++) {
        for (const p of partCells.get(i * 65536 + j) || []) {
          if (p.shape === 'cyl') {
            if (Math.hypot(p.x - x, p.z - z) < r + p.sx / 2) return true;
          } else {
            const c = Math.cos(p.ry);
            const s = Math.sin(p.ry);
            const lx = c * (x - p.x) - s * (z - p.z);
            const lz = s * (x - p.x) + c * (z - p.z);
            if (Math.hypot(Math.max(0, Math.abs(lx) - p.sx / 2), Math.max(0, Math.abs(lz) - p.sz / 2)) < r) return true;
          }
        }
      }
    }
    return false;
  };
  let trees = [];
  // (the woods, the boulders and the bushes are dealt from dice of their own, one set to every cell of the forest's
  // grid and to every boulder or bush tried - a hash of the seed, the cell or the try and the draw - and not from the
  // world's stream: a mountain or a clearing changed in one place changes the trees there and nowhere else, where
  // with the stream every tree dealt after it was dealt anew)
  const VSEED = (seed ^ 0x6a09e6) | 0;
  const die = (i, j, k) => hash2(i, j, (VSEED + Math.imul(k, 0x9e3779b1)) | 0);
  // (solid: in the collider grid, as on the island. A tree up a mountain, past its wall, is out of everybody's reach and
  // is drawn and nothing else: no collider)
  const pushTree = (x, z, v, scale, solid = true) => {
    const y = heightAt(x, z);
    const rot = die(Math.round(x * 16), Math.round(z * 16), 77) * PI * 2;
    occupy(x, z, 1.0 * scale);
    if (!solid) {
      trees.push(x, y, z, scale, rot, v);
      return;
    }
    if (partBlocked(x, z, TREE_R[v] * scale + 0.15)) return; // (left out after its draws, as on the island)
    const c = makeTree(x, z, y - 1, y + 14 * scale, TREE_R[v] * scale, v, trees.length / 6);
    trees.push(x, y, z, scale, rot, v);
    staticGrid.add(c);
  };
  for (const [x, z, v, s] of extraTrees) if (!occupied(x, z, 1.2) && !inWater(x, z)) pushTree(x, z, v, s);
  // THE CRAGS: the cliffs are no smooth bank. Along the foot of every one, every few metres, a rib, a buttress with
  // its lip hanging out over the foot, a spire or a shelf of rock stands up out of the face, with the gully between
  // one and the next; up the faces, ledges and buttresses where the ground is steep; and on the lowest metres of the
  // face, small trees that have taken hold. All of it inside the mountain's wall (each crag set in from the line by
  // its own reach at its foot): drawn, never walked to, no collider - as a tree up a mountain. [x, y, z, scale, ry,
  // variant] as the rocks are; the variants (client/render/models/vegetation.js getCragVariants): 0 rib, 1 buttress,
  // 2 spire, 3 shelf, and how far each reaches out from its middle at its foot (CRAG_R)
  const CRAG_R = [2.3, 3.6, 1.4, 3.0];
  const CRAG_H = [13.5, 9.6, 14.8, 2.7]; // (how high each stands over its foot)
  const CRAG_COL = [[[0, 0, 1.9]], [[-1.7, 0.2, 2.1], [1.7, 0.2, 2.1]], [[0, 0, 1.25]], [[0, 0, 2.3]]]; // ([x, z, r] of its own frame)
  const crags = [];
  {
    const inward = (x, z) => {
      const gx = cliffAt(x + 2, z) - cliffAt(x - 2, z);
      const gz = cliffAt(x, z + 2) - cliffAt(x, z - 2);
      const l = Math.hypot(gx, gz) || 1;
      return [gx / l, gz / l];
    };
    const putCrag = (x, z, v, scale, sink, baseY = heightAt(x, z)) => {
      const [ix, iz] = inward(x, z);
      // (its front, -Z, turned out of the mountain, give or take)
      const ry = Math.atan2(ix, iz) + (die(Math.round(x * 4), Math.round(z * 4), 51) - 0.5) * 0.7;
      crags.push(x, baseY - sink * scale, z, scale, ry, v);
      occupy(x, z, CRAG_R[v] * scale * 0.8);
    };
    let a = 0;
    for (const line of walls) {
      let carry = 0;
      for (let k = 0; k + 1 < line.length; k++) {
        const [ax, az] = line[k];
        const [bx, bz] = line[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        let t = carry;
        while (t < len) {
          a++;
          const x0 = ax + ((bx - ax) * t) / len;
          const z0 = az + ((bz - az) * t) / len;
          t += 5 + die(a, 7, 41) * 6;
          if (tunnelOf(x0, z0, 14) || die(a, 7, 42) < 0.12) continue; // (a gully: nothing stands out of it)
          const r = die(a, 7, 43);
          const v = r < 0.42 ? 0 : r < 0.68 ? 1 : r < 0.84 ? 2 : 3;
          const scale = 0.75 + die(a, 7, 44) * 0.6;
          const [ix, iz] = inward(x0, z0);
          // (standing out of the foot of the face, its back in the face: what stands out past the mountain's wall is
          // solid - CRAG_COL, cylinders over its footprint, as a boulder's - and none comes near a road or a place)
          const back = 0.2 + die(a, 7, 45) * 1.1;
          const [x, z] = [x0 + ix * back, z0 + iz * back];
          const reach = CRAG_R[v] * scale + 1;
          if (inWater(x, z) || onRoad(x, z, reach + 0.6) || zoneClear(x, z) || clearHit(x, z, reach) || onField(x, z, reach + 4) || partBlocked(x, z, reach)) continue;
          const y0 = heightAt(x0, z0) - (v === 3 ? 0.4 : v === 2 ? 1.0 : 1.2) * scale;
          putCrag(x, z, v, scale, 0, y0);
          {
            const ry = crags[crags.length - 2];
            const [c, sn] = [Math.cos(ry), Math.sin(ry)];
            for (const [lx, lz, r] of CRAG_COL[v]) staticGrid.add(makeCyl(x + (c * lx + sn * lz) * scale, z + (-sn * lx + c * lz) * scale, y0 - 1, y0 + CRAG_H[v] * scale, r * scale, COL.STATIC));
          }
          // (and now and then a small tree on the face beside it, rooted in a crack)
          if (die(a, 7, 47) < 0.3) {
            const tb = 0.6 + die(a, 7, 48) * 2.2;
            const [tx, tz] = [x0 + ix * tb - iz * 2.2, z0 + iz * tb + ix * 2.2];
            if (cliffAt(tx, tz) > 0.4 && !tunnelOf(tx, tz, 10) && !occupied(tx, tz, 0.8)) pushTree(tx, tz, die(a, 7, 49) < 0.6 ? 0 : 5, 0.5 + die(a, 7, 50) * 0.3, false);
          }
        }
        carry = t - len;
      }
    }
    // up the faces: ledges and buttresses where the ground stands steep, to well over the tree line
    for (let j = 0; j < SIZE / 12; j++) {
      for (let i = 0; i < SIZE / 12; i++) {
        const x = -HALF + (i + die(i, j, 61)) * 12;
        const z = -HALF + (j + die(i, j, 62)) * 12;
        const d = cliffAt(x, z);
        if (d < 9 || d > 170 || die(i, j, 63) > 0.45) continue;
        const y = heightAt(x, z);
        const steep = Math.abs(heightAt(x + 3, z) - heightAt(x - 3, z)) + Math.abs(heightAt(x, z + 3) - heightAt(x, z - 3));
        if (steep < 5 || y > 245 || tunnelOf(x, z, 14)) continue;
        // (from far off a face is read by what is the size of a house and more: the higher, the bigger)
        const r = die(i, j, 64);
        const v = r < 0.4 ? 3 : r < 0.7 ? 1 : r < 0.9 ? 0 : 2;
        putCrag(x, z, v, (0.9 + die(i, j, 65) * 0.9) * (1 + Math.min(1, d / 80)), v === 3 ? 1.0 : v === 1 ? 2.0 : 3.0);
      }
    }
  }
  const LIM = HALF - 4;
  // The forest: one tree at the most to every TREE_CELL square, jittered in it, with the forest's density for its
  // chance: where the picture's woods are dense a tree every 3-4 m, a wall off the roads. Up a mountain the woods thin
  // with the height and stop at the tree line; on a face too steep for them, none.
  // CLEARINGS in the woods: in about two 96 m squares of five a round opening 9-18 m across where no tree stands - grass,
  // a deadfall, a rock or two (below) - so the woods are no even wall (dice of their own, by the square)
  const CLR = 96;
  const clearingAt = (x, z) => {
    const ci = Math.floor((x + HALF) / CLR), cj = Math.floor((z + HALF) / CLR);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      if (die(i, j, 101) > 0.42) continue;
      const cx = -HALF + (i + 0.2 + die(i, j, 102) * 0.6) * CLR, cz = -HALF + (j + 0.2 + die(i, j, 103) * 0.6) * CLR;
      const r = 9 + die(i, j, 104) * 9;
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return [cx, cz, r, i, j];
    }
    return null;
  };
  const TREE_CELL = 3.2;
  const TREE_LINE = 150;
  const MOUNTAIN_VERGE = 10;
  const TREES_N = Math.floor((LIM * 2) / TREE_CELL);
  for (let tj = 0; tj < TREES_N; tj++) {
    for (let ti = 0; ti < TREES_N; ti++) {
      const x = -LIM + (ti + die(ti, tj, 1)) * TREE_CELL;
      const z = -LIM + (tj + die(ti, tj, 2)) * TREE_CELL;
      const r0 = die(ti, tj, 3);
      const f = forestAt(x, z);
      const up = cliffAt(x, z);
      const dens = up > 0 ? Math.max(f, 0.4) * 0.7 * (1 - smoothstep(8, 70, up)) : Math.max(0.02, f ** 1.15 * 0.8);
      if (r0 > dens) continue;
      const scale = 0.75 + die(ti, tj, 4) * 0.55;
      const r = die(ti, tj, 5);
      // (and none on the verge along a mountain's foot, MOUNTAIN_VERGE m of scree out from its wall: in the thick woods
      // a strip a vehicle's width wide was left between the trees and the wall, a trap a car drove into and could not
      // turn in - west of North Pass it wedged the car on two rolls of the woods in five)
      if (seaAt(x, z) > -4 || inWater(x, z) || (up > -MOUNTAIN_VERGE && up < CLIFF_IN + 1)) continue;
      if (up > 0) {
        const y = heightAt(x, z);
        if (y > TREE_LINE + (r0 - 0.5) * 30 || Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) + Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2)) > 7 || tunnelOf(x, z, 6) || occupied(x, z, 0.9 * scale)) continue;
        pushTree(x, z, r < 0.34 ? 0 : r < 0.62 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 5 : 6, scale, false);
        continue;
      }
      if (zoneClear(x, z) || onRoad(x, z, 0.6) || clearHit(x, z, 0.8) || tunnelOf(x, z, 4) || occupied(x, z, 1.1 * scale)) continue;
      if (f > 0.35 && clearingAt(x, z)) continue;
      pushTree(x, z, r < 0.28 ? 0 : r < 0.5 ? 1 : r < 0.66 ? 2 : r < 0.84 ? 5 : r < 0.9 ? 6 : r < 0.96 ? 3 : 4, scale);
    }
  }
  let rocks = [];
  for (let a = 0; a < 5200 && rocks.length < 1300 * 6; a++) {
    const x = -LIM + die(a, 0, 11) * LIM * 2;
    const z = -LIM + die(a, 0, 12) * LIM * 2;
    const up = cliffAt(x, z);
    // (most at the feet of the cliffs, where they came down)
    if (up < -30 && die(a, 0, 13) < 0.7) continue;
    if (zoneClear(x, z) || onRoad(x, z, 1.2) || inWater(x, z) || clearHit(x, z, 1) || tunnelOf(x, z, 4) || (up > -2 && up < CLIFF_IN + 1)) continue;
    if (Math.hypot(x - head.x, z - head.z) < 110) continue; // (the bridgehead's fields, where the car is first driven off, are clear of them)
    const v = Math.min(ROCK_R.length - 1, Math.floor(die(a, 0, 14) * ROCK_R.length));
    const scale = 0.6 + die(a, 0, 15) * 1.2;
    const r = ROCK_R[v] * scale;
    if (occupied(x, z, r + 0.5) || partBlocked(x, z, r + 0.3)) continue;
    const y = heightAt(x, z) - 0.25 * scale;
    occupy(x, z, r);
    rocks.push(x, y, z, scale, die(a, 0, 16) * PI * 2, v);
    staticGrid.add(makeCyl(x, z, y - 1, y + r * 0.9, r * 0.85, COL.STATIC | COL.ROCK));
  }
  // the boulders that came down off the faces: a field of them along every mountain's foot, on its verge of scree
  for (let a = 0, n = 0; a < 14000 && n < 2200; a++) {
    const x = -LIM + die(a, 2, 31) * LIM * 2;
    const z = -LIM + die(a, 2, 32) * LIM * 2;
    const up = cliffAt(x, z);
    if (up < -MOUNTAIN_VERGE + 1 || up > -2) continue;
    if (zoneClear(x, z) || onRoad(x, z, 2) || inWater(x, z) || clearHit(x, z, 1) || tunnelOf(x, z, 6)) continue;
    const v = Math.min(ROCK_R.length - 1, Math.floor(die(a, 2, 33) * ROCK_R.length));
    const scale = 1.1 + die(a, 2, 34) * 1.9;
    const r = ROCK_R[v] * scale;
    if (occupied(x, z, r + 0.4) || partBlocked(x, z, r + 0.3)) continue;
    const y = heightAt(x, z) - 0.3 * scale;
    occupy(x, z, r);
    rocks.push(x, y, z, scale, die(a, 2, 35) * PI * 2, v);
    staticGrid.add(makeCyl(x, z, y - 1, y + r * 0.9, r * 0.85, COL.STATIC | COL.ROCK));
    n++;
  }
  // WHAT LIES IN THE WOODS: outcrops of rock, a few boulders shouldered together; deadfall - a trunk come down in
  // lengths - in the clearings and among the trees (solid, as boulders and logs are: their colliders)
  {
    const solidOK = (x, z, r) => !(zoneClear(x, z) || onRoad(x, z, r + 1) || inWater(x, z) || clearHit(x, z, r) || tunnelOf(x, z, 6) || cliffAt(x, z) > -12 || occupied(x, z, r) || partBlocked(x, z, r) || Math.hypot(x - head.x, z - head.z) < 110 || !reachAt(x, z));
    for (let a = 0, n = 0; a < 9000 && n < 420; a++) {
      const x = -LIM + die(a, 5, 111) * LIM * 2;
      const z = -LIM + die(a, 5, 112) * LIM * 2;
      if (forestAt(x, z) < 0.35 || !solidOK(x, z, 3.5)) continue;
      const k = 2 + Math.floor(die(a, 5, 113) * 3);
      for (let q = 0; q < k; q++) {
        const ang = die(a, q, 114) * PI * 2, dd = q ? 1.4 + die(a, q, 115) * 1.6 : 0;
        const rx = x + Math.cos(ang) * dd, rz = z + Math.sin(ang) * dd;
        const v = Math.min(ROCK_R.length - 1, Math.floor(die(a, q, 116) * ROCK_R.length));
        const scale = (q ? 0.9 : 1.6) + die(a, q, 117) * 0.9;
        const rr = ROCK_R[v] * scale;
        if (q && (occupied(rx, rz, rr * 0.5) || onRoad(rx, rz, rr + 1))) continue;
        const ry0 = heightAt(rx, rz) - 0.3 * scale;
        rocks.push(rx, ry0, rz, scale, die(a, q, 118) * PI * 2, v);
        staticGrid.add(makeCyl(rx, rz, ry0 - 1, ry0 + rr * 0.9, rr * 0.85, COL.STATIC | COL.ROCK));
      }
      occupy(x, z, 3.5);
      n++;
    }
    for (let a = 0, n = 0; a < 12000 && n < 520; a++) {
      const x = -LIM + die(a, 6, 121) * LIM * 2;
      const z = -LIM + die(a, 6, 122) * LIM * 2;
      const inClr = clearingAt(x, z);
      if ((!inClr && (forestAt(x, z) < 0.3 || die(a, 6, 123) < 0.6)) || !solidOK(x, z, 2.8)) continue;
      const ry = die(a, 6, 124) * PI;
      const [ux, uz] = [Math.sin(ry), Math.cos(ry)];
      const lengths = 1 + Math.floor(die(a, 6, 125) * 2);
      let ok = true;
      for (let q = 0; q <= lengths; q++) if (occupied(x + ux * q * 2.1, z + uz * q * 2.1, 0.6) || onRoad(x + ux * q * 2.1, z + uz * q * 2.1, 1.5)) ok = false;
      if (!ok) continue;
      for (let q = 0; q <= lengths; q++) {
        const [lx, lz] = [x + ux * q * 2.15, z + uz * q * 2.15];
        const lry = ry + (die(a, q, 126) - 0.5) * 0.25;
        if (propBlocked('log_bench', lx, lz, lry)) break;
        const hs = [[ux, uz], [-ux, -uz], [uz * 0.3, -ux * 0.3], [-uz * 0.3, ux * 0.3]].map(([dx, dz]) => heightAt(lx + dx * 1.1, lz + dz * 1.1));
        if (Math.max(...hs) - Math.min(...hs) > 0.45) break; // (only where it lies along level ground)
        const y0 = Math.min(...hs);
        props.push({ type: 'log_bench', x: lx, y: y0, z: lz, ry: lry, seed: q });
        addPropColliders('log_bench', lx, y0, lz, lry, props[props.length - 1]);
      }
      occupy(x + ux * lengths, z + uz * lengths, lengths * 1.2 + 1);
      n++;
    }
  }
  let bushes = [];
  for (let a = 0; a < 70000; a++) {
    const x = -LIM + die(a, 1, 21) * LIM * 2;
    const z = -LIM + die(a, 1, 22) * LIM * 2;
    if (roadDistAt(x, z) < 4 || inWater(x, z) || onField(x, z, 0) || cliffAt(x, z) > 40) continue;
    const zn = nearZone(x, z, -8);
    if (zn && die(a, 1, 23) < (zn.id === ZONE.CITY ? 0.93 : 0.85)) continue; // (the city is overgrown, but it is still paving)
    if (clearHit(x, z, 0) || occupied(x, z, 0.4)) continue;
    bushes.push(x, heightAt(x, z), z, 0.7 + die(a, 1, 24) * 0.8, die(a, 1, 25) * PI * 2, Math.min(2, Math.floor(die(a, 1, 26) * 3)));
  }

  // undergrowth: ferns and brush where the dense woods meet the open - along the roads through them and round the
  // clearings' edges, where it is seen (deep in the woods it is hidden by the trunks, and it was what the woods' frame
  // cost more than Cody's had)
  for (let a = 0; a < 26000; a++) {
    const x = -LIM + die(a, 8, 131) * LIM * 2;
    const z = -LIM + die(a, 8, 132) * LIM * 2;
    if (forestAt(x, z) < 0.45 || roadDistAt(x, z) < 5 || inWater(x, z) || cliffAt(x, z) > 2 || nearZone(x, z, -4) || clearHit(x, z, 0) || occupied(x, z, 0.5)) continue;
    if (roadDistAt(x, z) > 11) continue; // (along the roads through them only: deep in, the trunks hide it)
    bushes.push(x, heightAt(x, z), z, 0.6 + die(a, 8, 133) * 0.7, die(a, 8, 134) * PI * 2, die(a, 8, 135) < 0.6 ? 1 : Math.floor(die(a, 8, 136) * 3));
  }
  // what came up through the city's paving, down its kerbs and in its yards
  // (a weed in a raised bed stands on its earth: y)
  for (const [x, z, scale, y, v] of weeds) {
    if (y === null && partBlocked(x, z, 0.3)) continue;
    const ry = rng.range(0, PI * 2);
    const vv = rng.int(0, 2);
    bushes.push(x, y ?? heightAt(x, z), z, scale, ry, v ?? vv); // (a hedge is the leafy shrub: v)
  }

  // ---------------------------------------------------------------- spawns (mainland/spawns.js)
  const { resourceSpawns, hordeSpawns } = scatterSpawns({ rng, plan, ground, staticGrid, reachAt, occupied, zoneClear, LIM });

  // ---------------------------------------------------------------- the field map (mainland/fieldmap.js)
  const marks = mapMainland({ plan, PIT, landmarks, mine });

  // ---------------------------------------------------------------- queries
  // (worldquery.js, as on the island; heightAt is the terrain alone)
  const { floorAt, rayTerrain } = groundQueries({ heightAt, mine, rail: null, ceiling: 420 });
  const zoneAt = (x, z) => {
    for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.flat + 8) return zn.id;
    return ZONE.FOREST;
  };
  const openingNear = (x, z, maxD = 1.2) => {
    let best = null;
    let bd = maxD;
    for (const o of openings) {
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  const start = { x: head.x, z: head.z };
  // (what only the building of the world needed goes now: every closure made here keeps all that any of them can see,
  // so a grid left in reach of one would be held as long as the world is)
  seaMask = lakeMask = islets = mtnMask = cut = wallMask = reliefGrid = roadH = occ = roadDir = null;
  const treesOut = new Float32Array(trees);
  const rocksOut = new Float32Array(rocks);
  const bushesOut = new Float32Array(bushes);
  trees = rocks = bushes = null;
  zoneCells.length = flatCells.length = 0;
  peakCells.clear();
  partCells = clearCells = null;

  return {
    seed,
    kind: WORLD.MAINLAND,
    size: SIZE,
    half: HALF,
    gridN: N,
    posScale: POS_SCALE_WIDE,
    heights,
    roadDist,
    roadKind,
    heightAt,
    floorAt,
    mine,
    clinic: null,
    darks: [],
    darkAt: () => 0,
    fair: null,
    rail: null,
    roadDistAt,
    roadKindAt,
    rayTerrain,
    isDeepWater: (x, z) => heightAt(x, z) < WATER_LEVEL - 0.95,
    zoneAt,
    zones,
    zoneById,
    roads,
    highway,
    lake,
    ponds,
    river: { pts: new Float32Array(riverPts), hw: RIVER_HW, bridges, at: riverAt, flow, speed: RIVER_FLOW, depth: RIVER_DEPTH },
    creek: { pts: creekP, hw: CREEK_HW },
    landmarks, // what the field map names inside a place: { x, z, name, label (where the name is written, if not there), city (inside the city: written zoomed in), big }
    marks, // the field map's marks: { kind, x, z } (client/ui/mapmainland.js)
    sea: { x: FX(0.03), south: FX(0.46), at: seaAt }, // the sea runs on past the map's west edge, and past its north and south edges west of x / south (the client lays water there); at: how far out on the water (m)
    lakeAt, // how far out on Pine Lake (m; negative on land)
    reachAt, // can (x, z) be walked to from the bridgehead over the ground (tunnels open, no swimming)? 4 m cells
    cliffAt, // how far inside a mountain (m; negative outside)
    forestAt, // how thick the forest is, 0 .. 1
    walls, // the lines the mountains' walls stand along
    paved: [{ x: docks.x + QUAY_LX + 44, z: docks.z, hx: 44, hz: QUAY_HZ, ry: 0 }], // the docks' apron, from the quay's edge to the warehouses: asphalt (client/render/terrain.js)
    tunnels: tunnels.map((t) => ({ name: t.name, a: t.a, b: t.b, y0: t.y0, y1: t.y1, len: t.len, s0: t.s0, s1: t.s1, cap: t.cap })), // cap: the mountain over the gallery, for the client to draw (s0, step, lat, n, m, h)
    trees: treesOut,
    rocks: rocksOut,
    ships, // the ships moored at the quays, drawn only: { type, x, y, z, ry } (client/render/ships.js)
    crags: new Float32Array(crags), // the cliffs' crags, drawn only: [x, y, z, scale, ry, variant] (client/render/foliage.js)
    bushes: bushesOut,
    parts,
    props,
    lights,
    roofs,
    staticGrid,
    structGrid,
    colliderGrids: [staticGrid, structGrid],
    lootSpawns,
    containers,
    partSpots,
    openings,
    openingNear,
    sites,
    resourceSpawns,
    hordeSpawns,
    spawnPoints,
    startCrates,
    start,
    car,
    cemetery: null,
    bridge,
    runway,
    city: { x: city.x, z: city.z, pitch: PITCH, grid: GRID, lots, buildings, rooms, shells, heaps, fallen: fallenBits, pancakes, signs },
    farms: [],
    homes: homes.map((o) => ({ x: o.x, z: o.z, ry: o.ry })),
  };
}
