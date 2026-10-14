// Pistol (polymer striker-fired)
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { profile, cylZ, boxR, M, R, handQ } from './parts.js';

function buildPistol(P) {
  const hi = P.hi;
  const B = P.get('body');
  // frame + dust cover
  profile(B, [[-0.012, 0.047], [-0.012, 0.03], [0.02, 0.028], [0.1, 0.028], [0.155, 0.032], [0.162, 0.047]], 0.024, { ...M.poly, bevel: 0.002 });
  if (hi) for (let i = 0; i < 3; i++) boxR(B, -0.0121, 0.0121, 0.029, 0.034, -0.12 - i * 0.012, -0.126 - i * 0.012, M.polyDark);
  // grip (slanted, finger grooves)
  profile(B, [[-0.016, 0.037], [-0.004, 0.029], [-0.046, -0.08], [0.0, -0.08], [0.006, -0.064], [0.013, -0.057], [0.011, -0.048], [0.02, -0.037], [0.018, -0.028], [0.027, -0.015], [0.026, -0.006], [0.036, 0.012], [0.042, 0.029]], 0.029, { ...M.poly, bevel: 0.003 });
  if (hi) {
    // stipple panels
    for (const s of [-1, 1]) profile(B, [[-0.006, 0.01], [-0.034, -0.062], [-0.004, -0.062], [0.018, 0.0]], 0.001, { ...M.polyDark, bevel: 0, x: s * 0.0146 });
  }
  // trigger guard + trigger
  B.tube(0, [[0, 0.029, -0.04], [0, 0.006, -0.046], [0, 0.0, -0.065], [0, 0.001, -0.094], [0, 0.028, -0.1]], 0.0036, 0.0036, { ...M.poly, rs: 5, ts: R(hi, 12, 6), cap: false });
  B.tube(0, [[0, 0.03, -0.062], [0, 0.017, -0.064], [0, 0.01, -0.058]], 0.0028, 0.0022, { ...M.polyDark, rs: 5, ts: 4 });
  // mag base (fixed part is only the grip; mag is separate)
  const MG = P.get('mag');
  const ga = Math.atan2(0.042, 0.109); // grip angle
  const magLen = 0.105;
  const magStart = MG.parts.length; // in world mode MG === body builder: only transform the mag's own parts
  MG.box(0, [0, -magLen / 2, 0], [0.021, magLen, 0.03], { ...M.polyDark });
  MG.box(0, [0, -magLen - 0.004, 0.001], [0.027, 0.009, 0.042], { ...M.poly, round: 0.35, seg: 2 });
  // orient mag along grip axis; pivot at mag top
  const magGeoRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ga);
  for (let i = magStart; i < MG.parts.length; i++) {
    const part = MG.parts[i];
    part.geo.applyQuaternion(magGeoRot);
    part.geo.translate(0, 0.025, -0.013);
    part.geo.computeVertexNormals();
  }
  P.pivot('mag', new THREE.Vector3(0, 0.025, -0.013));
  P.meta.magAxis = new THREE.Vector3(0, -Math.cos(ga), Math.sin(ga));
  // slide
  const S = P.get('slide');
  profile(S, [[-0.018, 0.047], [0.168, 0.047], [0.168, 0.074], [0.162, 0.0805], [-0.013, 0.0805], [-0.018, 0.076]], 0.025, { ...M.gun, bevel: 0.0015 });
  if (hi) {
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) boxR(S, s * 0.0124, s * 0.0132, 0.052, 0.074, 0.01 - i * 0.0045, 0.0085 - i * 0.0045, M.black);
    // ejection port + barrel hood
    boxR(S, -0.003, 0.0126, 0.078, 0.0812, -0.03, -0.075, M.black);
    boxR(S, -0.002, 0.009, 0.077, 0.08, -0.034, -0.07, M.steel);
    // muzzle bore
    cylZ(S, 0, 0.0625, -0.166, -0.1686, 0.0055, { ...M.black, rs: 8 });
    // rear sight (notch)
    boxR(S, -0.011, -0.0022, 0.0805, 0.088, 0.012, 0.004, M.gunDark);
    boxR(S, 0.0022, 0.011, 0.0805, 0.088, 0.012, 0.004, M.gunDark);
    boxR(S, -0.011, 0.011, 0.0805, 0.084, 0.012, 0.004, M.gunDark);
    // sight dots
    boxR(S, -0.007, -0.0045, 0.0845, 0.0865, 0.0038, 0.0034, { region: WR.PLAIN, color: 0xe8e8d0, glow: 0.3 });
    boxR(S, 0.0045, 0.007, 0.0845, 0.0865, 0.0038, 0.0034, { region: WR.PLAIN, color: 0xe8e8d0, glow: 0.3 });
  } else {
    boxR(S, -0.011, 0.011, 0.0805, 0.087, 0.012, 0.004, M.gunDark);
  }
  boxR(S, -0.0018, 0.0018, 0.0805, 0.0875, -0.152, -0.16, M.gunDark); // front sight
  if (hi) boxR(S, -0.0012, 0.0012, 0.0855, 0.0875, -0.1515, -0.152, { region: WR.PLAIN, color: 0xe8e8d0, glow: 0.3 });
  P.meta.muzzle = new THREE.Vector3(0, 0.0625, -0.17);
  P.meta.leftHand = new THREE.Vector3(-0.028, -0.02, -0.012);
  P.meta.sight = new THREE.Vector3(0, 0.086, 0.004);
  P.meta.slideGrab = new THREE.Vector3(0, 0.065, 0.0);
}

export default {
  id: ITEM.PISTOL,
  build: buildPistol,
  vm: {
    // CS-style: low on the right, angled in toward the crosshair. Thumbs-forward two-hand grip: the right palm turned
    // ~26 deg toward the muzzle so its wrist sits behind the backstrap, index pad on the trigger; the left palm on the
    // left of the grip, its fingers over the right hand's, both thumbs along the frame. rGrip / lGrip and the
    // 'trigger' / 'cup' poses were fitted together against this grip's outline (fingers resting on it, nothing inside)
    kind: 'pistol', hip: [0.11, -0.158, -0.29, 0.09, 0.18, -0.06], ads: 0.2, adsZ: -0.42,
    rPose: 'trigger', rGrip: { p: [0, 0, -0.007], q: handQ(1, [0.435, -0.325, -0.84], [-0.9, -0.157, -0.406]) },
    lGrip: { p: [0, -0.02, -0.007], q: handQ(-1, [-0.199, -0.354, -0.914], [0.98, -0.072, -0.185]), pose: 'cup' },
    poleR: new THREE.Vector3(0.5, -1, 0.2), poleL: new THREE.Vector3(-0.6, -0.9, 0.2), // elbows down
    recoil: { z: 0.03, rx: 0.1, ry: 0.01 }, sprint: [0.0, -0.015, 0.03, -0.3, 0.22, 0.28],
  },
};
