// Nunchucks
// One handle, in weapon space: the hand's grip at the origin, the wood from its butt at +Z to its chain end at -Z,
// then the steel cap, the swivel and its eye (the chain's first link runs through it, NK_GEOM.eye past the wood).
// Octagonal hardwood, 30 cm, thicker at the butt, oiled dark and worn pale where hands and blows have been at it,
// friction tape round the grip. Both handles are this one shape (shared/nunchaku.js: NK_GEOM).
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { NK_GEOM, NK_CHAIN } from '../../../../shared/nunchaku.js';
import { WR } from '../charTextures.js';
import { mulberry32, fbm3 } from '../skinning.js';
import { PI, latheZ, M, facetLoft, sstep, Q, PartSet, finishParts } from './parts.js';

const NK_OCT = 8;
const nkR = (z) => {
  // the wood's radius (to its corners) along its length: a straight taper, eased in at both ends
  const { handle, grip, rTop, rButt } = NK_GEOM;
  const t = Math.min(1, Math.max(0, (z + grip) / handle)); // 0 at the chain end .. 1 at the butt
  return (rTop + (rButt - rTop) * t) * (1 - 0.12 * Math.max(0, 1 - (1 - t) / 0.02) ** 2 - 0.05 * Math.max(0, 1 - t / 0.015) ** 2);
};
function nkRing(z, r) {
  const ring = [];
  for (let k = 0; k < NK_OCT; k++) {
    const a = ((k + 0.5) / NK_OCT) * PI * 2; // (anticlockwise seen from +Z: facetLoft's faces then point out)
    ring.push([Math.cos(a) * r, Math.sin(a) * r, z]);
  }
  return ring;
}
const _nkPale = new THREE.Color(0.92, 0.78, 0.58);
function nunchakuHandle(B, hi, at = null) {
  const { handle, grip, eye, rTop } = NK_GEOM;
  const Z0 = -grip, Z1 = handle - grip; // chain end .. butt
  const mark = B.parts.length;
  // the wood: two turned grooves below the cap
  const grooves = hi ? [Z0 + 0.03, Z0 + 0.037] : [];
  const rings = [];
  const N = hi ? 40 : 8;
  for (let i = 0; i <= N; i++) {
    const z = Z0 + ((Z1 - Z0) * i) / N;
    let r = nkR(z);
    for (const g of grooves) r -= 0.0007 * Math.max(0, 1 - Math.abs(z - g) / 0.0035);
    rings.push(nkRing(z, r));
  }
  const rnd = mulberry32(57);
  const faceTone = Array.from({ length: NK_OCT }, () => 0.92 + rnd() * 0.16);
  const wood = (k) => ({
    region: WR.ASH,
    color: [0.74 * faceTone[k], 0.5 * faceTone[k], 0.33 * faceTone[k]],
    mottle: 0.07,
    tint: (p, n, c) => {
      if (!hi) return;
      // long dark streaks of grain, dents toward the butt (the striking end), the butt and the chain end rubbed pale
      const g = fbm3(p.x * 180 + k * 3.1, p.y * 180, p.z * 14, 3, 11);
      c.multiplyScalar(0.8 + 0.4 * g);
      const dent = fbm3(p.x * 90, p.y * 90, p.z * 90, 2, 23);
      if (p.z > 0.02 && dent > 0.62) c.multiplyScalar(1 - Math.min(0.5, (dent - 0.62) * 3));
      const worn = sstep(0.06, 0.1, p.z) * 0.22 + (1 - sstep(Z0 + 0.02, Z0 + 0.06, p.z)) * 0.1;
      c.lerp(_nkPale, worn * (0.5 + 0.5 * g));
      if (grooves.some((gz) => Math.abs(p.z - gz) < 0.002)) c.multiplyScalar(0.45);
    },
  });
  facetLoft(B, rings, Array.from({ length: NK_OCT }, (_, k) => wood(k)));
  // the butt: closed with a shallow dome of end grain
  latheZ(B, [[0, -Z1 - 0.0022], [nkR(Z1) * 0.6, -Z1 - 0.0016], [nkR(Z1) * 0.93, -Z1 + 0.0004], [nkR(Z1) * 0.93, -Z1 + 0.004], [0, -Z1 + 0.004]], 0, 0, { region: WR.ASH, color: [0.6, 0.42, 0.28], mottle: 0.1, rs: NK_OCT, sharp: true });
  // friction tape round the grip: wound on in turns, each lapping the last
  const T0 = -0.058, T1 = 0.072, turns = hi ? 13 : 1, TN = turns * (hi ? 3 : 1);
  const trings = [];
  for (let i = 0; i <= TN; i++) {
    const f = i / TN;
    const z = T0 + (T1 - T0) * f;
    const lap = hi && (f * turns) % 1 < 0.34 ? 0.00035 : 0;
    const endIn = i === 0 || i === TN ? -0.0009 : 0; // (the two ends turned in under the wood's surface: closed)
    trings.push(nkRing(z, nkR(z) + 0.0007 + lap + endIn));
  }
  const tape = {
    ...M.tape,
    color: [0.3, 0.3, 0.31],
    mottle: 0.09,
    tint: (p, n, c) => {
      if (!hi) return;
      const f = (((p.z - T0) / (T1 - T0)) * turns) % 1;
      if (f < 0.34) c.multiplyScalar(1.18);
      if (f > 0.9) c.multiplyScalar(0.7);
      c.multiplyScalar(0.85 + 0.3 * fbm3(p.x * 300, p.y * 300, p.z * 120, 2, 5));
    },
  };
  facetLoft(B, trings, Array.from({ length: NK_OCT }, () => tape));
  // the cap: a steel ferrule over the end of the wood, a domed top, the swivel's post and ball, and the eye
  const F0 = -Z0 - 0.013, F1 = -Z0; // (as distances forward, for latheZ)
  const rf = rTop + 0.0009;
  latheZ(B, [[0, F0], [rf, F0], [rf, F1 - 0.0012], [rf - 0.0012, F1 + 0.0008], [rf * 0.55, F1 + 0.003], [0.0034, F1 + 0.0036], [0.003, F1 + 0.0066], [0.0044, F1 + 0.0078], [0.0044, F1 + 0.0098], [0.0026, F1 + 0.0112], [0, F1 + 0.0112]], 0, 0, { ...M.steel, color: [0.82, 0.83, 0.86], mottle: 0.08, rs: hi ? 14 : 8, sharp: true });
  // (the eye: a ring standing on the ball, its hole across the handle's X axis)
  const ring = new THREE.TorusGeometry(0.0038, 0.00135, hi ? 7 : 5, hi ? 14 : 8);
  ring.rotateY(PI / 2);
  ring.translate(0, 0, Z0 - eye);
  B.geom(0, ring, { ...M.steel, color: [0.9, 0.9, 0.94], mottle: 0.05 });
  if (at) for (let i = mark; i < B.parts.length; i++) B.parts[i].geo.applyMatrix4(at);
}
// One link of the chain, in its own space: its two ends (where the next links bear on it) at z = -+link/2, lying in
// the YZ plane. Welded steel, 3.2 mm wire.
const NK_WIRE = 0.0016;
function nunchakuLink(B, hi, at = null) {
  const Rw = 0.0042, half = NK_GEOM.link / 2 + NK_WIRE - Rw;
  const g = new THREE.TorusGeometry(Rw, NK_WIRE, hi ? 7 : 5, hi ? 16 : 10);
  g.rotateY(PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getZ(i) > 1e-6 ? half : p.getZ(i) < -1e-6 ? -half : 0));
  if (at) g.applyMatrix4(at);
  B.geom(0, g, { ...M.steel, color: [0.95, 0.95, 1.0], mottle: 0.08 });
}
// The chain's joints for the model that is not simulated (lying on the ground): the two handles side by side, the
// chain in a loop between their eyes.
const NK_FOLD = 0.036;
function nkFoldJoints() {
  const n = NK_GEOM.links, a = NK_FOLD / 2;
  // half an ellipse of the chain's length over that chord: its depth by bisection, then points an equal way apart
  const perim = (b) => (PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))) / 2;
  let lo = 0.001, up = 0.2;
  for (let i = 0; i < 40; i++) {
    const m = (lo + up) / 2;
    if (perim(m) < NK_CHAIN) lo = m;
    else up = m;
  }
  const b = (lo + up) / 2, S = 800, pts = [];
  let acc = 0, next = 0, prev = [0, 0];
  for (let i = 0; i <= S; i++) {
    const t = (i / S) * PI, q = [a - a * Math.cos(t), -b * Math.sin(t)];
    if (i) acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    while (pts.length <= n && acc >= next - 1e-9) {
      pts.push(q);
      next += NK_CHAIN / n;
    }
    prev = q;
  }
  while (pts.length <= n) pts.push([NK_FOLD, 0]);
  pts[n] = [NK_FOLD, 0];
  const z0 = -NK_GEOM.grip - NK_GEOM.eye;
  return pts.map(([x, z]) => new THREE.Vector3(x, 0, z0 + z));
}
function buildNunchaku(P) {
  const hi = P.hi;
  const B = P.get('body');
  nunchakuHandle(B, hi);
  P.meta.muzzle = null;
  if (P.split) return; // the first-person view draws the other handle and the chain itself, from the simulation
  nunchakuHandle(B, hi, new THREE.Matrix4().makeRotationZ(PI / NK_OCT).setPosition(NK_FOLD, 0, 0));
  const J = nkFoldJoints();
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < J.length - 1; i++) {
    const d = new THREE.Vector3().subVectors(J[i + 1], J[i]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(zAxis, d);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, i % 2 ? 0 : PI / 2));
    nunchakuLink(B, hi, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(J[i], J[i + 1]).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  }
}
/** The parts both views draw the simulated half from: { handle, link } geometries (hi: the first-person detail). */
const nkGeoCache = new Map();
export function getNunchakuGeo(hi) {
  let g = nkGeoCache.get(!!hi);
  if (!g) {
    const P = new PartSet(true, !!hi);
    nunchakuHandle(P.get('handle'), !!hi);
    nunchakuLink(P.get('link'), !!hi);
    const parts = finishParts(P);
    g = { handle: parts.handle.geometry, link: parts.link.geometry, tris: parts.handle.tris * 2 + NK_GEOM.links * parts.link.tris };
    nkGeoCache.set(!!hi, g);
  }
  return g;
}

export default {
  id: ITEM.NUNCHAKU,
  build: buildNunchaku,
  // nunchucks: no one pose and no one swing. Both hands, a chain and a free handle that are simulated, and a moveset:
  // all of it is models/nunchaku.js (ViewModel._updateNunchaku puts its hands and handles where that says)
  vm: { kind: 'melee', nunchaku: true, hip: [0.147, -0.262, -0.4, 0.9, 0.4, 0.0], rPose: 'nkGrip', rGrip: { p: [0, 0, 0], q: Q(0, 0, 0) }, lGrip: { p: [0, 0, 0], q: Q(0, 0, 0), pose: 'nkGrip' }, sprint: [0, 0, 0, 0, 0, 0] },
  // a fist fitted to the taped octagon (clip:fit; either hand - the handle is the same either way round), the same
  // hand eased open to take a catch, and loosened to let the handle turn in it through the whirl (the index finger
  // and thumb keep it, the other fingers ride it). models/nunchaku.js names them
  poses: {
    nkGrip: { curl: [[0.83, 1.34, 0.93], [0.86, 1.44, 1], [0.81, 1.39, 0.96], [0.74, 1.08, 0.75]], spread: 0, thumb: [[-0.7, -0.71, -0.09], [-0.84, -0.5, -0.22]], center: [-0.0313, -0.083, 0] },
    nkHalf: { curl: [[0.5, 0.8, 0.5], [0.52, 0.85, 0.55], [0.5, 0.8, 0.5], [0.5, 0.7, 0.45]], spread: 0.03, thumb: [[-0.55, -0.6, -0.58], [-0.4, -0.75, -0.5]], center: [-0.0313, -0.083, 0] },
    nkSpin: { curl: [[0.83, 1.34, 0.93], [0.84, 1.4, 0.96], [0.76, 1.3, 0.9], [0.66, 0.98, 0.68]], spread: 0.01, thumb: [[-0.7, -0.71, -0.09], [-0.84, -0.5, -0.22]], center: [-0.0313, -0.083, 0] },
  },
};
