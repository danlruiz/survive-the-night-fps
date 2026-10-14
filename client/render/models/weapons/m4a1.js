// M4A1 carbine (flat-top, collapsible stock)
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { profile, latheZ, cylZ, barrelZ, boxR, M, R, gunGrip, supportGrip, GRIPS, trigger, triggerGuard, magOutline } from './parts.js';

function buildM4(P) {
  const hi = P.hi;
  const B = P.get('body');
  // lower receiver + flared magwell
  boxR(B, -0.019, 0.019, 0.02, 0.053, 0.062, -0.14, M.gun);
  profile(B, [[0.064, 0.021], [0.066, -0.014], [0.138, -0.014], [0.142, -0.004], [0.142, 0.021]], 0.034, { ...M.gun, bevel: 0.002 });
  // upper receiver + picatinny rail
  boxR(B, -0.0185, 0.0185, 0.053, 0.094, 0.07, -0.142, M.gun);
  boxR(B, -0.0105, 0.0105, 0.094, 0.1, 0.066, -0.142, M.gunDark);
  if (hi) {
    for (let i = 0; i < 11; i++) boxR(B, -0.0107, 0.0107, 0.0985, 0.1005, 0.056 - i * 0.018, 0.05 - i * 0.018, M.black); // rail slots
    boxR(B, 0.0184, 0.0192, 0.059, 0.082, -0.005, -0.075, M.black); // ejection port
    boxR(B, 0.0185, 0.024, 0.074, 0.086, 0.012, -0.004, M.gun); // brass deflector
    cylZ(B, 0.021, 0.081, 0.052, 0.012, 0.0075, { ...M.gunDark, rs: 8 }); // forward assist
    cylZ(B, 0.0195, 0.034, -0.09, -0.098, 0.0045, { ...M.gunDark, rs: 6 }); // mag release
    boxR(B, -0.0215, -0.0185, 0.03, 0.05, -0.1, -0.124, M.gun); // bolt catch
    // selector (left)
    B.seg(0, [-0.02, 0.041, 0.018], [-0.024, 0.041, 0.018], 0.0045, 0.0045, { ...M.gun, rs: 6, hs: 1 });
    boxR(B, -0.0255, -0.0215, 0.038, 0.044, 0.018, 0.034, M.gun);
    // takedown pins
    for (const z of [0.052, -0.13]) B.seg(0, [-0.02, 0.048, z], [0.02, 0.048, z], 0.0028, 0.0028, { ...M.gunDark, rs: 6, hs: 1 });
  }
  // flip-up rear sight (aperture centre at y 0.127)
  profile(B, [[-0.058, 0.1], [-0.026, 0.1], [-0.03, 0.112], [-0.042, 0.118], [-0.058, 0.114]], 0.028, { ...M.gunDark, bevel: 0.001 });
  boxR(B, -0.004, 0.004, 0.112, 0.121, 0.047, 0.043, M.gunDark);
  latheZ(B, [[0.0033, -0.047], [0.0065, -0.047], [0.0065, -0.043], [0.0033, -0.043], [0.0033, -0.047]], 0, 0.127, { ...M.gunDark, rs: R(hi, 12, 6), sharp: true });
  for (const s of [-1, 1]) boxR(B, s * 0.0078, s * 0.0108, 0.112, 0.136, 0.049, 0.041, M.gunDark);
  // barrel, delta ring, ribbed handguard, front sight base, birdcage
  barrelZ(B, 0, 0.072, -0.142, -0.5, 0.0092, 0.0035, { ...M.gunDark, rs: R(hi, 12, 7) });
  latheZ(B, [[0, 0.142], [0.031, 0.142], [0.031, 0.154], [0, 0.154]], 0, 0.072, { ...M.gun, rs: R(hi, 14, 8), sharp: true });
  const hg = [[0, 0.152], [0.0245, 0.152], [0.027, 0.16]];
  if (hi) {
    for (let i = 0; i < 8; i++) {
      const f = 0.17 + i * 0.018;
      hg.push([0.027, f], [0.0248, f + 0.004], [0.0248, f + 0.01], [0.027, f + 0.014]);
    }
  }
  hg.push([0.027, 0.316], [0.024, 0.322], [0, 0.322]);
  latheZ(B, hg, 0, 0.072, { ...M.polyDark, rs: R(hi, 14, 8), sx: 0.94, sharp: hi });
  latheZ(B, [[0, 0.32], [0.026, 0.32], [0.026, 0.328], [0, 0.328]], 0, 0.072, { ...M.gun, rs: R(hi, 12, 7), sharp: true });
  profile(B, [[0.338, 0.06], [0.374, 0.06], [0.374, 0.082], [0.36, 0.118], [0.35, 0.118], [0.338, 0.082]], 0.022, { ...M.gun, bevel: 0.001 });
  boxR(B, -0.005, 0.005, 0.046, 0.06, -0.34, -0.37, M.gun); // bayonet lug
  for (const s of [-1, 1]) boxR(B, s * 0.0072, s * 0.0102, 0.114, 0.132, -0.349, -0.359, M.gun); // sight ears
  B.seg(0, [0, 0.114, -0.354], [0, 0.127, -0.354], 0.0018, 0.0014, { ...M.gunDark, rs: 5, hs: 1 }); // post
  barrelZ(B, 0, 0.072, -0.498, -0.548, 0.0108, 0.0056, { ...M.black, rs: R(hi, 10, 6) });
  if (hi) for (const s of [-1, 1]) boxR(B, s * 0.004 - 0.0012, s * 0.004 + 0.0012, 0.08, 0.0832, -0.51, -0.538, M.black);
  // A2 pistol grip + squared trigger guard + trigger
  profile(B, GRIPS.a2.grip, 0.028, { ...M.poly, bevel: 0.004 });
  triggerGuard(B, hi, GRIPS.a2.guard, 0.003, M.gun);
  trigger(B, GRIPS.a2.trigger);
  // buffer tube + collapsible stock
  cylZ(B, 0, 0.074, 0.062, 0.27, 0.0155, { ...M.gunDark, rs: R(hi, 12, 7) });
  cylZ(B, 0, 0.074, 0.062, 0.074, 0.0185, { ...M.gun, rs: R(hi, 10, 6) });
  profile(B, [[-0.19, 0.095], [-0.31, 0.098], [-0.325, 0.09], [-0.325, -0.045], [-0.305, -0.05], [-0.255, 0.03], [-0.2, 0.052], [-0.19, 0.062]], 0.042, { ...M.polyDark, bevel: 0.004, curveSegs: 4 });
  profile(B, [[-0.325, 0.092], [-0.335, 0.092], [-0.335, -0.048], [-0.325, -0.048]], 0.044, { ...M.polyDark, color: [0.7, 0.7, 0.7], bevel: 0.002 });
  if (hi) boxR(B, -0.005, 0.005, 0.048, 0.056, 0.2, 0.235, M.polyDark); // adjustment lever
  // STANAG magazine
  const MG = P.get('mag');
  const magMid = (t) => [0.103 + 0.028 * t * t + 0.012 * t, 0.02 - 0.19 * t]; // its middle line, t from the top (0) to the base (1)
  const magPts = magOutline(magMid, () => 0.03, hi ? 8 : 4);
  profile(MG, magPts, 0.022, { ...M.gun, color: [0.9, 0.88, 0.84], bevel: 0.002 });
  if (hi) {
    const c = magMid(1);
    boxR(MG, -0.0125, 0.0125, c[1] - 0.004, c[1] + 0.006, -(c[0] - 0.032), -(c[0] + 0.033), M.polyDark); // floor plate
    for (const t of [0.35, 0.6]) {
      const q = magMid(t);
      boxR(MG, -0.0115, 0.0115, q[1] - 0.012, q[1] + 0.012, -(q[0] - 0.012), -(q[0] + 0.012), { ...M.gunDark, color: [0.8, 0.78, 0.75] });
    }
  }
  P.pivot('mag', new THREE.Vector3(0, 0.02, -0.103));
  // T charging handle (rear of the upper; the shaft shows when pulled)
  const CH = P.get('charge');
  boxR(CH, -0.006, 0.006, 0.086, 0.093, 0.068, -0.02, M.gunDark);
  boxR(CH, -0.021, 0.021, 0.085, 0.095, 0.068, 0.082, M.gunDark);
  if (hi) boxR(CH, -0.024, -0.017, 0.083, 0.097, 0.074, 0.084, M.gunDark); // latch

  P.meta.muzzle = new THREE.Vector3(0, 0.072, -0.55);
  P.meta.leftHand = new THREE.Vector3(0, 0.068, -0.25);
  P.meta.sight = new THREE.Vector3(0, 0.127, 0.045);
  P.meta.chargeKnob = new THREE.Vector3(-0.026, 0.04, -0.112); // reload ends with a slap on the bolt catch
  P.meta.magGrab = new THREE.Vector3(0, -0.06, -0.113);
}

export default {
  id: ITEM.M4A1,
  build: buildM4,
  vm: {
    kind: 'rifle', hip: [0.18, -0.185, -0.27, 0.03, 0.17, 0.0], ads: 0.2, adsZ: -0.16, chargeFire: false, chargeTravel: 0, chargeQ: [1.3, 0.1, 0],
    rPose: 'm4Grip', rGrip: { p: [0, 0, 0], q: gunGrip(0.15) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'm4Support' },
    magPose: 'm4Mag', recoil: { z: 0.022, rx: 0.035, ry: 0.008 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the handguard
    m4Support: { curl: [[0.45, 0.52, 0.36], [0.62, 0.71, 0.64], [0.71, 0.82, 0.57], [0.72, 0.82, 0.57]], spread: 0.02, thumb: [[-0.48, -0.87, 0.13], [0.1, -0.92, -0.37]], center: [-0.0468, -0.088, 0] }, // M4A1
    // the right hand on the pistol grip: lower on it than the old fist (its middle finger clears the trigger guard and
    // the magazine to wrap the front of the grip), the index laid straight along the side of the guard
    m4Grip: { curl: [[0.1, 0.1, 0.08], [0.56, 0.88, 0.62], [1, 1, 0.7], [1.08, 0.48, 0.34]], spread: 0, thumb: [[0.23, -0.79, -0.56], [-0.3, -0.92, -0.23]], center: [-0.043, -0.068, -0.025] }, // M4A1
    // the left hand on the magazine as it comes out (reload)
    m4Mag: { curl: [[0.35, 0.4, 1.2], [0.45, 1.22, 0.85], [0.52, 0.94, 1.1], [0.49, 0.56, 0.96]], spread: 0.02, thumb: [[-0.86, -0.5, -0.11], [-0.7, -0.71, -0.09]], center: [-0.0142, -0.088, 0] },
  },
};
