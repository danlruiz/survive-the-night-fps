// The first-person hands and arms: the hand poses (finger curls, thumb, grip centre) and the gloved (or clawed)
// hand and sleeved arm built from them, and VMArm, one arm of the viewmodel. A pose fitted to one held item lives in
// that item's file (weapons/<item>.js, poses) and is added to HAND_POSES by weapons/index.js; the ones here are
// shared, or named by the animation code itself.
import * as THREE from 'three';
import { WR, CR } from '../charTextures.js';
import { MeshBuilder, getViewArmMaterial, getViewCharMaterial, mulberry32, fbm3 } from '../skinning.js';
import { PI, mirrorX, sstep } from './parts.js';

// Hand local frame (right hand): wrist at origin, fingers along -Y, palm faces -X, thumb/index toward -Z.
// Grip tunnel (fist) axis = local Z. Left hand = mirror in X.
export const HAND_POSES = {
  grip: { curl: [[1.25, 1.45, 0.9], [1.3, 1.5, 0.9], [1.35, 1.5, 0.9], [1.4, 1.45, 0.9]], spread: 0.0, thumb: [[-0.62, -0.52, -0.58], [-0.25, -0.95, -0.2]], center: [-0.034, -0.083, 0] },
  // pistol grip, fitted to the pistol's grip with the hand placed by VM[PISTOL].rGrip: the grip runs diagonally
  // across the palm, the middle, ring and little fingers close on the front strap, the index pad rests on the
  // trigger face, and the thumb (its base swung round behind the beavertail, tmcp) lies along the frame
  trigger: {
    curl: [[0.8, 0.35, 0.355], [0.95, 1.0, 0.675], [0.955, 0.9, 0.63], [0.85, 0.455, 0.96]],
    spreads: [-0.25, 0, 0, 0],
    thumb: [[-0.352, -0.843, -0.407], [-0.388, -0.848, -0.361]],
    tmcp: [-0.0474, -0.0267, -0.0328],
    tback: [-0.808, 0.511, -0.28],
    thumbL: [0.031, 0.026],
    center: [-0.041, -0.0755, -0.0123],
  },
  // pistol support hand (VM[PISTOL].lGrip), fitted the same way: the palm on the left of the grip, the fingers
  // closed over the gun hand's, the thumb forward along the frame under the gun hand's thumb
  cup: {
    curl: [[1.45, 0.315, 0.22], [1.55, 0.28, 0.35], [1.6, 0.045, 0.3], [1.65, 0.255, 0.175]],
    spread: 0.0,
    thumb: [[-0.242, -0.893, -0.379], [-0.217, -0.921, -0.323]],
    tmcp: [-0.0169, -0.0294, -0.031],
    tback: [0.9107, -0.0373, -0.373],
    thumbL: [0.031, 0.026],
    center: [-0.0475, -0.0447, -0.007],
  },
  support: { curl: [[0.95, 1.1, 0.7], [1.0, 1.15, 0.7], [1.05, 1.15, 0.7], [1.1, 1.1, 0.7]], spread: 0.02, thumb: [[-0.7, -0.45, -0.55], [-0.4, -0.9, 0.1]], center: [-0.042, -0.088, 0] },
  pinch: { curl: [[0.9, 1.2, 0.8], [1.1, 1.4, 0.9], [1.25, 1.45, 0.9], [1.35, 1.4, 0.9]], spread: 0.0, thumb: [[-0.55, -0.6, -0.55], [-0.2, -0.85, 0.45]], center: [-0.03, -0.1, -0.02] },
  open: { curl: [[0.25, 0.3, 0.2], [0.2, 0.3, 0.2], [0.25, 0.3, 0.2], [0.3, 0.35, 0.25]], spread: 0.08, thumb: [[-0.4, -0.55, -0.73], [-0.1, -0.8, -0.6]], center: [-0.035, -0.095, 0] },
  // flat against a leaper that has them pinned, shoving it off (ViewModel._push): fingers splayed and nearly straight
  shove: { curl: [[0.14, 0.22, 0.16], [0.1, 0.2, 0.14], [0.12, 0.22, 0.16], [0.18, 0.26, 0.18]], spread: 0.1, thumb: [[-0.45, -0.5, -0.74], [-0.15, -0.8, -0.58]], center: [-0.035, -0.095, 0] },
  claw: { curl: [[0.45, 0.55, 0.45], [0.4, 0.55, 0.45], [0.45, 0.6, 0.45], [0.55, 0.65, 0.5]], spread: 0.2, thumb: [[-0.55, -0.5, -0.67], [-0.35, -0.85, -0.3]], center: [-0.035, -0.11, 0] },
  // a used item held in both hands, palms on its sides (the medkit, the tin and the can are the same either side)
  kitHold: { curl: [[0.36, 1.02, 0.71], [0.21, 1.24, 0.86], [0.37, 1.03, 0.72], [0.38, 0.44, 1.2]], spread: 0.02, thumb: [[0.07, -0.87, -0.5], [0.08, -0.99, 0.1]], center: [0.0075, -0.088, 0] },
  tinHold: { curl: [[0.42, 0.48, 0.76], [0.49, 0.68, 0.47], [0.51, 0.59, 0.51], [0.51, 0.59, 0.51]], spread: 0.02, thumb: [[-0.84, -0.5, -0.22], [-0.3, -0.92, -0.23]], center: [0.0075, -0.088, 0] },
  drinkHold: { curl: [[0.42, 0.67, 0.46], [0.43, 0.78, 0.54], [0.44, 0.69, 0.48], [0.41, 0.46, 0.4]], spread: 0.02, thumb: [[-0.92, -0.38, -0.12], [-0.96, -0.26, 0.13]], center: [0.0077, -0.088, 0] }, // (eased off the can by a fifth: round one this narrow the two hands' fingers met)
  meatR: { curl: [[0.56, 0.64, 0.5], [0.43, 0.83, 0.58], [0.59, 0.68, 0.47], [0.59, 0.68, 0.47]], spread: 0.02, thumb: [[-0.69, -0.61, -0.4], [-0.48, -0.87, -0.13]], center: [-0.006, -0.088, 0] },
  meatL: { curl: [[0.6, 1.31, 0.91], [0.62, 0.71, 0.5], [0.66, 0.76, 0.53], [0.66, 0.76, 0.53]], spread: 0.02, thumb: [[-0.48, -0.87, -0.13], [-0.56, -0.79, -0.23]], center: [-0.0577, -0.088, 0] },
  // reloads: the pistol's slide and its new magazine, the crossbow's string, the RPG's grenade (a magazine coming out
  // of a rifle is its own file's magPose)
  rackPinch: { curl: [[0.4, 1.12, 0.78], [0.48, 1.36, 0.95], [0.68, 1.72, 1.2], [1.6, 1.72, 1.2]], spread: 0, thumb: [[-0.37, -0.92, 0.1], [-0.22, -0.5, 0.84]], center: [-0.0217, -0.1, -0.02] }, // the pistol's slide, racked
  pistolMag: { curl: [[0.91, 1.04, 0.72], [0.3, 1.48, 1.03], [0.21, 1.34, 0.93], [0.73, 0.84, 1.2]], spread: 0.02, thumb: [[-0.77, -0.61, -0.21], [0.03, -0.97, -0.26]], center: [-0.0135, -0.088, 0] }, // the pistol's new magazine
  xbowString: { curl: [[0.6, 0.56, 0.39], [0.56, 0.6, 0.42], [0.48, 0.6, 0.42], [1.08, 0.88, 0.62]], spread: 0, thumb: [[0.1, -0.97, -0.24], [-0.1, -0.92, 0.37]], center: [-0.0268, -0.1, -0.02] }, // the crossbow's string, hauled back to the latch
  rpgWarhead: { curl: [[0.42, 0.48, 0.34], [0.51, 0.59, 0.41], [0.56, 0.64, 0.45], [0.54, 0.62, 0.43]], spread: 0.02, thumb: [[-0.61, -0.71, -0.35], [0, -0.61, -0.79]], center: [-0.0418, -0.088, 0] },
  // the stray cat in both arms (ViewModel.holdCat): the right palm laid on its back, the fingers eased along the fur,
  // and the left cupped under its belly, the fingers round its far side. center: the middle of the palm's face
  catBack: { curl: [[0.48, 0.55, 0.38], [0.49, 0.56, 0.39], [0.47, 0.54, 0.38], [0.4, 0.46, 0.32]], spread: 0.04, thumb: [[0.45, -0.8, -0.4], [0.55, -0.8, -0.25]], center: [-0.0168, -0.06, 0.005] }, // (fitted against the posed cat over a whole stroke: each joint as open as its widest point needs, the thumb up off the neck)
  catCup: { curl: [[0.37, 0.86, 0.6], [0.52, 0.89, 0.62], [0.61, 0.7, 0.48], [0.38, 0.44, 0.3]], spread: 0.03, thumb: [[-0.16, -0.79, -0.59], [-0.07, -0.87, -0.5]], center: [-0.0405, -0.06, 0.005] }, // (fitted the same way: under its tucked legs, as it arches into a stroke)
};
// the revolver's reload (VM[REVOLVER], _animReload): 'trigger''s fingers with the thumb fitted (clip:fit --act reload
// --keep 0,1,2,3 --loose) round the grip under the swung-out cylinder, not along the frame where the cylinder goes
HAND_POSES.revolverOpen = { curl: HAND_POSES.trigger.curl, spreads: HAND_POSES.trigger.spreads, thumb: [[0.23, -0.79, 0.56], [-0.3, -0.92, -0.23]], center: HAND_POSES.trigger.center };
// Knuckles sit on an arc (middle finger furthest out, pinky set back). r = proximal phalanx radius.
export const FINGERS = [
  { z: -0.0285, y: -0.0875, L: [0.043, 0.026, 0.021], r: 0.0094 },
  { z: -0.0095, y: -0.089, L: [0.047, 0.029, 0.022], r: 0.0097 },
  { z: 0.0095, y: -0.0875, L: [0.044, 0.027, 0.021], r: 0.0092 },
  { z: 0.0275, y: -0.0845, L: [0.035, 0.021, 0.018], r: 0.0081 },
];
export const PHALANX_R = [1.0, 0.9, 0.82];

/**
 * Finger curls (HAND_POSES format) that close the hand on an oval handle along the hand's Z axis, centred at
 * (cx, cy) with half-widths rx (palm to back) and ry: each joint bends until its phalanx, or the rest of the
 * finger beyond it (held slightly bent), sinks `squeeze` into the handle, the way a hand closes on a grip.
 * Phalanx sizes match getHandGeo's gloved fingers (radius on the palm side = r * sx).
 */
export function wrapCurls(cx, cy, rx, ry, squeeze, slope = 0) {
  return FINGERS.map((F) => {
    // a handle laid diagonally across the palm (rising `slope` toward the wrist per unit of z) cuts this finger's
    // plane in a longer oval, further up the palm the nearer the little finger
    const fy = cy + slope * F.z, fry = ry * Math.hypot(1, slope);
    // approximate signed distance to the oval
    const sd = (x, y) => {
      const px = x - cx, py = y - fy;
      const k0 = Math.hypot(px / rx, py / fry), k1 = Math.hypot(px / (rx * rx), py / (fry * fry));
      return (k0 * (k0 - 1)) / k1;
    };
    const rad = [0, 1, 2].map((j) => F.r * PHALANX_R[j] * 1.06 * (j === 2 ? 0.84 : 0.9));
    // does the finger from joint j on touch, with joint j at absolute angle a and the joints past it bent by 0.25?
    const touches = (j, x, y, a) => {
      for (let k = j; k < 3; k++, a += 0.25) {
        const dx = -Math.sin(a) * F.L[k], dy = -Math.cos(a) * F.L[k];
        for (let s = 0; s <= 6; s++) if (sd(x + (dx * s) / 6, y + (dy * s) / 6) < rad[k] * (1 - 0.07 * (s / 6)) - squeeze) return true;
        x += dx;
        y += dy;
      }
      return false;
    };
    const curl = [];
    let x = 0, y = F.y, base = 0;
    for (let j = 0; j < 3; j++) {
      let a = base + 0.15;
      while (a < base + 1.9 && !touches(j, x, y, a)) a += 0.005;
      curl.push(a - base);
      x -= Math.sin(a) * F.L[j];
      y -= Math.cos(a) * F.L[j];
      base = a;
    }
    return curl;
  });
}
// full-finger tactical gloves (tan synthetic, darker rubber knuckle guard / pads / strap) and an olive jacket
export const HAND_MAT = {
  glove: { region: WR.GLOVE, color: [1.3, 1.12, 0.88], mottle: 0.06 },
  finger: { region: WR.GLOVE, color: [1.25, 1.08, 0.85], mottle: 0.05 },
  trim: { region: WR.GLOVE, color: [0.5, 0.45, 0.4], mottle: 0.04 },
  tip: { region: WR.GLOVE, color: [0.66, 0.52, 0.4], mottle: 0.05 }, // reinforced fingertips / thumb tip
  sleeve: { region: WR.SLEEVE, color: [0.34, 0.36, 0.26], mottle: 0.1 },
  hem: { region: WR.SLEEVE, color: [0.27, 0.29, 0.2], mottle: 0.06 },
};
export const THUMB_MCP = [-0.012, -0.03, -0.034]; // thumb poses rotate about this joint

const _hx = new THREE.Vector3();
const _hy = new THREE.Vector3();
const _hz = new THREE.Vector3();
const _hm = new THREE.Matrix4();

/**
 * Capsule from a to b (radius r0 -> r1) with smooth hemispherical caps and analytic normals.
 * The cross-section X axis (scaled by o.sx) is aligned with n, e.g. the back of a finger.
 * o.cap0 / o.cap1: rings in the start / end cap (0 = open end). o.prof(t): radius multiplier along the length.
 */
function limb(mb, a, b, r0, r1, n, o = {}) {
  _hy.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _hy.length();
  _hy.divideScalar(len);
  _hx.set(n[0], n[1], n[2]);
  _hx.addScaledVector(_hy, -_hx.dot(_hy)).normalize();
  _hz.crossVectors(_hx, _hy);
  const cr0 = o.cap0 ?? 2, cr1 = o.cap1 ?? 2, cs = o.capScale ?? 1, hs = o.hs ?? 2;
  const pts = [];
  if (cr0 > 0) {
    for (let i = 0; i < cr0; i++) {
      const f = (i / cr0 - 1) * (PI / 2);
      pts.push(new THREE.Vector2(Math.cos(f) * r0, Math.sin(f) * r0 * cs));
    }
  }
  for (let i = 0; i <= hs; i++) {
    const t = i / hs;
    pts.push(new THREE.Vector2((r0 + (r1 - r0) * t) * (o.prof ? o.prof(t) : 1), len * t));
  }
  if (cr1 > 0) {
    for (let i = 1; i <= cr1; i++) {
      const f = (i / cr1) * (PI / 2);
      pts.push(new THREE.Vector2(Math.cos(f) * r1, len + Math.sin(f) * r1 * cs));
    }
  }
  const geo = new THREE.LatheGeometry(pts, o.rs || 10);
  if (o.sx || o.sz) geo.scale(o.sx || 1, 1, o.sz || 1);
  geo.applyMatrix4(_hm.makeBasis(_hx, _hy, _hz).setPosition(a[0], a[1], a[2]));
  return mb.geom(0, geo, { ...o, keepNormals: true });
}

/** Closed tube: fn(v, u, out) gives the surface point for v in [0,1] (along) and u in [0,1) (around). Ends should pinch to a point. */
function loft(mb, nv, nu, fn, o = {}) {
  const row = nu + 1;
  const pos = new Float32Array((nv + 1) * row * 3), uv = new Float32Array((nv + 1) * row * 2), idx = [];
  const P = new THREE.Vector3();
  for (let i = 0, k = 0; i <= nv; i++) {
    for (let j = 0; j <= nu; j++, k++) {
      fn(i / nv, (j % nu) / nu, P);
      pos[k * 3] = P.x;
      pos[k * 3 + 1] = P.y;
      pos[k * 3 + 2] = P.z;
      uv[k * 2] = j / nu;
      uv[k * 2 + 1] = i / nv;
    }
  }
  for (let i = 0; i < nv; i++) {
    for (let j = 0; j < nu; j++) {
      const a = i * row + j, c = a + row;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // weld the u seam, and give each pinched end ring one averaged normal
  const nr = geo.attributes.normal;
  for (let i = 0; i <= nv; i++) {
    const a = i * row, b = a + nu;
    _hx.fromBufferAttribute(nr, a).add(_hy.fromBufferAttribute(nr, b)).normalize();
    nr.setXYZ(a, _hx.x, _hx.y, _hx.z);
    nr.setXYZ(b, _hx.x, _hx.y, _hx.z);
  }
  for (const i of [0, nv]) {
    _hx.set(0, 0, 0);
    for (let j = 0; j < nu; j++) _hx.add(_hy.fromBufferAttribute(nr, i * row + j));
    _hx.normalize();
    for (let j = 0; j <= nu; j++) nr.setXYZ(i * row + j, _hx.x, _hx.y, _hx.z);
  }
  return mb.geom(0, geo, { ...o, keepNormals: true });
}

/**
 * One smooth tube through a chain of joints J[0..k] (a finger or the thumb): straight runs joined by rounded
 * fillets at the joints and a dome at each end, so a bent digit has no collar where its segments meet. r[i] / sx[i]:
 * radius and back-to-palm flattening at joint i; back[j]: the back of segment j; prof[j](t): radius multiplier
 * along segment j. u = 0 / 0.5 run down the digit's sides (where the glove texture's seams are). o.flank: contact
 * shadow on the sides facing the neighbouring digits (hand Z).
 */
function chainTube(mb, J, r, sx, back, prof, o = {}) {
  const k = J.length - 1;
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const P = J.map(V3), D = [], Ls = [], S0 = [0];
  for (let j = 0; j < k; j++) {
    const d = P[j + 1].clone().sub(P[j]);
    Ls.push(d.length());
    D.push(d.normalize());
    S0.push(S0[j] + Ls[j]);
  }
  const f = [0];
  for (let i = 1; i < k; i++) f.push(Math.min(0.35 * Ls[i - 1], 0.35 * Ls[i], 0.9 * r[i]));
  f.push(0);
  // centreline samples: position, tangent, back vector, arc position s (on the straight segments)
  const smp = [];
  const push = (c, t, b, s) => smp.push({ c, t: t.clone().normalize(), b: b.clone(), s });
  const bk = back.map(V3);
  for (let j = 0; j < k; j++) {
    const a = P[j].clone().addScaledVector(D[j], f[j]), e = P[j + 1].clone().addScaledVector(D[j], -f[j + 1]);
    const n = Math.max(2, Math.ceil(a.distanceTo(e) / 0.005));
    for (let q = j === 0 ? 0 : 1; q <= n; q++) {
      const t = q / n;
      push(a.clone().lerp(e, t), D[j], bk[j], S0[j] + f[j] + (Ls[j] - f[j] - f[j + 1]) * t);
    }
    if (j < k - 1) {
      // quadratic fillet from e through the joint to the start of the next run
      const g = P[j + 1].clone().addScaledVector(D[j + 1], f[j + 1]);
      for (let q = 1; q < 5; q++) {
        const t = q / 5, m = 1 - t;
        const c = e.clone().multiplyScalar(m * m).addScaledVector(P[j + 1], 2 * m * t).addScaledVector(g, t * t);
        const tg = P[j + 1].clone().sub(e).multiplyScalar(2 * m).addScaledVector(g.clone().sub(P[j + 1]), 2 * t);
        push(c, tg, bk[j].clone().lerp(bk[j + 1], t), S0[j + 1] + f[j + 1] * (2 * t - 1));
      }
    }
  }
  // radius / flattening at an arc position
  const at = (s) => {
    let j = 0;
    while (j < k - 1 && s > S0[j + 1]) j++;
    const t = Math.min(1, Math.max(0, (s - S0[j]) / Ls[j]));
    return [(r[j] + (r[j + 1] - r[j]) * t) * (prof[j] ? prof[j](t) : 1), sx[j] + (sx[j + 1] - sx[j]) * t];
  };
  // o.tip = { from, color }: the last `from` metres of the digit in another colour, edged by two close rings
  const sEnd = S0[k];
  if (o.tip) {
    const sb = sEnd - o.tip.from;
    const i = smp.findIndex((p) => p.s > sb);
    if (i > 0) {
      const a = smp[i - 1], b = smp[i];
      const mk = (s) => {
        const t = (s - a.s) / (b.s - a.s);
        return { c: a.c.clone().lerp(b.c, t), t: a.t.clone().lerp(b.t, t).normalize(), b: a.b.clone().lerp(b.b, t), s };
      };
      smp.splice(i, 0, mk(sb - 0.0002), mk(sb + 0.0002));
    }
  }
  for (const p of smp) [p.r, p.sx] = at(p.s);
  // domes: rings closing over each end
  const cap = (p, dir, rings) => {
    const out = [];
    for (let q = 1; q <= rings; q++) {
      const a = (q / rings) * (PI / 2);
      out.push({ ...p, c: p.c.clone().addScaledVector(p.t, dir * Math.sin(a) * p.r * (o.capScale ?? 0.85)), r: p.r * Math.cos(a) });
    }
    return out;
  };
  const rings = [...cap(smp[0], -1, 3).reverse(), ...smp, ...cap(smp[smp.length - 1], 1, o.tipRings ?? 4)];
  for (const p of rings) {
    p.b.addScaledVector(p.t, -p.b.dot(p.t)).normalize();
    p.l = new THREE.Vector3().crossVectors(p.b, p.t); // side
  }
  const nv = rings.length - 1, nu = o.rs || 12;
  const joints = S0.slice(1, k);
  const tipMul = o.tip && o.tip.color.map((c, i) => c / (o.color ? o.color[i] : 1));
  let vi = 0; // the builder tints the loft's vertices in order, ring by ring
  const tint = (Pt, N, C) => {
    const best = rings[Math.min(nv, Math.floor(vi++ / (nu + 1)))];
    if (tipMul && best.s > sEnd - o.tip.from) {
      C.r *= tipMul[0];
      C.g *= tipMul[1];
      C.b *= tipMul[2];
    }
    const bdot = N.dot(best.b);
    C.multiplyScalar(1 - 0.2 * Math.max(0, -bdot) - (o.flank ?? 0) * N.z * N.z);
    let dj = Infinity;
    for (const s of joints) dj = Math.min(dj, Math.abs(best.s - s));
    const kc = (1 - sstep(0.002, 0.008, dj)) * Math.max(0, bdot); // creases across the back of each joint
    C.multiplyScalar(1 - 0.16 * kc);
    C.r *= 1 + 0.06 * kc;
  };
  return loft(
    mb,
    nv,
    nu,
    (v, u, out) => {
      const p = rings[Math.round(v * nv)];
      const ph = u * 2 * PI, cs = Math.cos(ph), sn = Math.sin(ph);
      out.copy(p.c).addScaledVector(p.l, cs * p.r).addScaledVector(p.b, sn * p.r * p.sx);
    },
    { ...o, tint }
  );
}

/**
 * Palm/back of the hand as a loft along -Y (wrist -> knuckles). Superellipse cross-sections: rounder
 * across the back, flatter on the palm, with thenar/hypothenar pads near the heel. Both ends are domed.
 */
function palmSurface(S) {
  return (v, u, out) => {
    let e = 1;
    if (v < S.d0) e = Math.sqrt(Math.max(0, 1 - ((S.d0 - v) / S.d0) ** 2));
    else if (v > 1 - S.d1) e = Math.sqrt(Math.max(0, 1 - ((v - 1 + S.d1) / S.d1) ** 2));
    const hz = S.hz0 + (S.hz1 - S.hz0) * sstep(0, 0.75, v);
    const th = (u + 0.25) * 2 * PI, c = Math.cos(th), s = Math.sin(th); // u = 0 / 0.5 (the glove's seams) on the sides
    const back = c >= 0;
    const k = back ? 2 / 2.15 : 2 / 3.4;
    const ux = Math.sign(c) * Math.abs(c) ** k, uz = Math.sign(s) * Math.abs(s) ** k;
    let depth;
    if (back) {
      depth = S.xd0 + (S.xd1 - S.xd0) * v;
      if (S.tendon) {
        // the glove drapes over the four metacarpals: soft ridges fanning out from the wrist to the knuckles
        const z = uz * hz * e, w = sstep(0.2, 0.8, v) * (1 - sstep(0.92, 1, v));
        let rdg = 0;
        for (const F of FINGERS) rdg = Math.max(rdg, Math.exp(-(((z - F.z * (0.55 + 0.45 * v)) / 0.0058) ** 2)));
        depth += S.tendon * rdg * w * ux;
      }
    }
    else depth = S.xp0 + (S.xp1 - S.xp0) * v + (Math.max(0, -uz) * S.thenar + Math.max(0, uz) * S.hypo) * (1 - v) ** 0.7;
    out.set(S.cx + ux * depth * e, S.y0 + (S.y1 - S.y0) * v, S.cz + uz * hz * e);
  };
}

// cheap baked shading for hand parts: darker on the side facing away from n (palm side), creases near the joints,
// and (digits) contact shadow on the flanks that face the neighbouring fingers
function handShade(n, joints, flank = 0) {
  return (P, N, C) => {
    const back = N.x * n[0] + N.y * n[1] + N.z * n[2];
    C.multiplyScalar(1 - 0.2 * Math.max(0, -back) - flank * N.z * N.z);
    if (joints) {
      const [a, d, len] = joints;
      const t = ((P.x - a[0]) * d[0] + (P.y - a[1]) * d[1] + (P.z - a[2]) * d[2]) / len;
      const k = Math.max(1 - sstep(-0.05, 0.2, t), sstep(0.8, 1.05, t)) * Math.max(0, back);
      C.multiplyScalar(1 - 0.14 * k);
      C.r *= 1 + 0.06 * k;
    }
  };
}

const handGeoCache = new Map();
export function getHandGeo(poseName, style, side) {
  const key = poseName + ':' + style + ':' + side;
  let g = handGeoCache.get(key);
  if (g) return g;
  const pose = HAND_POSES[poseName];
  const claw = style === 'claw';
  const mb = new MeshBuilder({ skinned: false, atlas: claw ? 'char' : 'weapon' });
  mb.aoStrength = 0; // handShade bakes hand-space shading instead
  const skin = claw ? { region: CR.SKIN, color: [0.46, 0.5, 0.4], mottle: 0.25 } : HAND_MAT.finger; // digits
  const { glove, trim } = HAND_MAT;
  const bone = { region: CR.BONE, color: [0.12, 0.1, 0.09] };
  const palmMat = claw ? skin : glove;
  const BACK = [1, 0, 0];
  const shade = handShade(BACK);

  // palm + back of the hand (a zombie's is thinner, with the tendons showing)
  loft(
    mb,
    16,
    claw ? 20 : 32,
    palmSurface({
      y0: 0.004, y1: -0.097, d0: 0.12, d1: 0.16, cx: -0.002, cz: -0.001,
      hz0: 0.026, hz1: claw ? 0.038 : 0.0405,
      xd0: claw ? 0.011 : 0.0135, xd1: claw ? 0.0085 : 0.0105,
      xp0: claw ? 0.013 : 0.016, xp1: claw ? 0.011 : 0.0135,
      thenar: claw ? 0.003 : 0.006, hypo: claw ? 0.0015 : 0.0035, tendon: claw ? 0 : 0.0014,
    }),
    { ...palmMat, tint: shade }
  );
  // knuckles (metacarpal heads)
  for (const F of FINGERS) {
    if (claw) mb.ellip(0, [0.001, F.y + 0.001, F.z], [0.0086, 0.0086, 0.009], { ...skin, color: [0.54, 0.57, 0.47], ws: 8, hs: 6, tint: shade });
    else mb.ellip(0, [0.003, F.y + 0.001, F.z], [0.0098, 0.0092, 0.0094], { ...palmMat, ws: 8, hs: 5, keepNormals: true, tint: shade });
  }
  // wrist: a rounded mass around the joint that keeps it filled however far the hand bends
  // (the sleeve / glove cuff belongs to the forearm, see getArmGeos)
  // (keepNormals: the sphere's own normals, so a pole the wrist bend uncovers shades smoothly instead of dimpling)
  mb.ellip(0, [-0.001, -0.003, 0], claw ? [0.0185, 0.02, 0.0235] : [0.021, 0.021, 0.0275], { ...palmMat, ws: 14, hs: 8, keepNormals: true, tint: shade });
  if (claw) {
    // tendons fanning out to the knuckles
    for (const F of FINGERS) {
      mb.seg(0, [0.009, -0.012, F.z * 0.45], [0.0105, F.y + 0.008, F.z * 0.95], 0.0026, 0.0022, { ...skin, color: [0.52, 0.56, 0.46], rs: 5, hs: 1, caps: 1, capScale: 0.5, tint: shade });
    }
  } else {
    // knuckle guard: one moulded strip along the knuckle arc, raised over each knuckle, domed at the ends
    const z0 = FINGERS[0].z - 0.011, z1 = FINGERS[3].z + 0.009;
    const knY = (z) => {
      // knuckle line height, linear between the knuckles and carried on past the end ones
      let i = 0;
      while (i < 2 && z > FINGERS[i + 1].z) i++;
      const a = FINGERS[i], b = FINGERS[i + 1];
      return a.y + ((b.y - a.y) * (z - a.z)) / (b.z - a.z) + 0.0015;
    };
    loft(
      mb,
      22,
      12,
      (v, u, out) => {
        const z = z0 + (z1 - z0) * v;
        const s = Math.abs(2 * v - 1);
        const e = s < 0.82 ? 1 : Math.sqrt(Math.max(0, 1 - ((s - 0.82) / 0.18) ** 2));
        let b = 0;
        for (const F of FINGERS) b = Math.max(b, Math.exp(-(((z - F.z) / 0.0058) ** 2)));
        const w = (2 * (z - z0)) / (z1 - z0) - 1;
        const th = u * 2 * PI, c = Math.cos(th), sn = Math.sin(th);
        const ux = Math.sign(c) * Math.abs(c) ** 0.6, uy = Math.sign(sn) * Math.abs(sn) ** 0.6;
        out.set(0.0108 + 0.0009 * b - 0.0035 * w * w + ux * (0.0024 + 0.0007 * b) * e, knY(z) + uy * (0.0064 + 0.0004 * b) * e, z);
      },
      { ...trim, tint: shade }
    );
  }

  // fingers: three phalanges each, curled toward the palm (-X) by the pose
  const rnd = mulberry32(side > 0 ? 11 : 12);
  for (let i = 0; i < 4; i++) {
    const F = FINGERS[i];
    const cz = pose.curl[i];
    const spread = pose.spreads ? pose.spreads[i] : (i - 1.5) * pose.spread;
    const L = claw ? F.L.map((l) => l * 1.22) : F.L;
    let p = [0.0, F.y, F.z];
    let ang = 0;
    const J = [p], backs = []; // glove: the joints, for one smooth tube down the finger (chainTube)
    for (let j = 0; j < 3; j++) {
      ang += cz[j] + (claw ? (rnd() - 0.5) * 0.15 : 0);
      const dl = Math.sqrt(1 + spread * spread);
      const d = [-Math.sin(ang) / dl, -Math.cos(ang) / dl, spread / dl];
      const n = [Math.cos(ang), -Math.sin(ang), 0]; // back of this phalanx
      const q = [p[0] + d[0] * L[j], p[1] + d[1] * L[j], p[2] + d[2] * L[j]];
      const r0 = F.r * PHALANX_R[j] * (claw ? 0.8 : 1.06);
      const r1 = r0 * (j === 2 ? 0.88 : 0.93);
      J.push(q);
      backs.push(n);
      if (claw) {
        limb(mb, p, q, r0, r1, n, {
          ...skin,
          rs: 8,
          hs: 2,
          cap1: j === 2 ? 3 : 2,
          sx: j === 2 ? 0.84 : 0.9,
          prof: (t) => 1 - 0.16 * Math.sin(PI * t), // joints stand out
          tint: handShade(n, [p, d, L[j]], 0),
        });
      }
      if (j === 0 && !claw) {
        // padded strip across the back of the first knuckle
        const c = [p[0] + d[0] * L[0] * 0.55 + n[0] * r0 * 0.72, p[1] + d[1] * L[0] * 0.55 + n[1] * r0 * 0.72, p[2] + d[2] * L[0] * 0.55];
        limb(mb, [c[0] - d[0] * 0.009, c[1] - d[1] * 0.009, c[2] - d[2] * 0.009], [c[0] + d[0] * 0.009, c[1] + d[1] * 0.009, c[2] + d[2] * 0.009], r0 * 0.62, r0 * 0.6, n, { ...trim, rs: 6, hs: 1, sx: 0.55, capScale: 0.6, tint: handShade(n) });
      }
      if (j === 2) {
        if (claw) {
          // hooked claw growing out of the nail bed, curling toward the palm side
          const b0 = [p[0] + d[0] * L[2] * 0.45 + n[0] * r0 * 0.45, p[1] + d[1] * L[2] * 0.45 + n[1] * r0 * 0.45, p[2] + d[2] * L[2] * 0.45];
          const mid = [q[0] + d[0] * 0.03 + n[0] * 0.001, q[1] + d[1] * 0.03 + n[1] * 0.001, q[2] + d[2] * 0.03];
          const tip = [mid[0] + d[0] * 0.024 - n[0] * 0.016, mid[1] + d[1] * 0.024 - n[1] * 0.016, mid[2] + d[2] * 0.024];
          limb(mb, b0, mid, 0.0062, 0.0046, n, { ...bone, rs: 6, hs: 1, sx: 0.6, capScale: 0.4 });
          mb.spike(0, mid, tip, 0.0045, { ...bone, color: [0.1, 0.085, 0.075], rs: 6 });
        }
      }
      p = q;
    }
    if (!claw) {
      // radii at the knuckle, the two finger joints (a little proud) and the tip
      const rr = PHALANX_R.map((k) => F.r * k * 1.06);
      chainTube(mb, J, [rr[0], rr[0] * 0.95, rr[1] * 0.95, rr[2] * 0.88], [0.9, 0.9, 0.87, 0.84], backs, [0, 1, 2].map(() => (t) => 1 - 0.04 * Math.sin(PI * t)), { ...skin, flank: 0.3, rs: 10, tipRings: 3, tip: { from: L[2] * 0.5, color: HAND_MAT.tip.color } }); // reinforced fingertip
    }
  }

  // thumb: metacarpal (with the thenar pad) from the heel of the hand to its MCP joint (pose.tmcp, THUMB_MCP by
  // default), then two phalanges; tb = the back of the thumb
  {
    const c0 = [-0.004, -0.004, -0.019];
    const tm = pose.tmcp || THUMB_MCP;
    const tb = pose.tback || [0.5, 0, -0.85];
    if (pose.tmcp) {
      // thumb swung round a grip: the thenar pad lies along the metacarpal on its palm side, poles buried in it
      _hy.set(tm[0] - c0[0], tm[1] - c0[1], tm[2] - c0[2]);
      const len = _hy.length();
      _hy.divideScalar(len);
      _hx.set(tb[0], tb[1], tb[2]);
      _hx.addScaledVector(_hy, -_hx.dot(_hy)).normalize();
      _hz.crossVectors(_hx, _hy);
      const q = new THREE.Quaternion().setFromRotationMatrix(_hm.makeBasis(_hx, _hy, _hz));
      const c = [0, 1, 2].map((k) => c0[k] + (tm[k] - c0[k]) * 0.42 - [_hx.x, _hx.y, _hx.z][k] * 0.004);
      mb.ellip(0, c, [0.0108, len * 0.42, 0.0128], { ...palmMat, ws: 12, hs: 8, q, keepNormals: true, tint: shade });
    } else mb.ellip(0, [-0.0145, -0.029, -0.017], [0.0095, 0.021, 0.0125], { ...palmMat, ws: 10, hs: 6, rot: [0.52, 0, 0], keepNormals: true, tint: shade });
    const L = claw ? [0.04, 0.034] : pose.thumbL || [0.036, 0.03];
    const tj = [tm];
    for (let j = 0; j < 2; j++) {
      const t = pose.thumb[j], l = Math.hypot(t[0], t[1], t[2]), p = tj[j];
      tj.push([p[0] + (t[0] / l) * L[j], p[1] + (t[1] / l) * L[j], p[2] + (t[2] / l) * L[j]]);
    }
    if (!claw) {
      // glove: metacarpal and both phalanges as one smooth tube; the tip segment swells over the pad, and its last
      // 60 % is the reinforced tip
      chainTube(mb, [c0, ...tj], [0.0136, 0.0115, 0.0108, 0.0096], [0.85, 0.88, 0.87, 0.84], [tb, tb, tb], [null, (s) => 1 - 0.04 * Math.sin(PI * s), (s) => 1 + 0.07 * Math.sin(PI * Math.min(1, s * 1.25))], { ...skin, rs: 12, tipRings: 4, tip: { from: L[1] * 0.6, color: HAND_MAT.tip.color } });
    } else {
      limb(mb, c0, tm, 0.0145, 0.0112, tb, { ...palmMat, rs: 10, hs: 1, sx: 0.85, tint: shade });
      const R = [
        [0.0118, 0.0108],
        [0.0108, 0.0096],
      ];
      for (let j = 0; j < 2; j++) {
        const p = tj[j], q = tj[j + 1];
        const d = [0, 1, 2].map((k) => (q[k] - p[k]) / L[j]);
        limb(mb, p, q, R[j][0] * 0.82, R[j][1] * 0.82, tb, { ...skin, rs: 8, hs: 2, cap1: j === 1 ? 3 : 2, sx: j === 1 ? 0.84 : 0.9, prof: (s) => 1 - 0.14 * Math.sin(PI * s), tint: handShade(tb, [p, d, L[j]]) });
        if (j === 1) mb.spike(0, q, [q[0] + d[0] * 0.03, q[1] + d[1] * 0.03, q[2] + d[2] * 0.03], 0.0065, { ...bone, color: [0.1, 0.085, 0.075], rs: 6 });
      }
    }
  }
  if (claw) {
    mb.blood([-0.02, -0.1, 0.0], 0.05, 0.9);
    mb.blood([0.01, -0.03, 0.02], 0.03, 0.6);
  }
  g = mb.build().geometry;
  if (side < 0) mirrorX(g);
  handGeoCache.set(key, g);
  return g;
}

export const ARM_L1 = 0.34, ARM_L2 = 0.3;
const armGeoCache = new Map();
function getArmGeos(style, side) {
  const key = style + ':' + side;
  let g = armGeoCache.get(key);
  if (g) return g;
  const claw = style === 'claw';
  const sleeve = claw ? { region: CR.CLOTH, color: [0.24, 0.23, 0.2], mottle: 0.2 } : HAND_MAT.sleeve;
  const hem = HAND_MAT.hem;
  const skin = { region: CR.SKIN, color: [0.5, 0.54, 0.44], mottle: 0.25 };
  // upper arm (shoulder local, along -Y)
  const up = new MeshBuilder({ skinned: false, atlas: claw ? 'char' : 'weapon' });
  up.seg(0, [0, 0.05, 0], [0, -ARM_L1 - 0.02, 0], 0.06, 0.05, { ...sleeve, rs: 10, hs: 3, caps: 2, noise: 0.004, nf: 25, tear: claw ? { amt: 0.36, f: 30, seed: 3 } : null });
  if (claw) up.seg(0, [0, 0.04, 0], [0, -ARM_L1, 0], 0.042, 0.036, { ...skin, rs: 8, hs: 2, caps: 1 });
  // forearm (elbow local)
  const fo = new MeshBuilder({ skinned: false, atlas: claw ? 'char' : 'weapon' });
  if (!claw) {
    // jacket sleeve tapering to a turned-back hem; the glove's gauntlet runs from under it to the wrist
    const W = -ARM_L2;
    fo.seg(0, [0, 0.03, 0], [0, W + 0.1, 0], 0.047, 0.041, { ...sleeve, rs: 14, hs: 4, caps: 2, capScale: 0.3, noise: 0.0015, nf: 30 });
    limb(fo, [0, W + 0.112, 0], [0, W + 0.094, 0], 0.0425, 0.0418, [1, 0, 0], { ...hem, rs: 14, hs: 1, cap0: 1, cap1: 2, capScale: 0.45 });
    const shade = handShade([1, 0, 0]);
    // gauntlet (X = back of the hand, see VMArm.orient); its rounded end tucks around the hand's wrist. Its cross-
    // section is set up from Z (n = [0, 0, 1], so sx is across the wrist and sz back to palm), which puts the glove
    // texture's seams on the back and palm sides rather than along the top the camera looks down at
    limb(fo, [0, W + 0.1, 0], [0, W - 0.002, 0], 0.031, 0.027, [0, 0, 1], { ...HAND_MAT.glove, rs: 14, hs: 3, sx: 1.06, sz: 0.84, cap0: 0, cap1: 3, capScale: 0.25, ao: false, tint: shade, prof: (t) => 1 + 0.03 * Math.sin(PI * t) });
    // velcro strap and tab around the cuff
    limb(fo, [0, W + 0.047, 0], [0, W + 0.027, 0], 0.0299, 0.0291, [0, 0, 1], { ...HAND_MAT.trim, rs: 14, hs: 1, sx: 1.07, sz: 0.85, cap0: 1, cap1: 1, capScale: 0.25, ao: false, tint: shade });
    fo.box(0, [0.0262, W + 0.037, 0.004], [0.0045, 0.02, 0.03], {
      ...HAND_MAT.trim,
      round: 0.5,
      seg: 2,
      shape: (p) => {
        p.x -= (p.z / 0.015) ** 2 * 0.0028;
      },
      ao: false,
      tint: shade,
    });
  } else {
    // torn sleeve near the elbow, gaunt pale forearm with tendons
    fo.seg(0, [0, 0.03, 0], [0, -0.13, 0], 0.05, 0.046, { ...sleeve, rs: 10, hs: 3, caps: 0, noise: 0.006, nf: 30, tear: { amt: 0.42, f: 40, seed: 5, fn: (x, y) => y < -0.09 && fbm3(x * 80, 0, 0, 1, 3) > 0.5 } });
    fo.seg(0, [0, 0.03, 0], [0, -ARM_L2 + 0.004, 0], 0.036, 0.023, { ...skin, rs: 8, hs: 4, caps: 1, sx: 0.88, sz: 1.1, noise: 0.003, nf: 60 });
    for (const s of [-1, 1]) fo.seg(0, [s * 0.012, -0.05, -0.02], [s * 0.01, -ARM_L2 + 0.03, -0.012], 0.005, 0.004, { ...skin, color: [0.5, 0.55, 0.45], rs: 4, hs: 1 });
    fo.blood([0, -0.2, -0.03], 0.06, 1);
    fo.blood([0.03, -0.08, 0], 0.04, 0.8);
  }
  const ug = up.build().geometry, fg = fo.build().geometry;
  if (side < 0) {
    mirrorX(ug);
    mirrorX(fg);
  }
  g = { upper: ug, fore: fg };
  armGeoCache.set(key, g);
  return g;
}

export class VMArm {
  constructor(side) {
    this.side = side;
    this.shoulder = new THREE.Object3D();
    this.elbow = new THREE.Object3D();
    this.wrist = new THREE.Object3D();
    this.elbow.position.set(0, -ARM_L1, 0);
    this.wrist.position.set(0, -ARM_L2, 0);
    this.shoulder.add(this.elbow);
    this.elbow.add(this.wrist);
    this.sets = {};
    for (const style of ['normal', 'claw']) {
      const mat = style === 'claw' ? getViewCharMaterial() : getViewArmMaterial();
      const ag = getArmGeos(style, side);
      const upper = new THREE.Mesh(ag.upper, mat);
      const fore = new THREE.Mesh(ag.fore, mat);
      this.shoulder.add(upper);
      this.elbow.add(fore);
      this.sets[style] = { upper, fore, hands: {}, mat };
      for (const m of [upper, fore]) {
        m.frustumCulled = false;
        m.renderOrder = 1;
      }
      // the poses every item shares; the rest (fitted to one item each) are built the first time they are shown
      for (const p of style === 'claw' ? ['claw', 'open'] : ['grip', 'trigger', 'cup', 'support', 'pinch', 'open']) this.hand(style, p);
    }
    this.style = 'normal';
    this.pose = 'grip';
    this.visible = true;
    this.applyVis();
  }
  /** the mesh of a hand pose in a style, built on first use */
  hand(style, p) {
    const s = this.sets[style];
    let h = s.hands[p];
    if (!h && HAND_POSES[p]) {
      h = s.hands[p] = new THREE.Mesh(getHandGeo(p, style === 'claw' ? 'claw' : 'glove', this.side), s.mat);
      h.visible = false;
      h.frustumCulled = false;
      h.renderOrder = 1;
      this.wrist.add(h);
    }
    return h;
  }
  setStyle(style) {
    if (style !== this.style) {
      this.style = style;
      this.applyVis();
    }
  }
  setPose(p) {
    if (p !== this.pose) {
      this.pose = p;
      this.applyVis();
    }
  }
  setVisible(v) {
    if (v !== this.visible) {
      this.visible = v;
      this.applyVis();
    }
  }
  applyVis() {
    for (const style in this.sets) {
      const s = this.sets[style];
      const on = this.visible && style === this.style;
      s.upper.visible = on;
      s.fore.visible = on;
      if (on && style === 'normal') this.hand(style, this.pose);
      for (const p in s.hands) s.hands[p].visible = on && p === this.pose;
    }
    if (this.style === 'claw' && !this.sets.claw.hands[this.pose] && this.visible) this.sets.claw.hands.claw.visible = true;
  }
  gripCenter(out, poseName = this.pose) {
    const pose = HAND_POSES[this.style === 'claw' ? (poseName === 'open' ? 'open' : 'claw') : poseName] || HAND_POSES.grip;
    return out.set(pose.center[0] * this.side, pose.center[1], pose.center[2]);
  }
  /**
   * Apply solved upper-arm (qU, in shoulder-parent space) and elbow (qL) rotations plus the hand orientation.
   * The forearm rolls about its own axis with the hand (pronation), so the wrist only bends and the oval
   * wrist, glove cuff and forearm stay lined up.
   */
  orient(qU, qL, handQ) {
    this.shoulder.quaternion.copy(qU);
    _armW.copy(qU).multiply(qL).invert().multiply(handQ); // wrist relative to the unrolled forearm
    const l = Math.hypot(_armW.y, _armW.w);
    if (l > 1e-6) _armT.set(0, _armW.y / l, 0, _armW.w / l);
    else _armT.identity();
    this.elbow.quaternion.copy(qL).multiply(_armT);
    this.wrist.quaternion.copy(_armT.invert().multiply(_armW));
  }
}
const _armW = new THREE.Quaternion();
const _armT = new THREE.Quaternion();

