// road flare: red paper tube (long axis +Y), ignition button on top, black cap + wire stand on the tail
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { latheY, M, R, gunGrip, SPRINT } from './parts.js';

function buildFlare(P) {
  const hi = P.hi;
  const B = P.get('body');
  const rs = R(hi, 12, 7);
  latheY(B, [[0, -0.092], [0.0158, -0.092], [0.0166, -0.086], [0.0166, 0.098], [0.0158, 0.103], [0, 0.103]], 0, 0, { region: WR.PLAIN, color: 0xa81c12, mottle: 0.08, rs, sharp: true });
  // printed band + warning stripe
  latheY(B, [[0.0167, 0.004], [0.0169, 0.006], [0.0169, 0.05], [0.0167, 0.052]], 0, 0, { region: WR.PLAIN, color: 0xd8cfb0, mottle: 0.06, rs, sharp: true });
  latheY(B, [[0.0169, 0.018], [0.0171, 0.019], [0.0171, 0.03], [0.0169, 0.031]], 0, 0, { region: WR.PLAIN, color: 0xc89a18, mottle: 0.04, rs, sharp: true });
  // ignition compound on the striking end
  latheY(B, [[0, 0.102], [0.0142, 0.102], [0.0132, 0.112], [0.006, 0.116], [0, 0.116]], 0, 0, { region: WR.PLAIN, color: 0x2b1c12, mottle: 0.1, rs });
  // struck cap pushed onto the tail as a handle, ribbed
  latheY(B, [[0, -0.108], [0.0188, -0.108], [0.0194, -0.1], [0.0194, -0.058], [0.0178, -0.054], [0, -0.054]], 0, 0, { ...M.polyDark, rs, sharp: true });
  if (hi) for (let i = 0; i < 3; i++) { const y = -0.096 + i * 0.012; latheY(B, [[0.0194, y], [0.0202, y + 0.002], [0.0202, y + 0.005], [0.0194, y + 0.007]], 0, 0, { ...M.polyDark, rs, sharp: true }); }
  // wire stand
  for (const s of [-1, 1]) B.seg(0, [s * 0.006, -0.105, 0], [s * 0.022, -0.16, 0.006], 0.0012, 0.0012, { ...M.steel, rs: 4, hs: 1 });
  P.meta.flame = new THREE.Vector3(0, 0.12, 0);
}

export default {
  id: ITEM.FLARE,
  build: buildFlare,
  vm: { kind: 'throw', hip: [0.16, -0.2, -0.35, 0.12, 0.2, -0.25], rPose: 'flare', rGrip: { p: [0, 0, 0], q: gunGrip(0.0) }, sprint: SPRINT.throwable },
  poses: {
    flare: { curl: [[0.8, 1.22, 0.85], [0.84, 1.33, 0.92], [0.81, 1.26, 0.88], [0.77, 0.94, 0.65]], spread: 0.0, thumb: [[-0.73, -0.61, -0.3], [-0.87, -0.5, 0]], center: [-0.0345, -0.083, 0] }, // road flare
  },
};
