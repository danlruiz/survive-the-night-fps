// The mainland's ground (mainland.js): the lowland, the hills, the mountains and their peaks, the quarry's pit, the
// levels of the built-up places, the water's beds, the tunnels' corridors and caps - the heightfield, before the roads
// are graded into it (mainland/roads.js), and the grids the roads fill in.
import { GRID_STEP, WATER_LEVEL } from '../constants.js';
import { ZONE } from '../defs.js';
import { mulberry32, fbm, smoothstep, lerp, clamp } from '../rng.js';
import { PLACES, AREAS } from '../mainland-layout.js';
import { bilinearSampler } from '../heightfield.js';
import { SIZE, HALF, N, FLOOR, BLUFF, PITCH, QUAY_LX, QUAY_HZ, LEDGES, RIVER_HW, RIVER_BANK, RIVER_DEPTH, CREEK_HW, CLIFF, CLIFF_IN, MASS, MASS_IN, PEAK, FOOTHILL, FOOTHILL_IN, CUT_HW, TUNNEL_H, CUT_LEN, FX } from './consts.js';

const PI = Math.PI;

export function shapeMainland({ seed, nA, nB, nD, nE, nP, plan }) {
  const { G2, city, zb, SHORE, head, AIR, field, FENCE, vi, seaAt, lakeAt, isletAt, riverAt, creekAt, tunnels, tunnelOf, mtnH, cliffAt, mtnAt, forestAt, docks, zones, zoneById, mtnMask } = plan;
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

  return { reliefGrid, peakCells, PIT, pitRamp, cityH, fieldH, zoneCells, flatCells, heights, roadDist, roadKind, roadH, roadDir, rawH };
}
