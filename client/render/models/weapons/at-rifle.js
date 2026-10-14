// Anti-tank rifle (PTRD-style: single shot, 14.5mm)
// A long thin barrel with a two-port brake, a folded bipod and a carry handle; iron sights off to the left of the
// bore; a tube stock to a padded shoulder piece. The loading port is the top right of the receiver, cut open: the
// 'bolt' part slides back out of it (handle on the right), and in the viewmodel the 'round' is laid in it on the
// reload and the spent 'case' thrown out of it (_animReloadSingle).
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { PI, profile, latheZ, cylZ, barrelZ, boxR, M, R, gunGrip, supportGrip } from './parts.js';

const ATR = { BY: 0.085, RR: 0.0245, PORT0: -0.028, PORT1: -0.168, SEAT: -0.04 };
// where the left hand holds a round (pinched over its middle) relative to its base, for the round turned by (tilt,
// yaw) as its mesh is (Euler XYZ: nose down, then crosswise)
const _atE = new THREE.Euler();
export function atHold(out, tilt, yaw) {
  return out.set(0, 0.0175, -0.07).applyEuler(_atE.set(tilt, yaw, 0));
}
// a 14.5x114 round along -Z from its base at the origin (case only for the spent one)
function atRound(mb, hi, bullet) {
  const rs = R(hi, 8, 6);
  latheZ(mb, [[0, 0], [0.0135, 0], [0.0135, 0.004], [0.0117, 0.0055], [0.0117, 0.008], [0.0134, 0.0095], [0.0124, 0.088], [0.0084, 0.097], [0.0083, 0.114], [0, 0.114]], 0, 0, { ...M.brass, rs });
  if (!bullet) return;
  latheZ(mb, [[0, 0.113], [0.0074, 0.113], [0.0074, 0.124], [0.0062, 0.138], [0, 0.155]], 0, 0, { region: WR.STEEL, color: [0.9, 0.6, 0.42], mottle: 0.05, rs }); // copper-washed jacket
  latheZ(mb, [[0, 0.1428], [0.0047, 0.1428], [0, 0.1557]], 0, 0, { region: WR.PLAIN, color: 0x1a1a1a, mottle: 0.04, rs }); // black (armour-piercing) tip
}
function buildATRifle(P) {
  const hi = P.hi;
  const B = P.get('body');
  const { BY, RR } = ATR;
  const OD = { region: WR.GUNMETAL, color: [1.18, 1.3, 0.62], mottle: 0.06 }; // olive-drab paint
  const ODd = { ...OD, color: [0.92, 1.0, 0.5] };
  const barrel = { ...M.gun, color: [0.95, 0.95, 0.92] }; // bare blued steel
  const rs = R(hi, 12, 8);
  const rb = R(hi, 10, 6); // (bands and clamps)
  // part of a tube about the bore (or about (x, y)): radius r, z0 -> z1 (z0 behind), from phi0 round phiLen (phi 0 =
  // up, pi/2 = right); inward: the inside face
  const arcZ = (mb, x, y, r, z0, z1, phi0, phiLen, inward, o) => {
    const pts = (inward ? [[r, -z1], [r, -z0]] : [[r, -z0], [r, -z1]]).map((p) => new THREE.Vector2(p[0], p[1]));
    const geo = new THREE.LatheGeometry(pts, R(hi, 12, 7), phi0, phiLen);
    geo.rotateX(-PI / 2);
    geo.translate(x, y, 0);
    return mb.geom(0, geo, o);
  };
  // ---- receiver: closed behind and ahead of the port, and under it a trough (the top right cut away)
  // (far off, in the world model: one closed tube with a dark plate for the port)
  if (!hi) {
    cylZ(B, 0, BY, 0.036, -0.215, RR, { ...OD, rs });
    boxR(B, 0.0, 0.022, BY + 0.016, BY + 0.0275, ATR.PORT0, ATR.PORT1, M.black);
  } else {
    cylZ(B, 0, BY, 0.036, ATR.PORT0, RR, { ...OD, rs });
    cylZ(B, 0, BY, ATR.PORT1, -0.215, RR, { ...OD, rs });
    const OPEN0 = 1.75, OPEN = 2.1; // the cut: from just below the right side over the top to a little left of it
    arcZ(B, 0, BY, RR, ATR.PORT0, ATR.PORT1, OPEN0, 2 * PI - OPEN, false, OD);
    arcZ(B, 0, BY, RR - 0.0025, ATR.PORT0, ATR.PORT1, OPEN0, 2 * PI - OPEN, true, { ...M.gunDark, color: [0.5, 0.5, 0.48] });
    for (const a of [OPEN0, OPEN0 - OPEN + 2 * PI]) {
      const x = Math.sin(a) * (RR - 0.00125), y = BY + Math.cos(a) * (RR - 0.00125);
      B.seg(0, [x, y, ATR.PORT0], [x, y, ATR.PORT1], 0.0014, 0.0014, { ...OD, rs: 5, hs: 1 }); // the cut edges
    }
    cylZ(B, 0, BY, ATR.PORT1 + 0.0006, ATR.PORT1 - 0.0004, 0.0136, { ...M.black, rs: 10 }); // the chamber mouth
  }
  // trigger group and its housing, wooden pistol grip, guard, trigger
  boxR(B, -0.012, 0.012, 0.028, BY - 0.02, 0.03, -0.1, OD);
  profile(B, [[0.032, 0.04], [0.03, 0.02], [0.0, -0.07], [-0.006, -0.08], [-0.032, -0.083], [-0.042, -0.074], [-0.022, 0.04]], 0.032, {
    ...M.walnut,
    bevel: 0.006,
    bevelSegs: hi ? 2 : 1,
    curveSegs: 4,
  });
  B.tube(0, [[0, 0.03, -0.026], [0, 0.006, -0.03], [0, -0.004, -0.052], [0, 0.004, -0.076], [0, 0.03, -0.086]], 0.0034, 0.0034, { ...OD, rs: R(hi, 5, 4), ts: R(hi, 9, 5), cap: false });
  B.tube(0, [[0, 0.03, -0.046], [0, 0.015, -0.049], [0, 0.006, -0.044]], 0.0026, 0.002, { ...M.gunDark, rs: 5, ts: 4 });
  // ---- stock: a tube back to the shoulder piece, a cheek rest, the steel yoke and its padded leather cushion
  const SY = 0.032;
  cylZ(B, 0, SY, 0.37, -0.02, 0.019, { ...OD, rs: rb });
  profile(B, [[-0.15, SY + 0.012], [-0.172, SY + 0.05], [-0.31, SY + 0.053], [-0.33, SY + 0.012]], 0.036, { ...M.walnut, bevel: 0.006, curveSegs: 3 });
  profile(B, [[-0.238, SY - 0.012], [-0.244, -0.058], [-0.256, -0.068], [-0.282, -0.066], [-0.276, SY - 0.012]], 0.03, { ...M.walnut, bevel: 0.005, curveSegs: 3 }); // rear grip
  boxR(B, -0.024, 0.024, -0.08, 0.108, 0.358, 0.378, { ...OD, round: 0.2, seg: 2 });
  B.box(0, [0, 0.014, 0.408], [0.06, 0.21, 0.06], { ...M.leather, color: [0.78, 0.66, 0.52], round: 0.55, seg: R(hi, 3, 2) });
  // ---- barrel: a heavy chamber section, the long taper, a wooden handguard over its back for the left hand
  cylZ(B, 0, BY, -0.21, -0.32, 0.021, { ...OD, rs });
  barrelZ(B, 0, BY, -0.32, -1.13, 0.0175, 0.0074, { ...barrel, r1: 0.0135, rs: R(hi, 10, 8) });
  latheZ(B, [[0, 0.24], [0.0236, 0.24], [0.0266, 0.258], [0.0266, 0.452], [0.0236, 0.47], [0, 0.47]], 0, BY, { ...M.walnut, rs, swapUV: true });
  if (hi) for (const z of [-0.236, -0.474]) latheZ(B, [[0.016, -z - 0.006], [0.0272, -z - 0.006], [0.0272, -z + 0.006], [0.016, -z + 0.006]], 0, BY, { ...OD, rs: rb });
  // carry handle on two clamps, offset to the right, with a wooden grip
  for (const z of [-0.6, -0.72]) latheZ(B, [[0.0155, -z - 0.008], [0.019, -z - 0.008], [0.019, -z + 0.008], [0.0155, -z + 0.008]], 0, BY, { ...OD, rs: rb });
  B.tube(0, [[0.01, BY + 0.014, -0.6], [0.02, BY + 0.048, -0.612], [0.022, BY + 0.056, -0.64], [0.022, BY + 0.056, -0.68], [0.02, BY + 0.048, -0.708], [0.01, BY + 0.014, -0.72]], 0.005, 0.005, { ...OD, rs: 6, ts: R(hi, 10, 6), cap: false });
  B.seg(0, [0.022, BY + 0.057, -0.636], [0.022, BY + 0.057, -0.684], 0.0085, 0.0085, { ...M.walnut, rs: R(hi, 10, 6), hs: 1 });
  // folded bipod: hinge collar under the barrel, two legs lying back along it, spade feet
  const HZ = -0.86;
  if (hi) latheZ(B, [[0.0145, -HZ - 0.013], [0.0205, -HZ - 0.013], [0.0205, -HZ + 0.013], [0.0145, -HZ + 0.013]], 0, BY, { ...OD, rs: rb });
  boxR(B, -0.017, 0.017, BY - 0.034, BY - 0.012, HZ + 0.013, HZ - 0.013, OD);
  for (const s of [-1, 1]) {
    B.seg(0, [s * 0.011, BY - 0.028, HZ], [s * 0.013, BY - 0.031, -0.52], 0.0058, 0.005, { ...ODd, rs: 6, hs: 1 });
    boxR(B, s * 0.009, s * 0.017, BY - 0.046, BY - 0.02, -0.505, -0.535, ODd);
  }
  // front sight, off to the left on its own clamp: a post under a hood
  const SX = -0.04, SH = 0.148;
  if (hi) latheZ(B, [[0.0132, 1.068], [0.0168, 1.068], [0.0168, 1.092], [0.0132, 1.092]], 0, BY, { ...OD, rs: rb });
  boxR(B, SX - 0.006, -0.012, BY - 0.006, BY + 0.008, -1.07, -1.09, OD);
  boxR(B, SX - 0.006, SX + 0.006, BY + 0.008, SH - 0.016, -1.073, -1.087, OD);
  boxR(B, SX - 0.0024, SX + 0.0024, SH - 0.016, SH, -1.077, -1.083, M.gunDark);
  if (hi) {
    arcZ(B, SX, SH - 0.004, 0.0115, -1.066, -1.094, -1.65, 3.3, false, OD);
    arcZ(B, SX, SH - 0.004, 0.0095, -1.066, -1.094, -1.65, 3.3, true, ODd);
  }
  // rear sight: a leaf on a bracket off the left of the receiver, an aperture at the top
  boxR(B, SX - 0.006, -0.0232, BY + 0.004, BY + 0.018, -0.088, -0.112, OD);
  boxR(B, SX - 0.004, SX + 0.004, BY + 0.02, SH - 0.008, -0.096, -0.104, ODd);
  if (hi) latheZ(B, [[0.0038, 0.097], [0.0085, 0.097], [0.0085, 0.103], [0.0038, 0.103]], SX, SH, { ...ODd, rs: 12, sharp: true });
  else boxR(B, SX - 0.008, SX + 0.008, SH - 0.008, SH + 0.008, -0.097, -0.103, ODd);
  // muzzle brake: three plates on straps - the two ports between them open right through
  const MB0 = -1.128, MB1 = -1.236;
  cylZ(B, 0, BY, -1.11, MB0, 0.0172, { ...barrel, rs: rb });
  for (const z of [MB0, -1.176, MB1 + 0.012]) boxR(B, -0.029, 0.029, BY - 0.023, BY + 0.023, z, z - 0.012, ODd);
  for (const s of [-1, 1]) boxR(B, -0.029, 0.029, BY + s * 0.017, BY + s * 0.0245, MB0, MB1, OD);
  if (hi) cylZ(B, 0, BY, MB1 + 0.0004, MB1 - 0.0004, 0.008, { ...M.black, rs: 10 });
  // bolt (separate): body, cocking piece out the back, the handle on the right with a ball knob
  const BO = P.get('bolt');
  cylZ(BO, 0, BY, 0.07, ATR.SEAT, 0.0195, { ...M.steel, color: [0.4, 0.4, 0.42], rs: R(hi, 10, 6) });
  cylZ(BO, 0, BY, 0.09, 0.07, 0.0155, { ...OD, rs: R(hi, 10, 6) });
  BO.tube(0, [[0.016, BY, 0.058], [0.044, BY - 0.012, 0.06], [0.068, BY - 0.03, 0.064]], 0.005, 0.0045, { ...M.gun, rs: R(hi, 6, 4), ts: R(hi, 6, 3) });
  BO.ellip(0, [0.072, BY - 0.033, 0.064], [0.0105, 0.0105, 0.0105], { ...M.gunDark, ws: R(hi, 8, 6), hs: R(hi, 6, 4) });
  P.pivot('bolt', new THREE.Vector3(0, BY, 0.06));
  if (P.split) {
    atRound(P.get('round'), hi, true);
    atRound(P.get('case'), hi, false);
  }
  P.meta.muzzle = new THREE.Vector3(0, BY, -1.24);
  P.meta.leftHand = new THREE.Vector3(0, BY - 0.002, -0.36);
  P.meta.sight = new THREE.Vector3(SX, SH, -0.1); // the rear aperture
  P.meta.boltKnob = new THREE.Vector3(0.072, BY - 0.033, 0.064);
  P.meta.port = new THREE.Vector3(0.008, BY + 0.018, -0.1);
  P.meta.seat = new THREE.Vector3(0, BY, ATR.SEAT); // the base of a chambered round
}

export default {
  id: ITEM.AT_RIFLE,
  build: buildATRifle,
  vm: {
    // single: one round at a time, fed by hand into the open port (_animReloadSingle); the bolt is only worked on the
    // reload (boltTravel: how far it comes back). Heavy: it sags off the shoulder and kicks hard
    kind: 'rifle', bolt: true, single: true, boltTravel: 0.06, hip: [0.21, -0.225, -0.37, 0.035, 0.1, 0.0], ads: 0.22, adsZ: -0.3,
    rPose: 'atGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.32) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'atSupport' },
    recoil: { z: 0.09, rx: 0.17, ry: 0.03 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand on the handguard
    atSupport: { curl: [[0.37, 0.43, 0.3], [0.5, 0.57, 0.4], [0.58, 0.67, 0.56], [0.6, 0.68, 0.48]], spread: 0.02, thumb: [[-0.56, -0.79, 0.23], [0, -0.92, -0.38]], center: [-0.0389, -0.088, 0] }, // anti-tank rifle
    // the right hand round the rifle's grip
    atGrip: { curl: [[0.25, 0.29, 0.2], [0.37, 0.43, 0.81], [0.62, 0.95, 0.66], [0.54, 0.62, 0.69]], spread: 0, thumb: [[-0.08, -0.79, -0.6], [-0.16, -0.97, -0.21]], center: [-0.0426, -0.083, 0] }, // anti-tank rifle
  },
};
