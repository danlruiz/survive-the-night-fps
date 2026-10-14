// Molotov cocktail: a bottle of fuel, a label, a rag stuffed in the neck
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { latheY, R, gunGrip, SPRINT } from './parts.js';

function buildMolotov(P) {
  const hi = P.hi;
  const B = P.get('body');
  latheY(B, [[0, -0.08], [0.028, -0.08], [0.0325, -0.076], [0.0335, -0.06], [0.0335, 0.045], [0.03, 0.066], [0.02, 0.088], [0.0128, 0.104], [0.0118, 0.15], [0.0135, 0.154], [0.0135, 0.16], [0.011, 0.162], [0.0, 0.162]], 0, 0, {
    region: WR.GLASS,
    color: [0.42, 0.36, 0.2],
    rs: R(hi, 14, 8),
    mottle: 0.08,
    swapUV: false,
    // liquid line: darker below
    tint: (p, n, c) => {
      if (p.y < 0.03) c.multiplyScalar(0.6);
    },
  });
  // label (partial wrap)
  const lab = new THREE.CylinderGeometry(0.0342, 0.0342, 0.06, R(hi, 12, 6), 1, true, -1.2, 3.6);
  B.geom(0, lab, { region: WR.RAG, uv: [1, 0.35, 0, 0], color: [0.95, 0.88, 0.7], at: [0, -0.005, 0] });
  // rag stuffed in the neck: crumpled wad + hanging strips
  B.tube(0, [[0, 0.125, 0], [0.001, 0.165, 0.001], [0.004, 0.19, 0.003], [0.01, 0.203, 0.006]], 0.0105, 0.009, { region: WR.RAG, color: [0.9, 0.86, 0.78], rs: 7, ts: R(hi, 8, 4), noise: 0.003, nf: 120 });
  B.ellip(0, [0.008, 0.205, 0.005], [0.014, 0.01, 0.012], { region: WR.RAG, color: [0.85, 0.8, 0.72], ws: 7, hs: 5, noise: 0.003, nf: 150, rot: [0.3, 0.4, 0.5] });
  B.box(0, [0.012, 0.15, 0.008], [0.014, 0.05, 0.0025], { region: WR.RAG, color: [0.9, 0.85, 0.76], rot: [0.1, 0.5, -0.15] });
  B.box(0, [-0.009, 0.152, -0.006], [0.012, 0.042, 0.0025], { region: WR.RAG, color: [0.85, 0.8, 0.7], rot: [-0.1, -0.6, 0.2] });
  P.meta.flame = new THREE.Vector3(0.008, 0.215, 0.005);
}

export default {
  id: ITEM.MOLOTOV,
  build: buildMolotov,
  vm: { kind: 'throw', hip: [0.17, -0.235, -0.38, 0.12, 0.2, -0.2], rPose: 'bottle', rGrip: { p: [0, 0, 0], q: gunGrip(0.0) }, sprint: SPRINT.throwable },
  poses: {
    bottle: { curl: [[0.67, 0.77, 0.54], [0.7, 0.88, 0.61], [0.69, 0.79, 0.55], [0.56, 0.64, 0.45]], spread: 0.0, thumb: [[-0.79, -0.13, -0.6], [-0.71, 0, -0.71]], center: [-0.05, -0.08, 0] }, // molotov
  },
};
