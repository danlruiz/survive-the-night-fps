// Where things turn up on the mainland once it is built (mainland.js): the forest's floor-loot spots, kept to the land
// a body can walk to and out of, and the rings the night horde falls back to round the city and the airport.
import { ZONE } from '../defs.js';
import { RIVER_HW } from './consts.js';

const PI = Math.PI;

// reachAt: the land a body walks to (mainland/sites.js); occupied, zoneClear, LIM: the vegetation's (mainland/vegetation.js)
export function scatterSpawns({ rng, plan, ground, staticGrid, reachAt, occupied, zoneClear, LIM }) {
  const { city, field, inCity, riverAt, cliffAt } = plan;
  const { heightAt, inWater } = ground;
  // (a spot in the woods is only kept if a body can walk out of it: of eight ways out, at least two run 8 m clear of
  // every trunk, boulder and wall. In the thick woods a ring of trunks can close round a spot)
  const solidNear = (x, z, r) => {
    const y = heightAt(x, z);
    for (const c of staticGrid.cellAt(x, z) || []) {
      if (c.y1 < y + 0.3 || c.y0 > y + 1.8) continue;
      const lx = c.c * (x - c.x) - c.s * (z - c.z);
      const lz = c.s * (x - c.x) + c.c * (z - c.z);
      if (c.type === 0 ? Math.abs(lx) < c.hx + r && Math.abs(lz) < c.hz + r : lx * lx + lz * lz < (c.r + r) ** 2) return true;
    }
    return false;
  };
  const WALK_R = 16;
  const WN = WALK_R * 2 + 1;
  const wseen = new Uint8Array(WN * WN);
  const wq = new Int32Array(WN * WN);
  const walkOut = (x, z) => {
    wseen.fill(0);
    let h = 0, t = 0;
    const c = WALK_R * WN + WALK_R;
    wq[t++] = c;
    wseen[c] = 1;
    while (h < t) {
      const k = wq[h++];
      const i = k % WN, j = (k / WN) | 0;
      if ((i - WALK_R) ** 2 + (j - WALK_R) ** 2 >= (WALK_R - 1) ** 2) return true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = (j + dj) * WN + i + di;
        if (wseen[m]) continue;
        wseen[m] = 1;
        const px = x + i + di - WALK_R, pz = z + j + dj - WALK_R;
        if (solidNear(px, pz, 0.4) || inWater(px, pz) || cliffAt(px, pz) > -1) continue;
        wq[t++] = m;
      }
    }
    return false;
  };
  const resourceSpawns = [];
  for (let a = 0; a < 16000 && resourceSpawns.length < 560; a++) {
    const x = rng.range(-LIM + 20, LIM - 20);
    const z = rng.range(-LIM + 20, LIM - 20);
    if (zoneClear(x, z) || inCity(x, z, 12) || inWater(x, z) || occupied(x, z, 0.8) || cliffAt(x, z) > -14 || !reachAt(x, z) || !walkOut(x, z)) continue; // (not on the scree and foothills at a mountain's foot: too steep a pocket there for the dead's grid)
    resourceSpawns.push({ x, y: heightAt(x, z) + 0.02, z, zone: ZONE.FOREST });
  }
  // fallback horde spawns (the horde normally appears round wherever the survivors are): rings round the city and
  // round the airport, on open ground of each side
  const hordeSpawns = [];
  for (const [cx, cz, r0, r1] of [[city.x, city.z, 240, 420], [field.x, field.z, 200, 330]]) {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * PI * 2;
      for (let tries = 0; tries < 10; tries++) {
        const r = rng.range(r0, r1);
        const x = cx + Math.sin(a) * r;
        const z = cz + Math.cos(a) * r;
        if (Math.abs(x) > LIM - 10 || Math.abs(z) > LIM - 10 || inWater(x, z) || cliffAt(x, z) > -4 || riverAt(x, z) < RIVER_HW + 6) continue;
        hordeSpawns.push({ x, z });
        break;
      }
    }
  }
  return { resourceSpawns, hordeSpawns };
}
