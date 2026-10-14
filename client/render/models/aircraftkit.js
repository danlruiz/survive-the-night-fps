// What the aircraft of Calder Field (aircraft.js, lightplane.js) are built with.
//
// Nobody draws these: every shape is worked out from tables of real dimensions. A fuselage or a nacelle is a BODY,
// lofted along Z through stations whose section changes shape from one to the next; a wing, a tailplane or a fin is
// a LIFTING surface with a NACA section at every span station; what is painted or glazed is a patch laid on one
// of those skins. Every solid goes through shell(), which closes it and turns its faces out.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// metal gone dull and the dirt on it (the twin's and the singles' alike)
export const DULL = [0.42, 0.43, 0.42], DIRT = [0.33, 0.32, 0.29];

// An aircraft's panes are `canopy` (materials.js): glass with nothing to see behind it - the fuselage is a closed
// skin - so it is the sky in it and the dust on it. Its vertex colour is its look: [how dirty, its tint, blood].
const CANOPY = [0.42, 0.15, 0];

// ------------------------------------------------------------------ geometry
// Triangles into the builder. o.normals: one for each vertex (a patch takes its skin's); otherwise every corner
// gets the mean of the faces round it that lie within o.crease degrees of its own, so that a skin is smooth and an
// edge is an edge. o.uv: one for each vertex, in metres. o.c / o.cfn(x, y, z) / o.cols (one for each vertex): the
// colour, for a material that takes one (worked out here, in the model's own frame, whatever the builder's
// transform is).
function emit(b, mat, verts, tris, o = {}) {
  const cosC = Math.cos(((o.crease ?? 50) * PI) / 180);
  const live = [];
  const fn = [];
  const un = [];
  for (const t of tris) {
    const n = cross(sub(verts[t[1]], verts[t[0]]), sub(verts[t[2]], verts[t[0]]));
    if (Math.hypot(n[0], n[1], n[2]) < 1e-10) continue;
    live.push(t);
    fn.push(n);
    un.push(norm(n));
  }
  if (!live.length) return null;
  const key = (p) => `${Math.round(p[0] * 2e4)},${Math.round(p[1] * 2e4)},${Math.round(p[2] * 2e4)}`;
  const round = new Map();
  if (!o.normals) {
    live.forEach((t, f) => {
      for (const i of t) {
        const k = key(verts[i]);
        if (!round.has(k)) round.set(k, []);
        round.get(k).push(f);
      }
    });
  }
  const pos = [], nor = [], uv = [], col = [];
  const base = o.c || (mat === 'canopy' ? CANOPY : [1, 1, 1]);
  live.forEach((t, f) => {
    for (const i of t) {
      const p = verts[i];
      let n = o.normals ? o.normals[i] : [0, 0, 0];
      if (!o.normals) {
        for (const g of round.get(key(p))) {
          if (dot(un[f], un[g]) < cosC) continue;
          n[0] += fn[g][0];
          n[1] += fn[g][1];
          n[2] += fn[g][2];
        }
        n = norm(n);
      }
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      const w = o.uv ? o.uv[i] : [p[0] + p[2], p[1]];
      uv.push(w[0], w[1]);
      const c = o.cols ? o.cols[i] : o.cfn ? o.cfn(p[0], p[1], p[2]) : base;
      col.push(c[0], c[1], c[2]);
    }
  });
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g = mergeVertices(g, 1e-5);
  return b.add(mat, g, { keepColor: true });
}

// A closed shell lofted through rings of points (every ring the same number of [x, y, z], going the same way
// round): the skin between them, and an end on the first and the last. Its faces are turned out whichever way round
// the rings were given (by the sign of its volume). o.caps: 'strip' for a ring that is an arc and the same arc back
// inside it (half a cowling), false for rings that come back to the first (a tyre). o.warp(p): moves every point.
// o.ringC(j): the colour of ring j, where the colour goes by the ring.
export function shell(b, mat, rings, o = {}) {
  if (o.warp) rings = rings.map((R) => R.map(o.warp));
  const M = rings.length, N = rings[0].length;
  const verts = [], uvs = [], tris = [];
  const cols = o.ringC ? [] : null;
  let along = 0;
  rings.forEach((R, j) => {
    if (cols) for (let k = 0; k <= N; k++) cols.push(o.ringC(j));
    if (j) along += (Math.hypot(...sub(R[0], rings[j - 1][0])) + Math.hypot(...sub(R[N >> 1], rings[j - 1][N >> 1]))) / 2;
    let arc = 0;
    for (let k = 0; k <= N; k++) {
      const p = R[k % N];
      if (k) arc += Math.hypot(...sub(p, R[k - 1]));
      verts.push(p);
      uvs.push([arc, along]);
    }
  });
  for (let j = 0; j < M - 1; j++)
    for (let k = 0; k < N; k++) {
      const a = j * (N + 1) + k, c = a + N + 1;
      tris.push([a, c, a + 1], [a + 1, c, c + 1]);
    }
  const cap = (R, end) => {
    const at = verts.length;
    const tri = (i, j, k) => tris.push(end ? [at + i, at + k, at + j] : [at + i, at + j, at + k]);
    if (o.caps === 'strip') {
      for (const p of R) verts.push(p), uvs.push([p[0] + p[2], p[1]]);
      for (let k = 0; k < N / 2 - 1; k++) tri(k, k + 1, N - 1 - k), tri(k + 1, N - 2 - k, N - 1 - k);
      return;
    }
    if (cols) for (let k = 0; k <= N; k++) cols.push(o.ringC(end ? M - 1 : 0));
    const m = [0, 0, 0];
    for (const p of R) for (let a = 0; a < 3; a++) m[a] += p[a] / N;
    verts.push(m, ...R);
    for (const p of [m, ...R]) uvs.push([p[0] + p[2], p[1]]);
    for (let k = 0; k < N; k++) tri(0, 1 + k, 1 + ((k + 1) % N));
  };
  if (o.caps !== false) {
    cap(rings[0], false);
    cap(rings[M - 1], true);
  }
  let vol = 0;
  for (const [i, j, k] of tris) vol += dot(verts[i], cross(verts[j], verts[k]));
  if (vol < 0) for (const t of tris) [t[1], t[2]] = [t[2], t[1]];
  return emit(b, mat, verts, tris, { ...o, uv: uvs, cols });
}

// A solid of revolution: prof [[radius, along the axis], ...] turned about o.axis ('x', 'y' or 'z') through the
// origin. Closed where the profile starts and ends on the axis, or (caps: false) comes back to where it began.
export function turn(b, mat, prof, seg, o = {}) {
  const ax = o.axis || 'y';
  const rings = prof.map(([r, a]) => {
    const R = [];
    for (let k = 0; k < seg; k++) {
      const c = Math.cos((k / seg) * PI * 2) * r, s = Math.sin((k / seg) * PI * 2) * r;
      R.push(ax === 'x' ? [a, c, s] : ax === 'y' ? [c, a, s] : [c, s, a]);
    }
    return R;
  });
  return shell(b, mat, rings, o);
}

// A body lofted along Z: S, its stations, each { z, yb, yt: its bottom and top, hw: its half width, n (or nt, nb,
// for the top and the bottom): how square its section is (2: an ellipse, 3 and over: a rectangle with round
// corners), wl: how far up, 0..1, it is widest }, about the line x = x0. th is the angle round a section from the
// keel (0) up the +X side to the crown (PI) and down the other.
export function makeBody(S, x0 = 0) {
  const sec = (s, th) => {
    const sn = Math.sin(th), cs = -Math.cos(th);
    const yw = lerp(s.yb, s.yt, s.wl ?? 0.5);
    const e = 2 / (cs >= 0 ? s.nt ?? s.n ?? 2 : s.nb ?? s.n ?? 2);
    return [x0 + s.hw * Math.sign(sn) * Math.abs(sn) ** e, cs >= 0 ? yw + (s.yt - yw) * cs ** e : yw - (yw - s.yb) * (-cs) ** e];
  };
  const find = (z) => {
    let k = 0;
    while (k < S.length - 2 && z > S[k + 1].z) k++;
    return [k, clamp01((z - S[k].z) / (S[k + 1].z - S[k].z))];
  };
  // the point of the skin at station z, angle th (the loft's own: straight between two stations)
  const pt = (z, th) => {
    const [k, f] = find(z);
    const A = sec(S[k], th), B = sec(S[k + 1], th);
    return [lerp(A[0], B[0], f), lerp(A[1], B[1], f), z];
  };
  const normal = (z, th) => {
    const z0 = Math.max(S[0].z, z - 0.01), z1 = Math.min(S[S.length - 1].z, z + 0.01);
    return norm(cross(sub(pt(z, th + 0.02), pt(z, th - 0.02)), sub(pt(z1, th), pt(z0, th))));
  };
  // ...and `out` metres off it
  const at = (z, th, out = 0) => {
    const p = pt(z, th);
    if (!out) return p;
    const n = normal(z, th);
    return [p[0] + n[0] * out, p[1] + n[1] * out, p[2] + n[2] * out];
  };
  // the angle at which the skin of the +X side is at height y
  const thAt = (z, y) => {
    let lo = 0, hi = PI;
    for (let i = 0; i < 20; i++) {
      const m = (lo + hi) / 2;
      if (pt(z, m)[1] < y) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const rings = (k0 = 0, k1 = S.length - 1, N = 24) => S.slice(k0, k1 + 1).map((s) => Array.from({ length: N }, (_, k) => [...sec(s, (k / N) * PI * 2), s.z]));
  const edge = (z) => {
    const [k, f] = find(z);
    return { yb: lerp(S[k].yb, S[k + 1].yb, f), yt: lerp(S[k].yt, S[k + 1].yt, f), hw: lerp(S[k].hw, S[k + 1].hw, f) };
  };
  return { S, x0, pt, at, normal, thAt, rings, edge };
}

// A patch laid on a body's skin, o.out metres off it and lit as the skin is: where(u, v) gives [z, th] over the
// unit square, cut into nu by nv.
export function skinPatch(b, mat, body, where, nu, nv, o = {}) {
  const out = o.out ?? 0.012;
  const verts = [], normals = [], uvs = [], tris = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const [z, th] = where(i / nu, j / nv);
      verts.push(body.at(z, th, out));
      normals.push(body.normal(z, th));
      uvs.push([z, th * 0.7]);
    }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, c = a + nv + 1;
      tris.push([a, c, a + 1], [a + 1, c, c + 1]);
    }
  faceOut(verts, tris, normals);
  return emit(b, mat, verts, tris, { ...o, normals, uv: uvs });
}
// (turns a patch's triangles to face the way its normals point)
function faceOut(verts, tris, normals) {
  let way = 0;
  for (const [i, j, k] of tris) way += dot(cross(sub(verts[j], verts[i]), sub(verts[k], verts[i])), normals[i]);
  if (way < 0) for (const t of tris) [t[1], t[2]] = [t[2], t[1]];
}
const bil = (c, u, v) => [0, 1].map((a) => (1 - u) * (1 - v) * c[0][a] + u * (1 - v) * c[1][a] + u * v * c[2][a] + (1 - u) * v * c[3][a]);
// where(u, v) for a patch between four corners given round it: as [z, th], or on the side sx as [z, y]
export const onTh = (c) => (u, v) => bil(c, u, v);
export const onSide = (body, sx, c) => (u, v) => {
  const [z, y] = bil(c, u, v);
  return [z, sx * body.thAt(z, y)];
};
// a band along a side: pts [[z, y0, y1], ...], from y0 to y1 at each
export function band(b, mat, body, sx, pts, o = {}) {
  const n = pts.length - 1;
  const where = (u, v) => {
    const i = Math.min(n - 1, Math.floor(u * n + 1e-9)), f = u * n - i;
    const z = lerp(pts[i][0], pts[i + 1][0], f);
    return [z, sx * body.thAt(z, lerp(lerp(pts[i][1], pts[i + 1][1], f), lerp(pts[i][2], pts[i + 1][2], f), v))];
  };
  return skinPatch(b, mat, body, where, n, o.ny || 1, o);
}
// a line round a body at station z, w wide, from angle th0 to th1
export const hoop = (b, mat, body, z, w, o = {}, th0 = 0, th1 = PI * 2) => skinPatch(b, mat, body, (u, v) => [z - w / 2 + w * u, lerp(th0, th1, v)], 1, o.n || 20, o);
// the outline of a panel on a side, between z0, z1 and y0, y1: four lines w wide
export function outlineSide(b, mat, body, sx, z0, z1, y0, y1, w, o = {}) {
  for (const z of [z0, z1]) skinPatch(b, mat, body, onSide(body, sx, [[z - w / 2, y0], [z + w / 2, y0], [z + w / 2, y1], [z - w / 2, y1]]), 1, 5, o);
  for (const y of [y0, y1]) band(b, mat, body, sx, [[z0, y - w / 2, y + w / 2], [(z0 + z1) / 2, y - w / 2, y + w / 2], [z1, y - w / 2, y + w / 2]], o);
}
// a flat shape on a side: poly, its corners as [z, y] going round (convex); a window. o.fan: on a side flat enough
// that it need not follow it between its middle and its edge
export function skinShape(b, mat, body, sx, poly, o = {}) {
  const out = o.out ?? 0.016;
  const c = [0, 1].map((a) => poly.reduce((s, p) => s + p[a] / poly.length, 0));
  const verts = [], normals = [], uvs = [], tris = [];
  const put = ([z, y]) => {
    const th = sx * body.thAt(z, y);
    verts.push(body.at(z, th, out));
    normals.push(body.normal(z, th));
    uvs.push([z, y]);
  };
  const n = poly.length;
  put(c);
  if (!o.fan) for (const p of poly) put([lerp(c[0], p[0], 0.55), lerp(c[1], p[1], 0.55)]);
  for (const p of poly) put(p);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    if (o.fan) tris.push([0, 1 + k, 1 + k1]);
    else tris.push([0, 1 + k, 1 + k1], [1 + k, 1 + n + k, 1 + k1], [1 + k1, 1 + n + k, 1 + n + k1]);
  }
  faceOut(verts, tris, normals);
  return emit(b, mat, verts, tris, { ...o, normals, uv: uvs });
}
// a rectangle with round corners, as that shape
export function roundRect(z0, z1, y0, y1, r) {
  const pts = [];
  for (const [cz, cy, a0] of [[z1 - r, y1 - r, 0], [z0 + r, y1 - r, PI / 2], [z0 + r, y0 + r, PI], [z1 - r, y0 + r, PI * 1.5]]) for (let k = 0; k < 3; k++) pts.push([cz + Math.cos(a0 + (k * PI) / 4) * r, cy + Math.sin(a0 + (k * PI) / 4) * r]);
  return pts;
}

// A NACA four-digit section, in chords: its half thickness at u along the chord for a thickness t, and the camber
// line (m: how much, at 0.4 of the chord).
const FOIL_U = [0, 0.004, 0.015, 0.045, 0.1, 0.2, 0.3, 0.42, 0.56, 0.7, 0.85, 1];
export const FOIL_COARSE = [0, 0.008, 0.04, 0.12, 0.28, 0.5, 0.75, 1]; // (for a small surface)
const foilT = (u, t) => 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4);
const foilC = (u, m) => (u < 0.4 ? (m / 0.16) * (0.8 * u - u * u) : (m / 0.36) * (0.2 + 0.8 * u - u * u));
// A lifting surface: at(s) is its section at span station s, { le: [x, y, z] of the leading edge, c: the chord
// (along +Z), t: its thickness, in chords }. up: it stands (a fin: s is the height and its "top" is its +X side).
// A point of it is given by s, u along the chord, and side (1: the top, -1: underneath). hinge { u, d }: the part
// behind u is a control surface, turned d down about its hinge. us: where along the chord its sections have points.
export function lifting(at, { m = 0, up = false, us: US = FOIL_U } = {}) {
  const turned = (S, dz, dv, hinge) => {
    if (!hinge || !hinge.d) return [dz, dv];
    const hz = hinge.u * S.c, hv = foilC(hinge.u, m) * S.c;
    const c = Math.cos(hinge.d), s = Math.sin(hinge.d);
    return [hz + (dz - hz) * c + (dv - hv) * s, hv - (dz - hz) * s + (dv - hv) * c];
  };
  const place = (S, [dz, dv]) => (up ? [S.le[0] + dv, S.le[1], S.le[2] + dz] : [S.le[0], S.le[1] + dv, S.le[2] + dz]);
  // (the skin's normal in the section's own plane)
  const lean = (S, u, side) => {
    const u0 = Math.max(0, u - 0.004), u1 = Math.min(1, u + 0.004);
    const tz = u1 - u0, tv = foilC(u1, m) + side * foilT(u1, S.t) - foilC(u0, m) - side * foilT(u0, S.t);
    const l = Math.hypot(tz, tv);
    return [(-tv / l) * side, (tz / l) * side];
  };
  const pt = (s, u, side, out = 0, hinge = null) => {
    const S = at(s);
    let dz = u * S.c, dv = (foilC(u, m) + side * foilT(u, S.t)) * S.c;
    if (out) {
      const n = lean(S, u, side);
      dz += n[0] * out;
      dv += n[1] * out;
    }
    return place(S, turned(S, dz, dv, hinge));
  };
  const normal = (s, u, side, hinge = null) => {
    const S = at(s);
    const n = lean(S, u, side);
    const a = turned(S, 0, 0, hinge), c = turned(S, n[0], n[1], hinge);
    return up ? [c[1] - a[1], 0, c[0] - a[0]] : [0, c[1] - a[1], c[0] - a[0]];
  };
  // the section at s between u0 and u1 of the chord, as a ring: back to front over the top, and back underneath.
  // A control surface gets a round nose ahead of its hinge.
  const ring = (s, u0 = 0, u1 = 1, hinge = null) => {
    const S = at(s);
    const us = [u0, ...US.filter((u) => u > u0 + 1e-6 && u < u1 - 1e-6), u1];
    const pts = [];
    const put = (u, side) => pts.push(place(S, turned(S, u * S.c, (foilC(u, m) + side * foilT(u, S.t)) * S.c, hinge)));
    for (let k = us.length - 1; k >= 0; k--) put(us[k], 1);
    if (hinge) pts.push(place(S, turned(S, (u0 - 0.4 * foilT(u0, S.t)) * S.c, foilC(u0, m) * S.c, hinge)));
    for (let k = u0 > 0 ? 0 : 1; k < us.length; k++) put(us[k], -1);
    return pts;
  };
  return { at, pt, normal, ring };
}
// a length of a lifting surface through the span stations given, between u0 and u1 of its chord: a closed shell
export const panel = (b, mat, surf, spans, u0, u1, o = {}, hinge = null) => shell(b, mat, spans.map((s) => surf.ring(s, u0, u1, hinge)), o);
// a patch laid on one, between two span stations and two places along the chord (o.le: finer towards the first)
export function surfPatch(b, mat, surf, [s0, s1], [ua, ub], side, o = {}) {
  const ns = o.ns || 1, nu = o.nu || 4, out = o.out ?? 0.004;
  const verts = [], normals = [], uvs = [], tris = [];
  for (let i = 0; i <= ns; i++)
    for (let j = 0; j <= nu; j++) {
      const s = lerp(s0, s1, i / ns), u = lerp(ua, ub, o.le ? (j / nu) ** 2 : j / nu);
      const p = surf.pt(s, u, side, out, o.hinge);
      verts.push(p);
      normals.push(norm(surf.normal(s, u, side, o.hinge)));
      uvs.push([p[0] + p[1], p[2]]);
    }
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nu; j++) {
      const a = i * (nu + 1) + j, c = a + nu + 1;
      tris.push([a, c, a + 1], [a + 1, c, c + 1]);
    }
  faceOut(verts, tris, normals);
  return emit(b, mat, verts, tris, { ...o, normals, uv: uvs });
}

// A propeller blade out along +Y from the hub at the origin (the shaft is Z, the aircraft's nose at -Z), R long:
// [how far out, the chord, its thickness - all of R - and its pitch]. Round at the shank, widest at half its
// length, twisted flat towards the tip. bend { r0, a }: bent back by a from r0 out (it met the ground).
const BLADE = [[0.1, 0.055, 0.05, 1.15], [0.2, 0.08, 0.04, 0.96], [0.33, 0.125, 0.027, 0.76], [0.52, 0.148, 0.019, 0.57], [0.74, 0.135, 0.013, 0.43], [0.9, 0.11, 0.009, 0.35], [0.905, 0.109, 0.009, 0.35], [0.975, 0.078, 0.007, 0.32], [1, 0.03, 0.005, 0.31]];
const PROP_BLACK = [0.1, 0.1, 0.105], PROP_TIP = [0.72, 0.58, 0.12];
export function blade(b, R, bend = null, round = 8) {
  const rings = BLADE.map(([rr, cc, tt, be]) => {
    const pts = [];
    for (let k = 0; k < round; k++) {
      const a = (k / round) * PI * 2;
      // (a flat back and a cambered face)
      const s = Math.cos(a) * cc * R * 0.5, n = Math.sin(a) * tt * R * (Math.sin(a) < 0 ? 0.35 : 1);
      let y = rr * R, z = -s * Math.sin(be) + n * Math.cos(be);
      if (bend && y > bend.r0) [y, z] = [bend.r0 + (y - bend.r0) * Math.cos(bend.a) - z * Math.sin(bend.a), z * Math.cos(bend.a) + (y - bend.r0) * Math.sin(bend.a)];
      pts.push([s * Math.cos(be) + n * Math.sin(be), y, z]);
    }
    return pts;
  });
  shell(b, 'aircraft', rings, { ringC: (j) => (j >= 6 ? PROP_TIP : PROP_BLACK), crease: 60 }); // (black, its tip yellow)
}

// ------------------------------------------------------------------ what both carry
// A wheel, its axle along X through the origin: a tyre of radius r and width w on a painted hub. sink: how far the
// axle has come down onto it (a little: it carries the aircraft; a lot: it is flat, and spreads on the ground).
export function acWheel(b, r, w, sink = 0.012, seg = 14) {
  const hw = w / 2, ri = r * 0.48, low = -(r - sink), soft = Math.max(0.03, sink);
  const flat = (p) => {
    if (p[1] >= low + soft) return p;
    const k = Math.min(1, (low + soft - p[1]) / soft);
    return [p[0] * (1 + (sink > 0.03 ? 0.38 : 0.06) * k), Math.max(low, p[1]), p[2]];
  };
  turn(b, 'tire', [[ri, hw * 0.72], [r * 0.74, hw], [r * 0.93, hw * 0.84], [r, hw * 0.4], [r, -hw * 0.4], [r * 0.93, -hw * 0.84], [r * 0.74, -hw], [ri, -hw * 0.72], [ri, hw * 0.72]], seg, { axis: 'x', caps: false, warp: flat, crease: 40 });
  const hub = seg < 12 ? [[0.001, hw * 0.55], [ri * 1.03, hw * 0.7], [ri * 1.03, -hw * 0.7], [0.001, -hw * 0.55]] : [[0.001, hw * 0.5], [ri * 0.45, hw * 0.62], [ri * 1.03, hw * 0.7], [ri * 1.03, -hw * 0.7], [ri * 0.45, -hw * 0.62], [0.001, -hw * 0.5]];
  turn(b, 'aircraft', hub, Math.min(10, seg), { axis: 'x', c: [0.5, 0.5, 0.47], crease: 40 });
}
// a drum of fuel stood on the ground at the origin: its rolling hoops, its rim, a bung in its head
export function drum(b, c) {
  turn(b, 'paint', [[0.001, 0], [0.272, 0], [0.285, 0.012], [0.285, 0.27], [0.293, 0.285], [0.285, 0.3], [0.285, 0.57], [0.293, 0.585], [0.285, 0.6], [0.285, 0.868], [0.276, 0.88], [0.268, 0.868], [0.268, 0.855], [0.001, 0.855]], 12, { c, crease: 35 });
  b.cyl('steel', 0.03, 0.03, 0.016, 6, { p: [0.16, 0.862, 0.05] });
  b.cyl('dark', 0.014, 0.014, 0.012, 5, { p: [-0.17, 0.86, -0.04] });
}
