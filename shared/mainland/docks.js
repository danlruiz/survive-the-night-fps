// The Industrial Docks (mainland.js), where the bridge from the island comes ashore: the ironworks behind the quays,
// the warehouses, the container stacks and cranes, the ships moored at the piers.
import { WATER_LEVEL } from '../constants.js';
import { ZONE, CONT } from '../defs.js';
import { hash2 } from '../rng.js';
import { FLOOR_Y, QUAY_LX, QUAY_HZ, P } from './consts.js';

const PI = Math.PI;

// place, hole, smoke, afloat: mainland.js's; ck: the city's kit (mainland/citykit.js: the ships go in its list)
export function buildDocks({ seed, zoneById, kit, place, hole, smoke, afloat, ck }) {
  const { door, win, gap } = kit;
  const { ships, hide, fits } = ck;
  // INDUSTRIAL DOCKS -----------------------------------------------------------------------------------------------
  // The ironworks' yard behind the quays (its casting shed is the factory the picture marks), warehouses along the
  // waterfront, container stacks and cranes on the quay, and the piers out into the sea.
  place(ZONE.INDUSTRIAL, (q) => {
    const b = q.sub(14, -12, 0); // (the ironworks, east of the warehouses)
    const FX = 44;
    const FZ = 40;
    for (let x = -FX + 1.5; x < FX; x += 3) {
      if (Math.abs(x) > 5) b.prop('fence_chain', x, -FZ, 0);
      b.prop('fence_chain', x, FZ, 0);
    }
    for (let z = -FZ + 1.5; z < FZ; z += 3) {
      if (Math.abs(z) > 5) b.prop('fence_chain', -FX, z, PI / 2);
      b.prop('fence_chain', FX, z, PI / 2);
    }
    b.prop('boom_gate', -0.4, -FZ, 0);
    // the casting shed: one long hall, open at both ends
    b.room(-18, 6, 22, 38, 8, 'tin_rust', { n: [gap(11, 7, 5.5)], s: [gap(11, 7, 5.5)], e: [door(12, 1.4), door(28, 1.4)] }, { roof: 'gable', roofH: 3.4, roofMat: 'tin', floorMat: 'concrete' });
    for (const lz of [-6, 6, 18]) b.box(-24.5, 0.12, lz, 5, 2.6, 5, 'rust'); // furnaces along the west wall
    b.box(-13, 0.12, 0, 3.4, 1.1, 8, 'metal'); // the casting bed
    b.cont(CONT.TOOLBOX, -11, 8, { prop: 'toolbox', ry: 0.4, nocollide: true, ly: 0.12 });
    b.cont(CONT.CRATE, -11.5, 14, { prop: 'crate', ry: 0.2, ly: 0.12 });
    b.cont(CONT.LOCKER, -8, 23.2, { prop: 'locker', ry: PI, ly: 0.12 });
    b.loot(-14, -8, 0.14);
    b.loot(-18, 20, 0.14);
    b.loot(-22.5, 22, 0.14);
    // the machine shop
    b.room(20, -18, 20, 14, 4.6, 'brick', { w: [door(7, 1.4)], n: [gap(10, 4.6, 3.6), win(16.5, 1.6)], e: [win(7, 1.6)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.box(22, 0.12, -13.2, 9, 0.95, 1.1, 'planks'); // the benches
    b.box(27.6, 0.12, -19, 1.1, 0.95, 6, 'planks');
    b.loot(22, -13.2, 1.09);
    b.cont(CONT.SHELF, 13.6, -12.4, { prop: 'shelf', ry: PI, ly: 0.12 });
    b.cont(CONT.TOOLBOX, 26, -22.5, { prop: 'toolbox', ry: 1.1, nocollide: true, ly: 0.12 });
    b.cont(CONT.LOCKER, 29.3, -23.6, { prop: 'locker', ry: -PI / 2, ly: 0.12 });
    // the yard: stacks of billets, a gantry over them, what the last shift left standing
    for (const [sx, sz, h] of [[14, 10, 1.6], [14, 16, 2.4], [22, 10, 0.8], [22, 16, 1.6], [30, 13, 2.4]]) b.box(sx, 0, sz, 6, h, 2.2, 'rust');
    for (const gx of [9, 35]) for (const gz of [6, 20]) b.box(gx, 0, gz, 0.5, 8, 0.5, 'rust');
    for (const gz of [6, 20]) b.box(22, 8, gz, 26.5, 0.6, 0.6, 'rust', { collide: false });
    b.box(22, 7.2, 13, 1.6, 1.2, 14.6, 'metal', { collide: false });
    b.wreck('dump_truck', 6, -26, 1.2, { trunk: false });
    b.wreck('pickup_truck', -4, -30, 0.3);
    b.prop('fuel_tank', 36, 30, 0);
    b.prop('generator', 8, 30, 0.3);
    b.cont(CONT.DUMPSTER, 30, -30, { prop: 'dumpster', ry: PI });
    b.cont(CONT.CRATE, 2, 26, { prop: 'crate', ry: 0.4 });
    b.prop('barrel', 3.6, 28, 0);
    b.light(3.6, 1.0, 28, 'embers');
    b.prop('streetlight', -6, -36, PI);
    b.prop('corpse', 2, -12, 0.7, { nocollide: true });
    b.loot(10, -30);
    b.loot(30, 26);
    // the stack, cold; containers of what was to be shipped; what the years added
    b.cyl(-36, 0, -22, 1.6, 24, 'brick', { sides: 12 });
    b.cyl(-36, 24, -22, 1.75, 0.6, 'charred', { sides: 12, collide: false });
    b.prop('shipping_container', -36, 6, 0.04, { seed: 1 });
    b.prop('shipping_container', -36, 13, -0.03, { seed: 2 });
    b.prop('shipping_container', -36, 13, 0.02, { seed: 0, ly: 2.6 });
    b.cont(CONT.FREIGHT, -32.6, 20, { prop: 'crate', ry: 0.3 });
    b.prop('ivy', -6.96, 12, -PI / 2, { nocollide: true });
    b.prop('ivy', 9.96, -18, PI / 2, { nocollide: true, seed: 1 });
    b.prop('debris', 0, 0, 1, { nocollide: true });
    b.prop('litter', 12, -32, 2, { nocollide: true });
    smoke(b, -18, 9, 6);
    // the warehouses on the waterfront, their doors to the quay (west)
    for (const [lz, k] of [[-62, 0], [24, 1]]) {
      const s = q.sub(-58, lz, PI / 2);
      s.room(0, 0, 34, 16, 7, k === 1 ? 'tin_rust' : 'tin', { n: [gap(17, 8, 5.5)], s: [door(8, 1.4), door(26, 1.4)], e: [win(8, 2)], w: [win(8, 2)] }, { roof: 'gable', roofH: 3, roofMat: 'tin', floorMat: 'concrete' });
      for (const [px, pz, r] of [[-11, 3, 0.1], [-6, -2, 0.4], [9, 4, 1.3], [12, -3, 0.2]]) s.prop('pallet', px, pz, r, { ly: FLOOR_Y, seed: (px + k) & 1 });
      s.cont(CONT.FREIGHT, -13, 5.6, { prop: 'crate', ry: 0.2, ly: FLOOR_Y, seed: k });
      s.cont(CONT.CRATE, 6, 5.4, { prop: 'crate', ry: -0.3, ly: FLOOR_Y, seed: k + 1 });
      s.cont(CONT.SHELF, 15.8, 0, { prop: 'shelf', ry: -PI / 2, ly: FLOOR_Y, seed: k });
      s.prop('shipping_container', -3, 2.4, PI / 2 + 0.05, { ly: FLOOR_Y, seed: k });
      s.loot(2, -4, FLOOR_Y + 0.02);
      s.loot(-9, 1, FLOOR_Y + 0.02);
    }
    // containers stacked on the quay between them, two high in places
    for (const [lx, lz, r, two] of [[-62, -24, 0.02, true], [-62, -16, -0.03, false], [-62, 58, 0.01, true], [-30, 60, PI / 2, false], [-30, 70, PI / 2 + 0.04, true]]) {
      if (!fits(q, 'shipping_container', lx, lz, r)) continue;
      q.prop('shipping_container', lx, lz, r, { seed: (lz & 3) });
      if (two) q.prop('shipping_container', lx, lz, r + 0.02, { seed: (lz + 1) & 3, ly: 2.6 });
    }
    q.cont(CONT.FREIGHT, -58, -4, { prop: 'crate', ry: 0.3 });
    // THE WATERFRONT. The quay: its wall down into the dredged water along the whole front, a kerb of stone on it,
    // bollards every few metres (not at a pier's root)
    const QX = QUAY_LX;
    const QH = zoneById[ZONE.INDUSTRIAL].h - WATER_LEVEL + 7.5; // (the wall's face, from its foot on the bed to the top)
    const QZ0 = -QUAY_HZ + 2, QZ1 = QUAY_HZ - 2;
    for (let lz = QZ0; lz <= QZ1; lz += 24) q.clear(QX + 40, lz, 42); // (the apron: nothing grows on it)
    for (let z0 = QZ0; z0 < QZ1; z0 += 32) {
      const len = Math.min(32, QZ1 - z0);
      q.box(QX + 0.6, -QH, z0 + len / 2, 1.2, QH + 0.18, len, 'concrete');
    }
    // the piers, as the picture draws them: a long pier out west from the quay at its north end and one at its south
    // end, each with two fingers off it to the south; decks of planks on piles, a T across the end of each
    const PIERS = [
      { z: P([0, 0.503])[1] - q.oz + 3, len: 80, fingers: [[QX - 34, 58], [QX - 68, 64]] },
      { z: P([0, 0.587])[1] - q.oz, len: 62, fingers: [[QX - 28, 66], [QX - 54, 60]] },
    ];
    const plank = (x0, z0, x1, z1, w) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 6));
      const ry = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const [lx, lz] = [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
        q.box(lx, -0.24, lz, len / n + 0.05, 0.24, w, 'dockwood', { ry });
        for (const sd of [-1, 1]) q.cyl(lx - Math.sin(ry) * sd * (w / 2 - 0.3), -QH, lz - Math.cos(ry) * sd * (w / 2 - 0.3), 0.2, QH - 0.24, 'dockwood', { collide: false });
      }
    };
    for (const pr of PIERS) {
      plank(QX, pr.z, QX - pr.len, pr.z, 7);
      plank(QX - pr.len - 3.5, pr.z - 8, QX - pr.len - 3.5, pr.z + 8, 7); // the T
      for (const [fx, flen] of pr.fingers) plank(fx, pr.z + 3.5, fx, pr.z + 3.5 + flen, 4.5);
      for (let d = 10; d < pr.len; d += 14) for (const sd of [-1, 1]) q.prop('dock_post', QX - d, pr.z + sd * 3.2, 0, { ly: 0 });
      // a boat tied up at its end, another at a finger
      afloat(q.prop('boat', QX - pr.len + 6, pr.z - 6.5, PI / 2 + 0.1, { y: WATER_LEVEL - 0.15, nocollide: true, seed: (pr.len & 1) }));
      afloat(q.prop('boat', pr.fingers[0][0] - 4.6, pr.z + 30, 0.05, { y: WATER_LEVEL - 0.15, nocollide: true, seed: 2 }));
    }
    for (let lz = QZ0 + 6; lz < QZ1; lz += 13) if (PIERS.every((pr) => Math.abs(lz - pr.z) > 7) && [-98, -40, 22, 84].every((c) => Math.abs(lz - c) > 10)) q.prop('dock_post', QX + 1.6, lz, 0); // (not under a crane's legs)
    // the quay's face: rubber fenders hung down it every 8 m (where no pier comes off it), a line painted along its
    // edge, an iron bollard between each two posts
    for (let lz = QZ0 + 3; lz < QZ1; lz += 8) {
      if (PIERS.some((pr) => Math.abs(lz - pr.z) < 6)) continue;
      q.box(QX - 0.2, -2.6, lz, 0.5, 2.7, 1.1, 'tire', { collide: false });
      q.cyl(QX - 0.25, -0.35, lz, 0.32, 0.4, 'tire', { rx: PI / 2, sides: 10 });
    }
    q.box(QX + 1.75, 0.004, 0, 0.18, 0.02, QZ1 - QZ0, 'roadpaint', { collide: false });
    for (let lz = QZ0 + 12.5; lz < QZ1; lz += 13) {
      if (PIERS.some((pr) => Math.abs(lz - pr.z) < 7) || [-98, -40, 22, 84].some((c) => Math.abs(lz - c) < 10)) continue;
      q.cyl(QX + 1.2, 0, lz, 0.22, 0.55, 'iron', { sides: 10 });
      q.cyl(QX + 1.2, 0.55, lz, 0.32, 0.12, 'iron', { sides: 10, collide: false });
    }
    // A 40 ft box: two of the kit's 20 ft containers end to end along z (12.1 m), one colour (a stack of them, n high)
    const box40 = (b, lx, lz, ly, seed, ry = 0) => {
      const [dx, dz] = [Math.sin(ry) * 3.04, Math.cos(ry) * 3.04];
      for (const sd of [-1, 1]) b.prop('shipping_container', lx + dx * sd, lz + dz * sd, ry, { ly, seed: seed & 3 });
    };
    // THE SHIP-TO-SHORE CRANES on their rails along the quay's edge: four legs 30 m high astride the rails, the portal
    // ties, the boom - 45 m out over the water and 18 m back over the apron - its trolley and the cab under it, the
    // spreader hanging on its cables, the machinery house over the legs, the apex and its stays
    const RAIL = [QX + 2.4, QX + 18.4];
    for (const rx of RAIL) q.box(rx, 0, 0, 0.18, 0.16, QZ1 - QZ0, 'metal', { collide: false });
    const CRANES = [-98, -40, 22, 84];
    // a member of a frame from one point to another of q's frame, w thick (drawn: what a body reaches is boxed apart)
    const strut = (x0, y0, z0, x1, y1, z1, w = 0.45) => {
      const [dx, dy, dz] = [x1 - x0, y1 - y0, z1 - z0];
      const L = Math.hypot(dx, dy, dz);
      q.box((x0 + x1) / 2, (y0 + y1) / 2 - w / 2, (z0 + z1) / 2, L, w, w, 'rust', { ry: Math.atan2(-dz, dx), rz: Math.asin(dy / L), collide: false });
    };
    for (const lz of CRANES) {
      const [x0, x1] = RAIL;
      for (const lx of [x0, x1]) for (const sz of [-1, 1]) q.box(lx, 0, lz + sz * 7.5, 1.3, 30, 1.3, 'rust');
      for (const lx of [x0, x1]) q.box(lx, 0, lz, 1.6, 1.4, 16.4, 'rust'); // (the sill beams, the wheels' bogies on the rails)
      for (const sz of [-1, 1]) for (const y of [12, 29]) q.box((x0 + x1) / 2, y, lz + sz * 7.5, x1 - x0, 1, 1, 'rust', { collide: false });
      // the legs braced: crosses in each frame over head height, a diagonal in each portal
      for (const lx of [x0, x1]) for (const [ya, yb] of [[7, 18], [18, 29]]) {
        strut(lx, ya, lz - 7.2, lx, yb, lz + 7.2, 0.5);
        strut(lx, ya, lz + 7.2, lx, yb, lz - 7.2, 0.5);
      }
      for (const sz of [-1, 1]) strut(x0 + 0.6, 12.5, lz + sz * 7.5, x1 - 0.6, 29, lz + sz * 7.5, 0.5);
      // the boom: two trusses - a top chord and a bottom one, the web between them zigzag every 3.5 m - and its walkway
      const [bx0, bx1] = [QX - 45, QX + 18];
      for (const sz of [-1, 1]) {
        const bz = lz + sz * 1.9;
        q.box((bx0 + bx1) / 2, 32.6, bz, bx1 - bx0, 0.55, 0.7, 'rust', { collide: false });
        q.box((bx0 + bx1) / 2, 31.0, bz, bx1 - bx0, 0.55, 0.7, 'rust', { collide: false });
        for (let x = bx0, k = 0; x < bx1 - 0.5; x += 3.5, k++) {
          strut(x, k % 2 ? 31.3 : 32.9, bz, Math.min(bx1, x + 3.5), k % 2 ? 32.9 : 31.3, bz, 0.3);
          q.box(x, 31.3, bz, 0.3, 1.6, 0.3, 'rust', { collide: false });
        }
      }
      for (const d of [0, 1]) q.box(QX - 13.5, 33.2 + d * 0.1, lz, 63, 0.3, 4.6, 'rust', { collide: false }); // (its walkway)
      // the apex: an A-frame over the landside legs, its stays out to the boom's tip and back to its tail
      for (const sz of [-1, 1]) {
        strut(x0 + 3, 33.4, lz + sz * 1.9, x0 + 8, 42.5, lz + sz * 0.5, 0.7);
        strut(x0 + 13, 33.4, lz + sz * 1.9, x0 + 8, 42.5, lz + sz * 0.5, 0.7);
        strut(x0 + 8, 42.3, lz + sz * 0.5, bx0 + 1, 33.4, lz + sz * 1.9, 0.14);
        strut(x0 + 8, 42.3, lz + sz * 0.5, bx1 - 1, 33.4, lz + sz * 1.9, 0.14);
      }
      // the machinery house on the boom's tail: clad in ribbed sheet, a roof that overhangs, louvres down its sides, a
      // door and its landing, the hoist drums' housing on its roof
      {
        const mx = x1 + 6;
        q.box(mx, 31, lz, 9, 4.6, 8.4, 'tin_rust', { collide: false });
        q.box(mx, 35.6, lz, 9.6, 0.3, 9.0, 'rust', { collide: false });
        for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) q.box(mx - 3 + k * 2, 33.6, lz + sz * 4.22, 1.2, 0.8, 0.06, 'dark', { collide: false });
        for (let k = 0; k < 5; k++) q.box(mx - 3.6 + k * 1.8, 31, lz + 4.23, 0.12, 4.6, 0.05, 'rust', { collide: false });
        q.box(mx - 4.52, 31, lz + 2, 0.05, 2.1, 0.9, 'dark', { collide: false });
        q.box(mx - 5.2, 30.9, lz + 2, 1.4, 0.1, 1.6, 'metal', { collide: false });
        q.box(mx + 0.6, 35.9, lz, 4.2, 1.6, 3.4, 'rust', { collide: false });
      }
      // the trolley where it stopped over the ship's hold: its frame on four wheels on the boom's rails, the sheaves
      // over it, and the operator's cab hung under it, glazed round and under
      const tx = QX - 14;
      q.box(tx, 30.0, lz, 4.2, 0.8, 4.6, 'rust', { collide: false });
      for (const sx of [-1.6, 1.6]) for (const sz of [-1.9, 1.9]) q.cyl(tx + sx, 30.55, lz + sz, 0.38, 0.3, 'dark', { rx: PI / 2, sides: 10 });
      for (const sx of [-0.9, 0.9]) q.cyl(tx + sx, 30.9, lz, 0.6, 1.2, 'metal', { rx: PI / 2, sides: 12 });
      q.box(tx + 1, 26.8, lz + 2.4, 3.0, 2.8, 3.0, 'tin', { collide: false }); // the cab
      q.box(tx + 1, 27.6, lz + 0.88, 2.9, 1.2, 0.05, 'dark', { collide: false });
      q.box(tx - 0.52, 27.6, lz + 2.4, 0.05, 1.2, 2.8, 'dark', { collide: false });
      q.box(tx + 1, 26.75, lz + 2.4, 2.6, 0.05, 2.6, 'dark', { collide: false });
      q.box(tx + 1, 29.6, lz + 2.4, 0.4, 0.5, 0.4, 'rust', { collide: false });
      for (const sz of [-1, 1]) q.box(tx, 16, lz + sz * 1.6, 0.08, 14, 0.08, 'metal');
      q.box(tx, 15.4, lz, 2.6, 0.7, 12.2, 'rust'); // the spreader
    }
    // THE FREIGHTER, moored tight against the quay under the cranes: a hull 120 m long whose side stands over the quay,
    // its holds stacked with containers in bays, the house and the bridge at the stern, the funnel, a mast forward,
    // lines to the bollards
    {
      const SW = 20, SL = 120, SX = QX - SW / 2 - 0.9, SZ = -26; // (its stern clear of the south pier)
      const deckY = WATER_LEVEL + 7.4 - zoneById[ZONE.INDUSTRIAL].h; // (its main deck, in the quay's frame)
      // (what is solid of it is these boxes, hidden: what is seen is the ship's own model over them - world.ships,
      // client/render/ships.js - its hull lofted, the bow raked, the house with its windows)
      q.box(SX, deckY - 12, SZ, SW, 12, SL, 'rust'); // the hull
      hide();
      q.box(SX, deckY - 12, SZ, SW + 0.2, 2.4, SL + 0.2, 'dark'); // (the boot-topping at the waterline)
      hide();
      // (the bow: the boxes under the forecastle, below - turned boxes stood out past the drawn stem)
      q.box(SX, deckY, SZ, SW - 0.6, 0.15, SL - 0.6, 'dark', { collide: false });
      for (const sd of [-1, 1]) {
        q.box(SX + sd * (SW / 2 - 0.15), deckY, SZ, 0.3, 1.2, SL, 'rust'); // (the bulwarks)
        hide();
      }
      // (the house, a tall narrow block at the stern; the bridge on it; the forecastle raised over the bow; the mast on it)
      q.box(SX, deckY, SZ + 50.5, 14, 14, 11, 'tin', { collide: true });
      hide();
      q.box(SX, deckY + 14, SZ + 48.25, 12, 3, 6.5, 'tin_rust'); // the bridge
      hide();
      q.box(SX, deckY, SZ - 55, 17, 3, 18, 'rust'); // the forecastle
      hide();
      for (const [bz, bw, bd] of [[-66, 12, 4], [-70, 7, 4], [-73, 3.6, 3]]) {
        q.box(SX, deckY - 9, SZ + bz, bw, 12, bd, 'rust'); // (its bow, narrowing to the stem)
        hide();
      }
      q.box(SX, deckY + 3, SZ - 52, 0.5, 12, 0.5, 'rust'); // the mast
      hide();
      ships.push({ type: 'freighter_hull', x: q.wx(SX, SZ), y: q.y0 + deckY - 12, z: q.wz(SX, SZ), ry: q.ry });
      // the holds' bays between the forecastle and the house: each a hatch coaming standing over the deck, the boxes
      // stacked on its covers
      for (let bay = 0; bay < 6; bay++) {
        const bz = SZ - SL / 2 + 22 + bay * 13.2;
        q.box(SX, deckY, bz, 18.6, 1.35, 12.6, 'rust');
        for (const cx of [-7.5, -5, -2.5, 0, 2.5, 5, 7.5]) {
          const n = 1 + ((bay * 5 + Math.round(cx) * 3 + 7) % 3);
          for (let h = 0; h < n; h++) box40(q, SX + cx, bz, deckY + 1.35 + h * 2.6, bay + h + Math.round(cx));
        }
      }
      for (const lz of [SZ - SL / 2 + 8, SZ + SL / 2 - 8]) q.box(QX - 0.4, 0.4, lz, 1.4, 0.05, 0.05, 'metal', { collide: false }); // (its lines)
    }
    // the harbour master's office at the root of the north pier
    {
      const o = q.sub(QX + 16, PIERS[0].z + 12, 0);
      o.room(0, 0, 8, 6, 3.2, 'brick', { s: [door(4, 1.2)], e: [hole(3, 1.4)], w: [hole(3, 1.4)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' }); // (its windows long since broken out)
      o.cont(CONT.CABINET, 2.6, -1.8, { prop: 'cabinet', ry: 0, ly: FLOOR_Y });
      o.loot(-2, 0, FLOOR_Y + 0.02);
    }
    // THE CONTAINER YARD on the apron behind the cranes: blocks of 40 ft boxes, rows of them three wide, stacked two to
    // five high, aisles between the blocks for the straddle carriers and a lane through to the ship
    for (const bx of [QX + 30, QX + 46, QX + 62]) {
      for (let lz = -116; lz <= 112; lz += 13.2) {
        if (lz > -34 && lz < -8) continue; // (the lane through to the ship)
        for (let r = 0; r < 3; r++) {
          const lx = bx + r * 2.6;
          if (!fits(q, 'shipping_container', lx, lz - 3.04, 0) || !fits(q, 'shipping_container', lx, lz + 3.04, 0)) continue;
          const n = 2 + ((Math.round(lz) * 7 + r * 5 + Math.round(bx)) % 4);
          for (let h = 0; h < n; h++) box40(q, lx, lz, h * 2.6, Math.round(lz) + r + h);
        }
      }
    }
    // the warehouses along the back of the apron (two more, the length of the quay), their doors on it
    for (const [lz, k] of [[82, 3]]) {
      const w = q.sub(-58, lz, PI / 2);
      w.room(0, 0, 34, 16, 7, 'tin_rust', { n: [gap(17, 8, 5.5)], s: [door(8, 1.4), door(26, 1.4)] }, { roof: 'gable', roofH: 3, roofMat: 'tin', floorMat: 'concrete' }); // (no glass: a shed's)
      w.cont(CONT.FREIGHT, -12, 5, { prop: 'crate', ry: 0.2, ly: FLOOR_Y, seed: k });
      w.loot(4, -3, FLOOR_Y + 0.02);
    }
    // what was left on it: pallets and their loads, drums, tyres, the trucks that stopped where they were, a burnt-out
    // one, the light masts
    const clutter = (type, lx, lz, ry, o = {}) => fits(q, type, lx, lz, ry) && q.prop(type, lx, lz, ry, { seed: 0, ...o });
    // (from dice of their own, not the world's stream: what the docks leave lying about deals nothing else anew)
    const dd = (n, k) => hash2(n, k, (seed ^ 0x2d0c5) | 0);
    for (let n = 0; n < 26; n++) {
      const lx = QX + 22 + dd(n, 1) * 48, lz = -120 + dd(n, 2) * 240; // (short of the rail spur)
      const t = dd(n, 3);
      if (t < 0.35) { if (clutter('pallet', lx, lz, dd(n, 4) * PI, { seed: n & 1 }) && dd(n, 5) < 0.6) q.prop('crate', lx, lz, dd(n, 6) * PI, { ly: 0.12, seed: n & 1 }); }
      else if (t < 0.6) for (let d = 0; d < 4; d++) clutter('barrel', lx + (d % 2) * 0.8, lz + (d >> 1) * 0.8, dd(n, 7 + d) * 6, { seed: d & 1 });
      else if (t < 0.75) clutter('tire_pile', lx, lz, dd(n, 4) * PI, { seed: 0 });
      else clutter('crate_small', lx, lz, dd(n, 4) * PI, { seed: 0 });
    }
    for (const [type, lx, lz, ry] of [['box_truck', QX + 52, -24, PI + 0.1], ['dump_truck', QX + 52, 66, 1.4]]) if (fits(q, type, lx, lz, ry)) q.wreck(type, lx, lz, ry, { trunk: false, seed: 1 });
    for (const lz of [-120, -60, 0, 60, 120]) q.box(QX + 24, 0, lz + 6, 0.5, 16, 0.5, 'rust'), q.box(QX + 24, 16, lz + 6, 1.6, 0.8, 3.2, 'metal', { collide: false }); // (the light masts)
    // the rail spur at the back of the yard: its rails and the flat wagons on it, loaded
    for (const rx of [QX + 76.6, QX + 78.0]) q.box(rx, 0, 0, 0.12, 0.14, 220, 'metal', { collide: false });
    for (const wz of [-60, -44, -28, 40, 56]) {
      q.box(QX + 77.3, 0.2, wz, 2.8, 1.0, 13.4, 'rust');
      if (wz % 3 !== 0) box40(q, QX + 77.3, wz, 1.2, wz);
    }
  });
}
