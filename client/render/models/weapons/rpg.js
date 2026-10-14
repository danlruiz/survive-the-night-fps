// RPG (RPG-7 style: one grenade at a time)
// A steel tube with a wooden heat shield round its middle, the pistol grip and trigger under the front third and a
// second grip ahead of them, the sight off the left of the tube and a flared venturi at the back. The grenade is its
// own part ('warhead', pivot on the muzzle): its bulb and nose stand out ahead of the tube, and in the viewmodel a
// stub of its motor meta.rpg.stroke long sits in the bore, which is how far the reload pushes it in.
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { profile, latheZ, cylZ, barrelZ, boxR, M, R, gunGrip, handQ, supportGrip, GRIPS, trigger, triggerGuard, bandZ } from './parts.js';

function buildRPG(P) {
  const hi = P.hi;
  const B = P.get('body');
  const TY = 0.082; // bore axis, above the grip
  const MZ = -0.37, VZ = 0.44, RZ = 0.58; // muzzle, front of the venturi, back end
  const RT = 0.026, BORE = 0.021, STROKE = 0.1;
  const SX = -0.078, SH = TY + 0.064; // the sight line, left of and above the bore
  const rs = R(hi, 16, 8);
  const oliveDark = { ...M.olive, color: [0.72, 0.8, 0.4] };
  const shield = { ...M.wood, color: [0.7, 0.58, 0.5] }; // varnished
  // tube, with a ring round the muzzle and a dark bore
  barrelZ(B, 0, TY, VZ + 0.005, MZ, RT, BORE, { ...M.gunDark, rs });
  latheZ(B, [[RT - 0.001, -MZ - 0.02], [0.029, -MZ - 0.02], [0.029, -MZ + 0.001], [BORE, -MZ + 0.001], [BORE, -MZ - 0.02]], 0, TY, { ...M.gunDark, rs, sharp: true });
  cylZ(B, 0, TY, MZ + 0.0295, MZ + 0.0285, BORE - 0.0005, { ...M.black, rs: R(hi, 12, 7) });
  if (hi) {
    // front sight folded down on top, behind the muzzle ring
    boxR(B, -0.006, 0.006, TY + RT - 0.003, TY + RT + 0.006, MZ + 0.065, MZ + 0.035, M.gun);
    boxR(B, -0.0016, 0.0016, TY + RT + 0.006, TY + RT + 0.0092, MZ + 0.062, MZ + 0.104, M.gunDark);
  }
  // trigger housing under the tube, pistol grip (runs up through the fist), guard and trigger
  boxR(B, -0.0165, 0.0165, 0.026, TY - RT + 0.008, 0.04, -0.09, M.gun);
  for (const z of [0.04, -0.09]) bandZ(B, z, 0.006, RT, RT + 0.0035, 0, TY, { ...M.gunDark, rs, sharp: true });
  profile(B, GRIPS.ak.grip, 0.029, { ...M.polyDark, bevel: 0.004 });
  triggerGuard(B, hi, GRIPS.ak.guard, 0.0032, M.gun);
  trigger(B, GRIPS.ak.trigger);
  if (hi) B.seg(0, [-0.017, 0.045, 0.012], [0.017, 0.045, 0.012], 0.004, 0.004, { ...M.gunDark, rs: 6, hs: 1 }); // safety
  // front grip on a clamp band
  latheZ(B, [[RT, 0.138], [RT + 0.0035, 0.138], [RT + 0.0035, 0.192], [RT, 0.192]], 0, TY, { ...M.gunDark, rs, sharp: true });
  boxR(B, -0.011, 0.011, TY - RT - 0.012, TY - RT + 0.004, -0.142, -0.188, M.gun);
  profile(B, [[0.146, 0.048], [0.186, 0.048], [0.19, 0.02], [0.196, -0.034], [0.19, -0.047], [0.158, -0.05], [0.15, -0.038], [0.145, 0.02]], 0.03, { ...M.polyDark, bevel: 0.004, curveSegs: 4 });
  // wooden heat shield: two sleeves round the middle, steel bands at their ends
  for (const [z0, z1] of [[0.06, 0.205], [0.215, 0.36]]) {
    latheZ(B, [[0, -z1], [0.031, -z1], [0.0355, -z1 + 0.008], [0.0355, -z0 - 0.008], [0.031, -z0], [0, -z0]], 0, TY, { ...shield, rs });
    if (hi || z0 > 0.1) for (const z of [z0 + 0.012, z1 - 0.012]) bandZ(B, z, 0.004, 0.0355, 0.0366, 0, TY, { ...M.gun, rs, sharp: true });
  }
  // venturi: a cone flaring open at the back, dark inside
  latheZ(B, [[0, -0.47], [0.019, -0.47], [0.024, -0.52], [0.04, -0.574], [0.046, -RZ], [0.0475, -RZ + 0.006], [0.042, -0.54], [0.033, -0.49], [0.0305, -VZ], [0, -VZ]], 0, TY, { ...M.gun, rs: R(hi, 18, 8), sharp: hi });
  cylZ(B, 0, TY, 0.4725, 0.4715, 0.0188, { ...M.black, rs: R(hi, 12, 7) });
  // sight: a bracket off the left of the tube, the optic (objective ahead, eyepiece behind), and a notch and post on
  // top of it that the sight line runs through
  const top = TY + 0.05; // top of the optic
  boxR(B, -0.064, -0.018, TY - 0.012, TY + 0.012, 0.035, -0.03, M.gun);
  boxR(B, SX - 0.016, SX + 0.016, TY + 0.004, top, 0.07, -0.058, oliveDark);
  cylZ(B, SX, TY + 0.027, -0.056, -0.082, 0.0165, { ...oliveDark, rs: R(hi, 12, 7) });
  cylZ(B, SX, TY + 0.027, -0.0815, -0.0825, 0.0138, { region: WR.GLASS, color: [0.3, 0.42, 0.5], mottle: 0.02, rs: R(hi, 12, 7) });
  cylZ(B, SX - 0.003, TY + 0.022, 0.068, 0.082, 0.009, { ...M.polyDark, rs: R(hi, 10, 6) }); // eyepiece
  if (hi) B.seg(0, [SX - 0.016, TY + 0.03, 0.012], [SX - 0.025, TY + 0.03, 0.012], 0.008, 0.008, { ...M.gunDark, rs: 10, hs: 1 }); // range drum
  boxR(B, SX - 0.009, SX + 0.009, top, SH, 0.058, 0.05, M.gunDark); // rear notch
  for (const s of [-1, 1]) boxR(B, SX + s * 0.0025, SX + s * 0.009, SH, SH + 0.008, 0.058, 0.05, M.gunDark);
  boxR(B, SX - 0.009, SX + 0.009, top, top + 0.005, -0.03, -0.05, M.gunDark); // front post between two ears
  for (const s of [-1, 1]) boxR(B, SX + s * 0.0065, SX + s * 0.009, top + 0.005, SH + 0.006, -0.038, -0.048, M.gunDark);
  boxR(B, SX - 0.0013, SX + 0.0013, top + 0.005, SH, -0.0415, -0.0445, M.gunDark);
  // the grenade: motor out of the muzzle, boat tail, bulb, ogive and fuze (the world model shows it loaded)
  const W = P.get('warhead');
  const f = -MZ;
  cylZ(W, 0, TY, MZ + (P.split ? STROKE : 0.005), MZ - 0.04, 0.0195, { ...M.gunDark, rs: R(hi, 12, 7) });
  latheZ(W, [[0, f + 0.038], [0.0195, f + 0.038], [0.024, f + 0.044], [0.0405, f + 0.088], [0.0425, f + 0.1], [0.0425, f + 0.165], [0.0412, f + 0.178], [0.035, f + 0.22], [0.025, f + 0.27], [0.0135, f + 0.322], [0.0095, f + 0.332], [0, f + 0.332]], 0, TY, { ...M.olive, rs });
  if (hi) latheZ(W, [[0.0425, f + 0.118], [0.0429, f + 0.119], [0.0429, f + 0.131], [0.0425, f + 0.132]], 0, TY, { ...M.black, rs, sharp: true }); // painted band
  latheZ(W, [[0, f + 0.33], [0.0082, f + 0.33], [0.0082, f + 0.356], [0.0062, f + 0.364], [0, f + 0.368]], 0, TY, { ...M.steel, color: [0.7, 0.7, 0.68], rs: R(hi, 10, 6) });
  P.pivot('warhead', new THREE.Vector3(0, TY, MZ));
  P.meta.muzzle = new THREE.Vector3(0, TY, MZ);
  P.meta.leftHand = new THREE.Vector3(0, 0.002, -0.168);
  P.meta.sight = new THREE.Vector3(SX, SH, -0.043); // front post
  P.meta.rpg = { grab: new THREE.Vector3(0, -0.022, -0.1325), stroke: STROKE }; // grab: where the left hand holds the grenade (from its pivot)
}

export default {
  id: ITEM.RPG,
  build: buildRPG,
  vm: {
    // shouldered: the tube rests on the right shoulder and runs forward down the right of the screen, the right hand on
    // the pistol grip, the left round the front grip; aimed, the sight off the left of the tube comes up to the eye.
    // rpg: the grenade in the muzzle follows the loaded state like the crossbow's bolt, and the reload carries a new
    // one in (_animReloadRPG, the left hand under its bulb at holdQ). A heavy shove back, little climb
    kind: 'rifle', rpg: true, hip: [0.21, -0.21, -0.3, 0.03, 0.0, 0.0], ads: 0.22, adsZ: -0.38, adsPitch: 0.12,
    rPose: 'rpgGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.15) }, lGrip: { q: handQ(-1, [0.35, -0.2, -0.92], [1, 0, 0.35]), pose: 'rpgSupport' },
    holdQ: supportGrip(-0.3, 0.5, 0.0),
    recoil: { z: 0.08, rx: 0.03, ry: 0.012 }, sprint: [-0.03, -0.04, 0.02, -0.3, 0.35, 0.3],
  },
  poses: {
    // the support hand round the front grip
    rpgSupport: { curl: [[0.33, 1.39, 0.97], [0.11, 1.48, 1.03], [0.09, 1.35, 0.94], [0.05, 0.92, 0.64]], spread: 0, thumb: [[-0.98, -0.13, 0.13], [-0.73, -0.61, -0.3]], center: [-0.0342, -0.083, 0] }, // RPG front grip
    // the right hand on the pistol grip: lower on it than the old fist (its middle finger clears the trigger guard and
    // the magazine to wrap the front of the grip), the index laid straight along the side of the guard
    rpgGrip: { curl: [[0.1, 0.1, 0.08], [0.92, 1.36, 0.95], [0.96, 1.28, 0.9], [0.96, 0.92, 0.64]], spread: 0, thumb: [[0.33, -0.92, -0.19], [-0.27, -0.92, -0.27]], center: [-0.034, -0.068, -0.025] }, // RPG
  },
};
