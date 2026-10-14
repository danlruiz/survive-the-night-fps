// The island's trees, rocks and bushes (world.js), planted once every place, site and road stands: nothing grows in a
// place's yard, on a road, in the lake, in a clearing a builder asked for or where something already stands.
import { MAP_HALF, WATER_LEVEL } from '../constants.js';
import { ZONE } from '../defs.js';
import { fbm, smoothstep, clamp } from '../rng.js';
import { makeCyl, COL } from '../collision.js';
import { ROAD } from '../layout.js';

const PI = Math.PI;

// Tree variants (must match client vegetation variants by index): collision radius at scale 1
export const TREE_TYPES = [
  { name: 'pine_tall', r: 0.42 },
  { name: 'pine_dense', r: 0.4 },
  { name: 'spruce', r: 0.38 },
  { name: 'dead_twisted', r: 0.3 },
  { name: 'dead_bare', r: 0.3 },
  { name: 'birch', r: 0.24 },
  { name: 'snag', r: 0.34 },
];
export const ROCK_TYPES = [{ r: 0.9 }, { r: 1.2 }, { r: 0.7 }];

export const SCATTER_LIM = MAP_HALF - 4; // (how far out from the middle anything is scattered: trees, rocks, spawns)

// trees, rocks, bushes: [x, y, z, scale, ry, variant] each; zoneClear, inLake, occupied: what the spawns scattered
// after them keep out of
export function plantVegetation({ rng, nE, zones, zoneById, heightAt, roads, roadDistAt, roadKindAt, kit }) {
  const { parts, props, clears, extraTrees, staticGrid } = kit;
  const zoneClear = (x, z) => {
    for (const zn of zones) {
      const dx = x - zn.x;
      const dz = z - zn.z;
      if (dx * dx + dz * dz < zn.clear * zn.clear) return true;
    }
    return false;
  };
  const inLake = (x, z) => heightAt(x, z) < WATER_LEVEL + 0.35;
  const occ = new Map();
  const occKey = (i, j) => i * 4096 + j;
  const OCC_CELL = 3;
  const occupied = (x, z, r) => {
    const ci = Math.floor(x / OCC_CELL);
    const cj = Math.floor(z / OCC_CELL);
    for (let j = cj - 2; j <= cj + 2; j++) {
      for (let i = ci - 2; i <= ci + 2; i++) {
        const arr = occ.get(occKey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 3) {
          const dx = arr[k] - x;
          const dz = arr[k + 1] - z;
          const rr = arr[k + 2] + r;
          if (dx * dx + dz * dz < rr * rr) return true;
        }
      }
    }
    return false;
  };
  const occupy = (x, z, r) => {
    const key = occKey(Math.floor(x / OCC_CELL), Math.floor(z / OCC_CELL));
    let arr = occ.get(key);
    if (!arr) occ.set(key, (arr = []));
    arr.push(x, z, r);
  };
  // reserve prop / building footprints and site clearings
  for (const p of props) occupy(p.x, p.z, p.type === 'school_bus' || p.type === 'camper' || p.type === 'dump_truck' || p.type === 'heli_wreck' || p.type === 'fuel_tank' ? 5 : 2.5);
  for (const [x, z, r] of clears) occupy(x, z, Math.min(r, 6));
  const roadClear = (x, z, extra) => roadDistAt(x, z) < (roadKindAt(x, z) === ROAD.TRAIL ? 1.2 : 5.5) + extra;
  const clearHit = (x, z, pad) => {
    for (const [cx, cz, r] of clears) {
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < (r + pad) * (r + pad)) return true;
    }
    return false;
  };

  // Does a trunk / boulder of radius r at (x,z) stand on a road or trail? roadClear cannot promise that it does not:
  // the roadDist grid has 2 m cells and stores the distance less the road's extra width, so its test for a trail
  // (1.5 m to the edge) only reaches 0.1 m from the centre line. This one measures against the centre lines.
  const onRoadway = (x, z, r) => {
    if (roadDistAt(x, z) > r + 4.1) return false; // nowhere near one (the grid is good for that: a road's edge is 2.6 on it, read up to 1.5 m off)
    for (const road of roads) {
      const p = road.pts;
      const lim = (road.width + r) * (road.width + r);
      for (let i = 0; i < p.length - 2; i += 2) {
        const ex = p[i + 2] - p[i];
        const ez = p[i + 3] - p[i + 1];
        const t = clamp(((x - p[i]) * ex + (z - p[i + 1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
        const dx = x - p[i] - ex * t;
        const dz = z - p[i + 1] - ez * t;
        if (dx * dx + dz * dz < lim) return true;
      }
    }
    return false;
  };

  // Does a trunk / boulder of radius r at (x, z) stand in an upright piece a place built (a wall, a post, a machine)?
  // (its grid is built on the first call: every place is up by then)
  let partCells = null;
  function partBlocked(x, z, r) {
    if (!partCells) {
      partCells = new Map();
      for (const p of parts) {
        if (p.rx || p.rz || p.sy < 1 || (p.shape !== 'box' && p.shape !== 'cyl')) continue;
        const e = Math.hypot(p.sx, p.sz) / 2;
        for (let i = Math.floor((p.x - e) / 8); i <= Math.floor((p.x + e) / 8); i++)
          for (let j = Math.floor((p.z - e) / 8); j <= Math.floor((p.z + e) / 8); j++) {
            const k = i * 65536 + j;
            if (!partCells.has(k)) partCells.set(k, []);
            partCells.get(k).push(p);
          }
      }
    }
    for (let i = Math.floor((x - r) / 8); i <= Math.floor((x + r) / 8); i++)
      for (let j = Math.floor((z - r) / 8); j <= Math.floor((z + r) / 8); j++) {
        for (const p of partCells.get(i * 65536 + j) || []) {
          if (p.shape === 'cyl') {
            if (Math.hypot(p.x - x, p.z - z) < r + p.sx / 2) return true;
          } else {
            const c = Math.cos(p.ry), s = Math.sin(p.ry), dx = x - p.x, dz = z - p.z;
            const lx = c * dx - s * dz, lz = s * dx + c * dz;
            if (Math.hypot(Math.max(0, Math.abs(lx) - p.sx / 2), Math.max(0, Math.abs(lz) - p.sz / 2)) < r) return true;
          }
        }
      }
    return false;
  }
  const trees = [];
  const pushTree = (x, z, v, scale) => {
    const y = heightAt(x, z);
    const rot = rng.range(0, PI * 2);
    occupy(x, z, 1.4 * scale);
    // a tree on a road is drawn and given its room like any other, then left out: the random stream and the occupancy
    // map stay as they were, so not one other tree, rock, bush or pick-up spot of the seed moves
    if (onRoadway(x, z, TREE_TYPES[v].r * scale) || partBlocked(x, z, TREE_TYPES[v].r * scale)) return; // (nor up through a wall, a fence or a post)
    const c = makeCyl(x, z, y - 1, y + 14 * scale, TREE_TYPES[v].r * scale, COL.STATIC | COL.TREE);
    c.tv = v;
    c.ti = trees.length / 6; // (its record in world.trees: the one a client draws, and hides while it is felled)
    trees.push(x, y, z, scale, rot, v);
    staticGrid.add(c);
  };
  for (const [x, z, v, s] of extraTrees) {
    if (occupied(x, z, 1.2) || roadClear(x, z, 0) || inLake(x, z) || clearHit(x, z, 0.5)) continue;
    pushTree(x, z, v, s);
  }
  const TREE_ATTEMPTS = 16000;
  const LIM = SCATTER_LIM;
  const church = zoneById[ZONE.CHURCH];
  for (let a = 0; a < TREE_ATTEMPTS; a++) {
    const x = rng.range(-LIM, LIM);
    const z = rng.range(-LIM, LIM);
    const dens = fbm(nE, x * 0.012, z * 0.012, 3);
    if (rng() > 0.25 + 0.75 * smoothstep(-0.35, 0.3, dens)) continue;
    if (zoneClear(x, z)) continue;
    if (roadClear(x, z, 0)) continue;
    if (inLake(x, z)) continue;
    if (clearHit(x, z, 0.8)) continue;
    const scale = rng.range(0.75, 1.3);
    if (occupied(x, z, 1.5 * scale)) continue;
    // variant: mostly conifers; dead trees near the chapel & in dark patches
    const nearChurch = church && Math.hypot(x - church.x, z - church.z) < 90;
    const r = rng();
    let v;
    if (nearChurch && r < 0.45) v = rng.chance(0.5) ? 3 : 4;
    else if (r < 0.26) v = 0;
    else if (r < 0.5) v = 1;
    else if (r < 0.7) v = 2;
    else if (r < 0.8) v = 5;
    else if (r < 0.87) v = 6;
    else if (r < 0.94) v = 3;
    else v = 4;
    pushTree(x, z, v, scale);
  }

  const rocks = [];
  // (a boulder is mined for stone: COL.ROCK; the quarry's own give more: COL.QUARRY)
  const pushRock = (x, z, v, scale, r, more = 0) => {
    const y = heightAt(x, z) - 0.25 * scale;
    const rot = rng.range(0, PI * 2);
    occupy(x, z, r);
    if (onRoadway(x, z, r * 0.85) || partBlocked(x, z, r * 0.85)) return; // (left out the way a tree is, above)
    rocks.push(x, y, z, scale, rot, v);
    staticGrid.add(makeCyl(x, z, y - 1, y + r * 0.9, r * 0.85, COL.STATIC | COL.ROCK | more));
  };
  for (let a = 0; a < 900 && rocks.length < 380 * 6; a++) {
    const x = rng.range(-LIM, LIM);
    const z = rng.range(-LIM, LIM);
    if (zoneClear(x, z) || roadClear(x, z, 0.5) || inLake(x, z) || clearHit(x, z, 1)) continue;
    const v = rng.int(0, ROCK_TYPES.length - 1);
    const scale = rng.range(0.6, 1.8);
    const r = ROCK_TYPES[v].r * scale;
    if (occupied(x, z, r + 0.5)) continue;
    pushRock(x, z, v, scale, r);
  }
  // boulders around the quarry and the mine
  for (const id of [ZONE.QUARRY, ZONE.MINE]) {
    const q = zoneById[id];
    if (!q) continue;
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, PI * 2);
      const d = rng.range(q.flat * 0.75, q.flat + 8);
      const x = q.x + Math.sin(a) * d;
      const z = q.z + Math.cos(a) * d;
      if (occupied(x, z, 1.2) || roadClear(x, z, 0)) continue;
      const v = rng.int(0, ROCK_TYPES.length - 1);
      const scale = rng.range(1.2, 2.4);
      pushRock(x, z, v, scale, ROCK_TYPES[v].r * scale, id === ZONE.QUARRY ? COL.QUARRY : 0);
    }
  }

  const bushes = [];
  for (let a = 0; a < 9000; a++) {
    const x = rng.range(-LIM, LIM);
    const z = rng.range(-LIM, LIM);
    if (roadDistAt(x, z) < 4 || inLake(x, z)) continue;
    let inZone = false;
    for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.flat * 0.8) inZone = true;
    if (inZone && rng() < 0.85) continue;
    if (clearHit(x, z, 0)) continue;
    if (occupied(x, z, 0.4)) continue;
    bushes.push(x, heightAt(x, z), z, rng.range(0.7, 1.5), rng.range(0, PI * 2), rng.int(0, 2));
  }
  return { trees, rocks, bushes, zoneClear, inLake, occupied };
}
