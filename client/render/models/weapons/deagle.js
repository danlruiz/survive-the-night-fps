// Desert Eagle (gas-operated hand cannon)
// Held as the pistol is: the same grip outline, trigger and magazine well, so the same hands fit it. Above them it is
// all steel and much bigger: a tall flat-sided slide behind a long fixed barrel with the polygonal top rib, a squared
// trigger guard. Parts (viewmodel): body, slide (rides back over the barrel), mag.
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { profile, cylZ, boxR, M, R, handQ } from './parts.js';

const DE_STEEL = { region: WR.STEEL, color: [0.82, 0.82, 0.85], mottle: 0.05 };
const DE_STEEL_DARK = { region: WR.STEEL, color: [0.62, 0.62, 0.66], mottle: 0.05 };
function buildDeagle(P) {
  const hi = P.hi;
  const B = P.get('body');
  const BY = 0.0645; // bore axis
  // frame + a long dust cover out under the barrel
  profile(B, [[-0.012, 0.047], [-0.012, 0.03], [0.02, 0.028], [0.12, 0.028], [0.2, 0.034], [0.206, 0.047]], 0.024, { ...DE_STEEL_DARK, bevel: 0.002 });
  // grip: the pistol's outline (its hands were fitted to it), black rubber panels over steel
  profile(B, [[-0.016, 0.037], [-0.004, 0.029], [-0.046, -0.08], [0.0, -0.08], [0.006, -0.064], [0.013, -0.057], [0.011, -0.048], [0.02, -0.037], [0.018, -0.028], [0.027, -0.015], [0.026, -0.006], [0.036, 0.012], [0.042, 0.029]], 0.029, { ...M.polyDark, bevel: 0.003 });
  if (hi) for (const s of [-1, 1]) profile(B, [[-0.006, 0.01], [-0.034, -0.062], [-0.004, -0.062], [0.018, 0.0]], 0.001, { ...M.black, bevel: 0, x: s * 0.0146 }); // panel texture
  // squared trigger guard + trigger
  B.tube(0, [[0, 0.029, -0.04], [0, 0.006, -0.046], [0, 0.0, -0.066], [0, 0.0, -0.096], [0, 0.006, -0.101], [0, 0.028, -0.1]], 0.0036, 0.0036, { ...DE_STEEL_DARK, rs: 5, ts: R(hi, 12, 6), cap: false });
  B.tube(0, [[0, 0.03, -0.062], [0, 0.017, -0.064], [0, 0.01, -0.058]], 0.0028, 0.0022, { ...M.gunDark, rs: 5, ts: 4 });
  // the barrel: a lower block the width of the slide, the narrower upper flats over it, a rib along the top
  profile(B, [[0.108, 0.047], [0.248, 0.047], [0.248, 0.07], [0.108, 0.07]], 0.026, { ...DE_STEEL, bevel: 0.0015 });
  profile(B, [[0.108, 0.068], [0.248, 0.068], [0.248, 0.083], [0.243, 0.0865], [0.108, 0.0865]], 0.021, { ...DE_STEEL, bevel: 0.0015 });
  boxR(B, -0.004, 0.004, 0.086, 0.09, -0.108, -0.247, DE_STEEL_DARK); // top rib
  cylZ(B, 0, BY, -0.06, -0.11, 0.0095, { ...M.steel, rs: 10 }); // the barrel's breech end, seen as the slide rides back
  cylZ(B, 0, BY, -0.248, -0.2492, 0.0062, { ...M.black, rs: 10 }); // muzzle bore
  boxR(B, -0.002, 0.002, 0.09, 0.0935, -0.236, -0.244, DE_STEEL_DARK); // front sight blade
  if (hi) {
    boxR(B, -0.0134, -0.0128, 0.052, 0.064, -0.13, -0.236, M.black); // barrel flats' engraved line
    boxR(B, 0.0128, 0.0134, 0.052, 0.064, -0.13, -0.236, M.black);
  }
  // mag (the pistol's: same well, seven fat rounds instead of twelve)
  const MG = P.get('mag');
  const ga = Math.atan2(0.042, 0.109);
  const magLen = 0.105;
  const magStart = MG.parts.length;
  MG.box(0, [0, -magLen / 2, 0], [0.021, magLen, 0.03], { ...M.polyDark });
  MG.box(0, [0, -magLen - 0.004, 0.001], [0.027, 0.009, 0.042], { ...DE_STEEL_DARK, round: 0.35, seg: 2 });
  const magGeoRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ga);
  for (let i = magStart; i < MG.parts.length; i++) {
    const part = MG.parts[i];
    part.geo.applyQuaternion(magGeoRot);
    part.geo.translate(0, 0.025, -0.013);
    part.geo.computeVertexNormals();
  }
  P.pivot('mag', new THREE.Vector3(0, 0.025, -0.013));
  P.meta.magAxis = new THREE.Vector3(0, -Math.cos(ga), Math.sin(ga));
  // slide: tall and flat-sided, chamfered along the top
  const S = P.get('slide');
  profile(S, [[-0.022, 0.047], [0.11, 0.047], [0.11, 0.083], [0.104, 0.088], [-0.016, 0.088], [-0.022, 0.082]], 0.03, { ...DE_STEEL, bevel: 0.0015 });
  if (hi) {
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) boxR(S, s * 0.0149, s * 0.0157, 0.053, 0.08, 0.008 - i * 0.0045, 0.0065 - i * 0.0045, M.black);
    boxR(S, 0.004, 0.0152, 0.084, 0.0882, -0.03, -0.07, M.black); // ejection port
    // rear sight (notch)
    boxR(S, -0.011, -0.0024, 0.088, 0.0955, 0.004, -0.004, M.gunDark);
    boxR(S, 0.0024, 0.011, 0.088, 0.0955, 0.004, -0.004, M.gunDark);
    boxR(S, -0.011, 0.011, 0.088, 0.0915, 0.004, -0.004, M.gunDark);
  } else {
    boxR(S, -0.011, 0.011, 0.088, 0.0945, 0.004, -0.004, M.gunDark);
  }
  P.meta.muzzle = new THREE.Vector3(0, BY, -0.252);
  P.meta.leftHand = new THREE.Vector3(-0.028, -0.02, -0.012);
  P.meta.sight = new THREE.Vector3(0, 0.0935, 0.0);
  P.meta.slideGrab = new THREE.Vector3(0, 0.0725, 0.0); // (as far under the top as the pistol's: the slide is taller)
}

export default {
  id: ITEM.DEAGLE,
  build: buildDeagle,
  vm: {
    // held exactly as the pistol is (the same grip outline under it, so the same fitted hands and poses), with a much
    // harder kick: the muzzle climbs and the gun comes back further
    kind: 'pistol', hip: [0.11, -0.158, -0.29, 0.09, 0.18, -0.06], ads: 0.2, adsZ: -0.42,
    rPose: 'trigger', rGrip: { p: [0, 0, -0.007], q: handQ(1, [0.435, -0.325, -0.84], [-0.9, -0.157, -0.406]) },
    lGrip: { p: [0, -0.02, -0.007], q: handQ(-1, [-0.199, -0.354, -0.914], [0.98, -0.072, -0.185]), pose: 'cup' },
    poleR: new THREE.Vector3(0.5, -1, 0.2), poleL: new THREE.Vector3(-0.6, -0.9, 0.2),
    recoil: { z: 0.05, rx: 0.2, ry: 0.025 }, sprint: [0.0, -0.015, 0.03, -0.3, 0.22, 0.28],
  },
};
