// What grows on the mainland (mainland.js): the forest, the trees in the open, the cliffs' crags, the rocks, the bushes
// and the weeds the places planted - and the bitmap of what is taken that the spawns are scattered round
// (mainland/spawns.js).
import { ZONE } from '../defs.js';
import { PROPS } from '../props.js';
import { smoothstep, hash2 } from '../rng.js';
import { makeCyl, makeTree, COL } from '../collision.js';
import { ROAD } from '../layout.js';
import { SIZE, HALF, CLIFF_IN, TREE_R, ROCK_R } from './consts.js';

const PI = Math.PI;

// weeds: what the places planted ([x, z, scale, y, variant]); walls: the mountains' walls (mainland/mountains.js)
export function plantVegetation({ seed, rng, plan, ground, roadKindAt, kit, weeds, walls, reachAt }) {
  const { head, onField, seaAt, tunnelOf, cliffAt, forestAt, zones } = plan;
  const { heightAt, roadDistAt, inWater, nearZone } = ground;
  const { staticGrid, parts, props, extraTrees, clears, addPropColliders, propBlocked } = kit;
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

  return { occ, occupied, zoneClear, partCells, clearCells, trees, crags, LIM, rocks, bushes };
}
