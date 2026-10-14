// Flamethrower (scrap-built: pipe lance, fuel bottle, gas bottle for a stock)
// The fuel bottle screws in from below like a magazine ('mag': swapped on reload); the gas valve on the left
// is the 'charge' part (the reload ends with a hand on it).
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { profile, latheZ, latheY, cylZ, barrelZ, boxR, M, R, gunGrip, supportGrip, GRIPS, trigger, triggerGuard, bandZ, rivets } from './parts.js';

function buildFlamethrower(P) {
  const hi = P.hi;
  const B = P.get('body');
  const AX = 0.068; // height of the lance
  const BZ = -0.118; // the fuel bottle hangs here
  const red = { region: WR.PLAIN, color: 0x9c2f1a, mottle: 0.12 };
  const blue = { region: WR.PLAIN, color: 0x3a5568, mottle: 0.12 };
  const hose = { region: WR.PLAIN, color: 0x16130f, mottle: 0.05 };
  // receiver: a welded box under a length of wide pipe that the lance, grip and bottles hang off, with a collar
  // for the fuel bottle
  boxR(B, -0.02, 0.02, 0.022, 0.07, 0.07, -0.17, M.gun);
  cylZ(B, 0, 0.07, 0.07, -0.17, 0.0215, { ...M.gun, rs: R(hi, 14, 8) });
  latheY(B, [[0, 0.004], [0.021, 0.004], [0.023, 0.008], [0.023, 0.024], [0, 0.024]], 0, BZ, { ...M.gunDark, rs: R(hi, 12, 7), sharp: true });
  if (hi) {
    rivets(B, 0.0202, 0.034, [0.05, -0.02, -0.15]);
    boxR(B, -0.0206, 0.0206, 0.05, 0.053, 0.06, -0.16, M.gunDark); // weld seam
  }
  // pistol grip (taped), strap trigger guard, trigger
  profile(B, GRIPS.a2.grip, 0.028, { ...M.tape, bevel: 0.004 });
  triggerGuard(B, hi, GRIPS.a2.guard, 0.003, M.gun);
  trigger(B, GRIPS.a2.trigger);
  // gas bottle behind the receiver (it is the stock), taped butt pad
  latheZ(B, [[0, -0.3], [0.022, -0.3], [0.034, -0.282], [0.034, -0.105], [0.02, -0.078], [0.011, -0.07], [0, -0.07]], 0, 0.058, { ...blue, rs: R(hi, 14, 8) });
  latheZ(B, [[0, -0.312], [0.03, -0.312], [0.034, -0.304], [0.034, -0.284], [0, -0.284]], 0, 0.058, { ...M.tape, rs: R(hi, 14, 8), sharp: true });
  if (hi) for (const z of [0.13, 0.23]) bandZ(B, z, 0.006, 0.034, 0.0355, 0, 0.058, { ...M.steel, rs: 14, sharp: true }); // hose clamps
  // lance: pipe, wooden sleeve for the support hand, finned heat shield, flared nozzle
  cylZ(B, 0, AX, -0.17, -0.61, 0.0125, { ...M.steel, rs: R(hi, 12, 7) });
  latheZ(B, [[0, 0.168], [0.024, 0.168], [0.024, 0.19], [0, 0.19]], 0, AX, { ...M.gun, rs: R(hi, 12, 7), sharp: true });
  cylZ(B, 0, AX, -0.2, -0.335, 0.0225, { ...M.walnut, rs: R(hi, 12, 7) });
  for (let i = 0, n = hi ? 6 : 3; i < n; i++) {
    const f = 0.39 + (i * 0.192) / n;
    latheZ(B, [[0.0125, f], [0.023, f], [0.023, f + 0.014], [0.0125, f + 0.014]], 0, AX, { ...M.gunDark, rs: R(hi, 12, 7), sharp: true });
  }
  barrelZ(B, 0, AX, -0.6, -0.672, 0.017, 0.02, { ...M.rust, r1: 0.03, rs: R(hi, 14, 8) });
  // pilot light: a thin gas line along the underside to a jet below the nozzle
  B.tube(0, [[0.0, 0.03, -0.17], [0, AX - 0.03, -0.36], [0, AX - 0.034, -0.56], [0, AX - 0.034, -0.655], [0, AX - 0.024, -0.675]], 0.0034, 0.0034, { ...M.brass, rs: 5, ts: R(hi, 14, 7) });
  if (hi) {
    for (const z of [-0.37, -0.5, -0.59]) boxR(B, -0.006, 0.006, AX - 0.04, AX - 0.012, z, z - 0.008, M.gunDark); // line clips
    // gas hose from the stock bottle round the right of the receiver
    B.tube(0, [[0.018, 0.078, 0.09], [0.032, 0.07, 0.04], [0.03, 0.05, -0.06], [0.024, 0.04, -0.15], [0.006, 0.034, -0.172]], 0.0042, 0.0042, { ...hose, rs: 5, ts: 12 });
  }
  // fuel bottle: neck up into the collar, a painted steel flask with a stencilled band
  const MG = P.get('mag');
  const rs = R(hi, 14, 8);
  latheY(MG, [[0, -0.2], [0.03, -0.2], [0.038, -0.19], [0.038, -0.04], [0.032, -0.018], [0.015, -0.006], [0.015, 0.016], [0, 0.016]], 0, BZ, { ...red, rs });
  latheY(MG, [[0.038, -0.13], [0.0388, -0.128], [0.0388, -0.082], [0.038, -0.08]], 0, BZ, { region: WR.PLAIN, color: 0xd9cfae, mottle: 0.08, rs, sharp: true });
  latheY(MG, [[0, -0.208], [0.024, -0.208], [0.03, -0.2], [0, -0.2]], 0, BZ, { ...M.gunDark, rs, sharp: true });
  P.pivot('mag', new THREE.Vector3(0, 0.016, BZ));
  // gas valve: a little hand wheel on the left
  const CH = P.get('charge');
  CH.seg(0, [-0.02, 0.07, -0.045], [-0.031, 0.07, -0.045], 0.004, 0.004, { ...M.steel, rs: 6, hs: 1 });
  CH.seg(0, [-0.031, 0.07, -0.045], [-0.036, 0.07, -0.045], 0.015, 0.015, { ...red, rs: R(hi, 10, 6), hs: 1 });

  P.meta.muzzle = new THREE.Vector3(0, AX, -0.69);
  P.meta.leftHand = new THREE.Vector3(0, AX - 0.004, -0.268);
  P.meta.sight = new THREE.Vector3(0, 0.112, 0.02); // no sights: the eye rides just over the lance
  P.meta.chargeKnob = new THREE.Vector3(-0.037, 0.07, -0.045);
  P.meta.magGrab = new THREE.Vector3(0, -0.1, BZ);
}

export default {
  id: ITEM.FLAMETHROWER,
  build: buildFlamethrower,
  vm: {
    // reloads like a rifle: the fuel bottle is the magazine, the gas valve the charging handle (the hand just opens it)
    kind: 'rifle', hip: [0.19, -0.19, -0.27, 0.03, 0.17, 0.0], ads: 0.2, adsZ: -0.2, chargeFire: false, chargeTravel: 0, chargeQ: [1.3, 0.1, 0],
    rPose: 'flamerGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.15) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'flamerSupport' },
    magPose: 'fuelBottle', recoil: { z: 0.004, rx: 0.004, ry: 0.006 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the handguard
    flamerSupport: { curl: [[0.49, 0.56, 0.39], [0.63, 0.72, 0.5], [0.71, 0.81, 0.56], [0.72, 0.83, 0.58]], spread: 0.02, thumb: [[-0.65, -0.71, 0.27], [0.05, -0.99, -0.12]], center: [-0.0548, -0.088, 0] }, // flamethrower
    // the right hand on the pistol grip: lower on it than the old fist (its middle finger clears the trigger guard and
    // the magazine to wrap the front of the grip), the index laid straight along the side of the guard
    flamerGrip: { curl: [[0.1, 0.1, 0.08], [0.72, 1.08, 0.76], [0.72, 0.96, 0.67], [0.64, 0.68, 0.48]], spread: 0, thumb: [[0.18, -0.71, -0.68], [-0.25, -0.97, -0.07]], center: [-0.0432, -0.083, -0.025] }, // flamethrower
    // the left hand on the fuel bottle as it comes out (reload)
    fuelBottle: { curl: [[0.26, 0.71, 0.5], [0.38, 0.86, 0.6], [0.57, 0.65, 0.59], [0.54, 0.62, 0.43]], spread: 0.02, thumb: [[-0.8, -0.5, -0.33], [-0.84, -0.26, -0.48]], center: [-0.035, -0.088, 0] },
  },
};
