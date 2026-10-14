// Revolver (six-shot, swing-out cylinder)
// A 4-inch service revolver: the pistol's grip outline and trigger guard (the same hands fit it) in walnut under a
// blued frame with a window for the cylinder, a ribbed barrel with an open ejector rod under it, an exposed hammer.
// Parts (viewmodel): body, cyl (the cylinder on its crane, swings out to the left about the crane pin), hammer,
// loader (a speedloader of six rounds, reload only).
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { PI, profile, latheZ, cylZ, barrelZ, boxR, M, R, handQ, GRIPS, trigger, triggerGuard } from './parts.js';

const RV_AXIS = 0.055; // the cylinder's axis
const RV_BORE = 0.068; // the bore: the top chamber lines up with it
const RV_CYL = [-0.03, -0.074]; // the cylinder's rear and front faces (z)
const RV_CRANE = new THREE.Vector3(-0.015, 0.037, 0); // the crane pin the cylinder swings out on
function buildRevolver(P) {
  const hi = P.hi;
  const B = P.get('body');
  const rs = R(hi, 16, 9);
  // grip: the pistol's, in walnut
  profile(B, GRIPS.pistol.grip, 0.029, { ...M.walnut, bevel: 0.003, curveSegs: 4 });
  if (hi) for (const s of [-1, 1]) B.ellip(0, [s * 0.0145, -0.012, -0.004], [0.0012, 0.004, 0.004], { ...M.gun, ws: 8, hs: 4 }); // grip screw
  // frame: the recoil shield and hammer housing behind the cylinder, the topstrap over it, the front of the window
  // and the strap under it
  // (the frame as wide as the pistol's and no further back, where the right hand's web and thumb lie along it)
  const FW = 0.024;
  profile(B, [[-0.014, 0.03], [-0.018, 0.05], [-0.016, 0.07], [-0.006, 0.083], [0.03, 0.083], [0.03, 0.03]], FW, { ...M.gun, bevel: 0.002 });
  profile(B, [[0.028, 0.0765], [0.08, 0.0765], [0.08, 0.083], [0.028, 0.083]], FW - 0.006, { ...M.gun, bevel: 0.0015 });
  profile(B, [[0.076, 0.03], [0.076, 0.083], [0.094, 0.0805], [0.098, 0.064], [0.098, 0.03]], FW - 0.004, { ...M.gun, bevel: 0.002 });
  profile(B, [[0.026, 0.029], [0.026, 0.034], [0.08, 0.034], [0.08, 0.029]], FW - 0.004, { ...M.gun, bevel: 0.0015 });
  if (hi) {
    boxR(B, -0.0122, -0.0118, 0.04, 0.07, 0.01, -0.02, M.gunDark); // side plate seam
    boxR(B, -0.0127, -0.0116, 0.062, 0.068, -0.004, -0.016, M.steel); // cylinder latch
  }
  // trigger guard + trigger (the pistol's: the trigger finger finds it)
  triggerGuard(B, hi, GRIPS.pistol.guard, 0.0036, M.gun);
  trigger(B, GRIPS.pistol.trigger, 0.0028, 0.0022);
  // barrel, a rib along its top, the front sight blade; the rear sight is a notch in the topstrap
  barrelZ(B, 0, RV_BORE, -0.09, -0.192, 0.0092, 0.0046, { ...M.gun, rs });
  boxR(B, -0.0035, 0.0035, 0.074, 0.08, -0.092, -0.19, M.gun);
  boxR(B, -0.0014, 0.0014, 0.08, 0.087, -0.172, -0.186, M.gunDark);
  boxR(B, -0.008, -0.0016, 0.083, 0.0865, 0.002, -0.008, M.gunDark);
  boxR(B, 0.0016, 0.008, 0.083, 0.0865, 0.002, -0.008, M.gunDark);
  // cylinder on its crane, with the ejector rod out in front
  const C = P.get('cyl');
  latheZ(C, [[0, -RV_CYL[0]], [0.0175, -RV_CYL[0]], [0.019, -RV_CYL[0] + 0.0025], [0.019, -RV_CYL[1] - 0.003], [0.0172, -RV_CYL[1]], [0, -RV_CYL[1]]], 0, RV_AXIS, { ...M.gun, rs: R(hi, 18, 10), sharp: true });
  if (hi) {
    // the six chamber mouths on its front face
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 2;
      cylZ(C, Math.cos(a) * 0.0128, RV_AXIS + Math.sin(a) * 0.0128, RV_CYL[1] + 0.001, RV_CYL[1] - 0.0004, 0.0046, { ...M.black, rs: 8 });
    }
  }
  cylZ(C, 0, RV_AXIS, RV_CYL[1] + 0.002, -0.15, 0.0026, { ...M.steel, rs: 8 });
  cylZ(C, 0, RV_AXIS, -0.148, -0.157, 0.0042, { ...M.steel, rs: 10 }); // its knurled head
  C.seg(0, [0, RV_AXIS, RV_CYL[1] - 0.003], [RV_CRANE.x, RV_CRANE.y, RV_CYL[1] - 0.003], 0.0045, 0.0045, { ...M.gun, rs: 8, hs: 1 });
  cylZ(C, RV_CRANE.x, RV_CRANE.y, RV_CYL[1] + 0.002, RV_CYL[1] - 0.012, 0.0045, { ...M.gun, rs: 8 });
  P.pivot('cyl', RV_CRANE.clone());
  // hammer, cocked: a chequered spur standing up behind the frame
  const HM = P.get('hammer');
  profile(HM, [[-0.012, 0.066], [-0.004, 0.08], [-0.018, 0.093], [-0.032, 0.099], [-0.038, 0.094], [-0.026, 0.084], [-0.022, 0.066]], 0.008, { ...M.gunDark, bevel: 0.0015 });
  if (hi) for (let i = 0; i < 3; i++) boxR(HM, -0.0046, 0.0046, 0.094 - i * 0.003, 0.0972 - i * 0.003, 0.028 - i * 0.004, 0.0305 - i * 0.004, M.black);
  P.pivot('hammer', new THREE.Vector3(0, 0.068, 0.018));
  // a speedloader (reload only): six rounds held round a black body with a knob. Origin where the cylinder's axis
  // meets its rear face once the rounds are home, the rounds toward -Z
  if (P.split) {
    const LD = P.get('loader');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 2, x = Math.cos(a) * 0.0128, y = Math.sin(a) * 0.0128;
      cylZ(LD, x, y, 0.0, -0.03, 0.0046, { ...M.brass, rs: 8 });
      latheZ(LD, [[0, 0.03], [0.0042, 0.03], [0.0038, 0.036], [0.002, 0.04], [0, 0.0405]], x, y, { ...M.steel, color: [0.75, 0.7, 0.66], rs: 8 });
    }
    cylZ(LD, 0, 0, 0.0005, 0.013, 0.0175, { ...M.black, rs: 14 });
    cylZ(LD, 0, 0, 0.013, 0.027, 0.0062, { ...M.polyDark, rs: 10 });
  }
  P.meta.muzzle = new THREE.Vector3(0, RV_BORE, -0.195);
  P.meta.leftHand = new THREE.Vector3(-0.028, -0.02, -0.012);
  P.meta.sight = new THREE.Vector3(0, 0.086, 0.002);
  P.meta.cylRear = new THREE.Vector3(0, RV_AXIS, RV_CYL[0]);
}

export default {
  id: ITEM.REVOLVER,
  build: buildRevolver,
  vm: {
    // held as the pistol is (its grip and trigger guard are the pistol's, so the pistol's hands are fitted to it);
    // revolver: the reload swings the cylinder out, the free hand brings a speedloader up into it, then flicks it shut
    kind: 'pistol', revolver: true, hip: [0.11, -0.158, -0.29, 0.09, 0.18, -0.06], ads: 0.2, adsZ: -0.42,
    rPose: 'trigger', rGrip: { p: [0, 0, -0.007], q: handQ(1, [0.435, -0.325, -0.84], [-0.9, -0.157, -0.406]) },
    lGrip: { p: [0, -0.02, -0.007], q: handQ(-1, [-0.199, -0.354, -0.914], [0.98, -0.072, -0.185]), pose: 'cup' },
    poleR: new THREE.Vector3(0.5, -1, 0.2), poleL: new THREE.Vector3(-0.6, -0.9, 0.2),
    recoil: { z: 0.04, rx: 0.16, ry: 0.015 }, sprint: [0.0, -0.015, 0.03, -0.3, 0.22, 0.28],
  },
};
