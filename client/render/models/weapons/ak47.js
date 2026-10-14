// AK-47
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { profile, latheZ, cylZ, barrelZ, boxR, M, R, gunGrip, supportGrip, GRIPS, trigger, triggerGuard, magOutline, rivets } from './parts.js';

// its sights: the line of sight's height over the grip, how far ahead of the grip the rear notch stands, the notch
// (width, depth) and the hood's inner radius. The post is at f = 0.57: a sight radius of 41 cm
const AK_SIGHT_Y = 0.131, AK_REAR_F = 0.16, AK_NOTCH = 0.0026, AK_NOTCH_DEEP = 0.0026, AK_PLATE = 0.005, AK_HOOD_R = 0.0125;
// the sights' steel: the hood parkerised grey, lighter than the gun, and the edges that are handled worn bright
const AK_HOOD = { ...M.steel, color: [0.62, 0.62, 0.6] }, AK_WORN = { ...M.steel, color: [1.3, 1.3, 1.25] };
function buildAK(P) {
  const hi = P.hi;
  const B = P.get('body');
  // receiver
  boxR(B, -0.021, 0.021, 0.028, 0.074, 0.07, -0.2, M.gun);
  cylZ(B, 0, 0.07, 0.068, -0.158, 0.0205, { ...M.gun, rs: R(hi, 14, 8) }); // dust cover
  boxR(B, -0.008, 0.008, 0.086, 0.094, 0.07, 0.058, M.gun); // rear latch
  if (hi) {
    for (let i = 0; i < 3; i++) boxR(B, -0.0206, 0.0206, 0.083 + i * 0.0015, 0.0845 + i * 0.0015, -0.03 - i * 0.04, -0.05 - i * 0.04, M.gunDark);
    rivets(B, 0.0212, 0.035, [0.03, -0.02, -0.12, -0.17]);
    // magazine well lip
    boxR(B, -0.022, 0.022, 0.026, 0.033, -0.078, -0.145, M.gun);
  }
  // rear sight: the block on the trunnion, and the tangent leaf hinged at its front end. The notch plate stands at
  // the leaf's rear end, nearest the eye: a flat-topped plate with a square notch AK_NOTCH wide, its top on the line of
  // sight (y = AK_SIGHT_Y). Nothing else on the gun reaches that line but the front post, so the notch shows the
  // post and what it is on, and no handguard or gas block
  // The block is narrow and low and the leaf rises to the plate, which is no wider than the leaf: from behind the
  // sights there is open view either side of the plate. The plate's top edge and the notch's edges are worn to bare
  // steel (AK_WORN), so the notch reads against a dark target and against the dark plate itself
  profile(B, [[0.158, 0.074], [0.215, 0.074], [0.215, 0.112], [0.2, 0.114], [0.158, 0.098]], 0.02, { ...M.gun, bevel: 0.001 });
  profile(B, [[AK_REAR_F, 0.1195], [0.213, 0.11], [0.213, 0.1165], [AK_REAR_F, 0.125]], 0.0095, { ...M.gunDark, bevel: 0.0008 }); // the leaf
  boxR(B, -0.0056, 0.0056, 0.118, 0.1236, -0.176, -0.184, M.gun); // its slider
  const pz0 = -AK_REAR_F, pz1 = -AK_REAR_F + 0.003, floor = AK_SIGHT_Y - AK_NOTCH_DEEP;
  for (const s of [-1, 1]) boxR(B, s * AK_NOTCH * 0.5, s * AK_PLATE, 0.1215, AK_SIGHT_Y - 0.0001, pz0, pz1, M.gunDark); // the notch's walls
  boxR(B, -AK_NOTCH * 0.5, AK_NOTCH * 0.5, 0.1215, floor, pz0, pz1, M.gunDark); // the notch's floor
  if (hi) {
    for (const s of [-1, 1]) {
      boxR(B, s * AK_NOTCH * 0.5, s * AK_PLATE, AK_SIGHT_Y - 0.0006, AK_SIGHT_Y, pz0, pz1 + 0.0002, AK_WORN); // the top edge
      boxR(B, s * AK_NOTCH * 0.5, s * (AK_NOTCH * 0.5 + 0.0005), floor, AK_SIGHT_Y - 0.0006, pz1, pz1 + 0.0002, AK_WORN); // the notch's sides
    }
    boxR(B, -AK_NOTCH * 0.5 - 0.0005, AK_NOTCH * 0.5 + 0.0005, floor - 0.0005, floor, pz1, pz1 + 0.0002, AK_WORN); // ...and its floor
  }
  // front trunnion
  boxR(B, -0.019, 0.019, 0.03, 0.09, -0.2, -0.228, M.gun);
  // barrel
  barrelZ(B, 0, 0.078, -0.2, -0.6, 0.0105, 0.004, { ...M.gun, rs: R(hi, 12, 7) });
  // muzzle brake
  barrelZ(B, 0, 0.078, -0.598, -0.645, 0.0128, 0.0055, { ...M.gunDark, rs: R(hi, 12, 7) });
  if (hi) boxR(B, -0.004, 0.004, 0.088, 0.0915, -0.615, -0.635, M.black);
  // front sight: the block, a hood round the post (a ring, the post's tip at its middle and on the line of sight)
  // and the post, its tip worn to bare steel so it shows against a dark target
  profile(B, [[0.552, 0.064], [0.584, 0.064], [0.584, 0.112], [0.575, 0.118], [0.56, 0.118], [0.552, 0.108]], 0.022, { ...M.gun, bevel: 0.001 });
  latheZ(B, [[AK_HOOD_R, 0.563], [AK_HOOD_R + 0.0026, 0.563], [AK_HOOD_R + 0.0026, 0.577], [AK_HOOD_R, 0.577], [AK_HOOD_R, 0.563]], 0, AK_SIGHT_Y, { ...AK_HOOD, rs: R(hi, 24, 10), sharp: true });
  B.seg(0, [0, 0.116, -0.57], [0, AK_SIGHT_Y - 0.0038, -0.57], 0.0015, 0.0014, { ...M.gun, rs: 6, hs: 1 });
  B.seg(0, [0, AK_SIGHT_Y - 0.004, -0.57], [0, AK_SIGHT_Y, -0.57], 0.0012, 0.0011, { ...AK_WORN, color: [1.5, 1.5, 1.45], rs: 6, hs: 1 });
  // bayonet lug + cleaning rod
  boxR(B, -0.006, 0.006, 0.052, 0.066, -0.545, -0.585, M.gun);
  cylZ(B, 0, 0.06, -0.4, -0.59, 0.003, { ...M.gun, rs: 5 });
  // gas block + gas tube
  boxR(B, -0.012, 0.012, 0.07, 0.116, -0.472, -0.49, M.gun);
  cylZ(B, 0, 0.104, -0.39, -0.475, 0.0095, { ...M.gun, rs: R(hi, 10, 6) });
  // upper handguard (wood over gas tube)
  latheZ(B, [[0, 0.235], [0.0165, 0.235], [0.0175, 0.245], [0.0175, 0.38], [0.013, 0.392], [0, 0.392]], 0, 0.103, { ...M.wood, rs: R(hi, 12, 7), sx: 1.28 });
  // lower handguard
  profile(B, [[0.228, 0.086], [0.228, 0.036], [0.245, 0.03], [0.27, 0.029], [0.29, 0.034], [0.31, 0.029], [0.33, 0.034], [0.35, 0.029], [0.375, 0.032], [0.405, 0.04], [0.412, 0.086]], 0.054, { ...M.wood, bevel: 0.006, curveSegs: 4 });
  boxR(B, -0.0265, 0.0265, 0.03, 0.089, -0.222, -0.232, M.gun); // retainer
  boxR(B, -0.027, 0.027, 0.03, 0.089, -0.412, -0.422, M.gun);
  // pistol grip
  profile(B, GRIPS.ak.grip, 0.029, { ...M.wood, bevel: 0.004, x: 0 });
  // trigger guard + trigger
  triggerGuard(B, hi, GRIPS.ak.guard, 0.0032, M.gun);
  trigger(B, GRIPS.ak.trigger);
  // selector lever (right side)
  boxR(B, 0.021, 0.0232, 0.052, 0.066, 0.02, -0.115, M.gun);
  boxR(B, 0.021, 0.026, 0.036, 0.052, -0.1, -0.118, M.gun);
  // stock
  profile(B, [[-0.068, 0.078], [-0.375, 0.058], [-0.375, -0.062], [-0.3, -0.04], [-0.2, -0.008], [-0.12, 0.018], [-0.068, 0.029]], 0.036, { ...M.wood, bevel: 0.005, widthFn: (f) => 1 + Math.min(0, f + 0.1) * 0.35 });
  profile(B, [[-0.375, 0.06], [-0.383, 0.06], [-0.383, -0.065], [-0.375, -0.065]], 0.04, { ...M.gun, bevel: 0.001 });
  // bolt carrier slot (right)
  boxR(B, 0.0206, 0.0214, 0.056, 0.066, -0.03, -0.155, M.black);
  // magazine
  const MG = P.get('mag');
  const magMid = (t) => [0.11 + 0.075 * t * t + 0.018 * t, 0.032 - 0.235 * t]; // its middle line, t from the top (0) to the base (1)
  const magPts = magOutline(magMid, (t) => 0.025 + 0.007 * t, hi ? 10 : 5);
  profile(MG, magPts, 0.027, { ...M.gun, color: [0.95, 0.9, 0.85], bevel: 0.0025 });
  if (hi) {
    // ribs
    for (let i = 1; i < 4; i++) {
      const t = i / 4.5, c = magMid(t);
      boxR(MG, -0.0147, 0.0147, c[1] - 0.004, c[1] + 0.004, -(c[0] - 0.02), -(c[0] + 0.02), { ...M.gunDark, color: [0.8, 0.76, 0.72] });
    }
  }
  P.pivot('mag', new THREE.Vector3(0, 0.03, -0.135));
  // charging handle / carrier
  const CH = P.get('charge');
  CH.seg(0, [0.021, 0.061, -0.145], [0.038, 0.063, -0.148], 0.0042, 0.004, { ...M.gun, rs: 6, hs: 1 });
  CH.ellip(0, [0.04, 0.063, -0.148], [0.0065, 0.0058, 0.0058], { ...M.gun, ws: 8, hs: 6 });
  boxR(CH, 0.0195, 0.0215, 0.057, 0.065, -0.1, -0.15, M.gunDark);

  P.meta.muzzle = new THREE.Vector3(0, 0.078, -0.648);
  P.meta.leftHand = new THREE.Vector3(0, 0.064, -0.315);
  P.meta.sight = new THREE.Vector3(0, AK_SIGHT_Y, -AK_REAR_F); // the rear notch (the post's tip is at the same height: the bore is level when aimed)
  P.meta.chargeKnob = new THREE.Vector3(0.042, 0.063, -0.148);
  P.meta.magGrab = new THREE.Vector3(0, -0.06, -0.15);
}

export default {
  id: ITEM.AK47,
  build: buildAK,
  vm: {
    kind: 'rifle', hip: [0.19, -0.19, -0.28, 0.03, 0.17, 0.0], ads: 0.2, adsZ: -0.17, adsFov: 50,
    rPose: 'akGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.15) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'akSupport' },
    magPose: 'akMag', recoil: { z: 0.028, rx: 0.045, ry: 0.01 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the handguard
    akSupport: { curl: [[0.37, 0.42, 0.29], [0.46, 0.53, 0.37], [0.56, 0.64, 0.45], [0.56, 0.64, 0.45]], spread: 0.02, thumb: [[-0.46, -0.87, 0.19], [0.1, -0.97, -0.24]], center: [-0.0708, -0.088, 0] }, // AK-47
    // the right hand on the pistol grip: lower on it than the old fist (its middle finger clears the trigger guard and
    // the magazine to wrap the front of the grip), the index laid straight along the side of the guard
    akGrip: { curl: [[0.1, 0.1, 0.08], [0.64, 1.2, 0.84], [0.64, 1.08, 0.76], [0.68, 0.72, 0.5]], spread: 0, thumb: [[0.03, -0.99, -0.13], [-0.09, -0.99, -0.09]], center: [-0.0394, -0.083, -0.025] }, // AK-47
    // the left hand on the magazine as it comes out (reload)
    akMag: { curl: [[0.89, 1.09, 0.76], [1, 1.2, 0.83], [0.91, 1.04, 0.72], [0.74, 0.85, 0.59]], spread: 0.02, thumb: [[-0.84, 0.26, -0.48], [-0.56, -0.71, -0.43]], center: [-0.022, -0.088, 0] },
  },
};
