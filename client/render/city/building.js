// A building of the city (citykit.js): its storeys, those broken open on their slabs, what is left under the sky,
// and its roof.
import { TIER, WHITE, CEIL_N, hash, rngOf, faceOf, FACES, fp, wallQuad, wallBack, faceBox, decal, STYLE, STUCCO, ROOM_TINT, weedsAt } from './kit.js';
import { storeyWall, trimOf } from './facade.js';
import { rubble } from './ruins.js';

// ------------------------------------------------------------------ a building
// B (from the world): { x, z, ry, y, w, d, floors, fh, style, mat, seed, cut, wear, burnt, blank, ground, top }.
//   cut[f]: [x0, x1, z0, z1], what stands of storey f in the building's frame (absent: all of it). A side of it that
//   is not on the building's own outline is a break: the storey is open there on its slab, columns and rooms.
//   top: 'roof' (whole, with what stands on a roof), 'slab' (the roof gone: a floor open to the sky)
export function building(S, B0) {
  const st = STYLE[B0.style] || STYLE.walkup;
  const stucco = B0.mat === 'plaster';
  const B = {
    ...B0,
    st,
    wall: st.curtain ? 'metal' : B0.mat,
    tint: stucco ? STUCCO[(hash(B0.seed, 5) * STUCCO.length) | 0] : WHITE,
    wear: B0.wear ?? 0.5,
    blank: B0.blank || 0,
    ground: B0.ground || 0,
  };
  S.frame(B.x, B.y, B.z, B.ry);
  const hw = B.w / 2, hd = B.d / 2;
  const full = [-hw, hw, -hd, hd];
  const rectOf = (f) => (f < 0 ? full : f >= B.floors ? null : B.cut?.[f] || full);
  const rnd = rngOf(B.seed * 7 + 3);
  const E = 0.02;
  for (let f = 0; f < B.floors; f++) {
    const R = rectOf(f);
    const up = rectOf(f + 1);
    const y0 = f * B.fh, y1 = y0 + B.fh;
    const open = [];
    FACES.forEach(([nx, nz], fi) => {
      const FF = faceOf(...full, nx, nz);
      FF.u0 = fi * 17.3 + (B.seed % 13);
      // how far along the whole face this storey's wall runs
      const lo = FF.tx > 0 ? R[0] - full[0] : FF.tx < 0 ? full[1] - R[1] : FF.tz > 0 ? R[2] - full[2] : full[3] - R[3];
      const hi = lo + (FF.tx ? R[1] - R[0] : R[3] - R[2]);
      const onOutline = nx > 0 ? R[1] > full[1] - E : nx < 0 ? R[0] < full[0] + E : nz > 0 ? R[3] > full[3] - E : R[2] < full[2] + E;
      if (onOutline) storeyWall(S, FF, B, fi, f, y0, lo, hi);
      else open.push(fi);
    });
    if (open.length) openStorey(S, B, f, R, open, rnd);
    // what of this storey's roof is under the sky: a slab with the stumps of what stood on it
    if (!up) {
      if (B.top === 'slab') terrace(S, B, R, null, y1, rnd);
    } else if (up[0] > R[0] + E || up[1] < R[1] - E || up[2] > R[2] + E || up[3] < R[3] - E) terrace(S, B, R, up, y1, rnd);
  }
  const top = rectOf(B.floors - 1);
  const yT = B.floors * B.fh;
  const whole = top[0] < full[0] + E && top[1] > full[1] - E && top[2] < full[2] + E && top[3] > full[3] - E;
  if (B.top !== 'slab') roofOf(S, B, top, yT, whole, rnd);
  if (whole || B.floors > 1) trimOf(S, B, full, rectOf, rnd);
}

// the parts of rectangle A that B does not cover (B inside A): up to four rectangles
function minus(A, B) {
  const out = [];
  if (B[0] > A[0] + 0.01) out.push([A[0], B[0], A[2], A[3]]);
  if (B[1] < A[1] - 0.01) out.push([B[1], A[1], A[2], A[3]]);
  if (B[2] > A[2] + 0.01) out.push([Math.max(A[0], B[0]), Math.min(A[1], B[1]), A[2], B[2]]);
  if (B[3] < A[3] - 0.01) out.push([Math.max(A[0], B[0]), Math.min(A[1], B[1]), B[3], A[3]]);
  return out;
}

// A storey broken open on some of its sides: its floor and its ceiling's slab, their broken edges with the steel
// hanging out of them, the columns that carried it, and the rooms that are looked into.
function openStorey(S, B, f, R, open, rnd) {
  const y0 = f * B.fh, y1 = y0 + B.fh;
  const SLAB = 0.26;
  const tint = ROOM_TINT[(hash(B.seed, f, 91) * ROOM_TINT.length) | 0];
  // the floor and the underside of the slab over it
  S.quad(f % 2 ? 'planks' : 'concrete', TIER.FAR, [R[0], y0 + 0.01, R[3]], [R[1], y0 + 0.01, R[3]], [R[1], y0 + 0.01, R[2]], [R[0], y0 + 0.01, R[2]], [[R[0], R[3]], [R[1], R[3]], [R[1], R[2]], [R[0], R[2]]]);
  S.quad('concrete', TIER.FAR, [R[0], y1 - SLAB, R[2]], [R[1], y1 - SLAB, R[2]], [R[1], y1 - SLAB, R[3]], [R[0], y1 - SLAB, R[3]], [[R[0], R[2]], [R[1], R[2]], [R[1], R[3]], [R[0], R[3]]], WHITE, CEIL_N);
  for (const fi of open) {
    const [nx, nz] = FACES[fi];
    const F = faceOf(R[0], R[1], R[2], R[3], nx, nz);
    const L = F.len;
    const depth = (F.tx ? R[3] - R[2] : R[1] - R[0]) - 0.4;
    // the slab's broken edge, top and bottom: lengths of it, each broken off at its own place, and bars out of them
    const n = Math.max(2, Math.round(L / 1.7));
    for (const yb of [y0 - SLAB, y1 - SLAB]) {
      if (yb < -0.01) continue;
      let prev = 0;
      for (let k = 0; k < n; k++) {
        const a0 = (k * L) / n, a1 = ((k + 1) * L) / n;
        const out = -(hash(B.seed, f * 37 + k, fi, yb * 10) * 0.55); // (how far past the storey's line this length still reaches)
        S.quad('concrete', TIER.FAR, fp(F, a0, yb, out), fp(F, a1, yb, out), fp(F, a1, yb + SLAB, out), fp(F, a0, yb + SLAB, out));
        S.quad('concrete', TIER.FAR, fp(F, a0, yb + SLAB, out), fp(F, a1, yb + SLAB, out), fp(F, a1, yb + SLAB, 0.02), fp(F, a0, yb + SLAB, 0.02));
        S.quad('concrete', TIER.FAR, fp(F, a0, yb, 0.02), fp(F, a1, yb, 0.02), fp(F, a1, yb, out), fp(F, a0, yb, out));
        if (k && Math.abs(out - prev) > 0.02) {
          const [da, db] = out < prev ? [out, prev] : [prev, out];
          S.quad2('concrete', TIER.FAR, fp(F, a0, yb, da), fp(F, a0, yb, db), fp(F, a0, yb + SLAB, db), fp(F, a0, yb + SLAB, da));
        }
        prev = out;
        // rebar: out of the break and drooping
        for (let j = 0; j < 2; j++) {
          const hx = hash(B.seed, k * 5 + j, f * 3 + fi, 55);
          if (hx > 0.7) continue;
          const sa = a0 + (0.2 + 0.6 * hash(B.seed, k, j, f + fi * 9)) * (a1 - a0);
          const reach = 0.3 + hx * 1.1;
          const p0 = fp(F, sa, yb + SLAB * 0.5, out + 0.05), p1 = fp(F, sa + (hx - 0.35) * 0.5, yb + SLAB * 0.5 - reach * 0.25, out - reach * 0.7), p2 = fp(F, sa + (hx - 0.35) * 0.9, yb - reach * (0.5 + hx), out - reach);
          S.bar('rust', TIER.STREET, p0, p1, 0.035, WHITE, 3);
          S.bar('rust', TIER.STREET, p1, p2, 0.035, WHITE, 3);
        }
      }
    }
    // a slab of the floor above hanging down from its steel, here and there
    if (hash(B.seed, f, fi, 301) < 0.45 && L > 5) {
      const sa = L * (0.2 + 0.6 * hash(B.seed, f, fi, 302));
      const c = fp(F, sa, y1 - SLAB - 0.9, -0.5);
      S.box('concrete', TIER.FAR, c[0], c[1], c[2], F.tx ? 2.2 : 1.5, 0.22, F.tx ? 1.5 : 2.2, { rx: F.nz * 1.0, rz: -F.nx * 1.0 });
    }
    // the inside of the outer walls at either end of the break (where the next side is not broken open too)
    for (const [sa, dir] of [[0.03, -1], [L - 0.03, 1]]) {
      const nb = FACES.findIndex(([ax, az]) => ax === dir * F.tx && az === dir * F.tz);
      if (open.includes(nb)) continue;
      S.quad2('plaster', TIER.FAR, fp(F, sa, y0, 0), fp(F, sa, y0, Math.min(5.2, depth)), fp(F, sa, y1 - SLAB, Math.min(5.2, depth)), fp(F, sa, y1 - SLAB, 0), null, tint);
    }
    // columns, in from the edge
    const nc = Math.max(2, Math.round(L / 4.6) + 1);
    for (let k = 0; k < nc; k++) {
      const sa = 0.5 + (k * (L - 1)) / (nc - 1);
      const c = fp(F, sa, 0, 0.55);
      S.box('concrete', TIER.FAR, c[0], (y0 + y1 - SLAB) / 2, c[2], 0.45, y1 - SLAB - y0, 0.45, { skip: 12 });
    }
    // the rooms: a back wall a room's depth in, walls between them, each room papered or painted its own way
    const rd = Math.min(5.2, depth);
    if (rd > 1.2) {
      const nr = Math.max(1, Math.round(L / 4.8));
      for (let k = 0; k < nr; k++) {
        const a0 = (k * L) / nr, a1 = ((k + 1) * L) / nr;
        const rt = ROOM_TINT[(hash(B.seed, f * 7 + k, fi, 93) * ROOM_TINT.length) | 0];
        const dark = hash(B.seed, f, k, fi + 200) < 0.3 ? 0.55 : 1; // (a room the fire was in)
        const cc = [rt[0] * dark, rt[1] * dark, rt[2] * dark];
        // back wall, with the door out of the room dark in it
        const da = a0 + (a1 - a0) * (0.25 + 0.5 * hash(B.seed, f, k, fi + 60));
        wallQuad(S, F, 'plaster', TIER.FAR, a0, da - 0.45, y0, y1 - SLAB, rd, cc);
        wallQuad(S, F, 'plaster', TIER.FAR, da + 0.45, a1, y0, y1 - SLAB, rd, cc);
        wallQuad(S, F, 'plaster', TIER.FAR, da - 0.45, da + 0.45, y0 + 2.05, y1 - SLAB, rd, cc);
        wallQuad(S, F, 'dark', TIER.FAR, da - 0.45, da + 0.45, y0, y0 + 2.05, rd);
        // the wall between this room and the next (seen from both)
        if (k) {
          const tint2 = ROOM_TINT[(hash(B.seed, f * 7 + k - 1, fi, 93) * ROOM_TINT.length) | 0];
          const e = hash(B.seed, f, k, fi + 300) * 1.2; // (broken short of the edge)
          S.quad('plaster', TIER.FAR, fp(F, a0 + 0.06, y0, e), fp(F, a0 + 0.06, y0, rd), fp(F, a0 + 0.06, y1 - SLAB, rd), fp(F, a0 + 0.06, y1 - SLAB, e + 0.5), null, cc);
          S.quad('plaster', TIER.FAR, fp(F, a0 - 0.06, y0, rd), fp(F, a0 - 0.06, y0, e), fp(F, a0 - 0.06, y1 - SLAB, e + 0.5), fp(F, a0 - 0.06, y1 - SLAB, rd), null, tint2);
          S.quad('concrete', TIER.FAR, fp(F, a0 - 0.06, y0, e), fp(F, a0 + 0.06, y0, e), fp(F, a0 + 0.06, y1 - SLAB, e + 0.5), fp(F, a0 - 0.06, y1 - SLAB, e + 0.5));
        }
        // what was in it: a bed, a table, a cupboard - blocks of them, enough to say a room
        const fk = hash(B.seed, f * 11 + k, fi, 400);
        const c = fp(F, a0 + (a1 - a0) * (0.3 + fk * 0.4), 0, rd - 0.6);
        if (fk < 0.7) S.box(fk < 0.35 ? 'mattress' : 'wood', TIER.STREET, c[0], y0 + (fk < 0.35 ? 0.28 : 0.4), c[2], F.tx ? 1.9 : 1.0, fk < 0.35 ? 0.5 : 0.78, F.tx ? 1.0 : 1.9, { c: [0.5, 0.42, 0.32], rz: fk < 0.15 ? 0.2 : 0 });
        const c2 = fp(F, a0 + 0.5, 0, rd - 0.35);
        if (fk > 0.3) S.box('wood', TIER.STREET, c2[0], y0 + 0.95, c2[2], F.tx ? 0.9 : 0.5, 1.9, F.tx ? 0.5 : 0.9, { c: [0.42, 0.34, 0.26] });
        // a picture still on the wall
        if (fk > 0.55) decal(S, F, fk > 0.8 ? 'poster_a' : 'poster_c', (a0 + a1) / 2 + 1, y0 + 1.6, 0.6, 0.8, false, TIER.STREET, rd - 0.02);
      }
    }
  }
}

// What is left on a slab that is under the sky: the slab itself (R less `up`, the storey still standing on it), the
// stumps of its columns with their bars, low lengths of the walls that stood on its edge, rubble.
function terrace(S, B, R, up, y, rnd) {
  const rects = up ? minus(R, up) : [R];
  const hw = B.w / 2, hd = B.d / 2;
  for (const A of rects) {
    S.quad('concrete', TIER.FAR, [A[0], y, A[3]], [A[1], y, A[3]], [A[1], y, A[2]], [A[0], y, A[2]], [[A[0], A[3]], [A[1], A[3]], [A[1], A[2]], [A[0], A[2]]]);
    const w = A[1] - A[0], d = A[3] - A[2];
    // stumps
    for (let gx = A[0] + 0.8; gx < A[1] - 0.3; gx += 4.4) {
      for (let gz = A[2] + 0.8; gz < A[3] - 0.3; gz += 4.4) {
        const h = 0.3 + rnd() * 1.5;
        if (rnd() < 0.3) continue;
        S.box('concrete', TIER.FAR, gx, y + h / 2, gz, 0.45, h, 0.45, { skip: 8, rz: (rnd() - 0.5) * 0.12 });
        for (let j = 0; j < 3; j++) {
          const bx = gx + (rnd() - 0.5) * 0.3, bz = gz + (rnd() - 0.5) * 0.3;
          S.bar('rust', TIER.STREET, [bx, y + h - 0.05, bz], [bx + (rnd() - 0.5) * 0.7, y + h + 0.5 + rnd() * 1.1, bz + (rnd() - 0.5) * 0.7], 0.04, WHITE, 3);
        }
      }
    }
    // lengths of the outer wall still standing along the slab's edge, where that edge is the building's own
    const edges = [[A[2] < -hd + 0.05, 0, -1], [A[1] > hw - 0.05, 1, 0], [A[3] > hd - 0.05, 0, 1], [A[0] < -hw + 0.05, -1, 0]];
    for (const [on, nx, nz] of edges) {
      if (!on) continue;
      const F = faceOf(A[0], A[1], A[2], A[3], nx, nz);
      for (let s = 0; s < F.len - 0.4; ) {
        const len = Math.min(F.len - s, 1.2 + rnd() * 2.6);
        const h = rnd() < 0.3 ? 0 : 0.35 + rnd() * rnd() * (B.fh * 0.9);
        if (h > 0) {
          const j = h * (0.6 + rnd() * 0.4);
          const p = [fp(F, s, y, 0), fp(F, s + len, y, 0), fp(F, s + len, y + j, 0), fp(F, s, y + h, 0)];
          const q = [fp(F, s, y, 0.3), fp(F, s + len, y, 0.3), fp(F, s + len, y + j, 0.3), fp(F, s, y + h, 0.3)];
          S.quad(B.wall, TIER.FAR, p[0], p[1], p[2], p[3], [[s, y], [s + len, y], [s + len, y + j], [s, y + h]], B.tint);
          S.quad('plaster', TIER.FAR, q[1], q[0], q[3], q[2], null, ROOM_TINT[(rnd() * ROOM_TINT.length) | 0]);
          S.quad2(B.wall, TIER.FAR, p[3], p[2], q[2], q[3], null, B.tint);
          S.quad2(B.wall, TIER.FAR, q[0], p[0], p[3], q[3], null, B.tint);
          S.quad2(B.wall, TIER.FAR, p[1], q[1], q[2], p[2], null, B.tint);
        }
        s += len;
      }
    }
    // what fell on it
    const nh = Math.round((w * d) / 30);
    for (let k = 0; k < nh; k++) rubble(S, A[0] + 0.8 + rnd() * Math.max(0.1, w - 1.6), y, A[2] + 0.8 + rnd() * Math.max(0.1, d - 1.6), 0.7 + rnd() * 1.3, 0.7 + rnd() * 1.3, 0.3 + rnd() * 0.5, rnd, TIER.FAR, 7);
  }
}

// What stands on a roof that is still a roof.
function roofOf(S, B, R, y, whole, rnd) {
  const st = B.st;
  const w = R[1] - R[0], d = R[3] - R[2];
  S.quad('roofing', TIER.FAR, [R[0], y, R[3]], [R[1], y, R[3]], [R[1], y, R[2]], [R[0], y, R[2]], [[R[0], R[3]], [R[1], R[3]], [R[1], R[2]], [R[0], R[2]]]);
  if (!whole) return;
  // the parapet: a low wall round it with a coping, a length of it gone
  const ph = st.curtain ? 0.4 : 0.75;
  const gone = (hash(B.seed, 71) * 6) | 0;
  FACES.forEach(([nx, nz], fi) => {
    const F = faceOf(R[0], R[1], R[2], R[3], nx, nz);
    F.u0 = fi * 17.3 + (B.seed % 13);
    const g0 = fi === gone ? F.len * 0.3 : -1, g1 = fi === gone ? F.len * 0.3 + 2 + hash(B.seed, 72) * 4 : -1;
    for (const [a, b] of fi === gone ? [[0, g0], [Math.min(g1, F.len), F.len]] : [[0, F.len]]) {
      if (b - a < 0.05) continue;
      wallQuad(S, F, B.wall, TIER.FAR, a, b, y, y + ph, 0, B.tint);
      wallBack(S, F, B.wall, TIER.FAR, a, b, y, y + ph, 0.25, B.tint);
      faceBox(S, F, 'concrete', TIER.FAR, a, b, y + ph, y + ph + 0.1, -0.06, 0.31, WHITE, false);
    }
  });
  const want = (k) => st.roof.includes(k);
  const at = () => [R[0] + 1.8 + rnd() * Math.max(0.1, w - 3.6), R[2] + 1.8 + rnd() * Math.max(0.1, d - 3.6)];
  if (want('bulkhead') && w > 6 && d > 6) {
    // the head of the stairs: a brick hut with its door hanging open
    const [bx, bz] = [R[0] + w * 0.3, R[2] + d * 0.6];
    S.box(B.wall === 'metal' ? 'concrete' : B.wall, TIER.FAR, bx, y + 1.3, bz, 3, 2.6, 3.4, { skip: 8, c: B.tint });
    S.box('concrete', TIER.FAR, bx, y + 2.66, bz, 3.3, 0.12, 3.7);
    S.box('dark', TIER.FAR, bx, y + 1.02, bz - 1.71, 0.95, 2.0, 0.03);
    S.box('rust', TIER.STREET, bx + 0.7, y + 1.02, bz - 2.0, 0.05, 2.0, 0.9, { ry: 0.5 });
  }
  if (want('tank') && hash(B.seed, 81) < 0.6 && w > 8) {
    // a wooden water tank on its steel legs
    const [tx, tz] = [R[0] + w * 0.72, R[2] + d * 0.35];
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S.bar('rust', TIER.FAR, [tx + lx * 1.0, y, tz + lz * 1.0], [tx + lx * 0.9, y + 2.4, tz + lz * 0.9], 0.14);
    for (const [a, b] of [[[-1, -1], [1, 1]], [[1, -1], [-1, 1]]]) S.bar('rust', TIER.STREET, [tx + a[0], y + 0.2, tz + a[1]], [tx + b[0] * 0.9, y + 2.3, tz + b[1] * 0.9], 0.06);
    S.box('rust', TIER.FAR, tx, y + 2.45, tz, 2.5, 0.12, 2.5);
    S.cyl('planks', TIER.FAR, tx, y + 2.5, tz, 1.35, 2.6, 12, false);
    S.cyl('tin_rust', TIER.FAR, tx, y + 5.1, tz, 1.45, 0.75, 12, false, WHITE, 0.02);
    for (const hy of [2.9, 3.8, 4.7]) S.cyl('rust', TIER.STREET, tx, y + hy, tz, 1.37, 0.07, 12, false);
  }
  if (want('plant') && w > 10) {
    // the plant: chillers in a row, a duct between them
    const n = 2 + ((hash(B.seed, 82) * 3) | 0);
    for (let k = 0; k < n; k++) {
      const px = R[0] + w * 0.55 + k * 2.6, pz = R[2] + d * 0.3;
      if (px > R[1] - 1.6) break;
      S.box('metal', TIER.FAR, px, y + 0.85, pz, 2.1, 1.5, 1.6, { skip: 8 });
      S.cyl('dark', TIER.STREET, px, y + 1.6, pz, 0.6, 0.06, 10);
      S.box('rust', TIER.STREET, px, y + 0.08, pz, 2.3, 0.16, 1.8);
    }
    S.box('tin_rust', TIER.FAR, R[0] + w * 0.55 + 1.3, y + 0.5, R[2] + d * 0.3 + 1.5, n * 2.6, 0.5, 0.6);
  }
  if (want('vents')) {
    for (let k = 0; k < 3; k++) {
      const [vx, vz] = at();
      S.cyl('tin_rust', TIER.STREET, vx, y, vz, 0.2, 0.7 + rnd() * 0.5, 7, false);
      S.cyl('tin_rust', TIER.STREET, vx, y + 0.95 + rnd() * 0.2, vz, 0.34, 0.2, 7, true, WHITE, 0.05);
    }
  }
  if (want('aerial') && hash(B.seed, 83) < 0.6) {
    const [ax, az] = at();
    const lean = (rnd() - 0.5) * 0.6;
    S.bar('rust', TIER.FAR, [ax, y, az], [ax + lean, y + 4.6, az], 0.07);
    for (const hy of [3.2, 3.8, 4.3]) S.bar('rust', TIER.STREET, [ax + lean * (hy / 4.6) - 0.6, y + hy, az], [ax + lean * (hy / 4.6) + 0.6, y + hy, az], 0.03);
  }
  if (want('skylights')) {
    for (let k = 0; k < Math.floor(w / 7); k++) {
      const sx = R[0] + 3.5 + k * 7;
      S.box('metal', TIER.FAR, sx, y + 0.25, R[2] + d / 2, 2.2, 0.5, d * 0.5, { skip: 8 });
      S.box(hash(B.seed, k, 84) < 0.5 ? 'glass' : 'dark', TIER.FAR, sx, y + 0.51, R[2] + d / 2, 1.9, 0.02, d * 0.5 - 0.3, { skip: 8 });
    }
  }
  if (want('billboard') && hash(B.seed, 85) < 0.5 && w > 14) {
    // a hoarding on a steel frame, facing the street
    const bw = 9, bh = 4.4, by = y + 1.6;
    const z = R[2] + 1.0;
    for (const px of [-3.4, 0, 3.4]) {
      S.bar('rust', TIER.FAR, [px, y, z + 0.3], [px, by + bh, z + 0.3], 0.16);
      S.bar('rust', TIER.STREET, [px, y, z + 2.2], [px, by + bh * 0.7, z + 0.36], 0.1);
    }
    S.box('metal', TIER.FAR, 0, by + bh / 2, z + 0.14, bw, bh, 0.12);
    S.cell('citysign', TIER.FAR, hash(B.seed, 86) < 0.5 ? 'billboard_a' : 'billboard_b', [bw / 2, by, z + 0.06], [-bw / 2, by, z + 0.06], [-bw / 2, by + bh, z + 0.06], [bw / 2, by + bh, z + 0.06]);
  }
  // weeds on the roof, where the damp stands
  for (let k = 0; k < 4; k++) {
    const [wx, wz] = at();
    weedsAt(S, wx, y, wz, 0.5 + rnd() * 0.6, rnd);
  }
}
