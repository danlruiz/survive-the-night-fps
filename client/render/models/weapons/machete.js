// Machete: polymer scales, a long rust-spotted blade
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { fbm3 } from '../skinning.js';
import { profile, M, Q } from './parts.js';

function buildMachete(P) {
  const hi = P.hi;
  const B = P.get('body');
  // handle scales
  profile(B, [[-0.082, 0.012], [-0.088, 0.004], [-0.086, -0.012], [-0.075, -0.016], [0.0, -0.015], [0.04, -0.016], [0.055, -0.018], [0.055, 0.013], [0.0, 0.013]], 0.024, { ...M.polyDark, color: [1.3, 1.1, 0.9], bevel: 0.004 });
  if (hi) for (const f of [-0.06, -0.015, 0.03]) B.seg(0, [-0.0125, -0.001, -f], [0.0125, -0.001, -f], 0.0032, 0.0032, { ...M.steel, rs: 6, hs: 1, caps: 1, capScale: 0.1 });
  // blade
  profile(B, [[0.05, 0.012], [0.25, 0.014], [0.44, 0.016], [0.5, 0.012], [0.525, -0.004], [0.515, -0.026], [0.49, -0.04], [0.4, -0.043], [0.25, -0.037], [0.1, -0.029], [0.05, -0.022]], 0.0042, {
    ...M.blade,
    bevel: 0.0014,
    curveSegs: 3,
    tint: (p, n, c) => {
      const r = fbm3(p.x * 40, p.y * 60, p.z * 30, 3, 5);
      if (r > 0.52) c.lerp(new THREE.Color(0.35, 0.14, 0.05), Math.min(1, (r - 0.52) * 5));
      if (p.y < -0.03) c.multiplyScalar(1.25); // sharpened edge
    },
  });
  P.meta.muzzle = null;
}

export default {
  id: ITEM.MACHETE,
  build: buildMachete,
  vm: { kind: 'melee', hip: [0.16, -0.19, -0.3, 0.95, 0.3, 0.1], rPose: 'macheteGrip', rGrip: { p: [0, 0, 0], q: Q(0, 0, 0) }, sprint: [0.03, -0.05, 0.06, -0.4, 0.1, 0] },
  poses: {
    macheteGrip: { curl: [[0.49, 1.41, 0.98], [0.5, 1.52, 1.06], [0.5, 1.45, 1.01], [0.48, 1.14, 0.79]], spread: 0, thumb: [[-0.79, -0.61, -0.1], [-0.7, -0.71, -0.09]], center: [-0.0294, -0.083, 0] },
  },
};
