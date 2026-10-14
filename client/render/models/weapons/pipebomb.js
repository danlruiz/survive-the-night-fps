// Pipe bomb: a rusty pipe with end caps, taped, a fuse out of the top
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { PI, latheY, M, R, gunGrip, SPRINT } from './parts.js';

function buildPipebomb(P) {
  const hi = P.hi;
  const B = P.get('body');
  latheY(B, [[0, -0.075], [0.021, -0.075], [0.021, 0.075], [0, 0.075]], 0, 0, { ...M.rust, rs: R(hi, 12, 8), sharp: true });
  for (const s of [-1, 1]) {
    const y0 = s < 0 ? -0.098 : 0.072, y1 = s < 0 ? -0.072 : 0.098;
    latheY(B, [[0, y0], [0.026, y0], [0.027, y0 + 0.003], [0.027, y1 - 0.003], [0.026, y1], [0, y1]], 0, 0, { ...M.gun, rs: 6, sharp: true });
  }
  latheY(B, [[0, -0.028], [0.0222, -0.028], [0.0222, 0.026], [0, 0.026]], 0, 0, { ...M.tapeGrey, rs: R(hi, 12, 8), sharp: true });
  if (hi) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3;
      B.seg(0, [Math.cos(a) * 0.0232, -0.05, Math.sin(a) * 0.0232], [Math.cos(a) * 0.0232, 0.045, Math.sin(a) * 0.0232], 0.0017, 0.0017, { ...M.steel, rs: 4, hs: 1 });
    }
  }
  B.tube(0, [[0, 0.098, 0], [0.002, 0.118, 0], [0.012, 0.132, 0.004], [0.025, 0.13, 0.012], [0.03, 0.12, 0.02]], 0.0022, 0.002, { region: WR.PLAIN, color: 0x2a2018, rs: 5, ts: R(hi, 10, 5) });
  P.meta.flame = new THREE.Vector3(0.03, 0.12, 0.02);
}

export default {
  id: ITEM.PIPEBOMB,
  build: buildPipebomb,
  vm: { kind: 'throw', hip: [0.16, -0.2, -0.34, 0.1, 0.2, -0.2], rPose: 'pipe', rGrip: { p: [0, 0, 0], q: gunGrip(0.0) }, sprint: SPRINT.throwable },
  poses: {
    pipe: { curl: [[0.79, 0.97, 0.67], [0.81, 1.09, 0.76], [0.79, 1.0, 0.7], [0.68, 0.78, 0.54]], spread: 0.0, thumb: [[-0.56, -0.38, -0.73], [-0.96, 0.13, -0.26]], center: [-0.0415, -0.08, 0] }, // pipe bomb
  },
};
