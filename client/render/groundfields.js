// The ground's layers on the heightfield grid (what the terrain draws, terrain.js, and where the grass stands,
// foliage.js): grass, forest floor, road, mud, rock, wet ground, bare soil and scree, and the shade under the trees.
import { GRID_STEP, WATER_LEVEL } from '../../shared/constants.js';
import { smoothstep } from '../../shared/rng.js';

const FIELDS = new WeakMap();
// canopy contribution per tree variant (conifers shade the floor, dead trees barely)
const CANOPY_W = [1, 1, 0.95, 0.12, 0.1, 0.55, 0.05];

/**
 * Per-vertex ground layers on the heightfield grid: splat (grass, forest, road, mud), rock (steep slopes),
 * wet (drainage lines / low ground), ao (under trees), normals. sample(x, z, out) bilinearly reads them.
 * base: what the terrain draws under and beside the roads (grass, forest, mud summing to 1) + road coverage;
 * the terrain shader lays the road over it per pixel.
 */
export function groundFields(world) {
  let f = FIELDS.get(world);
  if (f) return f;
  const N = world.gridN;
  const MAP_HALF = world.half;
  const H = world.heights;
  const count = N * N;
  const nrm = new Float32Array(count * 3);
  const splat = new Float32Array(count * 4);
  const base = new Float32Array(count * 4);
  const rock = new Float32Array(count);
  const wet = new Float32Array(count);
  const ao = new Float32Array(count).fill(1);
  const canopy = new Float32Array(count);
  // (bare ground, 0..1: soil - gravel and trodden dirt along the roads' edges, in the places' yards and in patches in
  // the open; scree - broken stone along the foot of a mountain's cliffs. Less grass grows on either)
  const soil = new Float32Array(count);
  const scree = new Float32Array(count);
  const at = (i, j) => H[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const nx = at(i - 1, j) - at(i + 1, j);
      const ny = 2 * GRID_STEP;
      const nz = at(i, j - 1) - at(i, j + 1);
      const l = Math.hypot(nx, ny, nz);
      nrm[k * 3] = nx / l;
      nrm[k * 3 + 1] = ny / l;
      nrm[k * 3 + 2] = nz / l;
    }
  }
  // canopy density and trunk occlusion from the trees
  const trees = world.trees;
  for (let t = 0; t < trees.length; t += 6) {
    const tx = trees[t], tz = trees[t + 2], sc = trees[t + 3], v = trees[t + 5] | 0;
    const R = 6.5 * sc;
    const cw = CANOPY_W[v] ?? 0.5;
    const i0 = Math.max(0, Math.floor((tx - R + MAP_HALF) / GRID_STEP));
    const i1 = Math.min(N - 1, Math.ceil((tx + R + MAP_HALF) / GRID_STEP));
    const j0 = Math.max(0, Math.floor((tz - R + MAP_HALF) / GRID_STEP));
    const j1 = Math.min(N - 1, Math.ceil((tz + R + MAP_HALF) / GRID_STEP));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * N + i;
        const d = Math.hypot(-MAP_HALF + i * GRID_STEP - tx, -MAP_HALF + j * GRID_STEP - tz);
        if (d >= R) continue;
        const q = 1 - (d / R) ** 2;
        canopy[k] += cw * q * q;
        const r = 3.2 * sc;
        if (d < r) ao[k] = Math.max(0.45, ao[k] - 0.28 * (1 - d / r));
      }
    }
  }
  // contact shade under bushes / ferns
  const bushes = world.bushes;
  for (let b = 0; b < bushes.length; b += 6) {
    const bx = bushes[b], bz = bushes[b + 2], r = 1.6 * bushes[b + 3];
    const i0 = Math.max(0, Math.floor((bx - r + MAP_HALF) / GRID_STEP)), i1 = Math.min(N - 1, Math.ceil((bx + r + MAP_HALF) / GRID_STEP));
    const j0 = Math.max(0, Math.floor((bz - r + MAP_HALF) / GRID_STEP)), j1 = Math.min(N - 1, Math.ceil((bz + r + MAP_HALF) / GRID_STEP));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-MAP_HALF + i * GRID_STEP - bx, -MAP_HALF + j * GRID_STEP - bz);
        if (d < r) ao[j * N + i] = Math.max(0.45, ao[j * N + i] - 0.16 * (1 - d / r));
      }
    }
  }
  const zones = world.zones;
  const pit = (world.marks || []).find((m) => m.kind === 'pit') || null;
  // (the paved yards a world says it has - the docks' apron: asphalt to their edges, no grass on them)
  const paved = new Uint8Array(N * N);
  for (const p of world.paved || []) {
    const c = Math.cos(p.ry || 0), sn = Math.sin(p.ry || 0);
    const R = Math.hypot(p.hx, p.hz);
    for (let j = Math.max(0, Math.floor((p.z - R + MAP_HALF) / GRID_STEP)); j <= Math.min(N - 1, Math.ceil((p.z + R + MAP_HALF) / GRID_STEP)); j++) {
      for (let i = Math.max(0, Math.floor((p.x - R + MAP_HALF) / GRID_STEP)); i <= Math.min(N - 1, Math.ceil((p.x + R + MAP_HALF) / GRID_STEP)); i++) {
        const dx = -MAP_HALF + i * GRID_STEP - p.x, dz = -MAP_HALF + j * GRID_STEP - p.z;
        if (Math.abs(c * dx - sn * dz) <= p.hx && Math.abs(sn * dx + c * dz) <= p.hz) paved[j * N + i] = 1;
      }
    }
  }
  // (the zones that reach into each 64 m cell: a vertex asks only those - a million vertices asked every zone of the
  // mainland's forty, most of the field's build)
  const ZC = 64;
  const ZN = Math.ceil((MAP_HALF * 2) / ZC) + 1;
  const zoneCells = Array.from({ length: ZN * ZN }, () => []);
  for (const zn of zones) {
    const r = zn.flat + 18;
    for (let cj = Math.max(0, Math.floor((zn.z - r + MAP_HALF) / ZC)); cj <= Math.min(ZN - 1, Math.floor((zn.z + r + MAP_HALF) / ZC)); cj++) {
      for (let cx = Math.max(0, Math.floor((zn.x - r + MAP_HALF) / ZC)); cx <= Math.min(ZN - 1, Math.floor((zn.x + r + MAP_HALF) / ZC)); cx++) zoneCells[cj * ZN + cx].push(zn);
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = -MAP_HALF + i * GRID_STEP;
      const z = -MAP_HALF + j * GRID_STEP;
      const h = H[k];
      let open = 0;
      let yard = 0;
      for (const zn of zoneCells[Math.min(ZN - 1, Math.floor((z + MAP_HALF) / ZC)) * ZN + Math.min(ZN - 1, Math.floor((x + MAP_HALF) / ZC))]) {
        const d = Math.hypot(x - zn.x, z - zn.z);
        open = Math.max(open, 1 - smoothstep(zn.flat * 0.8, zn.flat + 18, d));
        if (zn.dirt) yard = Math.max(yard, zn.dirt * (1 - smoothstep(zn.flat * 0.35, zn.flat * 0.85, d)));
      }
      const n = Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.1) * Math.cos(z * 0.037 - x * 0.012);
      // forest floor under the canopy, meadow grass in the gaps (and in the open around the sites)
      const forest = smoothstep(0.2, 0.75, canopy[k] + n * 0.18) * (1 - 0.8 * open);
      const rd = world.roadDist[k];
      const road = paved[k] ? 1 : 1 - smoothstep(1.9, 3.3, rd);
      const slope = 1 - nrm[k * 3 + 1];
      // concavity at two scales: drainage lines and hollows collect water
      let lap = 0;
      for (let s = 2; s <= 5; s += 3) lap += ((at(i - s, j) + at(i + s, j) + at(i, j - s) + at(i, j + s)) * 0.25 - h) / (s * GRID_STEP);
      wet[k] = Math.max(smoothstep(0.02, 0.16, lap), smoothstep(WATER_LEVEL + 2.5, WATER_LEVEL + 0.4, h)) * (1 - road);
      rock[k] = smoothstep(0.16, 0.27, slope + n * 0.03) * (1 - road);
      // (a quarry's pit is bare stone, its benches and all: no grass in it)
      // (on the mainland: rock where it stands up, the ledges and the floor broken stone and grit, the floor's low
      // places wet)
      let pitIn = 0;
      if (pit) {
        pitIn = (1 - smoothstep(pit.r - 4, pit.r + 3, Math.hypot(x - pit.x, z - pit.z))) * (1 - road);
        rock[k] = Math.max(rock[k], world.cliffAt ? pitIn * smoothstep(0.06, 0.16, slope) : pitIn);
      }
      let mud = smoothstep(WATER_LEVEL + 1.3, WATER_LEVEL + 0.2, h);
      // trampled dirt yards in the busier places
      const yn = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.3);
      mud = Math.max(mud, yard * (0.55 + 0.45 * yn));
      // bare ground (on a world that asks for it: the mainland's - the island's ground is as it was)
      if (world.cliffAt) {
        const n3 = Math.sin(x * 0.071 + Math.cos(z * 0.053) * 1.7) * Math.cos(z * 0.067 - x * 0.021 + Math.sin(x * 0.029) * 1.3);
        const n4 = Math.sin(x * 0.19 + Math.cos(z * 0.23) * 1.9) * Math.sin(z * 0.17 - x * 0.07);
        // a ragged strip of gravel and dirt along every road's edge, wider where the edge wanders
        const verge = paved[k] ? 0 : smoothstep(2.4, 3.4, rd) * (1 - smoothstep(4.2, 7.8, rd + n * 1.6 + n4 * 0.8));
        // the yards round the places, trodden; and patches where nothing much grows, in the open and in clearings
        const tread = open * (0.45 + 0.55 * smoothstep(-0.3, 0.4, n3 + n4 * 0.3));
        const bare = smoothstep(0.42, 0.8, n3 * 0.7 + n4 * 0.35) * (1 - forest * 0.6) * 0.75;
        soil[k] = Math.min(1, Math.max(verge * 0.85, tread * 0.8, bare, pitIn)) * (1 - road) * (1 - smoothstep(WATER_LEVEL + 1.6, WATER_LEVEL + 0.6, h));
        if (pit && pitIn > 0) wet[k] = Math.max(wet[k], pitIn * smoothstep(0.2, 0.7, n4) * (1 - smoothstep(pit.floor - 6, pit.floor, Math.hypot(x - pit.x, z - pit.z))));
        // the scree along a mountain's foot (in from its wall the faces are rock)
        const dm = world.cliffAt(x, z);
        scree[k] = dm > -20 ? (1 - smoothstep(2, 16, -dm + n4 * 2.5)) * (1 - road) : 0;
      }
      const rest = (1 - road) * (1 - mud);
      const wg = (1 - forest) * rest;
      const wf = forest * rest;
      const wm = mud * (1 - road);
      const sum = wg + wf + road + wm || 1;
      splat[k * 4] = wg / sum;
      splat[k * 4 + 1] = wf / sum;
      splat[k * 4 + 2] = road / sum;
      splat[k * 4 + 3] = wm / sum;
      base[k * 4] = (1 - forest) * (1 - mud);
      base[k * 4 + 1] = forest * (1 - mud);
      base[k * 4 + 2] = mud;
      base[k * 4 + 3] = road;
    }
  }
  const pavedAt = paved;
  const sample = (x, z, out = {}) => {
    const fx = Math.max(0, Math.min(N - 1.001, (x + MAP_HALF) / GRID_STEP));
    const fz = Math.max(0, Math.min(N - 1.001, (z + MAP_HALF) / GRID_STEP));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k00 = j * N + i, k10 = k00 + 1, k01 = k00 + N, k11 = k01 + 1;
    const bl = (a, s = 1, o = 0) => (a[k00 * s + o] * (1 - u) + a[k10 * s + o] * u) * (1 - v) + (a[k01 * s + o] * (1 - u) + a[k11 * s + o] * u) * v;
    out.grass = bl(splat, 4, 0);
    out.forest = bl(splat, 4, 1);
    out.road = bl(splat, 4, 2);
    out.mud = bl(splat, 4, 3);
    out.rock = bl(rock);
    out.wet = bl(wet);
    out.canopy = bl(canopy);
    out.soil = bl(soil);
    out.scree = bl(scree);
    return out;
  };
  f = { nrm, splat, base, rock, wet, ao, canopy, soil, scree, sample, paved: pavedAt };
  FIELDS.set(world, f);
  return f;
}
