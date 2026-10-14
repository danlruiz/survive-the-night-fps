// Pump shotgun
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { profile, latheZ, cylZ, barrelZ, boxR, M, R, gunGrip, supportGrip, trigger, triggerGuard } from './parts.js';

// The parts the double-barrel shares with it (the same maker's furniture):
// the bead front sight, on the rib at height y
export function bead(mb, y, z) {
  mb.ellip(0, [0, y, z], [0.0023, 0.0023, 0.0023], { region: WR.PLAIN, color: 0xd8d0b0, ws: 6, hs: 4 });
}

// the checkered panels either side of the stock's wrist
export function wristCheckering(mb) {
  for (const s of [-1, 1]) profile(mb, [[-0.05, 0.05], [-0.1, 0.04], [-0.1, -0.02], [-0.06, 0.0]], 0.001, { ...M.walnut, color: [0.55, 0.5, 0.5], bevel: 0, x: s * 0.0191 });
}

// a shell, its brass head to the rear: the red hull r thick, the rim rimR, at x (drawn about its own origin)
export function shotgunShell(mb, x, r, rimR) {
  cylZ(mb, x, 0, 0.0, -0.052, r, { region: WR.PLAIN, color: 0xa01810, rs: 10 });
  cylZ(mb, x, 0, 0.012, 0.0, rimR, { ...M.brass, rs: 10 });
}

function buildShotgun(P) {
  const hi = P.hi;
  const B = P.get('body');
  // authoring origin: receiver rear bottom; shift so the stock wrist is the grip origin
  const O = [0, -0.035, -0.058]; // added to authored coords at the end (stock wrist -> origin)
  // receiver
  boxR(B, -0.019, 0.019, 0.018, 0.068, 0.03, -0.19, M.gun);
  cylZ(B, 0, 0.066, 0.03, -0.19, 0.019, { ...M.gun, rs: R(hi, 14, 8), sx: 1 });
  if (hi) {
    boxR(B, 0.0185, 0.0194, 0.042, 0.07, -0.06, -0.135, M.black); // ejection port
    boxR(B, -0.012, 0.012, 0.0172, 0.019, -0.035, -0.16, M.black); // loading port
    boxR(B, 0.0188, 0.0196, 0.028, 0.036, -0.05, -0.058, M.gunDark); // pins
    boxR(B, 0.0188, 0.0196, 0.028, 0.036, -0.15, -0.158, M.gunDark);
    // receiver top groove (sight)
    boxR(B, -0.003, 0.003, 0.084, 0.0855, 0.02, -0.18, M.black);
  }
  // trigger group
  boxR(B, -0.009, 0.009, 0.004, 0.019, 0.02, -0.075, M.gun);
  triggerGuard(B, hi, [[0, 0.006, 0.012], [0, -0.012, 0.005], [0, -0.016, -0.03], [0, -0.006, -0.062], [0, 0.006, -0.07]], 0.0032, M.gun);
  trigger(B, [[0, 0.006, -0.02], [0, -0.006, -0.024], [0, -0.012, -0.018]]);
  // stock (walnut)
  profile(B, [[-0.03, 0.074], [-0.085, 0.058], [-0.38, 0.03], [-0.38, -0.108], [-0.3, -0.085], [-0.2, -0.062], [-0.12, -0.035], [-0.075, -0.012], [-0.045, 0.006], [-0.03, 0.018]], 0.038, { ...M.walnut, bevel: 0.005, curveSegs: 4 });
  if (hi) wristCheckering(B);
  profile(B, [[-0.38, 0.032], [-0.402, 0.032], [-0.402, -0.111], [-0.38, -0.111]], 0.04, { ...M.polyDark, bevel: 0.003 }); // recoil pad
  // barrel + vent rib + bead
  barrelZ(B, 0, 0.062, -0.19, -0.72, 0.0118, 0.0092, { ...M.gun, rs: R(hi, 14, 8) });
  if (hi) {
    boxR(B, -0.004, 0.004, 0.0775, 0.0795, -0.2, -0.712, M.gun);
    for (let i = 0; i < 9; i++) boxR(B, -0.0015, 0.0015, 0.071, 0.078, -0.23 - i * 0.055, -0.236 - i * 0.055, M.gun);
  }
  bead(B, 0.0815, -0.706);
  // magazine tube + cap
  cylZ(B, 0, 0.036, -0.19, -0.63, 0.0108, { ...M.gun, rs: R(hi, 12, 7) });
  latheZ(B, [[0, 0.628], [0.0128, 0.628], [0.0128, 0.64], [0.0122, 0.642], [0.0128, 0.645], [0.0128, 0.658], [0.009, 0.664], [0, 0.664]], 0, 0.036, { ...M.gunDark, rs: R(hi, 12, 7), sharp: true });
  boxR(B, -0.008, 0.008, 0.036, 0.062, -0.605, -0.62, M.gun); // barrel clamp
  // pump (forend) — separate part
  const PU = P.get('pump');
  const pp = [[0, 0.27]];
  const grooves = hi ? 9 : 0;
  pp.push([0.0195, 0.27], [0.021, 0.275]);
  for (let i = 0; i < grooves; i++) {
    const f = 0.29 + i * 0.016;
    pp.push([0.0215, f], [0.0198, f + 0.003], [0.0198, f + 0.007], [0.0215, f + 0.01]);
  }
  pp.push([0.0215, 0.43], [0.0195, 0.44], [0, 0.44]);
  latheZ(PU, pp, 0, 0.042, { ...M.walnut, rs: R(hi, 14, 8), sx: 1.12, sharp: hi });
  boxR(PU, -0.0135, -0.0105, 0.033, 0.041, -0.12, -0.28, M.gun); // action bars
  boxR(PU, 0.0105, 0.0135, 0.033, 0.041, -0.12, -0.28, M.gun);
  // spare shell (for loading anims)
  if (P.split) {
    const SH = P.get('shell');
    shotgunShell(SH, 0, 0.0105, 0.0112);
  }
  // shift so the stock wrist is the grip origin
  const sh = P.shift(O, ['shell']);
  P.meta.muzzle = sh(0, 0.062, -0.722);
  P.meta.leftHand = sh(0, 0.041, -0.355);
  P.meta.sight = sh(0, 0.0845, -0.706); // front bead (ADS pivots around it)
  P.meta.loadPort = sh(0, 0.014, -0.1);
}

export default {
  id: ITEM.SHOTGUN,
  build: buildShotgun,
  vm: {
    kind: 'shotgun', hip: [0.2, -0.19, -0.2, 0.03, 0.17, 0.0], ads: 0.22, adsZ: -0.79, adsPitch: 0.1,
    rPose: 'wristGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.75) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'pumpSupport' },
    recoil: { z: 0.06, rx: 0.12, ry: 0.02 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the pump
    pumpSupport: { curl: [[0.45, 0.52, 0.36], [0.62, 0.71, 0.78], [0.74, 0.85, 0.65], [0.75, 0.86, 0.6]], spread: 0.02, thumb: [[-0.56, -0.79, 0.23], [0, -0.79, -0.61]], center: [-0.0443, -0.088, 0] }, // pump shotgun
    // the right hand round the stock's wrist
    wristGrip: { curl: [[0.14, 0.16, 0.4], [0.18, 0.2, 0.14], [0.31, 1.08, 0.75], [0.37, 0.72, 0.8]], spread: 0, thumb: [[-0.13, -0.87, -0.48], [0.37, -0.79, -0.48]], center: [-0.0378, -0.083, 0] }, // pump shotgun
  },
};
