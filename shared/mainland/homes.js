// The mainland's houses (mainland.js): down the lanes of the suburbs, the streets round Town Center and North Coast
// Village, each in its yard (house() in mainland-places.js builds one).
import { GRID_STEP } from '../constants.js';
import { ZONE } from '../defs.js';
import { PROPS } from '../props.js';
import { smoothstep, lerp, hash2 } from '../rng.js';
import { ROAD } from '../layout.js';
import { house } from '../mainland-places.js';
import { AREAS } from '../mainland-layout.js';
import { HALF, N, RIVER_HW } from './consts.js';

const PI = Math.PI;

// weed, K: mainland.js's; fits: the city's kit's (mainland/citykit.js). Returns the homes: [{ x, z, ry, h, zone }]
export function buildHomes({ seed, rng, plan, ground, kit, weed, K, fits }) {
  const { W, inCity, onField, lakeAt, riverAt, cliffAt } = plan;
  const { heights, roadDist, roads, heightAt, levelUnder, roadDistAt, inWater, nearZone } = ground;
  const { props, propBlocked, Builder } = kit;
  // THE SUBURBS, THE STREETS ROUND TOWN CENTER AND NORTH COAST VILLAGE: houses along the lanes of the picture's areas
  // of houses (and the roads through them), each turned to the lane it stands on - a quarter turn at a time, so its
  // walls lie along the nav grid - every few metres down both sides where there is room for its yard. The ground under
  // each is levelled first.
  const homes = []; // { x, z, ry, h, zone }
  {
    const clearOf = (x, z) => homes.every((o) => Math.hypot(o.x - x, o.z - z) > 15.5);
    const AREA_ZONE = { suburbsNE: ZONE.SUBURB, suburbsNW: ZONE.SUBURB, suburbsE: ZONE.WESTGATE, townSouth: ZONE.CITY, village: ZONE.NORTH_COAST };
    for (const [name, area] of Object.entries(AREAS)) {
      const [x0, z0] = W([area[0], area[1]]);
      const [x1, z1] = W([area[2], area[3]]);
      const zone = AREA_ZONE[name];
      for (const road of roads) {
        if (road.kind !== ROAD.ASPHALT || road.width > 3.7) continue;
        const p = road.pts;
        let acc = rng.range(4, 14);
        for (let i = 1; i < p.length / 2 - 1; i++) {
          acc += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
          if (acc < 21) continue;
          const x = p[i * 2];
          const z = p[i * 2 + 1];
          if (x < x0 || x > x1 || z < z0 || z > z1) continue;
          const tx = p[i * 2 + 2] - p[i * 2 - 2];
          const tz = p[i * 2 + 3] - p[i * 2 - 1];
          const tl = Math.hypot(tx, tz) || 1;
          for (const sd of [-1, 1]) {
            const off = road.width + 9;
            const hx = x - (tz / tl) * sd * off;
            const hz = z + (tx / tl) * sd * off;
            const ry = Math.round(Math.atan2(hx - x, hz - z) / (PI / 2)) * (PI / 2); // (its front, -Z, to the lane)
            const c = Math.cos(ry);
            const s = Math.sin(ry);
            const corner = (lx, lz) => [hx + c * lx + s * lz, hz - s * lx + c * lz];
            const free = [[-6, -5], [6, -5], [6, 5], [-6, 5], [0, -5], [0, 5], [-6, 0], [6, 0], [0, 0]].every(([lx, lz]) => {
              const [cx, cz] = corner(lx, lz);
              return roadDistAt(cx, cz) > 4.6 && !inCity(cx, cz, 16) && !inWater(cx, cz) && cliffAt(cx, cz) < -6 && riverAt(cx, cz) > RIVER_HW + 16 && lakeAt(cx, cz) < -4 && !onField(cx, cz, 6);
            });
            const placeNear = nearZone(hx, hz, 6);
            if (!free || !clearOf(hx, hz) || (placeNear && ![ZONE.SUBURB, ZONE.WESTGATE, ZONE.NORTH_COAST, ZONE.CITY].includes(placeNear.id))) continue;
            let lo = Infinity;
            let hi = -Infinity;
            for (const [lx, lz] of [[-6, -5], [6, -5], [6, 5], [-6, 5]]) {
              const hh = heightAt(...corner(lx, lz));
              lo = Math.min(lo, hh);
              hi = Math.max(hi, hh);
            }
            if (hi - lo > 3.5) continue;
            // (its plot is levelled out to 15 m: a neighbour that near is on ground of much the same height, or one would
            // be cut into the other's)
            if (homes.some((o) => Math.hypot(o.x - hx, o.z - hz) < 30 && Math.abs(o.h - (lo + hi) / 2) > 0.35)) continue;
            homes.push({ x: hx, z: hz, ry, h: (lo + hi) / 2, zone });
            acc = rng.range(-4, 2); // (and on to the other side of the lane: as the picture draws them, a house each side)
          }
        }
      }
    }
    // the ground under each, level (not the lanes beside it)
    for (const o of homes) {
      const R = 11;
      for (let j = Math.max(0, Math.floor((o.z - R + HALF) / GRID_STEP)); j <= Math.min(N - 1, Math.ceil((o.z + R + HALF) / GRID_STEP)); j++) {
        for (let i = Math.max(0, Math.floor((o.x - R + HALF) / GRID_STEP)); i <= Math.min(N - 1, Math.ceil((o.x + R + HALF) / GRID_STEP)); i++) {
          const k = j * N + i;
          if (roadDist[k] < 3) continue;
          const lx = -HALF + i * GRID_STEP - o.x;
          const lz = -HALF + j * GRID_STEP - o.z;
          const c = Math.cos(o.ry);
          const s = Math.sin(o.ry);
          const hz = s * lx + c * lz; // (the yard: out to the car at its front and the bins at its side)
          const d = Math.hypot(Math.max(0, Math.abs(c * lx - s * lz) - 9), Math.max(0, hz < -2 ? -hz - 10.5 : hz - 6.5));
          heights[k] = lerp(heights[k], o.h, 1 - smoothstep(0, 4, d));
        }
      }
    }
    homes.forEach((o, k) => {
      const b = new Builder(o.x, o.z, o.ry, o.h);
      b.zone = o.zone;
      b.yard = { x: o.x, z: o.z, flat: 5.5 }; // (what stands out past the house - its car, its bins - stands on the ground)
      // (its car at its front - house(): (7.6, -7.5) - only where the ground under it is level: at the lane it can stand
      // half on the road, which is not always at the yard's height)
      // (its dumpster at its side only where no neighbour's house stands near it: one built after it is not seen by fits)
      const bins = homes.every((q) => q === o || Math.hypot(q.x - b.wx(-7.2, 2), q.z - b.wz(-7.2, 2)) > 8);
      house(b, 0, 0, 0, k, K, levelUnder('car_wreck', b.wx(7.6, -7.5), b.wz(7.6, -7.5), b.ry + 0.1), bins);
      b.clear(0, 0, 9);
      if (k % 5 === 2) b.prop('mailbox', 2.6, -6.6, 0);
      // ITS PLOT, kept once: the drive to its car and the path to its door, a hedge down its sides and along its front
      // either side of them (bushes: walked through, nothing to stand on), a shed out the back, a table in its garden
      // or a vegetable bed gone to weed, a second car on the drive. (Dice of its own - hash2 - so nothing else moves;
      // nothing laid where the lane runs, nothing solid where it does not fit.)
      const hd = (n) => hash2(k, n, (seed ^ 0x40b5) | 0);
      const offLane = (lx, lz, keep = 3.6) => roadDistAt(b.wx(lx, lz), b.wz(lx, lz)) > keep;
      const slab = (lx, lz, w, d, mat) => {
        if ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].some(([dx, dz]) => !offLane(lx + dx, lz + dz, 2.6) || Math.abs(heightAt(b.wx(lx + dx, lz + dz), b.wz(lx + dx, lz + dz)) - b.y0) > 0.12)) return;
        b.box(lx, -0.04, lz, w, 0.075, d, mat, { collide: false });
      };
      slab(7.6, -8.2, 3.2, 7.6, hd(1) < 0.55 ? 'concrete' : 'gravel'); // the drive
      slab(0, -6.9, 1.3, 5.6, 'concrete'); // the path
      for (const sx of [-1, 1]) {
        if (hd(2 + sx) < 0.3) continue; // (no hedge down this side)
        for (let lz = -9; lz <= 6; lz += 1.0) if (offLane(sx * 9.2, lz)) weed(b, sx * 9.2 + (hd(10 + lz) - 0.5) * 0.25, lz, 1.25 + hd(20 + lz) * 0.4, null, 0);
      }
      if (hd(4) < 0.7) for (let lx = -8.6; lx <= 8.6; lx += 1.0) if ((lx < -1.3 || lx > 1.3) && (lx < 5.4 || lx > 9.8) && offLane(lx, -10.2)) weed(b, lx, -10.2 + (hd(30 + lx) - 0.5) * 0.25, 1.15 + hd(40 + lx) * 0.35, null, 0);
      // (what stands out in its garden: clear of a neighbour's house too, which may be built after it)
      const out = (type, lx, lz, ry, oo = {}) => fits(b, type, lx, lz, ry) && levelUnder(type, b.wx(lx, lz), b.wz(lx, lz), b.ry + ry) && homes.every((q) => q === o || Math.hypot(q.x - b.wx(lx, lz), q.z - b.wz(lx, lz)) > 8.5) && b.prop(type, lx, lz, ry, { seed: Math.floor(hd(50) * 3), ...oo });
      if (hd(5) < 0.5) {
        // the shed: planked, a lean-to roof of tin, its door to the garden
        const [sx, sz] = [6.6, 6.4];
        if ([[sx - 1.6, sz - 1.4], [sx + 1.6, sz + 1.4], [sx + 1.6, sz - 1.4], [sx - 1.6, sz + 1.4]].every(([x, z]) => offLane(x, z) && Math.abs(heightAt(b.wx(x, z), b.wz(x, z)) - b.y0) < 0.25) && !propBlocked('crate', b.wx(sx, sz), b.wz(sx, sz), 0) && homes.every((q) => q === o || Math.hypot(q.x - b.wx(sx, sz), q.z - b.wz(sx, sz)) > 10) && !props.some((q) => Math.abs(q.x - b.wx(sx, sz)) < 3.6 && Math.abs(q.z - b.wz(sx, sz)) < 3.6 && PROPS[q.type]?.boxes)) {
          // (...and clear of a neighbour's house and the doors in its sides - one built after it was boxed in by it - and
          // of what stands in a neighbour's garden behind it)
          b.box(sx, -0.1, sz, 2.8, 2.3, 2.2, 'planks');
          b.box(sx, 2.2, sz, 3.2, 0.12, 2.6, 'tin_rust', { rx: 0.12, collide: false });
          b.box(sx - 0.5, 0, sz - 1.13, 0.9, 1.9, 0.05, 'door', { collide: false });
        }
      }
      if (hd(6) < 0.18) out('picnic_table', -4.2, 7.6, 0.15 + hd(7) * 0.3);
      else if (hd(6) < 0.7) {
        // a vegetable bed, gone to weed
        slab(-5.2, 7.2, 3.6, 2.2, 'earth');
        for (let q = 0; q < 4; q++) weed(b, -6.6 + q * 0.95, 7.2 + (hd(60 + q) - 0.5) * 0.8, 0.6 + hd(70 + q) * 0.3);
      }
      // (a bicycle one plot in ten - and no second car on the drives: each is a model of thousands of vertices in the
      // static world, the GPU's memory; a house's own car is house()'s)
      if (hd(11) < 0.1) out('bicycle', -2.6, -5.2, 1.3 + hd(12), { nocollide: true });
    });
  }
  return homes;
}
