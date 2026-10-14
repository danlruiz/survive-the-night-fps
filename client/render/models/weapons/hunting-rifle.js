// Bolt-action hunting rifle
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { PI, profile, latheZ, cylZ, barrelZ, boxR, M, R, gunGrip, supportGrip } from './parts.js';

function buildRifle(P) {
  const hi = P.hi;
  const B = P.get('body');
  const O = [0, 0.015, -0.025];
  // stock
  profile(B, [
    [-0.42, 0.042], [-0.14, 0.056], [-0.1, 0.05], [-0.07, 0.038], [-0.045, 0.048], [-0.03, 0.06], [0.2, 0.06], [0.42, 0.058],
    [0.44, 0.05], [0.438, 0.036], [0.2, 0.026], [0.11, 0.02], [0.03, 0.016], [0.014, 0.004], [0.002, -0.028],
    [-0.012, -0.056], [-0.036, -0.064], [-0.056, -0.05], [-0.066, -0.026], [-0.085, -0.02], [-0.2, -0.042], [-0.42, -0.082],
  ], 0.04, {
    ...M.walnut,
    bevel: 0.007,
    bevelSegs: hi ? 2 : 1,
    curveSegs: 4,
    // slimmer wrist and forend, full butt
    widthFn: (f, u) => (f > 0.05 ? 0.85 - Math.min(0.2, (f - 0.05) * 0.4) : f > -0.1 ? 0.8 : 0.8 + Math.min(0.25, (-0.1 - f) * 0.9)) * (u > 0.05 && f > -0.03 ? 0.9 : 1),
  });
  profile(B, [[-0.42, 0.05], [-0.435, 0.05], [-0.435, -0.08], [-0.42, -0.08]], 0.042, { ...M.polyDark, bevel: 0.003 }); // butt pad
  if (hi) {
    profile(B, [[-0.012, -0.059], [-0.038, -0.068], [-0.042, -0.064], [-0.016, -0.055]], 0.03, { ...M.polyDark, bevel: 0.001 }); // grip cap
    for (const s of [-1, 1]) profile(B, [[0.25, 0.05], [0.38, 0.05], [0.38, 0.03], [0.25, 0.028]], 0.001, { ...M.walnut, color: [0.6, 0.55, 0.55], bevel: 0, x: s * 0.0201 });
  }
  // receiver
  cylZ(B, 0, 0.07, 0.04, -0.16, 0.0165, { ...M.gun, rs: R(hi, 14, 8) });
  if (hi) boxR(B, 0.004, 0.0168, 0.078, 0.0852, -0.02, -0.1, M.black); // ejection port
  // floor plate + trigger guard + trigger
  boxR(B, -0.01, 0.01, 0.012, 0.018, -0.02, -0.12, M.gun);
  B.tube(0, [[0, 0.016, 0.02], [0, -0.004, 0.018], [0, -0.012, -0.005], [0, -0.004, -0.03], [0, 0.016, -0.038]], 0.0032, 0.0032, { ...M.gun, rs: 5, ts: R(hi, 12, 6), cap: false });
  B.tube(0, [[0, 0.016, -0.004], [0, 0.002, -0.006], [0, -0.004, 0.0]], 0.0025, 0.002, { ...M.gunDark, rs: 5, ts: 4 });
  // barrel (tapered)
  barrelZ(B, 0, 0.07, -0.16, -0.685, 0.0125, 0.004, { ...M.gun, r1: 0.0092, rs: R(hi, 12, 8) });
  // scope rings + bases (ring = outer band only, keeps the tube see-through from inside)
  for (const z of [0.02, -0.13]) {
    boxR(B, -0.008, 0.008, 0.084, 0.11, z + 0.007, z - 0.007, M.gun);
    latheZ(B, [[0.0152, -z - 0.007], [0.0152, -z + 0.007]], 0, 0.123, { ...M.gun, rs: R(hi, 14, 8), sharp: true });
  }
  // scope tube, bells (open, with inner surface)
  const srs = R(hi, 16, 8);
  // (outer surfaces + end rims only: from inside the tube everything is back-face culled -> see-through ADS)
  latheZ(B, [[0.0125, -0.088], [0.0125, 0.188]], 0, 0.123, { ...M.gun, rs: srs, sharp: true });
  latheZ(B, [[0.0152, -0.135], [0.018, -0.135], [0.018, -0.115], [0.0125, -0.086]], 0, 0.123, { ...M.gun, rs: srs, sharp: true });
  latheZ(B, [[0.0125, 0.186], [0.024, 0.235], [0.024, 0.268], [0.0212, 0.268]], 0, 0.123, { ...M.gun, rs: srs, sharp: true });
  if (hi) {
    // reticle wires inside the objective
    boxR(B, -0.021, 0.021, 0.12255, 0.12345, -0.25, -0.2505, { ...M.black });
    boxR(B, -0.00045, 0.00045, 0.102, 0.144, -0.25, -0.2505, { ...M.black });
  }
  // turrets (open at the tube side)
  const tur = [[0.0088, 0.0125], [0.0088, 0.03], [0.0, 0.03]].map((p) => new THREE.Vector2(p[0], p[1]));
  B.geom(0, new THREE.LatheGeometry(tur, R(hi, 10, 6)), { ...M.gun, at: [0, 0.123, -0.05] });
  B.geom(0, new THREE.LatheGeometry(tur, R(hi, 10, 6)), { ...M.gun, rot: [0, 0, -PI / 2], at: [0, 0.123, -0.05] });
  // bolt (separate)
  const BO = P.get('bolt');
  cylZ(BO, 0, 0.07, 0.085, 0.035, 0.012, { ...M.gun, rs: R(hi, 12, 7) }); // shroud
  cylZ(BO, 0, 0.07, 0.04, -0.03, 0.0095, { ...M.steel, rs: R(hi, 10, 6) });
  BO.tube(0, [[0.006, 0.07, 0.028], [0.03, 0.066, 0.03], [0.047, 0.052, 0.034]], 0.004, 0.0035, { ...M.steel, rs: 6, ts: 6 });
  BO.ellip(0, [0.05, 0.049, 0.035], [0.0085, 0.0085, 0.0085], { ...M.gun, ws: 8, hs: 6 });
  P.pivot('bolt', new THREE.Vector3(0, 0.07, 0.03));
  if (P.split) {
    const RD = P.get('round');
    cylZ(RD, 0, 0, 0.0, -0.05, 0.006, { ...M.brass, rs: 8 });
    latheZ(RD, [[0, 0.05], [0.0045, 0.05], [0.004, 0.062], [0.0015, 0.072], [0, 0.074]], 0, 0, { region: WR.STEEL, color: [0.95, 0.55, 0.35], rs: 8 });
  }
  for (const [name, mb] of P.map) if (name !== 'round') for (const part of mb.parts) part.geo.translate(O[0], O[1], O[2]);
  for (const k in P.pivots) P.pivots[k].add(new THREE.Vector3(O[0], O[1], O[2]));
  const sh = (x, y, z) => new THREE.Vector3(x + O[0], y + O[1], z + O[2]);
  P.meta.muzzle = sh(0, 0.07, -0.688);
  P.meta.leftHand = sh(0, 0.038, -0.3);
  P.meta.sight = sh(0, 0.123, 0.13);
  P.meta.boltKnob = sh(0.05, 0.049, 0.035);
  P.meta.port = sh(0.0, 0.1, -0.06);
}

export default {
  id: ITEM.HUNTING_RIFLE,
  build: buildRifle,
  vm: {
    kind: 'rifle', bolt: true, scope: true, hip: [0.19, -0.205, -0.3, 0.03, 0.17, 0.0], ads: 0.22, adsZ: -0.085,
    rPose: 'rifleGrip', rGrip: { p: [0, 0, 0], q: gunGrip(0.35) }, lGrip: { q: supportGrip(-0.4, 0.6, 0.0), pose: 'rifleSupport' },
    recoil: { z: 0.05, rx: 0.1, ry: 0.015 }, sprint: [-0.03, -0.015, 0.0, -0.22, 0.5, 0.35],
  },
  poses: {
    // the support hand under the fore-end
    rifleSupport: { curl: [[0.46, 0.52, 0.36], [0.63, 0.72, 0.85], [0.76, 0.87, 0.74], [0.77, 0.89, 0.62]], spread: 0.02, thumb: [[-0.37, -0.92, 0.1], [0.13, -0.99, 0]], center: [-0.0438, -0.088, 0] }, // hunting rifle
    // the right hand round the rifle's grip
    rifleGrip: { curl: [[0.41, 0.47, 0.86], [0.49, 1.02, 0.71], [0.48, 0.91, 0.64], [0.43, 0.49, 0.91]], spread: 0, thumb: [[0, -0.79, -0.61], [-0.07, -0.97, -0.25]], center: [-0.0415, -0.083, 0] }, // hunting rifle
  },
};
