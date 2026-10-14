// Claw hammer: a wooden handle with a rubber grip, a steel head
import { ITEM } from '../../../../shared/defs.js';
import { profile, latheZ, boxR, M, R, Q } from './parts.js';

function buildHammer(P) {
  const hi = P.hi;
  const B = P.get('body');
  // handle: wood with rubber grip
  latheZ(B, [[0, -0.105], [0.0135, -0.104], [0.0145, -0.09], [0.0138, 0.03], [0.0118, 0.1], [0.0105, 0.19], [0.0, 0.195]], 0, 0, { ...M.ash, rs: R(hi, 12, 7), sx: 0.8 });
  latheZ(B, [[0, -0.108], [0.0148, -0.106], [0.016, -0.09], [0.0152, 0.03], [0.0138, 0.04], [0, 0.041]], 0, 0, { ...M.polyDark, color: [0.9, 0.3, 0.2], rs: R(hi, 12, 7), sx: 0.82 });
  // head: eye block, neck and face (toward -Y), claw (toward +Y, curving back)
  boxR(B, -0.012, 0.012, -0.018, 0.024, -0.182, -0.218, { ...M.gun, round: 0.25, seg: 2 });
  B.seg(0, [0, -0.018, -0.2], [0, -0.05, -0.2], 0.0105, 0.0125, { ...M.gun, rs: R(hi, 12, 8), hs: 1, caps: 1, capScale: 0.02 });
  B.seg(0, [0, -0.048, -0.2], [0, -0.058, -0.2], 0.0145, 0.0145, { ...M.steel, rs: R(hi, 12, 8), hs: 1, caps: 1, capScale: 0.02 });
  for (const s of [-1, 1]) {
    profile(B, [[0.182, 0.022], [0.218, 0.022], [0.21, 0.05], [0.19, 0.075], [0.165, 0.092], [0.158, 0.088], [0.176, 0.06], [0.185, 0.04]], 0.0085, { ...M.gun, bevel: 0.0015, curveSegs: 3, x: s * 0.0052 });
  }
  P.meta.muzzle = null;
}

export default {
  id: ITEM.HAMMER,
  build: buildHammer,
  vm: { kind: 'melee', hip: [0.16, -0.19, -0.3, 0.85, 0.25, 0.0], rPose: 'hammerGrip', rGrip: { p: [0, 0, 0], q: Q(0, 0, 0) }, sprint: [0.03, -0.05, 0.06, -0.4, 0.1, 0] },
  poses: {
    hammerGrip: { curl: [[0.78, 1.45, 1.01], [0.82, 1.53, 1.06], [0.75, 1.48, 1.03], [0.71, 1.2, 0.83]], spread: 0, thumb: [[-0.61, -0.71, -0.35], [-0.77, -0.61, -0.21]], center: [-0.0289, -0.083, 0] },
  },
};
