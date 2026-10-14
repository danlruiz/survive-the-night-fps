// A Ka-Bar style fighting knife: stacked leather washers, oval steel guard and pommel, a clip-point blade
// with a fuller, flat sides and a brighter ground edge.
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { wrapCurls } from './hands.js';
import { PI, sectionZ, latheZ, cylZ, M, R, facetLoft, sstep, handQ } from './parts.js';

// Knife handle cross-section: an oval, narrow across the flats (X) and tall from spine to edge (Y). The 'knife'
// hand pose closes its fingers on this oval, so the two stay in step. tilt: how far the handle leans off square
// across the palm (rad), which points the blade along the forearm the way a real knife hand holds it.
const KNIFE_GRIP = { rx: 0.0122, ry: 0.015, tilt: 0.52 };
const KNIFE_HAND = [-0.027, -0.078, 0]; // the handle's centre in the hand's frame (its pose's center)

function buildKnife(P) {
  const hi = P.hi;
  const B = P.get('body');
  const { rx, ry } = KNIFE_GRIP;
  const sx = rx / ry;
  // handle: washers with a shallow seam between each, swelling a little under the palm
  const H0 = -0.0505, H1 = 0.068; // guard face .. pommel (z)
  const swell = (z) => 0.94 + 0.06 * Math.sin(PI * (z - H0) / (H1 - H0));
  const hp = [[0, -H1], [ry * swell(H1) * 0.96, -H1]];
  const washers = hi ? 16 : 1, seam = hi ? 0.0007 : 0;
  for (let i = 0; i < washers; i++) {
    const za = H1 - (i * (H1 - H0)) / washers, zb = H1 - ((i + 1) * (H1 - H0)) / washers;
    hp.push([ry * swell(za) - seam, -za], [ry * swell(za), -za + 0.0012], [ry * swell(zb), -zb - 0.0012]);
  }
  hp.push([ry * swell(H0) - seam, -H0], [0, -H0]);
  latheZ(B, hp, 0, 0, {
    region: WR.PLAIN,
    color: 0x5c3a24,
    mottle: 0.14,
    rs: R(hi, 14, 7),
    sx,
    tint: (p, n, c) => {
      if (!hi) return;
      const q = ((H1 - p.z) * washers) / (H1 - H0), fr = q - Math.floor(q);
      if (Math.floor(q) % 2) c.multiplyScalar(0.86); // each washer a slightly different hide
      if (fr < 0.1 || fr > 0.9) c.multiplyScalar(0.7); // dark seams
    },
  });
  // pommel: an oval steel cap with the tang's peened nut
  latheZ(B, [[0, -0.0838], [ry * 0.45, -0.0835], [ry * 0.78, -0.0815], [ry * 1.0, -0.077], [ry * 1.02, -0.0705], [ry * 0.95, -0.0675], [0, -0.0675]], 0, 0, { ...M.gunDark, rs: R(hi, 14, 7), sx });
  if (hi) cylZ(B, 0, 0, 0.0832, 0.0858, 0.0042, { ...M.steel, rs: 6 });
  // guard: an oval plate, longer below (it keeps the fingers off the edge); the quillon tips lean forward
  const G = [[-0.0062, 0.0168], [-0.0062, 0.0218, 0, 0.0218], [0.0062, 0.0218, 0.0062, 0.0168], [0.0062, -0.0232], [0.0062, -0.0282, 0, -0.0282], [-0.0062, -0.0282, -0.0062, -0.0232]];
  sectionZ(B, G, -0.0505, -0.0565, {
    ...M.gunDark,
    bevel: 0.0009,
    curveSegs: R(hi, 5, 2),
    shape: (p) => {
      p.z -= Math.max(0, Math.abs(p.y + 0.003) - 0.016) * 0.22;
    },
  });

  // blade: f = distance forward of the grip (-z), u = up (spine +Y, edge -Y)
  const F0 = 0.054, PLUNGE = 0.068, CLIP = 0.153, TIP = 0.238, UT = -0.0018;
  const top = (f) => {
    if (f < CLIP) return 0.0112;
    const t = (f - CLIP) / (TIP - CLIP);
    return 0.0112 + (UT - 0.0112) * (t + 0.6 * t * (1 - t)); // a hollow clip
  };
  const edge = (f) => (f < 0.138 ? -0.0163 : -0.0163 + (UT + 0.0163) * ((f - 0.138) / (TIP - 0.138)) ** 1.8);
  const rings = [];
  const N = hi ? 36 : 12;
  for (let i = 0; i <= N; i++) {
    const f = F0 + (TIP - F0) * (i / N) ** 0.92;
    const uT = top(f), uE = edge(f), z = -f;
    // distal taper, pinching to the point
    const w = 0.0024 * (1 - 0.3 * ((f - F0) / (TIP - F0))) * Math.min(1, (TIP - f) / 0.03) ** 0.6;
    const ground = sstep(PLUNGE - 0.012, PLUNGE + 0.006, f); // 0 on the blunt ricasso by the guard
    const uG = uE + 0.44 * (uT - uE) * ground; // grind line
    const wE = w + (0.00022 - w) * ground; // edge half-thickness
    const clip = sstep(CLIP - 0.008, CLIP + 0.03, f); // sharpened swedge along the clip
    const uS = Math.max(uG, uT - clip * Math.min(0.0042, 0.5 * (uT - uG)));
    const wS = w * (1 - 0.75 * clip);
    const side = [[wS, uT], [w, uS]];
    if (hi) {
      // fuller: a flat-bottomed groove that follows the spine and fades out at both ends
      const fr = sstep(0.07, 0.08, f) * (1 - sstep(0.148, 0.162, f));
      const fc = uT - 0.0062, fh = 0.0021 * Math.sqrt(fr), fd = 0.0008 * fr;
      const cl = (u) => Math.min(uS, Math.max(uG, u));
      side.push([w, cl(fc + fh)], [w - fd, cl(fc + fh * 0.45)], [w - fd, cl(fc - fh * 0.45)], [w, cl(fc - fh)]);
    }
    side.push([w, uG], [wE, uE]);
    const ring = side.map(([x, u]) => [x, u, z]);
    for (let k = side.length - 1; k >= 0; k--) ring.push([-side[k][0], side[k][1], z]);
    rings.push(ring);
  }
  const flat = { ...M.blade, mottle: 0.04 };
  const bright = { ...M.blade, color: [1.08, 1.08, 1.13], mottle: 0.03 }; // freshly ground
  const fuller = { ...M.blade, color: [0.66, 0.66, 0.7] };
  const n = rings[0].length / 2, last = n - 1; // points per side
  const mats = [];
  for (let k = 0; k < n * 2; k++) {
    const s = k < n ? k : n * 2 - 2 - k; // the matching face on the right side
    if (k === n * 2 - 1) mats.push({ ...M.blade, color: [0.78, 0.78, 0.82] }); // spine
    else if (s === 0 || s >= last - 1 || k === last) mats.push(bright); // swedge, edge bevel, edge
    else if (hi && s >= 2 && s <= 4) mats.push(fuller);
    else mats.push(flat);
  }
  facetLoft(B, rings, mats);
  P.meta.muzzle = null;
}

export default {
  id: ITEM.KNIFE,
  build: buildKnife,
  vm: {
    // held up the way a hand actually holds a knife: the wrist straight in line with the forearm (the elbow dropped,
    // poleR), the back of the hand toward the eye, the blade rising up and left out of the thumb side. The hip angles
    // were solved for that hand (a hammer grip can't point the blade along the forearm; this one used to need the
    // wrist bent ~95 degrees).
    kind: 'melee', hip: [0.18, -0.13, -0.34, 0.651, 1.414, 2.646], poleR: new THREE.Vector3(0.3, -0.9, 0.3),
    rPose: 'knife', rGrip: { p: [0, 0, 0], q: handQ(1, [0, -Math.cos(KNIFE_GRIP.tilt), -Math.sin(KNIFE_GRIP.tilt)], [-1, 0, 0]) }, sprint: [0.02, -0.05, 0.05, -0.3, 0.1, 0] },
  // the handle laid diagonally across the palm (KNIFE_GRIP.tilt), from the heel of the hand to the base of the index
  // finger, every finger closed on it and the thumb lying along its spine toward the guard
  poses: {
    knife: { curl: wrapCurls(KNIFE_HAND[0], KNIFE_HAND[1], KNIFE_GRIP.rx, KNIFE_GRIP.ry, 0.0007, Math.tan(KNIFE_GRIP.tilt)), spread: 0.0, thumb: [[-0.4, -0.88, -0.22], [-0.45, -0.84, -0.3]], center: KNIFE_HAND },
  },
};
