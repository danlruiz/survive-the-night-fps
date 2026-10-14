// Baseball bat: ash, a taped grip
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { latheZ, M, R, Q } from './parts.js';

// the bat itself (the spiked bat is this one, nailed)
export function batBody(B, hi) {
  const prof = [[0, -0.126], [0.017, -0.124], [0.0215, -0.117], [0.0205, -0.108], [0.0138, -0.098], [0.0138, 0.0], [0.0152, 0.1], [0.018, 0.2], [0.0245, 0.3], [0.03, 0.4], [0.0325, 0.5], [0.0332, 0.62], [0.0322, 0.7], [0.027, 0.733], [0.014, 0.744], [0, 0.746]];
  latheZ(B, prof, 0, 0, { ...M.ash, rs: R(hi, 14, 8) });
  // tape grip
  latheZ(B, [[0.0137, -0.098], [0.0153, -0.096], [0.0153, 0.11], [0.0137, 0.112]], 0, 0, { ...M.tape, rs: R(hi, 14, 8) });
  if (hi) for (let i = 0; i < 6; i++) latheZ(B, [[0.0153, -0.08 + i * 0.03], [0.0158, -0.078 + i * 0.03], [0.0158, -0.072 + i * 0.03], [0.0153, -0.07 + i * 0.03]], 0, 0, { ...M.tape, color: [0.35, 0.35, 0.37], rs: 14 });
}

function buildBat(P) {
  batBody(P.get('body'), P.hi);
  P.meta.leftHand = new THREE.Vector3(0, 0, 0.078);
}

export default {
  id: ITEM.BAT,
  build: buildBat,
  vm: { kind: 'melee', swing: 'bat', twoHand: true, hip: [0.17, -0.2, -0.3, 1.2, 0.3, 0.15], rPose: 'batR', rGrip: { p: [0, 0, 0], q: Q(0, 0, 0) }, lGrip: { q: Q(0, 0, 0), pose: 'batL' }, swingPoleL: new THREE.Vector3(0, -1, 0.5), sprint: [0.05, -0.05, 0.08, -0.4, 0.1, 0] },
  // (the spiked bat is held in these too)
  poses: {
    batR: { curl: [[0.79, 1.32, 0.92], [0.82, 1.42, 0.99], [0.8, 1.35, 0.94], [0.75, 1.05, 0.73]], spread: 0, thumb: [[-0.69, -0.61, -0.4], [-0.77, -0.61, -0.21]], center: [-0.0319, -0.083, 0] },
    batL: { curl: [[0.87, 1.22, 0.85], [0.92, 1.35, 0.94], [0.89, 1.26, 0.88], [0.62, 0.96, 0.67]], spread: 0, thumb: [[-0.03, -0.97, -0.26], [0.38, -0.92, -0.05]], center: [-0.035, -0.083, 0] },
  },
};
