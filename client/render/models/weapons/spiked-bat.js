// Spiked bat: the bat, nailed and wound with barbed wire, bloodied
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { mulberry32 } from '../skinning.js';
import { batBody } from './bat.js';
import { PI, M, Q } from './parts.js';

function buildSpikedBat(P) {
  const hi = P.hi;
  const B = P.get('body');
  batBody(B, hi);
  const rnd = mulberry32(777);
  const nails = hi ? 26 : 16;
  for (let i = 0; i < nails; i++) {
    const f = 0.36 + rnd() * 0.34;
    const a = rnd() * PI * 2;
    const r = f < 0.4 ? 0.03 : 0.032;
    const dx = Math.cos(a), dy = Math.sin(a);
    const len = 0.03 + rnd() * 0.025;
    const tilt = (rnd() - 0.5) * 0.4;
    B.spike(0, [dx * r * 0.8, dy * r * 0.8, -f], [dx * (r + len), dy * (r + len), -f + tilt * len], 0.0022, { ...(rnd() < 0.5 ? M.rust : M.steel), rs: 4 });
    if (hi) B.ellip(0, [dx * r * 0.98, dy * r * 0.98, -f], [0.0035, 0.0035, 0.0035], { ...M.rust, ws: 5, hs: 3 });
  }
  // barbed wire helix
  const pts = [];
  const turns = 2.6, N = hi ? 64 : 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = t * turns * PI * 2;
    const f = 0.3 + t * 0.36;
    const r = (f < 0.4 ? 0.0265 : 0.0335) + 0.002;
    pts.push([Math.cos(a) * r, Math.sin(a) * r, -f]);
  }
  B.tube(0, pts, 0.0017, 0.0017, { ...M.rust, rs: 4, ts: N * 2, cap: false });
  if (hi) {
    for (let i = 2; i < N; i += 5) {
      const p = pts[i];
      B.spike(0, p, [p[0] * 1.35, p[1] * 1.35, p[2] + 0.004], 0.0012, { ...M.rust, rs: 3 });
      B.spike(0, p, [p[0] * 1.25 - p[1] * 0.2, p[1] * 1.25 + p[0] * 0.2, p[2] - 0.004], 0.0012, { ...M.rust, rs: 3 });
    }
  }
  // blood soaking the barrel
  B.blood([0.03, 0.0, -0.55], 0.06, 1);
  B.blood([-0.02, 0.025, -0.66], 0.05, 1);
  B.blood([0.0, -0.03, -0.42], 0.045, 0.9);
  B.bloodColor.setRGB(0.12, 0.004, 0.004);
  P.meta.leftHand = new THREE.Vector3(0, 0, 0.078);
}

export default {
  id: ITEM.SPIKED_BAT,
  build: buildSpikedBat,
  vm: { kind: 'melee', twoHand: true, hip: [0.17, -0.2, -0.3, 1.2, 0.3, 0.15], rPose: 'batR', rGrip: { p: [0, 0, 0], q: Q(0, 0, 0) }, lGrip: { q: Q(0, 0, 0), pose: 'batL' }, swingPoleL: new THREE.Vector3(0, -1, 0.5), sprint: [0.05, -0.05, 0.08, -0.4, 0.1, 0] },
};
