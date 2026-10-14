// The way under the river (mainland.js): the South Passage Mines - the drift from the portal on the river's west bank
// to the one on its east bank (mine.js, minedress.js), the adits sealed by the quarry and in the yard -, what was
// working in the quarry's pit when it stopped, and the mine's yard on the far side.
import { GRID_STEP } from '../constants.js';
import { ZONE, CONT } from '../defs.js';
import { mulberry32, lerp } from '../rng.js';
import { COL } from '../collision.js';
import { PLACES } from '../mainland-layout.js';
import { planPassage, MINE_R } from '../mine.js';
import { dressMine } from '../minedress.js';
import { HALF, N, P } from './consts.js';

const PI = Math.PI;

// Returns mine (the workings, or null with nowhere for them) and sealed(x, z, ry, zone): an old adit sealed up
export function sinkPassage({ seed, plan, ground, kit }) {
  const { riverAt, facing, passageW, passageE } = plan;
  const { heights, roadDist, heightAt, roadDistAt } = ground;
  const { staticGrid, partSpots, lights, clears, propBlocked, Builder } = kit;
  // THE SOUTH PASSAGE MINES ---------------------------------------------------------------------------------------
  // The way through the ground: a drift from the portal on the river's west bank (the picture's second mine entrance,
  // where the track from the quarry ends) down under the river to the one on its east bank, with its galleries, cut and
  // dressed as Blackrock Mine is (mine.js, minedress.js). The mine's yard on the far side: its headframe, the hoist
  // house. The old adits by the quarry and in the yard are sealed. The hydraulic pump is down in the workings - the
  // pump that kept the drift under the river dry - so the passage is the one way to it.
  // (the drift's junction and its sump: under the middle of the river where the line between the portals crosses it)
  let under = null;
  for (let t = 0; t <= 1; t += 0.01) {
    const x = lerp(passageW[0], passageE[0], t);
    const z = lerp(passageW[1], passageE[1], t);
    if (!under || riverAt(x, z) < riverAt(...under)) under = [x, z];
  }
  const mine = planPassage({ seed, a: { x: passageW[0], z: passageW[1], zone: ZONE.PASSAGE }, b: { x: passageE[0], z: passageE[1], zone: ZONE.PASSAGE }, via: [under], heights, heightAt, roadDistAt, half: HALF, n: N, step: GRID_STEP });
  if (mine) {
    // (the ground out in front of a portal is the mine's yard, trodden bare: no tree grows within 40 m of a mouth on its
    // line - in the woods the forest stood up to the timbers, and the mouth was not to be seen from anywhere)
    for (const p of mine.portals) for (let s = 2; s <= 40; s += 5) clears.push([p.x - p.dx * s, p.z - p.dz * s, 6 + s * 0.12]);
    const n0 = partSpots.length;
    dressMine({ mine, seed, Builder, staticGrid, zone: ZONE.PASSAGE });
    // the pump: in the junction, by the sump, or in the deepest room
    const rm = mine.rooms[0];
    const b = new Builder(rm.x, rm.z, 0, rm.y);
    b.zone = ZONE.PASSAGE;
    const k = (rm.r * 0.8 - 0.6) * Math.SQRT1_2;
    b.partSpot(-k + 0.4, k - 0.2);
    b.partSpot(k - 0.3, -k + 0.5);
    for (let i = n0; i < partSpots.length; i++) partSpots[i].supply = 2;
    // The passage was a way through, kept up till the end: its lamps along the drift (a post at the wall, a lamp that
    // still burns - world.lights 'lamp': a glow and no flame), and the tubs on its rails where the last shift left them
    const m = mine.main;
    const inRoom = (x, z, pad) => mine.rooms.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + pad);
    let side = 1;
    for (let i = 8; i < m.n - 6; i += 9) {
      if (inRoom(m.x[i], m.z[i], 2)) continue;
      const c = Math.min(m.n - 1, i + 1);
      const tl = Math.hypot(m.x[c] - m.x[i - 1], m.z[c] - m.z[i - 1]) || 1;
      const [tx, tz] = [(m.x[c] - m.x[i - 1]) / tl, (m.z[c] - m.z[i - 1]) / tl];
      const lx = m.x[i] + tz * side * (MINE_R - 0.32);
      const lz = m.z[i] - tx * side * (MINE_R - 0.32);
      const lb = new Builder(lx, lz, Math.atan2(tx, tz), m.y[i]);
      lb.zone = ZONE.PASSAGE;
      lb.prop('lantern_post', 0, 0, side > 0 ? -PI / 2 : PI / 2, { seed: i });
      lights.push({ x: lx - tz * side * 0.3, y: m.y[i] + 1.75, z: lz + tx * side * 0.3, kind: 'lamp' });
      side = -side;
    }
    // (and in its rooms: either side of the junction, at the far wall of each gallery's end - where it is clear)
    {
      const jt = [m.x[mine.jx + 1] - m.x[mine.jx - 1], m.z[mine.jx + 1] - m.z[mine.jx - 1]];
      const jl = Math.hypot(...jt) || 1;
      for (const [rk, rm] of mine.rooms.entries()) {
        const spots = rm.kind === 'junction' ? [[jt[1] / jl, -jt[0] / jl], [-jt[1] / jl, jt[0] / jl]] : [[rm.dx, rm.dz]];
        for (const [ux, uz] of spots) {
          const [lx, lz] = [rm.x + ux * (rm.r - 0.45), rm.z + uz * (rm.r - 0.45)];
          const ry = Math.atan2(-ux, -uz);
          if (propBlocked('lantern_post', lx, lz, ry)) continue;
          const fy = mine.floorFor(lx, lz, rm.y + 0.3);
          const lb = new Builder(lx, lz, ry, fy === fy ? fy : rm.y);
          lb.zone = ZONE.PASSAGE;
          lb.prop('lantern_post', 0, 0, 0, { seed: 320 + rk });
          lights.push({ x: lx - ux * 0.3, y: lb.y0 + 1.75, z: lz - uz * 0.3, kind: 'lamp' });
        }
      }
    }
    // (and down each of the galleries off it, two: half way along and near its end, so what is down them reads too)
    for (const [gi, g] of mine.galleries.entries()) {
      for (const f of [0.4, 0.82]) {
        const i = Math.max(1, Math.min(g.n - 2, Math.round((g.n - 1) * f)));
        const tl = Math.hypot(g.x[i + 1] - g.x[i - 1], g.z[i + 1] - g.z[i - 1]) || 1;
        const [tx, tz] = [(g.x[i + 1] - g.x[i - 1]) / tl, (g.z[i + 1] - g.z[i - 1]) / tl];
        const sd = (gi + (f > 0.5 ? 1 : 0)) % 2 ? 1 : -1;
        const lx = g.x[i] + tz * sd * (MINE_R - 0.32);
        const lz = g.z[i] - tx * sd * (MINE_R - 0.32);
        const fy = mine.floorFor(lx, lz, g.y[i] + 0.3);
        const lb = new Builder(lx, lz, Math.atan2(tx, tz), fy === fy ? fy : g.y[i]);
        lb.zone = ZONE.PASSAGE;
        lb.prop('lantern_post', 0, 0, sd > 0 ? -PI / 2 : PI / 2, { seed: 300 + gi * 2 + (f > 0.5 ? 1 : 0) });
        lights.push({ x: lx - tz * sd * 0.3, y: lb.y0 + 1.75, z: lz + tx * sd * 0.3, kind: 'lamp' });
      }
    }
    for (const f of [0.22, 0.47, 0.81]) {
      const i = Math.floor(m.n * f);
      if (inRoom(m.x[i], m.z[i], 2)) continue;
      const c = Math.min(m.n - 1, i + 1);
      const tb = new Builder(m.x[i], m.z[i], Math.atan2(m.x[c] - m.x[i], m.z[c] - m.z[i]), m.y[i]);
      tb.zone = ZONE.PASSAGE;
      // a tub: a steel box on its wheels, on the rails (+Z along the drift)
      tb.box(0, 0.32, 0, 1.0, 0.82, 1.6, 'rust');
      tb.box(0, 1.12, 0, 1.06, 0.06, 1.66, 'metal', { collide: false });
      for (const sx of [-0.45, 0.45]) for (const sz of [-0.5, 0.5]) tb.cyl(sx, 0.16, sz, 0.17, 0.08, 'metal', { sides: 10, rz: PI / 2, collide: false });
    }
  }
  // a sealed adit: a stone face in a mound of rock, boards across its mouth (its +Z into the hill)
  const sealed = (x, z, ry, zone) => {
    const dx = Math.sin(ry);
    const dz = Math.cos(ry);
    const y = heightAt(x, z);
    for (let j = Math.max(0, Math.floor((z - 26 + HALF) / GRID_STEP)); j <= Math.min(N - 1, Math.ceil((z + 26 + HALF) / GRID_STEP)); j++) {
      for (let i = Math.max(0, Math.floor((x - 26 + HALF) / GRID_STEP)); i <= Math.min(N - 1, Math.ceil((x + 26 + HALF) / GRID_STEP)); i++) {
        const vx = -HALF + i * GRID_STEP - x;
        const vz = -HALF + j * GRID_STEP - z;
        const s0 = vx * dx + vz * dz;
        const lat = -vx * dz + vz * dx;
        const e = ((s0 - 12) / 11) ** 2 + (lat / 11) ** 2;
        if (s0 >= 2 && e < 1 && roadDist[j * N + i] > 4) heights[j * N + i] = Math.max(heights[j * N + i], y + 6.5 * (1 - e) * (1 - e));
      }
    }
    const b = new Builder(x, z, ry, y);
    b.zone = zone;
    b.box(0, 0, 3.4, 9, 4.4, 5, 'stone');
    b.box(-6.5, 0, 3, 6, 3.4, 4.5, 'stone', { ry: 0.25 });
    b.box(6.5, 0, 3.2, 6, 3.8, 4.5, 'stone', { ry: -0.2 });
    b.box(0.4, 4.2, 4, 6, 1.2, 3.5, 'stone', { ry: 0.1, collide: false });
    b.box(0, 0, 0.8, 2.6, 2.5, 0.25, 'dark', { collide: false });
    b.box(-1.45, 0, 0.6, 0.3, 2.7, 0.3, 'trim');
    b.box(1.45, 0, 0.6, 0.3, 2.7, 0.3, 'trim');
    b.box(0, 2.7, 0.6, 3.4, 0.3, 0.3, 'trim', { collide: false });
    b.box(0, 0.7, 0.5, 3.1, 0.2, 0.06, 'planks', { rz: 0.12 });
    b.box(0, 1.5, 0.5, 3.1, 0.2, 0.06, 'planks', { rz: -0.1 });
    b.loot(1.6, -1.8);
    b.clear(0, 2, 9);
  };
  {
    const a = P(PLACES.mineA);
    sealed(a[0], a[1], facing(a, P([0.66, 0.818])) + PI, ZONE.AGGREGATES);
  }
  return { mine, sealed };
}

// nE: one of the mainland's noise fields; fits: the city's kit's (mainland/citykit.js)
export function dressQuarryPit({ seed, nE, zoneById, ground, kit, fits }) {
  const { PIT, pitRamp, heightAt, levelUnder } = ground;
  const { props, addPropColliders, propBlocked, Builder } = kit;
  // THE QUARRY'S PIT: what was working in it when it stopped - an excavator on the floor at the face it was digging, a
  // dump truck under it, another on a bench, the belt that carried the stone up to the yard, heaps of it on the benches
  const fy = heightAt(PIT.x, PIT.z);
  const yd = zoneById[ZONE.AGGREGATES];
  const toYard = Math.atan2(yd.x - PIT.x, yd.z - PIT.z); // (the belt runs up toward the yard: +Z of this frame)
  const b = new Builder(PIT.x, PIT.z, toYard, fy);
  b.zone = ZONE.AGGREGATES;
  b.ground = true;
  // THE FACES: under every bench its face of rock, near sheer - blasted, so no two metres of it stand in one plane
  // (each length of it set in or out, a little higher or lower, turned a little), from below the ledge under it to
  // over the one it holds up; none where the haul road comes down, nor under the belt
  {
    const fr = mulberry32((seed ^ 0x9175) >>> 0);
    const [c0, s0] = [Math.cos(toYard), Math.sin(toYard)];
    for (let j = 1; j <= PIT.steps; j++) {
      const target = PIT.r - PIT.bw * (j - 0.085) - 0.6; // (in over the riser's foot: the heightfield's riser is two metres wide)
      const n = Math.round((2 * PI * target) / 3.1);
      const y0 = PIT.top - j * PIT.drop - 0.5 - fy;
      for (let q = 0; q < n; q++) {
        const a = ((q + 0.5) / n) * PI * 2;
        const [sa, ca] = [Math.sin(a), Math.cos(a)];
        // (the radius at which this angle's benches put the face: they wander - pitD)
        let rad = target;
        for (let it = 0; it < 3; it++) rad = target - nE((PIT.x + sa * rad) * 0.05, (PIT.z + ca * rad) * 0.05) * 3;
        const [wx, wz] = [PIT.x + sa * rad, PIT.z + ca * rad];
        const ramp = pitRamp(wx, wz, target);
        const r1 = fr();
        const r2 = fr();
        const r3 = fr();
        if ((ramp && ramp[0] > -0.05 && ramp[1] < PIT.hw + 4.5) || (Math.abs(Math.sin(a - toYard) * rad) < 2.2 && Math.cos(a - toYard) > 0)) continue;
        const lx = c0 * (wx - PIT.x) - s0 * (wz - PIT.z);
        const lz = s0 * (wx - PIT.x) + c0 * (wz - PIT.z);
        const len = ((2 * PI * rad) / n) * (1.12 + r1 * 0.2);
        const inset = (r2 - 0.5) * 0.8;
        // (its top knee high over the ledge it holds up as that ledge is here: a lip of rock along the bench's edge, too
        // high for a wheel to ride up onto - along the tops, off the end of one, a vehicle dropped into the face below -
        // and no higher: the benches wander, and where one ran low a face stood up out of it a metre)
        const out = rad + inset + 1; // (its outer side: where the ledge it holds up begins)
        let ledge = -Infinity; // (the ledge's highest along the face's length, just outside it)
        for (const t of [-0.5, 0, 0.5]) for (const o of [out, out + 0.7]) ledge = Math.max(ledge, heightAt(PIT.x + Math.sin(a + (t * len) / rad) * o, PIT.z + Math.cos(a + (t * len) / rad) * o));
        const top = ledge - fy + 0.45;
        // (mined for stone, as a boulder is, and richer: COL.QUARRY)
        b.box(lx * (1 + inset / rad), y0, lz * (1 + inset / rad), len, Math.max(0.5, top - y0), 2.0, 'stone_rough', { ry: a - toYard + (r3 - 0.5) * 0.18, flags: COL.STATIC | COL.ROCK | COL.QUARRY });
      }
    }
  }
  // standing water on the floor, where it is lowest
  {
    const pr = mulberry32((seed ^ 0x2b07) >>> 0);
    for (let q = 0; q < 7; q++) {
      const a = pr() * PI * 2;
      const r = 4 + pr() * (PIT.floor - 9);
      const [lx, lz] = [Math.sin(a) * r, Math.cos(a) * r];
      // (each two or three pools run together: no puddle is a circle)
      for (let m = 0; m < 3; m++) b.cyl(lx + (pr() - 0.5) * 2.6, 0.03 + m * 0.002, lz + (pr() - 0.5) * 2.6, 0.8 + pr() * 1.6, 0.02, 'puddle', { sides: 9, ry: pr() * 3, collide: false });
    }
  }
  // the excavator, a mining shovel the size of a house: its tracks, the house on them with the cab and the engine,
  // the boom and the stick down to a bucket bigger than a car, resting on the floor at the face
  {
    const e = b.sub(-4, -9, 0.5);
    e.ground = true;
    for (const sd of [-1, 1]) e.box(sd * 3.6, 0, 0, 2.2, 2.4, 12, 'charred');
    e.box(0, 2.4, 0, 8, 0.9, 8, 'rust');
    e.box(0, 3.3, 1.2, 7.4, 4.4, 7.6, 'tin_rust'); // the house
    e.box(-2.4, 7.7, -1.8, 2.4, 2.6, 2.6, 'tin', { collide: false }); // the cab
    e.box(1.2, 7.7, 3.4, 3, 1.6, 2.6, 'charred', { collide: false }); // (its engine's hood)
    e.box(1.2, 7.4, -6.2, 1.8, 1.8, 11, 'rust', { rx: -0.62, collide: false }); // the boom
    e.box(1.2, 4.0, -12.6, 1.4, 1.4, 7.4, 'rust', { rx: 0.5, collide: false }); // the stick
    e.box(1.2, 0, -14.6, 4.2, 2.8, 3.4, 'metal'); // the bucket
  }
  // the haul truck that was being loaded: a dump body as long as a bus on six wheels taller than a man
  {
    const t = b.sub(9, -12, 2.4);
    t.ground = true;
    for (const [wx, wz] of [[-3.2, -4], [3.2, -4], [-3.2, 3], [3.2, 3], [-2.1, 3], [2.1, 3]]) t.cyl(wx, 0, wz, 1.6, 1.4, 'charred', { sides: 10 });
    t.box(0, 1.2, -0.4, 6, 1.4, 11, 'rust'); // the chassis
    t.box(0, 2.6, 1.0, 6.4, 3.2, 8.6, 'tin_rust'); // the dump body
    t.box(-1.6, 2.6, -4.6, 2.6, 2.8, 2.4, 'tin', { collide: false }); // the cab
  }
  // the belt: a long trough up out of the pit to its rim, on legs
  const top = PIT.top - fy;
  const run = PIT.r + 6;
  const tilt = Math.atan2(top, run);
  b.box(0, top / 2 + 1.2, run / 2, 1.4, 0.5, Math.hypot(run, top), 'rust', { rx: -tilt, collide: false });
  for (let k = 0; k <= 14; k++) {
    const lz = (run * k) / 14;
    const ly = (top * k) / 14;
    const g = heightAt(b.wx(0, lz), b.wz(0, lz)) - fy;
    if (ly + 1 - g > 0.3) for (const sd of [-0.6, 0.6]) b.box(sd, g, lz, 0.25, ly + 1 - g, 0.25, 'rust');
  }
  // heaps of stone on the floor and the benches
  const bench = (k) => PIT.r - ((k - 0.55) * (PIT.r - PIT.floor)) / PIT.steps; // (the middle of bench k: 1 the top one)
  for (const [k, a, t] of [[0, 0.9, 'gravel_pile'], [0, 5.0, 'rubble_pile'], [1, 1.2, 'gravel_pile'], [2, 4.4, 'gravel_pile'], [3, 0.4, 'rubble_pile'], [4, 5.4, 'gravel_pile'], [2, 2.6, 'rubble_pile']]) {
    if (k) continue; // (the benches' ledges are narrow between their faces: heaps only on the floor)
    const r = 17; // (on the floor: clear of the shovel and the truck)
    const x = b.wx(Math.sin(a) * r, Math.cos(a) * r);
    const z = b.wz(Math.sin(a) * r, Math.cos(a) * r);
    if (propBlocked(t, x, z, a)) continue;
    const py = heightAt(x, z);
    props.push({ type: t, x, y: py, z, ry: a, seed: k });
    addPropColliders(t, x, py, z, a, props[props.length - 1]);
  }
  {
    const r = bench(2);
    const x = b.wx(Math.sin(3.4) * r, Math.cos(3.4) * r);
    const z = b.wz(Math.sin(3.4) * r, Math.cos(3.4) * r);
    const t2 = new Builder(x, z, toYard + 3.4 + PI / 2, heightAt(x, z));
    t2.zone = ZONE.AGGREGATES;
    t2.ground = true;
    if (levelUnder('dump_truck', x, z, t2.ry) && fits(t2, 'dump_truck', 0, 0, 0)) t2.wreck('dump_truck', 0, 0, 0, { trunk: false, seed: 1 });
  }
  b.loot(-2, -12);
  b.clear(0, 0, PIT.r);
}

// place: mainland.js's; groundRoom: the city's kit's (mainland/citykit.js)
export function buildPassageYard({ zoneById, kit, place, groundRoom, sealed }) {
  const { door, win } = kit;
  // the yard: the headframe over the old shaft, the hoist house, the adit in the hillside behind them (sealed)
  place(ZONE.PASSAGE, (b) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(-8 + sx * 2.4, 0, 4 + sz * 2.4, 0.5, 16, 0.5, 'rust');
    for (const y of [4, 8, 12]) b.box(-8, y, 4, 5.4, 0.3, 5.4, 'rust', { collide: false });
    b.box(-8, 16, 4, 6.4, 0.6, 6.4, 'rust', { collide: false });
    b.cyl(-8, 16.6, 4, 2.2, 0.4, 'metal', { sides: 16, rx: PI / 2, collide: false }); // (the sheave wheel)
    b.box(-8, 0, 4, 3.2, 0.5, 3.2, 'planks'); // (boards over the shaft)
    const R = groundRoom(b, 9, 2, 12, 9, 4, 'brick', { n: [door(6, 1.6), win(2.4, 1.4), win(9.6, 1.4)], w: [win(4.5)] }, { roof: 'flat', roofMat: 'tin', floorMat: 'concrete' });
    void R;
    b.box(10, 0.12, 4.4, 4, 1.6, 2.4, 'metal'); // (the winding engine)
    b.cont(CONT.TOOLBOX, 5.6, 5.4, { prop: 'toolbox', ry: 0.6, nocollide: true, ly: 0.12 });
    b.cont(CONT.LOCKER, 14.5, 5.2, { prop: 'locker', ry: -PI / 2, ly: 0.12 });
    b.loot(7, 0.4, 0.14);
    for (const [lx, lz, r] of [[-16, -6, 0.4], [-2, -10, 1.2]]) b.prop('cart', lx, lz, r);
    for (const rx of [-0.45, 0.45]) b.box(-8 + rx, 0, -6, 0.08, 0.1, 14, 'rust', { collide: false });
    b.prop('gravel_pile', 16, -12, 0.3);
    b.prop('lantern_post', -3, -4, 0);
    b.prop('barrel', 3, -8, 0);
    b.cont(CONT.CRATE, -14, 10, { prop: 'crate', ry: 0.3 });
    b.prop('corpse', 0, -4, 1.2, { nocollide: true });
    b.loot(-12, -8);
  });
  {
    const zn = zoneById[ZONE.PASSAGE];
    sealed(zn.x + 6, zn.z - 22, PI, ZONE.PASSAGE);
  }
}
