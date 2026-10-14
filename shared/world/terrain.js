// The island's valley before anything is built on it (world.js): layout.js plans it for the seed - the course of
// Route 9, where your car broke down, the lake, which named places there are and where, which of them the roads
// join - and this presses that plan into the hills: the places' level yards, the lake and pond bowls and the rise at
// the map's edge, sampled into the raw heightfield the roads are then routed over and graded on.
import { MAP_HALF, GRID_N, GRID_STEP, WATER_LEVEL } from '../constants.js';
import { ZONE } from '../defs.js';
import { mulberry32, fbm, smoothstep, lerp } from '../rng.js';
import { planLayout } from '../layout.js';
import { bilinearSampler } from '../heightfield.js';

const FLOOR = WATER_LEVEL + 1.2; // soft floor of the terrain outside lakes/ponds

// noise: the valley's noise fields nA..nE (world.js)
export function shapeValley(seed, { nA, nB, nC, nD, nE }) {
  // the raw hills, before the valley floor is pressed into them
  const relief = (x, z) => {
    const n1 = fbm(nA, x * 0.0042, z * 0.0042, 4);
    const n2 = fbm(nB, x * 0.017, z * 0.017, 3);
    const rd = 1 - Math.abs(nC(x * 0.0075, z * 0.0075));
    return n1 * 24 + n2 * 4.5 + rd * rd * 9 - 5;
  };
  // own rng stream: the plan only depends on the seed
  const { valley, zones, lake, ponds, highway: hwyAnchors, links, rail: railPlan } = planLayout(mulberry32(seed ^ 0x1a707), relief, mulberry32(seed ^ 0x7a11));
  const zoneById = {};
  for (const z of zones) zoneById[z.id] = z;
  const nearZone = (x, z, pad) => {
    for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.flat + pad) return zn;
    return null;
  };

  // the hills flatten out around the breakdown; valleys are softly floored above the water line (only the
  // lake and ponds hold water)
  const H0 = (x, z) => {
    const d = Math.hypot(x - valley.x, z - valley.z);
    const hill = 0.35 + 0.65 * smoothstep(30, 160, d);
    const micro = fbm(nD, x * 0.09, z * 0.09, 2) * 0.28;
    const h = relief(x, z) * (0.1 + 0.9 * hill);
    const a = (h - FLOOR) * 0.8;
    return FLOOR + 0.5 * (a + Math.sqrt(a * a + 9)) + micro;
  };
  for (const z of zones) {
    if (z.id === ZONE.DOCK) z.h = WATER_LEVEL + 1.5;
    else z.h = Math.max(FLOOR + 0.8, H0(z.x, z.z) * 0.55 + (z.raise || 0) - (z.pit || 0));
  }
  const edgeRise = (x, z) => smoothstep(MAP_HALF - 45, MAP_HALF - 2, Math.max(Math.abs(x), Math.abs(z))) * 22;

  const H1 = (x, z) => {
    let h = H0(x, z);
    for (let i = 0; i < zones.length; i++) {
      const zn = zones[i];
      const dx = x - zn.x;
      const dz = z - zn.z;
      const d2 = dx * dx + dz * dz;
      const lim = zn.flat + zn.blend;
      if (d2 > lim * lim) continue;
      const t = 1 - smoothstep(zn.flat, lim, Math.sqrt(d2));
      h = lerp(h, zn.h, t);
    }
    // lake
    const dLraw = Math.hypot(x - lake.x, z - lake.z);
    if (dLraw < lake.r + 60) {
      const dL = dLraw + nE(x * 0.03, z * 0.03) * 9;
      const shore = 1 - smoothstep(lake.r - 6, lake.r + 45, dL);
      h = lerp(h, Math.min(h, WATER_LEVEL + 1.2), shore * 0.9);
      const bowl = 1 - smoothstep(lake.r * 0.25, lake.r - 2, dL);
      h = lerp(h, WATER_LEVEL - 5.5, bowl);
    }
    for (let i = 0; i < ponds.length; i++) {
      const pd = ponds[i];
      const dr = Math.hypot(x - pd.x, z - pd.z);
      if (dr > pd.r + 30) continue;
      const dp = dr + nE(x * 0.05 + i * 7, z * 0.05) * pd.r * 0.22;
      const shore = 1 - smoothstep(pd.r - 3, pd.r + 22, dp);
      h = lerp(h, Math.min(h, WATER_LEVEL + 1.0), shore * 0.85);
      const bowl = 1 - smoothstep(pd.r * 0.2, pd.r - 1, dp);
      h = lerp(h, WATER_LEVEL - pd.depth, bowl);
    }
    return h + edgeRise(x, z);
  };

  // raw heightfield (before roads): sampled by the road router and road grading instead of re-evaluating noise
  const N = GRID_N;
  const heights = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = -MAP_HALF + j * GRID_STEP;
    for (let i = 0; i < N; i++) {
      const x = -MAP_HALF + i * GRID_STEP;
      heights[j * N + i] = H1(x, z);
    }
  }
  const rawH = bilinearSampler(heights, N, MAP_HALF);

  return { zones, lake, ponds, hwyAnchors, links, railPlan, zoneById, nearZone, edgeRise, heights, rawH };
}
