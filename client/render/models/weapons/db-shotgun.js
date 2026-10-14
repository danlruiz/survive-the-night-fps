// Side-by-side double-barrel shotgun
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { profile, barrelZ, boxR, M, R, gunGrip, supportGrip, trigger, triggerGuard } from './parts.js';
import { bead, wristCheckering, shotgunShell } from './shotgun.js';

function buildDoubleBarrel(P) {
  const hi = P.hi;
  const B = P.get('body');
  const O = [0, -0.035, -0.058]; // authored like the pump: stock wrist -> grip origin
  // action (frame) + top lever
  boxR(B, -0.0235, 0.0235, 0.016, 0.066, 0.03, -0.075, M.gun);
  profile(B, [[0.03, 0.066], [0.062, 0.066], [0.075, 0.058], [0.075, 0.016], [0.03, 0.016]], 0.047, { ...M.gun, bevel: 0.003 });
  boxR(B, -0.004, 0.004, 0.066, 0.072, 0.03, -0.004, M.gunDark);
  B.seg(0, [0.0, 0.07, 0.022], [0.016, 0.071, 0.03], 0.0035, 0.003, { ...M.gunDark, rs: 6, hs: 1 });
  if (hi) {
    for (const s of [-1, 1]) profile(B, [[-0.02, 0.058], [0.06, 0.058], [0.07, 0.03], [-0.02, 0.022]], 0.001, { ...M.steel, color: [0.8, 0.78, 0.72], bevel: 0, x: s * 0.0238 }); // side plates
    B.seg(0, [-0.024, 0.03, -0.075], [0.024, 0.03, -0.075], 0.004, 0.004, { ...M.gunDark, rs: 8, hs: 1 }); // hinge pin
    boxR(B, -0.003, 0.003, 0.0705, 0.074, 0.005, -0.004, M.steel); // safety
  }
  // twin triggers + guard
  boxR(B, -0.009, 0.009, 0.004, 0.017, 0.02, -0.06, M.gun);
  triggerGuard(B, hi, [[0, 0.006, 0.012], [0, -0.014, 0.004], [0, -0.018, -0.03], [0, -0.008, -0.062], [0, 0.006, -0.07]], 0.0032, M.gun);
  for (const z of [-0.024, -0.04]) trigger(B, [[0, 0.006, z], [0, -0.006, z - 0.004], [0, -0.012, z + 0.002]], 0.0024, 0.002);
  // walnut stock + pad
  profile(B, [[-0.03, 0.068], [-0.085, 0.056], [-0.38, 0.03], [-0.38, -0.108], [-0.3, -0.085], [-0.2, -0.062], [-0.12, -0.035], [-0.075, -0.012], [-0.045, 0.006], [-0.03, 0.016]], 0.038, { ...M.walnut, bevel: 0.005, curveSegs: 4 });
  if (hi) wristCheckering(B);
  profile(B, [[-0.38, 0.032], [-0.398, 0.032], [-0.398, -0.111], [-0.38, -0.111]], 0.04, { ...M.leather, bevel: 0.003 });
  // barrels, rib, bead, lug and splinter forend: one part that breaks open around the hinge pin
  const BR = P.get('barrels');
  for (const s of [-1, 1]) barrelZ(BR, s * 0.0118, 0.052, -0.075, -0.64, 0.0122, 0.0094, { ...M.gun, r1: 0.0112, rs: R(hi, 14, 8) });
  boxR(BR, -0.0045, 0.0045, 0.058, 0.067, -0.078, -0.636, M.gunDark);
  bead(BR, 0.0695, -0.628);
  boxR(BR, -0.009, 0.009, 0.022, 0.046, -0.075, -0.12, M.gun); // under-lug
  profile(BR, [[0.105, 0.046], [0.105, 0.026], [0.12, 0.016], [0.3, 0.02], [0.33, 0.03], [0.34, 0.046]], 0.05, { ...M.walnut, bevel: 0.006, curveSegs: 4 });
  if (hi) boxR(BR, -0.0035, 0.0035, 0.018, 0.02, -0.28, -0.3, M.steel); // forend latch
  // two spare shells (loading animation only)
  if (P.split) {
    const SH = P.get('shell');
    for (const s of [-1, 1]) shotgunShell(SH, s * 0.0118, 0.009, 0.0102);
  }
  const hinge = new THREE.Vector3(0, 0.03, -0.075);
  P.pivot('barrels', hinge);
  const sh = P.shift(O, ['shell']);
  P.meta.muzzle = sh(0, 0.052, -0.642);
  P.meta.leftHand = sh(0, 0.034, -0.23);
  P.meta.sight = sh(0, 0.072, -0.628); // front bead
  P.meta.chamber = sh(0, 0.052, -0.075);
}

export default {
  id: ITEM.DB_SHOTGUN,
  build: buildDoubleBarrel,
  vm: {
    kind: 'shotgun', breakAction: true, hip: [0.2, -0.19, -0.2, 0.03, 0.17, 0.0], ads: 0.22, adsZ: -0.68, adsPitch: 0.1,
    rPose: 'dbGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.75) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'dbSupport' },
    recoil: { z: 0.07, rx: 0.14, ry: 0.025 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the fore-end
    dbSupport: { curl: [[0.42, 0.48, 0.33], [0.56, 0.64, 0.44], [0.65, 0.75, 0.72], [0.68, 0.78, 0.54]], spread: 0.02, thumb: [[-0.46, -0.87, 0.19], [0.15, -0.92, -0.35]], center: [-0.0531, -0.088, 0] }, // double-barrel
    // the right hand round the stock's wrist
    dbGrip: { curl: [[0.06, 0.07, 0.85], [0.11, 0.29, 0.2], [0.3, 0.34, 0.24], [0.37, 0.72, 0.8]], spread: 0, thumb: [[-0.56, -0.79, -0.23], [-0.3, -0.61, -0.73]], center: [-0.0378, -0.083, 0] }, // double-barrel
  },
};
