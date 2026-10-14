// Port Calder's buildings (mainland.js): BUILD, what stands on a lot of the city by what was dealt to it - shops and
// terraces, flats, office towers, the police station, the hospital, the town hall, the church, the cinema, the car
// parks, the depot, the subway's station, ruins and burnt-out shells - and the pieces they share: what lies along a
// lot's front and in its yard, the mess inside, a flat, a shop's room and what it sold (FILL, SHOP).
import { CONT } from '../defs.js';
import { PAVE, FLOOR_Y, SETBACK, HALL_UP, CARPARK_DECK } from './consts.js';

const PI = Math.PI;

// ck: the city's kit (mainland/citykit.js); part: a hiding place of one of the plane's parts; hole, cw: a window
// with the glass gone, a city window; weed: a clump of weeds; landmarks: what the field map names; nextTower: how
// many big towers have a name so far (counting this one); smoke, fire: so many to the map (all mainland.js)
export function cityBuildings({ rng, kit, part, hole, cw, weed, landmarks, nextTower, smoke, fire, ck }) {
  const { propBlocked, door, win, gap } = kit;
  const { frame, WALL, backZ, leftX, rightX, inside, cont, heaps, pancakes, solid, block, groundRoom, partition, zone, lino, atPartition, drumFire, jagged, heap, signAt, fits, extra, ivyOn, skirt, stairBlock, streetPile } = ck;
  // what lies along the front of a lot, on the pavement: rubbish, what fell off the building, weeds at the wall's foot
  const frontage = (b, L, F, shop = false) => {
    const z = -L.d / 2 + 0.55;
    for (let k = rng.int(2, 4); k > 0; k--) {
      const r = rng();
      const x = rng.range(-L.w / 2 + 2, L.w / 2 - 2);
      b.prop(r < 0.4 ? 'litter' : r < 0.6 ? 'debris' : r < 0.72 ? 'suitcases' : r < 0.82 ? 'glass_shards' : r < 0.9 ? 'paper_scatter' : 'shopping_cart', x, z + rng.range(-0.2, 0.5), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: (r * 97) | 0 });
    }
    for (let k = rng.int(2, 5); k > 0; k--) weed(b, rng.range(-L.w / 2 + 0.6, L.w / 2 - 0.6), z + rng.range(-0.3, 0.4), rng.range(0.5, 0.9));
    const sign = rng.chance(0.3);
    const sx = rng.range(-3, 3);
    if (shop && sign) b.prop('fallen_sign', sx, z + 0.1, rng.range(-0.3, 0.3), { nocollide: true, ly: PAVE });
    if (shop && F) {
      // (a window boarded up, as often as not)
      const board = rng.chance(0.5);
      const side = rng.chance(0.5) ? 0.3 : -0.3;
      for (let k = 0; k < 4; k++) {
        const tilt = rng.range(-0.12, 0.12);
        if (board) b.box(F.w * side, 0.9 + k * 0.5, F.front - 0.17, Math.min(3.4, F.w * 0.24), 0.2, 0.04, 'planks', { rz: tilt, collide: false });
      }
    }
    if (shop && F && rng.chance(0.6)) b.prop('awning', F.w * (rng.chance(0.5) ? 0.2 : -0.2), F.front - 0.14, 0, { nocollide: true, ly: 2.75, seed: rng.int(0, 1) });
    if (F && rng.chance(0.3)) b.prop('skeleton', rng.range(-L.w / 2 + 2, L.w / 2 - 2), F.front - 0.75, PI, { nocollide: true, ly: PAVE, seed: 1 }); // (sat down against the wall, and stayed)
  };

  // what is behind a building: bins, a pallet, rubbish, and what has come up through the paving
  const yard = (b, F, L) => {
    if (rng.chance(0.6)) b.cont(CONT.DUMPSTER, F.L + 2.2, F.back + 1.6, { prop: 'dumpster', ry: PI, ly: PAVE });
    if (rng.chance(0.5)) b.prop('pallet', F.L + 5.2, F.back + 1.4, rng.range(0, 3), { ly: PAVE });
    const deep = L.d / 2 - F.back;
    if (deep > 4.5 && rng.chance(0.75)) b.tree(rng.range(-L.w / 2 + 2.5, L.w / 2 - 2.5), L.d / 2 - 2.2, [3, 4, 5, 5][rng.int(0, 3)], rng.range(0.6, 1.15));
    if (rng.chance(0.3)) b.prop(rng.chance(0.5) ? 'corpse' : 'skeleton', rng.range(-3, 3), F.back + 3.2, rng.range(0, 6), { nocollide: true, ly: PAVE, seed: rng.int(0, 2) });
    for (let k = rng.int(2, 3); k > 0; k--) b.prop(['litter', 'debris', 'glass_shards', 'bicycle', 'paper_scatter'][rng.int(0, 4)], rng.range(-L.w / 2 + 2, L.w / 2 - 2), F.back + rng.range(1.5, Math.max(1.6, deep - 1.5)), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: rng.int(0, 2) });
    extra(b, 'trash_bin', F.R - 1.2, F.back + 1.1, 0, { ly: PAVE });
    for (let k = rng.int(4, 8); k > 0; k--) weed(b, rng.range(-L.w / 2 + 0.5, L.w / 2 - 0.5), rng.range(F.back + 0.6, L.d / 2 - 0.4), rng.range(0.6, 1.3));
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) weed(b, sx * (L.w / 2 - 0.5), rng.range(F.front, F.back), rng.range(0.6, 1.1)); // (down the alleys)
    frontage(b, L, F, true);
  };
  // The mess a room was left in: rubbish, luggage, chairs kicked over, bones, what came down through the ceiling,
  // blood. None of it solid (it is walked over, and it blocks no door: kinds with no collider); none of it standing
  // in furniture. h: the room's ceiling (lamps hang from it).
  const MESS = ['litter', 'debris', 'paper_scatter', 'suitcases', 'ceiling_debris', 'stock_spill', 'bones', 'litter', 'body_bag', 'blood_pool', 'glass_shards', 'corpse', 'office_chair', 'skeleton', 'rug', 'paper_scatter'];
  // R: the room, if it has partitions (nothing lies through one, no lamp hangs in one)
  const mess = (b, F, n, h = 0, R = null) => {
    for (let k = 0; k < n; k++) {
      const type = MESS[rng.int(0, MESS.length - 1)];
      const x = rng.range(F.L + 1, F.R - 1);
      const z = rng.range(F.front + 1, F.back - 1);
      const ry = rng.range(0, 6);
      const sd = rng.int(0, 3);
      if (propBlocked('table', b.wx(x, z), b.wz(x, z), b.ry + ry) || atPartition(R, x, z, 1.5)) continue;
      b.prop(type, x, z, ry, { nocollide: true, ly: FLOOR_Y, seed: sd });
    }
    for (let k = Math.max(1, Math.round(n / 4)); k > 0; k--) {
      const x = rng.range(F.L + 1.6, F.R - 1.6);
      const z = rng.range(F.front + 1.6, F.back - 1.6);
      const [sx, sz, ry, rz] = [rng.range(1.2, 2.4), rng.range(0.9, 1.6), rng.range(0, 3), rng.range(-0.16, 0.16)];
      const [cx, cz, ch, crz, crx] = [x + rng.range(-1, 1), z + rng.range(-1, 1), rng.range(1.2, 2.2), rng.range(-0.5, 0.5), rng.range(-0.3, 0.3)];
      if (atPartition(R, x, z, 1.5)) continue;
      b.box(x, FLOOR_Y + 0.04, z, sx, 0.12, sz, 'concrete', { ry, rz, collide: false });
      if (!atPartition(R, cx, cz, 0.7)) b.box(cx, FLOOR_Y + 1.2, cz, 0.08, ch, 0.08, 'rust', { rz: crz, rx: crx, collide: false }); // (a conduit hanging out of the ceiling)
    }
    if (h) for (let x = F.L + 3; x < F.R - 2; x += 5.5) for (const z of F.d > 10 ? [F.cz - F.d * 0.22, F.cz + F.d * 0.22] : [F.cz]) {
      const [ry, sd] = [rng.chance(0.5) ? 0 : PI / 2, rng.int(0, 2)];
      if (!atPartition(R, x, z, 0.9)) b.prop('ceiling_lamp', x, z, ry, { nocollide: true, ly: h, seed: sd });
    }
  };
  // ...the same in one room of a partitioned floor, x0..x1 by z0..z1: a few things, clear of its walls
  const HOME_MESS = ['litter', 'paper_scatter', 'suitcases', 'litter', 'glass_shards', 'bones', 'ceiling_debris', 'paper_scatter', 'blood_pool', 'debris'];
  const messIn = (b, x0, z0, x1, z1, n, lampAt = 0) => {
    const [xa, xb, za, zb] = [Math.min(x0, x1) + 0.9, Math.max(x0, x1) - 0.9, Math.min(z0, z1) + 0.9, Math.max(z0, z1) - 0.9];
    for (let k = 0; k < n; k++) {
      const type = HOME_MESS[rng.int(0, HOME_MESS.length - 1)];
      const [x, z, ry, sd] = [rng.range(xa, Math.max(xa, xb)), rng.range(za, Math.max(za, zb)), rng.range(0, 6), rng.int(0, 3)];
      if (xb - xa < 0.6 || zb - za < 0.6 || type === 'ceiling_debris' && Math.min(xb - xa, zb - za) < 1.4) continue;
      b.prop(type, x, z, ry, { nocollide: true, ly: FLOOR_Y, seed: sd });
    }
    if (lampAt) b.prop('ceiling_lamp', (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : PI / 2, { nocollide: true, ly: lampAt, seed: rng.int(0, 2) });
  };
  // ---- A flat. The ground floor of a block of flats is homes: off the common hall, between its wall (x = xh) and
  // the wall the flat shares with next door or with the street's side (x = xo), two rows of rooms, front to back -
  // by the far wall a living room on the street, the kitchen behind it and a bedroom at the back; by the hall a
  // small room on the street, the flat's own passage, which every door of it opens off, and the bathroom. Each is
  // painted its own way and has what was in it. o.stairs: the small front room is the block's stair well, open to
  // the hall, under what came down it. o.keep: what is searched in it ('fridge', 'cabinet', 'locker', 'duffel').
  const FLAT_CEIL = 2.7; // a home's ceiling (the slab is over it)
  const flatUnit = (b, R, F, xh, xo, o = {}) => {
    const sg = xo > xh ? 1 : -1;
    const W = Math.abs(xo - xh);
    const X = (u) => xh + sg * u;
    const Z = (v) => F.front + v;
    const C = 3.5; // (the wall between the two rows)
    const H = R.h;
    const rO = sg > 0 ? PI / 2 : -PI / 2; // (turned to stand against a wall on the far side of it, facing the room; rH: on the hall's)
    const rH = -rO;
    // its walls
    if (o.stairs) {
      partition(b, R, X(0), Z(3.5), X(0), F.back, H, 'concrete', [door(3.7, 1.3)]);
      partition(b, R, X(0), Z(3.5), X(C), Z(3.5), H, 'concrete');
      stairBlock(b, X(1.95), Z(2.6));
    } else {
      partition(b, R, X(0), F.front, X(0), F.back, H, 'concrete', [door(7.2, 1.3)]);
      partition(b, R, X(0), Z(3.5), X(C), Z(3.5), H, 'concrete', [door(1.75, 1.2)]);
    }
    partition(b, R, X(C), F.front, X(C), F.back, H, 'concrete', [door(4.35, 1.2), door(7.2, 1.2), door(10.05, 1.2)]);
    partition(b, R, X(C), Z(5.2), xo, Z(5.2), H, 'concrete');
    partition(b, R, X(C), Z(9.2), xo, Z(9.2), H, 'concrete');
    partition(b, R, X(0), Z(10.9), X(C), Z(10.9), H, 'concrete', [door(1.75, 1.2)]);
    // its rooms: each its own paint; tile in the kitchen and the bathroom
    const paint = () => rng.int(0, 5);
    if (!o.stairs) zone(R, X(0), Z(0), X(C), Z(3.5), paint());
    zone(R, X(0), Z(3.5), X(C), Z(10.9), paint());
    zone(R, X(0), Z(10.9), X(C), Z(14), paint());
    zone(R, X(C), Z(0), xo, Z(5.2), paint());
    zone(R, X(C), Z(5.2), xo, Z(9.2), paint());
    zone(R, X(C), Z(9.2), xo, Z(14), paint());
    lino(R, X(C), Z(5.2), xo, Z(9.2), rng.int(0, 5));
    lino(R, X(0), Z(10.9), X(C), Z(14), rng.int(0, 5));
    const keep = o.keep || '';
    // the living room: a sofa and the set it faced, an armchair, shelves
    b.prop('sofa', X(5.75), Z(4.5), 0, { ly: FLOOR_Y, seed: rng.int(0, 2) });
    extra(b, 'tv_set', X(5.9), Z(0.46), PI, inside);
    extra(b, 'armchair', X(W - 0.72), Z(2.3), rO, inside);
    extra(b, 'bookshelf', X(C + 0.62), Z(1.3), rH, inside);
    b.prop('rug', X(5.8), Z(2.5), rng.range(-0.2, 0.2), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    // the kitchen: units and the stove along the far wall, the table they ate at, the fridge
    extra(b, 'kitchen_counter', X(W - 0.52), Z(6.6), rO, inside);
    extra(b, 'stove', X(W - 0.54), Z(8.2), rO, inside);
    b.prop('kitchen_table', X(5.4), Z(7.3), rng.range(-0.15, 0.15), inside);
    b.loot(X(5.4), Z(7.3), FLOOR_Y + 0.87);
    for (const [du, dv, r] of [[0, -0.75, 0], [0.1, 0.8, PI]]) b.prop('chair', X(5.4 + du), Z(7.3 + dv), r + rng.range(-0.5, 0.5), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    if (keep.includes('fridge')) cont(b, CONT.FRIDGE, 'fridge', X(4.3), Z(8.68), 0);
    // the bedroom: a bed made up for two, a wardrobe, a chest of drawers
    b.prop('double_bed', X(W - 1.25), Z(12.78), 0, inside);
    extra(b, 'wardrobe', X(5.9), Z(9.68), PI, inside);
    extra(b, 'dresser', X(C + 0.62), Z(12.6), rH, inside);
    if (keep.includes('cabinet')) cont(b, CONT.CABINET, 'cabinet', X(5.0), Z(13.52), 0);
    b.prop('rug', X(5.2), Z(11.4), PI / 2 + rng.range(-0.2, 0.2), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    // the small room on the street: somebody's - a bed, a table under the window
    if (!o.stairs) {
      b.prop('bed', X(0.68), Z(1.42), 0, { ly: FLOOR_Y, seed: rng.int(0, 1) });
      extra(b, 'table', X(C - 0.62), Z(1.25), rO, inside);
      b.prop('chair', X(2.0), Z(1.3), rO + rng.range(-0.4, 0.4), { nocollide: true, ly: FLOOR_Y });
      b.loot(X(1.75), Z(2.55), FLOOR_Y + 0.02);
    } else b.loot(X(W - 2.9), Z(11.2), FLOOR_Y + 0.02);
    // the passage: a chest against the hall's wall, what was dropped on the way out
    extra(b, 'dresser', X(0.62), Z(5.3), rH, inside);
    if (keep.includes('locker')) cont(b, CONT.LOCKER, 'locker', X(0.42), Z(9.3), rH);
    if (keep.includes('duffel')) b.cont(CONT.DUFFEL, X(2.3), Z(8.9), { prop: 'duffel_bag', ry: 0.8, nocollide: true, ly: FLOOR_Y });
    b.prop('rug', X(1.75), Z(7.2), PI / 2, { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    // the bathroom
    extra(b, 'bathtub', X(0.58), Z(12.95), 0, inside);
    extra(b, 'toilet', X(2.6), Z(13.45), 0, inside);
    // what the years left on its floors; a lamp over each of the rooms that were lived in
    messIn(b, X(C), Z(0), xo, Z(5.2), 2, FLAT_CEIL);
    messIn(b, X(C), Z(5.2), xo, Z(9.2), 1, FLAT_CEIL);
    messIn(b, X(C), Z(9.2), xo, Z(14), 2, FLAT_CEIL);
    messIn(b, X(0), Z(3.5), X(C), Z(10.9), 2);
  };
  // rows of shelving down the middle of a shop's floor, what they held swept off them, clear of its counter and doors
  const aisles = (b, F) => {
    for (const dx of [4.2, 7.4, 10.6, 13.6]) {
      if (F.L + dx > F.R - 4.4) continue;
      extra(b, 'shop_gondola', F.L + dx, F.cz + 1.2, PI / 2, inside);
      extra(b, 'shop_gondola', F.L + dx, F.cz - 2.2, PI / 2, { ly: FLOOR_Y, seed: 1 });
      b.prop('stock_spill', F.L + dx + rng.range(-0.3, 1.4), F.cz + rng.range(-1.6, 2.2), rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    }
  };
  // a shop's counter: the till on it, what is searched for on its top
  const counter = (b, x, z, ry = 0) => {
    b.prop('checkout_counter', x, z, ry, inside);
    b.loot(x, z, FLOOR_Y + 0.98);
  };
  // what is in a shop, by what it sold. Each fills a room of any width from 12 m up, clear of its two doors.
  const FILL = {
    grocery(b, F) {
      counter(b, F.L + 3, F.front + 3.2);
      for (const dx of [1.6, 3.9, 6.2]) cont(b, CONT.SHELF, 'shelf', F.L + dx, backZ(F, 0.5), 0);
      cont(b, CONT.SHELF, 'shelf', F.R - 4.6, F.cz + 0.4, PI / 2);
      cont(b, CONT.FRIDGE, 'fridge', rightX(F, 0.72), F.cz - 0.2, PI / 2);
      b.loot(F.R - 3, F.cz - 2.4, FLOOR_Y + 0.02);
      aisles(b, F);
      extra(b, 'display_fridge', rightX(F, 0.75), F.cz + 2.2, PI / 2, inside);
      extra(b, 'display_fridge', rightX(F, 0.75), F.cz - 2.4, PI / 2, { ly: FLOOR_Y, seed: 1 });
      extra(b, 'vending_machine', leftX(F, 0.86), F.cz - 0.4, -PI / 2, inside);
      b.prop('shopping_cart', F.R - 2.6, F.front + 2, 0.7, { nocollide: true, ly: FLOOR_Y });
    },
    pharmacy(b, F) {
      counter(b, F.L + 4.2, F.cz + 0.4);
      for (const dx of [1.2, 2.3]) cont(b, CONT.MEDICINE, 'medicine_cabinet', F.L + dx, backZ(F, 0.45), 0);
      cont(b, CONT.CABINET, 'cabinet', F.L + 4.2, backZ(F, 0.55), 0);
      cont(b, CONT.SHELF, 'shelf', rightX(F, 0.5), F.cz - 1.4, PI / 2);
      b.prop('wheelchair', F.L + 1.6, F.front + 2.2, 0.6, { nocollide: true, ly: FLOOR_Y });
      b.loot(F.R - 2.4, F.cz + 1.6, FLOOR_Y + 0.02);
      extra(b, 'shop_gondola', F.R - 5.4, F.cz - 2.4, 0, inside);
      extra(b, 'waiting_chairs', F.R - 2.2, F.front + WALL + 0.4, PI, inside);
      b.prop('stock_spill', F.R - 4.4, F.cz - 0.6, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    },
    hardware(b, F) {
      counter(b, F.L + 3, F.front + 3.4);
      b.cont(CONT.TOOLBOX, F.L + 3.6, F.front + 3.4, { prop: 'toolbox', ry: 0.3, nocollide: true, ly: FLOOR_Y + 0.96 });
      for (const dx of [1.6, 3.9]) cont(b, CONT.SHELF, 'shelf', F.L + dx, backZ(F, 0.5), 0);
      cont(b, CONT.CRATE, 'crate', F.L + 6.6, backZ(F, 1), 0.1);
      cont(b, CONT.SHELF, 'shelf', F.R - 4.6, F.cz, PI / 2);
      b.prop('tire_pile', rightX(F, 1.4), F.cz - 2.6, 0, inside);
      aisles(b, F);
      b.loot(F.R - 3, F.cz + 2, FLOOR_Y + 0.02);
      b.loot(F.L + 1.4, F.cz - 1, FLOOR_Y + 0.02);
    },
    diner(b, F) {
      const len = F.w - 8;
      b.box(F.L + 1.2 + len / 2, FLOOR_Y, F.cz + 2.2, len, 1.05, 0.7, 'planks'); // the counter
      b.box(F.L + 1.2 + len / 2, FLOOR_Y + 1.05, F.cz + 2.2, len + 0.1, 0.05, 0.86, 'metal', { collide: false });
      b.loot(F.L + 2.4, F.cz + 2.2, FLOOR_Y + 1.12);
      cont(b, CONT.FRIDGE, 'fridge', F.L + 1.1, backZ(F, 0.72), 0);
      cont(b, CONT.CABINET, 'cabinet', F.L + 2.8, backZ(F, 0.55), 0);
      extra(b, 'stove', F.L + 4.4, backZ(F, 0.66), 0, inside);
      extra(b, 'kitchen_counter', F.L + 6.2, backZ(F, 0.63), 0, inside);
      for (const tx of [F.L + 2.2, F.R - 2.2]) {
        b.prop('table', tx, F.front + 2.4, 0.05, inside);
        b.prop('chair', tx - 1.2, F.front + 2.5, PI / 2, inside);
        b.prop('chair', tx + 1.2, F.front + 2.3, -PI / 2, inside);
      }
      b.loot(F.R - 2.2, F.front + 2.4, FLOOR_Y + 0.82);
      // (more tables down the front, where there is the width for them)
      for (const tx of F.w > 16 ? [-3.6, 3.6] : []) {
        b.prop('table', tx, F.front + 2.4, 0.05, inside);
        b.prop('chair', tx, F.front + 3.5, 0.3, { nocollide: true, ly: FLOOR_Y });
      }
      extra(b, 'vending_machine', rightX(F, 0.86), F.cz + 1.2, PI / 2, inside);
    },
    // Calder Aero Supply: where the plane's magneto is
    aero(b, F) {
      FILL.hardware(b, F);
      part(b, 1, F.R - 1.4, F.cz - 0.6, FLOOR_Y + 0.02);
    },
  };
  // the shops of a street: [what it sells (a FILL), its wall, the board over its door]
  const SHOP = {
    grocery: ['grocery', 'brick', 'shop_grocery'],
    pharmacy: ['pharmacy', 'plaster', 'shop_pharmacy'],
    hardware: ['hardware', 'brick', 'shop_hardware'],
    diner: ['diner', 'plaster', 'shop_diner'],
    aero: ['aero', 'brick', 'shop_aero'],
    liquor: ['grocery', 'brick', 'shop_liquor'],
    pawn: ['hardware', 'plaster', 'shop_pawn'],
    laundry: ['pharmacy', 'plaster', 'shop_laundry'],
    bakery: ['diner', 'brick', 'shop_bakery'],
    bar: ['diner', 'brick', 'shop_bar'],
    books: ['hardware', 'plaster', 'shop_books'],
  };
  const TERRACE = ['grocery', 'liquor', 'laundry', 'bakery', 'bar', 'books', 'pawn', 'diner', 'hardware'];
  // A shop's room: a glass front with the door in the middle of it, a yard door at the back's right-hand end. x0:
  // where its middle is along the lot (a terrace has three). Returns its builder, its frame and what was said of it.
  const shopRoom = (b, L, w, d, kind, x0 = 0, alone = true) => {
    const [, mat, sign] = SHOP[kind];
    const s = b.sub(x0, 0);
    const F = frame(L, w, d);
    const ww = Math.min(3, w * 0.22);
    // (a shop on a lot of its own may have had a wall blown in: one more way through it)
    const breach = alone && rng.chance(0.4);
    const R = groundRoom(s, 0, F.cz, w, d, 3.8, mat === 'plaster' ? 'concrete' : mat, { n: [door(w / 2, 1.6), cw(w * 0.2, ww, 0.8, 2.8), cw(w * 0.8, ww, 0.8, 2.8)], s: [door(2.4, 1.1)], w: breach ? [gap(d * 0.72, 2.6, 2.9)] : [] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true, sign });
    // (the stock room behind: a door into it, and the wall down at its other end - the way to the yard door)
    partition(s, R, F.L, F.cz + 4.2, F.R, F.cz + 4.2, 3.8, 'concrete', [door(w * 0.3, 1.3), gap(w - 2.6, 2.2, 2.7)]);
    // (...and between the two, behind a door off the stock room: the office of a shop on a lot of its own, a
    // closet where three share a roof)
    const [ox0, ox1] = [F.L + 7.7, F.R - 3.9];
    partition(s, R, ox0, F.cz + 4.2, ox0, F.back, 3.8, 'concrete', [door(1.27, 1.2)]);
    partition(s, R, ox1, F.cz + 4.2, ox1, F.back, 3.8, 'concrete');
    zone(R, F.L, F.cz + 4.2, ox0, F.back, 5);
    zone(R, ox0, F.cz + 4.2, ox1, F.back, rng.int(0, 4));
    if (alone) {
      extra(s, 'office_desk', (ox0 + ox1) / 2 + 0.6, backZ(F, 0.8), 0, inside);
      s.prop('office_chair', (ox0 + ox1) / 2 + 0.5, F.back - 1.5, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 1) });
      extra(s, 'filing_cabinet', ox1 - 0.09 - 0.06 - 0.3, F.back - WALL - 0.62, 0, inside);
      s.prop('paper_scatter', (ox0 + ox1) / 2, F.cz + 5.4, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    } else extra(s, 'toilet', ox1 - 0.09 - 0.06 - 0.26, F.back - WALL - 0.36, 0, inside);
    if (breach) {
      s.prop('debris', F.L + 1.2, F.cz + d * 0.22, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y });
      skirt(s, F.L - 1.2, F.cz + d * 0.22);
    }
    s.prop('glass_shards', -w * 0.3, F.front + 0.9, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    s.prop('litter', rng.range(-2, 2), F.cz - 1.5, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
    // (after what the shop is furnished with: what was left lies round that - and here and there somebody has kept a
    // fire in a drum on the shop floor since)
    s.mess = () => {
      const fire = alone && rng.chance(0.3);
      if (fire && fits(s, 'barrel', F.R - 3.2, F.front + 4.6, 0, FLOOR_Y)) drumFire(s, F.R - 3.2, F.front + 4.6);
      // (more shelving down the side wall - not across a wall that was blown in)
      if (!breach) extra(s, 'shelf', leftX(F, 0.5), F.cz - 3.6, -PI / 2, inside);
      if (!breach) extra(s, 'shelf', leftX(F, 0.5), F.cz + 1.9, -PI / 2, { ly: FLOOR_Y, seed: 1 });
      mess(s, { ...F, back: F.cz + 4.2 }, alone ? 9 : 6, 3.8, R);
    };
    return [s, F, mat];
  };
  // how a building has come through it: [lost, open] for block() - most have lost a storey or two off the top, one
  // in four has an end fallen away
  const ruinOf = (floors) => {
    const r = rng();
    const lost = r < 0.3 ? 0 : rng.int(1, Math.min(3, floors - 1));
    const open = rng.chance(0.24) && floors > 2 ? (rng.chance(0.5) ? 1 : -1) : 0;
    return { lost, open, from: rng.int(0, 1), top: !lost && rng.chance(0.25) ? 'slab' : undefined };
  };
  const BUILD = {
    shop(b, L, kind) {
      const [s, F, mat] = shopRoom(b, L, 18.4, 13.5, kind);
      FILL[SHOP[kind][0]](s, F);
      s.mess();
      const floors = rng.int(1, 4);
      block(b, 0, F.cz, F.w, F.d, 4.1, floors, 3, 'shopflat', mat, { ...ruinOf(floors), blank: rng.chance(0.5) ? 2 : rng.chance(0.5) ? 8 : 0 }); // (flats over the shop: shut, as every upper floor is)
      ivyOn(b, 0, F.cz, F.w, F.d, 0, 4.1 + floors * 3);
      yard(b, F, L);
    },
    // a row of three shops under one roof
    terrace(b, L) {
      const F = frame(L, 41.1, 13.5);
      const U = F.w / 3;
      const k0 = rng.int(0, TERRACE.length - 1);
      const floors = rng.int(1, 3);
      const mat = rng.chance(0.5) ? 'brick' : 'plaster';
      block(b, 0, F.cz, F.w, F.d, 4.1, floors, 3, 'shopflat', mat, ruinOf(floors));
      for (let k = 0; k < 3; k++) {
        const kind = TERRACE[(k0 + k * 2) % TERRACE.length];
        const [s, Fu] = shopRoom(b, L, U, 13.5, kind, (k - 1) * U, false);
        FILL[SHOP[kind][0]](s, Fu);
        s.mess();
      }
      yard(b, F, L);
      b.wreck(rng.chance(0.5) ? 'car_wreck' : 'car_burnt', F.R - 6, F.back + 3.4, PI / 2 + rng.range(-0.2, 0.2), { ly: PAVE, trunk: rng.chance(0.5) });
    },
    // the police station: a front office, the cells, and behind a door the armoury
    police(b, L) {
      const F = frame(L, 18.4, 13.5);
      block(b, 0, F.cz, F.w, F.d, 3.9, rng.int(1, 2), 3, 'walkup', 'brick', { lost: 0, wear: 0.5 });
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 3.6, 'brick', { n: [door(F.w / 2, 1.5), win(F.w * 0.2, 1.6), win(F.w * 0.8, 1.6)], s: [door(2.4, 1.1)], w: [win(F.d * 0.7, 1.2, 1.5, 2.2)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true, sign: 'police', tint: 2 });
      partition(b, R, F.L, F.cz + 1.5, F.R, F.cz + 1.5, 3.6, 'brick', [door(4, 1.2)]);
      // (behind it: the cells' own room, the armoury behind a door of its own, the back office by the yard door)
      partition(b, R, -2.6, F.cz + 1.5, -2.6, F.back, 3.6, 'brick', [door(1.5, 1.2)]);
      partition(b, R, 4, F.cz + 1.5, 4, F.back, 3.6, 'brick', [door(1.5, 1.2)]);
      zone(R, F.L, F.cz + 1.5, -2.6, F.back, 5);
      zone(R, -2.6, F.cz + 1.5, 4, F.back, 0);
      zone(R, 4, F.cz + 1.5, F.R, F.back, 3);
      extra(b, 'locker', 0.3, F.cz + 1.5 + 0.09 + 0.06 + 0.26, PI, inside);
      extra(b, 'locker', 1.4, F.cz + 1.5 + 0.09 + 0.06 + 0.26, PI, { ly: FLOOR_Y, seed: 1 });
      extra(b, 'office_desk', rightX(F, 0.8) - 0.05, F.cz + 3.7, PI / 2, inside);
      b.prop('office_chair', F.R - 1.9, F.cz + 3.6, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 1) });
      b.prop('paper_scatter', 6.4, F.cz + 4.4, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
      drumFire(b, F.L + 0.9, F.cz - 1.3);
      b.prop('reception_desk', 3.4, F.cz - 1.4, 0, { ly: FLOOR_Y, seed: 1 }); // the front desk
      b.loot(3.4, F.cz - 1.4, FLOOR_Y + 1.14);
      cont(b, CONT.CABINET, 'cabinet', rightX(F, 0.55), F.cz - 3.4, PI / 2);
      for (const dz of [2.25, 3.25]) cont(b, CONT.LOCKER, 'locker', leftX(F, 0.5), F.cz + dz, -PI / 2, { seed: dz | 0 });
      cont(b, CONT.AMMO_BOX, 'military_crate', -1, backZ(F, 0.8), 0);
      cont(b, CONT.AMMO_BOX, 'military_crate', 1.6, backZ(F, 0.8), 0, { seed: 1 });
      b.loot(-4.4, F.cz + 3.2, FLOOR_Y + 0.02);
      b.prop('sandbags', -4.5, F.front - 0.55, 0, { ly: PAVE });
      b.prop('table', -5, F.cz - 3.6, 0.1, inside);
      b.prop('chair', -5, F.cz - 2.6, 3, { nocollide: true, ly: FLOOR_Y });
      // the cell, in the back room's corner: its door standing open, whoever was in it still there
      b.prop('cell_bars', F.L + 0.125 + 1.5, F.cz + 4.2, 0, inside);
      partition(b, R, F.L + 3.2, F.cz + 4.2, F.L + 3.2, F.back, 3.6, 'brick');
      b.prop('cell_bunk', F.L + 0.125 + 0.42, F.back - WALL - 1.0, 0, inside);
      b.prop('skeleton', F.L + 2.3, F.back - 0.9, PI, { nocollide: true, ly: FLOOR_Y, seed: 1 });
      extra(b, 'waiting_chairs', -6.6, F.front + WALL + 0.34, PI, inside);
      extra(b, 'filing_cabinet', F.R - 1.6, F.cz + 1.5 - 0.09 - WALL - 0.6, PI, inside);
      extra(b, 'office_desk', 6.4, F.cz - 3.8, PI, inside);
      mess(b, F, 9, 3.6, R);
      yard(b, F, L);
      signAt(b, F.L + 0.9, 3.0, F.front - 0.5, PI / 2, 1.0, 0.25, 'police', { back: 0.1, two: true });
    },
    // flats over a ground floor that can be walked into: the common hall from the street door to the yard door, the
    // stairs up off it, and a flat either side of it (flatUnit: six rooms each, a home's size and a home's ceiling)
    flats(b, L) {
      const F = frame(L, 18.4, 14);
      const mat = rng.chance(0.55) ? 'brick' : rng.chance(0.5) ? 'concrete' : 'plaster';
      const HW = 1.2; // (half the hall)
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 3.2, mat === 'plaster' ? 'concrete' : mat, { n: [door(F.w / 2, 1.4), cw(2.1, 1.6), cw(6.25, 1.2), cw(12.15, 1.2), cw(16.3, 1.6)], s: [door(F.w / 2, 1.1), cw(2.1, 1.4), cw(16.3, 1.4), hole(6.25, 0.8, 1.5, 2.1), hole(12.15, 0.8, 1.5, 2.1)], e: [cw(7.2, 1.4)], w: [cw(F.d - 7.2, 1.4)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'planks', boards: true, ceiling: 'plaster', ceil: FLAT_CEIL, homely: true });
      zone(R, -HW, F.front, HW, F.back, 5);
      const duffel = rng.chance(0.4);
      flatUnit(b, R, F, -HW, F.L, { keep: 'fridge' });
      flatUnit(b, R, F, HW, F.R, { stairs: true, keep: duffel ? 'cabinet duffel' : 'cabinet' });
      const floors = rng.int(3, 6);
      block(b, 0, F.cz, F.w, F.d, 3.5, floors, 3, mat === 'concrete' ? 'slab' : mat === 'plaster' ? 'shopflat' : 'walkup', mat, { ...ruinOf(floors), blank: rng.chance(0.4) ? (rng.chance(0.5) ? 2 : 8) : 0 });
      ivyOn(b, 0, F.cz, F.w, F.d, 0, 3.5 + floors * 3);
      // the hall: what was left in it on the way out, the post nobody collected
      for (const [lz, type] of [[2.2, 'paper_scatter'], [6.4, 'litter'], [10.6, 'suitcases']]) b.prop(type, rng.range(-0.4, 0.4), F.front + lz, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
      yard(b, F, L);
    },
    // a long block of flats: two halls, each with its stairs, and four flats on the ground floor
    block(b, L) {
      const F = frame(L, 41, 14);
      const mat = rng.chance(0.5) ? 'brick' : 'concrete';
      const HW = 1.2;
      const HX = F.w / 4; // (a hall's middle, either side of the block's)
      const at = (x) => x + F.w / 2; // (along the front wall; the back wall runs the other way)
      const back = (x) => F.w / 2 - x;
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 3.2, mat, {
        n: [door(at(-HX), 1.4), door(at(HX), 1.4), ...[-HX - HW - 5.9, -HX + HW + 5.9, HX - HW - 5.9, HX + HW + 5.9].map((x) => cw(at(x), 1.6)), ...[-HX - HW - 1.75, -HX + HW + 1.75, HX - HW - 1.75, HX + HW + 1.75].map((x) => cw(at(x), 1.2))],
        s: [door(back(-HX), 1.1), door(back(HX), 1.1), ...[-HX - HW - 5.9, -HX + HW + 5.9, HX - HW - 5.9, HX + HW + 5.9].map((x) => cw(back(x), 1.4)), ...[-HX - HW - 1.75, -HX + HW + 1.75, HX - HW - 1.75, HX + HW + 1.75].map((x) => hole(back(x), 0.8, 1.5, 2.1))],
        e: [cw(7.2, 1.4)],
        w: [cw(F.d - 7.2, 1.4)],
      }, { roof: 'flat', roofMat: 'concrete', floorMat: 'planks', boards: true, ceiling: 'plaster', ceil: FLAT_CEIL, homely: true });
      partition(b, R, 0, F.front, 0, F.back, 3.2, 'concrete'); // (the wall between the two stairs' flats)
      for (const sx of [-1, 1]) zone(R, sx * HX - HW, F.front, sx * HX + HW, F.back, 5);
      flatUnit(b, R, F, -HX - HW, F.L, { keep: 'cabinet' });
      flatUnit(b, R, F, -HX + HW, 0, { stairs: true, keep: 'fridge' });
      flatUnit(b, R, F, HX - HW, 0, { stairs: true, keep: 'locker' });
      flatUnit(b, R, F, HX + HW, F.R, { keep: 'fridge duffel' });
      const floors = rng.int(3, 6);
      block(b, 0, F.cz, F.w, F.d, 3.5, floors, 3, mat === 'concrete' ? 'slab' : 'walkup', mat, ruinOf(floors));
      ivyOn(b, 0, F.cz, F.w, F.d, 0, 3.5 + floors * 3);
      for (const sx of [-1, 1]) for (const [lz, type] of [[2.4, 'litter'], [9.6, 'paper_scatter']]) b.prop(type, sx * HX + rng.range(-0.4, 0.4), F.front + lz, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
      yard(b, F, L);
    },
    // an office tower. big: on a lot of its own, the tallest thing for a mile; otherwise a small one on a street lot.
    // fell: its shaft came down across the street (the streets put it there): what stands is its podium, and a stump
    tower(b, L, big) {
      const F = big ? frame(L, 34, 30) : frame(L, 18.4, 15);
      const h = big ? 4.4 : 3.8;
      const fh = big ? 3.3 : 3.2;
      const floors = big ? rng.int(8, 12) : rng.int(5, 7);
      const glassy = rng.chance(big ? 0.5 : 0.35);
      const R = groundRoom(b, 0, F.cz, F.w, F.d, h, 'concrete', { n: [door(F.w / 2, 1.7), win(F.w * 0.22, F.w * 0.17, 0.6, h - 0.8), win(F.w * 0.78, F.w * 0.17, 0.6, h - 0.8)], s: [door(3, 1.2)], e: [win(F.d / 2, F.d * 0.3, 0.6, h - 0.8)], w: [win(F.d / 2, F.d * 0.3, 0.6, h - 0.8)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true, tint: 3 });
      // the core, with the lifts nobody will ride again, and the front desk
      const core = big ? 5 : 3;
      b.box(-F.w / 6, FLOOR_Y, F.cz + F.d / 6, core, h - FLOOR_Y, core, 'concrete');
      // Behind the lobby the floor is offices: a wall across it beside the core, the rooms behind that - the open
      // office with its desks, the one behind it, and at the back of the core the post room - each through a door.
      const [cl, cr, cb] = [-F.w / 6 - core / 2, -F.w / 6 + core / 2, F.cz + F.d / 6 + core / 2]; // (the core's left, right and back)
      if (big) {
        const [wx, wz, wz2] = [1.2, F.cz + 1.2, F.cz + 8.3];
        partition(b, R, wx, wz, F.R, wz, h, 'concrete', [door(3, 1.3), door(12, 1.3)]);
        partition(b, R, wx, wz, wx, F.back, h, 'concrete', [door(9.5, 1.3)]);
        partition(b, R, wx, wz2, F.R, wz2, h, 'concrete', [door(11, 1.3)]);
        partition(b, R, F.L, cb, cl, cb, h, 'concrete', [door(4, 1.3)]);
        partition(b, R, cr, cb, wx, cb, h, 'concrete', [door(2.2, 1.3)]);
        zone(R, wx, wz, F.R, wz2, 2);
        zone(R, wx, wz2, F.R, F.back, 4);
        zone(R, F.L, cb, wx, F.back, 1);
        for (const [dx, dz, r] of [[12.6, 3.4, PI], [12.6, 6.4, 0], [4.2, 3.4, PI], [11.4, 11.2, PI], [13.6, 13.6, 0]]) {
          extra(b, 'office_desk', dx, F.cz + dz, r, inside);
          b.prop('office_chair', dx + rng.range(-0.5, 0.5), F.cz + dz + (r ? -1 : 1) * 1.05, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 1) });
        }
        extra(b, 'filing_cabinet', wx + 0.09 + 0.06 + 0.62, F.cz + 4.4, -PI / 2, inside);
        extra(b, 'filing_cabinet', wx + 0.09 + 0.06 + 0.62, F.cz + 12.6, -PI / 2, { ly: FLOOR_Y, seed: 1 });
        extra(b, 'bookshelf', -9.4, backZ(F, 0.9), 0, inside);
        extra(b, 'office_desk', -5, F.cz + 11.4, 0, inside);
        drumFire(b, 4.4, F.cz - 9.6); // (in the lobby, where somebody waited out a night)
      } else {
        const [wx, wz] = [1.6, F.cz - 0.9];
        partition(b, R, wx, wz, F.R, wz, h, 'concrete', [door(2.5, 1.3)]);
        partition(b, R, wx, wz, wx, F.back, h, 'concrete', [door(6.9, 1.3)]);
        partition(b, R, F.L, cb, cl, cb, h, 'concrete', [door(2.3, 1.3)]);
        partition(b, R, cr, cb, wx, cb, h, 'concrete');
        zone(R, wx, wz, F.R, F.back, 2);
        zone(R, F.L, cb, wx, F.back, 1);
        extra(b, 'filing_cabinet', -0.4, F.back - WALL - 0.62, 0, inside);
      }
      b.prop('reception_desk', F.w / 4, F.cz - F.d / 5, 0, inside);
      b.loot(F.w / 4, F.cz - F.d / 5, FLOOR_Y + 1.14);
      cont(b, CONT.CABINET, 'cabinet', rightX(F, 0.55), F.cz + F.d / 5, PI / 2);
      cont(b, CONT.LOCKER, 'locker', leftX(F, 0.5), F.cz + F.d / 2 - 2.4, -PI / 2);
      b.loot(F.L + 2, F.cz - F.d / 4, FLOOR_Y + 0.02);
      if (big) {
        cont(b, CONT.CABINET, 'cabinet', F.L + 6, backZ(F, 0.55), 0, { seed: 1 });
        b.cont(CONT.DUFFEL, 3, F.cz + 6, { prop: 'duffel_bag', ry: 0.4, nocollide: true, ly: FLOOR_Y });
        b.loot(6, F.cz + 8, FLOOR_Y + 0.02);
      }
      // the lobby: seats along the front, desks behind the lifts, what was in the drawers all over the floor
      extra(b, 'waiting_chairs', F.L + 3.2, F.front + WALL + 0.34, PI, inside);
      extra(b, 'waiting_chairs', F.L + 5.4, F.front + WALL + 0.34, PI, inside);
      extra(b, 'vending_machine', leftX(F, 0.86), F.cz - 1, -PI / 2, inside);
      for (const [dx, dz] of big ? [[6, 6], [9.4, 6], [6, 10], [-10, -4]] : [[4.4, 3.4], [6.4, 0.4]]) {
        extra(b, 'office_desk', dx, F.cz + dz, rng.chance(0.5) ? 0 : PI, inside);
        b.prop('office_chair', dx + rng.range(-0.6, 0.6), F.cz + dz + 1.1, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 1) });
      }
      extra(b, 'filing_cabinet', rightX(F, 0.66), F.cz - F.d / 4, PI / 2, inside);
      extra(b, 'filing_cabinet', rightX(F, 0.66), F.cz - F.d / 4 - 0.7, PI / 2, inside);
      for (let k = big ? 5 : 2; k > 0; k--) b.prop('paper_scatter', rng.range(F.L + 2, F.R - 2), rng.range(F.front + 2, F.back - 2), rng.range(0, 6), { nocollide: true, ly: FLOOR_Y, seed: rng.int(0, 2) });
      mess(b, F, big ? 22 : 9, h, R);
      if (L.fell) {
        // the podium, its top storeys open to the sky; on it the stump of the shaft that went
        const top = block(b, 0, F.cz, F.w, F.d, h + 0.3, 4, fh, glassy ? 'glass' : 'office', 'concrete', { top: 'slab', wear: 0.9 });
        block(b, 0, F.cz, 16, 14, top, 3, fh, glassy ? 'glass' : 'office', 'concrete', { lost: 2, wear: 1 });
        L.shaft = { style: glassy ? 'glass' : 'office', fh };
      } else block(b, 0, F.cz, F.w, F.d, h + 0.3, floors, fh, glassy ? 'glass' : 'office', 'concrete', { lost: rng.int(big ? 1 : 0, 3), open: rng.chance(0.3) ? (rng.chance(0.5) ? 1 : -1) : 0, from: rng.int(2, 4) });
      stairBlock(b, -F.w / 6 + core / 2 + 1.4, F.cz + F.d / 6);
      if (big) landmarks.push({ x: b.wx(0, F.cz), z: b.wz(0, F.cz), name: ['Calder Trust Tower', 'Harbour House', 'Meridian Assurance', 'Dockside Exchange', 'Pacific & Northern', 'Customs House'][nextTower() % 6] });
      if (!big) return yard(b, F, L);
      // the plaza behind it: planters gone to dead wood, a shelter, the cars of people who never came down
      for (const tx of [-14, -5, 5, 14]) b.tree(tx, L.d / 2 - 3.4, rng.chance(0.5) ? 3 : 4, rng.range(0.9, 1.2));
      b.prop('bus_shelter', -15.5, F.back + 5, PI / 2, { ly: PAVE });
      b.wreck('car_wreck', 8, F.back + 5.5, PI / 2 + 0.2, { ly: PAVE });
      // (not down the flanks of the one whose shaft fell: it lies there)
      if (!L.fell) b.wreck('car_burnt', F.R + 2.2, F.cz + 3, 0.1, { ly: PAVE, trunk: false });
      if (!L.fell) b.cont(CONT.DUMPSTER, F.L - 1.8, F.cz - 4, { prop: 'dumpster', ry: PI / 2, ly: PAVE });
      b.loot(0, F.back + 4, PAVE + 0.02);
      for (const [bx, bz] of [[-9, F.back + 2.2], [2, F.back + 2.2]]) extra(b, 'street_bench', bx, bz, PI, { ly: PAVE });
      extra(b, 'trash_bin', -4, F.back + 2.0, 0, { ly: PAVE });
      for (let k = 0; k < 9; k++) weed(b, rng.range(-19, 19), rng.range(F.back + 0.5, L.d / 2 - 0.5), rng.range(0.6, 1.3));
      for (let k = 0; k < 4; k++) b.prop(['litter', 'paper_scatter', 'glass_shards', 'debris'][k], rng.range(-16, 16), F.front - rng.range(0.4, 1), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: k });
    },
    // a block that came down: the walls of two sides of it stand, storeys high with the sky in their windows; the
    // rest is heaps, one of them at the kerb
    ruin(b, L) {
      const w = Math.min(L.w - 3, 16);
      const d = 13;
      const cz = -L.d / 2 + SETBACK + d / 2;
      b.prop('debris', -3.5, cz - 1, 2, { nocollide: true, ly: PAVE });
      b.prop('debris', 5, cz + 5.5, 0.5, { nocollide: true, ly: PAVE, seed: 1 });
      b.tree(-4.6, cz + 3.4, 5, rng.range(0.5, 0.8));
      for (let k = 0; k < 9; k++) weed(b, rng.range(-9, 9), rng.range(-8, 9), rng.range(0.7, 1.4));
      frontage(b, L, null);
      // (its shell: the back wall and one side of it stand, storeys high and broken off; stumps of the rest)
      const mat = rng.chance(0.6) ? 'brick' : 'concrete';
      const H = rng.range(7, 13);
      jagged(b, -w / 2, cz - d / 2, -w / 2, cz + d / 2, PAVE, H, mat, true, { inner: 'plaster' });
      jagged(b, -w / 2 + 0.4, cz + d / 2, w / 2, cz + d / 2, PAVE, H, mat, true, { inner: 'plaster' });
      jagged(b, w / 2, cz + d / 2 - 0.4, w / 2, cz + d / 2 - 5.2, PAVE, H * 0.6, mat, true, { inner: 'plaster' });
      jagged(b, w / 2 - 5.2, cz - d / 2, w / 2, cz - d / 2, PAVE, 2.4, mat);
      // (what it came down as: a long heap where its floors landed, smaller ones round it)
      heap(b, 1.8, cz + 1.2, 4.6, 3.6, rng.range(1.7, 2.3), { brick: 0.45, ry: rng.range(-0.3, 0.3) });
      heap(b, -5.0, cz - 3.4, 2.2, 1.9, 1.1, { brick: 0.5 });
      skirt(b, -w / 2 - 1.4, cz + 1);
      skirt(b, 2, cz + d / 2 + 1.5);
      streetPile(b, L, rng.range(-3, 3));
      // (a floor of it still hanging from the back wall, the steel of another across the heap)
      b.box(-2.4, 3.2, cz + d / 2 - 2.3, w * 0.5, 0.26, 4, 'concrete', { rx: -0.34, collide: false });
      b.box(4.4, 1.9, cz + 3.4, 5.4, 0.2, 0.2, 'rust', { rz: -0.34, ry: -0.7, collide: false });
      b.box(-1.4, 2.4, cz + 2.4, 0.2, 0.2, 6.4, 'rust', { rx: 0.3, ry: 0.2, collide: false });
      b.cont(CONT.DUFFEL, -w / 2 + 1.6, cz - d / 2 + 1.6, { prop: 'duffel_bag', ry: 0.5, nocollide: true, ly: PAVE });
      b.loot(w / 2 - 1.2, cz + d / 2 - 1.6, PAVE + 0.02);
      b.prop('skeleton', -w / 2 + 2.6, cz + d / 2 - 1.4, 1.1, { nocollide: true, ly: PAVE, seed: 2 });
      b.tree(L.w / 2 - 2.4, L.d / 2 - 2.4, 4, 1);
    },
    // burnt out: the walls, black, with the sky over them and soot up them from every opening
    burnt(b, L) {
      const F = frame(L, 18, 13);
      if (rng.chance(0.4)) fire(b, 1, 1.2, F.cz);
      else if (rng.chance(0.5)) smoke(b, 0, 3, F.cz);
      b.prop('debris', -3, F.cz - 2, 1, { nocollide: true, ly: FLOOR_Y });
      for (let k = 0; k < 7; k++) weed(b, rng.range(-9, 9), rng.range(F.back + 0.6, L.d / 2 - 0.5), rng.range(0.7, 1.3));
      frontage(b, L, F);
      // (its walls are what they were built of, brick or concrete, under the soot: the kit lays that over every
      // opening the fire came out of, inside and out, and smokes what is left of the plaster)
      const wall = rng.chance(0.65) ? 'brick' : 'concrete';
      groundRoom(b, 0, F.cz, F.w, F.d, 3.4, wall, { n: [gap(F.w / 2, 2.2, 2.6), gap(F.w * 0.2, 2.4, 2.4)], s: [gap(F.w * 0.7, 3, 3)], e: [gap(F.d / 2, 1.6, 2.2)] }, { floorMat: 'ash', burnt: true });
      const up = rng.range(4.5, 9);
      // (each wall is laid so that its outer face looks out of the lot)
      jagged(b, F.L, F.back, F.R, F.back, 3.4, up, wall, false, { soot: true, inner: 'charred' });
      jagged(b, F.L, F.front + 0.4, F.L, F.back - 0.4, 3.4, up, wall, false, { soot: true, inner: 'charred' });
      jagged(b, F.R, F.front, F.L + 0.4, F.front, 3.4, up * 0.6, wall, false, { soot: true, inner: 'charred' });
      jagged(b, F.R, F.back - 0.4, F.R, F.front + 0.4, 3.4, up * 0.4, wall, false, { soot: true, inner: 'charred' });
      skirt(b, F.R + 1.4, F.cz);
      // what the roof and the floors were hung on, down in the room: joists and rafters burnt through, some still
      // leaning where one end held, the rest lying on one another in the ash
      b.box(1, 0.6, F.cz, F.w * 0.7, 0.22, 0.22, 'charred', { rz: 0.22, ry: 0.5, collide: false });
      b.box(-2, 0.3, F.cz + 1.4, F.w * 0.5, 0.2, 0.2, 'charred', { rz: -0.1, ry: -0.8, collide: false });
      b.box(3, 1.5, F.cz - 2, 0.2, 0.2, F.d * 0.8, 'charred', { rx: 0.36, ry: 0.3, collide: false });
      b.box(-5, 1.9, F.cz + 2, 0.18, 0.18, F.d * 0.6, 'charred', { rx: -0.5, ry: -0.2, collide: false });
      for (let k = 0; k < 5; k++) {
        // (a rafter with its head still on the back wall or the left one, its foot in the room)
        const len = rng.range(4.6, 6.4);
        const tip = rng.range(0.48, 0.66);
        const at = rng.range(-0.38, 0.38);
        const onBack = k % 2 === 0;
        const mid = (Math.cos(tip) * len) / 2;
        if (onBack) b.box(at * (F.w - 3), (Math.sin(tip) * len) / 2 + 0.1, F.back - 0.3 - mid, 0.2, 0.2, len, 'charred', { rx: -tip, ry: rng.range(-0.2, 0.2), collide: false });
        else b.box(F.L + 0.3 + mid, (Math.sin(tip) * len) / 2 + 0.1, F.cz + at * (F.d - 3), len, 0.2, 0.2, 'charred', { rz: tip, ry: rng.range(-0.2, 0.2), collide: false });
      }
      for (let k = 0; k < 6; k++) b.box(rng.range(F.L + 2, F.R - 2), 0.22 + rng.range(0, 0.25), rng.range(F.front + 2, F.back - 2), rng.range(2.2, 4.4), 0.16, 0.18, 'charred', { ry: rng.range(0, 3), rz: rng.range(-0.12, 0.12), collide: false });
      heap(b, F.L + 2.6, F.cz + 0.8, 1.5, 1.2, 0.42, { ash: true, ly: FLOOR_Y });
      heap(b, 5.4, F.cz + 3.3, 1.7, 1.3, 0.45, { ash: true, ly: FLOOR_Y });
      cont(b, CONT.CABINET, 'cabinet', F.L + 1.2, backZ(F, 0.55), 0);
      b.prop('bones', F.w / 4, F.cz + 1, 0.4, { nocollide: true, ly: FLOOR_Y });
      b.prop('skeleton', -F.w / 4, F.cz - 2, 2.2, { nocollide: true, ly: FLOOR_Y, seed: 0 });
      b.loot(0, F.cz, FLOOR_Y + 0.02);
      b.wreck('car_burnt', F.R - 2, F.back + 4, 0.2, { ly: PAVE, trunk: false });
    },
    // a lot nobody built on: a bus shelter on the street, dead trees, what was dumped there
    green(b, L) {
      b.prop('bus_shelter', -3, -L.d / 2 + 1.4, 0, { ly: PAVE });
      for (const [tx, tz] of [[-6, 2], [5, -3], [2, 6], [-4, 7]]) b.tree(tx + rng.range(-1, 1), tz + rng.range(-1, 1), rng.chance(0.5) ? 3 : 4, rng.range(0.8, 1.2));
      b.wreck(rng.chance(0.5) ? 'car_burnt' : 'car_wreck', 5.5, 3.5, rng.range(0, 6), { ly: PAVE, trunk: rng.chance(0.5) });
      b.cont(CONT.DUFFEL, -2.4, 3.4, { prop: 'duffel_bag', ry: 0.3, nocollide: true, ly: PAVE });
      b.prop('bones', 0.6, -1.4, 1, { nocollide: true, ly: PAVE });
      b.cont(CONT.CRATE, -6.5, -3.5, { prop: 'crate', ry: 0.3, ly: PAVE });
      b.loot(1.5, 0.5, PAVE + 0.02);
      extra(b, 'street_bench', 4, -L.d / 2 + 1.6, 0, { ly: PAVE });
      extra(b, 'street_bench', -7, 0, PI / 2, { ly: PAVE });
      extra(b, 'trash_bin', 2.2, -L.d / 2 + 1.3, 0, { ly: PAVE });
      b.prop('stroller', -1, 5, rng.range(0, 6), { nocollide: true, ly: PAVE });
      b.prop('bicycle', 7, -5, rng.range(0, 6), { nocollide: true, ly: PAVE, seed: rng.int(0, 1) });
      for (let k = 0; k < 16; k++) weed(b, rng.range(-9, 9), rng.range(-9, 9), rng.range(0.6, 1.4));
      signAt(b, -3, 1.5, -L.d / 2 + 2.06, 0, 0.8, 1.2, 'poster_b', {});
    },
    // a multi-storey car park: two decks on columns over a ground floor of cars, a wall to each deck, the stair tower
    carpark(b, L) {
      const F = frame(L, 38, 15);
      for (const cx of [-18.7, -9.4, 0, 9.4, 18.7]) for (const dz of [-7.2, 0, 7.2]) b.box(cx, PAVE, F.cz + dz, 0.5, CARPARK_DECK * 2 + 0.3, 0.5, 'concrete');
      for (const k of [1, 2]) {
        b.box(0, CARPARK_DECK * k, F.cz, F.w, 0.3, F.d, 'concrete');
        for (const z of [F.front + 0.1, F.back - 0.1]) b.box(0, CARPARK_DECK * k + 0.3, z, F.w, 0.95, 0.2, 'concrete');
        for (const x of [F.L + 0.1, F.R - 0.1]) b.box(x, CARPARK_DECK * k + 0.3, F.cz, 0.2, 0.95, F.d - 0.4, 'concrete');
        // rust down from every joint of it, the level's number on the wall
        for (let x = -15; x <= 15; x += 7.5) signAt(b, x + rng.range(-1, 1), CARPARK_DECK * k + 0.62, F.front - 0.02, 0, 0.7, 1.25, rng.chance(0.5) ? 'rust_a' : 'rust_b', { grime: true });
      }
      b.roofSpan(0, F.cz, F.w / 2, F.d / 2, CARPARK_DECK, 0.3);
      b.box(15.4, 0.2, F.cz - 3.4, 6, 0.3, 3.2, 'concrete', { rz: 0.32, collide: false }); // what is left of the ramp
      // the stair tower at its end, the sign on it
      b.box(F.R + 1.7, PAVE, F.cz + 4, 3, CARPARK_DECK * 2 + 3.2, 4.4, 'concrete');
      signAt(b, F.R + 1.7, CARPARK_DECK * 2 + 2.1, F.cz + 1.76, 0, 2.8, 0.7, 'parking', { far: true });
      for (let k = 0; k < 6; k++) {
        if (!rng.chance(0.55)) continue;
        const t = rng();
        b.wreck(t < 0.4 ? 'car_wreck' : t < 0.65 ? 'car_burnt' : t < 0.85 ? 'car_open' : 'pickup_truck', -16.2 + k * 4.7, F.cz + (k % 2 ? 3.6 : -3.6), rng.range(-0.12, 0.12), { ly: PAVE, trunk: rng.chance(0.5) });
      }
      // (...and those left on the decks: nobody is getting up to them)
      for (const k of [1, 2]) {
        for (let n = 0; n < 6; n++) {
          const t = rng();
          const here = rng.chance(0.5);
          const ry = rng.range(-0.1, 0.1) + (n % 2 ? PI : 0);
          if (here) b.prop(t < 0.5 ? 'car_wreck' : t < 0.8 ? 'car_burnt' : 'van_wreck', -15 + n * 5.8, F.cz + (n % 2 ? 3.4 : -3.4), ry, { ly: CARPARK_DECK * k + 0.3 });
        }
      }
      b.cont(CONT.DUFFEL, -4.7, F.cz, { prop: 'duffel_bag', ry: 0.9, nocollide: true, ly: PAVE });
      b.loot(4.7, F.cz, PAVE + 0.02);
      b.loot(-14, F.cz, PAVE + 0.02);
      yard(b, F, L);
    },
    // a whole block down: its floors lie one on another where it stood, a corner of it still stands seven floors
    // high and open on every room, over a field of rubble
    collapse(b, L) {
      const floors = rng.int(5, 8);
      block(b, -13, -12, 13, 12, PAVE, floors, 3, 'slab', 'concrete', { lost: rng.int(2, 3), open: 1, from: 1, wear: 1 });
      // its floors, pancaked: slabs one on another where the rest of it stood (solid: a heap to be climbed)
      for (let k = 0; k < 4; k++) solid(b, 6 + k * 0.5, PAVE + k * 0.42, -10 + k * 0.4, 18 - k * 2.2, 0.4, 12 - k * 1.6, 'concrete', { ry: 0.04 * (k - 1.5) });
      pancakes.push({ x: b.wx(6, -10), y: b.y0 + PAVE, z: b.wz(6, -10), ry: b.ry, w: 18, d: 12, n: 4, seed: rng.int(1, 99999) });
      heap(b, 7, 1.5, 4.4, 3.4, 2.0, { ry: rng.range(-0.4, 0.4) });
      heap(b, -13, 10.5, 3.8, 3.2, 1.8);
      heap(b, -3, 7, 3.0, 2.6, 1.4);
      heap(b, 14.5, 9.5, 3.2, 3.6, 1.5);
      // (what is left of its walls: lengths of the back and one side, storeys high and broken off)
      jagged(b, -20.4, 20.4, -6, 20.4, PAVE, 11, 'concrete', true, { inner: 'plaster' });
      jagged(b, 11, 20.4, 20, 20.4, PAVE, 8, 'concrete', true, { inner: 'plaster' });
      jagged(b, 20.4, 20.4, 20.4, 5.5, PAVE, 12, 'concrete', true, { inner: 'plaster' });
      jagged(b, -20.4, 0.5, -20.4, 6, PAVE, 6, 'concrete');
      // (floors of it lying where they came down, tipped every way)
      for (let k = 0; k < 7; k++) b.box(rng.range(-16, 16), PAVE + rng.range(0.3, 1.2), rng.range(0, 17), rng.range(4, 7), 0.32, rng.range(3, 6), 'concrete', { rz: rng.range(-0.34, 0.34), rx: rng.range(-0.22, 0.22), ry: rng.range(0, 3), collide: false });
      for (let k = 0; k < 7; k++) skirt(b, rng.range(-18, 18), rng.range(-3, 18));
      for (const [px, pz] of [[12, 0], [-14, 4], [4, 12], [17, -4], [-4, -3]]) b.prop('debris', px, pz, rng.range(0, 6), { nocollide: true, ly: PAVE, seed: px & 3 });
      smoke(b, 4, 3, -8);
      for (let k = 0; k < 14; k++) weed(b, rng.range(-19, 19), rng.range(-4, 19), rng.range(0.7, 1.4));
      for (const [tx, tz] of [[10.5, 15], [-8, 15.5]]) b.tree(tx, tz, 5, rng.range(0.5, 0.8));
      streetPile(b, L, rng.range(-6, 6));
      b.cont(CONT.DUFFEL, 16.4, 3, { prop: 'duffel_bag', ry: 0.5, nocollide: true, ly: PAVE });
      b.cont(CONT.CRATE, 6, 16.6, { prop: 'crate', ry: 0.2, ly: PAVE });
      b.cont(CONT.AMMO_BOX, -17, 2, { prop: 'military_crate', ry: 0.4, ly: PAVE });
      b.prop('corpse', 3, -2.2, 2, { nocollide: true, ly: PAVE });
      b.prop('skeleton', -8, 3, 0.4, { nocollide: true, ly: PAVE });
      b.loot(12.5, 5.5, PAVE + 0.02);
      b.loot(-17.5, 6, PAVE + 0.02);
      for (const [tx, tz] of [[17, -17], [-17, 17]]) b.tree(tx, tz, 4, rng.range(0.9, 1.2));
    },
    // the bus depot: a roof on posts over the buses that never went out, and the dispatcher's office
    depot(b, L) {
      b.shelter(-4, -4, 30, 16, 5.4, 'tin', 'metal');
      for (const px of [-9.5, -2, 6]) for (const pz of [-11.8, 3.8]) b.cyl(px, PAVE, pz, 0.14, 5.4 - PAVE, 'metal', { sides: 6 });
      // (the roof's edge beam, the board on it)
      b.box(-4, 4.9, -12.1, 30.4, 0.6, 0.2, 'rust', { collide: false });
      signAt(b, -4, 5.2, -12.24, 0, 7.2, 1.8, 'depot', { far: true });
      b.wreck('city_bus', -13, -4, 0.04, { ly: PAVE, trunk: false });
      b.wreck('city_bus', -8.6, -4.4, PI - 0.03, { ly: PAVE, trunk: false, seed: 1 });
      b.wreck('school_bus', -3.4, -4.6, 0.1, { ly: PAVE, trunk: false });
      b.wreck('ambulance', 3.4, -3, 0.1, { ly: PAVE, trunk: false });
      const R = groundRoom(b, 14, 12, 10, 8, 3.2, 'brick', { n: [door(5, 1.3), win(2, 1.4), win(8, 1.4)], w: [win(4, 1.4)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true });
      void R;
      b.cont(CONT.LOCKER, 18.56, 13, { prop: 'locker', ry: -PI / 2, ly: FLOOR_Y });
      b.cont(CONT.CABINET, 11, 15.5, { prop: 'cabinet', ry: PI, ly: FLOOR_Y });
      b.cont(CONT.TOOLBOX, 15.5, 14.6, { prop: 'toolbox', ry: 0.6, nocollide: true, ly: FLOOR_Y });
      extra(b, 'office_desk', 14, 10.4, PI, inside);
      b.loot(14, 9.2, FLOOR_Y + 0.02);
      b.prop('office_chair', 14.4, 11.6, 1, { nocollide: true, ly: FLOOR_Y });
      b.prop('paper_scatter', 12.6, 12.6, 2, { nocollide: true, ly: FLOOR_Y });
      b.prop('gas_pump', 9, -15, 0, { ly: PAVE });
      b.prop('tire_pile', -17, 12, 0, { ly: PAVE });
      b.cont(CONT.DUMPSTER, -10, 16, { prop: 'dumpster', ry: PI, ly: PAVE });
      b.cont(CONT.CRATE, 2, 12, { prop: 'crate', ry: 0.2, ly: PAVE });
      b.prop('corpse', 6, 6, 1.2, { nocollide: true, ly: PAVE });
      b.loot(-2, 10, PAVE + 0.02);
      b.loot(10, -8, PAVE + 0.02);
      extra(b, 'street_bench', -16, 16.5, PI, { ly: PAVE });
      for (let k = 0; k < 5; k++) b.prop(['litter', 'suitcases', 'paper_scatter', 'glass_shards', 'traffic_cones'][k], rng.range(-18, 18), rng.range(6, 18), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: k });
      for (let k = 0; k < 12; k++) weed(b, rng.range(-20, 20), rng.range(5, 20), rng.range(0.6, 1.3));
    },
    // CALDER GENERAL: at the back of its block, four floors over an emergency room that can be walked into - the
    // wards behind it, the pharmacy between them. Out front: the canopy with its sign, the ambulances that came in
    // last, and the tents the wards overflowed into, cots and the dead in rows between them.
    hospital(b, L) {
      const F = { w: 34, d: 14, cz: 12, front: 5, back: 19, L: -17, R: 17 };
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 4, 'concrete', { n: [gap(17, 4, 3), cw(5, 3, 0.8, 3), cw(29, 3, 0.8, 3), cw(10.5, 2.2, 0.8, 3), cw(23.5, 2.2, 0.8, 3)], s: [door(4, 1.2), door(30, 1.2)], e: [cw(4, 1.6)], w: [door(12.4, 1.3)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true, tint: 2 });
      partition(b, R, F.L, 13.5, F.R, 13.5, 4, 'concrete', [door(5, 1.3), door(17, 1.6), door(29, 1.3)]);
      for (const wx of [-6, 6]) partition(b, R, wx, 13.5, wx, F.back, 4, 'concrete');
      // (the hall is three rooms: triage on the left of the way in, where the beds were wheeled, the waiting room
      // on its right - each behind a wall that stops short of the corridor along the wards' doors - and between
      // them the desk)
      for (const wx of [-7.6, 10.6]) partition(b, R, wx, F.front, wx, 11.3, 4, 'concrete');
      zone(R, F.L, F.front, -7.6, 13.5, 4);
      zone(R, 10.6, F.front, F.R, 13.5, 1);
      zone(R, F.L, 13.5, -6, F.back, 0);
      zone(R, -6, 13.5, 6, F.back, 5);
      zone(R, 6, 13.5, F.R, F.back, 0);
      // the hall: the desk, the rows of seats, beds wheeled in wherever there was floor
      b.prop('reception_desk', 6.6, 9.4, 0, inside);
      b.loot(6.6, 9.4, FLOOR_Y + 1.14);
      for (const sx of [-13.6, -11.6, 12.6]) extra(b, 'waiting_chairs', sx, F.front + WALL + 0.34, PI, inside);
      extra(b, 'waiting_chairs', 10.6 + 0.09 + 0.06 + 0.32, 8.4, -PI / 2, inside);
      extra(b, 'waiting_chairs', rightX(F, 0.6), 10.6, PI / 2, { ly: FLOOR_Y, seed: 1 });
      drumFire(b, 3.2, 6.4); // (the one light in the place: a drum somebody kept burning by the way in)
      b.prop('hospital_bed', -14.6, 9.2, PI / 2, { ly: FLOOR_Y, seed: 1 });
      b.prop('hospital_bed', -14.6, 11.8, PI / 2, { ly: FLOOR_Y, seed: 2 });
      extra(b, 'hospital_bed', -9.6, 11.4, PI / 2 + 0.3, { ly: FLOOR_Y, seed: 0 });
      b.prop('privacy_curtain', -13.6, 10.5, 0, { nocollide: true, ly: FLOOR_Y });
      extra(b, 'gurney', -3.4, 8.2, 0.5, inside);
      extra(b, 'gurney', 2.6, 11.4, -1.2, { ly: FLOOR_Y, seed: 1 });
      extra(b, 'medical_cart', -11.2, 7.2, 0.4, inside);
      b.prop('iv_stand', -12.6, 11.9, 0, { nocollide: true, ly: FLOOR_Y });
      b.prop('iv_stand', -1.4, 9.6, 1, { nocollide: true, ly: FLOOR_Y, seed: 1 });
      b.prop('wheelchair', -6, 7, 0.8, { nocollide: true, ly: FLOOR_Y });
      b.prop('wheelchair', 12.6, 11.6, 2.6, { nocollide: true, ly: FLOOR_Y });
      b.prop('barricade', 6.2, 12.6, 0.05, inside); // (between the doors of the wards and the pharmacy)
      b.prop('blood_pool', -2, 7.4, 1, { nocollide: true, ly: FLOOR_Y, seed: 1 });
      b.prop('blood_pool', 9, 11.4, 2, { nocollide: true, ly: FLOOR_Y, seed: 2 });
      stairBlock(b, F.R - 1.5, F.front + 1.1);
      // the wards: beds along the back wall, screens between them
      for (const sx of [-1, 1]) {
        b.prop('hospital_bed', sx * 15, F.back - WALL - 1.1, 0, { ly: FLOOR_Y, seed: 2 });
        b.prop('hospital_bed', sx * 11.4, F.back - WALL - 1.1, 0, { ly: FLOOR_Y, seed: sx > 0 ? 1 : 0 });
        extra(b, 'hospital_bed', sx * 7.8, F.back - WALL - 1.1, 0, { ly: FLOOR_Y, seed: 0 });
        b.prop('privacy_curtain', sx * 13.2, F.back - 1.6, PI / 2, { nocollide: true, ly: FLOOR_Y, seed: sx > 0 ? 1 : 0 });
        b.prop('body_bag', sx * 9.6, 14.6, PI / 2, { nocollide: true, ly: FLOOR_Y });
        b.prop('iv_stand', sx * 16.2, 16, 0, { nocollide: true, ly: FLOOR_Y, seed: 1 });
        b.loot(sx * 7, 15.2, FLOOR_Y + 0.02);
      }
      cont(b, CONT.MEDICINE, 'medicine_cabinet', leftX(F, 0.45), 15.4, -PI / 2);
      cont(b, CONT.LOCKER, 'locker', rightX(F, 0.5), 15.4, PI / 2);
      // the pharmacy
      for (const dx of [-4.2, -3.0]) cont(b, CONT.MEDICINE, 'medicine_cabinet', dx, backZ(F, 0.45), 0, { seed: dx | 0 });
      cont(b, CONT.DRUG_LOCKER, 'drug_locker', 4, backZ(F, 0.6), 0);
      cont(b, CONT.CABINET, 'cabinet', 0.6, backZ(F, 0.55), 0);
      b.prop('stock_spill', 1.6, 15.8, 1, { nocollide: true, ly: FLOOR_Y, seed: 1 });
      b.loot(-1.4, 15.4, FLOOR_Y + 0.02);
      mess(b, F, 20, 4, R);
      const floors = 4;
      block(b, 0, F.cz, F.w, F.d, 4.3, floors, 3.2, 'office', 'concrete', { lost: rng.int(0, 1), open: rng.chance(0.5) ? 1 : 0, from: 2, wear: 0.7 });
      // its name across the front, over the ground floor; a cross at either end of it
      signAt(b, 0, 5.3, F.front - 0.36, 0, 14.4, 1.8, 'hospital', { far: true, back: 0.1 });
      for (const sx of [-10, 10]) signAt(b, sx, 5.3, F.front - 0.34, 0, 1.7, 1.7, 'redcross', { far: true });
      // the canopy over the door: a slab on four posts out over the drive, EMERGENCY on its edge
      for (const px of [-4.6, 4.6]) for (const pz of [-1.6, 2.4]) b.cyl(px, PAVE, pz, 0.18, 3.5, 'metal', { sides: 8 });
      b.box(0, 3.6, 1.4, 10.4, 0.34, 7.2, 'concrete', { collide: false });
      b.box(0, 3.4, -2.2, 10.4, 1.3, 0.3, 'metal', { collide: false });
      b.roofSpan(0, 1.4, 5.2, 3.6, 3.6, 0.34);
      signAt(b, 0, 4.05, -2.37, 0, 5.2, 1.3, 'emergency', { far: true });
      b.wreck('ambulance', -7.6, 1.2, 0.12, { ly: PAVE, trunk: false });
      b.wreck('ambulance', 7.8, -0.4, PI + 0.3, { ly: PAVE, trunk: false, seed: 1 });
      b.prop('gurney', 3.2, 0.6, 0.3, { ly: PAVE, seed: 1 });
      // the forecourt: tents either side of the way in, the dead laid out by the kerb, the army's lamp over it all
      for (const [tx, sd] of [[-15.4, 0], [-9.4, 1], [10, 0], [15.6, 1]]) {
        b.prop('triage_tent', tx, -11.4, 0, { ly: PAVE, seed: sd });
        b.prop('field_cot', tx - 1.2, -12.6, 0, { ly: PAVE, seed: (tx & 1) + 1 });
        b.prop('field_cot', tx + 1.2, -10, PI, { ly: PAVE, seed: sd });
        b.prop('iv_stand', tx + 0.3, -12.4, 0, { nocollide: true, ly: PAVE, seed: sd });
      }
      for (let i = 0; i < 7; i++) b.prop('body_bag', -5.4 + i * 1.3, -18.6, PI / 2 + 0.1 * Math.sin(i * 2.1), { nocollide: true, ly: PAVE, seed: i });
      for (let i = 0; i < 4; i++) b.prop('body_bag', -3.8 + i * 1.3, -16.4, PI / 2 - 0.06 * i, { nocollide: true, ly: PAVE, seed: i + 2 });
      b.prop('floodlight_tower', 19, -18.6, 0.6, { ly: PAVE });
      b.prop('checkpoint_sign', 3.4, -19.6, 0, { ly: PAVE });
      b.prop('sandbags', -4.4, -4.6, 0, { ly: PAVE });
      b.prop('sandbags', 4.6, -4.8, 0.1, { ly: PAVE, seed: 1 });
      b.prop('suitcases', 2.4, -7, 0.4, { nocollide: true, ly: PAVE });
      b.prop('wheelchair', -2.4, -6.2, 2, { nocollide: true, ly: PAVE });
      b.prop('stroller', 5.4, -14.4, 1, { nocollide: true, ly: PAVE });
      for (let k = 0; k < 6; k++) b.prop(['litter', 'paper_scatter', 'blood_pool', 'skeleton', 'litter', 'glass_shards'][k], rng.range(-18, 18), rng.range(-19, -4), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: k });
      // down its sides: the generator, what was thrown out
      b.prop('generator', 19.3, 10, PI / 2, { ly: PAVE });
      b.cont(CONT.DUMPSTER, -19.5, 14, { prop: 'dumpster', ry: PI / 2, ly: PAVE });
      b.cont(CONT.DUFFEL, -12.4, -8.4, { prop: 'duffel_bag', ry: 0.4, nocollide: true, ly: PAVE });
      b.cont(CONT.CRATE, 13.6, -5.4, { prop: 'crate', ry: 0.3, ly: PAVE });
      b.prop('barrel', -18.6, -4, 0, { ly: PAVE });
      b.light(-18.6, PAVE + 1.0, -4, 'embers');
      for (const [tx, tz] of [[-19.4, 3], [19.6, 2]]) b.tree(tx, tz, 3, rng.range(0.7, 1.1));
      for (let k = 0; k < 14; k++) weed(b, rng.range(-20, 20), rng.range(-20, 4), rng.range(0.6, 1.3));
      b.loot(8, -6, PAVE + 0.02);
      landmarks.push({ x: b.wx(0, F.cz), z: b.wz(0, F.cz), name: 'Calder General' });
    },
    // ST. BRENDAN'S: a stone church on a corner lot - a nave under a steep roof, a tower at its door with a spire,
    // coloured glass in what is left of its windows, its yard gone to weed
    // Port Calder's town hall on the square: two storeys of stone over its hall, which is walked into from the
    // square up its steps; a clock tower over the door
    // (b's base is HALL_UP over the square: the hall stands on a plinth of its own, its portico up steps)
    hall(b, L) {
      const F = frame(L, 30, 16);
      // the plinth it stands on, a course of dressed stone round its foot, and out in front of it the portico's floor
      const foot = PAVE - HALL_UP;
      b.box(0, foot, F.cz, F.w + 1.0, -foot, F.d + 1.0, 'stone');
      b.box(0, foot, F.front - 1.9, 17.2, -foot, 3.8, 'stone');
      // the steps up to it, the whole width of the portico (each lower one runs further out: under a step's height)
      // (each down into the paving, so that none is a thin slab over the ground: server/nav.js takes those for decks)
      for (let i = 1; i <= 2; i++) b.box(0, foot - 0.3, F.front - 3.8 - (3 - i) * 0.25 + 0.15, 17.2 + (2 - i) * 0.6, i * (-foot / 3) + 0.3, (3 - i) * 0.5 + 0.3, 'stone');
      // ...and at the back door, a flight of its own
      for (let i = 1; i <= 2; i++) b.box(0, foot - 0.3, F.back + 0.5 + (3 - i) * 0.25 - 0.15, 3.4, i * (-foot / 3) + 0.3, (3 - i) * 0.5 + 0.3, 'stone');
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 4.4, 'stone', { n: [door(F.w / 2, 2.2), win(F.w * 0.18, 1.6, 1.3, 2.4), win(F.w * 0.36, 1.6, 1.3, 2.4), win(F.w * 0.64, 1.6, 1.3, 2.4), win(F.w * 0.82, 1.6, 1.3, 2.4)], s: [door(F.w / 2, 1.2)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true, tint: 3 });
      block(b, 0, F.cz, F.w, F.d, 4.7, 2, 3.6, 'stone', 'stone', { lost: 0, wear: 0.4 });
      // A civic face: the portico - six columns the height of both storeys on their bases with their capitals, the
      // entablature over them and a pediment - quoins up the corners, a string course over the hall, a deep cornice
      const top = 4.7 + 2 * 3.6;
      const pz = F.front - 3.2; // (the columns' line, at the front of the portico's floor)
      for (const px of [-8, -5, -2, 2, 5, 8]) { // (wide apart at the door: the way in between them)
        b.box(px, 0, pz, 1.1, 0.45, 1.1, 'stone');
        b.cyl(px, 0.45, pz, 0.42, top - 1.35, 'stone', { sides: 12 });
        b.box(px, top - 0.9, pz, 1.15, 0.5, 1.15, 'stone', { collide: false });
      }
      b.box(0, top - 0.4, (pz + F.front) / 2, 17.4, 1.1, F.front - pz + 1.4, 'stone', { collide: false });
      b.box(0, top + 0.7, (pz + F.front) / 2 - 0.1, 18.0, 0.3, F.front - pz + 1.8, 'stone', { collide: false });
      b.prism(0, top + 1.0, (pz + F.front) / 2, 17.6, 2.7, F.front - pz + 1.4, 'stone');
      b.box(0, top + 1.0, pz - 0.75, 18.2, 0.22, 0.4, 'stone', { collide: false }); // (the pediment's raking foot)
      b.box(0, top - 0.25, F.front - 0.25, F.w + 1.2, 0.75, 0.9, 'stone', { collide: false }); // the cornice
      b.box(0, 4.55, F.front - 0.12, F.w + 0.5, 0.3, 0.5, 'stone', { collide: false }); // the string course
      for (const sx of [-1, 1]) for (let q = 0; q < 9; q++) b.box(sx * (F.w / 2 - 0.25 + (q % 2) * 0.12), 0.2 + q * 1.3, F.front - 0.08, 0.9 + (q % 2) * 0.35, 0.95, 0.4, 'stone', { collide: false });
      // the clock tower over the door: its shaft, a cornice, the clock's four faces, the belfry with its arches, a dome
      const tz = F.front + 3.2;
      b.box(0, top, tz, 5, 7, 5, 'stone', { collide: false });
      b.box(0, top + 7, tz, 5.8, 0.45, 5.8, 'stone', { collide: false });
      for (const [fx, fz, fry] of [[0, -2.53, 0], [0, 2.53, PI], [-2.53, 0, PI / 2], [2.53, 0, -PI / 2]]) {
        // (a disc's axis turned to the face: about X for the front and back, about Z for the sides)
        const turn = fx ? { rz: PI / 2 } : { rx: PI / 2 };
        b.cyl(fx, top + 4.55, tz + fz, 1.5, 0.12, 'trim', { ...turn, sides: 20 });
        b.cyl(fx * 1.02, top + 4.55, tz + fz * 1.02, 1.3, 0.12, 'roadpaint', { ...turn, sides: 20 });
        // the hands, stopped at twenty past nine: each from the middle out (a hand at angle a from twelve, in the face)
        const [ox, oz] = [fx * 1.045, fz * 1.045];
        for (const [a, len, w] of [[-1.25, 0.95, 0.1], [2.1, 0.7, 0.13]]) {
          const [dx, dz, dy] = [-Math.sin(a) * Math.cos(fry) * (len / 2), Math.sin(a) * Math.sin(fry) * (len / 2), Math.cos(a) * (len / 2)];
          b.box(ox + dx, top + 4.61 + dy - len / 2, tz + oz + dz, w, len, 0.04, 'dark', { ry: fry, rz: a, collide: false });
        }
      }
      b.box(0, top + 7.45, tz, 3.6, 3.4, 3.6, 'stone', { collide: false });
      for (const [fx, fz, w, d] of [[0, -1.82, 1.5, 0.06], [0, 1.82, 1.5, 0.06], [-1.82, 0, 0.06, 1.5], [1.82, 0, 0.06, 1.5]]) b.box(fx, top + 8.0, tz + fz, w, 2.3, d, 'dark', { collide: false });
      b.box(0, top + 10.85, tz, 4.2, 0.35, 4.2, 'stone', { collide: false });
      b.cone(0, top + 11.2, tz, 2.3, 3.2, 'tin_rust', 8, { ry: PI / 8 });
      b.box(0, top + 14.4, tz, 0.1, 1.4, 0.1, 'rust', { collide: false });
      // inside: the counter, the records, the benches of the hall, what was left
      b.prop('reception_desk', 0, F.cz - 2.2, 0, inside);
      b.loot(0, F.cz - 2.2, FLOOR_Y + 1.14);
      cont(b, CONT.CABINET, 'cabinet', rightX(F, 0.55), F.cz, PI / 2);
      cont(b, CONT.CABINET, 'cabinet', leftX(F, 0.55), F.cz + 2, -PI / 2, { seed: 1 });
      for (const dx of [-8, -4, 4, 8]) b.prop('waiting_chairs', dx, F.cz + 3.4, 0, inside);
      b.prop('skeleton', 3, F.cz + 1, 1.2, { nocollide: true, ly: FLOOR_Y, seed: 1 });
      b.loot(-9, F.cz - 3.4, FLOOR_Y + 0.02);
      mess(b, F, 10, 4.4, R);
      landmarks.push({ x: b.wx(0, F.cz), z: b.wz(0, F.cz), name: 'Port Calder Town Hall' });
    },
    church(b, L, name = "St. Brendan's") {
      const F = frame(L, 9.6, 14);
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 5.4, 'stone', { n: [door(4.8, 1.6)], s: [door(7.6, 1.1)] }, { roof: 'gable', roofH: 3.9, roofMat: 'shingles', floorMat: 'planks', tint: 3 });
      R.ceiling = 'plaster'; // (a plastered ceiling over the nave: the roof's own inside is nothing to look up into)
      // the tower: over the door, a belfry with its louvres, a spire, a cross
      b.box(0, 5.4, F.front + 1.5, 3.3, 6.6, 3.3, 'stone', { collide: false });
      b.box(0, 12, F.front + 1.5, 3.7, 0.3, 3.7, 'stone', { collide: false });
      for (const [dx, dz, w, d] of [[0, -1.66, 1.2, 0.04], [0, 1.66, 1.2, 0.04], [-1.66, 0, 0.04, 1.2], [1.66, 0, 0.04, 1.2]]) b.box(dx, 9.4, F.front + 1.5 + dz, w, 1.9, d, 'dark', { collide: false });
      b.cone(0, 12.3, F.front + 1.5, 2.45, 7.2, 'shingles', 4);
      b.box(0, 19.4, F.front + 1.5, 0.12, 1.6, 0.12, 'trim', { collide: false });
      b.box(0, 20.3, F.front + 1.5, 0.84, 0.12, 0.12, 'trim', { collide: false });
      // buttresses down both sides, and between them the windows: lead and coloured glass, panes of it gone
      for (const sx of [-1, 1]) {
        for (const dz of [-6.6, -2.2, 2.2, 6.6]) b.box(sx * (F.w / 2 + 0.3), 0, F.cz + dz, 0.6, 3.6, 0.7, 'stone');
        for (const [dz, c] of [[-4.4, 'stained_a'], [0, 'stained_b'], [4.4, 'stained_a']]) {
          signAt(b, sx * (F.w / 2 + 0.14), 2.9, F.cz + dz, sx > 0 ? -PI / 2 : PI / 2, 1.25, 2.5, c, { far: true });
          signAt(b, sx * (F.w / 2 - 0.14), 2.9, F.cz + dz, sx > 0 ? PI / 2 : -PI / 2, 1.25, 2.5, c, {});
          b.box(sx * (F.w / 2 + 0.16), 1.5, F.cz + dz, 0.12, 0.14, 1.6, 'stone', { collide: false });
        }
      }
      signAt(b, 0, 8.0, F.front - 0.17, 0, 1.3, 2.6, 'stained_b', { far: true });
      for (let r = 0; r < 3; r++) {
        b.prop('pew', -2.3, F.cz - 3.2 + r * 2.2, r === 1 ? 0.2 : 0, inside);
        b.prop('pew', 2.3, F.cz - 3.2 + r * 2.2, 0, inside);
      }
      b.prop('altar', -0.4, F.back - 1.6, 0, inside);
      b.loot(-0.4, F.back - 1.6, FLOOR_Y + 1.02);
      cont(b, CONT.CABINET, 'cabinet', F.L + 4.2, backZ(F, 0.55), 0); // (clear of the vestry door)
      b.cont(CONT.DUFFEL, 3.4, F.cz - 5, { prop: 'duffel_bag', ry: 1.1, nocollide: true, ly: FLOOR_Y });
      // those who came here at the end: in the pews, on the floor before the altar
      b.prop('skeleton', -2.3, F.cz - 3.0, PI, { nocollide: true, ly: FLOOR_Y + 0.42, seed: 1 });
      b.prop('skeleton', 2.6, F.cz + 1.3, PI, { nocollide: true, ly: FLOOR_Y + 0.42, seed: 1 });
      b.prop('skeleton', 0.6, F.back - 3.4, 0.5, { nocollide: true, ly: FLOOR_Y, seed: 2 });
      b.prop('blood_pool', 0, F.cz - 1, 1, { nocollide: true, ly: FLOOR_Y });
      b.prop('ceiling_debris', 1.5, F.cz + 3.6, 2, { nocollide: true, ly: FLOOR_Y, seed: 1 });
      for (const [gx, gz, sd] of [[7.4, -5, 0], [8.6, -1.6, 1], [7.2, 2, 2], [-7.6, -3, 1], [-8.4, 1.4, 0], [7.8, 5.4, 1], [-7.4, 5, 2]]) b.prop('grave_cross', gx, gz, rng.range(-0.3, 0.3), { ly: PAVE, seed: sd });
      b.tree(-7.4, 7.6, 3, 1.1);
      b.tree(7.8, 8.2, 4, 0.9);
      b.prop('ivy', F.R + 0.04, F.cz + 2.2, -PI / 2, { nocollide: true, ly: PAVE });
      for (let k = 0; k < 14; k++) weed(b, rng.range(-9, 9) < 0 ? rng.range(-9.2, -5.8) : rng.range(5.8, 9.2), rng.range(-8, 9), rng.range(0.7, 1.3));
      frontage(b, L, F);
      // its board by the gate
      b.cyl(-7, PAVE, -L.d / 2 + 1.2, 0.07, 1.9, 'rust', { sides: 6 });
      signAt(b, -6.2, 1.5, -L.d / 2 + 1.14, 0, 1.9, 0.48, 'church', { back: 0.05 });
      landmarks.push({ x: b.wx(0, F.cz), z: b.wz(0, F.cz), name });
    },
    // a filling station: pumps under a canopy on the street with the name on its edge, the kiosk behind them, the
    // board of prices on its pole at the corner
    gas(b, L) {
      const R = groundRoom(b, 0, 5.5, 10, 6, 3.2, 'brick', { n: [door(5, 1.4), cw(2, 2.4, 0.9, 2.4), cw(8, 2.4, 0.9, 2.4)], e: [door(3, 1.1)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true });
      void R;
      b.prop('checkout_counter', -2.6, 4.6, 0, inside);
      b.loot(-2.6, 4.6, FLOOR_Y + 0.98);
      b.cont(CONT.SHELF, -2.8, 8.065, { prop: 'shelf', ry: PI, ly: FLOOR_Y });
      b.cont(CONT.SHELF, 0.2, 8.065, { prop: 'shelf', ry: PI, ly: FLOOR_Y, seed: 1 });
      b.cont(CONT.FRIDGE, 3, 7.955, { prop: 'fridge', ry: PI, ly: FLOOR_Y });
      b.prop('stock_spill', 1.4, 5.4, 1, { nocollide: true, ly: FLOOR_Y });
      b.prop('ceiling_lamp', 0, 5.5, 0, { nocollide: true, ly: 3.2, seed: 1 });
      for (const px of [-4.2, 4.2]) for (const pz of [-2.4, -6.6]) b.cyl(px, PAVE, pz, 0.18, 4.3, 'metal', { sides: 8 });
      b.box(0, 4.3, -4.5, 10.8, 0.95, 6.8, 'metal', { collide: false });
      b.roofSpan(0, -4.5, 5.4, 3.4, 4.3, 0.95);
      signAt(b, 0, 4.78, -7.92, 0, 3.6, 0.9, 'gas', { far: true });
      signAt(b, -5.42, 4.78, -4.5, PI / 2, 3.6, 0.9, 'gas', { far: true });
      signAt(b, 5.42, 4.78, -4.5, -PI / 2, 3.6, 0.9, 'gas', { far: true });
      b.box(0, PAVE, -4.5, 5.2, 0.16, 1.3, 'concrete'); // the island the pumps stand on
      b.prop('gas_pump', -1.7, -4.5, 0, { ly: PAVE + 0.16 });
      b.prop('gas_pump', 1.7, -4.5, 0, { ly: PAVE + 0.16, seed: 1 });
      b.wreck('car_burnt', 7.2, -4.2, 0.1, { ly: PAVE, trunk: false });
      b.wreck('car_open', -7.4, -3.6, PI - 0.15, { ly: PAVE });
      b.cont(CONT.DUMPSTER, -7.4, 6.6, { prop: 'dumpster', ry: PI / 2, ly: PAVE });
      b.prop('tire_pile', 8, 5, 0, { ly: PAVE });
      b.prop('litter', 0, -1, 1, { nocollide: true, ly: PAVE });
      b.prop('traffic_cones', 3.6, -7.2, 1, { nocollide: true, ly: PAVE });
      // the prices, on a pole
      b.cyl(-8.6, PAVE, -8.6, 0.13, 3.4, 'rust', { sides: 6 });
      signAt(b, -8.6, 4.8, -8.72, 0.25, 1.4, 2.8, 'gasprice', { far: true, back: 0.2, two: true });
      for (let k = 0; k < 8; k++) weed(b, rng.range(-9, 9), rng.range(8.9, 9.4), rng.range(0.7, 1.2));
      frontage(b, L, null, true);
    },
    // THE RIALTO: a picture house - the lobby on the street under its marquee, the hall behind it, the screen still up
    cinema(b, L) {
      const F = frame(L, 30, 15);
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 7, 'brick', { n: [gap(15, 5, 3)], s: [door(3, 1.2), door(27, 1.2)], w: [door(11, 1.2)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'planks', tint: 4 });
      partition(b, R, F.L, F.front + 4.6, F.R, F.front + 4.6, 7, 'brick', [door(8, 1.6), door(22, 1.6)]);
      R.ceiling = 'plaster';
      // its front: piers the height of it, a stepped head over the middle, a course under the parapet
      for (const px of [-14.6, -9.4, -4.2, 4.2, 9.4, 14.6]) b.box(px, PAVE, F.front - 0.2, 0.7, 7.5, 0.3, 'brick', { collide: false });
      b.box(0, 7.3, F.front + 0.1, 11, 1.5, 0.5, 'brick', { collide: false });
      b.box(0, 8.8, F.front + 0.1, 5.4, 0.9, 0.5, 'brick', { collide: false });
      b.box(0, 6.7, F.front - 0.24, 30.4, 0.3, 0.3, 'concrete', { collide: false });
      // the marquee: a box out over the pavement, the letters that are left on it; the name down a blade above it
      b.box(0, 3.3, F.front - 1.45, 6.6, 1.7, 2.6, 'metal', { collide: false });
      signAt(b, 0, 4.15, F.front - 2.77, 0, 6.2, 1.55, 'marquee', { far: true });
      signAt(b, -3.32, 4.15, F.front - 1.45, PI / 2, 2.4, 0.6, 'marquee', {});
      signAt(b, 3.32, 4.15, F.front - 1.45, -PI / 2, 2.4, 0.6, 'marquee', {});
      signAt(b, 0, 7.6, F.front - 0.9, PI / 2, 1.25, 5.0, 'rialto', { far: true, back: 0.3, two: true });
      // what was showing, in its cases either side of the doors
      for (const [px, c] of [[-6.8, 'poster_a'], [-5.2, 'poster_c'], [5.2, 'poster_b'], [6.8, 'poster_d']]) signAt(b, px, 1.75, F.front - 0.14, 0, 1.0, 1.5, c, {});
      b.prop('checkout_counter', -9, F.front + 2.6, 0, inside); // the box office
      b.loot(-9, F.front + 2.6, FLOOR_Y + 0.98);
      cont(b, CONT.FRIDGE, 'fridge', rightX(F, 0.72), F.front + 2.2, PI / 2);
      cont(b, CONT.CABINET, 'cabinet', leftX(F, 0.55), F.front + 2, -PI / 2);
      extra(b, 'vending_machine', 9.4, F.front + 4.6 - 0.09 - WALL - 0.4, 0, inside);
      extra(b, 'vending_machine', 10.6, F.front + 4.6 - 0.09 - WALL - 0.4, 0, { ly: FLOOR_Y, seed: 1 });
      b.prop('litter', 3, F.front + 2.4, 1, { nocollide: true, ly: FLOOR_Y });
      b.prop('stock_spill', -5, F.front + 2.2, 2, { nocollide: true, ly: FLOOR_Y });
      // the hall: rows of seats facing the screen
      for (let r = 0; r < 3; r++) for (const px of [-11, -8.6, -6.2, -3.8, 3.8, 6.2, 8.6, 11]) if ((r * 7 + ((px * 10) | 0)) % 5) b.prop('cinema_seats', px, F.front + 6.9 + r * 2.1, PI + rng.range(-0.03, 0.03), { ly: FLOOR_Y, seed: r });
      b.box(-2, 1.6, F.back - 0.5, 16, 4.6, 0.12, 'clapboard', { collide: false }); // the screen, a corner of it torn down
      b.box(7.4, 2.2, F.back - 0.6, 3.4, 3.4, 0.1, 'clapboard', { rz: -0.5, collide: false });
      b.cont(CONT.DUFFEL, 0, F.front + 8.2, { prop: 'duffel_bag', ry: 0.6, nocollide: true, ly: FLOOR_Y });
      b.cont(CONT.DUFFEL, -12.6, F.back - 1.6, { prop: 'duffel_bag', ry: 2, nocollide: true, ly: FLOOR_Y, seed: 1 });
      b.prop('corpse', 0.4, F.front + 11.4, 1, { nocollide: true, ly: FLOOR_Y });
      b.prop('skeleton', -8.6, F.front + 8.9, 0, { nocollide: true, ly: FLOOR_Y + 0.4, seed: 1 });
      b.loot(12.6, F.back - 1.6, FLOOR_Y + 0.02);
      b.loot(0, F.back - 2, FLOOR_Y + 0.02);
      mess(b, F, 14);
      b.prop('fallen_sign', 4, F.front - 0.9, 0.2, { nocollide: true, ly: PAVE });
      b.wreck('car_wreck', 18.4, F.cz + 1, 0.05, { ly: PAVE });
      b.cont(CONT.DUMPSTER, -18.2, F.cz + 3, { prop: 'dumpster', ry: PI / 2, ly: PAVE });
      yard(b, F, L);
      landmarks.push({ x: b.wx(0, F.cz), z: b.wz(0, F.cz), name: landmarks.some((m) => m.name === 'The Rialto') ? 'The Orpheum' : 'The Rialto' });
    },
    // HARBOUR STREET STATION: the way down to the trains, shut and fallen in, on a square of its own
    subway(b, L) {
      b.prop('subway_entrance', 0, -3, 0, { ly: PAVE });
      b.prop('bus_shelter', -6.2, -L.d / 2 + 1.4, 0, { ly: PAVE });
      // the station's name over the head of the stairs, on two posts
      for (const px of [-1.9, 1.9]) b.cyl(px, PAVE, -6.6, 0.07, 3.1, 'rust', { sides: 6 });
      signAt(b, 0, 2.95, -6.66, 0, 3.6, 0.9, 'subway', { far: true, back: 0.08, two: true });
      const R = groundRoom(b, 5.8, 5.4, 5, 4, 2.8, 'tin', { w: [door(2, 1.1)], n: [cw(2.5, 2, 1, 2)] }, { roof: 'flat', roofMat: 'tin', plain: true });
      void R;
      b.cont(CONT.CABINET, 7.4, 6.4, { prop: 'cabinet', ry: -PI / 2, ly: FLOOR_Y });
      b.loot(5.4, 4.6, FLOOR_Y + 0.02);
      extra(b, 'turnstiles', -5.6, 1.6, PI / 2, { ly: PAVE });
      extra(b, 'street_bench', -6.6, 6.4, PI / 2, { ly: PAVE });
      extra(b, 'street_bench', 0.4, 8.2, PI, { ly: PAVE, seed: 1 });
      extra(b, 'trash_bin', 2.6, 8.1, 0, { ly: PAVE });
      extra(b, 'newspaper_box', 7.6, -7.6, 0, { ly: PAVE });
      extra(b, 'phone_booth', -8.2, -3.4, PI / 2, { ly: PAVE });
      for (const [tx, tz] of [[-7.4, 8.6], [-3.4, 3.8], [7.6, -4.6]]) b.tree(tx, tz, rng.chance(0.5) ? 3 : 5, rng.range(0.7, 1.1));
      b.prop('suitcases', 3.4, -6.4, 0.8, { nocollide: true, ly: PAVE });
      b.prop('litter', -3, -6.5, 2, { nocollide: true, ly: PAVE });
      b.prop('litter', 2, 2, 0.3, { nocollide: true, ly: PAVE, seed: 1 });
      b.prop('paper_scatter', -1, 4.4, 1, { nocollide: true, ly: PAVE });
      b.prop('stroller', 4.6, 2.4, 2.2, { nocollide: true, ly: PAVE });
      b.cont(CONT.DUFFEL, -3.2, 0.6, { prop: 'duffel_bag', ry: 0.3, nocollide: true, ly: PAVE });
      b.prop('streetlight', 8.6, -8.6, PI, { ly: PAVE });
      b.prop('corpse', 4.4, 0, 2, { nocollide: true, ly: PAVE });
      b.prop('skeleton', -2.4, -8.4, 1, { nocollide: true, ly: PAVE, seed: 2 });
      for (let k = 0; k < 10; k++) weed(b, rng.range(-9, 9), rng.range(-9, 9), rng.range(0.6, 1.2));
      landmarks.push({ x: b.wx(0, -3), z: b.wz(0, -3), name: 'Harbour Street Station' });
    },
    // a car park nobody drove out of
    parking(b, L) {
      const rows = Math.max(1, Math.floor((L.d - 6) / 7));
      const cols = Math.max(2, Math.floor((L.w - 3) / 3.4));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!rng.chance(0.5)) continue;
          const t = rng();
          const type = t < 0.4 ? 'car_wreck' : t < 0.62 ? 'car_burnt' : t < 0.8 ? 'car_open' : t < 0.9 ? 'van_wreck' : 'pickup_truck';
          const [px, pz, pr] = [-L.w / 2 + 2.6 + c * 3.4 + rng.range(-0.2, 0.2), -L.d / 2 + 5 + r * 7, (rng.chance(0.5) ? 0 : PI) + rng.range(-0.1, 0.1)];
          const trunk = t < 0.4 && rng.chance(0.45);
          if (fits(b, type, px, pz, pr, PAVE)) b.wreck(type, px, pz, pr, { trunk, ly: PAVE }); // (a pickup is longer than its bay)
        }
      }
      b.prop('streetlight', L.w / 2 - 1, L.d / 2 - 1, PI, { ly: PAVE });
      b.loot(0, L.d / 2 - 2, PAVE + 0.02);
      for (let k = 0; k < 12; k++) weed(b, rng.range(-L.w / 2 + 1, L.w / 2 - 1), (k % 2 ? 1 : -1) * (L.d / 2 - 0.6), rng.range(0.6, 1.2));
      for (let k = 0; k < 5; k++) b.prop(['litter', 'shopping_cart', 'glass_shards', 'suitcases', 'skeleton'][k], rng.range(-L.w / 2 + 2, L.w / 2 - 2), 1.5 + rng.range(-0.4, 0.4), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: k });
      // the board at its way in
      b.cyl(-L.w / 2 + 1, PAVE, -L.d / 2 + 0.8, 0.07, 2.7, 'rust', { sides: 6 });
      signAt(b, -L.w / 2 + 2.1, 2.5, -L.d / 2 + 0.74, 0, 2.2, 0.55, 'parking', { back: 0.05 });
    },
    // a warehouse: one tall hall behind two loading doors, a loft of windows over it, the office in its corner
    warehouse(b, L) {
      const F = frame(L, 38, 15);
      const hi = (at) => ({ at, w: 2.6, y0: 3.3, y1: 5.3, glass: rng.chance(0.4) });
      const R = groundRoom(b, 0, F.cz, F.w, F.d, 6.2, 'brick', { n: [gap(8, 4.2, 4.4), door(19, 1.4), gap(30, 4.2, 4.4), hi(14), hi(24)], s: [door(3, 1.2), hi(12), hi(19), hi(26)], e: [hi(7.5)], w: [hi(7.5)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', plain: true });
      partition(b, R, F.R - 7, F.back - 5.4, F.R, F.back - 5.4, 3, 'concrete', [door(2, 1.2)]);
      partition(b, R, F.R - 7, F.back - 5.4, F.R - 7, F.back, 3, 'concrete');
      block(b, 0, F.cz, F.w, F.d, 6.5, 1, 3.6, 'warehouse', 'brick', { top: rng.chance(0.4) ? 'slab' : undefined, wear: 0.9 });
      // the doors, run up and stuck there
      for (const dx of [-11, 11]) b.box(dx, 3.7, F.front - 0.05, 4.2, 0.9, 0.1, 'tin_rust', { collide: false });
      // the hall: racks down one side, what was on them, a container nobody came back for
      for (const dx of [2.2, 4.6, 7.0]) cont(b, CONT.SHELF, 'shelf', F.L + dx, backZ(F, 0.5), 0, { seed: dx | 0 });
      cont(b, CONT.CRATE, 'crate', F.L + 2, F.cz - 2, 0.3);
      b.cont(CONT.FREIGHT, 4, F.cz + 3.4, { prop: 'crate', ry: 0.5, ly: FLOOR_Y, seed: 1 });
      b.prop('shipping_container', -3, F.cz + 2.4, PI / 2 + 0.06, { ly: FLOOR_Y, seed: rng.int(0, 2) });
      for (const [px, pz] of [[-13, F.cz - 3], [-12.4, F.cz + 0.6], [8, F.cz - 3.4], [10.4, F.cz + 3.8]]) b.prop('pallet', px, pz, rng.range(0, 3), inside);
      b.prop('pallet', -13, F.cz - 3, 0.3, { ly: FLOOR_Y + 0.15 });
      b.prop('barrel', 12.4, F.cz - 4.6, 0, inside);
      b.prop('barrel', 13.4, F.cz - 4.4, 0, { ly: FLOOR_Y, seed: 1 });
      b.prop('tire_pile', 6.4, backZ(F, 1.5), 0, inside);
      b.loot(-8, F.cz - 3, FLOOR_Y + 0.02);
      b.loot(2, F.cz - 4, FLOOR_Y + 0.02);
      // the office
      cont(b, CONT.LOCKER, 'locker', rightX(F, 0.5), F.back - 3, PI / 2);
      extra(b, 'office_desk', F.R - 3.6, F.back - 1.2, PI, inside);
      extra(b, 'filing_cabinet', F.R - 6.2, F.back - WALL - 0.6, 0, inside);
      b.prop('office_chair', F.R - 3.4, F.back - 2.4, 2, { nocollide: true, ly: FLOOR_Y });
      b.loot(F.R - 2, F.back - 4, FLOOR_Y + 0.02);
      mess(b, F, 12);
      // out front: a truck that was backing in
      yard(b, F, L);
      signAt(b, 0, 5.4, F.front - 0.14, 0, 9, 6.5, 'ghost', { far: true });
    },
    // What the tower's shaft fell on: the buildings that stood here are under it (the streets lay the shaft's
    // lengths, and their rubble; inFall: where). What it missed of them: stumps of walls, heaps, what burnt after.
    crushed(b, L, inFall) {
      const pts = [];
      for (let k = 0; k < 26; k++) pts.push([rng.range(-L.w / 2 + 2.6, L.w / 2 - 2.6), rng.range(-L.d / 2 + 2.6, L.d / 2 - 2.6), rng(), rng()]);
      const clear = (lx, lz, r) => !inFall(b.wx(lx, lz), b.wz(lx, lz), r);
      // walls along the lot's edges where the shaft did not land
      for (const [x0, z0, x1, z1] of [[-L.w / 2 + 1.2, L.d / 2 - 1.2, L.w / 2 - 1.2, L.d / 2 - 1.2], [-L.w / 2 + 1.2, -L.d / 2 + 1.2, -L.w / 2 + 1.2, L.d / 2 - 1.6], [L.w / 2 - 1.2, -L.d / 2 + 1.2, L.w / 2 - 1.2, L.d / 2 - 1.6], [-L.w / 2 + 1.6, -L.d / 2 + 1.2, L.w / 2 - 1.6, -L.d / 2 + 1.2]]) {
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 7));
        for (let k = 0; k < n; k++) {
          const [a0, a1] = [k / n, (k + 0.86) / n];
          const p = [x0 + (x1 - x0) * a0, z0 + (z1 - z0) * a0, x0 + (x1 - x0) * a1, z0 + (z1 - z0) * a1];
          const H = rng.range(2.5, 8);
          const keep = rng.chance(0.75);
          if (!keep || !clear((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, 4.5)) continue;
          jagged(b, ...p, PAVE, H, 'brick', true, { inner: 'plaster', soot: rng.chance(0.4) });
        }
      }
      let n = 0;
      for (const [lx, lz, r1, r2] of pts) {
        if (!clear(lx, lz, 3.4)) continue;
        if (n < 3 && heaps.every((h) => Math.hypot(h.x - b.wx(lx, lz), h.z - b.wz(lx, lz)) > 7)) {
          heap(b, lx, lz, 2 + r1 * 1.6, 1.8 + r2 * 1.4, 0.9 + r1 * 0.9, { brick: 0.6, ry: r2 * 3 });
          n++;
        } else b.prop(['debris', 'litter', 'glass_shards', 'skeleton', 'debris', 'bones'][(r1 * 6) | 0], lx, lz, r2 * 6, { nocollide: true, ly: PAVE, seed: (r2 * 3) | 0 });
        weed(b, lx + 1, lz - 1, 0.7 + r1 * 0.6);
      }
      // (a bag somebody left, in whichever corner of it nothing came down on)
      const corner = [[1, 1], [-1, 1], [1, -1], [-1, -1]].find(([sx, sz]) => clear(sx * (L.w / 2 - 2.6), sz * (L.d / 2 - 2.6), 1.5) && heaps.every((h) => Math.hypot(h.x - b.wx(sx * (L.w / 2 - 2.6), sz * (L.d / 2 - 2.6)), h.z - b.wz(sx * (L.w / 2 - 2.6), sz * (L.d / 2 - 2.6))) > Math.max(h.rx, h.rz) + 1.6));
      if (corner) {
        b.cont(CONT.DUFFEL, corner[0] * (L.w / 2 - 2.6), corner[1] * (L.d / 2 - 2.6), { prop: 'duffel_bag', ry: 0.5, nocollide: true, ly: PAVE });
        b.loot(corner[0] * (L.w / 2 - 3.4), corner[1] * (L.d / 2 - 2.6), PAVE + 0.02);
      }
      smoke(b, 0, 2, 0);
    },
  };
  return { BUILD, SHOP };
}
