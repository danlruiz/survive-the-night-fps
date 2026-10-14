// The island's named places (world.js), each built if this map has it, in the order they always have been (they draw
// from the valley's random stream): the breakdown, the motel, the farm, the dock, the gas station, the checkpoint,
// the railway (rail.js), the sawmill, the lookout, the cabins, the crash site, the chapel (cemetery.js), the relay
// station, the quarry, the village, the clinic (clinic.js), the trailers, the campground, the scrapyard, the summer
// camp, Blackrock Mine's yard, the lodge, the drive-in and the fair (fair.js). The workings under the mine (mine.js)
// are planned after them and every roadside site: sinkMine.
import { WATER_LEVEL } from '../constants.js';
import { ZONE, CONT } from '../defs.js';
import { planMine } from '../mine.js';
import { dressMine } from '../minedress.js';
import { buildClinic } from '../clinic.js';
import { buildCemetery } from '../cemetery.js';
import { buildFair } from '../fair.js';

const PI = Math.PI;

// builds a place if this map has it: build(builder in the place's frame, the place)
function placer(zoneById, Builder) {
  return (id, build) => {
    const zone = zoneById[id];
    if (!zone) return;
    const b = new Builder(zone.x, zone.z, zone.ry, zone.h);
    b.zone = id;
    b.yard = zone;
    build(b, zone);
  };
}

// car: where your car broke down; cemetery, clinic, fair: theirs, or null on a map without them; darks: the interiors
// no daylight gets into (world.darkAt)
export function buildPlaces({ seed, rng, zoneById, heightAt, rail, roads, kit }) {
  const { staticGrid, parts, Builder, door, win, gap } = kit;
  const place = placer(zoneById, Builder);
  let car;
  let cemetery = null; // (the chapel's builder fills it in)
  const spawnPoints = [];

  // THE BREAKDOWN (start): your car died on the shoulder of Route 9 next to a little rest area.
  place(ZONE.CAMP, (b, z) => {
    const pc = b.prop('car', 5.4, 1.5, 0.04, { seed: 7 });
    car = { x: pc.x, y: pc.y, z: pc.z, ry: pc.ry };
    b.clear(5.4, 1.5, 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      spawnPoints.push({ x: b.wx(9 + Math.sin(a) * 2.5, 1 + Math.cos(a) * 3.5), z: b.wz(9 + Math.sin(a) * 2.5, 1 + Math.cos(a) * 3.5) });
    }
    b.cont(CONT.DUFFEL, 3.6, 4.6, { prop: 'duffel_bag', ry: 0.8, nocollide: true, seed: 1 });
    b.prop('road_sign', 3.2, -9, PI, { seed: 2 });
    b.prop('road_sign', -4.4, 14, 0, { seed: 5 });
    b.wreck('car_wreck', 6.2, -13, 0.28);
    b.wreck('pickup_truck', -7.5, 17, 2.9);
    b.prop('billboard', -13, 3, -PI / 2);
    // rest area
    b.shelter(14, 2, 7, 5.5, 2.7, 'tin');
    b.prop('picnic_table', 13, 0.6, PI / 2);
    b.prop('picnic_table', 15.4, 3.6, PI / 2 + 0.2);
    b.cont(CONT.TOOLBOX, 13, 0.8, { prop: 'toolbox', ly: 0.8, nocollide: true, h: 0.2 });
    b.cont(CONT.DUMPSTER, 19.5, -5, { prop: 'dumpster', ry: -PI / 2 });
    b.prop('outhouse', 20, 7, -PI / 2);
    b.prop('barrel', 17.5, -7.2, 0);
    b.prop('lantern_post', 10.5, -2.5, 0);
    b.prop('mailbox', 9.5, 8.5, -PI / 2);
    b.loot(12, 5.5);
    b.loot(16.5, -1.2, 0.82);
    b.loot(7.5, 5.2);
  });

  // PINEWOOD MOTEL: a row of rooms under a long roof facing Route 9, office, parking lot.
  place(ZONE.MOTEL, (b) => {
    b.box(-3, -0.05, -9, 46, 0.1, 17, 'concrete', { collide: true }); // parking lot
    const RW = 6;
    const n = 6;
    const x0 = -26;
    const zf = 4;
    const D = 8;
    const H = 3;
    const fops = [];
    const bops = [];
    for (let i = 0; i < n; i++) {
      fops.push(door(i * RW + 1.4, 1.3));
      fops.push(win(i * RW + 4.2, 1.5));
      bops.push(win((n - 1 - i) * RW + 3, 0.8, 1.6, 2.2));
    }
    b.wall(x0, zf, x0 + n * RW, zf, H, 0.25, 'clapboard', fops);
    b.wall(x0 + n * RW, zf + D, x0, zf + D, H, 0.25, 'clapboard', bops);
    b.wall(x0, zf + D, x0, zf, H, 0.25, 'clapboard', [win(4, 1.2)]);
    b.wall(x0 + n * RW, zf, x0 + n * RW, zf + D, H, 0.25, 'clapboard');
    for (let i = 1; i < n; i++) b.wall(x0 + i * RW, zf, x0 + i * RW, zf + D, H, 0.2, 'planks');
    b.box(x0 + (n * RW) / 2, 0, zf + D / 2, n * RW, 0.12, D, 'planks', { collide: true });
    b.box(x0 + (n * RW) / 2, H, zf + D / 2 - 1.8, n * RW + 0.8, 0.28, D + 4.2, 'tin', { collide: true });
    for (let i = 0; i <= n; i++) b.cyl(x0 + i * RW, 0, zf - 3.4, 0.1, H, 'trim', { sides: 6 });
    b.clear(x0 + (n * RW) / 2, zf + D / 2, 20);
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * RW;
      b.prop('bed', cx + 3.8, zf + D - 1.3, PI);
      if (i % 2 === 0) b.cont(CONT.CABINET, cx + 1.2, zf + D - 0.45, { prop: 'cabinet', ry: 0 });
      else b.cont(CONT.FRIDGE, cx + 0.6, zf + D - 0.5, { prop: 'fridge', ry: 0, zone: ZONE.MOTEL });
      if (i === 2 || i === 5) b.cont(CONT.DUFFEL, cx + 2.4, zf + 2.2, { prop: 'duffel_bag', ry: 1.2, nocollide: true });
      b.loot(cx + 4.6, zf + 1.4);
    }
    b.partSpot(x0 + 3 * RW + 1.2, zf + D - 1.2);
    // office
    b.room(17, 2, 10, 9, 3.4, 'brick', { n: [door(2.4, 1.5), win(6.6, 3, 0.9, 2.4)], e: [win(4.5)], s: [door(2, 1.1)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'planks' });
    b.box(15, 0, 0.2, 4, 1.05, 0.7, 'planks', { collide: true }); // counter
    b.cont(CONT.LOCKER, 20.8, 5.6, { prop: 'locker', ry: -PI / 2 });
    b.cont(CONT.SHELF, 14, 5.9, { prop: 'shelf', ry: PI });
    b.partSpot(19.5, 5.2);
    b.loot(15, 0.2, 1.07);
    b.prop('motel_sign', -20, -21, 0.3);
    b.box(10, 0, -0.6, 1.1, 1.9, 0.8, 'paint', { collide: true }); // vending machines
    b.box(11.4, 0, -0.6, 1.1, 1.9, 0.8, 'rust', { collide: true });
    b.cont(CONT.DUMPSTER, -12, 16.5, { prop: 'dumpster', ry: PI });
    b.wreck('car_wreck', -16, -8, 1.62);
    b.wreck('car_wreck', 2, -9, 1.5);
    b.wreck('pickup_truck', -4, -14, 1.7, { trunk: false });
    b.prop('corpse', -8, -3, 0.4, { nocollide: true });
    b.prop('barrel', 22, -4, 0);
    b.prop('streetlight', -8, -17, PI);
    b.prop('streetlight', 12, -17, PI);
    b.loot(-10, -6);
    b.loot(8, 10.5, 0.62); // on the bed of the last room
  });

  // MILLER FARM ---------------------------------------------------
  place(ZONE.BARN, (b) => {
    // barn: 14 wide (x), 20 deep (z), ridge along z
    b.room(10, 8, 14, 20, 6, 'barn', { n: [gap(7, 5, 4.6)], e: [door(12, 1.6)], s: [gap(7, 3, 3.2)] }, { roof: 'gable', roofH: 4.6, roofMat: 'tin', floorMat: 'planks' });
    b.box(10, 6, 8, 14, 0.2, 20, 'planks', { collide: false }); // hayloft ceiling
    b.prop('hay_square', 5, 14, 0);
    b.prop('hay_square', 5, 14, 0, { ly: 0.6 });
    b.prop('hay_square', 6.3, 15, 0.1);
    b.prop('hay_square', 14.5, 3, 1.57);
    b.prop('hay_square', 14.5, 4.3, 1.57);
    b.prop('hay_round', 15, 13, 0.3);
    b.prop('cart', 6, 5, 0.4);
    b.cont(CONT.SHELF, 16.5, 15, { prop: 'shelf', ry: -PI / 2 });
    b.cont(CONT.TOOLBOX, 4.2, 9.5, { prop: 'toolbox', ry: 0.4, nocollide: true });
    b.loot(6, 3);
    b.loot(14, 9);
    b.loot(12, 16);
    b.partSpot(15.8, 16.8);
    b.prop('tire_pile', 16, 16.8, 0, { nocollide: true });
    // farmhouse
    b.room(-16, 4, 10, 8, 3, 'clapboard', { n: [door(5, 1.2), win(2.2), win(7.8)], e: [win(4)], w: [win(4)], s: [win(3), door(7.5, 1.1)] }, { roof: 'gableZ', roofH: 2.6, roofMat: 'shingles' });
    b.wall(-17.2, 0, -17.2, 8, 3, 0.18, 'clapboard', [door(4, 1.1)]); // inner wall, clear of the front door (x -16)
    b.box(-16, 0, -1.2, 10, 0.3, 2.2, 'planks', { collide: true }); // porch
    b.prop('bed', -19.5, 6, 0);
    b.prop('table', -13, 2, 0.1);
    b.prop('chair', -12.5, 3, 2.5);
    b.cont(CONT.CABINET, -12.4, 7.35, { prop: 'cabinet', ry: PI });
    b.cont(CONT.FRIDGE, -19.9, 1.1, { prop: 'fridge', ry: PI / 2 });
    b.partSpot(-18.5, 7);
    b.loot(-13, 2, 0.82);
    // silo, water tower
    b.cyl(24, 0, 16, 3, 13, 'metal');
    b.cone(24, 13, 16, 3.2, 2.5, 'tin', 14, { ry: 0 });
    b.prop('water_tower', -27, 18, 0.3);
    // field with fences
    for (let i = 0; i < 10; i++) {
      if (i === 4) continue;
      b.prop('fence', -44 + i * 3, -12, 0);
      b.prop('fence', -44 + i * 3, -42, 0);
    }
    for (let i = 0; i < 10; i++) {
      if (i === 6) continue;
      b.prop('fence', -45.5, -40.5 + i * 3, PI / 2);
      b.prop('fence', -15.5, -40.5 + i * 3, PI / 2);
    }
    b.prop('scarecrow', -30, -27, 0.4);
    b.prop('scarecrow', -22, -35, 2.1);
    b.prop('hay_round', -36, -20, 1.1);
    b.prop('hay_round', -22, -18, 0.2);
    b.prop('hay_round', -38, -33, 2.4);
    for (let i = 0; i < 12; i++) b.prop('pumpkin', rng.range(-42, -18), rng.range(-40, -14), rng.range(0, 6), { nocollide: true });
    b.wreck('tractor', 3, -14, 0.5, { trunk: false });
    b.wreck('pickup_truck', -6, -8, 1.7);
    b.prop('well', -4, 13, 0);
    b.prop('outhouse', -27, 3, 1.57);
    b.cont(CONT.LOGPILE, -9, 14, { prop: 'woodpile', ry: 0.2 });
    b.prop('corpse', 1, -9, 2.2, { nocollide: true });
    b.loot(-30, -26);
    b.loot(3, -11);
  });

  // BLACKWATER DOCK -------------------------------------------------
  place(ZONE.DOCK, (b, z) => {
    const deckY = WATER_LEVEL + 1.1 - z.h; // relative to zone base
    // pier: runs +Z (toward the lake) in 4 m spans from z 9; a ninth, short one carries the deck the last 2 m to the
    // T end (z 43-47), so there is no hole to stop a survivor short of the crate out there
    for (let i = 0; i < 9; i++) {
      const len = i < 8 ? 4 : 2;
      b.box(0, deckY - 0.22, 9 + i * 4 + len / 2, 3, 0.22, len + 0.05, 'dockwood', { collide: true });
      b.cyl(-1.4, deckY - 3.5, 9.2 + i * 4, 0.14, 3.6, 'dockwood', { collide: false });
      b.cyl(1.4, deckY - 3.5, 9.2 + i * 4, 0.14, 3.6, 'dockwood', { collide: false });
    }
    b.box(0, deckY - 0.22, 45, 9, 0.22, 4, 'dockwood', { collide: true }); // T end
    b.prop('dock_post', -4.2, 46.5, 0, { ly: deckY - 0.1 });
    b.prop('dock_post', 4.2, 46.5, 0, { ly: deckY - 0.1 });
    b.prop('boat', 3.4, 38, 0.15, { y: WATER_LEVEL - 0.15, nocollide: true });
    b.prop('boat', -3.6, 30, -0.3, { y: WATER_LEVEL - 0.15, nocollide: true });
    b.cont(CONT.CRATE, -0.6, 44.5, { prop: 'crate', ly: deckY, ry: 0.3 });
    b.prop('barrel', 3.2, 45.2, 0, { ly: deckY });
    b.loot(-3.5, 45.5, deckY + 0.02);
    // boathouse
    b.room(-9, 6, 8, 10, 3.2, 'planks', { n: [door(4, 1.3)], s: [gap(4, 4, 2.8)], e: [win(5)], w: [win(5)] }, { roof: 'gable', roofH: 2.2, roofMat: 'tin' });
    b.cont(CONT.SHELF, -12.4, 6, { prop: 'shelf', ry: PI / 2 });
    b.prop('boat', -8, 7.5, 0.05, { ly: 0.12, nocollide: true });
    b.cont(CONT.TOOLBOX, -6, 2.5, { prop: 'crate_small', ry: 0.4, h: 0.62 });
    b.loot(-11.6, 3);
    b.partSpot(-6, 9.8);
    // shed
    b.room(9, -1, 4, 4, 2.6, 'tin', { n: [door(2, 1.2)] }, { roof: 'flat', roofMat: 'tin' });
    b.cont(CONT.CABINET, 9.6, 0.5, { prop: 'cabinet', ry: PI });
    b.partSpot(8, 0.2);
    b.prop('fuel_tank', 12, 9, 0.2);
    b.prop('barrel', 7, 5, 0);
    b.prop('barrel', 7.8, 5.6, 0);
    b.prop('pallet', 5, 2, 0.4);
    b.prop('crate', 5.2, 2.1, 0.1, { ly: 0.15 });
    b.wreck('car_wreck', 1, -11, 1.3);
    b.prop('dock_post', -2.5, 8.5, 0);
    b.prop('dock_post', 2.5, 8.5, 0);
    b.prop('bones', 4, 12, 0, { nocollide: true, ground: true });
    b.loot(3.5, -3);
  });

  // ROUTE 9 GAS STATION ---------------------------------------------
  place(ZONE.GAS, (b) => {
    b.box(0, -0.05, -6, 30, 0.1, 22, 'concrete', { collide: true }); // forecourt
    // store
    b.room(-3, 10, 12, 8, 3.4, 'brick', { n: [door(6, 1.6), win(2.5, 3, 0.9, 2.5), win(9.5, 3, 0.9, 2.5)], w: [win(4)], s: [door(2, 1.1)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.cont(CONT.SHELF, -6, 11, { prop: 'shelf', ry: 0 });
    b.cont(CONT.SHELF, -1, 11, { prop: 'shelf', ry: 0 });
    b.cont(CONT.SHELF, -3.5, 13.3, { prop: 'shelf', ry: PI });
    b.cont(CONT.FRIDGE, 2.3, 13.4, { prop: 'fridge', ry: PI });
    b.prop('table', 1.5, 8, 0.0);
    b.loot(1.5, 8, 0.82);
    b.partSpot(-8, 13);
    // garage
    b.room(8, 10, 7, 8, 4, 'tin', { n: [gap(3.5, 5, 3.6)], e: [win(4)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'concrete' });
    b.prop('car_wreck', 8, 10.5, 0.05);
    b.cont(CONT.SHELF, 10.9, 11, { prop: 'shelf', ry: -PI / 2 });
    b.cont(CONT.TOOLBOX, 5.3, 7.2, { prop: 'toolbox', ry: 0.3, nocollide: true });
    b.prop('tire_pile', 5.4, 13, 0);
    b.partSpot(10.5, 13.2);
    // canopy + pumps
    for (const [px, pz] of [[-5, -6], [5, -6], [-5, -12], [5, -12]]) b.cyl(px, 0, pz, 0.18, 4.6, 'metal');
    b.box(0, 4.6, -9, 13, 0.55, 8.5, 'metal', { collide: false });
    b.prop('gas_pump', -2, -9, 0);
    b.prop('gas_pump', 2, -9, 0);
    b.cont(CONT.DUMPSTER, -11, 12, { prop: 'dumpster', ry: 1.57 });
    b.wreck('car_wreck', -12, -5, 0.8);
    b.wreck('car_wreck', 9, -17, 2.2);
    b.prop('road_sign', -14, -18, 0.3);
    b.prop('streetlight', 12.5, -18.5, 0); // (clear of the wreck's tail, which reaches 10.8, -18.3)
    b.prop('streetlight', -10, -18, 0);
    b.prop('barrel', 12, 4, 0);
    b.prop('corpse', 3, -4, 0.8, { nocollide: true });
    b.loot(-11.5, 9.6);
    b.loot(12.5, 3);
  });

  // ARMY CHECKPOINT: Route 9 roadblock - barriers, tents, a traffic jam nobody drove out of.
  place(ZONE.CHECKPOINT, (b) => {
    b.prop('jersey_barrier', -2, -5, 0);
    b.prop('jersey_barrier', 2.2, 3, 0);
    b.prop('jersey_barrier', -6, -5, 0, { seed: 2 });
    b.prop('jersey_barrier', 6.2, 3, 0, { seed: 3 });
    b.prop('boom_gate', 1.8, -11, 0);
    b.prop('military_tent', -12, -2, PI / 2);
    b.prop('military_tent', 12.5, 8, -PI / 2);
    b.cont(CONT.LOCKER, -9.2, 3.6, { prop: 'locker', ry: -PI / 2 });
    b.cont(CONT.LOCKER, 9.6, 2.2, { prop: 'locker', ry: PI / 2, seed: 1 });
    b.cont(CONT.AMMO_BOX, -9.5, -7, { prop: 'military_crate', ry: 0.2 });
    b.cont(CONT.AMMO_BOX, 10, 13.5, { prop: 'military_crate', ry: -0.3 });
    b.prop('military_crate', 10.3, 13.4, -0.3, { ly: 0.7 });
    b.cont(CONT.DUFFEL, -13, -8, { prop: 'duffel_bag', ry: 2.2, nocollide: true });
    for (let i = 0; i < 6; i++) {
      const a = PI * 0.25 + (i / 5) * PI * 0.5;
      b.prop('sandbags', -10 + Math.cos(a) * 4, 14 + Math.sin(a) * 4, -a + PI / 2);
    }
    b.prop('hunting_stand', 10, -12, PI / 2);
    b.prop('generator', -15, 6, 0.3);
    b.prop('streetlight', -5.5, 10, PI / 2);
    b.prop('streetlight', 5.5, -14, -PI / 2);
    b.prop('barrel', -7.5, 9, 0);
    b.light(-7.5, 1.0, 9, 'embers');
    b.prop('barrel', 7.8, -8, 0);
    b.light(7.8, 1.0, -8, 'embers');
    b.prop('body_bag', 14, -3, 0.2, { nocollide: true });
    b.prop('body_bag', 15, -2.2, 0.3, { nocollide: true });
    b.wreck('pickup_truck', -9, 21.8, 0.1, { seed: 1 }); // (its nose clear of the sandbag nest's curve, which reaches z = 18)
    // abandoned traffic queue in both directions
    for (let i = 0; i < 4; i++) {
      b.wreck('car_wreck', -1.9 + (i % 2) * 0.4, -22 - i * 7.5, 0.05 * (i - 1.5), { trunk: i % 2 === 0 });
      b.wreck('car_wreck', 1.9 - (i % 2) * 0.4, 18 + i * 7.5, PI + 0.06 * (i - 1.5), { trunk: i % 2 === 1 });
    }
    b.partSpot(-12, 3.5);
    b.partSpot(12.8, 13);
    b.loot(-8, -9);
    b.loot(8.5, 12);
    // The machine-gun nest on the verge beside the boom gate, covering the lane out of the checkpoint: the tripod
    // (the gun on it is an entity, shared/mountedgun.js finds the nest by this prop) in a horseshoe of sandbags,
    // open at the back - the way in for the gunner, and for whatever comes for them. Every seed is given: the
    // nest draws nothing from the valley's random stream.
    {
      const n = b.sub(4.2, -7.8);
      n.prop('mg_tripod', 0, 0, 0, { seed: 0 });
      n.prop('sandbags', -1.05, -1.45, 0.2, { seed: 0 });
      n.prop('sandbags', 1.05, -1.45, -0.2, { seed: 1 });
      n.prop('sandbags', -2.2, 0, PI / 2 - 0.12, { seed: 1 });
      n.prop('sandbags', 2.2, 0, PI / 2 + 0.12, { seed: 0 });
    }
  });

  // WHITLOCK DEPOT and the rest of the railway (rail.js): the freight train stalled on the line, the tunnel mouths,
  // the plank crossings. Built on a stream of its own, like the mine: no other place moves for it.
  if (rail) rail.build({ place, builder: (x, z, ry, y) => new Builder(x, z, ry, y), roads, staticGrid, K: { door, win, gap } });

  // HARLAN SAWMILL: an open mill shed, log yard, office and workshop.
  place(ZONE.SAWMILL, (b) => {
    for (const px of [-12, -6, 0, 6, 12]) for (const pz of [-6, 6]) b.cyl(px, 0, pz, 0.2, 5.2, 'metal', { sides: 8 });
    b.box(0, 5.2, 0, 26, 0.2, 14, 'tin_rust', { collide: false });
    b.wall(-13, 6.3, 13, 6.3, 5.2, 0.25, 'barn');
    b.prop('saw_table', 0, 0, 0);
    b.cont(CONT.LOGPILE, -7.5, 1, { prop: 'log_pile', ry: 0 });
    b.box(7.8, 0, -1.4, 3.6, 0.9, 1.3, 'planks', { collide: true });
    b.box(7.8, 0, 1.2, 3.6, 1.3, 1.3, 'planks', { collide: true });
    b.cont(CONT.LOGPILE, 9.8, -3.6, { prop: 'pallet', ry: 0.2, h: 0.4 });
    b.cont(CONT.LOGPILE, -20, -12, { prop: 'log_pile', ry: 0.4 });
    b.prop('log_pile', -20, 9, -0.3);
    b.cont(CONT.LOGPILE, 20, -13, { prop: 'log_pile', ry: -0.2, seed: 2 });
    b.prop('log_pile', 21, 10, 0.5, { seed: 3 });
    // office
    b.room(-15, 19, 7, 6, 3, 'logwall', { n: [door(3.5), win(1.5), win(5.6)], e: [win(3)] }, { roof: 'gable', roofH: 2, roofMat: 'shingles' });
    b.cont(CONT.CABINET, -17.6, 21.4, { prop: 'cabinet', ry: PI });
    b.cont(CONT.LOCKER, -12.4, 21.1, { prop: 'locker', ry: -PI / 2 });
    b.prop('table', -15, 20, 0);
    b.loot(-15, 20, 0.82);
    b.partSpot(-17, 18.6);
    // workshop
    b.room(15, 19, 7, 6, 3.2, 'tin', { n: [gap(3.5, 3.2, 2.8)] }, { roof: 'flat', roofMat: 'tin' });
    b.cont(CONT.TOOLBOX, 13, 21, { prop: 'toolbox', ry: 0.2, nocollide: true });
    b.cont(CONT.SHELF, 17.9, 20, { prop: 'shelf', ry: -PI / 2 });
    b.partSpot(16.6, 21.2);
    b.wreck('pickup_truck', 5, -20, 0.2);
    b.wreck('tractor', -6, -21, -0.3, { trunk: false });
    b.prop('woodpile', -24, -1, PI / 2);
    b.prop('woodpile', 25, 1, PI / 2);
    b.prop('barrel', 3, 12, 0);
    b.prop('generator', -3, 11.5, 0);
    b.prop('corpse', 2, -9, 1.4, { nocollide: true });
    b.loot(-4, -10);
    b.loot(11, 12);
  });

  // RANGER LOOKOUT ---------------------------------------------------
  place(ZONE.RANGER, (b) => {
    b.prop('watchtower', 7, 7, 0.2);
    b.room(-6, 2, 8, 6, 3, 'logwall', { n: [door(4, 1.2), win(1.8), win(6.2)], e: [win(3)], w: [win(3)] }, { roof: 'gable', roofH: 2.2, roofMat: 'shingles' });
    b.prop('bed', -8.5, 3.05, 0); // (its foot clear of the cabinet against the back wall)
    b.prop('table', -4, 3.6, 0);
    b.cont(CONT.LOCKER, -2.6, 1, { prop: 'locker', ry: -PI / 2 });
    b.cont(CONT.CABINET, -8.8, 4.35, { prop: 'cabinet', ry: PI });
    b.loot(-4, 3.6, 0.82);
    b.partSpot(-8.6, 0.5);
    // shed
    b.room(-6, 14, 6, 6, 2.8, 'planks', { n: [gap(3, 3, 2.4)] }, { roof: 'flat', roofMat: 'tin' });
    b.partSpot(-7.8, 15.8);
    b.cont(CONT.TOOLBOX, -4.3, 15.5, { prop: 'toolbox', ry: 1, nocollide: true });
    b.prop('radio_mast', 13, -6, 0);
    b.prop('generator', 9.5, -4, 0.4);
    b.prop('outhouse', -15, 9, 1.57);
    b.prop('picnic_table', 2, -8, 0.3);
    b.prop('picnic_table', -3, -11, 1.9);
    b.wreck('pickup_truck', 9, -13, 0.5);
    b.prop('lantern_post', 1, -3, 0);
    b.cont(CONT.LOGPILE, -11.5, -1, { prop: 'woodpile', ry: 1.57 });
    b.cont(CONT.DUFFEL, 7, 7, { prop: 'duffel_bag', ry: 0.4, nocollide: true });
    b.loot(2, -8, 0.82);
  });

  // HUNTING CABINS ---------------------------------------------------
  place(ZONE.CABINS, (b, z) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + 0.5;
      const cx = Math.sin(a) * 15;
      const cz = Math.cos(a) * 15;
      const sub = new Builder(b.wx(cx, cz), b.wz(cx, cz), b.ry + a, z.h);
      sub.zone = z.id;
      // sub's -Z side faces the clearing center -> door on the north wall
      sub.room(0, 0, 6, 5, 2.7, 'logwall', { n: [door(3, 1.1)], e: [win(2.5)], w: [win(2.5)] }, { roof: 'gable', roofH: 2, roofMat: 'shingles' });
      sub.prop('bed', -1.8, 0.8, 0); // (clear of the cabinet against the back wall)
      sub.prop('table', 1.6, 1.3, 0);
      sub.loot(1.6, 1.3, 0.82);
      if (i % 2 === 0) sub.cont(CONT.CABINET, -2.2, 2.1, { prop: 'cabinet', ry: PI });
      else sub.cont(CONT.DUFFEL, 0.4, 0.6, { prop: 'duffel_bag', ry: 0.3, nocollide: true });
      if (i < 2) sub.partSpot(-1.8, -1.2);
      if (i % 2 === 0) sub.cont(CONT.LOGPILE, 4.1, 0, { prop: 'woodpile', ry: PI / 2 });
    }
    b.prop('well', 0, 0, 0);
    b.prop('picnic_table', 5, 4, 0.4);
    b.prop('outhouse', -8, 22, 0);
    b.prop('corpse', -4, -5, 1.3, { nocollide: true });
    b.prop('bones', 6, -6, 0, { nocollide: true });
    b.prop('lantern_post', 3, -3, 0);
    b.loot(0, 5.5);
    for (let i = 0; i < 10; i++) {
      const a = rng.range(0, PI * 2);
      const r = rng.range(8, 22);
      b.tree(Math.sin(a) * r, Math.cos(a) * r, rng.int(0, 2), rng.range(0.8, 1.1));
    }
  });

  // MILITARY CRASH SITE ----------------------------------------------
  place(ZONE.MILITARY, (b) => {
    b.wreck('heli_wreck', 0, 7, 0.6, { trunk: false });
    b.prop('military_tent', -14, -3, 0.2);
    b.prop('military_tent', -12, 12, 1.4);
    b.prop('military_tent', 14, -5, -0.3);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2;
      if (i === 0 || i === 7) continue; // entrances
      b.prop('sandbags', Math.sin(a) * 23, Math.cos(a) * 23, a + PI / 2);
    }
    b.cont(CONT.AMMO_BOX, 4, -3, { prop: 'military_crate', ry: 0.2 });
    b.prop('military_crate', 4.2, -3.1, 0.25, { ly: 0.7 });
    b.cont(CONT.AMMO_BOX, 5.8, -2.4, { prop: 'military_crate', ry: 1.3 });
    b.cont(CONT.AMMO_BOX, -6, 16, { prop: 'military_crate', ry: 0.7 });
    b.cont(CONT.LOCKER, -10.9, -4.5, { prop: 'locker', ry: -PI / 2 + 0.2 });
    b.cont(CONT.DUFFEL, 13, -2, { prop: 'duffel_bag', ry: 0.6, nocollide: true });
    b.prop('barrel', 8, 14, 0);
    b.prop('barrel', 8.8, 14.6, 0);
    b.wreck('generator', -9, 6, 0.9, { trunk: false });
    b.prop('body_bag', -5, -9, 0.2, { nocollide: true });
    b.prop('body_bag', -3.8, -9.4, 0.25, { nocollide: true });
    b.prop('body_bag', -2.6, -9.2, 0.1, { nocollide: true });
    b.prop('radio_mast', 16, 10, 0);
    b.prop('fuel_tank', -17.5, 5, 0); // (between the west tents, both ends inside the sandbag ring 23 m out)
    // (a tent is one solid box: what belongs to it lies in front of its open flap, where it can be seen)
    b.loot(-14.3, -6.6);
    b.loot(14.6, -8.6);
    b.loot(2, 3);
    b.partSpot(15.6, -8.3);
    b.partSpot(-15.5, 10.9);
    b.light(0, 0.5, 7, 'embers');
  });

  // ST. AGNES CHAPEL + GRAVEYARD -----------------------------------------------
  place(ZONE.CHURCH, (b) => {
    const tall = (at) => ({ at, w: 1.1, y0: 1.3, y1: 3.6, glass: true });
    b.room(0, 6, 9, 18, 5, 'clapboard', { n: [door(4.5, 1.6)], e: [tall(3), tall(7.5), tall(12), tall(16)], w: [tall(2), tall(6.5), tall(11), tall(15)] }, { roof: 'gable', roofH: 4.2, roofMat: 'shingles' });
    // steeple on the front of the ridge, with an open belfry under the spire: the bell hangs in it and its rope
    // comes down through the ceiling just inside the door (BELL_AT / BELL_ROPE in shared/fixtures.js)
    b.box(0, 5, -1.3, 2.6, 4.3, 2.6, 'clapboard', { collide: false });
    b.box(0, 9.3, -1.3, 3.0, 0.14, 3.0, 'trim', { collide: false });
    for (const [px, pz] of [[-1.15, -2.45], [1.15, -2.45], [-1.15, -0.15], [1.15, -0.15]]) b.box(px, 9.44, pz, 0.3, 1.66, 0.3, 'clapboard', { collide: false });
    b.prop('church_bell', 0, -1.3, 0, { ly: 9.56, seed: 0, nocollide: true }); // (a given seed: no draw from the world's stream)
    b.box(0, 11.1, -1.3, 3.0, 0.3, 3.0, 'trim', { collide: false });
    b.cone(0, 11.4, -1.3, 2.0, 6.5, 'shingles', 4);
    b.box(0, 17.8, -1.3, 0.12, 1.5, 0.12, 'trim', { collide: false });
    b.box(0, 18.6, -1.3, 0.8, 0.12, 0.12, 'trim', { collide: false });
    b.cyl(-1.05, 1.1, -1.3, 0.025, 3.9, 'rope', { collide: false, sides: 6 });
    b.cyl(-1.05, 1.2, -1.3, 0.05, 0.5, 'taillight', { collide: false, sides: 8 }); // the sally: where a hand takes the rope
    for (let r = 0; r < 6; r++) {
      b.prop('pew', -2.2, 1 + r * 1.8, 0);
      b.prop('pew', 2.2, 1 + r * 1.8, 0);
    }
    b.prop('altar', 0, 13.2, 0);
    b.prop('grave_cross', 0, 14.6, 0);
    b.loot(0, 13.2, 1.02);
    b.cont(CONT.CABINET, -3.4, 14.4, { prop: 'cabinet', ry: PI });
    b.cont(CONT.DUFFEL, 3.2, 3.5, { prop: 'duffel_bag', ry: 1.1, nocollide: true });
    b.partSpot(3.6, 14.3);
    // shed
    b.room(-9, 18, 4, 4, 2.6, 'planks', { e: [door(2, 1.2)] }, { roof: 'flat', roofMat: 'tin' });
    b.cont(CONT.TOOLBOX, -9.5, 18.8, { prop: 'toolbox', ry: 0.4, nocollide: true });
    b.partSpot(-10, 17);
    // the graves: St. Agnes Cemetery behind the chapel, the old churchyard beside it (cemetery.js)
    cemetery = buildCemetery(b, { seed, heightAt, staticGrid });
    b.prop('lantern_post', -3, -5, 0);
    b.prop('lantern_post', 3, -5, 0);
    b.prop('corpse', 14, 2, 0.5, { nocollide: true });
    b.loot(20.5, 6.2);
    for (let i = 0; i < 12; i++) b.tree(rng.range(-30, 40), rng.range(-30, 36), rng.chance(0.5) ? 3 : 4, rng.range(0.8, 1.2));
  });

  // RELAY STATION: fenced hilltop compound with a mast, dishes and an equipment hut.
  place(ZONE.RELAY, (b) => {
    const FX = 15;
    const FZ = 12;
    for (let x = -FX + 1.5; x < FX; x += 3) {
      if (Math.abs(x) > 3) b.prop('fence_chain', x, -FZ, 0);
      b.prop('fence_chain', x, FZ, 0);
    }
    for (let zz = -FZ + 1.5; zz < FZ; zz += 3) {
      b.prop('fence_chain', -FX, zz, PI / 2);
      b.prop('fence_chain', FX, zz, PI / 2);
    }
    b.prop('radio_mast', 8, 5, 0);
    b.prop('satellite_dish', -9, 6, 0.4);
    b.prop('satellite_dish', -10, -5, -0.3, { seed: 1 });
    b.room(1, 4, 6, 5, 2.8, 'concrete', { n: [door(3, 1.3), win(5, 0.9)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.cont(CONT.LOCKER, 3.4, 5.9, { prop: 'locker', ry: PI });
    b.cont(CONT.CABINET, -1.1, 5.9, { prop: 'cabinet', ry: PI });
    b.cont(CONT.TOOLBOX, 0.4, 2.6, { prop: 'toolbox', ry: 0.2, nocollide: true });
    b.partSpot(-1.2, 3);
    b.wreck('generator', 10, -6, 0.3, { trunk: false });
    b.prop('generator', 11.8, -4, -0.2);
    b.prop('fuel_tank', 5, -7.5, PI / 2);
    b.partSpot(-8, 9);
    b.wreck('pickup_truck', -4, -18, 0.3);
    b.prop('barrel', 12.5, 9.5, 0);
    b.loot(6, -3);
    // the radio set, on its cabinet beside the foot of the mast and under open sky: the crate a survivor calls down with
    // it lands where they stand (RADIO_AT in shared/fixtures.js; a given seed: no draw from the world's stream)
    b.prop('radio_set', 9.4, 4.3, 0, { seed: 0 });
  });

  // GRANITE QUARRY: a sunken pit with gravel piles, a dump truck, an office and a blasting bunker.
  place(ZONE.QUARRY, (b) => {
    b.prop('gravel_pile', 10, -16, 0);
    b.prop('gravel_pile', 17, 6, 1.2, { seed: 1 });
    b.prop('gravel_pile', -2, 22, 2.1, { seed: 2 });
    b.wreck('dump_truck', -4, -6, 0.5, { trunk: false });
    b.wreck('dump_truck', 12, 16, -2.3, { trunk: false, seed: 1 });
    // conveyor
    b.box(16, 1.4, -2, 12, 0.3, 1.2, 'rust', { rz: 0.22, collide: false });
    for (const lx of [11, 15, 19]) b.box(lx, 0, -2, 0.25, 0.9 + (lx - 11) * 0.22, 0.25, 'rust', { collide: true });
    // office
    b.room(-24, 10, 6, 5, 2.8, 'tin', { n: [door(3, 1.2)], e: [win(2.5)] }, { roof: 'flat', roofMat: 'tin' });
    b.cont(CONT.CABINET, -26.1, 11.9, { prop: 'cabinet', ry: PI });
    b.cont(CONT.LOCKER, -21.6, 11.4, { prop: 'locker', ry: -PI / 2 });
    b.partSpot(-24, 11.5);
    // blasting bunker
    b.room(-24, -14, 4.5, 4, 2.4, 'concrete', { n: [door(2.25, 1.2)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.cont(CONT.AMMO_BOX, -24, -12.9, { prop: 'military_crate', ry: 0, zone: ZONE.QUARRY });
    b.partSpot(-25.5, -15);
    b.cont(CONT.TOOLBOX, 3, 10, { prop: 'toolbox', ry: 0.5, nocollide: true });
    b.prop('generator', 6, 9, 0.3);
    b.prop('streetlight', -14, -2, PI / 2);
    b.prop('barrel', -18, 3, 0);
    b.prop('barrel', -18.7, 3.8, 0);
    b.prop('corpse', 4, -12, 2.1, { nocollide: true });
    b.loot(-8, 6);
    b.loot(20, -8);
  });

  // HOLLOW CREEK: the village crossroads - diner, general store, police station, garage, houses.
  place(ZONE.VILLAGE, (b) => {
    // diner (NW)
    b.room(-15, -14, 12, 8, 3.2, 'clapboard', { e: [door(4, 1.4), win(1.5, 1.6), win(6.5, 1.6)], n: [win(3), win(9)], s: [door(10, 1.1)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'planks' });
    b.box(-17, 0, -14, 0.8, 1.05, 5, 'planks', { collide: true }); // counter
    b.cont(CONT.FRIDGE, -20.5, -16.5, { prop: 'fridge', ry: PI / 2 });
    b.cont(CONT.CABINET, -20.2, -10.4, { prop: 'cabinet', ry: 0 }); // in the corner beside the back door (x -19), facing the kitchen
    b.prop('table', -11.5, -16, 0);
    b.prop('table', -11.5, -12, 0);
    b.prop('chair', -12.2, -15.2, 0.3);
    b.loot(-11.5, -12, 0.82);
    // general store (NE)
    b.room(15, -15, 12, 10, 3.4, 'brick', { w: [door(5, 1.6), win(1.8, 2.4, 0.9, 2.4), win(8.2, 2.4, 0.9, 2.4)], s: [door(9, 1.1)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.cont(CONT.SHELF, 13, -17, { prop: 'shelf', ry: PI / 2 });
    b.cont(CONT.SHELF, 17, -17, { prop: 'shelf', ry: -PI / 2 });
    b.cont(CONT.SHELF, 15, -12, { prop: 'shelf', ry: 0 });
    b.cont(CONT.FRIDGE, 20.5, -12, { prop: 'fridge', ry: -PI / 2 });
    b.cont(CONT.CABINET, 11, -19.4, { prop: 'cabinet', ry: 0 });
    b.partSpot(19.5, -19);
    b.loot(12, -12);
    // police station (SE)
    b.room(15, 14, 11, 9, 3.3, 'brick', { w: [door(4.5, 1.5), win(1.6), win(7.4)], e: [win(4.5)], n: [win(5.5)] }, { roof: 'flat', roofMat: 'concrete' });
    b.cont(CONT.LOCKER, 20, 17.5, { prop: 'locker', ry: -PI / 2 });
    b.cont(CONT.LOCKER, 20, 15.5, { prop: 'locker', ry: -PI / 2, seed: 1 });
    b.cont(CONT.AMMO_BOX, 12, 17.9, { prop: 'military_crate', ry: PI, zone: ZONE.VILLAGE });
    b.prop('table', 14, 12, 0);
    b.loot(14, 12, 0.82);
    b.wreck('car_wreck', 8, 24, 0.1, { seed: 3 });
    // auto shop (E)
    b.room(31, 12, 9, 10, 4, 'tin', { w: [gap(5, 5, 3.6)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'concrete' });
    b.prop('car_wreck', 31.5, 12, PI / 2 + 0.05, { seed: 5 });
    b.cont(CONT.TOOLBOX, 33.8, 8.2, { prop: 'toolbox', ry: 0, nocollide: true });
    b.cont(CONT.SHELF, 34.8, 15.5, { prop: 'shelf', ry: -PI / 2 });
    b.prop('tire_pile', 28.4, 16, 0);
    b.partSpot(34, 16.2);
    b.partSpot(28.6, 8);
    // houses (SW + S)
    const house = (hx, hz, doorSide, seed) => {
      const sides = { n: [win(2.5), win(6.5)], s: [win(4.5)], w: [win(4)], e: [win(4)] };
      sides[doorSide] = [door(doorSide === 'e' || doorSide === 'w' ? 4 : 4.5)];
      b.room(hx, hz, 9, 8, 3, seed % 2 ? 'clapboard' : 'logwall', sides, { roof: 'gable', roofH: 2.6, roofMat: 'shingles' });
      b.prop('bed', hx - 2.8, hz + 2.2, 0);
      b.cont(seed % 2 ? CONT.CABINET : CONT.FRIDGE, hx + 3.6, hz + 3.35, { prop: seed % 2 ? 'cabinet' : 'fridge', ry: PI });
      b.prop('table', hx + 1, hz - 1, 0.1);
      b.loot(hx + 1, hz - 1, 0.82);
    };
    house(-15, 13, 'e', 1);
    house(-15, 29, 'e', 2);
    house(15, 32, 'w', 3);
    house(-28, 9, 'n', 4); // south of the east-west street, its door on it
    b.prop('water_tower', -30, -30, 0.2);
    b.cont(CONT.DUMPSTER, 23, -23, { prop: 'dumpster', ry: 0 });
    b.cont(CONT.DUMPSTER, -22, -21, { prop: 'dumpster', ry: PI, seed: 1 });
    b.wreck('school_bus', -5.5, 36, 0.35, { trunk: false });
    b.cont(CONT.DUFFEL, -3, 30.4, { prop: 'duffel_bag', ry: 0.8, nocollide: true });
    b.wreck('car_wreck', 5.5, -28, PI + 0.1);
    b.wreck('car_wreck', -5.8, 6, 0.08, { seed: 2 });
    b.wreck('pickup_truck', 24, 2, PI / 2 + 0.1, { trunk: false });
    for (const [mx, mz] of [[-6, -24], [6, 20], [-6, 20]]) b.prop('mailbox', mx, mz, 0);
    for (const [sx, sz] of [[-6, -6], [6, 6], [6, -33.5], [-6, 30]]) b.prop('streetlight', sx, sz, PI / 2); // (6, -33.5: past the wreck parked at 5.5, -28)
    b.prop('corpse', 2.5, -6, 0.7, { nocollide: true });
    b.prop('corpse', -2, 12, 2.3, { nocollide: true });
    b.loot(-4, -34);
    b.loot(26, -4);
  });

  // MERCY CLINIC (clinic.js): reception and a pharmacy in the daylight, and behind them a ward wing with its windows
  // boarded over. darks: the interiors no daylight gets into (world.darkAt), of which its wards are the only ones
  const darks = [];
  let clinic = null;
  place(ZONE.CLINIC, (b) => {
    clinic = buildClinic(b, { seed, parts, darks });
  });

  // SHADY PINES TRAILERS: mobile homes along a gravel lane, a burnt-out trailer, a bus someone lived in.
  place(ZONE.TRAILERS, (b) => {
    const trailer = (cx, cz, flip, burnt, i) => {
      const s = b.sub(cx, cz, flip ? PI : 0);
      const mat = burnt ? 'charred' : i % 3 === 0 ? 'tin' : i % 3 === 1 ? 'tin_rust' : 'clapboard';
      s.room(0, 0, 10, 3.6, 2.6, mat, { n: burnt ? [gap(2.4, 1.4, 2.2), gap(6, 2, 2.4)] : [door(2.4, 1.1), win(5.4, 1.5), win(8.3, 1.1)], s: [win(3), win(7)], w: [win(1.8, 0.8)] }, { roof: burnt ? undefined : 'flat', roofMat: 'tin', floorMat: 'planks' });
      s.box(0, 0, -1.95, 10, 0.12, 0.8, 'planks', { collide: false }); // step
      if (!burnt) {
        s.cont(i % 2 ? CONT.CABINET : CONT.FRIDGE, 4.1, 1.2, { prop: i % 2 ? 'cabinet' : 'fridge', ry: PI });
        s.prop('bed', -3.3, 0.7, PI / 2);
        s.loot(1, 0);
      } else {
        s.loot(0, 0);
        s.prop('bones', 2, 0.4, 0, { nocollide: true });
      }
      return s;
    };
    const t0 = trailer(-10, -16, false, false, 0);
    trailer(-10, -2, false, false, 1);
    const t2 = trailer(-10, 12, false, true, 2);
    trailer(10.5, -12, true, false, 3);
    const t4 = trailer(10.5, 2, true, false, 4);
    trailer(10.5, 16, true, false, 5);
    t0.partSpot(-1.5, 0.5);
    t4.partSpot(-1.5, -0.4);
    void t2;
    b.wreck('school_bus', -22, 22, PI / 2 + 0.2, { trunk: false });
    b.cont(CONT.DUFFEL, -18.5, 19.2, { prop: 'duffel_bag', ry: 0.3, nocollide: true }); // beside the bus (it is one solid box)
    b.wreck('car_wreck', -4.5, -22, 0.3);
    b.wreck('car_wreck', 5.5, 8, PI + 0.4, { seed: 1 });
    b.wreck('pickup_truck', 5, -24, -0.5);
    b.cont(CONT.DUMPSTER, 19, -22, { prop: 'dumpster', ry: -PI / 2 });
    b.prop('tire_pile', -18, -8, 0);
    b.prop('barrel', 18, 22, 0);
    b.light(18, 1.0, 22, 'embers');
    b.prop('picnic_table', -18, 4, 0.5);
    b.prop('satellite_dish', 18, -4, 1.2);
    b.prop('corpse', 3, 20, 1.8, { nocollide: true });
    b.loot(-18, 4, 0.82);
    b.loot(3.5, -8);
  });

  // LAKESIDE CAMPGROUND: campsites along a loop lane, RVs, a ranger station by the water.
  place(ZONE.CAMPGROUND, (b) => {
    const site = (sx, sz, ry, withRv) => {
      const s = b.sub(sx, sz, ry);
      s.prop('tent', 0, 0, 0);
      s.prop('campfire', 0, -3.4, 0, { nocollide: true, seed: 1 });
      s.prop('log_bench', 2.05, -3.4, PI / 2); // (its end clear of the fire's ring of stones)
      s.prop('picnic_table', -3, -1.2, 0.2);
      s.cont(CONT.DUFFEL, 1.6, -1.2, { prop: 'duffel_bag', ry: 0.4, nocollide: true });
      if (withRv) s.wreck('camper', -5.5, 3, 0.15, { zone: ZONE.CAMPGROUND });
      s.loot(-3, -1.2, 0.82);
    };
    site(-12, -14, PI / 2, false);
    site(-13, 2, PI / 2, true);
    site(-11, 17, PI / 2 - 0.2, false);
    site(14, -16, -PI / 2, true);
    site(16, 0, -PI / 2 + 0.2, false);
    // ranger station
    b.room(17, 16, 8, 6, 3, 'logwall', { w: [door(3, 1.2), win(5)], s: [win(4)] }, { roof: 'gable', roofH: 2, roofMat: 'shingles' });
    b.cont(CONT.LOCKER, 20.5, 14, { prop: 'locker', ry: -PI / 2 });
    b.cont(CONT.CABINET, 17.5, 18.4, { prop: 'cabinet', ry: PI });
    b.partSpot(19.5, 17.5);
    b.partSpot(-17, 5);
    b.prop('outhouse', 4, 24, PI);
    b.prop('outhouse', 6, 24, PI);
    b.prop('boat', 8, 27, 1.2, { nocollide: true });
    b.prop('lantern_post', -4, -6, 0);
    b.prop('lantern_post', 7, 7, 0);
    b.cont(CONT.DUMPSTER, -4, 22, { prop: 'dumpster', ry: PI / 2 });
    b.prop('corpse', 6, -20, 0.2, { nocollide: true });
    b.loot(3, 12);
  });

  // DUTCH'S SALVAGE: a fenced scrapyard - rows of stacked wrecks, a car crusher and crane, the office and a parts shed.
  place(ZONE.SCRAPYARD, (b) => {
    const FX = 24;
    const FZ = 21;
    for (let x = -FX + 1.5; x < FX; x += 3) {
      if (Math.abs(x) > 4) b.prop('fence_chain', x, -FZ, 0);
      b.prop('fence_chain', x, FZ, 0);
    }
    for (let zz = -FZ + 1.5; zz < FZ; zz += 3) {
      b.prop('fence_chain', -FX, zz, PI / 2);
      b.prop('fence_chain', FX, zz, PI / 2);
    }
    b.prop('boom_gate', -0.4, -FZ, 0);
    b.prop('billboard', -10, -25, 0);
    // office
    b.room(-16, -13, 8, 6, 2.9, 'tin_rust', { e: [door(3, 1.2)], n: [win(4, 1.6)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'planks' });
    b.cont(CONT.LOCKER, -19.5, -12, { prop: 'locker', ry: -PI / 2 });
    b.cont(CONT.CABINET, -16.5, -10.45, { prop: 'cabinet', ry: 0 });
    b.prop('table', -15.5, -14.2, 0);
    b.loot(-15.5, -14.2, 0.82);
    b.partSpot(-19.2, -15.2);
    // parts shed
    b.room(15, -13, 7, 7, 3.4, 'tin', { w: [gap(3.5, 3.4, 2.9)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'concrete' });
    b.cont(CONT.SHELF, 18.1, -13, { prop: 'shelf', ry: PI / 2 });
    b.cont(CONT.SHELF, 15, -9.9, { prop: 'shelf', ry: 0, seed: 1 });
    b.cont(CONT.TOOLBOX, 13, -15.6, { prop: 'toolbox', ry: 0.4, nocollide: true });
    b.prop('tire_pile', 17.5, -15.5, 0);
    b.partSpot(17.4, -10.6);
    b.prop('generator', 9.6, -15.5, 0.2);
    // the rows: wrecks parked nose to tail, some stacked two high
    for (const [rz, xs] of [[-1, [-19.5, -16, -12.5]], [7, [-19.5, -16, -12.5, -9]], [15, [-19.5, -16, -12.5]]]) {
      for (const x of xs) {
        const ry = (rng.chance(0.5) ? 0 : PI) + rng.range(-0.08, 0.08);
        const type = rng.chance(0.8) ? 'car_wreck' : 'pickup_truck';
        b.wreck(type, x, rz, ry, { trunk: rng.chance(0.4) });
        if (type === 'car_wreck' && rng.chance(0.45)) b.prop('car_wreck', x + rng.range(-0.15, 0.15), rz + rng.range(-0.2, 0.2), ry + rng.range(-0.12, 0.12), { ly: 1.5 });
      }
    }
    // crusher, with what comes out of it
    b.box(12, 0, 6, 4.2, 0.5, 6.5, 'rust');
    b.box(10.1, 0.5, 6, 0.4, 2.6, 6.5, 'rust');
    b.box(13.9, 0.5, 6, 0.4, 2.6, 6.5, 'rust');
    b.box(12, 3.1, 6, 4.2, 0.5, 6.5, 'metal');
    b.box(12, 0.5, 6, 1.7, 0.9, 2.4, 'rust');
    b.box(17.2, 0, 2.2, 1.7, 0.9, 2.4, 'rust', { ry: 0.1 });
    b.box(17.3, 0.9, 2.3, 1.7, 0.9, 2.4, 'tin_rust', { ry: -0.15 });
    b.box(19.6, 0, 2, 1.7, 0.9, 2.4, 'tin_rust', { ry: 0.3 });
    b.cont(CONT.TOOLBOX, 9.2, 9.8, { prop: 'toolbox', ry: 1.2, nocollide: true });
    // crane
    b.box(4, 0, 15.5, 3, 1.5, 4, 'rust');
    b.cyl(4, 1.5, 15.5, 0.3, 6, 'rust', { sides: 8 });
    b.box(4, 7.3, 11.5, 0.5, 0.5, 9.5, 'rust', { collide: false });
    b.box(4, 4.6, 7.2, 0.06, 2.7, 0.06, 'dark', { collide: false });
    b.cyl(4, 4.2, 7.2, 0.9, 0.4, 'metal', { collide: false });
    b.partSpot(5.9, 17.6);
    b.wreck('school_bus', 20.3, 12.5, 0.03, { trunk: false });
    b.wreck('dump_truck', -3, 16.5, 1.45, { trunk: false });
    b.wreck('tractor', 1.5, 3, 0.6, { trunk: false });
    b.cont(CONT.DUMPSTER, -6, -18.6, { prop: 'dumpster', ry: PI });
    b.cont(CONT.DUMPSTER, 8, 18.8, { prop: 'dumpster', ry: 0, seed: 1 });
    b.cont(CONT.CRATE, -6.5, -4, { prop: 'crate', ry: 0.3 });
    for (const [tx, tz] of [[-21.6, 19], [-19.9, 18.5], [8.5, -5], [1, 19]]) b.prop('tire_pile', tx, tz, 0);
    b.prop('barrel', 0.5, -3, 0);
    b.light(0.5, 1.0, -3, 'embers');
    b.prop('barrel', 9.5, -8, 0);
    b.prop('streetlight', -6, -19.6, PI);
    b.prop('streetlight', 6, -19.6, PI);
    b.prop('corpse', 2.5, -9, 0.9, { nocollide: true });
    b.prop('corpse', -9.5, 11.5, 2.4, { nocollide: true });
    b.loot(0, -7);
    b.loot(14.5, 11.5);
    b.loot(-5.5, 9.5);
  });

  // CAMP TAMARACK: a summer camp among the pines - bunk cabins either side of the fire circle, the mess hall behind it.
  place(ZONE.SUMMERCAMP, (b) => {
    // mess hall
    b.room(0, 17, 14, 8, 3.4, 'logwall', { n: [door(7, 1.6), win(2.6, 1.6), win(11.4, 1.6)], e: [win(4)], w: [win(4)], s: [door(11.5, 1.1)] }, { roof: 'gableZ', roofH: 2.8, roofMat: 'shingles' });
    b.prop('picnic_table', -3.6, 16, 0);
    b.prop('picnic_table', 0.4, 16, 0);
    b.loot(0.4, 16, 0.82);
    b.cont(CONT.FRIDGE, 6.4, 19.4, { prop: 'fridge', ry: PI / 2 });
    b.cont(CONT.CABINET, 3.6, 20.5, { prop: 'cabinet', ry: 0 });
    b.cont(CONT.SHELF, 0.6, 20.6, { prop: 'shelf', ry: 0 });
    b.partSpot(6.2, 14.2);
    b.cont(CONT.LOGPILE, 8.7, 16, { prop: 'woodpile', ry: PI / 2 });
    b.cont(CONT.DUMPSTER, 2, 23.2, { prop: 'dumpster', ry: 0 });
    // bunk cabins, doors on the fire circle
    const bunk = (cx, cz, ry, i) => {
      const s = b.sub(cx, cz, ry);
      s.room(0, 0, 6, 5, 2.7, 'planks', { n: [door(3, 1.1)], e: [win(2.5)], w: [win(2.5)] }, { roof: 'gable', roofH: 1.9, roofMat: 'shingles' });
      s.prop('bed', -2.3, 0.9, 0);
      s.prop('bed', 2.3, 0.9, 0);
      if (i % 2) s.cont(CONT.LOCKER, 0, 2.1, { prop: 'locker', ry: 0 });
      else s.cont(CONT.DUFFEL, 0, 1.5, { prop: 'duffel_bag', ry: 0.6, nocollide: true });
      s.loot(0, -0.6);
      return s;
    };
    bunk(-19, -10, -PI / 2, 0).partSpot(2.4, -1.8);
    bunk(-19, 3, -PI / 2, 1);
    bunk(19, -10, PI / 2, 2);
    bunk(19, 3, PI / 2, 3).partSpot(-2.4, -1.8);
    // fire circle + flagpole
    b.prop('campfire', 0, -3, 0, { nocollide: true, seed: 1 });
    b.prop('log_bench', 3, -3, 0);
    b.prop('log_bench', -3, -3, 0);
    b.prop('log_bench', 0, 0, PI / 2);
    b.prop('log_bench', 0, -6, PI / 2);
    b.cyl(6, 0, -12, 0.06, 7.5, 'metal', { sides: 6 });
    b.box(6.6, 6.5, -12, 1.1, 0.7, 0.03, 'paint', { collide: false });
    // archery range
    for (const hx of [-22, -18.5, -15]) b.prop('hay_round', hx, 21, PI / 2);
    for (const fx of [-21.5, -18.5, -15.5]) b.prop('fence', fx, 11, 0);
    b.cont(CONT.CRATE, -12.3, 12.6, { prop: 'crate', ry: 0.3 });
    b.loot(-18.5, 16);
    // canoes
    b.prop('boat', 16, 18.5, 0.1, { nocollide: true });
    b.prop('boat', 18, 19, -0.06, { nocollide: true });
    b.prop('dock_post', 15, 15.6, 0);
    b.prop('dock_post', 19, 15.6, 0);
    b.prop('outhouse', 11, 26, 0);
    b.prop('outhouse', 13, 26, 0);
    b.prop('well', -9, -15, 0);
    b.prop('picnic_table', 8, 8, 0.3);
    b.prop('picnic_table', -8, 8.5, -0.2);
    b.prop('lantern_post', -3, -10, 0);
    b.prop('lantern_post', 3.4, 10.5, 0);
    b.prop('lantern_post', -13, -3, 0);
    // the bus that brought them
    b.wreck('school_bus', 9.5, -22, 1.3, { trunk: false });
    b.cont(CONT.DUFFEL, 5.6, -18.6, { prop: 'duffel_bag', ry: 0.4, nocollide: true });
    b.prop('corpse', -2, -8.5, 0.6, { nocollide: true });
    b.prop('corpse', 5, 10.5, 2.2, { nocollide: true });
    b.prop('bones', -16, 17, 0, { nocollide: true });
    b.loot(1.2, -5.2);
    b.loot(15.5, -3.5);
    for (let i = 0; i < 16; i++) b.tree(rng.range(-31, 31), rng.range(-31, 31), rng.int(0, 2), rng.range(0.9, 1.25));
  });

  // BLACKROCK MINE: a worked-out pit on the hillside - the boarded-up adit, a headframe over the shaft, the tipple
  // at the end of the rails, the dry house and the powder store.
  place(ZONE.MINE, (b) => {
    // the adit, in the face of blasted rock at the back of the yard (local 0, 22), is built with the workings
    // behind it, once every place stands: see the mine below
    b.prop('lantern_post', -3, 20, 0);
    b.prop('lantern_post', 3, 20, 0);
    // rails down to the tipple
    for (const rx of [-0.45, 0.45]) b.box(rx, 0, 11.5, 0.08, 0.1, 19, 'rust', { collide: false });
    for (let tz = 2.6; tz < 21; tz += 1.7) b.box(0, 0, tz, 1.5, 0.06, 0.22, 'planks', { collide: false });
    b.prop('cart', 0, 15, 0);
    b.prop('cart', 0.15, 7, 0.04, { seed: 1 });
    for (const px of [-2.2, 2.2]) for (const pz of [-2.2, 2.2]) b.cyl(px, 0, pz, 0.16, 4.2, 'trim', { sides: 6 });
    b.box(0, 4.2, 0, 5, 2.2, 5, 'barn', { collide: false });
    b.box(0, 2.9, -3.8, 1.4, 0.2, 4.4, 'rust', { rx: -0.5 });
    b.prop('gravel_pile', 0, -7.5, 0);
    b.prop('gravel_pile', 6.5, -4.5, 1.1, { seed: 1 });
    // headframe over the shaft
    b.box(-14, -0.3, 8, 3.2, 0.36, 3.2, 'dark', { collide: false });
    for (const cz of [6.2, 9.8]) b.box(-14, 0, cz, 4, 0.5, 0.4, 'concrete');
    for (const cx of [-15.8, -12.2]) b.box(cx, 0, 8, 0.4, 0.5, 3.2, 'concrete');
    b.box(-14, 0.07, 8, 3.6, 0.08, 0.5, 'planks', { ry: 0.5, collide: false });
    for (const px of [-2.4, 2.4]) for (const pz of [-2.4, 2.4]) b.cyl(-14 + px, 0, 8 + pz, 0.16, 9, 'rust', { sides: 6 });
    for (const pz of [-2.4, 2.4]) b.box(-14, 4.5, 8 + pz, 4.8, 0.2, 0.2, 'rust', { collide: false });
    for (const px of [-2.4, 2.4]) b.box(-14 + px, 4.5, 8, 0.2, 0.2, 4.8, 'rust', { collide: false });
    b.box(-14, 9, 8, 5.6, 0.25, 5.6, 'rust', { collide: false });
    b.cyl(-14, 10, 8, 1.2, 0.25, 'metal', { rz: PI / 2 });
    // hoist house
    b.room(-22, 8, 5, 5, 2.8, 'tin_rust', { e: [gap(2.5, 2.4, 2.4)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'concrete' });
    b.prop('generator', -22.6, 9.2, PI / 2);
    b.cont(CONT.TOOLBOX, -21, 6.6, { prop: 'toolbox', ry: 0.5, nocollide: true });
    b.partSpot(-23.6, 6.4);
    // dry house
    b.room(-15, -12, 8, 6, 2.9, 'planks', { e: [door(3, 1.2)], n: [win(2.5), win(5.5)], s: [win(4)] }, { roof: 'gable', roofH: 2.2, roofMat: 'tin' });
    b.cont(CONT.LOCKER, -18.5, -13.5, { prop: 'locker', ry: -PI / 2 });
    b.cont(CONT.LOCKER, -18.5, -11.5, { prop: 'locker', ry: -PI / 2, seed: 1 });
    b.cont(CONT.CABINET, -14, -9.45, { prop: 'cabinet', ry: 0 });
    b.prop('table', -14, -13.2, 0);
    b.loot(-14, -13.2, 0.82);
    b.partSpot(-12, -14.2);
    // powder store
    b.room(18, 6, 4.5, 4, 2.4, 'concrete', { w: [door(2, 1.2)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.cont(CONT.AMMO_BOX, 19.2, 6.9, { prop: 'military_crate', ry: PI / 2 });
    b.partSpot(19.4, 4.7);
    b.prop('sandbags', 14, 3.4, PI / 2);
    b.prop('sandbags', 14, 8.6, PI / 2, { seed: 1 });
    b.wreck('dump_truck', 10, -15, -0.4, { trunk: false });
    b.wreck('pickup_truck', -4, -17, 0.3);
    b.prop('fuel_tank', 22, -6, 0.2);
    b.prop('barrel', 12, 10.5, 0);
    b.prop('barrel', 12.8, 11.2, 0);
    b.cont(CONT.CRATE, 5, 9, { prop: 'crate', ry: 0.2 });
    b.cont(CONT.TOOLBOX, 3, -2.8, { prop: 'toolbox', ry: 0.9, nocollide: true });
    b.cont(CONT.LOGPILE, 8, 18.5, { prop: 'log_pile', ry: 0.1 });
    b.prop('lantern_post', -9, -8, 0);
    b.prop('corpse', 2.2, 12, 1.1, { nocollide: true });
    b.prop('bones', -9.5, 14, 0, { nocollide: true });
    b.loot(3.6, 19.6);
    b.loot(-14, 3.4);
    b.loot(10, -6.5);
  });

  // ELK RIDGE LODGE: a hunting lodge - one big log hall with a bunk room, a porch, the game shed and stands out back.
  place(ZONE.LODGE, (b) => {
    b.room(0, 6, 16, 10, 3.6, 'logwall', { n: [door(8, 1.6), win(3, 1.6), win(13, 1.6)], e: [win(3), win(7.5)], w: [win(5)], s: [door(13.5, 1.1), win(5)] }, { roof: 'gableZ', roofH: 3.2, roofMat: 'shingles' });
    b.wall(3, 1, 3, 11, 3.6, 0.2, 'logwall', [door(6, 1.2)]);
    // bunk room
    b.prop('bed', 7.2, 2.6, 0);
    b.prop('bed', 7.2, 5.6, 0);
    b.cont(CONT.LOCKER, 5, 10.5, { prop: 'locker', ry: 0 });
    b.cont(CONT.LOCKER, 6.3, 10.5, { prop: 'locker', ry: 0, seed: 1 });
    b.partSpot(4, 9.6);
    b.loot(4.6, 2.2);
    // the hall: fireplace, tables, kitchen corner
    b.box(-7.3, 0, 8.5, 1.1, 3.6, 2.2, 'stone');
    b.box(-7.3, 3.6, 8.5, 1.0, 4.4, 1.2, 'stone', { collide: false });
    b.prop('table', -3, 4.5, 0);
    b.prop('chair', -3.9, 5.5, 2.6);
    b.prop('chair', -2, 3.5, 0.4);
    b.prop('table', -2.6, 8.4, 0.1);
    b.loot(-2.6, 8.4, 0.82);
    b.cont(CONT.CABINET, -1.5, 10.5, { prop: 'cabinet', ry: 0 });
    b.cont(CONT.FRIDGE, 1.3, 10.4, { prop: 'fridge', ry: 0 });
    b.cont(CONT.DUFFEL, 0.6, 2.3, { prop: 'duffel_bag', ry: 0.9, nocollide: true });
    // porch
    b.box(0, 0, -0.5, 16, 0.25, 2.6, 'planks');
    for (const px of [-7.6, -2.6, 2.6, 7.6]) b.cyl(px, 0.25, -1.55, 0.1, 2.9, 'trim', { sides: 6 });
    b.box(0, 3.15, -0.6, 16.6, 0.14, 3, 'shingles', { collide: false });
    b.roofSpan(0, -0.6, 8.3, 1.5, 3.15, 0.14);
    b.prop('lantern_post', -3.2, -3, 0);
    b.prop('lantern_post', 3.2, -3, 0);
    // game shed
    b.room(14, -10, 4.5, 4.5, 2.6, 'planks', { w: [door(2.25, 1.2)] }, { roof: 'flat', roofMat: 'tin' });
    b.cont(CONT.CRATE, 15.3, -8.7, { prop: 'crate', ry: 0.1 });
    b.cont(CONT.TOOLBOX, 12.7, -11.4, { prop: 'toolbox', ry: 0.6, nocollide: true });
    b.partSpot(15.4, -11.4);
    // skinning rack
    b.cyl(-14, 0, -6, 0.09, 2.4, 'trim', { sides: 6 });
    b.cyl(-11, 0, -6, 0.09, 2.4, 'trim', { sides: 6 });
    b.box(-12.5, 2.3, -6, 3.3, 0.12, 0.12, 'trim', { collide: false });
    b.prop('bones', -12.5, -5.4, 0, { nocollide: true });
    b.cont(CONT.LOGPILE, -10.2, 6.2, { prop: 'woodpile', ry: PI / 2 });
    b.prop('woodpile', -10.2, 3.4, PI / 2, { seed: 1 });
    b.prop('hunting_stand', -20, 14, 0.8);
    b.prop('hunting_stand', 19, 16, -0.6);
    b.cont(CONT.DUFFEL, 17.4, 14.6, { prop: 'duffel_bag', ry: 0.2, nocollide: true });
    b.prop('well', 11, 15, 0);
    b.prop('outhouse', -17, -1, -PI / 2);
    b.prop('picnic_table', 7, -7.5, 0.2);
    b.prop('campfire', 0, -9.5, 0, { nocollide: true, seed: 1 });
    b.prop('log_bench', 2.7, -9.5, 0);
    b.prop('log_bench', -2.7, -9.5, 0);
    b.wreck('pickup_truck', -7, -17, 0.4);
    b.wreck('pickup_truck', 6.5, -18, -0.3, { seed: 1 });
    b.prop('corpse', 2.4, -5.5, 1.9, { nocollide: true });
    b.prop('corpse', -13, 12.5, 0.3, { nocollide: true });
    b.loot(0.4, -11.6);
    b.loot(15, 3);
    for (let i = 0; i < 9; i++) b.tree(rng.range(-26, 26), rng.range(-26, 26), rng.int(0, 2), rng.range(0.9, 1.2));
  });

  // STARLITE DRIVE-IN: the big screen at the back of a field of cars that never left, the snack bar and projection
  // booth in the middle of it, a ticket booth on the lane in from Route 9.
  place(ZONE.DRIVEIN, (b) => {
    // the screen
    for (const px of [-9, -3, 3, 9]) b.cyl(px, 0, 26, 0.22, 11.4, 'metal', { sides: 8 });
    b.box(0, 3.4, 25.6, 22, 8, 0.4, 'clapboard', { collide: false });
    b.box(0, 3.1, 25.6, 22.6, 0.3, 0.6, 'metal', { collide: false });
    // snack bar, the projector in its back room
    b.room(0, 2, 11, 7, 3.2, 'brick', { n: [door(2.5, 1.3), win(7.5, 3, 1.0, 2.3)], s: [win(5.5, 1.2, 1.5, 2.1)], e: [door(3.5, 1.1)] }, { roof: 'flat', roofMat: 'concrete', floorMat: 'concrete' });
    b.box(2, 0, 0.6, 5, 1.05, 0.7, 'planks');
    b.loot(2, 0.6, 1.07);
    b.box(0, 0, 4.7, 0.7, 1.4, 0.9, 'metal');
    b.cont(CONT.FRIDGE, 4.9, 4.6, { prop: 'fridge', ry: PI / 2 });
    b.cont(CONT.CABINET, 3, 5.05, { prop: 'cabinet', ry: 0 });
    b.cont(CONT.SHELF, -3.4, 5.1, { prop: 'shelf', ry: 0 });
    b.cont(CONT.LOCKER, -5, 2.6, { prop: 'locker', ry: -PI / 2 });
    b.partSpot(-4.7, 4.7);
    // the field: every car still facing the screen, a speaker post at each space
    for (const [rz, xs] of [[11, [-17, -12, -7, 7, 12, 17]], [17, [-15, -10, -4, 4, 10, 15]], [-7, [-18, -13, -8, 8, 13, 18]], [-13, [-15, -10, 10, 15]]]) {
      for (const x of xs) {
        b.cyl(x + 1.7, 0, rz + 1, 0.05, 1.3, 'metal', { sides: 5, collide: false });
        b.box(x + 1.7, 1.3, rz + 1, 0.2, 0.25, 0.15, 'rust', { collide: false });
        if (!rng.chance(0.62)) continue;
        const r = rng();
        // (a camper reaches into the space in front of it: only where no row of cars stands 6 m ahead)
        b.wreck(r < 0.7 ? 'car_wreck' : r < 0.9 || rz === 11 || rz === -13 ? 'pickup_truck' : 'camper', x + rng.range(-0.3, 0.3), rz, PI + rng.range(-0.12, 0.12), { trunk: rng.chance(0.35) });
      }
    }
    // ticket booth
    b.room(3.3, -21, 3, 3, 2.6, 'clapboard', { w: [win(1.5, 1.4, 1.0, 2.0)], s: [door(1.5, 1.0)] }, { roof: 'flat', roofMat: 'tin' });
    b.cont(CONT.CABINET, 3.7, -21.9, { prop: 'cabinet', ry: PI });
    b.partSpot(2.4, -20.3);
    b.prop('boom_gate', -0.6, -21, 0);
    b.prop('billboard', -11, -27, 0);
    for (let zz = -15; zz <= 21; zz += 3) {
      if (Math.abs(zz) < 4) continue; // side gates
      b.prop('fence', -26, zz, PI / 2);
      b.prop('fence', 26, zz, PI / 2);
    }
    b.prop('picnic_table', 8.6, -2.4, 0.2); // (clear of a camper parked in the row behind it)
    b.prop('picnic_table', -8.6, -2.6, -0.3);
    b.cont(CONT.DUFFEL, -8.6, -1.1, { prop: 'duffel_bag', ry: 0.5, nocollide: true });
    b.cont(CONT.DUMPSTER, 7.6, 4.6, { prop: 'dumpster', ry: -PI / 2 });
    b.cont(CONT.DUMPSTER, -20, -20, { prop: 'dumpster', ry: 0.3, seed: 1 });
    b.prop('streetlight', -6, -24, PI);
    b.prop('streetlight', 9, -24, PI);
    b.prop('barrel', 10.5, 0.6, 0);
    b.light(10.5, 1.0, 0.6, 'embers');
    b.prop('corpse', -2, -9.5, 0.4, { nocollide: true });
    b.prop('corpse', 6, 13.5, 2.5, { nocollide: true });
    b.prop('bones', -12, 20.5, 0, { nocollide: true });
    b.loot(0, 8.5);
    b.loot(-14, -3);
    b.loot(12, 20.5);
  });

  // TRI-COUNTY FAIR: the midway, the carousel and the Ferris wheel, and the generator that runs them (fair.js).
  let fair = null;
  place(ZONE.FAIR, (b, z) => {
    fair = buildFair(b, z, seed, { door, win });
  });

  return { car, spawnPoints, cemetery, darks, clinic, fair };
}

// The workings under Blackrock Mine (mine.js) are planned now that every place stands and every roadside site has
// its spot, so the far portal comes up clear of them all: it levels an apron and heaps a mound behind itself.
// null on a map without the mine, or with nowhere to come up - the adit is boarded up then.
export function sinkMine({ seed, zones, zoneById, heights, heightAt, roadDistAt, rail, sites, kit }) {
  const { staticGrid, props, lootSpawns, containers, partSpots, Builder } = kit;
  // is anything built, lying or due to be built within r of (x,z)?
  const things = new Map(); // what has no collider, by 4 m cell
  for (const list of [props, lootSpawns, containers, partSpots]) {
    for (const t of list) {
      const key = Math.floor(t.x / 4) * 4096 + Math.floor(t.z / 4);
      if (!things.has(key)) things.set(key, []);
      things.get(key).push(t);
    }
  }
  const taken = (x, z, r) => {
    if (kit.laid(x, z, r)) return true; // (a prop by its plan: worldkit.js)
    for (let i = Math.floor((x - r - 1) / 4); i <= Math.floor((x + r + 1) / 4); i++) {
      for (let j = Math.floor((z - r - 1) / 4); j <= Math.floor((z + r + 1) / 4); j++) {
        for (const t of things.get(i * 4096 + j) || []) if (Math.hypot(t.x - x, t.z - z) < r + 1) return true;
      }
    }
    for (const st of sites) if (Math.hypot(st.x - x, st.z - z) < r + 8) return true;
    return false;
  };
  const mine = planMine({ seed, zones, heights, heightAt, roadDistAt, taken });
  if (!mine) {
    placer(zoneById, Builder)(ZONE.MINE, (b) => {
      b.box(0, 0, 24.5, 9, 4.4, 5, 'stone');
      b.box(-6.5, 0, 24, 6, 3.4, 4.5, 'stone', { ry: 0.25 });
      b.box(6.5, 0, 24.2, 6, 3.8, 4.5, 'stone', { ry: -0.2 });
      b.box(0.4, 4.2, 25, 6, 1.2, 3.5, 'stone', { ry: 0.1, collide: false });
      b.box(0, 0, 21.9, 2.6, 2.5, 0.25, 'dark', { collide: false });
      b.box(-1.45, 0, 21.7, 0.3, 2.7, 0.3, 'trim');
      b.box(1.45, 0, 21.7, 0.3, 2.7, 0.3, 'trim');
      b.box(0, 2.7, 21.7, 3.4, 0.3, 0.3, 'trim', { collide: false });
      b.box(0, 0.7, 21.6, 3.1, 0.2, 0.06, 'planks', { rz: 0.12 });
      b.box(0, 1.5, 21.6, 3.1, 0.2, 0.06, 'planks', { rz: -0.1 });
    });
  } else dressMine({ mine, seed, Builder, staticGrid, zone: ZONE.MINE });
  // (the mine may have moved the ground at the edge of the railway's bed: rail.js puts it back)
  if (rail) rail.humps = rail.settle({ heights, heightAt, mine });
  return mine;
}
