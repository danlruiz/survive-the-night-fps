// Calder Field (mainland.js), the airport on the far side of the Ridge: the apron, the plane at the south end of the
// runway and its fuel truck, the runway, the perimeter fence, the hangars, the terminal and the fuel depot.
import { ZONE, CONT } from '../defs.js';
import { FLOOR_Y, RIVER_HW, RUNWAY_LEN, RUNWAY_HALF } from './consts.js';

const PI = Math.PI;

// place, part: mainland.js's; ck: the city's kit (mainland/citykit.js). Returns car (the plane: this act's car) and
// runway (see mainland.js)
export function buildAirfield({ rng, plan, ground, kit, place, part, ck }) {
  const { AIR, aw, field, plane, APRON, GATE_AT, FENCE, riverAt } = plan;
  const { fieldH, heightAt, roadDistAt } = ground;
  const { props, clears, addPropColliders, propBlocked, Builder, door, win, gap } = kit;
  const { block, groundRoom, partition, zone, drumFire, signAt, extra } = ck;
  // CALDER FIELD ----------------------------------------------------------------------------------------------
  // (everything here is in the runway's frame: aw() turns it to the world, a Builder turned by AIR.ry builds in it)
  const apron = { x: aw(APRON.lx, APRON.lz)[0], z: aw(APRON.lx, APRON.lz)[1], hx: APRON.hx, hz: APRON.hz };
  // the apron: a rectangle of concrete between the runway and the hangars
  {
    const b = new Builder(apron.x, apron.z, AIR.ry, fieldH);
    b.zone = ZONE.HANGARS;
    b.box(0, -0.05, 0, apron.hx * 2, 0.1, apron.hz * 2, 'concrete', { collide: true });
    b.clear(0, -40, 44);
    b.clear(0, 40, 44);
  }
  // the plane, at the south end of the runway, its nose to the north; the fuel truck beside it on the apron's edge
  const planeY = fieldH;
  const car = { x: plane[0], y: planeY, z: plane[1], ry: AIR.ry, plane: true };
  props.push({ type: 'plane_wreck', x: car.x, y: car.y, z: car.z, ry: car.ry, seed: 7, live: true }); // (live: as the car at the bridgehead - the take-off swaps it for the one that flies)
  addPropColliders('plane_wreck', car.x, car.y, car.z, car.ry);
  const truck = { x: aw(17, RUNWAY_LEN / 2 - 32)[0], y: fieldH, z: aw(17, RUNWAY_LEN / 2 - 32)[1], ry: AIR.ry - 0.35 };
  props.push({ type: 'fuel_truck', x: truck.x, y: truck.y, z: truck.z, ry: truck.ry, seed: 3 });
  addPropColliders('fuel_truck', truck.x, truck.y, truck.z, truck.ry, props[props.length - 1]);
  clears.push([car.x, car.z, 12], [truck.x, truck.z, 7]);
  const runway = { x: field.x, z: field.z, ry: AIR.ry, z0: -RUNWAY_LEN / 2, z1: RUNWAY_LEN / 2, half: RUNWAY_HALF, y: fieldH, truck };
  {
    // what is on the runway: wrecks the plane will have to clear on its run (well off its line), a light plane that
    // did not make it, the cones somebody set out
    const b = new Builder(field.x, field.z, AIR.ry, fieldH);
    b.zone = ZONE.HANGARS;
    b.wreck('pickup_truck', RUNWAY_HALF - 1.4, -40, 0.12, { trunk: false });
    b.wreck('car_wreck', -RUNWAY_HALF + 1.4, -110, 0.2);
    b.prop('jersey_barrier', RUNWAY_HALF - 1.5, 60, PI / 2, { seed: 1 });
    b.prop('jersey_barrier', -RUNWAY_HALF + 1.5, 20, PI / 2, { seed: 2 });
    b.prop('corpse', 3, 90, 0.4, { nocollide: true });
    // light aircraft that never got off: one ran off the side, one stands on the grass by the apron
    b.prop('light_plane', RUNWAY_HALF + 15, -70, 0.8, { ground: true, seed: 0 });
    b.prop('light_plane', -RUNWAY_HALF - 11, -20, -2.2, { ground: true, seed: 1 });
    b.clear(RUNWAY_HALF + 15, -70, 8);
    b.clear(-RUNWAY_HALF - 11, -20, 8);
    // The runway's paint, white once (roadpaint: faded, worn through to the asphalt): the bars of both thresholds,
    // each end's number beyond them - 36 for whoever lands heading north, as the plane will leave, 18 from the other
    // end - the dashed centre line between the two, the aiming marks, the edge lines.
    const paint = (lx, lz, sx, sz) => b.box(lx, -0.045, lz, sx, 0.03, sz, 'roadpaint', { collide: false });
    for (let z = -RUNWAY_LEN / 2 + 62; z < RUNWAY_LEN / 2 - 56; z += 24) if (rng.chance(0.8)) paint(0, z, 0.6, 11);
    for (const end of [-1, 1]) for (let k = -4; k <= 4; k++) if (k) paint(k * 2.3 + (k > 0 ? 0.5 : -0.5), end * (RUNWAY_LEN / 2 - 12), 1.3, 14);
    {
      // the numbers, in strokes: [x, z, across, along] of a digit 3 m wide and 7 m tall, its foot towards the
      // threshold (z = 0) and its head 7 m up the runway
      const T = 0.75;
      const NUMBERS = 37; // (from the runway's end to the foot of its number: past the nose of the plane that stands on the south one)
      const SEG = { a: [0, 7 - T / 2, 3, T], g: [0, 3.5, 3, T], d: [0, T / 2, 3, T], f: [-1.5 + T / 2, 5.25, T, 3.5], b: [1.5 - T / 2, 5.25, T, 3.5], e: [-1.5 + T / 2, 1.75, T, 3.5], c: [1.5 - T / 2, 1.75, T, 3.5] };
      const DIGIT = { 1: 'bc', 3: 'abgcd', 6: 'afgedc', 8: 'abcdefg' };
      for (const [end, digits] of [[1, [3, 6]], [-1, [1, 8]]]) {
        // (read from the approach: heading north at the south end, left is west; the other way at the north end)
        digits.forEach((n, i) => {
          const cx = (i ? 1 : -1) * 2.4 * end;
          for (const s of DIGIT[n]) {
            const [x, z, sx, sz] = SEG[s];
            paint(cx + x * end, end * (RUNWAY_LEN / 2 - NUMBERS - z), sx, sz);
          }
        });
      }
    }
    // ...its edge lights, most of them dark for good, and a windsock at either end
    for (let z = -RUNWAY_LEN / 2 + 6; z <= RUNWAY_LEN / 2 - 6; z += 28) for (const sx of [-1, 1]) b.prop('runway_light', sx * (RUNWAY_HALF + 0.9), z, 0, { nocollide: true, ground: true, seed: (z + sx) & 1 });
    for (const sx of [-1, 1]) for (let z = -RUNWAY_LEN / 2 + 4; z < RUNWAY_LEN / 2 - 20; z += 22) if (rng.chance(0.82)) paint(sx * (RUNWAY_HALF - 0.9), z + 10, 0.4, rng.range(14, 21));
    for (const end of [-1, 1]) for (const dz of [56, 74, 92]) for (const sx of [-1, 1]) if (rng.chance(0.8)) paint(sx * 4.6, end * (RUNWAY_LEN / 2 - dz), 2.2, 9);
    // (...and beyond either end, what brought them in at night: bars of lamps on the grass)
    for (const end of [-1, 1]) for (const dz of [10, 24, 38]) for (let k = -2; k <= 2; k++) b.prop('runway_light', k * 2.4, end * (RUNWAY_LEN / 2 + dz), 0, { nocollide: true, ground: true, seed: (k + dz) & 1 });
    b.prop('windsock', RUNWAY_HALF + 9, RUNWAY_LEN / 2 - 40, 0.4, { ground: true });
    b.prop('windsock', -RUNWAY_HALF - 8, -RUNWAY_LEN / 2 + 30, 2, { ground: true });
  }
  {
    // the apron: what was parked on it the day the flights stopped (turned half round: the apron is east of the runway,
    // its far side the hangars)
    const b = new Builder(apron.x, apron.z, AIR.ry + PI, fieldH);
    b.zone = ZONE.HANGARS;
    const on = { ly: 0.05 };
    b.prop('light_plane', -12, -22, 1.2, { ...on, seed: 1 });
    b.prop('light_plane', 9, 6, -0.6, { ...on, seed: 0 });
    b.prop('light_plane', -13, 44, 2.8, { ...on, seed: 1 });
    b.wreck('fire_truck', -19, -60, 0.2, { ...on, trunk: false });
    for (const [cx, cz, r] of [[-5, -42, 0.3], [-5.4, -38.6, 0.34], [14, 30, 1.9], [-2, 58, 0.1]]) b.prop('baggage_cart', cx, cz, r, on);
    b.prop('shipping_container', -24, 64, 0.02, { ...on, seed: 1 });
    b.prop('shipping_container', -24, 71, -0.04, { ...on, seed: 2 });
    b.cont(CONT.FREIGHT, -20.4, 67.4, { prop: 'crate', ry: 0.2, ly: 0.05 });
    b.cont(CONT.DUFFEL, 4, -30, { prop: 'duffel_bag', ry: 1, nocollide: true, ly: 0.05 });
    for (const [lx, lz] of [[2, -36], [12, 22], [-8, 50], [20, -8]]) b.prop('suitcases', lx, lz, lx, { nocollide: true, ly: 0.05, seed: lz & 1 });
    b.prop('litter', 0, 0, 1, { nocollide: true, ly: 0.05 });
    b.prop('corpse', 6, -18, 2, { nocollide: true, ly: 0.05 });
    // (where the last flights were loaded: the army's trucks, tents for those who waited, the lamps over them)
    b.prop('army_truck', 16, -34, 0.3, { ...on, seed: 0 });
    b.prop('army_truck', 19.6, -46, -0.15, { ...on, seed: 1 });
    b.prop('triage_tent', -18, 22, 0.05, { ...on, seed: 0 });
    b.prop('triage_tent', -11.6, 23, -0.04, { ...on, seed: 1 });
    for (const [cx, cz, r] of [[-19, 20, 0], [-16.8, 24, PI], [-12.6, 21, 0], [-10.4, 25, PI]]) extra(b, 'field_cot', cx, cz, r, { ...on, seed: (cx * 2) & 3 });
    for (const [fx, fz, r] of [[22, 40, 2.4], [-24, -34, 0.6], [22, -64, 3.6]]) extra(b, 'floodlight_tower', fx, fz, r, on);
    for (let i = 0; i < 6; i++) b.prop('body_bag', -6 + i * 1.3, 32.5, PI / 2 + 0.07 * i, { nocollide: true, ly: 0.05, seed: i });
    for (const [lx, lz] of [[-4, 12], [6, -6], [12, 44], [-16, -8], [18, 14], [0, 60], [-10, -52], [8, -62]]) b.prop(['suitcases', 'paper_scatter', 'skeleton', 'litter', 'suitcases', 'traffic_cones', 'stroller', 'glass_shards'][(lx + 16) & 7], lx, lz, lx, { nocollide: true, ly: 0.05, seed: lz & 1 });
    b.loot(-16, 10, 0.07);
    b.loot(16, -50, 0.07);
  }
  {
    // the perimeter: chain link down the airfield's landward side, down in places, and the gate the road from East
    // Pass comes in by (this frame's z 22: the gate)
    const g0 = GATE_AT.lz - 22;
    const b = new Builder(aw(FENCE.x0, g0)[0], aw(FENCE.x0, g0)[1], AIR.ry, fieldH);
    b.zone = ZONE.TERMINAL;
    b.ground = true;
    for (let z = FENCE.z0 - g0; z <= FENCE.z1 - g0; z += 3) {
      const down = rng.chance(0.14);
      if (down || Math.abs(z - 22) < 6.5 || propBlocked('fence_chain', b.wx(0, z), b.wz(0, z), PI / 2) || roadDistAt(b.wx(0, z), b.wz(0, z)) < 3.4 || riverAt(b.wx(0, z), b.wz(0, z)) < RIVER_HW + 8) continue;
      b.prop('fence_chain', 0, z, PI / 2, { seed: z & 1 });
    }
    // (the boom stands on the road it is across, not on the verges either side of it)
    b.prop('boom_gate', 0.4, 16.5, PI / 2, { ground: false, ly: heightAt(b.wx(0.4, 16.5), b.wz(0.4, 16.5)) - fieldH });
    b.prop('jersey_barrier', -3.4, 26, PI / 2, { seed: 1 });
    b.prop('razor_wire', -3.6, 31, PI / 2);
    b.prop('road_sign', -4.4, 12, PI / 2, { seed: 2 });
    // (...and held it: a nest either side of the road, a carrier knocked out in front of it, their order on its posts)
    extra(b, 'sandbag_nest', -5.4, 12.4, PI / 2);
    extra(b, 'sandbag_nest', -5.4, 33, PI / 2, { seed: 1 });
    extra(b, 'apc_wreck', -15, 26.4, 0.5);
    extra(b, 'concertina', -9.4, 16.4, PI / 2 + 0.1);
    extra(b, 'tank_trap', -9, 30, 0.4);
    extra(b, 'tank_trap', -11.4, 11, 1.2);
    extra(b, 'floodlight_tower', 4.6, 30.4, 1.2);
    for (const [lx, lz] of [[-12, 20], [-18, 24], [-8, 23.6], [-21, 18], [-6.6, 27], [3, 24]]) b.prop(['corpse', 'skeleton', 'blood_pool', 'skeleton', 'body_bag', 'suitcases'][(lz * 2) % 6 | 0], lx, lz, lx, { nocollide: true, seed: lz & 1 });
  }
  place(ZONE.HANGARS, (b) => {
    // three hangars in a row, their doors (local -Z: east) open on the apron
    const hangar = (lx, k) => {
      const s = b.sub(lx, 6, 0);
      s.room(0, 0, 24, 24, 8, 'tin', { n: [gap(12, 16, 6.4)], s: [door(20, 1.3)], e: [win(12, 2)], w: [win(12, 2)] }, { roof: 'gableZ', roofH: 3.6, roofMat: 'tin', floorMat: 'concrete' });
      s.cont(CONT.SHELF, -4.6, 11.3, { prop: 'shelf', ry: PI, ly: FLOOR_Y, seed: k }); // (clear of the back door at x -8)
      s.cont(CONT.TOOLBOX, -2.4, 9.4, { prop: 'toolbox', ry: 0.5, nocollide: true, ly: FLOOR_Y, seed: k });
      s.cont(CONT.LOCKER, 11.56, 4, { prop: 'locker', ry: -PI / 2, ly: FLOOR_Y, seed: k });
      s.cont(CONT.CRATE, 8.6, 10.4, { prop: 'crate', ry: 0.2, ly: FLOOR_Y, seed: k });
      s.prop('barrel', -10.9, 3, 0, { ly: FLOOR_Y, seed: k });
      s.loot(0, 8, FLOOR_Y + 0.02);
      s.loot(-8, -4, FLOOR_Y + 0.02);
      // its doors, run half shut on their rails, rusted where they stand
      s.box(-5.7, 0, -12.32, 4.6, 6.3, 0.14, 'tin_rust');
      s.box(6.5, 0, -12.32, 3, 6.3, 0.14, 'tin_rust');
      s.prop('ivy', 12.16, 3, -PI / 2, { nocollide: true, seed: k });
      s.prop('litter', 2, -6, k, { nocollide: true, ly: FLOOR_Y, seed: k });
      part(s, 0, -10.6, 9.6, FLOOR_Y + 0.02); // the propeller, off the rack on the back wall
      if (k) part(s, 4, 10, -6, FLOOR_Y + 0.02);
      return s;
    };
    // (each: the frame showing down its flanks, rust run down its front from the door's rail, an engine hoist)
    for (const lx of [-30, 0, 30]) {
      for (const dz of [-6, 0, 6, 12, 18]) for (const sx of [-1, 1]) b.box(lx + sx * 12.24, 0, dz, 0.2, 8, 0.3, 'rust', { collide: false });
      b.box(lx, 6.5, -6.4, 24.4, 0.3, 0.3, 'rust', { collide: false });
      for (const dx of [-9, -3, 4, 9.5]) signAt(b, lx + dx, 6.4 - 1.4, -6.16, 0, 0.9, 2.8, dx > 0 ? 'rust_a' : 'rust_b', { grime: true, far: true });
      signAt(b, lx + 8.6, 2.2, -6.16, 0, 1.4, 1.4, lx ? 'xcode_a' : 'xcode_b', {});
    }
    hangar(-30, 0).prop('light_plane', 1.5, 0, 0.35, { ly: FLOOR_Y, seed: 1 });
    hangar(0, 1).wreck('pickup_truck', -4, 2, 0.3, { ly: FLOOR_Y, trunk: false });
    const h3 = hangar(30, 2);
    h3.prop('pallet', 3, 2, 0.3, { ly: FLOOR_Y });
    h3.cont(CONT.AMMO_BOX, -6, 4, { prop: 'military_crate', ry: 0.4, ly: FLOOR_Y });
    b.prop('generator', 0, 20.5, 0.2);
    b.cont(CONT.DUMPSTER, 45, 2, { prop: 'dumpster', ry: PI / 2 });
    for (const [lx, lz, r] of [[-44, -8, 0.3], [44, -10, 2.2]]) extra(b, 'floodlight_tower', lx, lz, r);
    extra(b, 'box_truck', -47, -14, 0.2);
    extra(b, 'van_wreck', 46, 14, 2.9);
    for (const [lx, lz] of [[-14, -9], [16, -11], [34, -9.4], [-36, -10]]) b.prop(['barrel', 'tire_pile', 'pallet', 'barrel'][(lx + 36) & 3], lx, lz, lx, { seed: lz & 1 });
    for (const [lx, lz] of [[-6, -10], [22, -12], [-24, -11.4], [8, -13], [38, -13]]) b.prop(['litter', 'paper_scatter', 'skeleton', 'suitcases', 'debris'][(lx + 24) % 5 | 0], lx, lz, lx, { nocollide: true, seed: lz & 1 });
    b.wreck('car_wreck', -46.5, 10, 0.4);
    b.prop('streetlight', 15, -9, 0);
    b.prop('streetlight', -15, -9, 0);
    b.prop('corpse', 3, -12, 2, { nocollide: true });
    b.loot(-15, -11);
  });
  place(ZONE.TERMINAL, (b) => {
    // The terminal: a hall with its desk and its rows of seats, a back office, a lounge of glass over half of it,
    // a canopy the length of its front, CALDER FIELD on its roof - and the tower at its north end, the cab on top.
    const R = groundRoom(b, 0, 2, 26, 14, 4.4, 'concrete', { n: [door(13, 1.8), win(5, 5, 0.7, 3.4), win(21, 5, 0.7, 3.4)], s: [door(20, 1.3), win(8, 4, 0.9, 3)], w: [win(7, 3, 0.9, 3)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete', lino: true, tint: 2 });
    partition(b, R, 6, -5, 6, 9, 4.4, 'concrete', [door(9, 1.3)]);
    // (the back of it is two rooms: the office, and through a door of that the radio room; and the hall has a wall
    // between check-in and the baggage belt, open at its end)
    partition(b, R, 6, 2, 13, 2, 4.4, 'concrete', [door(1.6, 1.2)]);
    partition(b, R, -13, -1.7, -5, -1.7, 4.4, 'concrete');
    zone(R, 6, 2, 13, 9, 4);
    zone(R, 6, -5, 13, 2, 0);
    zone(R, -13, -5, -5, -1.7, 5);
    drumFire(b, 2.6, 0.9);
    b.prop('reception_desk', -4, 0, 0, { ly: 0.12 }); // the check-in desk
    b.loot(-4, 0, 1.26);
    for (const lx of [-9.6, -7.4, -3.6, -1.4]) b.prop('waiting_chairs', lx, 5.6, 0, { ly: 0.12, seed: lx & 1 });
    b.cont(CONT.LOCKER, 12.1, 6, { prop: 'locker', ry: -PI / 2, ly: 0.12 });
    b.cont(CONT.CABINET, 9.6, 8.2, { prop: 'cabinet', ry: PI, ly: 0.12 });
    b.cont(CONT.FRIDGE, -12.1, 6.4, { prop: 'fridge', ry: PI / 2, ly: 0.12 });
    b.prop('table', 9.4, 0, 0, { ly: 0.12 });
    b.loot(9.4, 0, 0.94);
    b.loot(11.4, -3.6, 0.14); // (the radio room's set is dead: the flight radio is at North Ridge Outpost)
    extra(b, 'office_desk', 10.6, 4.2, -PI / 2, { ly: 0.12 });
    extra(b, 'filing_cabinet', 7.2, 8.2, PI, { ly: 0.12 });
    extra(b, 'vending_machine', -12.2, 1.6, PI / 2, { ly: 0.12 });
    extra(b, 'vending_machine', -12.2, 0.4, PI / 2, { ly: 0.12, seed: 1 });
    for (const [lx, lz] of [[-6, 3], [2, -2], [-10, -3], [3, 6.5]]) b.prop(['paper_scatter', 'ceiling_debris', 'blood_pool', 'office_chair'][(lx + 10) & 3], lx, lz, lx, { nocollide: true, ly: 0.12, seed: lz & 1 });
    for (const lx of [-8, 0]) b.prop('ceiling_lamp', lx, 2, 0, { nocollide: true, ly: 4.4, seed: lx & 1 });
    // the baggage hall: the belt, what never got claimed
    b.box(-8, 0.12, -3.2, 8, 0.6, 1.2, 'rust');
    for (const [lx, lz, r] of [[-9.4, -0.4, 0.3], [-4, -4.6, 1.2], [1.6, 3, 2], [-11, -4.2, 2.6], [3.6, -3.4, 0.7]]) b.prop('suitcases', lx, lz, r, { nocollide: true, ly: 0.12, seed: lz & 1 });
    b.prop('litter', 0, -2, 1, { nocollide: true, ly: 0.12 });
    b.prop('barricade', 2.6, -2.9, PI / 2, { ly: 0.12 });
    b.loot(-11, 5.2, 0.14);
    // the lounge over the hall, its glass mostly gone; the name on the roof's edge
    block(b, -5, 3, 14, 9, 4.7, 1, 3.4, 'glass', 'concrete', { wear: 0.95 });
    for (const px of [-5.4, 0, 5.4]) b.box(px, 4.7, -5.1, 0.14, 1.9, 0.14, 'rust', { collide: false });
    signAt(b, 0, 5.75, -5.28, 0, 12.4, 1.55, 'terminal', { far: true, back: 0.1 });
    // the canopy over the kerb, on its posts
    for (const px of [-10, -3.4, 3.4, 10]) b.cyl(px, 0, -8.6, 0.13, 3.3, 'metal', { sides: 8 });
    b.box(0, 3.3, -7.1, 23, 0.26, 4.2, 'concrete', { collide: false });
    b.roofSpan(0, -7.1, 11.5, 2.1, 3.3, 0.26);
    // the tower: a shaft of four floors over the hall's north end, a walkway round its head, the cab on that - its
    // glass leaning out, half its panes gone - and on the cab's roof the aerials and the beacon
    const top = block(b, 9.5, 5.5, 5, 5, 4.7, 3, 3.1, 'office', 'concrete', { wear: 0.6 });
    b.box(9.5, top, 5.5, 7.4, 0.3, 7.4, 'concrete', { collide: false });
    for (const [dx, dz, w, d] of [[0, -3.6, 7.3, 0.06], [0, 3.6, 7.3, 0.06], [-3.6, 0, 0.06, 7.3], [3.6, 0, 0.06, 7.3]]) {
      b.box(9.5 + dx, top + 1.25, 5.5 + dz, w, 0.06, d, 'rust', { collide: false });
      b.box(9.5 + dx, top + 0.8, 5.5 + dz, w, 0.04, d, 'rust', { collide: false });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(9.5 + sx * 3.6, top + 0.3, 5.5 + sz * 3.6, 0.07, 1.0, 0.07, 'rust', { collide: false });
    b.box(9.5, top + 0.3, 5.5, 4.6, 0.9, 4.6, 'metal', { collide: false });
    for (const [nx, nz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      for (let k = -1; k <= 1; k++) {
        const here = rng.chance(0.62);
        const [px, pz] = [9.5 + nx * 2.45 + (nz ? k * 1.55 : 0), 5.5 + nz * 2.45 + (nx ? k * 1.55 : 0)];
        if (here) b.box(px, top + 1.2, pz, 1.45, 1.9, 0.04, 'glass', { collide: false, ry: nx ? PI / 2 : 0 });
        b.box(9.5 + nx * 2.5 + (nz ? (k + 0.5) * 1.55 : 0), top + 1.2, 5.5 + nz * 2.5 + (nx ? (k + 0.5) * 1.55 : 0), 0.08, 1.95, 0.08, 'metal', { collide: false });
      }
    }
    b.box(9.5, top + 1.2, 5.5, 2.6, 1.0, 2.6, 'dark', { collide: false }); // (the desks, in the dark of it)
    b.box(9.5, top + 3.1, 5.5, 6.6, 0.3, 6.6, 'concrete', { collide: false });
    b.box(9.5, top + 3.4, 5.5, 0.12, 4.4, 0.12, 'metal', { collide: false });
    b.box(8, top + 3.4, 4.4, 0.06, 2.6, 0.06, 'rust', { collide: false, rz: 0.12 });
    b.box(11, top + 3.4, 6.8, 0.06, 1.8, 0.06, 'rust', { collide: false });
    b.box(10.6, top + 3.7, 4.2, 1.5, 0.5, 0.2, 'metal', { collide: false, ry: 0.6 }); // (the radar's bar, where it stopped)
    b.cyl(10.6, top + 3.4, 4.2, 0.1, 0.3, 'rust', { sides: 6, collide: false });
    b.prop('baggage_cart', -18, 2, 0.1);
    b.prop('ivy', -13.16, 4, PI / 2, { nocollide: true });
    // out front: the forecourt, what the last flight out left behind, and the army's last order on its posts
    b.box(0, -0.05, -13, 30, 0.1, 14, 'concrete', { collide: true });
    b.wreck('ambulance', -8, -13.6, 1.4, { ly: 0.05, trunk: false });
    b.wreck('car_open', 6, -15, 0.2, { ly: 0.05, seed: 1 });
    b.wreck('school_bus', 15, 22, 1.5, { trunk: false });
    b.cont(CONT.DUFFEL, -2, -8, { prop: 'duffel_bag', ry: 0.6, nocollide: true, ly: 0.05 });
    b.cont(CONT.DUFFEL, 3.4, -10.5, { prop: 'duffel_bag', ry: 2.1, nocollide: true, ly: 0.05, seed: 1 });
    b.prop('streetlight', -13, -19, PI);
    b.prop('streetlight', 13, -19, PI);
    b.prop('corpse', 0, -16, 0.4, { nocollide: true, ly: 0.05 });
    b.loot(-10, -9, 0.07);
    for (const [lx, lz] of [[-12, -9.6], [-4, -11], [9, -9.2], [12.6, -12], [1, -18], [-9, -18.4]]) b.prop(['suitcases', 'suitcases', 'paper_scatter', 'skeleton', 'stroller', 'litter'][(lx + 12) % 6 | 0], lx, lz, lx * 0.7, { nocollide: true, ly: 0.05, seed: (lz * 3) & 1 });
    extra(b, 'street_bench', -6, -9.1, PI, { ly: 0.05 });
    extra(b, 'street_bench', 6, -9.1, PI, { ly: 0.05, seed: 1 });
    extra(b, 'trash_bin', 11.2, -9.2, 0, { ly: 0.05 });
    extra(b, 'checkpoint_sign', 2.4, -19, 0, { ly: 0.05 });
    extra(b, 'floodlight_tower', -13.4, -14.6, 0.4, { ly: 0.05 });
    for (const dq of [-1.1, 1.1]) b.cyl(12.6 + dq, 0, -19.6, 0.06, 3.2, 'rust', { sides: 6 });
    signAt(b, 12.6, 2.5, -19.68, 0, 2.6, 1.3, 'evac', { far: true, back: 0.05 });
  });
  place(ZONE.FUEL_DEPOT, (b) => {
    const FX = 22;
    const FZ = 20;
    for (let x = -FX + 1.5; x < FX; x += 3) {
      if (Math.abs(x) > 4) b.prop('fence_chain', x, -FZ, 0);
      b.prop('fence_chain', x, FZ, 0);
    }
    for (let z = -FZ + 1.5; z < FZ; z += 3) {
      b.prop('fence_chain', -FX, z, PI / 2);
      b.prop('fence_chain', FX, z, PI / 2);
    }
    // the tank farm: three tanks in a bund
    for (const lx of [-12, 0, 12]) {
      b.cyl(lx, 0, 9, 4.4, 7.5, 'tin_rust', { sides: 16 });
      b.cone(lx, 7.5, 9, 4.5, 1, 'tin', 16, { ry: 0 });
    }
    b.box(0, 0, 2.6, 36, 0.7, 0.4, 'concrete');
    for (const lx of [-12, 0, 12]) {
      for (const dx of [-0.25, 0.25]) b.box(lx + dx, 0, 4.5, 0.05, 8.2, 0.05, 'rust', { collide: false });
      for (let y = 0.5; y < 8; y += 0.5) b.box(lx, y, 4.5, 0.5, 0.04, 0.04, 'rust', { collide: false });
      b.box(lx, 7.6, 9, 9.2, 0.08, 0.08, 'rust', { collide: false }); // (the rail round its roof, seen as a line)
      b.cyl(lx + 2.2, 0, 3.6, 0.14, 0.9, 'rust', { sides: 6, collide: false });
    }
    b.box(0, 0.35, 1.4, 30, 0.22, 0.22, 'rust', { collide: false }); // the main, along the bund
    b.box(-12, 0.35, -3, 0.22, 0.22, 9, 'rust', { collide: false });
    // the pump house
    b.room(-12, -10, 8, 6, 3, 'concrete', { e: [door(3, 1.2)], n: [win(4, 1.4)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.cont(CONT.LOCKER, -15.3, -9, { prop: 'locker', ry: PI / 2, ly: 0.12 });
    b.cont(CONT.TOOLBOX, -11, -8, { prop: 'toolbox', ry: 0.2, nocollide: true, ly: 0.12 });
    part(b, 4, -14, -11.6, 0.14);
    // the drum store, under a roof on posts
    b.shelter(10, -10, 10, 7, 3.2, 'tin', 'metal');
    for (const [dx, dz] of [[7, -11.4], [8, -11.4], [7.5, -10.5], [12.5, -8.4]]) b.prop('barrel', dx, dz, 0);
    part(b, 4, 10, -11.6);
    part(b, 4, 12.6, -10.4);
    part(b, 4, 9.4, -8.4);
    b.prop('fuel_tank', 14, -15.6, PI / 2);
    b.cont(CONT.CRATE, 4, -15, { prop: 'crate', ry: 0.3 });
    b.wreck('pickup_truck', -2, -14.6, 1.5);
    b.prop('streetlight', -5.5, -18.6, PI);
    b.prop('corpse', 2, -6, 2.4, { nocollide: true });
    b.loot(0, -4);
    b.loot(16, -4);
  });
  return { car, runway };
}
