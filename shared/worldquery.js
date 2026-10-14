// The queries a finished world answers, the same on both maps (world.js, mainland.js): the ground under feet, a ray
// against the terrain, which place a spot is in, the doorway nearest a spot. Each is made by a small factory here, so
// a world's query keeps hold of what it asks and nothing else that was built along with it.
import { WATER_LEVEL } from './constants.js';
import { ZONE } from './defs.js';

// floorAt(x, z, y): the ground under feet at height y over (x,z): the terrain, or the floor of the drift they are down
// in (mine.js), or what the railway has to stand on above the ground (rail.js). heightAt is the terrain alone: what
// grows, what is built and what the map shows stand on that.
// rayTerrain(ox, oy, oz, dx, dy, dz, maxT): how far along the ray it first meets the ground (-1: not within maxT, or it
// climbed out over `ceiling`, the highest the terrain goes)
// mine, rail: null on a map without them
export function groundQueries({ heightAt, mine, rail, ceiling }) {
  const floorAt = (x, z, y) => {
    if (mine) {
      const f = mine.floorFor(x, z, y);
      if (f === f) return f;
    }
    // (...or what the railway has to stand on above the ground: a platform, the floor of an open boxcar)
    if (rail) {
      const f = rail.floorFor(x, z, y);
      if (f === f) return f;
    }
    return heightAt(x, z);
  };
  // how far (x,y,z) is above the solid ground: the terrain, or in the air of a drift its floor (the rock around a
  // drift is under the terrain, so its walls and roof stop a ray like any hillside)
  const above = (x, y, z) => {
    if (mine) {
      const f = mine.voidFloor(x, z, y);
      if (f === f) return y - f;
    }
    return y - heightAt(x, z);
  };
  const rayTerrain = (ox, oy, oz, dx, dy, dz, maxT) => {
    const step = 0.75;
    let prevT = 0;
    if (above(ox, oy, oz) < 0) return 0;
    for (let t = step; t <= maxT + step; t += step) {
      const tt = t > maxT ? maxT : t;
      const y = oy + dy * tt;
      if (y > ceiling && dy >= 0) return -1;
      if (above(ox + dx * tt, y, oz + dz * tt) < 0) {
        let lo = prevT;
        let hi = tt;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          if (above(ox + dx * m, oy + dy * m, oz + dz * m) < 0) hi = m;
          else lo = m;
        }
        return (lo + hi) / 2;
      }
      prevT = tt;
      if (tt >= maxT) break;
    }
    return -1;
  };
  return { floorAt, rayTerrain };
}

// which place (x,z) is in (ZONE.FOREST: none)
export function zoneAtIn(zones) {
  return (x, z) => {
    for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.flat + 8) return zn.id;
    return ZONE.FOREST;
  };
}

// nearest doorway to (x,z) within maxD (for door boards)
export function openingNearIn(openings) {
  return (x, z, maxD = 1.2) => {
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
}

// is (x,z) water too deep to wade?
export const deepWaterOf = (heightAt) => (x, z) => heightAt(x, z) < WATER_LEVEL - 0.95;
