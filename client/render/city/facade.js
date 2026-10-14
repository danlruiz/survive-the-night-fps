// The faces of a building of the city (citykit.js): its storeys' walls, the window openings cut in them, the glass
// curtain of an office tower, and what runs up the whole height of it.
import { lerp } from '../../../shared/rng.js';
import { TIER, WHITE, CEIL_N, hash, faceOf, FACES, fp, wallQuad, faceBox, decal } from './kit.js';

const CURTAIN = [[0.6, 0.56, 0.44], [0.42, 0.5, 0.5], [0.62, 0.42, 0.36], [0.7, 0.7, 0.66]];

// what a window is: 0 glass, 1 broken (shards in the frame), 2 gone, 3 boarded
function windowState(seed, face, floor, bay, wear, burnt) {
  if (burnt) return 2;
  const r = hash(seed, face * 131 + floor, bay, 7);
  const whole = 0.42 * (1 - wear);
  if (r < whole) return 0;
  if (r < whole + 0.26) return 1;
  if (r < 0.93 - (floor === 0 ? 0.08 : 0)) return 2;
  return 3;
}

// One storey of a face, from s0 to s1 of it (the whole face is F.len long: the bays are counted over all of it, so
// the windows stand one over another whatever is left of each storey). y0: the storey's floor. B: the building.
export function storeyWall(S, F, B, fi, floor, y0, s0, s1) {
  const st = B.st;
  const mat = B.wall;
  const col = B.tint;
  const fh = B.fh;
  const blank = B.blank & (1 << fi);
  if (blank) {
    wallQuad(S, F, mat, TIER.FAR, s0, s1, y0, y0 + fh, 0, col);
    return;
  }
  if (st.curtain) return curtainWall(S, F, B, fi, floor, y0, s0, s1);
  const n = Math.max(1, Math.round(F.len / st.bay));
  const bw = F.len / n;
  const ww = Math.min(st.win[0], bw - 0.5);
  const wy0 = y0 + st.sill;
  const wy1 = Math.min(y0 + fh - 0.32, wy0 + st.win[1]);
  // the wall under and over the row of windows
  wallQuad(S, F, mat, TIER.FAR, s0, s1, y0, wy0, 0, col);
  wallQuad(S, F, mat, TIER.FAR, s0, s1, wy1, y0 + fh, 0, col);
  let at = s0;
  for (let b = 0; b < n; b++) {
    const c = (b + 0.5) * bw;
    const a0 = c - ww / 2, a1 = c + ww / 2;
    if (a0 < s0 + 0.15 || a1 > s1 - 0.15) continue; // (a window the break ran through: wall to its edge)
    wallQuad(S, F, mat, TIER.FAR, at, a0, wy0, wy1, 0, col);
    at = a1;
    windowAt(S, F, B, fi, floor, b, a0, a1, wy0, wy1);
  }
  wallQuad(S, F, mat, TIER.FAR, at, s1, wy0, wy1, 0, col);
}

// One storey of a curtain wall, s0..s1 of the face: a band of steel at the slab, and over it glass from mullion to
// mullion up to the next - what is left of it. A pane still in its frame is glass (some of them tipped enough to
// throw the sky back, which is what says glass from across the city); one in six hangs broken; the rest are gone,
// and through them the storey itself is seen: its floor, the underside of the slab over it, its columns standing
// back from the edge, a desk, and the dark beyond.
const CURTAIN_IN = 3; // how far in from the glass a storey is built
function curtainWall(S, F, B, fi, floor, y0, s0, s1) {
  const st = B.st;
  const fh = B.fh;
  const n = Math.max(1, Math.round(F.len / st.bay));
  const bw = F.len / n;
  const ya = y0 + 0.46, yb = y0 + fh; // (the spandrel: the slab's edge and the upstand over it)
  wallQuad(S, F, B.wall, TIER.FAR, s0, s1, y0, ya, 0, B.tint);
  const whole = 0.62 * (1 - B.wear * 0.45);
  const sky = S.dir(F.nx * 0.95, 0.3, F.nz * 0.95);
  const SHADE = [0.4, 0.42, 0.44];
  let gone = 0;
  for (let b = 0; b < n; b++) {
    // (a mullion at each bay line: a strip of it here, whatever the distance; trimOf stands the bar itself proud of it)
    if (b * bw > s0 + 0.05 && b * bw < s1 - 0.05) wallQuad(S, F, 'metal', TIER.FAR, b * bw - 0.05, b * bw + 0.05, ya, yb, -0.015);
    const a0 = Math.max(s0, b * bw + 0.05), a1 = Math.min(s1, (b + 1) * bw - 0.05);
    if (a1 - a0 < 0.25) continue;
    const r = hash(B.seed, fi * 131 + floor, b, 7);
    const h1 = hash(B.seed, b, floor, fi + 310), h2 = hash(B.seed, b, floor, fi + 311);
    const uo = r * 40, vo = h1 * 5;
    const pane = (q0, q1, q2, q3, tip) => S.quad('glass', TIER.FAR, fp(F, q0[0], q0[1], 0.03), fp(F, q1[0], q1[1], 0.03), fp(F, q2[0], q2[1], 0.03), fp(F, q3[0], q3[1], 0.03), [[uo + q0[0], vo + q0[1]], [uo + q1[0], vo + q1[1]], [uo + q2[0], vo + q2[1]], [uo + q3[0], vo + q3[1]]], WHITE, tip ? sky : null);
    if (r < whole) pane([a0, ya], [a1, ya], [a1, yb], [a0, yb], h1 < 0.3);
    else if (r < whole + 0.14) {
      // (what is left of the sheet: a piece of it standing in the foot of the frame, or hanging from its head)
      gone++;
      const m = ya + (yb - ya) * (0.3 + 0.45 * h2);
      if (h1 < 0.5) pane([a0, ya], [a1, ya], [a1, m], [a0, ya + (m - ya) * (0.25 + h1)], h2 < 0.5);
      else pane([a0, m], [a1, yb - (yb - m) * (h1 - 0.4)], [a1, yb], [a0, yb], h2 < 0.5);
    } else gone++;
  }
  if (!gone) {
    wallQuad(S, F, 'dark', TIER.FAR, s0, s1, ya, yb, 0.06);
    return;
  }
  // the storey behind the glass. (The faces at either side build theirs too: these stop short of the corners, so no
  // two floors lie in one another.)
  const D = Math.min(CURTAIN_IN, (F.tx ? B.d : B.w) / 2 - 0.3);
  const side = fi & 1;
  const i0 = side ? Math.max(s0, D) : s0, i1 = side ? Math.min(s1, F.len - D) : s1;
  if (i1 - i0 > 0.3) {
    S.quad('concrete', TIER.FAR, fp(F, i0, y0 + 0.02, 0.02), fp(F, i1, y0 + 0.02, 0.02), fp(F, i1, y0 + 0.02, D), fp(F, i0, y0 + 0.02, D), [[i0, 0], [i1, 0], [i1, D], [i0, D]]);
    S.quad('concrete', TIER.FAR, fp(F, i1, yb - 0.24, 0.02), fp(F, i0, yb - 0.24, 0.02), fp(F, i0, yb - 0.24, D), fp(F, i1, yb - 0.24, D), [[i1, 0], [i0, 0], [i0, D], [i1, D]], WHITE, CEIL_N);
  }
  // (its back wall: what is left of the partitions, in the shade of the floor over it - and the doors through them, dark)
  {
    const b0 = Math.max(s0, D), b1 = Math.min(s1, F.len - D);
    wallQuad(S, F, 'plaster', TIER.FAR, b0, b1, y0, yb - 0.24, D, SHADE);
    for (let s = b0 + 2.2 + hash(B.seed, floor, fi, 330) * 3; s < b1 - 1.4; s += 5 + hash(B.seed, floor, fi + (s | 0), 331) * 4) wallQuad(S, F, 'dark', TIER.FAR, s, s + 1.0, y0, y0 + 2.1, D - 0.02);
  }
  for (let b = 0; b <= n; b += 3) {
    const sa = Math.min(F.len - 0.9, Math.max(0.9, b * bw));
    if (sa < s0 + 0.4 || sa > s1 - 0.4) continue;
    const c = fp(F, sa, 0, 1.15);
    S.box('concrete', TIER.FAR, c[0], (y0 + yb - 0.24) / 2, c[2], 0.44, fh - 0.24, 0.44, { skip: 12 });
    // (a desk left where it stood, a cabinet on its side: enough to say somebody worked here)
    const hk = hash(B.seed, b, floor, fi + 320);
    if (hk > 0.55 || sa + 2.4 > s1 - 0.4) continue;
    const e = fp(F, sa + 1.6, 0, 1.5 + hk);
    S.box('wood', TIER.STREET, e[0], y0 + 0.4, e[2], F.tx ? 1.5 : 0.75, 0.76, F.tx ? 0.75 : 1.5, { c: [0.5, 0.44, 0.36], ry: (hk - 0.3) * 0.8, skip: 8 });
  }
}

// a window opening a0..a1 x y0..y1 of a face: the reveals, what is in it, and from near its frame, sill and lintel
function windowAt(S, F, B, fi, floor, bay, a0, a1, y0, y1, o = {}) {
  const st = B.st;
  const mat = B.wall;
  const col = B.tint;
  const rec = o.rec ?? st.rec;
  const state = o.state ?? windowState(B.seed, fi, floor, bay, B.wear, B.burnt);
  const w = a1 - a0, h = y1 - y0;
  // reveals: the thickness of the wall round the opening
  const u = F.u0 || 0;
  const rv = (p0, p1, p2, p3, uw, uh) => S.quad(mat, TIER.FAR, p0, p1, p2, p3, [[u, 0], [u + uw, 0], [u + uw, uh], [u, uh]], col);
  rv(fp(F, a0, y0, 0), fp(F, a0, y0, rec), fp(F, a0, y1, rec), fp(F, a0, y1, 0), rec, h);
  rv(fp(F, a1, y0, rec), fp(F, a1, y0, 0), fp(F, a1, y1, 0), fp(F, a1, y1, rec), rec, h);
  rv(fp(F, a0, y0, 0), fp(F, a1, y0, 0), fp(F, a1, y0, rec), fp(F, a0, y0, rec), w, rec);
  rv(fp(F, a0, y1, rec), fp(F, a1, y1, rec), fp(F, a1, y1, 0), fp(F, a0, y1, 0), w, rec);
  // what stands in it
  const hk = hash(B.seed, fi * 977 + floor * 31 + bay, 3);
  if (state === 0) {
    const uo = hk * 5, vo = hash(B.seed, bay, floor, fi) * 5;
    S.quad('glass', TIER.FAR, fp(F, a0, y0, rec), fp(F, a1, y0, rec), fp(F, a1, y1, rec), fp(F, a0, y1, rec), [[uo, vo], [uo + w, vo], [uo + w, vo + h], [uo, vo + h]]);
  } else if (!o.through) {
    S.quad('dark', TIER.FAR, fp(F, a0, y0, rec), fp(F, a1, y0, rec), fp(F, a1, y1, rec), fp(F, a0, y1, rec));
  }
  if (state === 3) {
    // boarded: planks nailed across it from outside, none of them level
    const nb = Math.max(3, Math.round(h / 0.34));
    for (let k = 0; k < nb; k++) {
      const by = y0 + ((k + 0.5) * h) / nb;
      const tilt = (hash(B.seed, bay * 13 + k, floor, fi + 40) - 0.5) * 0.09;
      const c0 = fp(F, a0 - 0.1, by - 0.13 - tilt, -0.02), c1 = fp(F, a1 + 0.1, by - 0.13 + tilt, -0.02), c2 = fp(F, a1 + 0.1, by + 0.13 + tilt, -0.02), c3 = fp(F, a0 - 0.1, by + 0.13 - tilt, -0.02);
      S.quad('planks', k % 2 ? TIER.STREET : TIER.FAR, c0, c1, c2, c3, [[0, by], [w + 0.2, by], [w + 0.2, by + 0.26], [0, by + 0.26]]);
    }
  }
  // ---- from near
  const T = TIER.DETAIL;
  const fr = st.frame;
  const ft = 0.06; // the frame's width
  if (state !== 3) {
    // the frame, proud of the glass: four strips, and what divides the panes
    faceBox(S, F, fr, T, a0, a0 + ft, y0, y1, rec - 0.05, rec);
    faceBox(S, F, fr, T, a1 - ft, a1, y0, y1, rec - 0.05, rec);
    faceBox(S, F, fr, T, a0 + ft, a1 - ft, y1 - ft, y1, rec - 0.05, rec);
    faceBox(S, F, fr, T, a0 + ft, a1 - ft, y0, y0 + ft, rec - 0.05, rec);
    if (st.panes) {
      for (let k = 1; k < 4; k++) faceBox(S, F, fr, T, a0 + (k * w) / 4 - 0.02, a0 + (k * w) / 4 + 0.02, y0 + ft, y1 - ft, rec - 0.04, rec);
      for (let k = 1; k < 3; k++) faceBox(S, F, fr, T, a0 + ft, a1 - ft, y0 + (k * h) / 3 - 0.02, y0 + (k * h) / 3 + 0.02, rec - 0.04, rec);
      // (panes of it put out one at a time)
      if (state === 0) {
        for (let k = 0; k < 12; k++) {
          if (hash(B.seed, k + bay * 12, floor * 7 + fi, 21) > 0.4) continue;
          const px = a0 + ((k % 4) * w) / 4, py = y0 + (((k / 4) | 0) * h) / 3;
          S.quad('dark', T, fp(F, px + 0.03, py + 0.03, rec - 0.008), fp(F, px + w / 4 - 0.03, py + 0.03, rec - 0.008), fp(F, px + w / 4 - 0.03, py + h / 3 - 0.03, rec - 0.008), fp(F, px + 0.03, py + h / 3 - 0.03, rec - 0.008));
        }
      }
    } else if (!st.curtain) {
      faceBox(S, F, fr, T, a0 + ft, a1 - ft, y0 + h * 0.5 - 0.025, y0 + h * 0.5 + 0.025, rec - 0.045, rec);
      if (w > 1.5) faceBox(S, F, fr, T, a0 + w / 2 - 0.025, a0 + w / 2 + 0.025, y0 + ft, y1 - ft, rec - 0.045, rec);
    }
  }
  if (state === 1) {
    // what is left of the pane: teeth of glass standing in the frame
    const ns = 5 + ((hk * 5) | 0);
    for (let k = 0; k < ns; k++) {
      const e = k % 4; // which edge it stands on
      const t = hash(B.seed, k * 17 + bay, floor, fi + 9);
      const len = (0.14 + hash(B.seed, k, bay * 3 + floor, fi + 5) * 0.5) * Math.min(w, h) * 0.8;
      const wd = 0.12 + t * 0.3;
      let p0, p1, p2;
      if (e === 0) [p0, p1, p2] = [[a0 + ft + t * (w - 0.4), y0 + ft], [a0 + ft + t * (w - 0.4) + wd, y0 + ft], [a0 + ft + t * (w - 0.4) + wd * 0.4, y0 + ft + len]];
      else if (e === 1) [p0, p1, p2] = [[a0 + ft + t * (w - 0.4) + wd, y1 - ft], [a0 + ft + t * (w - 0.4), y1 - ft], [a0 + ft + t * (w - 0.4) + wd * 0.6, y1 - ft - len]];
      else if (e === 2) [p0, p1, p2] = [[a0 + ft, y0 + ft + t * (h - 0.4) + wd], [a0 + ft, y0 + ft + t * (h - 0.4)], [a0 + ft + len * 0.7, y0 + ft + t * (h - 0.4) + wd * 0.5]];
      else [p0, p1, p2] = [[a1 - ft, y0 + ft + t * (h - 0.4)], [a1 - ft, y0 + ft + t * (h - 0.4) + wd], [a1 - ft - len * 0.7, y0 + ft + t * (h - 0.4) + wd * 0.5]];
      S.tri('glass', T, fp(F, p0[0], p0[1], rec - 0.02), fp(F, p1[0], p1[1], rec - 0.02), fp(F, p2[0], p2[1], rec - 0.02), [p0[0], p0[1]], [p1[0], p1[1]], [p2[0], p2[1]]);
    }
  }
  if ((state === 1 || state === 2) && !st.curtain && !st.panes && !B.burnt && hk < 0.4) {
    // a curtain still hanging in it, what is left of one
    const cc = CURTAIN[((hk * 40) | 0) % CURTAIN.length];
    const side = hk < 0.2;
    const cw = w * (0.22 + hk);
    const drop = h * (0.55 + hash(B.seed, bay, floor + 3, fi) * 0.4);
    const x0 = side ? a0 + ft : a1 - ft - cw;
    S.quad('cloth', T, fp(F, x0, y1 - ft - drop, rec - 0.012), fp(F, x0 + cw, y1 - ft - drop * 0.86, rec - 0.012), fp(F, x0 + cw, y1 - ft, rec - 0.012), fp(F, x0, y1 - ft, rec - 0.012), null, cc);
  }
  if (st.stone && !o.plain) {
    // a sill and a lintel of stone, the sill proud of the wall
    faceBox(S, F, 'concrete', T, a0 - 0.12, a1 + 0.12, y0 - 0.11, y0, -0.08, rec * 0.6, WHITE, false);
    faceBox(S, F, 'concrete', T, a0 - 0.16, a1 + 0.16, y1, y1 + 0.2, -0.03, 0.0);
  } else if (!st.curtain && !o.plain) {
    faceBox(S, F, 'concrete', T, a0 - 0.05, a1 + 0.05, y0 - 0.07, y0, -0.05, rec * 0.5, WHITE, false);
  }
  if (B.burnt || (state === 2 && hash(B.seed, bay, floor, fi + 77) < B.wear * 0.2)) {
    // soot up the wall over an opening a fire came out of
    const sw = w * (1.2 + hk * 0.5), sh = Math.min(B.fh * 1.25, h * (1.3 + hk));
    decal(S, F, hk < 0.5 ? 'soot_a' : 'soot_b', (a0 + a1) / 2 + (hk - 0.5) * 0.3, y1 - 0.12 + sh / 2, sw, sh, true, TIER.FAR, -0.025);
  } else if (hk > 0.72 && !st.curtain) {
    // what the rain ran down from the sill
    decal(S, F, hk > 0.86 ? 'stain_a' : 'stain_b', (a0 + a1) / 2, y0 - 0.1 - 0.75, w * 0.9, 1.5);
  }
  // a box of an air conditioner hung out of one, rust running from it
  if (state !== 3 && !st.curtain && !st.panes && hash(B.seed, bay * 5, floor * 3, fi + 11) < 0.07 && !B.burnt) {
    faceBox(S, F, 'metal', T, a0 + 0.12, a0 + 0.78, y0 + 0.02, y0 + 0.46, -0.42, rec, WHITE, false);
    decal(S, F, 'rust_a', a0 + 0.45, y0 - 0.8, 0.5, 1.6);
  }
}

// What runs over the whole height of a building, face by face: the cornice under its parapet, the fins of an
// office block, string courses, a fire escape, balconies, a drainpipe, and what the years put on the wall.
export function trimOf(S, B, full, rectOf, rnd) {
  const st = B.st;
  const H = B.floors * B.fh;
  const topR = rectOf(B.floors - 1);
  const E = 0.02;
  const wholeTop = topR[0] < full[0] + E && topR[1] > full[1] - E && topR[2] < full[2] + E && topR[3] > full[3] - E;
  // how many storeys of face fi stand the whole length of it (the trim stops there)
  const wholeUpTo = (fi) => {
    const [nx, nz] = FACES[fi];
    let n = 0;
    for (; n < B.floors; n++) {
      const R = rectOf(n);
      const on = nx > 0 ? R[1] > full[1] - E : nx < 0 ? R[0] < full[0] + E : nz > 0 ? R[3] > full[3] - E : R[2] < full[2] + E;
      const span = nx ? R[2] < full[2] + E && R[3] > full[3] - E : R[0] < full[0] + E && R[1] > full[1] - E;
      if (!on || !span) break;
    }
    return n;
  };
  const escapeFace = st.cornice && !B.burnt && hash(B.seed, 101) < 0.75 ? (hash(B.seed, 102) < 0.6 ? 0 : 2) : -1;
  FACES.forEach(([nx, nz], fi) => {
    const F = faceOf(...full, nx, nz);
    F.u0 = fi * 17.3 + (B.seed % 13);
    const nf = wholeUpTo(fi);
    const h = nf * B.fh;
    if (nf < 1) return;
    const n = Math.max(1, Math.round(F.len / st.bay));
    const bw = F.len / n;
    const blank = B.blank & (1 << fi);
    if (st.cornice && wholeTop && nf === B.floors) {
      // the cornice: a course standing out under the parapet, on brackets
      faceBox(S, F, 'concrete', TIER.FAR, -0.1, F.len + 0.1, H - 0.42, H - 0.08, -st.cornice, 0, WHITE);
      faceBox(S, F, 'concrete', TIER.FAR, -0.05, F.len + 0.05, H - 0.62, H - 0.42, -st.cornice * 0.45, 0, WHITE);
      for (let k = 0; k <= n * 3; k++) faceBox(S, F, 'concrete', TIER.DETAIL, (k * F.len) / (n * 3) - 0.07, (k * F.len) / (n * 3) + 0.07, H - 0.84, H - 0.62, -st.cornice * 0.7, 0);
    }
    if (st.stone && !blank) {
      // a string course under each row of sills
      for (let f = 1; f < nf; f++) faceBox(S, F, 'concrete', TIER.STREET, 0, F.len, f * B.fh - 0.06, f * B.fh + 0.1, -0.05, 0);
    }
    if (st.fins && !blank) {
      // fins from the ground floor's head to the roof, one at each bay line; a band at every floor
      for (let k = 0; k <= n; k++) faceBox(S, F, 'concrete', TIER.FAR, k * bw - 0.17, k * bw + 0.17, 0, h, -0.3, 0);
      for (let f = 0; f <= nf; f++) faceBox(S, F, 'concrete', TIER.FAR, 0, F.len, Math.max(0, f * B.fh - 0.2), Math.min(h, f * B.fh + 0.22), -0.12, 0);
    }
    if (st.curtain) {
      // the curtain wall's frame: a mullion at each bay line, a transom at each slab
      for (let k = 0; k <= n; k++) faceBox(S, F, 'metal', TIER.STREET, k * bw - 0.045, k * bw + 0.045, 0, h, -0.07, 0);
      for (let f = 0; f <= nf; f++) faceBox(S, F, 'concrete', TIER.FAR, 0, F.len, Math.max(0, f * B.fh - 0.14), Math.min(h, f * B.fh + 0.14), -0.03, 0);
    }
    if (st.balcony && !blank && (fi === 0 || fi === 2)) {
      // balconies, every other bay: a slab, a rail of rusted iron
      for (let f = 0; f < nf; f++) {
        for (let b = fi; b < n; b += 2) {
          const a0 = b * bw + 0.25, a1 = (b + 1) * bw - 0.25;
          const y = f * B.fh;
          if (hash(B.seed, f * 31 + b, fi, 111) < 0.12) continue; // (one gone)
          faceBox(S, F, 'concrete', TIER.FAR, a0, a1, y - 0.16, y, -1.15, 0);
          faceBox(S, F, 'rust', TIER.STREET, a0, a1, y + 0.96, y + 1.02, -1.14, -1.09, WHITE, false);
          faceBox(S, F, 'rust', TIER.STREET, a0, a0 + 0.05, y, y + 1.0, -1.14, 0, WHITE, false);
          faceBox(S, F, 'rust', TIER.STREET, a1 - 0.05, a1, y, y + 1.0, -1.14, 0, WHITE, false);
          for (let k = 1; k < 8; k++) faceBox(S, F, 'rust', TIER.DETAIL, a0 + (k * (a1 - a0)) / 8 - 0.012, a0 + (k * (a1 - a0)) / 8 + 0.012, y, y + 0.96, -1.13, -1.1, WHITE, false);
          decal(S, F, 'rust_b', a0 + 0.3, y - 1.1, 0.5, 1.8);
        }
      }
    }
    if (fi === escapeFace && nf >= 2 && n >= 2) {
      // the fire escape: a landing at every storey over two bays, a stair from each to the next, a ladder to the street
      const b0 = Math.min(n - 2, 1 + ((hash(B.seed, 103) * (n - 2)) | 0));
      const a0 = b0 * bw + 0.2, a1 = (b0 + 2) * bw - 0.2;
      for (let f = 0; f < nf; f++) {
        const y = f * B.fh + 0.05;
        faceBox(S, F, 'rust', TIER.FAR, a0, a1, y - 0.06, y, -1.05, 0, WHITE, false);
        // the rail round it
        faceBox(S, F, 'rust', TIER.STREET, a0, a1, y + 0.98, y + 1.03, -1.05, -1.0, WHITE, false);
        faceBox(S, F, 'rust', TIER.STREET, a0, a1, y + 0.5, y + 0.54, -1.04, -1.01, WHITE, false);
        for (const sa of [a0, a1 - 0.05]) {
          faceBox(S, F, 'rust', TIER.STREET, sa, sa + 0.05, y, y + 1.0, -1.05, -1.0, WHITE, false);
          faceBox(S, F, 'rust', TIER.STREET, sa, sa + 0.04, y + 0.98, y + 1.03, -1.0, 0, WHITE, false);
        }
        for (let k = 1; k < 10; k++) faceBox(S, F, 'rust', TIER.DETAIL, a0 + (k * (a1 - a0)) / 10 - 0.012, a0 + (k * (a1 - a0)) / 10 + 0.012, y, y + 0.98, -1.04, -1.02, WHITE, false);
        // brackets under it
        for (const sa of [a0 + 0.3, a1 - 0.3]) S.bar('rust', TIER.STREET, fp(F, sa, y - 0.9, 0), fp(F, sa, y - 0.06, -0.95), 0.05);
        if (f < nf - 1) {
          // the stair up to the next: two strings and their treads
          const up = f % 2 ? [a1 - 0.5, a0 + 0.9] : [a0 + 0.5, a1 - 0.9];
          for (const dd of [-0.95, -0.35]) S.bar('rust', TIER.FAR, fp(F, up[0], y, dd), fp(F, up[1], y + B.fh, dd), 0.08);
          for (let k = 1; k < 10; k++) {
            const t = k / 10;
            S.bar('rust', TIER.DETAIL, fp(F, lerp(up[0], up[1], t), y + B.fh * t, -0.95), fp(F, lerp(up[0], up[1], t), y + B.fh * t, -0.35), 0.05);
          }
        }
        if (hash(B.seed, f, 104) < 0.35) decal(S, F, 'rust_a', a0 + 0.4 + hash(B.seed, f, 105) * (a1 - a0 - 0.8), y - 1.0, 0.6, 1.9);
      }
      // the drop ladder, hanging over the pavement
      for (const sa of [a0 + 0.3, a0 + 0.75]) S.bar('rust', TIER.STREET, fp(F, sa, 0.05, -1.0), fp(F, sa, -2.6, -1.0), 0.04);
      for (let k = 0; k < 8; k++) S.bar('rust', TIER.DETAIL, fp(F, a0 + 0.3, -0.2 - k * 0.3, -1.0), fp(F, a0 + 0.75, -0.2 - k * 0.3, -1.0), 0.025);
    }
    // a drainpipe down a corner, broken off part way
    if (!st.curtain && hash(B.seed, fi, 121) < 0.6) {
      const sa = hash(B.seed, fi, 122) < 0.5 ? 0.25 : F.len - 0.25;
      const y0 = hash(B.seed, fi, 123) < 0.4 ? h * 0.3 : -B.ground;
      S.bar('rust', TIER.STREET, fp(F, sa, y0, -0.1), fp(F, sa, h, -0.1), 0.11, WHITE, 5);
      decal(S, F, 'stain_a', sa, Math.max(y0 - 1.2, -B.ground + 1), 1.0, 2.4);
    }
    // ---- what the years laid on it
    const hk = hash(B.seed, fi, 131);
    if (blank) {
      // a blind wall: a painted advertisement all but gone, or ivy to the third floor, damp under the coping
      if (hk < 0.4 && h > 7 && F.len > 8) decal(S, F, 'ghost', F.len / 2, h * 0.62, Math.min(F.len - 2, 8), Math.min(F.len - 2, 8) * 0.72, false, TIER.FAR);
      decal(S, F, 'damp_b', F.len * (0.2 + hk * 0.6), h - 1.6, 4.5, 3.4);
    }
    if (!st.curtain && hash(B.seed, fi, 132) < (blank ? 0.75 : 0.4)) {
      const iw = 4 + hk * 3, ih = Math.min(h + B.ground - 0.3, iw * (1.5 + hk * 0.5));
      const sa = hk < 0.5 ? iw / 2 - 0.2 : F.len - iw / 2 + 0.2;
      decal(S, F, hash(B.seed, fi, 133) < 0.6 ? 'ivy_a' : 'ivy_b', sa, -B.ground + ih / 2, iw, ih, false, TIER.FAR, -0.07);
    }
    for (let k = 0; k < 3; k++) {
      const r1 = hash(B.seed, fi * 7 + k, 141), r2 = hash(B.seed, fi * 7 + k, 142);
      if (r1 < 0.5) decal(S, F, r1 < 0.25 ? 'damp_a' : 'damp_b', r2 * F.len, h * (0.15 + r1 * 1.6), 2.6 + r2 * 2, 2 + r1 * 3);
      else if (r1 < 0.75 && !st.curtain) decal(S, F, r1 < 0.62 ? 'crack_a' : 'crack_b', r2 * F.len, h * (r1 - 0.2), 2.2 + r2 * 1.6, 2.2 + r2 * 1.6);
      else if (st.curtain || st.fins) decal(S, F, r2 < 0.5 ? 'rust_a' : 'rust_b', r2 * F.len, h * (0.3 + r1 * 0.5), 0.7, 2.6);
    }
  });
}
