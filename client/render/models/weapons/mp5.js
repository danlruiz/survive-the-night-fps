// MP5 (fixed polymer stock)
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { PI, profile, latheZ, cylZ, barrelZ, boxR, M, R, gunGrip, supportGrip } from './parts.js';

function buildMP5(P) {
  const hi = P.hi;
  const B = P.get('body');
  // stamped receiver (round top), end cap
  boxR(B, -0.019, 0.019, 0.03, 0.068, 0.055, -0.2, M.gun);
  cylZ(B, 0, 0.068, 0.055, -0.2, 0.019, { ...M.gun, rs: R(hi, 14, 8) });
  boxR(B, -0.02, 0.02, 0.03, 0.084, 0.055, 0.068, M.gunDark);
  if (hi) {
    boxR(B, 0.0185, 0.0194, 0.058, 0.078, -0.05, -0.1, M.black); // ejection port
    for (const s of [-1, 1]) boxR(B, s * 0.0192 - 0.0006, s * 0.0192 + 0.0006, 0.036, 0.04, 0.05, -0.195, M.gunDark); // stamping seam
    for (const z of [0.02, -0.15]) B.seg(0, [-0.02, 0.04, z], [0.02, 0.04, z], 0.0026, 0.0026, { ...M.gunDark, rs: 6, hs: 1 }); // pins
  }
  // cocking tube over the barrel
  cylZ(B, 0, 0.078, -0.19, -0.345, 0.0125, { ...M.gun, rs: R(hi, 12, 7) });
  if (hi) boxR(B, -0.0128, -0.0118, 0.073, 0.083, -0.2, -0.31, M.black); // cocking slot (left)
  // slim polymer handguard
  profile(B, [[0.198, 0.066], [0.198, 0.03], [0.212, 0.021], [0.326, 0.023], [0.338, 0.033], [0.338, 0.066]], 0.044, { ...M.polyDark, bevel: 0.006, curveSegs: 4 });
  if (hi) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) boxR(B, s * 0.0222 - 0.0006, s * 0.0222 + 0.0006, 0.035, 0.055, -0.226 - i * 0.026, -0.238 - i * 0.026, M.black); // grip grooves
  // barrel + locking lugs
  barrelZ(B, 0, 0.05, -0.335, -0.405, 0.0085, 0.0035, { ...M.gun, rs: R(hi, 12, 7) });
  if (hi) for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    boxR(B, Math.sin(a) * 0.0095 - 0.002, Math.sin(a) * 0.0095 + 0.002, 0.05 + Math.cos(a) * 0.0095 - 0.002, 0.05 + Math.cos(a) * 0.0095 + 0.002, -0.37, -0.382, M.gun);
  }
  // hooded front sight (post tip at y 0.114) + drum rear sight (aperture at y 0.114)
  boxR(B, -0.008, 0.008, 0.086, 0.103, -0.325, -0.345, M.gun);
  latheZ(B, [[0.0095, 0.325], [0.0118, 0.325], [0.0118, 0.345], [0.0095, 0.345], [0.0095, 0.325]], 0, 0.114, { ...M.gun, rs: R(hi, 12, 7), sharp: true });
  B.seg(0, [0, 0.102, -0.335], [0, 0.114, -0.335], 0.0017, 0.0013, { ...M.gunDark, rs: 5, hs: 1 });
  boxR(B, -0.012, 0.012, 0.082, 0.096, 0.03, 0.06, M.gun);
  B.seg(0, [-0.0125, 0.1, 0.045], [0.0125, 0.1, 0.045], 0.0085, 0.0085, { ...M.gun, rs: R(hi, 12, 7), hs: 1 });
  latheZ(B, [[0.0042, -0.048], [0.0072, -0.048], [0.0072, -0.043], [0.0042, -0.043], [0.0042, -0.048]], 0, 0.114, { ...M.gunDark, rs: R(hi, 14, 6), sharp: true });
  // polymer trigger group, pistol grip, trigger guard + trigger, selector
  profile(B, [[0.066, 0.031], [0.066, 0.012], [0.04, 0.004], [-0.026, 0.004], [-0.046, 0.018], [-0.05, 0.031]], 0.034, { ...M.poly, bevel: 0.003 });
  profile(B, [[0.03, 0.01], [0.022, -0.012], [0.012, -0.03], [0.017, -0.042], [0.007, -0.074], [-0.027, -0.08], [-0.035, -0.066], [-0.026, -0.024], [-0.02, 0.01]], 0.029, { ...M.poly, bevel: 0.004 });
  B.tube(0, [[0, 0.006, -0.012], [0, -0.008, -0.016], [0, -0.012, -0.04], [0, -0.008, -0.062], [0, 0.006, -0.066]], 0.003, 0.003, { ...M.poly, rs: 5, ts: R(hi, 12, 6), cap: false });
  B.tube(0, [[0, 0.008, -0.034], [0, -0.002, -0.037], [0, -0.008, -0.032]], 0.0025, 0.002, { ...M.gunDark, rs: 5, ts: 4 });
  if (hi) {
    boxR(B, -0.0195, -0.0175, 0.016, 0.026, 0.02, -0.012, M.gunDark); // selector lever
    boxR(B, -0.006, 0.006, 0.0, 0.01, -0.07, -0.086, M.gunDark); // paddle release
  }
  // magwell
  boxR(B, -0.017, 0.017, 0.008, 0.032, -0.098, -0.148, M.gun);
  // fixed A2 stock + butt plate
  profile(B, [[-0.055, 0.082], [-0.33, 0.072], [-0.34, 0.062], [-0.34, -0.062], [-0.3, -0.058], [-0.2, -0.022], [-0.11, 0.008], [-0.055, 0.03]], 0.036, { ...M.polyDark, bevel: 0.005, curveSegs: 4 });
  profile(B, [[-0.34, 0.066], [-0.35, 0.066], [-0.35, -0.066], [-0.34, -0.066]], 0.04, { ...M.polyDark, color: [0.7, 0.7, 0.7], bevel: 0.002 });
  // curved 9mm magazine
  const MG = P.get('mag');
  const magPts = [];
  const N = hi ? 8 : 4;
  const cf = (t) => [0.123 + 0.05 * t * t + 0.018 * t, 0.024 - 0.2 * t];
  for (let i = 0; i <= N; i++) {
    const c = cf(i / N);
    magPts.push([c[0] + 0.021, c[1]]);
  }
  for (let i = N; i >= 0; i--) {
    const c = cf(i / N);
    magPts.push([c[0] - 0.021, c[1]]);
  }
  profile(MG, magPts, 0.02, { ...M.gun, color: [0.92, 0.9, 0.86], bevel: 0.002 });
  if (hi) {
    const c = cf(1);
    boxR(MG, -0.0115, 0.0115, c[1] - 0.004, c[1] + 0.005, -(c[0] - 0.023), -(c[0] + 0.024), M.gunDark);
  }
  P.pivot('mag', new THREE.Vector3(0, 0.024, -0.123));
  // cocking handle (front left of the tube)
  const CH = P.get('charge');
  CH.seg(0, [-0.011, 0.079, -0.3], [-0.033, 0.082, -0.296], 0.0034, 0.003, { ...M.gun, rs: 6, hs: 1 });
  CH.ellip(0, [-0.036, 0.082, -0.296], [0.0055, 0.0055, 0.0065], { ...M.gunDark, ws: 8, hs: 6 });

  P.meta.muzzle = new THREE.Vector3(0, 0.05, -0.408);
  P.meta.leftHand = new THREE.Vector3(0, 0.044, -0.27);
  P.meta.sight = new THREE.Vector3(0, 0.114, 0.045);
  P.meta.chargeKnob = new THREE.Vector3(-0.037, 0.082, -0.296);
  P.meta.magGrab = new THREE.Vector3(0, -0.065, -0.14);
}

export default {
  id: ITEM.MP5,
  build: buildMP5,
  vm: {
    kind: 'rifle', hip: [0.17, -0.18, -0.3, 0.03, 0.15, 0.0], ads: 0.2, adsZ: -0.2, chargeFire: false, chargeQ: [1.6, -0.3, 0.4],
    rPose: 'mp5Grip', rGrip: { p: [0, 0, 0], q: gunGrip(0.2) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'mp5Support' },
    magPose: 'mp5Mag', recoil: { z: 0.016, rx: 0.026, ry: 0.008 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the handguard
    mp5Support: { curl: [[0.42, 0.48, 0.33], [0.56, 0.64, 0.79], [0.65, 0.75, 0.78], [0.69, 0.79, 0.55]], spread: 0.02, thumb: [[-0.65, -0.71, 0.27], [-0.3, -0.79, -0.53]], center: [-0.0573, -0.088, 0] }, // MP5
    // the right hand on the pistol grip: lower on it than the old fist (its middle finger clears the trigger guard and
    // the magazine to wrap the front of the grip), the index laid straight along the side of the guard
    mp5Grip: { curl: [[0.1, 0.1, 0.08], [0.8, 1.2, 0.84], [0.96, 1, 0.7], [0.92, 0.64, 0.45]], spread: 0, thumb: [[0.07, -0.87, -0.5], [-0.12, -0.99, -0.05]], center: [-0.0415, -0.068, -0.025] }, // MP5
    // the left hand on the magazine as it comes out (reload)
    mp5Mag: { curl: [[0.4, 1.31, 0.91], [0.51, 1.46, 1.02], [0.58, 1.28, 0.89], [0.58, 0.66, 0.98]], spread: 0.02, thumb: [[-0.61, -0.71, -0.35], [-0.96, -0.26, 0.13]], center: [-0.0119, -0.088, 0] },
  },
};
