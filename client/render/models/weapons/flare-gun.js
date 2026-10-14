// Flare gun (26.5mm break-open signal pistol)
// Moulded orange plastic, Orion style: a chunky grip and frame laid out like the pistol's (the same hands fit it),
// a fat smooth-bore barrel over them that tips down about a pin in front of the trigger guard, an exposed hammer.
// Parts (viewmodel): body, barrel (pivots on the hinge pin), hammer (pivots at its foot), shell (reload only).
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { profile, latheZ, cylZ, barrelZ, boxR, M, R, handQ } from './parts.js';

const FG_ORANGE = { region: WR.PLAIN, color: 0xe0601c, mottle: 0.06 };
const FG_SEAM = { region: WR.PLAIN, color: 0xa8401a, mottle: 0.05 };
function buildFlareGun(P) {
  const hi = P.hi;
  const B = P.get('body');
  const rs = R(hi, 16, 9);
  const BY = 0.058; // bore axis
  // grip: the pistol's outline, rounder at the front and flared at the butt
  profile(B, [[-0.03, 0.036], [-0.008, 0.03], [-0.047, -0.074], [-0.05, -0.085], [-0.044, -0.091], [0.004, -0.091], [0.009, -0.083], [0.013, -0.06], [0.022, -0.036], [0.03, -0.012], [0.038, 0.012], [0.044, 0.03]], 0.031, { ...FG_ORANGE, bevel: 0.004, curveSegs: 4 });
  if (hi) {
    // moulded grip panels + a lanyard loop at the butt
    for (const s of [-1, 1]) profile(B, [[-0.01, 0.016], [-0.038, -0.07], [-0.006, -0.07], [0.017, -0.004]], 0.001, { ...FG_SEAM, bevel: 0, x: s * 0.0156 });
    B.tube(0, [[-0.006, -0.092, 0.038], [-0.006, -0.102, 0.043], [0.006, -0.102, 0.043], [0.006, -0.092, 0.038]], 0.0018, 0.0018, { ...M.gunDark, rs: 5, ts: 6, cap: false });
  }
  // frame: standing breech over the hand, a lug under the barrel out to the hinge
  // (its top stays under the barrel's, so the barrel is the line the eye follows)
  profile(B, [[-0.034, 0.06], [-0.026, 0.07], [-0.003, 0.074], [-0.003, 0.038], [0.098, 0.036], [0.106, 0.029], [0.098, 0.02], [0.0, 0.022], [-0.034, 0.03]], 0.03, { ...FG_ORANGE, bevel: 0.003 });
  if (hi) for (const s of [-1, 1]) profile(B, [[-0.03, 0.04], [-0.006, 0.04], [-0.006, 0.064], [-0.024, 0.062]], 0.001, { ...FG_SEAM, bevel: 0, x: s * 0.0151 }); // side plate seam
  // trigger guard + trigger (where the pistol's are: the trigger finger finds it)
  B.tube(0, [[0, 0.024, -0.04], [0, 0.004, -0.046], [0, -0.003, -0.066], [0, -0.001, -0.093], [0, 0.023, -0.1]], 0.0042, 0.0042, { ...FG_ORANGE, rs: 6, ts: R(hi, 12, 6), cap: false });
  B.tube(0, [[0, 0.024, -0.062], [0, 0.013, -0.064], [0, 0.006, -0.058]], 0.003, 0.0024, { ...M.gunDark, rs: 5, ts: 4 });
  // barrel latch: a thumb lever on the left of the frame
  boxR(B, -0.0172, -0.0146, 0.061, 0.068, 0.002, 0.014, M.gunDark);
  // hinge pin through the lug
  B.seg(0, [-0.0158, 0.029, -0.106], [0.0158, 0.029, -0.106], 0.0042, 0.0042, { ...M.gunDark, rs: 8, hs: 1 });
  // barrel: fat moulded tube, black bore, a rib with a bump of a front sight, its own lug round the pin
  const BR = P.get('barrel');
  barrelZ(BR, 0, BY, -0.002, -0.168, 0.0215, 0.0142, { ...FG_ORANGE, rs });
  latheZ(BR, [[0.0215, 0.158], [0.0232, 0.16], [0.0232, 0.168], [0.0215, 0.169]], 0, BY, { ...FG_ORANGE, rs, sharp: true }); // muzzle lip
  latheZ(BR, [[0.0215, 0.002], [0.0228, 0.004], [0.0228, 0.016], [0.0215, 0.018]], 0, BY, { ...FG_SEAM, rs, sharp: true }); // breech collar
  cylZ(BR, 0, BY, -0.135, -0.163, 0.0141, { ...M.black, rs: R(hi, 12, 7) });
  boxR(BR, -0.0042, 0.0042, 0.0775, 0.0832, -0.012, -0.156, FG_ORANGE);
  boxR(BR, -0.0021, 0.0021, 0.0832, 0.0872, -0.148, -0.157, FG_SEAM);
  boxR(BR, -0.0098, 0.0098, 0.021, 0.043, -0.094, -0.118, FG_ORANGE);
  if (hi) for (const s of [-1, 1]) boxR(BR, s * 0.0214, s * 0.0219, 0.051, 0.065, -0.05, -0.11, FG_SEAM); // moulded flats
  P.pivot('barrel', new THREE.Vector3(0, 0.029, -0.106));
  // hammer, cocked: a broad ribbed spur standing up behind the breech
  const HM = P.get('hammer');
  profile(HM, [[-0.012, 0.062], [-0.004, 0.072], [-0.02, 0.09], [-0.036, 0.099], [-0.043, 0.094], [-0.03, 0.08], [-0.024, 0.06]], 0.009, { ...M.gunDark, bevel: 0.0015 });
  if (hi) for (let i = 0; i < 3; i++) boxR(HM, -0.0052, 0.0052, 0.093 - i * 0.003, 0.0965 - i * 0.003, 0.033 - i * 0.004, 0.0355 - i * 0.004, M.black);
  P.pivot('hammer', new THREE.Vector3(0, 0.064, 0.018));
  // a fresh shell (loading animation only): red paper hull, aluminium head; origin at its head, hull toward -Z
  if (P.split) {
    const SH = P.get('shell');
    cylZ(SH, 0, 0, -0.004, -0.094, 0.0128, { region: WR.PLAIN, color: 0xb0241a, rs: 12 });
    cylZ(SH, 0, 0, 0.0, -0.016, 0.0136, { ...M.steel, color: [0.92, 0.9, 0.86], rs: 12 });
    cylZ(SH, 0, 0, 0.0035, 0.0, 0.0152, { ...M.steel, color: [0.92, 0.9, 0.86], rs: 12 });
  }
  P.meta.muzzle = new THREE.Vector3(0, BY, -0.172);
  P.meta.leftHand = new THREE.Vector3(-0.028, -0.02, -0.012);
  P.meta.sight = new THREE.Vector3(0, 0.102, 0.0); // (no sights: the eye rides just over the hammer spur)
  P.meta.chamber = new THREE.Vector3(0, BY, -0.002);
}

export default {
  id: ITEM.FLARE_GUN,
  build: buildFlareGun,
  vm: {
    // held as the pistol is (its grip and trigger sit where the pistol's do); breakPistol: the reload tips the barrel
    // down about its hinge pin, pulls the spent case, thumbs a fresh shell in, snaps it shut and cocks the hammer
    kind: 'pistol', breakPistol: true, hip: [0.11, -0.158, -0.29, 0.09, 0.18, -0.06], ads: 0.2, adsZ: -0.42,
    rPose: 'flareGunR', rGrip: { p: [0, -0.004, -0.006], q: handQ(1, [0, -0.36, -0.93], [-1, 0, 0]) },
    lGrip: { p: [0, -0.028, -0.03], q: handQ(-1, [0.05, -0.55, -0.83], [0.92, 0.3, 0.15]), pose: 'cup' },
    poleR: new THREE.Vector3(0.5, -1, 0.2), poleL: new THREE.Vector3(-0.6, -0.9, 0.2),
    recoil: { z: 0.045, rx: 0.17, ry: 0.02 }, sprint: [0.0, -0.015, 0.03, -0.3, 0.22, 0.28],
  },
  poses: {
    flareGunR: { curl: [[0.42, 0.2, 0.19], [0.73, 1.23, 0.53], [0.68, 1.13, 0.47], [0.65, 0.62, 0.74]], spread: 0, thumb: [[0.15, -0.92, -0.35], [-0.23, -0.92, -0.3]], center: [-0.0404, -0.0755, -0.0123] }, // the flare gun's grip, the index on its trigger
  },
};
