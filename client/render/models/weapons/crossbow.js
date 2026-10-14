// Crossbow (scrap-built: plank tiller, leaf-spring prod, rope string)
// Modelled latched with a bolt on the rail. The viewmodel swings the two limbs about their roots and re-aims
// the two string halves (unit-length parts) every frame; meta.xbow carries what it needs for that.
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { PI, profile, latheZ, cylZ, plateY, boxR, M, R, gunGrip, supportGrip, trigger, triggerGuard } from './parts.js';

function buildCrossbow(P) {
  const hi = P.hi;
  const B = P.get('body');
  const O = [0, -0.035, -0.058]; // authored like the shotguns: stock wrist -> grip origin
  const RAIL = 0.066; // top of the tiller, where the bolt lies
  const SY = RAIL + 0.002; // the string rides just above it
  const PROD = -0.47; // z of the limb roots
  const LATCHED = 0.72, FLEX = 0.5, LIMB = 0.27, CURL = 0.03; // limb sweep (rad) when latched, how far it springs forward, length, recurve
  // tiller: butt, wrist and a long fore-end cut from one plank, slimmer ahead of the trigger
  profile(B, [
    [0.5, RAIL], [0.16, RAIL], [0.09, RAIL], [-0.03, RAIL], [-0.085, 0.056], [-0.37, 0.03], [-0.37, -0.108], [-0.3, -0.085], [-0.2, -0.062],
    [-0.12, -0.035], [-0.075, -0.012], [-0.045, 0.006], [-0.03, 0.016], [0.09, 0.02], [0.16, 0.028], [0.44, 0.034], [0.5, 0.042],
  ], 0.038, { ...M.walnut, color: [1.2, 1.14, 1.04], bevel: 0.004, curveSegs: 4, widthFn: (f) => (f > 0.12 ? 0.8 : 1) });
  profile(B, [[-0.37, 0.032], [-0.386, 0.032], [-0.386, -0.11], [-0.37, -0.11]], 0.04, { ...M.tape, bevel: 0.003 }); // taped butt
  if (hi) {
    boxR(B, -0.0035, 0.0035, RAIL, RAIL + 0.0006, -0.17, -0.5, M.black); // bolt groove
    for (const z of [-0.2, -0.36]) boxR(B, -0.0157, 0.0157, 0.03, RAIL - 0.004, z, z - 0.014, M.tape); // tape wraps
  }
  // trigger plate, strap guard, trigger
  boxR(B, -0.008, 0.008, 0.006, 0.02, 0.02, -0.075, M.gun);
  triggerGuard(B, hi, [[0, 0.008, 0.012], [0, -0.014, 0.004], [0, -0.018, -0.03], [0, -0.008, -0.062], [0, 0.008, -0.07]], 0.0032, M.gun);
  trigger(B, [[0, 0.008, -0.024], [0, -0.006, -0.028], [0, -0.012, -0.022]]);
  // prod bracket, rope lashing (clear of the rail), stirrup
  boxR(B, -0.028, 0.028, 0.04, RAIL - 0.001, PROD + 0.016, PROD - 0.016, M.gun);
  const rope = { region: WR.RAG, color: [0.72, 0.6, 0.4], mottle: 0.08 };
  for (const z of [PROD + 0.03, PROD - 0.018]) boxR(B, -0.0172, 0.0172, 0.03, RAIL - 0.005, z, z - 0.012, rope);
  B.tube(0, [[-0.03, 0.05, -0.495], [-0.04, 0.05, -0.55], [0, 0.05, -0.585], [0.04, 0.05, -0.55], [0.03, 0.05, -0.495]], 0.004, 0.004, { ...M.rust, rs: 5, ts: R(hi, 14, 8), cap: false });
  // limb tip (right, relative to its root) for a sweep angle: out along the limb, curled toward the front
  const tipAt = (b) => [LIMB * Math.cos(b) + CURL * Math.sin(b), LIMB * Math.sin(b) - CURL * Math.cos(b)];
  const [tx, tz] = tipAt(LATCHED);
  const [rx] = tipAt(LATCHED - FLEX);
  const ROOT = 0.022;
  const half = ROOT + rx; // the string is straight at rest: half its length = how far out the tips are
  const nock = PROD + tz + Math.sqrt(half * half - (ROOT + tx) * (ROOT + tx)); // latched: the string meets the latch here
  // latch: two cheeks, the nut between them, rear sight notch on a bridge
  for (const s of [-1, 1]) boxR(B, s * 0.0105, s * 0.016, RAIL - 0.004, RAIL + 0.016, nock + 0.05, nock + 0.004, M.gun);
  B.seg(0, [-0.0105, RAIL + 0.004, nock + 0.008], [0.0105, RAIL + 0.004, nock + 0.008], 0.007, 0.007, { ...M.steel, rs: R(hi, 10, 6), hs: 1 });
  boxR(B, -0.016, 0.016, RAIL + 0.016, RAIL + 0.021, nock + 0.05, nock + 0.03, M.gun);
  for (const s of [-1, 1]) boxR(B, s * 0.0018, s * 0.008, RAIL + 0.021, RAIL + 0.031, nock + 0.047, nock + 0.041, M.gunDark);
  // front sight: a wire arch over the bolt, ahead of the string at rest, with a pin on top
  for (const s of [-1, 1]) boxR(B, s * 0.0152, s * 0.018, RAIL - 0.012, RAIL + 0.025, PROD + 0.017, PROD + 0.011, M.gunDark);
  boxR(B, -0.018, 0.018, RAIL + 0.022, RAIL + 0.025, PROD + 0.017, PROD + 0.011, M.gunDark);
  boxR(B, -0.0012, 0.0012, RAIL + 0.025, RAIL + 0.0295, PROD + 0.0155, PROD + 0.0125, M.gunDark);
  // limbs: tapered leaf springs, one part each so they can flex about the root
  const spring = { ...M.steel, color: [0.72, 0.68, 0.62], mottle: 0.12 };
  const N = hi ? 7 : 4;
  for (const s of [1, -1]) {
    const L = P.get(s > 0 ? 'limbR' : 'limbL');
    const ca = Math.cos(LATCHED), sa = Math.sin(LATCHED);
    const edge = (t, side) => {
      const along = LIMB * t, out = CURL * Math.pow(t, 2.2) + side * (0.0045 - 0.002 * t); // toward the front
      return [s * (ROOT + along * ca + out * sa), -(PROD + along * sa - out * ca)];
    };
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(edge(i / N, 1));
    for (let i = N; i >= 0; i--) pts.push(edge(i / N, -1));
    plateY(L, pts, RAIL - 0.021, RAIL - 0.003, { ...spring, bevel: 0.0008 });
    L.seg(0, [s * (ROOT + tx), RAIL - 0.023, PROD + tz], [s * (ROOT + tx), SY + 0.004, PROD + tz], 0.0035, 0.003, { ...M.rust, rs: 6, hs: 1 }); // string pin
    P.pivot(s > 0 ? 'limbR' : 'limbL', new THREE.Vector3(s * ROOT, 0, PROD));
  }
  // string: latched V in the merged world model; in the viewmodel two unit lengths (+Z) the animation places
  if (P.split) {
    for (const n of ['stringR', 'stringL']) cylZ(P.get(n), 0, 0, 0, 1, 0.0017, { ...rope, rs: 5 });
  } else {
    for (const s of [-1, 1]) B.seg(0, [s * (ROOT + tx), SY, PROD + tz], [0, SY, nock], 0.0017, 0.0017, { ...rope, rs: 4, hs: 1, caps: 0 });
  }
  // bolt: ash shaft, scrap head, two tape vanes lying flat on the rail
  const A = P.get('arrow');
  const by = RAIL + 0.0045, tipZ = nock - 0.34;
  cylZ(A, 0, by, nock, tipZ, 0.0042, { ...M.wood, color: [1.0, 1.1, 1.2], rs: R(hi, 8, 5) });
  latheZ(A, [[0, -tipZ - 0.002], [0.0052, -tipZ - 0.002], [0.0068, -tipZ + 0.006], [0, -tipZ + 0.042]], 0, by, { ...M.steel, rs: R(hi, 8, 5), sharp: true });
  for (const s of [-1, 1]) profile(A, [[-nock + 0.012, s * 0.004], [-nock + 0.022, s * 0.013], [-nock + 0.062, s * 0.013], [-nock + 0.075, s * 0.004]], 0.0012, { ...M.red, bevel: 0 });
  for (const part of A.parts.slice(-2)) part.geo.rotateZ(PI / 2).translate(0, by, 0); // vanes were drawn upright: lay them flat
  const sh = P.shift(O, ['stringR', 'stringL']);
  P.meta.muzzle = sh(0, by, PROD - 0.05);
  P.meta.leftHand = sh(0, 0.046, -0.3);
  P.meta.sight = sh(0, RAIL + 0.0295, PROD + 0.014); // front pin (ADS pivots around it)
  P.meta.xbow = { pivot: sh(ROOT, SY, PROD), tip: new THREE.Vector3(tx, 0, tz), flex: FLEX, half, rail: sh(0, by, nock - 0.17) };
}

export default {
  id: ITEM.CROSSBOW,
  build: buildCrossbow,
  vm: {
    kind: 'rifle', crossbow: true, hip: [0.2, -0.19, -0.2, 0.03, 0.17, 0.0], ads: 0.22, adsZ: -0.53, adsPitch: 0.1,
    rPose: 'xbowGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.75) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'xbowSupport' },
    recoil: { z: 0.018, rx: 0.03, ry: 0.01 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the fore-end
    xbowSupport: { curl: [[0.48, 0.55, 0.38], [0.66, 0.75, 0.84], [0.79, 0.9, 0.63], [0.8, 0.92, 0.64]], spread: 0.02, thumb: [[-0.56, -0.79, 0.23], [-0.43, -0.79, -0.43]], center: [-0.0476, -0.088, 0] }, // crossbow
    // the right hand round the stock's wrist
    xbowGrip: { curl: [[0.14, 0.16, 0.49], [0.17, 0.2, 0.14], [0.31, 1.06, 0.74], [0.37, 0.79, 0.74]], spread: 0, thumb: [[-0.71, -0.71, 0], [-0.21, -0.61, -0.77]], center: [-0.0378, -0.083, 0] }, // crossbow
  },
};
