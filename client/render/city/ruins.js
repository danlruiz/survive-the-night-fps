// What came down of the city (citykit.js): rubble, shells of walls with the sky behind them, lengths of towers
// lying where they fell, and floors that came down one on another.
import { TIER, PI, WHITE, hash, rngOf, fp, wallQuad, faceBox, decal, STYLE, STUCCO, ROOM_TINT, weedsAt, SOOTY } from './kit.js';

// ------------------------------------------------------------------ rubble
// A heap of what a building came down as, rx by rz across and h high at (x, y, z) of the frame: a mound of dust and
// small stuff, slabs and lumps lying in it at every angle, bricks, a beam or two, bars standing out of it.
// ash: what a fire left - a mound of ash, what lies in it burnt black
export function rubble(S, x, y, z, rx, rz, h, rnd, tier = TIER.FAR, lumps = 0, brick = 0.3, ash = false) {
  const [M_MOUND, M_SLAB, M_LUMP, M_BAR] = ash ? ['ash', 'charred', 'charred', 'charred'] : ['gravel', 'concrete', 'brick', 'rust'];
  const NA = 11, NR = 4;
  const hgt = (t) => h * Math.pow(1 - t * t, 0.85) * 0.82; // (the mound: the rest of the height is what lies on it)
  const jit = [];
  for (let a = 0; a < NA; a++) jit.push(0.82 + rnd() * 0.36);
  const P = (a, k) => {
    const an = (a / NA) * PI * 2;
    const t = k / NR;
    const jj = jit[a % NA];
    return [x + Math.cos(an) * rx * t * jj, y + hgt(t) * (0.66 + 0.6 * hash(a % NA, k, (x * 10) | 0, (z * 10) | 0)) * (t < 1 ? 1 : 0), z + Math.sin(an) * rz * t * jj];
  };
  const top = [x, y + h * 0.82, z];
  for (let a = 0; a < NA; a++) {
    for (let k = 0; k < NR; k++) {
      const p0 = k ? P(a, k) : top, p1 = k ? P(a + 1, k) : top, p2 = P(a + 1, k + 1), p3 = P(a, k + 1);
      const uv = (p) => [p[0] * 0.7, p[2] * 0.7];
      if (k) S.tri(M_MOUND, tier, p0, p1, p3, uv(p0), uv(p1), uv(p3));
      S.tri(M_MOUND, tier, p1, p2, p3, uv(p1), uv(p2), uv(p3));
    }
  }
  // (what has grown on it since: weeds at its foot and up its sides)
  if (!lumps && !ash) for (let k = 0; k < 3; k++) {
    const an = rnd() * PI * 2, t = 0.5 + rnd() * 0.5;
    weedsAt(S, x + Math.cos(an) * rx * t, y + hgt(t) * 0.7, z + Math.sin(an) * rz * t, 0.5 + rnd() * 0.5, rnd);
  }
  const n = lumps || Math.round(14 + rx * rz * 3.2);
  for (let k = 0; k < n; k++) {
    const an = rnd() * PI * 2, t = Math.sqrt(rnd()) * 0.95;
    const px = x + Math.cos(an) * rx * t, pz = z + Math.sin(an) * rz * t;
    const py = y + hgt(t) * 0.9;
    const r = rnd();
    if (r < 0.34) {
      // a slab
      const s = 0.7 + rnd() * Math.min(2.2, rx * 0.7);
      S.box(M_SLAB, tier, px, py + 0.12, pz, ash ? s * 1.4 : s, ash ? 0.14 : 0.2 + rnd() * 0.12, ash ? 0.16 : s * (0.55 + rnd() * 0.5), { ry: rnd() * PI, rx: (rnd() - 0.5) * (ash ? 0.5 : 0.9), rz: (rnd() - 0.5) * (ash ? 0.5 : 0.9) });
    } else if (r < 0.62) {
      // a lump
      const s = 0.3 + rnd() * 0.7;
      S.box(rnd() < brick ? M_LUMP : M_SLAB, tier, px, py + s * 0.25, pz, s, s * (0.5 + rnd() * 0.5), s * (0.6 + rnd() * 0.6), { ry: rnd() * PI, rx: (rnd() - 0.5) * 1.2, rz: (rnd() - 0.5) * 1.2 });
    } else if (r < 0.82) {
      // bricks, loose
      for (let j = 0; j < 3; j++) S.box(M_LUMP, TIER.STREET, px + (rnd() - 0.5) * 0.7, py + 0.06, pz + (rnd() - 0.5) * 0.7, 0.22, 0.07, 0.1, { ry: rnd() * PI, rx: (rnd() - 0.5) * 0.8 });
    } else if (r < 0.9 && rx > 1.6) {
      // a steel beam, bent out of it
      const len = 1.6 + rnd() * 2.6;
      const a2 = rnd() * PI * 2;
      S.bar(M_BAR, tier, [px, py - 0.1, pz], [px + Math.cos(a2) * len * 0.7, py + len * (0.2 + rnd() * 0.5), pz + Math.sin(a2) * len * 0.7], 0.16);
    } else {
      // bars
      for (let j = 0; j < 2; j++) {
        const q = [px + (rnd() - 0.5) * 0.5, py + 0.5 + rnd() * 1.0, pz + (rnd() - 0.5) * 0.5];
        S.bar('rust', TIER.STREET, [px, py - 0.1, pz], q, 0.035, WHITE, 3);
        S.bar('rust', TIER.STREET, q, [q[0] + (rnd() - 0.5) * 0.8, q[1] + (rnd() - 0.3) * 0.5, q[2] + (rnd() - 0.5) * 0.8], 0.035, WHITE, 3);
      }
    }
  }
}

// ------------------------------------------------------------------ a shell: walls with the sky behind them
// W (from the world): { x0, z0, x1, z1, y, t, mat, fh, heights: [h...], seed, soot }. The wall runs from (x0, z0) to
// (x1, z1) in lengths, each broken off at its own height (heights: the collider of each is that high). Its window
// openings are holes: the other side of the street is seen through them.
export function shell(S, W) {
  S.frame(0, W.y, 0, 0);
  const dx = W.x1 - W.x0, dz = W.z1 - W.z0;
  const L = Math.hypot(dx, dz);
  const tx = dx / L, tz = dz / L;
  const t = W.t || 0.4;
  const n = W.heights.length;
  const seg = L / n;
  const fh = W.fh || 3;
  // two faces: the wall's own two sides
  const faces = [
    { ax: W.x0 - tz * (t / 2), az: W.z0 + tx * (t / 2), tx, tz, nx: -tz, nz: tx, len: L, u0: W.seed % 7 },
    { ax: W.x1 + tz * (t / 2), az: W.z1 - tx * (t / 2), tx: -tx, tz: -tz, nx: tz, nz: -tx, len: L, u0: (W.seed % 5) + 9 },
  ];
  const tint = W.mat === 'plaster' ? STUCCO[(hash(W.seed, 5) * STUCCO.length) | 0] : WHITE;
  // (the inside of a place that burnt: what is left of its plaster, grey with smoke - the soot itself is laid over
  // each opening, on both faces)
  const smoked = W.inner === 'charred';
  const mats = [W.mat, smoked ? 'plaster' : W.inner || W.mat];
  const B = { seed: W.seed, st: { ...STYLE.walkup, rec: t / 2 }, wall: W.mat, tint, wear: 1, burnt: 0, fh };
  for (let k = 0; k < n; k++) {
    const h = W.heights[k];
    const hl = k ? W.heights[k - 1] : 0, hr = k < n - 1 ? W.heights[k + 1] : 0;
    // the broken top of this length: three steps of it, the middle the collider's height
    const steps = [h - hash(W.seed, k, 1) * 0.5, h, h - hash(W.seed, k, 2) * 0.6].map((v) => Math.max(0.2, v));
    faces.forEach((F, side) => {
      const s0 = side ? L - (k + 1) * seg : k * seg;
      const mat = mats[side];
      const sm = 0.8 + hash(W.seed, k, 4) * 0.5;
      const col = side && smoked ? [SOOTY[0] * sm, SOOTY[1] * sm, SOOTY[2] * sm] : side && W.inner === 'plaster' ? ROOM_TINT[(hash(W.seed, k >> 1, 3) * ROOM_TINT.length) | 0] : tint;
      const wq = (a0, a1, y0, y1) => wallQuad(S, F, mat, TIER.FAR, a0, a1, y0, y1, 0, col);
      const c = s0 + seg / 2;
      const ww = Math.min(1.15, seg - 1.1);
      const sub = side ? [steps[2], steps[1], steps[0]] : steps;
      let y = 0;
      for (let f = 0; y < h - 0.1; f++) {
        const top = Math.min(h, y + fh);
        const wy0 = y + 0.9, wy1 = y + 2.5;
        if (wy1 + 0.35 > h || ww < 0.6) {
          // (not enough of the wall left over this floor for a window)
          wq(s0, s0 + seg, y, Math.min(top, Math.min(...sub)));
          break;
        }
        wq(s0, s0 + seg, y, wy0);
        wq(s0, c - ww / 2, wy0, wy1);
        wq(c + ww / 2, s0 + seg, wy0, wy1);
        wq(s0, s0 + seg, wy1, Math.min(top, Math.min(...sub)));
        if (side === 0) {
          // the opening's reveals, right through the wall, and a stone sill; soot over it where the place burnt
          const rv = (p0, p1, p2, p3) => S.quad(W.mat, TIER.FAR, p0, p1, p2, p3, null, tint);
          rv(fp(F, c - ww / 2, wy0, 0), fp(F, c - ww / 2, wy0, t), fp(F, c - ww / 2, wy1, t), fp(F, c - ww / 2, wy1, 0));
          rv(fp(F, c + ww / 2, wy0, t), fp(F, c + ww / 2, wy0, 0), fp(F, c + ww / 2, wy1, 0), fp(F, c + ww / 2, wy1, t));
          rv(fp(F, c - ww / 2, wy0, 0), fp(F, c + ww / 2, wy0, 0), fp(F, c + ww / 2, wy0, t), fp(F, c - ww / 2, wy0, t));
          rv(fp(F, c - ww / 2, wy1, t), fp(F, c + ww / 2, wy1, t), fp(F, c + ww / 2, wy1, 0), fp(F, c - ww / 2, wy1, 0));
          faceBox(S, F, 'concrete', TIER.DETAIL, c - ww / 2 - 0.12, c + ww / 2 + 0.12, wy0 - 0.1, wy0, -0.07, 0.1, WHITE, false);
        }
        if (W.soot && hash(W.seed, k, f, side) < 0.72) {
          // (up the wall from the head of the opening, as far as the wall still goes)
          const sh = Math.min(h - wy1 + 0.3, 1.5 + hash(W.seed, k, f, side + 5) * 2.2);
          if (sh > 0.6) decal(S, F, hash(W.seed, k, f) < 0.5 ? 'soot_a' : 'soot_b', c, wy1 - 0.12 + sh / 2, ww * (1.25 + hash(W.seed, k, f, 6) * 0.6), sh, true, TIER.FAR, -0.025);
        }
        y = top;
      }
      // the ragged top: the three steps over the lowest of them
      const base = Math.min(...sub, h);
      for (let j = 0; j < 3; j++) if (sub[j] > base + 0.02) wq(s0 + (j * seg) / 3, s0 + ((j + 1) * seg) / 3, base, sub[j]);
    });
    // the top of the wall and its broken ends
    const F = faces[0];
    const s0 = k * seg;
    for (let j = 0; j < 3; j++) {
      const a0 = s0 + (j * seg) / 3, a1 = s0 + ((j + 1) * seg) / 3;
      const yy = steps[j];
      S.quad(W.mat, TIER.FAR, fp(F, a0, yy, 0), fp(F, a1, yy, 0), fp(F, a1, yy, t), fp(F, a0, yy, t), null, tint);
      const prev = j ? steps[j - 1] : hl > 0 ? Math.max(0.2, hl - hash(W.seed, k - 1, 2) * 0.6) : 0;
      if (Math.abs(prev - yy) > 0.02) {
        const [lo, hi] = prev < yy ? [prev, yy] : [yy, prev];
        S.quad2(W.mat, TIER.FAR, fp(F, a0, lo, t), fp(F, a0, lo, 0), fp(F, a0, hi, 0), fp(F, a0, hi, t), null, tint);
      }
    }
    if (!hr) S.quad2(W.mat, TIER.FAR, fp(F, s0 + seg, 0, 0), fp(F, s0 + seg, 0, t), fp(F, s0 + seg, steps[2], t), fp(F, s0 + seg, steps[2], 0), null, tint);
    if (!hl) S.quad2(W.mat, TIER.FAR, fp(F, s0, 0, 0), fp(F, s0, 0, t), fp(F, s0, steps[0], t), fp(F, s0, steps[0], 0), null, tint);
    // a bar or two out of the top of it
    if (hash(W.seed, k, 9) < 0.4) {
      const p = fp(F, s0 + seg * 0.5, h - 0.2, t / 2);
      S.bar('rust', TIER.STREET, p, [p[0] + (hash(W.seed, k, 10) - 0.5) * 0.8, p[1] + 0.8 + hash(W.seed, k, 11), p[2] + (hash(W.seed, k, 12) - 0.5) * 0.8], 0.04, WHITE, 3);
    }
  }
  void B;
}

// ------------------------------------------------------------------ a length of building lying where it fell
// T (from the world): { x, z, y, ry, len, w, h, floors, fh, style, mat, seed, tilt }. A box of it len (local x: the
// way the tower fell) by w (local z) by h high: what was a side of the tower is its top now, its windows at the sky;
// its two long flanks are the tower's other sides on their sides. Where it broke from the next length it is no box:
// the skin of its last storey is torn off bay by bay at its own place, and behind it the floor that storey stood on
// is seen end on - a slab standing upright, pieces of it gone, the beams and the bars that ran on from it hanging
// out. Everything stays inside the box the world made solid.
export function fallen(S, T) {
  S.frame(T.x, T.y, T.z, T.ry, T.tilt || 0);
  const st = STYLE[T.style] || STYLE.office;
  const B = { seed: T.seed, st, wall: st.curtain ? 'metal' : T.mat, tint: WHITE, wear: 1, burnt: 0, fh: T.fh };
  const hl = T.len / 2, hw = T.w / 2, h = T.h;
  const nf = Math.max(1, Math.round(T.len / T.fh)); // storeys along its length
  const fl = T.len / nf;
  const SKIN = 0.28;
  // which of its ends are breaks: both, of any length two storeys long or more
  const torn = () => nf >= 2;
  // a face here is a plane with two axes of its own: U along the tower's storeys (local x), V across
  const plane = (o, U, V, lu, lv, name) => {
    const N = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
    const P = (u, v, d = 0) => [o[0] + U[0] * u + V[0] * v - N[0] * d, o[1] + U[1] * u + V[1] * v - N[1] * d, o[2] + U[2] * u + V[2] * v - N[2] * d];
    const q = (mat, tier, u0, u1, v0, v1, d = 0) => {
      if (u1 - u0 < 0.01 || v1 - v0 < 0.01) return;
      S.quad(mat, tier, P(u0, v0, d), P(u1, v0, d), P(u1, v1, d), P(u0, v1, d), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    };
    // storeys along u: each a band of wall, then a row of windows across v
    const nb = Math.max(1, Math.round(lv / st.bay));
    const bw = lv / nb;
    const ww = st.curtain ? bw - 0.1 : Math.min(st.win[0], bw - 0.5);
    const nt = Math.max(2, Math.round(lv / 2.3)); // (the lengths its skin is torn off in)
    for (let f = 0; f < nf; f++) {
      const u0 = f * fl;
      // (the end this storey is, if it is one: u runs from -x on two of the planes and from +x on the third)
      const sx = f === 0 ? (U[0] > 0 ? -1 : 1) : f === nf - 1 ? (U[0] > 0 ? 1 : -1) : 0;
      if (sx && torn(sx)) {
        // the torn end: what is left of the skin, each length of it from the storey's inner line out to its own break
        const inner = f === 0 && nf > 1 ? u0 + fl : u0;
        const out = f === 0 && nf > 1 ? -1 : 1;
        let prev = 0;
        for (let k = 0; k < nt; k++) {
          const v0 = (k * lv) / nt, v1 = ((k + 1) * lv) / nt;
          const e = fl * (0.1 + 0.82 * hash(T.seed, f * 13 + k, name, 41) ** 1.4);
          const [ua, ub] = out > 0 ? [inner, inner + e] : [inner - e, inner];
          q(B.wall, TIER.FAR, ua, ub, v0, v1);
          // (its other face, and the break itself: the thickness of the wall)
          S.quad('concrete', TIER.FAR, P(ub, v0, SKIN), P(ua, v0, SKIN), P(ua, v1, SKIN), P(ub, v1, SKIN));
          const ue = out > 0 ? ub : ua;
          S.quad2('concrete', TIER.FAR, P(ue, v0, 0), P(ue, v1, 0), P(ue, v1, SKIN), P(ue, v0, SKIN));
          if (k && Math.abs(e - prev) > 0.05) {
            const [ea, eb] = out > 0 ? [inner + Math.min(e, prev), inner + Math.max(e, prev)] : [inner - Math.max(e, prev), inner - Math.min(e, prev)];
            S.quad2('concrete', TIER.FAR, P(ea, v0, 0), P(eb, v0, 0), P(eb, v0, SKIN), P(ea, v0, SKIN));
          }
          prev = e;
          // a bar or two out of the break
          if (hash(T.seed, k, f, name + 60) < 0.6) {
            const pv = v0 + (v1 - v0) * hash(T.seed, k, f, name + 61);
            const a = P(ue, pv, SKIN * 0.5);
            const reach = Math.max(0.2, Math.min(fl - e - 0.1, 0.5 + hash(T.seed, k, f, name + 62) * 1.2));
            S.bar('rust', TIER.STREET, a, [a[0] + sx * reach, Math.max(0.1, a[1] - reach * (0.2 + hash(T.seed, k, f, name + 63) * 0.6)), a[2] + (hash(T.seed, k, f, name + 64) - 0.5) * 0.5], 0.045, WHITE, 3);
          }
        }
        continue;
      }
      const sill = st.curtain ? 0.46 : (fl - Math.min(st.win[1], fl - 1.0)) / 2;
      const w0 = u0 + sill, w1 = st.curtain ? u0 + fl : u0 + fl - sill;
      q(B.wall, TIER.FAR, u0, w0, 0, lv);
      q(B.wall, TIER.FAR, w1, u0 + fl, 0, lv);
      let at = 0;
      for (let b = 0; b < nb; b++) {
        const c = (b + 0.5) * bw;
        const a0 = c - ww / 2, a1 = c + ww / 2;
        q(B.wall, TIER.FAR, w0, w1, at, a0);
        at = a1;
        const r = hash(T.seed, f, b, name);
        const whole = r < (st.curtain ? 0.3 : 0.2);
        q(whole ? 'glass' : 'dark', TIER.FAR, w0, w1, a0, a1, st.rec);
        if (!whole && r < 0.42) {
          // (a piece of the pane still in a corner of it)
          const k = 0.3 + hash(T.seed, f, b, name + 70) * 0.4;
          S.tri('glass', TIER.FAR, P(w0, a0, st.rec - 0.02), P(w0 + (w1 - w0) * k, a0, st.rec - 0.02), P(w0, a0 + ww * (1.1 - k), st.rec - 0.02), [w0, a0], [w0 + (w1 - w0) * k, a0], [w0, a0 + ww * (1.1 - k)]);
        }
        if (!st.curtain && r > 0.3) {
          // (what divided its panes)
          q('metal', TIER.STREET, w0, w1, c - 0.03, c + 0.03, st.rec - 0.05);
          q('metal', TIER.STREET, (w0 + w1) / 2 - 0.03, (w0 + w1) / 2 + 0.03, a0, a1, st.rec - 0.05);
        }
        // reveals
        S.quad(B.wall, TIER.FAR, P(w0, a0, 0), P(w1, a0, 0), P(w1, a0, st.rec), P(w0, a0, st.rec));
        S.quad(B.wall, TIER.FAR, P(w0, a1, st.rec), P(w1, a1, st.rec), P(w1, a1, 0), P(w0, a1, 0));
        S.quad(B.wall, TIER.FAR, P(w0, a0, st.rec), P(w0, a1, st.rec), P(w0, a1, 0), P(w0, a0, 0));
        S.quad(B.wall, TIER.FAR, P(w1, a0, 0), P(w1, a1, 0), P(w1, a1, st.rec), P(w1, a0, st.rec));
      }
      q(B.wall, TIER.FAR, w0, w1, at, lv);
    }
    if (st.fins) for (let f = 1; f < nf; f++) {
      const c = P(f * fl, lv / 2, -0.1);
      S.box('concrete', TIER.FAR, c[0], c[1], c[2], Math.abs(U[0]) * 0.34 + Math.abs(V[0]) * lv + Math.abs(N[0]) * 0.24, Math.abs(U[1]) * 0.34 + Math.abs(V[1]) * lv + Math.abs(N[1]) * 0.24, Math.abs(U[2]) * 0.34 + Math.abs(V[2]) * lv + Math.abs(N[2]) * 0.24);
    }
    // what the fall did to its skin: cracks across it, the damp of the years since, rust from its steel
    const u0 = torn(-1) || torn(1) ? fl : 0, u1 = lu - u0;
    for (let k = 0; k < 6 && u1 - u0 > 4; k++) {
      const r = hash(T.seed, k, name, 81), r2 = hash(T.seed, k, name, 82);
      const cell = ['crack_a', 'crack_b', 'damp_a', 'damp_b', 'scorch', 'crack_a'][(r * 6) | 0];
      const s = Math.min(lv - 0.4, u1 - u0 - 0.4, 2.6 + r2 * 2.6);
      const cu = u0 + s / 2 + (u1 - u0 - s) * hash(T.seed, k, name, 83), cv = s / 2 + (lv - s) * r2;
      S.cell('citygrime', TIER.FAR, cell, P(cu - s / 2, cv - s / 2, -0.03), P(cu + s / 2, cv - s / 2, -0.03), P(cu + s / 2, cv + s / 2, -0.03), P(cu - s / 2, cv + s / 2, -0.03));
    }
  };
  // the top (what was a side of the tower), and the two flanks
  plane([-hl, h, hw], [1, 0, 0], [0, 0, -1], T.len, T.w, 1);
  plane([hl, 0, -hw], [-1, 0, 0], [0, 1, 0], T.len, h, 2);
  plane([-hl, 0, hw], [1, 0, 0], [0, 1, 0], T.len, h, 3);
  // what came down on top of it; a slab of its own skin stove in
  const rnd = rngOf(T.seed + 5);
  for (let k = 0; k < 3; k++) rubble(S, (rnd() - 0.5) * T.len * 0.5, h, (rnd() - 0.5) * T.w * 0.6, 1.4 + rnd() * 1.6, 1.2 + rnd() * 1.4, 0.5 + rnd() * 0.6, rnd, TIER.FAR, 9);
  for (let k = 0; k < 2; k++) S.box('concrete', TIER.FAR, (rnd() - 0.5) * T.len * 0.5, h - 0.1, (rnd() - 0.5) * T.w * 0.5, 3 + rnd() * 2, 0.3, 2.4 + rnd() * 2, { rz: (rnd() - 0.5) * 0.5, rx: (rnd() - 0.5) * 0.5, ry: rnd() * 3 });
  for (const sx of [-1, 1]) {
    const face = (mat, x, y0, y1, z0, z1) => {
      if (sx > 0) S.quad(mat, TIER.FAR, [x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1]);
      else S.quad(mat, TIER.FAR, [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]);
    };
    if (!torn(sx)) {
      // an end that is no break (the foot of the shaft, a short length): a rim of wall, and the dark of it
      const x = sx * hl, rim = 0.5;
      face('concrete', x, 0, h, -hw, -hw + rim);
      face('concrete', x, 0, h, hw - rim, hw);
      face('concrete', x, h - rim, h, -hw + rim, hw - rim);
      face('concrete', x, 0, rim, -hw + rim, hw - rim);
      face('dark', x - sx * 1.4, rim, h - rim, -hw + rim, hw - rim);
      for (const z of [-hw + rim, hw - rim]) S.quad2('concrete', TIER.FAR, [x, rim, z], [x - sx * 1.4, rim, z], [x - sx * 1.4, h - rim, z], [x, h - rim, z]);
      for (const y of [rim, h - rim]) S.quad2('concrete', TIER.FAR, [x, y, -hw + rim], [x - sx * 1.4, y, -hw + rim], [x - sx * 1.4, y, hw - rim], [x, y, hw - rim]);
      continue;
    }
    // ---- a break. The floor the last storey stood on, end on: a slab upright across the whole of it, in pieces -
    // some whole, some broken off part way up, some gone, and through those the storey behind: its partitions, the dark
    const xs = sx * (hl - fl);
    const IN = Math.min(1.9, fl * 0.6);
    const nz = Math.max(2, Math.round(T.w / 2.4));
    const yA = 0.12, yB = h - SKIN;
    for (let k = 0; k < nz; k++) {
      const z0 = -hw + SKIN + (k * (T.w - SKIN * 2)) / nz, z1 = -hw + SKIN + ((k + 1) * (T.w - SKIN * 2)) / nz;
      const r = hash(T.seed, k, sx, 51);
      if (r < 0.22) continue;
      const top = r < 0.56 ? yA + (yB - yA) * (0.3 + 0.5 * hash(T.seed, k, sx, 52)) : yB;
      S.box('concrete', TIER.FAR, xs + sx * 0.13, (yA + top) / 2, (z0 + z1) / 2, 0.26, top - yA, z1 - z0 - 0.05);
      // bars out of its broken edge, bent over
      if (top < yB) for (let j = 0; j < 2; j++) {
        const bz = z0 + (z1 - z0) * (0.25 + 0.5 * j);
        const reach = 0.5 + hash(T.seed, k * 3 + j, sx, 53) * 1.1;
        S.bar('rust', j ? TIER.STREET : TIER.FAR, [xs + sx * 0.13, top - 0.05, bz], [xs + sx * Math.min(fl - 0.2, 0.13 + reach * 0.8), top + reach * (0.5 - hash(T.seed, k * 3 + j, sx, 54)), bz + (hash(T.seed, k * 3 + j, sx, 55) - 0.5) * 0.7], j ? 0.045 : 0.075, WHITE, 3);
      }
    }
    face('dark', xs - sx * IN, yA, yB, -hw + SKIN, hw - SKIN);
    for (const z of [-hw + SKIN, hw - SKIN]) S.quad2('concrete', TIER.FAR, [xs, yA, z], [xs - sx * IN, yA, z], [xs - sx * IN, yB, z], [xs, yB, z]);
    for (const y of [yA, yB]) S.quad2('concrete', TIER.FAR, [xs, y, -hw + SKIN], [xs - sx * IN, y, -hw + SKIN], [xs - sx * IN, y, hw - SKIN], [xs, y, hw - SKIN]);
    for (let k = 0; k < 2; k++) {
      const z = -hw + T.w * (0.22 + 0.5 * k + 0.12 * hash(T.seed, k, sx, 56));
      S.box('plaster', TIER.FAR, xs - sx * IN * 0.5, (yA + yB) / 2, z, IN, yB - yA, 0.14, { c: ROOM_TINT[(hash(T.seed, k, sx, 57) * ROOM_TINT.length) | 0], skip: sx > 0 ? 2 : 1 });
    }
    // what ran on from that floor into the storey that is gone: beams still fast in it, broken off short and hanging
    for (let k = 0; k < 6; k++) {
      const z = -hw + SKIN + 0.4 + (k % 3 + 0.25 + 0.5 * hash(T.seed, k, sx, 58)) * ((T.w - SKIN * 2 - 0.8) / 3);
      const y = k < 3 ? h * 0.28 : h * 0.72;
      const L = Math.min(fl - 0.3, 0.5 + hash(T.seed, k, sx, 59) * fl * 0.8);
      const droop = (0.04 + hash(T.seed, k, sx, 60) * 0.14) * -sx;
      S.box('concrete', TIER.FAR, xs + sx * (0.26 + L / 2), y - Math.abs(droop) * L * 0.5, z, L, 0.4, 0.4, { rz: droop, skip: sx > 0 ? 2 : 1 });
      const tip = [xs + sx * (0.26 + L), y - Math.abs(droop) * L, z];
      for (let j = 0; j < 2; j++) {
        const reach = Math.max(0.15, Math.min(fl - L - 0.35, 0.3 + hash(T.seed, k * 2 + j, sx, 61) * 0.9));
        S.bar('rust', TIER.STREET, [tip[0] - sx * 0.1, tip[1] + (j ? 0.12 : -0.12), tip[2]], [tip[0] + sx * reach, Math.max(0.08, tip[1] - reach * (0.3 + hash(T.seed, k * 2 + j, sx, 62))), tip[2] + (hash(T.seed, k * 2 + j, sx, 63) - 0.5) * 0.6], 0.04, WHITE, 3);
      }
    }
    // (a piece of the floor come away whole, leaning on what is under it)
    const lz = (hash(T.seed, sx, 64) - 0.5) * T.w * 0.5;
    S.box('concrete', TIER.FAR, xs + sx * fl * 0.55, h * 0.24, lz, 0.26, h * 0.5, Math.min(3.2, T.w * 0.3), { rz: sx * 0.5, ry: (hash(T.seed, sx, 65) - 0.5) * 0.4 });
  }
}

// ------------------------------------------------------------------ floors that came down one on another
// P (from the world): { x, z, y, ry, w, d, n, seed }: n slabs w by d, each lying on what is left of the storey
// under it, the upper ones tipped further; bars and crushed things in the gaps, a slab hanging off the end.
export function pancake(S, P) {
  S.frame(P.x, P.y, P.z, P.ry);
  const rnd = rngOf(P.seed);
  let y = 0.15;
  for (let k = 0; k < P.n; k++) {
    const w = P.w * (1 - k * 0.06), d = P.d * (1 - k * 0.07);
    const tilt = (0.03 + k * 0.035) * (k % 2 ? 1 : 0.6);
    const gap = 0.25 + rnd() * 0.5;
    const cx = k * 0.5 + (rnd() - 0.5) * 0.6, cz = (rnd() - 0.5) * 0.8;
    S.box('concrete', TIER.FAR, cx, y + 0.16, cz, w, 0.32, d, { rz: tilt, rx: (rnd() - 0.5) * 0.05, ry: (rnd() - 0.5) * 0.08 });
    // what was between this floor and the next: crushed walls, a column on its side
    for (let j = 0; j < 7; j++) {
      const px = cx + (rnd() - 0.5) * w * 0.9, pz = cz + (j % 2 ? 1 : -1) * (d / 2 - rnd() * 0.5);
      S.box(rnd() < 0.4 ? 'brick' : 'concrete', TIER.FAR, px, y + 0.3 + gap * 0.5 + Math.tan(tilt) * (px - cx), pz, 1 + rnd() * 2, gap * (0.6 + rnd() * 0.4), 0.3 + rnd() * 0.5, { ry: (rnd() - 0.5) * 0.4, rz: tilt });
    }
    // bars out of its edges
    for (let j = 0; j < 10; j++) {
      const side = j % 4;
      const u = rnd() - 0.5;
      const ex = side === 0 ? w / 2 : side === 1 ? -w / 2 : u * w;
      const ez = side === 2 ? d / 2 : side === 3 ? -d / 2 : u * d;
      const py = y + 0.16 + Math.tan(tilt) * ex;
      const ox = side < 2 ? Math.sign(ex) : (rnd() - 0.5) * 0.6, oz = side >= 2 ? Math.sign(ez) : (rnd() - 0.5) * 0.6;
      const reach = 0.4 + rnd() * 1.1;
      S.bar('rust', TIER.STREET, [cx + ex, py, cz + ez], [cx + ex + ox * reach, py - reach * (0.2 + rnd() * 0.8), cz + ez + oz * reach], 0.04, WHITE, 3);
    }
    y += 0.32 + gap;
  }
}
