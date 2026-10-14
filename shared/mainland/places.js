// The mainland's places outside the city (mainland.js), each built where the picture has it: the bridges over the
// river, North Coast Village's church and harbour, North Ridge Outpost, the lighthouse, the camps in South Forest, the
// broken bridge on East Pass's road and the Mile 9 truck stop. (The docks, the houses, the airfield and the mines
// have modules of their own.)
import { GRID_STEP, WATER_LEVEL } from '../constants.js';
import { ZONE, CONT } from '../defs.js';
import { smoothstep, lerp, hash2 } from '../rng.js';
import { COL } from '../collision.js';
import { HALF, N, PAVE, P } from './consts.js';

const PI = Math.PI;

// THE BRIDGES: wherever a road crosses the river. A concrete deck on piers a little over the water, rusted
// girders down its sides, what is left of its railings. (A deck is thin: the dead walk over it - server/nav.js.)
// Returns them: [{ x, y, z, ry, len, w }]
export function buildRiverBridges({ rng, roads, heightAt, kit }) {
  const { clears, Builder } = kit;
  const bridges = [];
  const b = new Builder(0, 0, 0, 0);
  b.zone = ZONE.FOREST;
  for (const road of roads) {
    for (const [i0, i1] of road.spans) {
      const p = road.pts;
      const [a, e] = [Math.max(0, i0 - 3), Math.min(p.length / 2 - 1, i1 + 3)];
      // (only where it is over the water in fact: a footpath that keeps to the bank has none)
      let over = false;
      for (let i = i0; i <= i1; i++) over ||= heightAt(p[i * 2], p[i * 2 + 1]) < WATER_LEVEL - 0.95;
      if (!over) continue;
      const w = Math.max(5, road.width * 2 + 1.4);
      for (let i = a; i < e; i++) {
        const [x0, z0, x1, z1] = [p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ry = Math.atan2(-(z1 - z0), x1 - x0);
        const top = road.hs[i] + 0.02;
        const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
        b.box(cx, top - 0.4, cz, len + 0.3, 0.4, w, 'concrete', { ry });
        const [nx, nz] = [-(z1 - z0) / len, (x1 - x0) / len];
        for (const sd of [-1, 1]) {
          // the girder, and the railing over it: posts and a rail, lengths of it gone
          b.box(cx + nx * sd * (w / 2 - 0.15), top - 1.0, cz + nz * sd * (w / 2 - 0.15), len + 0.3, 1.25, 0.3, 'rust', { ry, collide: false });
          const gone = rng.chance(0.22);
          if (gone) continue;
          b.box(cx + nx * sd * (w / 2 - 0.15), top + 0.25, cz + nz * sd * (w / 2 - 0.15), 0.09, 0.9, 0.09, 'rust', { ry, collide: false });
          b.box(cx + nx * sd * (w / 2 - 0.15), top + 1.08, cz + nz * sd * (w / 2 - 0.15), len + 0.3, 0.08, 0.08, 'rust', { ry, rz: rng.range(-0.05, 0.05), collide: false });
          b.box(cx + nx * sd * (w / 2 - 0.15), top + 0.66, cz + nz * sd * (w / 2 - 0.15), len + 0.3, 0.05, 0.05, 'rust', { ry, collide: false });
        }
        // a pier under every fourth length of it that stands in the water
        const bed = heightAt(cx, cz);
        // (not solid: it stands in the water under the deck, and a solid there is a wall across the deck to the dead)
        if ((i - a) % 4 === 2 && bed < WATER_LEVEL - 0.3) b.box(cx, bed - 0.3, cz, 0.9, top - 0.4 - bed + 0.3, w - 1.2, 'concrete', { ry, collide: false });
      }
      const m = (i0 + i1) >> 1;
      const [dx, dz] = [p[e * 2] - p[a * 2], p[e * 2 + 1] - p[a * 2 + 1]];
      bridges.push({ x: p[m * 2], y: road.hs[m], z: p[m * 2 + 1], ry: Math.atan2(-dz, dx), len: Math.hypot(dx, dz), w });
      clears.push([p[m * 2], p[m * 2 + 1], Math.hypot(dx, dz) / 2 + 3]);
    }
  }
  return bridges;
}

// afloat: mainland.js's; BUILD: what stands on a lot of the city (mainland/buildings.js)
export function buildVillage({ seed, plan, ground, kit, afloat, BUILD }) {
  const { facing, zoneById } = plan;
  const { heights, roadDist, heightAt, roadDistAt, inWater } = ground;
  const { staticGrid, Builder, door, win } = kit;
  // NORTH COAST VILLAGE: its church above the harbour, a pier out into the bay with a boat at it, the houses (above)
  const at = P([0.183, 0.128]);
  const zn = zoneById[ZONE.NORTH_COAST];
  const b = new Builder(at[0], at[1], facing(at, P([0.215, 0.150])), Math.max(zn.h, heightAt(at[0], at[1])));
  b.zone = ZONE.NORTH_COAST;
  const L = { x: at[0], z: at[1], w: 19.5, d: 19.5, ry: b.ry, what: 'church' };
  b.box(0, 0, 0, 22, PAVE, 22, 'concrete');
  BUILD.church(b, L, 'Church of the Sea');
  for (let j = Math.max(0, Math.floor((at[1] - 16 + HALF) / GRID_STEP)); j <= Math.min(N - 1, Math.ceil((at[1] + 16 + HALF) / GRID_STEP)); j++) {
    for (let i = Math.max(0, Math.floor((at[0] - 16 + HALF) / GRID_STEP)); i <= Math.min(N - 1, Math.ceil((at[0] + 16 + HALF) / GRID_STEP)); i++) {
      const d = Math.hypot(-HALF + i * GRID_STEP - at[0], -HALF + j * GRID_STEP - at[1]);
      if (roadDist[j * N + i] > 3) heights[j * N + i] = lerp(heights[j * N + i], b.y0, 1 - smoothstep(12, 16, d));
    }
  }
  const v = new Builder(zn.x, zn.z, 0, zn.h);
  v.zone = ZONE.NORTH_COAST;
  const pier = (a, c, w) => {
    const [ax, az] = P(a);
    const [cx, cz] = P(c);
    const len = Math.hypot(cx - ax, cz - az);
    const n = Math.max(1, Math.round(len / 5));
    const ry = Math.atan2(-(cz - az), cx - ax);
    const y = WATER_LEVEL + 1.3 - v.y0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      v.box(ax + (cx - ax) * t - v.ox, y - 0.22, az + (cz - az) * t - v.oz, len / n + 0.05, 0.22, w, 'dockwood', { ry, collide: true });
    }
    return y;
  };
  const y = pier([0.160, 0.166], [0.124, 0.166], 3.4);
  pier([0.152, 0.168], [0.152, 0.198], 2.6);
  const [bx, bz] = P([0.146, 0.19]);
  afloat(v.prop('boat', bx - v.ox, bz - v.oz, 0.1, { y: WATER_LEVEL - 0.15, nocollide: true }));
  const [cx2, cz2] = P([0.13, 0.166]);
  v.cont(CONT.CRATE, cx2 - v.ox, cz2 - v.oz, { prop: 'crate', ly: y, ry: 0.3 });
  v.loot(cx2 - v.ox + 2, cz2 - v.oz, y + 0.02);
  // THE HARBOUR at work when it stopped: boats tied up along the pier and its finger, on the planks the fish boxes,
  // pots, drums and pallets, nets hung to dry on their poles, and at the root of the pier on the shore the fish shed
  // with its slipway. (Dice of their own: nothing after them moves.)
  {
    const hd = (n) => hash2(n, 31, (seed ^ 0x4a7b) | 0);
    const at = (fx, fz) => { const [x, z] = P([fx, fz]); return [x - v.ox, z - v.oz]; };
    const boats = [[0.1555, 0.176, PI / 2], [0.1485, 0.184, -PI / 2 + 0.1], [0.1555, 0.194, PI / 2 + 0.06], [0.142, 0.1695, 0.04], [0.133, 0.1625, PI - 0.05], [0.128, 0.1695, 0.08]];
    boats.forEach(([fx, fz, ry], k) => {
      const [x, z] = at(fx, fz);
      if (!inWater(x + v.ox, z + v.oz)) return;
      afloat(v.prop('boat', x, z, ry + (hd(k) - 0.5) * 0.2, { y: WATER_LEVEL - 0.15, nocollide: true, seed: k % 2 }));
    });
    const laid = [];
    const deck = (fx, fz, type, ry, seedv = 0) => {
      const [x, z] = at(fx, fz);
      if (laid.some(([a, c]) => Math.hypot(a - x, c - z) < 2.2)) return; // (clear of what is already on the planks)
      laid.push([x, z]);
      v.prop(type, x, z, ry, { ly: y, nocollide: type === 'pallet', seed: seedv }); // (solid as they are anywhere: no hole on the planks)
    };
    for (let k = 0; k < 9; k++) {
      const fx = 0.126 + hd(10 + k) * 0.032;
      const side = hd(20 + k) < 0.5 ? -1 : 1;
      deck(fx, 0.166 + side * 0.0006, ['crate_small', 'barrel', 'crate_small', 'pallet', 'tire_pile'][k % 5], hd(30 + k) * 6, k & 1);
    }
    for (let k = 0; k < 4; k++) deck(0.152 + (hd(40 + k) - 0.5) * 0.0008, 0.172 + k * 0.006, k % 2 ? 'crate_small' : 'barrel', hd(50 + k) * 6, k & 1);
    // nets on their poles, over the planks by the pier's root
    {
      const [nx, nz] = at(0.1575, 0.1652);
      for (const dx of [-3, 0, 3]) v.cyl(nx + dx, y, nz, 0.06, 2.4, 'trim', { sides: 6, collide: false });
      v.box(nx, y + 2.3, nz, 6.2, 0.04, 0.04, 'rope', { collide: false });
      for (const dx of [-1.5, 1.5]) v.box(nx + dx, y + 1.25, nz, 2.9, 2.1, 0.03, 'canvas', { rz: (hd(60) - 0.5) * 0.1, collide: false });
    }
    // the fish shed on the shore where the pier starts, its door to it
    const [sx, sz] = P([0.1635, 0.1655]);
    const sh = heightAt(sx, sz);
    if (sh > WATER_LEVEL + 0.6 && roadDistAt(sx, sz) > 6 && !staticGrid.query(sx, sz, 6, []).some((c) => !(c.flags & COL.TREE)) && [[-4, -3], [4, -3], [4, 3], [-4, 3]].every(([dx, dz]) => Math.abs(heightAt(sx + dx, sz + dz) - sh) < 0.8)) {
      const fs = new Builder(sx, sz, PI / 2, sh);
      fs.zone = ZONE.NORTH_COAST;
      fs.box(0, -0.6, 0, 8.4, 0.6, 6.4, 'concrete');
      fs.room(0, 0, 8, 6, 3, 'planks', { n: [door(4, 1.6)], s: [win(2), win(6)] }, { roof: 'gable', roofH: 1.8, roofMat: 'tin_rust', floorMat: 'concrete' });
      fs.cont(CONT.CRATE, -2.6, 1.6, { prop: 'crate', ry: 0.2, seed: 1 });
      fs.prop('barrel', 3.2, 2, 0, { seed: 2 });
      fs.loot(1, 1);
    }
  }
}

// place, part: mainland.js's; extra: the city's kit's (mainland/citykit.js)
export function buildOutpost({ seed, rng, kit, place, part, extra }) {
  const { door, win } = kit;
  // NORTH RIDGE OUTPOST: the army's post on the far side of North Pass. Its radio tower, a water tower, the domes of
  // its radars, the huts and the comms room the flight radio is in, all behind wire.
  place(ZONE.OUTPOST, (b) => {
    const HX = 46;
    const HZ = 36;
    for (let x = -HX + 1.5; x < HX; x += 3) {
      if (Math.abs(x) > 6) b.prop('fence_chain', x, HZ, 0);
      if (rng.chance(0.88)) b.prop('fence_chain', x, -HZ, 0);
    }
    for (let z = -HZ + 1.5; z < HZ; z += 3) {
      if (rng.chance(0.9)) b.prop('fence_chain', -HX, z, PI / 2);
      if (Math.abs(z) > 6) b.prop('fence_chain', HX, z, PI / 2);
    }
    b.prop('boom_gate', -0.4, HZ, PI);
    for (const sx of [-1, 1]) b.prop('sandbags', sx * 7.6, HZ - 2.4, 0, { seed: sx + 1 });
    extra(b, 'watchtower', -HX + 4, HZ - 4, PI);
    extra(b, 'watchtower', HX - 4, -HZ + 4, 0, { seed: 1 });
    // the radio tower: a lattice of four legs drawn in to its head, 44 m up, red and white by turns
    {
      const T = 44;
      for (let k = 0; k < 11; k++) {
        const y0 = (k * T) / 11;
        const y1 = ((k + 1) * T) / 11;
        const w0 = lerp(7, 1.6, y0 / T);
        const w1 = lerp(7, 1.6, y1 / T);
        const mat = k % 2 ? 'metal' : 'rust';
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            b.box(-6 + sx * (w0 + w1) / 4, y0, -18 + sz * (w0 + w1) / 4, 0.3, y1 - y0 + 0.05, 0.3, mat, { collide: k === 0 });
          }
          b.box(-6 + (sx * w1) / 2, y1 - 0.1, -18, 0.12, 0.12, w1, mat, { collide: false });
          b.box(-6, y1 - 0.1, -18 + (sx * w1) / 2, w1, 0.12, 0.12, mat, { collide: false });
        }
      }
      b.box(-6, T, -18, 0.2, 7, 0.2, 'metal', { collide: false });
      b.box(-6, T + 2, -18, 3.6, 0.2, 0.2, 'metal', { collide: false });
    }
    extra(b, 'water_tower', 12, -22, 0.3);
    // the radar domes
    for (const [dx, dz, r] of [[-30, -10, 4.2], [30, -14, 3.4]]) {
      b.cyl(dx, 0, dz, r, 3.2, 'concrete', { sides: 16 });
      b.cone(dx, 3.2, dz, r + 0.1, r * 0.9, 'metal', 16, { ry: 0 });
    }
    // the comms room: the radio desk, the sets, the flight radio somewhere in it; a hut either side
    b.room(14, 6, 14, 9, 3.2, 'concrete', { n: [door(4, 1.3), win(10, 1.6)], e: [win(4.5)], w: [win(4.5)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    extra(b, 'office_desk', 14, 9.6, PI, { ly: 0.12 });
    b.prop('radio_set', 11.6, 9.9, PI, { ly: 0.12 });
    b.cont(CONT.LOCKER, 20.5, 8, { prop: 'locker', ry: -PI / 2, ly: 0.12 });
    b.cont(CONT.CABINET, 8.6, 9.8, { prop: 'cabinet', ry: PI, ly: 0.12 });
    part(b, 3, 16.6, 9.4, 0.14 + 0.76);
    part(b, 3, 8.4, 3.2, 0.14);
    b.prop('satellite_dish', 22.6, 0.6, 2.2);
    b.room(-14, 8, 12, 7, 3, 'olive', { n: [door(6, 1.2)], s: [win(6, 1.4)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'planks' });
    b.prop('field_cot', -17, 9.6, PI / 2, { ly: 0.12 });
    b.prop('field_cot', -11, 9.6, PI / 2, { ly: 0.12 });
    b.cont(CONT.AMMO_BOX, -14, 10.4, { prop: 'military_crate', ry: 0, ly: 0.12 });
    part(b, 3, -18.6, 6.2, 0.14);
    b.room(-14, 22, 12, 7, 3, 'olive', { n: [door(6, 1.2)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'planks' });
    b.cont(CONT.SHELF, -9.8, 24.6, { prop: 'shelf', ry: PI, ly: 0.12 });
    b.loot(-15, 21, 0.14);
    for (const [tx, tz, k] of [[24, 24, 0], [34, 24, 1]]) b.prop('military_tent', tx, tz, 0, { seed: k });
    b.wreck('army_truck', 34, 6, 0.4, { trunk: false });
    b.wreck('army_truck', -34, 18, PI - 0.2, { trunk: false, seed: 1 });
    b.cont(CONT.AMMO_BOX, 30, 12, { prop: 'military_crate', ry: 0.4 });
    b.prop('generator', 20, -4, 0.2);
    b.prop('fuel_tank', 30, -26, PI / 2);
    for (const [lx, lz] of [[0, 18], [-6, 26], [8, 30], [-24, 2]]) b.prop(['corpse', 'skeleton', 'body_bag', 'blood_pool'][(lx + 24) & 3], lx, lz, lx, { nocollide: true });
    b.loot(2, 10);
    b.loot(26, 18);
    b.loot(-26, -22);
    // the compound as the army kept it, read from the road: a concrete apron from the gate to the huts and the comms
    // room, a lamp over each door still lit off the generator, floodlights at the corners of the wire, the gate's
    // sandbagged post and barriers on the road in, its sign, wire along the inside of the front fence, a flagpole, the
    // stacks of crates on pallets (dice of their own: what else the seed deals stays put)
    {
      const od = (n) => hash2(n, 77, (seed ^ 0x0b57) | 0);
      for (const [px, pz, w, d] of [[0, 20, 8, 32], [6, 6, 34, 10], [-14, 15, 14, 22]]) b.box(px, -0.02, pz, w, 0.08, d, 'concrete', { collide: false });
      for (const [lx, lz] of [[18, 1.2], [-14, 4.2], [-14, 18.2]]) b.light(lx, 2.6, lz, 'lamp');
      for (const [lx, lz, ry] of [[-HX + 3, HZ - 3, PI * 0.75], [HX - 3, HZ - 3, -PI * 0.75], [-HX + 3, -HZ + 3, PI * 0.25], [HX - 3, -HZ + 3, -PI * 0.25]]) extra(b, 'floodlight_tower', lx, lz, ry);
      extra(b, 'sandbag_nest', 9, HZ - 4, 0);
      extra(b, 'checkpoint_sign', -8.5, HZ + 2.5, PI);
      for (const lx of [-5, 5]) extra(b, 'jersey_barrier', lx, HZ + 9, 0.3 * Math.sign(lx));
      for (let lx = -HX + 8; lx <= HX - 8; lx += 7) if (Math.abs(lx) > 9) extra(b, 'concertina', lx, HZ - 2.2, 0);
      b.cyl(4, 0, 12, 0.08, 9, 'metal', { sides: 6 });
      b.box(4.75, 7.2, 12, 1.4, 0.9, 0.02, 'canvas_mil', { collide: false });
      for (let k = 0; k < 4; k++) {
        const [lx, lz] = [26 + (k % 2) * 3.2, -6 - (k >> 1) * 3.4];
        if (extra(b, 'pallet', lx, lz, od(k) * 0.3)) extra(b, 'military_crate', lx, lz, od(k + 9) * 0.4, { ly: 0.15 });
      }
    }
    // (cleared inside the wire, and a few metres out from it: the woods stand round it)
    for (let lx = -HX + 6; lx <= HX - 6; lx += 12) for (let lz = -HZ + 6; lz <= HZ - 6; lz += 12) b.clear(lx, lz, 10);
    for (let lx = -HX; lx <= HX; lx += 8) for (const lz of [-HZ, HZ]) b.clear(lx, lz, 5);
    for (let lz = -HZ; lz <= HZ; lz += 8) for (const lx of [-HX, HX]) b.clear(lx, lz, 5);
    b.clear(0, HZ + 10, 9);
  });
}

export function buildLighthouse({ heightAt, kit, place }) {
  const { Builder } = kit;
  // THE LIGHTHOUSE, on its islet off the south-west coast: the tower, the lamp room's glass on top, a keeper's store
  place(ZONE.LIGHTHOUSE, (yard) => {
    // (on its islet's own ground, whatever is levelled round it: the tower's foot at the lowest of the ground it covers,
    // what stands by it on the ground)
    let foot = Infinity;
    for (let a = 0; a < 8; a++) foot = Math.min(foot, heightAt(yard.ox + Math.sin(a) * 2.8, yard.oz + Math.cos(a) * 2.8));
    const b = new Builder(yard.ox, yard.oz, yard.ry, foot);
    b.zone = ZONE.LIGHTHOUSE;
    b.ground = true;
    b.cyl(0, 0, 0, 2.8, 15, 'plaster', { sides: 16 });
    b.cyl(0, 15, 0, 3.4, 0.4, 'rust', { sides: 16, collide: false });
    b.cyl(0, 15.4, 0, 2.1, 2.6, 'glass', { sides: 12, collide: false });
    b.cone(0, 18, 0, 2.5, 2.2, 'rust', 12, { ry: 0 });
    b.light(0, 16.6, 0, 'embers');
    b.cont(CONT.CRATE, -1.2, -4.4, { prop: 'crate', ry: 0.2 });
    b.loot(1.6, -4.2);
    b.prop('barrel', -3.6, 1.8, 0);
  });
}

export function buildCamps({ rng, plan, ground, kit, place }) {
  const { cliffAt, camps } = plan;
  const { heightAt, roadDistAt } = ground;
  const { Builder } = kit;
  // SOUTH FOREST: three camps under the trees, each a tent or two round a fire, what their people left
  const camp = (b, k) => {
    b.prop('tent', 0, 2.2, rng.range(-0.3, 0.3), { seed: k });
    if (k !== 1) b.prop('tent', -4.2, 0.6, 0.9 + rng.range(-0.2, 0.2), { seed: k + 1 });
    b.prop('campfire', 0.5, -2.2, 0, { nocollide: true, seed: 1 });
    b.prop('log_bench', 3, -2.4, PI / 2 + 0.2);
    b.prop('log_bench', 0.4, -5.2, 0.1);
    if (k === 0) b.wreck('camper', 7.6, 3, 1.4, { zone: ZONE.SOUTH_FOREST });
    b.cont(CONT.DUFFEL, -2.4, -1.4, { prop: 'duffel_bag', ry: rng.range(0, 6), nocollide: true });
    b.cont(CONT.CRATE, 2.6, 3.8, { prop: 'crate_small', ry: 0.4, h: 0.62 });
    b.prop('picnic_table', -5.4, -4.6, 0.3);
    b.prop(k ? 'skeleton' : 'corpse', 1.8, -0.6, rng.range(0, 6), { nocollide: true });
    b.loot(1.6, -4.4);
    b.loot(-3, 3.6);
    b.light(0.5, 0.3, -2.2, 'embers');
    b.clear(0, 0, 8);
  };
  place(ZONE.SOUTH_FOREST, (b) => camp(b, 0));
  // ...and its other two, where the picture marks them (on the ground as it is: they are a clearing each, no more)
  camps.forEach(([x0, z0], k) => {
    // (beside the track that leads to it, not on it)
    let [x, z] = [x0, z0];
    for (let a = 0, best = roadDistAt(x0, z0); a < 8 && best < 9; a++) {
      const tx = x0 + Math.sin((a * PI) / 4) * 11;
      const tz = z0 + Math.cos((a * PI) / 4) * 11;
      if (roadDistAt(tx, tz) > best && cliffAt(tx, tz) < -10) [x, z, best] = [tx, tz, roadDistAt(tx, tz)];
    }
    const b = new Builder(x, z, rng.range(0, PI * 2), heightAt(x, z));
    b.zone = ZONE.SOUTH_FOREST;
    b.ground = true;
    camp(b, k + 1);
  });
}

export function buildBrokenBridge({ roads, kit }) {
  const { Builder } = kit;
  // East Pass's road ran on over the river to the Ridge: the bridge is gone, its first span ends over the water
  const r = roads.find((rd) => rd.name === 'north road');
  if (r) {
    const p = r.pts;
    const n = p.length / 2;
    const [ex, ez] = [p[n * 2 - 2], p[n * 2 - 1]];
    const dx = ex - p[n * 2 - 6];
    const dz = ez - p[n * 2 - 5];
    const dl = Math.hypot(dx, dz) || 1;
    const b = new Builder(ex, ez, Math.atan2(-dx / dl, -dz / dl), r.hs[n - 1]);
    b.zone = ZONE.FOREST;
    for (let k = 0; k < 3; k++) b.box(0, -0.45, -3 - k * 4, 8.4 - k * 0.4, 0.45, 4.05, 'concrete', { rz: k === 2 ? 0.08 : 0 });
    for (const sd of [-1, 1]) b.box(sd * 4, 0, -7, 0.25, 1.0, 10, 'rust', { collide: false, rz: sd * 0.05 });
    b.prop('jersey_barrier', 0, -1, PI / 2, { seed: 2 });
    b.prop('road_sign', 3.6, 1.6, 0, { seed: 1 });
  }
}

export function buildTruckStop({ kit, place }) {
  const { door, win } = kit;
  // MILE 9 TRUCK STOP: a canopy over the pumps, a diner, rigs that never left.
  place(ZONE.TRUCKSTOP, (b) => {
    b.box(0, -0.05, -4, 36, 0.1, 24, 'concrete', { collide: true });
    b.room(-4, 12, 14, 9, 3.6, 'brick', { n: [door(7, 1.6), win(2.6, 3, 0.9, 2.5), win(11.4, 3, 0.9, 2.5)], e: [win(4.5)], s: [door(2.4, 1.1)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.box(-6, 0.12, 10, 5, 1.0, 0.7, 'planks');
    b.loot(-6, 10, 1.14);
    b.cont(CONT.FRIDGE, 2.2, 15.5, { prop: 'fridge', ry: PI, ly: 0.12 });
    b.cont(CONT.SHELF, -8, 15.5, { prop: 'shelf', ry: PI, ly: 0.12 });
    b.cont(CONT.SHELF, -4, 15.5, { prop: 'shelf', ry: PI, ly: 0.12 });
    b.prop('table', 0.5, 10.5, 0, { ly: 0.12 });
    for (const [px, pz] of [[-6, -2], [6, -2], [-6, -10], [6, -10]]) b.cyl(px, 0, pz, 0.2, 5, 'metal');
    b.box(0, 5, -6, 15, 0.55, 11, 'metal', { collide: false });
    b.roofSpan(0, -6, 7.5, 5.5, 5, 0.55);
    b.prop('gas_pump', -2, -6, 0);
    b.prop('gas_pump', 2, -6, 0);
    b.wreck('semi_truck', 22, 9, 0.05, { trunk: false });
    b.prop('litter', 4, 0, 1, { nocollide: true });
    b.prop('suitcases', -9, 2, 0.3, { nocollide: true });
    b.wreck('pickup_truck', -14, -8, 1.3);
    b.wreck('car_wreck', 12, -12, 2.4);
    b.cont(CONT.DUMPSTER, -14, 14, { prop: 'dumpster', ry: PI / 2 });
    b.prop('motel_sign', -17, -20, 0.2);
    b.prop('streetlight', 14, -19, PI);
    b.prop('barrel', 9, 4, 0);
    b.prop('corpse', 3, -2, 0.9, { nocollide: true });
    b.loot(-12, 4);
    b.loot(10, 2);
  });
}
