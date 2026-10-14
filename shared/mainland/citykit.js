// What Port Calder's buildings are made with (mainland.js, mainland/buildings.js): the lists the city is drawn from
// (buildings, rooms, shells, heaps, ships, fallen lengths of tower, pancaked floors, signs: client/render/citykit.js
// draws them), a room's frame and the walls of it, and how a thing is set down in the city - clear of what is
// there already (fits, extra), on a heap of rubble, against a wall.
import { PROPS } from '../props.js';
import { clamp } from '../rng.js';
import { PAVE, FLOOR_Y, SETBACK } from './consts.js';

const PI = Math.PI;

// smoke: a column of smoke over a builder's spot (so many to the map: mainland.js)
export function createCityKit({ rng, heightAt, kit, smoke }) {
  const { parts, props, lootSpawns, containers, partSpots, openings, clears, propBlocked } = kit;
  // The buildings. Each is given a builder at the middle of its lot, front (-Z) on the street, and the lot's size.
  // A building's front wall stands SETBACK in from the lot's edge; a room's floor is FLOOR_Y over the pavement.
  // F, the frame of a room: { w, d, cz, front, back, L, R } - its size, the middle of it, and where its walls are.
  const frame = (L, w, d) => {
    const cz = -L.d / 2 + SETBACK + d / 2;
    return { w, d, cz, front: cz - d / 2, back: cz + d / 2, L: -w / 2, R: w / 2 };
  };
  const WALL = 0.125 + 0.06; // from a wall's line to the face of what stands against it (half the wall, and a gap)
  // (What stands against a wall faces the room: a prop's front is its -Z, which a Builder's ry turns to (-sin ry,
  // -cos ry) - so 0 against the back wall, PI against the front, -PI / 2 against the left, PI / 2 against the right.)
  const backZ = (F, depth) => F.back - WALL - depth / 2;
  const leftX = (F, depth) => F.L + WALL + depth / 2;
  const rightX = (F, depth) => F.R - WALL - depth / 2;
  const inside = { ly: FLOOR_Y };
  const cont = (b, ctype, prop, x, z, ry, o = {}) => b.cont(ctype, x, z, { prop, ry, ly: FLOOR_Y, ...o });

  // ---- What the city is drawn from. The storeys over a ground floor, the walls of a shell, a heap of rubble and
  // the length of a tower lying in the street are solid here (boxes, hidden: nothing draws them as boxes) and are
  // said here for the client's building kit (client/render/citykit.js), which builds what is seen of each: walls
  // with their windows, cornices, fire escapes, storeys cut open on their rooms, rubble that looks like rubble.
  const buildings = []; // a block of storeys: { x, z, ry, y, w, d, floors, fh, style, mat, seed, cut, wear, burnt, blank, ground, top }
  const rooms = []; // a room that is walked into: its walls are parts; the kit lines them, ceils them, hangs its sign
  const shells = []; // walls with the sky behind them: { x0, z0, x1, z1, y, t, mat, fh, heights, seed, soot, inner }
  const heaps = []; // { x, y, z, ry, rx, rz, h, seed, brick }
  const ships = []; // a ship at a quay, drawn only (its solids are hidden parts): { type, x, y, z, ry } (client/render/ships.js)
  const fallenBits = []; // a length of tower lying where it fell: { x, y, z, ry, len, w, h, fh, style, mat, seed }
  const pancakes = []; // floors come down one on another: { x, y, z, ry, w, d, n, seed }
  const signs = []; // a board or a mark from the city's atlas, anywhere: { x, y, z, ry, w, h, cell, ... }
  const hide = () => (parts[parts.length - 1].hidden = true);
  // a solid nothing draws as it is
  const solid = (b, lx, ly, lz, sx, sy, sz, mat, o = {}) => {
    b.box(lx, ly, lz, sx, sy, sz, mat, o);
    hide();
    return parts[parts.length - 1];
  };
  // A block of storeys on (cx, cz) of a builder's frame, w by d, its foot at y0, `floors` of them fh high, in a
  // style of the kit's (walkup, shopflat, slab, office, glass, warehouse, stone) and a wall material. o:
  //   lost   how many of its top storeys are broken: each stands on less of the footprint than the one under it
  //   open   a whole end of it fallen away from storey `from` up (-1 / 1: its -x / +x end), further with every storey
  //   burnt  it burnt out: no glass, soot over every opening
  //   blank  bits: which of its faces (front, right, back, left) are blind walls
  //   top    'slab': its roof is gone, what is left on the slab is under the sky
  // Returns the height of what still stands whole.
  const block = (b, cx, cz, w, d, y0, floors, fh, style, mat, o = {}) => {
    const seed = rng.int(1, 99999);
    const lost = Math.min(o.lost ?? 0, floors - 1);
    const sx = rng.chance(0.5) ? 1 : -1;
    const sz = rng.chance(0.5) ? 1 : -1;
    const open = o.open || 0;
    const from = o.from ?? 1;
    const hw = w / 2;
    const hd = d / 2;
    const cut = [];
    let gone = 0; // how much of the open end is gone at this storey
    for (let f = 0; f < floors; f++) {
      let R = [-hw, hw, -hd, hd];
      const step = rng.range(2, 6.5);
      const bite = rng.chance(0.5);
      if (open && f >= from) {
        if (bite || f === from) gone = Math.min(w * 0.62, gone + step); // (in bites: a storey or two stand on the same line, then more is gone)
        R = open > 0 ? [-hw, hw - gone, -hd, hd] : [-hw + gone, hw, -hd, hd];
      }
      const k = f - (floors - lost);
      if (k >= 0) {
        const left = 1 - (k + 1) / (lost + 1.3); // the share of the floor still there
        const pw = w * (0.42 + 0.5 * left);
        const pd = d * (0.48 + 0.45 * left);
        const S = [sx > 0 ? hw - pw : -hw, sx > 0 ? hw : -hw + pw, sz > 0 ? hd - pd : -hd, sz > 0 ? hd : -hd + pd];
        R = [Math.max(R[0], S[0]), Math.min(R[1], S[1]), Math.max(R[2], S[2]), Math.min(R[3], S[3])];
        if (R[1] - R[0] < 2.5 || R[3] - R[2] < 2.5) {
          floors = f; // (nothing worth the name left of it: the building ends here)
          break;
        }
      }
      cut.push(R[0] === -hw && R[1] === hw && R[2] === -hd && R[3] === hd ? null : R.map((v) => Math.round(v * 100) / 100));
    }
    // (solid: one box for every run of storeys that stand on the same footprint)
    for (let f = 0; f < floors; ) {
      let g = f + 1;
      while (g < floors && JSON.stringify(cut[g]) === JSON.stringify(cut[f])) g++;
      const R = cut[f] || [-hw, hw, -hd, hd];
      solid(b, cx + (R[0] + R[1]) / 2, y0 + f * fh, cz + (R[2] + R[3]) / 2, R[1] - R[0], (g - f) * fh, R[3] - R[2], mat);
      f = g;
    }
    const whole = cut.findIndex((R) => R);
    buildings.push({ x: b.wx(cx, cz), z: b.wz(cx, cz), ry: b.ry, y: b.y0 + y0, w, d, floors, fh, style, mat, seed, cut: cut.some((R) => R) ? cut : undefined, wear: o.wear ?? rng.range(0.35, 0.9), burnt: o.burnt ? 1 : 0, blank: o.blank || 0, ground: y0 - PAVE, top: o.top });
    if ((lost > 1 || open) && rng.chance(0.4)) smoke(b, cx, y0 + floors * fh, cz);
    return y0 + (whole < 0 ? floors : whole) * fh;
  };
  // A room that is walked into, as Builder.room builds it, said for the kit as well: what its openings are, how it
  // is lined. o (besides Builder.room's): tint (which of the kit's paints its walls have), lino (tile on its floor)
  // or boards (floorboards), ceiling ('plaster': a home's, not an office's tiles), ceil (how high it hangs, if lower
  // than the slab), homely (a home: pictures on its walls), burnt (burnt out: sooted, no ceiling), sign (the board
  // over its front: a cell of the city's atlas), plain (a shed: no lining). Returns what it said, for partition(),
  // zone() and lino() to add to: the room's inner walls, the rooms they make of it, what is laid on its floor.
  const groundRoom = (b, cx, cz, w, d, h, mat, sides, o = {}) => {
    b.room(cx, cz, w, d, h, mat, sides, o);
    const R = { x: b.wx(cx, cz), z: b.wz(cx, cz), ry: b.ry, y: b.y0, w, d, h, t: o.t || 0.25, mat, sides, tint: o.tint ?? rng.int(0, 5), floor: o.lino ? 'lino' : o.boards ? 'boards' : undefined, ceiling: o.burnt ? undefined : o.ceiling || (o.roof === 'flat' ? 'ceiling' : undefined), ceil: o.ceil, homely: o.homely ? 1 : undefined, burnt: o.burnt ? 1 : undefined, sign: o.sign, seed: rng.int(1, 99999), walls: [], zones: [], patches: [], cx, cz };
    if (!o.plain) rooms.push(R);
    return R;
  };
  // an inner wall of such a room (as Builder.wall), lined on both faces
  const partition = (b, R, x0, z0, x1, z1, h, mat, ops = []) => {
    b.wall(x0, z0, x1, z1, h, 0.18, mat, ops);
    R.walls.push([x0 - R.cx, z0 - R.cz, x1 - R.cx, z1 - R.cz, h, ops]);
  };
  // one of the rooms the partitions make of it, x0..x1 by z0..z1 of the builder's frame: painted its own colour
  // (tint: one of the kit's paints)
  const r2 = (v) => Math.round(v * 100) / 100;
  const zone = (R, x0, z0, x1, z1, tint) => R.zones.push([r2(Math.min(x0, x1) - R.cx), r2(Math.min(z0, z1) - R.cz), r2(Math.max(x0, x1) - R.cx), r2(Math.max(z0, z1) - R.cz), tint]);
  // ...and tile laid on that room's floor (a kitchen's, a bathroom's), a hand's width in from its walls
  const lino = (R, x0, z0, x1, z1, tint) => R.patches.push([r2(Math.min(x0, x1) - R.cx + 0.13), r2(Math.min(z0, z1) - R.cz + 0.13), r2(Math.max(x0, x1) - R.cx - 0.13), r2(Math.max(z0, z1) - R.cz - 0.13), tint]);
  // is (x, z) of the builder's frame within pad of one of the room's partitions? (What is scattered on a floor does
  // not lie through a wall.)
  const atPartition = (R, x, z, pad) => {
    if (!R) return false;
    for (const [x0, z0, x1, z1] of R.walls) {
      const ax = x0 + R.cx, az = z0 + R.cz, dx = x1 - x0, dz = z1 - z0;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < pad) return true;
    }
    return false;
  };
  // a fire somebody keeps in a drum, in a room: the one light in it that is not the day's
  const drumFire = (b, lx, lz) => {
    b.prop('barrel', lx, lz, 0, { ly: FLOOR_Y, seed: 2 });
    b.light(lx, FLOOR_Y + 1.0, lz, 'embers');
  };
  // What is left of a wall, from (x0, z0) to (x1, z1) along one axis of the builder's frame: lengths of it, each
  // broken off at its own height (up to H), its window openings holes with the sky in them. soot: it burnt.
  // inner: what its other face is made of (the plaster of the rooms that stood against it).
  const jagged = (b, x0, z0, x1, z1, y0, H, mat, collide = true, o = {}) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 2.6));
    const seg = len / n;
    const heights = [];
    let h = H * rng.range(0.6, 1);
    for (let k = 0; k < n; k++) {
      h = clamp(h + rng.range(-0.4, 0.3) * H, H * 0.14, H);
      const t = (k + 0.5) / n;
      const [cx, cz] = [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
      solid(b, cx, y0, cz, alongX ? seg + 0.02 : 0.4, h, alongX ? 0.4 : seg + 0.02, mat, { collide });
      heights.push(Math.round(h * 100) / 100);
    }
    shells.push({ x0: b.wx(x0, z0), z0: b.wz(x0, z0), x1: b.wx(x1, z1), z1: b.wz(x1, z1), y: b.y0 + y0, t: 0.4, mat, fh: 3, heights, seed: rng.int(1, 99999), soot: o.soot ? 1 : 0, inner: o.inner });
  };
  // A heap of what a building came down as, rx by rz across and h high: solid in steps a survivor climbs (0.4 m
  // each: under STEP_HEIGHT), drawn by the kit as rubble. across: it lies in a road (worldcheck.js lets it).
  const heap = (b, lx, lz, rx, rz, h, o = {}) => {
    const ry = o.ry ?? 0;
    const ly = o.ly ?? PAVE;
    const n = Math.max(1, Math.round(h / 0.4));
    for (let k = 0; k < n; k++) {
      // (the mound's own width at the top of this step: the kit's profile is h * (1 - t^2)^0.85)
      const e = Math.sqrt(Math.max(0, 1 - Math.pow(((k + 1) * 0.4) / (h + 0.05), 1 / 0.85)));
      if (e * Math.min(rx, rz) < 0.35) break;
      solid(b, lx, ly, lz, rx * 2 * e * 0.86, (k + 1) * 0.4, rz * 2 * e * 0.86, 'concrete', { ry });
      if (o.across) parts[parts.length - 1].across = true;
    }
    heaps.push({ x: b.wx(lx, lz), y: b.y0 + ly, z: b.wz(lx, lz), ry: b.ry + ry, rx, rz, h, seed: rng.int(1, 99999), brick: o.brick ?? 0.3, ash: o.ash ? 1 : undefined });
    clears.push([b.wx(lx, lz), b.wz(lx, lz), Math.max(rx, rz) + 0.5]);
  };
  // a board or a mark of the city's atlas: its middle at (lx, ly, lz) of the builder's frame, facing the builder's
  // -Z turned by ry
  const signAt = (b, lx, ly, lz, ry, w, h, cell, o = {}) => signs.push({ x: b.wx(lx, lz), y: b.y0 + ly, z: b.wz(lx, lz), ry: b.ry + ry, w, h, cell, ...o });
  // Does a prop of this type fit at (lx, lz) of a builder's frame: clear of every solid prop, of the walls and posts
  // built so far, and of the doorways (a metre and a half of each is kept open), with room left to reach what is
  // searched or picked up beside it? For what is added to a place after what it needs has been put down.
  // (two long vehicles end to end can meet further apart than propBlocked looks - a bus, an articulated truck:
  // none is put down in that band of another)
  const LONG = { semi_truck: 1, school_bus: 1, city_bus: 1 };
  const longClear = (type, x, z) => !LONG[type] || props.every((p) => !LONG[p.type] || Math.max(Math.abs(p.x - x), Math.abs(p.z - z)) <= 12 || Math.hypot(p.x - x, p.z - z) > 13.8);
  // (the parts by 32 m cells, indexed as they are asked for: parts is only pushed to while the world is built)
  const partIndex = new Map();
  let partsIndexed = 0;
  const _pn = [];
  const partsNear = (x, z) => {
    for (; partsIndexed < parts.length; partsIndexed++) {
      const p = parts[partsIndexed];
      const key = Math.floor(p.x / 32) * 4096 + Math.floor(p.z / 32);
      let arr = partIndex.get(key);
      if (!arr) partIndex.set(key, (arr = []));
      arr.push(partsIndexed);
    }
    _pn.length = 0;
    for (let i = Math.floor((x - 30) / 32); i <= Math.floor((x + 30) / 32); i++) for (let j = Math.floor((z - 30) / 32); j <= Math.floor((z + 30) / 32); j++) for (const k of partIndex.get(i * 4096 + j) || []) _pn.push(k);
    return _pn;
  };
  const fits = (b, type, lx, lz, ry = 0, ly = 0) => {
    if (!PROPS[type]) return false;
    const x = b.wx(lx, lz);
    const z = b.wz(lx, lz);
    const wry = b.ry + ry;
    if (propBlocked(type, x, z, wry) || !longClear(type, x, z)) return false;
    const mine = kit.solidsOf(type, x, z, wry);
    if (!mine.length) return true;
    const y0 = b.y0 + ly;
    const y1 = y0 + (PROPS[type]?.size[1] ?? 1);
    const reach = Math.hypot(PROPS[type].size[0], PROPS[type].size[2]) / 2;
    for (const o of openings) if (Math.hypot(o.x - x, o.z - z) < reach + 1.15) return false;
    for (const o of containers) if (Math.hypot(o.x - x, o.z - z) < reach + 0.85) return false;
    for (const o of lootSpawns) if (Math.hypot(o.x - x, o.z - z) < reach + 0.75) return false;
    for (const o of partSpots) if (Math.hypot(o.x - x, o.z - z) < reach + 0.9) return false;
    for (const i of partsNear(x, z)) {
      const p = parts[i];
      if (Math.abs(p.x - x) > 30 || Math.abs(p.z - z) > 30 || p.rx || p.rz || (p.shape !== 'box' && p.shape !== 'cyl')) continue;
      if (p.y + p.sy / 2 < y0 + 0.2 || p.y - p.sy / 2 > y1 - 0.05) continue;
      const q = { x: p.x, z: p.z, hx: p.shape === 'box' ? p.sx / 2 : 0, hz: p.shape === 'box' ? p.sz / 2 : 0, c: Math.cos(p.ry), s: Math.sin(p.ry), r: p.shape === 'box' ? 0 : p.sx / 2 };
      for (const a of mine) if (kit.solidsMeet({ ...a, hx: a.hx + 0.02, hz: a.hz + 0.02 }, q)) return false;
    }
    return true;
  };
  // ...put there if it does (after its draws: what is left out moves nothing else)
  const extra = (b, type, lx, lz, ry = 0, o = {}) => {
    const sd = rng.int(0, 99);
    if (PROPS[type] && (PROPS[type].boxes || PROPS[type].cyls) && !fits(b, type, lx, lz, ry, o.ly ?? 0)) return false;
    if (PROPS[type] && o.ly === undefined && b.open(b.wx(lx, lz), b.wz(lx, lz))) {
      // (out on the ground: not across a bank or a ditch - it would hang in the air at one end)
      const r = Math.hypot(PROPS[type].size[0], PROPS[type].size[2]) / 2;
      const [x, z] = [b.wx(lx, lz), b.wz(lx, lz)];
      const h0 = heightAt(x, z);
      if (Math.abs(h0 - b.y0) > 0.07) return false; // (nor where the ground has left the place's own level)
      if (r > 0.6 && [[r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => Math.abs(heightAt(x + dx, z + dz) - h0) > (r > 2 ? 0.3 : 0.14))) return false;
    }
    b.prop(type, lx, lz, ry, { seed: sd, ...o, nocollide: !(PROPS[type]?.boxes || PROPS[type]?.cyls) });
    return true;
  };

  // soot up a wall from the windows a fire came out of, and what has grown up it since (ivy needs a wall 5 m high)
  const ivyOn = (b, cx, cz, w, d, y0, h) => {
    const here = rng.chance(0.45);
    const face = rng.int(0, 2); // (never the front: the door is in it)
    const at = rng.range(-0.3, 0.3);
    const sd = rng.int(0, 2);
    if (!here || y0 + h < 5) return;
    if (face === 0) b.prop('ivy', cx + at * (w - 4), cz + d / 2 + 0.04, PI, { nocollide: true, seed: sd, ly: PAVE });
    else b.prop('ivy', cx + (face === 1 ? 1 : -1) * (w / 2 + 0.04), cz + at * (d - 4), face === 1 ? -PI / 2 : PI / 2, { nocollide: true, seed: sd, ly: PAVE });
  };
  // what fell out of a wall, at its foot: lumps and slabs on the pavement (nothing solid: it is walked over)
  const skirt = (b, x, z, ly = PAVE) => {
    b.prop('debris', x, z, rng.range(0, 6), { nocollide: true, ly, seed: rng.int(0, 2) });
    // (pieces of the paving broken up, lying on the ground beside it - flat and half sunk, no plate tipped in the air)
    for (let k = rng.int(1, 2); k > 0; k--) {
      const [sx, sy, sz] = [x + rng.range(-1.6, 1.6), ly + rng.range(0, 0.25), z + rng.range(-1, 1)];
      const [w, d, ry, rz, rx] = [rng.range(1.1, 2.4), rng.range(0.9, 1.7), rng.range(0, 3), rng.range(-0.55, 0.55) * 0.45, rng.range(-0.2, 0.2) * 0.5];
      b.box(sx, ly - 0.07 + (sy - ly) * 0.05, sz, w * 0.45, 0.12, d * 0.45, 'concrete', { ry, rz: rz * 0.25, rx: rx * 0.25, collide: false });
    }
  };
  // the stairs up, in a corner of a ground floor: gone under what fell down them
  const stairBlock = (b, x, z) => {
    b.box(x, FLOOR_Y, z, 2.2, 1.5, 1.4, 'concrete');
    b.box(x + 0.2, FLOOR_Y + 1.3, z - 0.1, 2.4, 0.25, 1.6, 'concrete', { rz: 0.3, collide: false });
    b.box(x - 0.5, FLOOR_Y + 1.5, z + 0.2, 0.12, 1.4, 0.12, 'rust', { rz: -0.3, collide: false });
    b.prop('debris', x, z - 1.5, rng.range(0, 6), { nocollide: true, ly: FLOOR_Y });
  };
  // what came down off a lot into the street in front of it: a heap at the kerb (not where the tower's top lies:
  // that stretch has rubble of its own)
  let fallenAt = null; // [x, z] of the middle of the stretch of street the tower fell across
  const streetPile = (b, L, lx) => {
    const [x, z] = [b.wx(lx, -L.d / 2 - 1.3), b.wz(lx, -L.d / 2 - 1.3)];
    const [rx, h] = [rng.range(1.6, 2.4), rng.range(0.8, 1.3)];
    if (fallenAt && Math.abs(x - fallenAt[0]) < 26 && Math.abs(z - fallenAt[1]) < 26) return;
    heap(b, lx, -L.d / 2 - 1.3, rx, 1.2, h, { across: true, brick: 0.5 });
  };
  // (the tower that fell across a street: mainland/city.js)
  const setFallenAt = (at) => {
    fallenAt = at;
  };
  return { frame, WALL, backZ, leftX, rightX, inside, cont, buildings, rooms, shells, heaps, ships, fallenBits, pancakes, signs, hide, solid, block, groundRoom, partition, zone, lino, atPartition, drumFire, jagged, heap, signAt, longClear, fits, extra, ivyOn, skirt, stairBlock, streetPile, setFallenAt };
}
