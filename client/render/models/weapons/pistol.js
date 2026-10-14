// Pistol (polymer striker-fired)
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { profile, cylZ, boxR, M, handQ, GRIPS, trigger, triggerGuard } from './parts.js';

const SIGHT_DOT = { region: WR.PLAIN, color: 0xe8e8d0, glow: 0.3 }; // the white dots on the sights

// A rear sight: two posts gap either side of the middle, from y0 up to yPost, on a plate up to yBase, from z0 to z1.
// The Desert Eagle's is the same, taller.
export function rearNotch(mb, gap, y0, yPost, yBase, z0, z1) {
  boxR(mb, -0.011, -gap, y0, yPost, z0, z1, M.gunDark);
  boxR(mb, gap, 0.011, y0, yPost, z0, z1, M.gunDark);
  boxR(mb, -0.011, 0.011, y0, yBase, z0, z1, M.gunDark);
}

// The magazine ('mag'): drawn upright, then laid along the grip's rake with its pivot at its top, where it leaves the
// well. baseMat is its base plate's material. The Desert Eagle's is the same (the same well).
export function pistolMag(P, baseMat) {
  const MG = P.get('mag');
  const ga = Math.atan2(0.042, 0.109); // grip angle
  const magLen = 0.105;
  const magStart = MG.parts.length; // in world mode MG === body builder: only transform the mag's own parts
  MG.box(0, [0, -magLen / 2, 0], [0.021, magLen, 0.03], { ...M.polyDark });
  MG.box(0, [0, -magLen - 0.004, 0.001], [0.027, 0.009, 0.042], { ...baseMat, round: 0.35, seg: 2 });
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
}

function buildPistol(P) {
  const hi = P.hi;
  const B = P.get('body');
  // frame + dust cover
  profile(B, [[-0.012, 0.047], [-0.012, 0.03], [0.02, 0.028], [0.1, 0.028], [0.155, 0.032], [0.162, 0.047]], 0.024, { ...M.poly, bevel: 0.002 });
  if (hi) for (let i = 0; i < 3; i++) boxR(B, -0.0121, 0.0121, 0.029, 0.034, -0.12 - i * 0.012, -0.126 - i * 0.012, M.polyDark);
  // grip (slanted, finger grooves)
  profile(B, GRIPS.pistol.grip, 0.029, { ...M.poly, bevel: 0.003 });
  if (hi) {
    // stipple panels
    for (const s of [-1, 1]) profile(B, GRIPS.pistol.panel, 0.001, { ...M.polyDark, bevel: 0, x: s * 0.0146 });
  }
  // trigger guard + trigger
  triggerGuard(B, hi, GRIPS.pistol.guard, 0.0036, M.poly);
  trigger(B, GRIPS.pistol.trigger, 0.0028, 0.0022, M.polyDark);
  // mag base (fixed part is only the grip; mag is separate)
  pistolMag(P, M.poly);
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
    rearNotch(S, 0.0022, 0.0805, 0.088, 0.084, 0.012, 0.004);
    // sight dots
    boxR(S, -0.007, -0.0045, 0.0845, 0.0865, 0.0038, 0.0034, SIGHT_DOT);
    boxR(S, 0.0045, 0.007, 0.0845, 0.0865, 0.0038, 0.0034, SIGHT_DOT);
  } else {
    boxR(S, -0.011, 0.011, 0.0805, 0.087, 0.012, 0.004, M.gunDark);
  }
  boxR(S, -0.0018, 0.0018, 0.0805, 0.0875, -0.152, -0.16, M.gunDark); // front sight
  if (hi) boxR(S, -0.0012, 0.0012, 0.0855, 0.0875, -0.1515, -0.152, SIGHT_DOT);
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
