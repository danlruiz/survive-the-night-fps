// The rooms of the city that are walked into (citykit.js): their lining, ceilings, floors, openings and doors.
import { TIER, PI, WHITE, CEIL_N, PLASTER_CEIL_N, hash, rngOf, faceOf, innerFace, fp, decal, ROOM_TINT, SOOTY } from './kit.js';

// ------------------------------------------------------------------ a room that is walked into
// R (from the world): { x, z, ry, y, w, d, h, t, mat, sides: { n, s, e, w }: the openings of each wall as the Builder
// cut them, tint (0..), floor ('lino', 'boards' or none), ceiling ('ceiling': office tiles, 'plaster'), ceil (how
// high the ceiling hangs, if under h), sign (a cell of the atlas: the board over the shop), walls: [[x0, z0, x1, z1,
// h, [openings]]] the partitions in it, zones: [[x0, z0, x1, z1, tint]] the rooms those make of it, each painted its
// own way, patches: [[x0, z0, x1, z1, tint]] lino laid over part of its floor (a kitchen's, a bathroom's), homely (a
// home: pictures on its walls), burnt (it burnt out: bare sooted walls, no ceiling) }.
// The walls themselves are the world's own parts (they are what is walked into); this lines them inside with
// plaster, puts a ceiling under the slab and a floor on it, frames the openings, hangs the doors and the shop's
// board. No lamp burns in Port Calder, so a room's light is the day through its openings: it is laid into the
// lining's own colour, brightest beside a window or a doorway and falling off into the room and behind each
// partition (LIT), which is what makes a room read from its door.
const LIT = [1.1, 3.1]; // how much of its colour a lining shows: where the day does not reach, and beside a window
const LINO_TINT = [[1, 1, 0.96], [0.84, 0.94, 0.84], [1.0, 0.9, 0.78], [0.84, 0.9, 1.0], [0.98, 0.86, 0.78], [0.92, 0.92, 0.92]];
const BOARD_TINT = [[1, 0.94, 0.84], [0.92, 0.84, 0.74], [1.02, 1.0, 0.94]];
const CEIL_WHITE = [0.97, 0.96, 0.91];
const CEIL_HANG = 0.35; // (m: see room's ceiling)
const STAINS = ['damp_a', 'damp_b', 'stain_a', 'stain_b', 'crack_a', 'crack_b', 'damp_b', 'stain_a'];
export function room(S, R) {
  S.frame(R.x, R.y, R.z, R.ry);
  const hw = R.w / 2, hd = R.d / 2;
  const t = R.t || 0.25;
  const base = R.burnt ? SOOTY : ROOM_TINT[(R.tint ?? 0) % ROOM_TINT.length];
  const y0 = 0.12, y1 = Math.min(R.h, R.ceil || R.h); // (the floor's slab, the ceiling)
  const SIDES = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const rnd = rngOf(R.seed || 1);
  const T = TIER.ROOM;
  // ---- the light: every opening of the outer walls lets the day in, by its size; a partition between takes most of it
  const AT = { n: (o) => [-hw + o.at, -hd + 0.35], s: (o) => [hw - o.at, hd - 0.35], w: (o) => [-hw + 0.35, hd - o.at], e: (o) => [hw - 0.35, -hd + o.at] };
  const lamps = [];
  for (const key of Object.keys(SIDES)) {
    for (const o of R.sides?.[key] || []) {
      const [x, z] = AT[key](o);
      const top = Math.min(o.y1, y1);
      lamps.push([x, (o.y0 + top) / 2, z, o.w * (top - o.y0) * (o.glass ? 0.8 : 1)]);
    }
  }
  const walls = R.walls || [];
  const blocks = []; // (the partitions, less their doorways: [x0, z0, x1, z1])
  const ends = []; // (where a partition ends: a wall it meets is painted another colour on either side of it)
  for (const [x0, z0, x1, z1, , ops] of walls) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    let cur = 0;
    const seg = (a, b) => b - a > 0.05 && blocks.push([x0 + ((x1 - x0) * a) / L, z0 + ((z1 - z0) * a) / L, x0 + ((x1 - x0) * b) / L, z0 + ((z1 - z0) * b) / L]);
    for (const o of (ops || []).slice().sort((a, b) => a.at - b.at)) {
      seg(cur, o.at - o.w / 2);
      cur = o.at + o.w / 2;
    }
    seg(cur, L);
    ends.push([x0, z0], [x1, z1]);
  }
  const crosses = (ax, az, bx, bz, q) => {
    const d1 = (bx - ax) * (q[1] - az) - (bz - az) * (q[0] - ax), d2 = (bx - ax) * (q[3] - az) - (bz - az) * (q[2] - ax);
    if (d1 * d2 >= 0) return false;
    const d3 = (q[2] - q[0]) * (az - q[1]) - (q[3] - q[1]) * (ax - q[0]), d4 = (q[2] - q[0]) * (bz - q[1]) - (q[3] - q[1]) * (bx - q[0]);
    return d3 * d4 < 0;
  };
  const lit = (x, y, z) => {
    if (R.burnt) return 1.15;
    let sum = 0;
    for (const [lx, ly, lz, a] of lamps) {
      let k = a / (1 + ((x - lx) ** 2 + (y - ly) ** 2 + (z - lz) ** 2) / 7);
      if (k < 0.03) continue;
      for (const q of blocks) if (crosses(lx, lz, x, z, q)) k *= 0.42;
      sum += k;
    }
    return LIT[0] + (LIT[1] - LIT[0]) * (sum / (sum + 1.0));
  };
  const zones = R.zones || [];
  const tintAt = (x, z) => {
    if (R.burnt) return base;
    for (const q of zones) if (x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]) return ROOM_TINT[q[4] % ROOM_TINT.length];
    return base;
  };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  // A stretch of plaster on a face, a0..a1 along it and ya..yb up: cut where a partition meets the wall (the room
  // on its other side is another colour) and every couple of metres between, so the light falls off along it.
  let nth = 0;
  const lining = (F, a0, a1, ya, yb, d = 0, dim = 1) => {
    if (a1 - a0 < 0.01 || yb - ya < 0.01) return;
    const cuts = [a0, a1];
    for (const [ex, ez] of ends) {
      if (Math.abs((ex - F.ax) * F.nx + (ez - F.az) * F.nz) > 0.4) continue;
      const s = (ex - F.ax) * F.tx + (ez - F.az) * F.tz;
      if (s > a0 + 0.12 && s < a1 - 0.12) cuts.push(s);
    }
    cuts.sort((a, b) => a - b);
    const uo = F.uo ?? 0, vo = F.vo ?? 0;
    for (let c = 0; c + 1 < cuts.length; c++) {
      const b0 = cuts[c], b1 = cuts[c + 1];
      if (b1 - b0 < 0.02) continue;
      const mid = fp(F, (b0 + b1) / 2, 0, -0.3); // (a point off the wall, in the room this face looks into)
      const tn = mul(tintAt(mid[0], mid[2]), dim);
      const n = Math.max(1, Math.ceil((b1 - b0) / 1.8));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const s = b0 + ((b1 - b0) * k) / n;
        const q = fp(F, Math.min(b1 - 0.1, Math.max(b0 + 0.1, s)), 0, -0.3);
        const cur = [s, mul(tn, lit(q[0], ya, q[2])), mul(tn, lit(q[0], yb, q[2]))];
        if (prev) S.quad('plaster', T, fp(F, prev[0], ya, d), fp(F, s, ya, d), fp(F, s, yb, d), fp(F, prev[0], yb, d), [[uo + prev[0], vo + ya], [uo + s, vo + ya], [uo + s, vo + yb], [uo + prev[0], vo + yb]], [prev[1], cur[1], cur[2], prev[2]]);
        prev = cur;
      }
    }
  };
  // what the years put on a stretch of wall with nothing cut in it: damp, a stain run down from the ceiling, a
  // crack, now and then a picture still hanging or what a fight left
  const marksOn = (F, a0, a1, top) => {
    const len = a1 - a0;
    if (len < 1.5) return;
    const n = Math.max(1, Math.round(len / 4.2));
    for (let j = 0; j < n; j++) {
      const k = nth++;
      const r = hash(R.seed, k, 601), r2 = hash(R.seed, k, 602);
      const s = a0 + (len * (j + 0.22 + 0.56 * r2)) / n;
      if (R.burnt) {
        if (r < 0.6) decal(S, F, r2 < 0.5 ? 'soot_a' : 'soot_b', s, y0 + 1.5, 1.2 + r * 2, 3, true, T);
        continue;
      }
      if (r > 0.72) continue;
      if (r < 0.13 && R.homely) decal(S, F, ['poster_a', 'poster_b', 'poster_c', 'poster_d'][(r2 * 4) | 0], s, y0 + 1.5, 0.46, 0.69, false, T);
      else if (r < 0.19) decal(S, F, r2 < 0.5 ? 'bullets' : 'blood', s, y0 + 0.9 + r2 * 0.8, 1.1, 1.1, true, T);
      else {
        const m = STAINS[(r2 * STAINS.length) | 0];
        if (m[0] === 's') {
          const h = Math.min(top - y0 - 0.2, 1.1 + r * 2);
          decal(S, F, m, s, top - h / 2, 0.5 + r2 * 0.8, h, true, T);
        } else if (m[0] === 'd') {
          const sz = Math.min(len - 0.2, 1.3 + r * 1.7);
          decal(S, F, m, s, r2 < 0.55 ? y0 + sz * 0.42 : top - sz * 0.45, sz, sz * 0.9, true, T);
        } else decal(S, F, m, s, y0 + 1.1 + r2 * 0.9, 1 + r * 1.2, 1 + r * 1.2, true, T);
      }
    }
  };
  let wi = 0;
  for (const [key, [nx, nz]] of Object.entries(SIDES)) {
    // the inside face of this wall. It runs the way the Builder laid the wall (n from -x, s from +x, w from +z, e
    // from -z), so an opening's `at` is its place along it, less half the wall at the corner.
    const In = innerFace(-hw + t / 2 + 0.006, hw - t / 2 - 0.006, -hd + t / 2 + 0.006, hd - t / 2 - 0.006, nx, nz);
    In.uo = hash(R.seed, wi, 611) * 7;
    In.vo = hash(R.seed, wi++, 612) * 5;
    const ops = (R.sides?.[key] || []).map((o) => ({ ...o, s: o.at - t / 2 })).sort((p, q) => p.s - q.s);
    let cur = 0;
    const plain = (a0, a1) => {
      a0 = Math.max(0, a0);
      a1 = Math.min(In.len, a1);
      lining(In, a0, a1, y0, y1);
      if (!R.burnt) lining(In, a0, a1, y0, y0 + 0.14, -0.012, 0.5); // (a skirting board, the dirt of years on it)
      marksOn(In, a0, a1, y1);
    };
    for (const o of ops) {
      const a0 = o.s - o.w / 2, a1 = o.s + o.w / 2;
      plain(cur, a0);
      if (o.y0 > y0) {
        lining(In, a0, a1, y0, o.y0);
        if (!R.burnt) lining(In, a0, a1, y0, y0 + 0.14, -0.012, 0.5);
      }
      if (o.y1 < y1) lining(In, a0, a1, o.y1, y1);
      cur = a1;
      if (!R.burnt) opening(S, In, o, a0, a1, t, R, rnd);
      else if (o.y1 < y1 - 0.4) decal(S, In, hash(R.seed, wi, o.at * 10) < 0.5 ? 'soot_a' : 'soot_b', o.s, o.y1 - 0.15 + (y1 - o.y1 + 0.6) / 2, o.w * 1.5, y1 - o.y1 + 0.6, true, T);
    }
    plain(cur, In.len);
  }
  // the ceiling and the floor, in squares a couple of metres across (each corner takes the light there)
  const sheet = (mat, y, x0, z0, x1, z1, up, uvOf, colOf, nrm = null) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / 2.3)), nz = Math.max(1, Math.ceil((z1 - z0) / 2.3));
    const P = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
        P.push([[x, y, z], uvOf(x, z), colOf(x, z)]);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = P[j * (nx + 1) + i], b = P[j * (nx + 1) + i + 1], c = P[(j + 1) * (nx + 1) + i + 1], e = P[(j + 1) * (nx + 1) + i];
        if (up) S.quad(mat, T, e[0], c[0], b[0], a[0], [e[1], c[1], b[1], a[1]], [e[2], c[2], b[2], a[2]], nrm);
        else S.quad(mat, T, a[0], b[0], c[0], e[0], [a[1], b[1], c[1], e[1]], [a[2], b[2], c[2], e[2]], nrm);
      }
    }
  };
  const ix = hw - t / 2, iz = hd - t / 2;
  if (R.ceiling && !R.burnt) {
    // (its normal is not straight down: the sky's light is none on a face that looks at the ground, and a ceiling is
    // as light as the walls under it)
    const tiles = R.ceiling !== 'plaster';
    const uo = hash(R.seed, 621) * 3, vo = hash(R.seed, 622) * 3;
    // A plastered ceiling takes the sun as a wall does (its normal: PLASTER_CEIL_N), and what keeps the sun off it
    // is the shadow of the roof over it. Laid right under that roof (a hall with no ceiling hung in it: the picture
    // house, the nave) it is nearer the roof's underside than a shadow map can tell apart, the roof's shadow never
    // falls on it, and it shines like an open sky over a dark room. There it hangs CEIL_HANG lower. A tiled ceiling
    // stays right under its slab: its material takes the sun as the roof's shadow leaves it (materials.js underRoof).
    const hang = !tiles && !R.ceil ? CEIL_HANG : 0.004;
    sheet(tiles ? 'ceiling' : 'plaster', y1 - hang, -ix, -iz, ix, iz, false, (x, z) => (tiles ? [x, z] : [x + uo, z + vo]), (x, z) => mul(tiles ? WHITE : CEIL_WHITE, lit(x, y1, z) * 0.94), tiles ? CEIL_N : PLASTER_CEIL_N);
  }
  const floorOf = (kind, y, x0, z0, x1, z1, ti) => {
    if (kind === 'boards') {
      const along = hash(R.seed, 631) < 0.5;
      const tn = BOARD_TINT[ti % BOARD_TINT.length];
      sheet('floorboards', y, x0, z0, x1, z1, true, (x, z) => (along ? [x, z] : [z, x]), (x, z) => mul(tn, lit(x, y0, z)));
    } else {
      // (tile laid square or on the diagonal, each floor from its own corner: no two rooms' chequers line up)
      const a = hash(R.seed, ti, 632) < 0.35 ? PI / 4 : 0;
      const ca = Math.cos(a), sa = Math.sin(a);
      const uo = hash(R.seed, ti, 633) * 2.4, vo = hash(R.seed, ti, 634) * 2.4;
      const tn = LINO_TINT[ti % LINO_TINT.length];
      sheet('lino', y, x0, z0, x1, z1, true, (x, z) => [x * ca + z * sa + uo, -x * sa + z * ca + vo], (x, z) => mul(tn, lit(x, y0, z)));
    }
  };
  if (R.floor && !R.burnt) floorOf(R.floor, y0 + 0.004, -ix, -iz, ix, iz, (R.tint ?? 0) + (R.seed % 5));
  for (const q of R.patches || []) floorOf('lino', y0 + 0.009, q[0], q[1], q[2], q[3], q[4] ?? 0);
  // partitions: plaster on both faces of each, a door hanging in some of their doorways
  for (const [x0, z0, x1, z1, h, opsIn] of walls) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    const pt = 0.09 + 0.006;
    const top = Math.min(h, y1);
    for (const sgn of [1, -1]) {
      // (the face whose normal is sgn * (-tz, tx): s runs to the right seen from in front of it)
      const nx = sgn * -tz, nz = sgn * tx;
      const ftx = nz, ftz = -nx;
      const fwd = ftx * tx + ftz * tz > 0;
      const F = { ax: (fwd ? x0 : x1) + nx * pt, az: (fwd ? z0 : z1) + nz * pt, tx: ftx, tz: ftz, nx, nz, len: L, uo: hash(R.seed, wi, 611) * 7, vo: hash(R.seed, wi++, 612) * 5 };
      let cur = 0;
      const ops = (opsIn || []).map((o) => ({ ...o, s: fwd ? o.at : L - o.at })).sort((a, b) => a.s - b.s);
      const plain = (a0, a1) => {
        lining(F, a0, a1, y0, top);
        if (!R.burnt) lining(F, a0, a1, y0, y0 + 0.14, -0.012, 0.5);
        marksOn(F, a0 + 0.1, a1 - 0.1, top);
      };
      for (const o of ops) {
        plain(cur, o.s - o.w / 2);
        if (o.y1 < top) lining(F, o.s - o.w / 2, o.s + o.w / 2, o.y1, top);
        if (o.y0 > y0) lining(F, o.s - o.w / 2, o.s + o.w / 2, y0, o.y0);
        cur = o.s + o.w / 2;
        // (a door, on the side of the wall it opens to: one in three is off its hinges and gone)
        if (sgn > 0 && o.y0 === 0 && o.w <= 1.75 && !R.burnt && hash(R.seed, wi, o.at * 10, 641) < 0.68) doorLeaf(S, F, o.s - o.w / 2, o.s + o.w / 2, o, rnd);
      }
      plain(cur, L);
    }
  }
  // ---- outside: the board over a shop, what was sprayed and pasted on its walls
  if (R.sign) {
    const F = faceOf(-hw, hw, -hd, hd, 0, -1);
    const sw = Math.min(R.w - 1.2, 7.6), sh = sw / 4;
    const hang = hash(R.seed, 11) < 0.25; // (down at one end)
    const yb = Math.min(R.h - 0.1, 3.5) - sh * 0.5 + 0.35;
    const c = F.len / 2 + (R.signAt || 0);
    const dy = hang ? -0.55 : 0;
    const p0 = fp(F, c - sw / 2, yb - sh / 2 + dy, -0.16), p1 = fp(F, c + sw / 2, yb - sh / 2, -0.16), p2 = fp(F, c + sw / 2, yb + sh / 2, -0.16), p3 = fp(F, c - sw / 2, yb + sh / 2 + dy, -0.16);
    S.cell('citysign', TIER.FAR, R.sign, p0, p1, p2, p3);
    const b0 = fp(F, c - sw / 2, yb - sh / 2 + dy, -0.02), b1 = fp(F, c + sw / 2, yb - sh / 2, -0.02), b2 = fp(F, c + sw / 2, yb + sh / 2, -0.02), b3 = fp(F, c - sw / 2, yb + sh / 2 + dy, -0.02);
    S.quad('metal', TIER.STREET, p3, p2, b2, b3);
    S.quad('metal', TIER.STREET, b0, b1, p1, p0);
    S.quad('metal', TIER.STREET, b0, p0, p3, b3);
    S.quad('metal', TIER.STREET, p1, b1, b2, p2);
  }
  const marks = ['graf_help', 'graf_dead', 'graf_room', 'graf_god', 'graf_bridge', 'graf_night', 'graf_names', 'graf_tag', 'xcode_a', 'xcode_b', 'poster_a', 'poster_b', 'poster_c', 'poster_d', 'bullets', 'blood'];
  for (const [key, [nx, nz]] of Object.entries(SIDES)) {
    const F = faceOf(-hw, hw, -hd, hd, nx, nz);
    const ops = (R.sides?.[key] || []).map((o) => (key === 'n' || key === 's' || key === 'e' || key === 'w' ? F.len - o.at : o.at));
    // the stretches of wall with nothing cut in them
    const cuts = (R.sides?.[key] || []).map((o) => [F.len - o.at - o.w / 2 - 0.3, F.len - o.at + o.w / 2 + 0.3]).sort((a, b) => a[0] - b[0]);
    void ops;
    let cur = 0.3;
    const free = [];
    for (const [a, b] of cuts) {
      if (a - cur > 1.6) free.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (F.len - 0.3 - cur > 1.6) free.push([cur, F.len - 0.3]);
    if (R.burnt) {
      // soot up the wall over every opening the fire came out of: densest at its head, thinning upward
      for (const o of R.sides?.[key] || []) {
        const sh = R.h - o.y1 + 2.4 + hash(R.seed, o.at * 10, nx, nz) * 1.6;
        decal(S, F, hash(R.seed, o.at * 10, nx * 3 + nz, 207) < 0.5 ? 'soot_a' : 'soot_b', F.len - o.at, o.y1 - 0.2 + sh / 2, o.w * (1.4 + hash(R.seed, o.at * 10, 208) * 0.5), sh, true, TIER.FAR);
      }
      continue;
    }
    free.forEach(([a, b], k) => {
      const r = hash(R.seed, k, nx * 3 + nz, 201);
      if (r > 0.62) return;
      const m = marks[(hash(R.seed, k, nx * 3 + nz, 202) * marks.length) | 0];
      const soft = m === 'bullets' || m === 'blood';
      const small = m.startsWith('poster') || m.startsWith('xcode');
      const w = Math.min(b - a - 0.2, small ? 0.9 : soft ? 1.4 : 3.2);
      const h = small ? w * (m.startsWith('poster') ? 1.5 : 1) : soft ? w : w * 0.42;
      decal(S, F, m, a + (b - a) * (0.3 + r * 0.6), small ? 1.5 : 1.25 + r * 0.6, w, h, soft, TIER.STREET);
    });
    // damp rising from the pavement, rust and dirt under the roof's edge
    if (hash(R.seed, nx, nz, 203) < 0.7) decal(S, F, 'damp_a', F.len * hash(R.seed, nx, nz, 204), 0.7, 3.4, 1.6);
    if (hash(R.seed, nx, nz, 205) < 0.5) decal(S, F, 'stain_b', F.len * hash(R.seed, nx, nz, 206), R.h - 1.1, 1.3, 2.2);
  }
}

// what is in an opening of a room's wall: o as the Builder cut it, a0..a1 where it is along the inside face In, t the
// wall's thickness
function opening(S, In, o, a0, a1, t, R, rnd) {
  const T = TIER.ROOM;
  const isDoor = o.y0 === 0;
  const fm = R.mat === 'tin' || R.mat === 'concrete' ? 'metal' : 'trim';
  if (!isDoor && !o.glass) {
    // a window with the glass gone: a frame in the wall's thickness and teeth of glass in it
    const d = t / 2;
    for (const [s0, s1, ya, yb] of [[a0, a0 + 0.06, o.y0, o.y1], [a1 - 0.06, a1, o.y0, o.y1], [a0, a1, o.y1 - 0.06, o.y1], [a0, a1, o.y0, o.y0 + 0.06]]) {
      const c = fp(In, (s0 + s1) / 2, (ya + yb) / 2, d);
      S.box(fm, T, c[0], c[1], c[2], In.tx ? s1 - s0 : 0.08, yb - ya, In.tx ? 0.08 : s1 - s0);
    }
    const w = a1 - a0, h = o.y1 - o.y0;
    const n = 4 + ((rnd() * 6) | 0);
    for (let k = 0; k < n; k++) {
      const tt = rnd();
      const len = (0.12 + rnd() * 0.45) * Math.min(w, h);
      const wd = 0.1 + rnd() * 0.35;
      const e = k % 4;
      let p;
      if (e === 0) p = [[a0 + tt * (w - wd), o.y0 + 0.06], [a0 + tt * (w - wd) + wd, o.y0 + 0.06], [a0 + tt * (w - wd) + wd * 0.5, o.y0 + 0.06 + len]];
      else if (e === 1) p = [[a0 + tt * (w - wd) + wd, o.y1 - 0.06], [a0 + tt * (w - wd), o.y1 - 0.06], [a0 + tt * (w - wd) + wd * 0.5, o.y1 - 0.06 - len]];
      else if (e === 2) p = [[a0 + 0.06, o.y0 + tt * (h - wd) + wd], [a0 + 0.06, o.y0 + tt * (h - wd)], [a0 + 0.06 + len * 0.7, o.y0 + tt * (h - wd) + wd * 0.5]];
      else p = [[a1 - 0.06, o.y0 + tt * (h - wd)], [a1 - 0.06, o.y0 + tt * (h - wd) + wd], [a1 - 0.06 - len * 0.7, o.y0 + tt * (h - wd) + wd * 0.5]];
      const q = p.map(([s, y]) => fp(In, s, y, d));
      S.tri('glass', T, q[0], q[1], q[2], p[0], p[1], p[2]);
      S.tri('glass', T, q[1], q[0], q[2], p[1], p[0], p[2]);
    }
  } else if (isDoor && o.w <= 1.75 && rnd() < 0.55) doorLeaf(S, In, a0, a1, o, rnd);
}
// a door still on its hinges in the doorway a0..a1 of the face In, standing open into the room the face looks into
// (well open, back toward its wall: the doorway is walked through)
function doorLeaf(S, In, a0, a1, o, rnd) {
  const atA0 = rnd() < 0.5;
  const ang = 1.05 + rnd() * 0.45;
  const dw = o.w - 0.1;
  const sg = atA0 ? 1 : -1;
  // (from the hinge: along the wall, turned by ang toward the room)
  const dx = In.tx * Math.cos(ang) * sg + In.nx * Math.sin(ang), dz = In.tz * Math.cos(ang) * sg + In.nz * Math.sin(ang);
  const hp = fp(In, atA0 ? a0 + 0.05 : a1 - 0.05, 0.12 + (o.y1 - 0.14) / 2, 0);
  S.box('door', TIER.ROOM, hp[0] + (dx * dw) / 2, hp[1], hp[2] + (dz * dw) / 2, dw, o.y1 - 0.14, 0.045, { ry: Math.atan2(-dz, dx), u0: 0 });
}
