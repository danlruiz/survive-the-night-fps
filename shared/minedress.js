// What is down in a mine and at its mouths, once mine.js has cut it: the stone portals, the timbering and the track
// (mine.frames, drawn with the rock by client/render/mine.js), what the miners left in the junction and the rooms,
// and where the dead stand about down there (mine.dens). Blackrock Mine on the island (world.js) and the South
// Passage Mines on the mainland (mainland.js) are both dressed by this; `zone` is the place it all belongs to.
// Builder / staticGrid: the world's kit (worldkit.js). It draws from a stream of its own: nothing else moves for it.
import { CONT } from './defs.js';
import { mulberry32 } from './rng.js';
import { makeBox } from './collision.js';
import { MINE_R, MINE_H, PORTAL } from './mine.js';

const PI = Math.PI;

export function dressMine({ mine, seed, Builder, staticGrid, zone }) {
  const mrng = mulberry32(seed ^ 0x51ab5); // its own stream: nothing else in the valley moves for it
  const sd = () => mrng.int(0, 9999);
  const inner = MINE_R + PORTAL.LINER;
  const L = PORTAL.LEN;
  mine.portals.forEach((p, pi) => {
    const b = new Builder(p.x, p.z, p.ry, p.y); // (its +Z runs on into the drift)
    b.zone = p.zone;
    // stone piers either side of the decline and a slab over them, proud of the mound behind. The rock lining of
    // the drift is drawn just inside the piers: a collider flush with it keeps bodies off it
    for (const sx of [-1, 1]) {
      b.box(sx * (inner + PORTAL.PIER / 2), -4.5, L / 2, PORTAL.PIER, 4.5 + PORTAL.TOP, L, 'stone');
      const lx = sx * (MINE_R + PORTAL.LINER / 2);
      staticGrid.add(makeBox(b.wx(lx, L / 2), b.wz(lx, L / 2), p.y - 4.5, p.y + PORTAL.SLAB, PORTAL.LINER, L, b.ry));
    }
    b.box(0, PORTAL.SLAB, L / 2, inner * 2, PORTAL.TOP - PORTAL.SLAB, L, 'stone');
    b.box(-inner - PORTAL.PIER - 1.6, -1.5, 2.2, 5, 4.9, 5, 'stone', { ry: 0.25 });
    b.box(inner + PORTAL.PIER + 1.6, -1.5, 2.4, 5, 5.3, 5, 'stone', { ry: -0.2 });
    b.box(0.4, PORTAL.TOP - 0.2, 3, 6, 1.2, 4.5, 'stone', { ry: 0.1, collide: false });
    // a timber set in the mouth, and what is left of the boards that shut it
    for (const sx of [-1, 1]) b.box(sx * (MINE_R + 0.1), 0, -0.05, 0.45, 2.95, 0.4, 'trim');
    b.box(0, 2.95, -0.05, MINE_R * 2 + 1.1, 0.5, 0.4, 'trim', { collide: false });
    b.box(-1.25, 0.1, -0.32, 0.2, 2.6, 0.06, 'planks', { rz: 0.42, collide: false });
    b.box(1.3, 2.2, -0.3, 1.5, 0.2, 0.06, 'planks', { rz: -0.14, collide: false });
    b.box(0.9, 0.03, -1.6, 2.6, 0.06, 0.2, 'planks', { ry: 0.5, collide: false });
    b.box(-0.6, 0.03, -2.3, 2.2, 0.06, 0.2, 'planks', { ry: -0.9, collide: false });
    b.roofSpan(0, L / 2, inner + PORTAL.PIER, L / 2, PORTAL.TOP, 0.2);
    b.clear(0, 3, 10);
    b.clear(0, -4, 7);
    if (pi) {
      // the far portal: the rails run out onto the apron, where the last shift left a tub and their tools
      for (const rx of [-0.45, 0.45]) b.box(rx, 0, -3.2, 0.08, 0.1, 6.4, 'rust', { collide: false });
      for (let tz = -6; tz < 0; tz += 1.2) b.box(0, 0, tz, 1.5, 0.06, 0.22, 'planks', { collide: false });
      b.prop('lantern_post', -3, -2, 0, { seed: sd() });
      b.prop('lantern_post', 3, -2, 0, { seed: sd() });
      b.prop('cart', 3.4, -5.2, 0.5, { seed: sd() });
      b.cont(CONT.TOOLBOX, -3.5, -4.4, { prop: 'toolbox', ry: 0.7, nocollide: true, seed: sd() });
      b.prop('barrel', -4.4, -1.6, 0, { seed: sd() });
      b.loot(-2.6, -3.2);
    } else for (const rx of [-0.45, 0.45]) b.box(rx, 0, -0.5, 0.08, 0.1, 1, 'rust', { collide: false });
  });
  // unit vector along a line at its point i
  const along = (l, i) => {
    const a = Math.max(0, i - 1);
    const c = Math.min(l.n - 1, i + 1);
    const tl = Math.hypot(l.x[c] - l.x[a], l.z[c] - l.z[a]) || 1;
    return [(l.x[c] - l.x[a]) / tl, (l.z[c] - l.z[a]) / tl];
  };
  const inRoom = (x, z, pad) => mine.rooms.some((rm) => Math.hypot(x - rm.x, z - rm.z) < rm.r + pad);
  // The timbering and the track are not parts of the static world: they are drawn with the rock (client/render/
  // mine.js), which knows that no daylight gets down there. mine.frames: boxes [x, y, z (middle), sx, sy, sz, ry, rz
  // (turned about its own Z, then about Y), kind: 0 timber, 1 rail, 2 sleeper]. None of them has a collider.
  mine.frames = [];
  const piece = (x, y, z, sx, sy, sz, ry, rz, kind) => mine.frames.push([x, y, z, sx, sy, sz, ry, rz, kind]);
  // a timber set: two posts and a cap across the drift
  const timber = (l, i) => {
    if (inRoom(l.x[i], l.z[i], 0.6)) return;
    const [tx, tz] = along(l, i);
    const ry = Math.atan2(tx, tz);
    for (const side of [-1, 1]) piece(l.x[i] + tz * side * (MINE_R - 0.1), l.y[i] + (MINE_H - 0.2) / 2, l.z[i] - tx * side * (MINE_R - 0.1), 0.24, MINE_H - 0.2, 0.24, ry, 0, 0);
    piece(l.x[i], l.y[i] + MINE_H - 0.32, l.z[i], MINE_R * 2 + 0.3, 0.24, 0.28, ry, 0, 0);
  };
  const m = mine.main;
  for (let i = 2; i < m.n - 2; i += 4) timber(m, i);
  for (const g of mine.galleries) for (let i = 5; i < g.n; i += 4) timber(g, i);
  // rails and sleepers the length of the main drift
  for (let i = 0; i < m.n - 1; i++) {
    const ex = m.x[i + 1] - m.x[i];
    const ez = m.z[i + 1] - m.z[i];
    const ey = m.y[i + 1] - m.y[i];
    const len = Math.hypot(ex, ez) || 1;
    for (const side of [-0.45, 0.45]) piece((m.x[i] + m.x[i + 1]) / 2 + (ez / len) * side, (m.y[i] + m.y[i + 1]) / 2 + 0.11, (m.z[i] + m.z[i + 1]) / 2 - (ex / len) * side, Math.hypot(len, ey) + 0.04, 0.1, 0.08, Math.atan2(-ez, ex), Math.atan2(ey, len), 1);
    const [tx, tz] = along(m, i);
    piece(m.x[i], m.y[i] + 0.03, m.z[i], 1.5, 0.06, 0.22, Math.atan2(tx, tz), 0, 2);
  }
  // the junction, where the galleries leave: a tub on the rails, a drum somebody has kept burning
  {
    const rm = mine.rooms[0];
    const [tx, tz] = along(m, mine.jx);
    const b = new Builder(rm.x, rm.z, Math.atan2(tx, tz), rm.y); // (+Z: along the drift)
    b.zone = zone;
    const k = (rm.r * 0.8 - 0.6) * Math.SQRT1_2; // out towards the corners, clear of the drift and the galleries
    b.prop('cart', 0.05, 1.8, 0.02, { seed: sd() });
    b.prop('barrel', k, k, 0, { seed: sd() });
    b.light(k, 1.0, k, 'embers');
    b.cont(CONT.CRATE, -k, k, { prop: 'crate', ry: 0.4, seed: sd() });
    b.prop('pallet', -k, -k, 0.3, { seed: sd() });
    b.prop('crate_small', -k + 0.1, -k, 0.5, { ly: 0.15, seed: sd() });
    b.prop('bones', k, -k, 1, { nocollide: true, seed: sd() });
    b.loot(k - 0.9, -k + 0.4);
    // (a mine with no gallery keeps its strongbox here)
    if (mine.rooms.length === 1) b.cont(CONT.STRONGBOX, k + 0.3, -k - 0.3, { prop: 'strongbox', ry: -0.8, seed: 0 });
  }
  // the rooms at the ends of the galleries: what the miners left, and what nobody has come back for
  const ends = mine.rooms.slice(1);
  // the strongbox: what makes the trip worth it (CONT.STRONGBOX), against the wall of the deepest room
  const deepest = ends.reduce((a, rm) => (!a || rm.y < a.y ? rm : a), null);
  ends.forEach((rm, k) => {
    const b = new Builder(rm.x, rm.z, Math.atan2(rm.dx, rm.dz), rm.y); // (+Z: on in from the gallery, to the back wall)
    b.zone = zone;
    const back = rm.r - 1.05;
    if (k % 3 === 0) b.cont(CONT.AMMO_BOX, -0.3, back, { prop: 'military_crate', ry: mrng.range(-0.2, 0.2), seed: sd() });
    else b.cont(CONT.CRATE, 0.2, back, { prop: 'crate', ry: mrng.range(-0.4, 0.4), seed: sd() });
    if (k % 2 === 0) b.cont(CONT.TOOLBOX, -back * 0.7, back * 0.45, { prop: 'toolbox', ry: mrng.range(0, 3), nocollide: true, seed: sd() });
    else b.cont(CONT.CRATE, back * 0.72, back * 0.4, { prop: 'crate', ry: mrng.range(0, 1.5), seed: sd() });
    b.prop('barrel', back * 0.75, -back * 0.3, 0, { seed: sd() });
    b.prop('pallet', -back * 0.6, -back * 0.45, mrng.range(0, 3), { seed: sd() });
    b.prop(k % 2 ? 'corpse' : 'bones', mrng.range(-1, 1), mrng.range(-0.5, 1), mrng.range(0, 6), { nocollide: true, seed: sd() });
    b.loot(mrng.range(-1.5, 1.5), back - 1.3);
    b.loot(-back * 0.6, -back * 0.45, 0.17);
    if (k === ends.length - 1) b.partSpot(1.3, back - 0.4);
    if (rm === deepest) b.cont(CONT.STRONGBOX, -back * 0.62, back * 0.72, { prop: 'strongbox', ry: -0.7, seed: 0 });
  });
  // where the dead stand about down there: the rooms, and the drift between the bays
  mine.dens = [];
  for (const rm of mine.rooms) {
    for (let i = rm.kind === 'junction' ? 3 : 2; i > 0; i--) {
      const a = mrng.range(0, PI * 2);
      const r = mrng.range(0, Math.max(0.5, rm.r - 2));
      mine.dens.push({ x: rm.x + Math.sin(a) * r, y: rm.y, z: rm.z + Math.cos(a) * r });
    }
  }
  for (let i = 30 + mrng.int(0, 10); i < m.n - 30; i += mrng.int(16, 26)) {
    const [tx, tz] = along(m, i);
    const lat = mrng.range(-1, 1);
    if (!inRoom(m.x[i], m.z[i], 3)) mine.dens.push({ x: m.x[i] + tz * lat, y: m.y[i], z: m.z[i] - tx * lat });
  }
}
