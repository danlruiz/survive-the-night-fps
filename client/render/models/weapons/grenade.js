// Frag grenade: a Mk 2 "pineapple" at real size (6.4 cm across the body, 9.5 cm with the fuze). Cast-iron egg cut into
// 8 columns x 5 rows of knobs by its grooves, olive drab worn back to dark iron on the knobs' corners; the fuze on top
// with its striker housing, the spoon (safety lever) down the +Z side under the palm, the cotter pin through the fuze
// and its pull ring hanging on the -X side, where the other hand finds it. Long axis +Y, the grip at the body's middle.
import * as THREE from 'three';
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { fbm3 } from '../skinning.js';
import { PI, profile, latheY, boxR, M, R, gunGrip, SPRINT } from './parts.js';

const FRAG = { yc: -0.006, a: 0.037, R: 0.032, cols: 8, rows: 5, y0: -0.041, y1: 0.025 };
const fragR = (y) => FRAG.R * Math.sqrt(Math.max(0, 1 - ((y - FRAG.yc) / FRAG.a) ** 2));
// how much of a knob's face (1) or groove (0) is at (angle, height): the cast segments of the body
function fragKnob(phi, y) {
  const u = (((phi / (PI * 2)) * FRAG.cols) % 1 + 1) % 1;
  const v = (y - FRAG.y0) / (FRAG.y1 - FRAG.y0);
  if (v <= 0 || v >= 1) return 0.4;
  const vr = (v * FRAG.rows) % 1;
  const ss = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  return ss(0.0, 0.16, Math.min(u, 1 - u)) * ss(0.0, 0.16, Math.min(vr, 1 - vr));
}
function buildGrenade(P) {
  const hi = P.hi;
  const B = P.get('body');
  // the cast body: a lathed egg, its radius pushed in along the grooves
  // (8 columns: a ring of 3 or 6 to a column, its first vertex on a groove; each of the 5 rows sampled from its groove
  // up, so every groove is a vertex line and stays crisp even on the 3rd-person model)
  const ring = R(hi, 48, 24);
  const ys = [FRAG.yc - FRAG.a, FRAG.yc - FRAG.a * 0.94, FRAG.yc - FRAG.a * 0.8];
  const steps = hi ? [0, 0.1, 0.24, 0.5, 0.76, 0.9] : [0, 0.25, 0.75];
  for (let k = 0; k < FRAG.rows; k++) for (const t of steps) ys.push(FRAG.y0 + ((k + t) / FRAG.rows) * (FRAG.y1 - FRAG.y0));
  ys.push(FRAG.y1, 0.027, 0.0295);
  const prof = ys.map((y, i) => new THREE.Vector2(i ? fragR(y) : 0, y));
  const body = new THREE.LatheGeometry(prof, ring);
  {
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-6) continue;
      const k = 1 - 0.13 * (1 - fragKnob(Math.atan2(z, x), y));
      p.setXYZ(i, x * k, y, z * k);
    }
  }
  B.geom(0, body, {
    region: WR.PLAIN,
    color: [0.2, 0.23, 0.12],
    mottle: 0.14,
    mf: 140,
    // olive drab paint, darker down in the grooves, rubbed back to iron on the knobs' sharp corners
    tint: (p, n, c) => {
      const kn = fragKnob(Math.atan2(p.z, p.x), p.y);
      c.multiplyScalar(0.62 + 0.38 * kn);
      const wear = kn > 0.55 && kn < 0.9 ? (fbm3(p.x * 300, p.y * 300, p.z * 300, 2, 5) > 0.58 ? 1 : 0) : 0;
      if (wear) c.lerp(new THREE.Color(0.2, 0.2, 0.19), 0.7);
    },
  });
  // filler plug in the base
  latheY(B, [[0, -0.0442], [0.0072, -0.0442], [0.0078, -0.0425], [0.0078, -0.039], [0, -0.039]], 0, 0, { ...M.gunDark, rs: R(hi, 12, 7), sharp: true });
  // fuze: threaded collar, body, striker housing with the lever's pivot ears
  const rs = R(hi, 14, 8);
  latheY(B, [[0, 0.024], [0.0112, 0.024], [0.0116, 0.026], [0.0116, 0.031], [0.0098, 0.0325], [0, 0.0325]], 0, 0, { ...M.gun, rs, sharp: true });
  latheY(B, [[0, 0.032], [0.0086, 0.032], [0.0086, 0.041], [0.0102, 0.0418], [0.0102, 0.0468], [0.0088, 0.0488], [0.004, 0.0505], [0, 0.0505]], 0, 0, { ...M.steel, color: [0.6, 0.62, 0.58], rs, sharp: true });
  if (hi) for (let i = 0; i < 6; i++) latheY(B, [[0.0117, 0.0262 + i * 0.0008], [0.0121, 0.0265 + i * 0.0008], [0.0117, 0.0268 + i * 0.0008]], 0, 0, { ...M.gun, rs });
  for (const s of [-1, 1]) boxR(B, s * 0.0058 - 0.0016, s * 0.0058 + 0.0016, 0.038, 0.0475, 0.006, 0.0128, { ...M.steel, color: [0.56, 0.58, 0.54], round: 0.3, seg: 2 });
  // the spoon: a strip of pressed steel hooked over the striker, then down the side, hugging the body to its waist
  // (its inner face: over the striker, down the fuze, then a millimetre off the knobs, flaring at the tip)
  const spoonOuter = [[0.001, 0.0512], [0.0102, 0.051], [0.0118, 0.0488], [0.0122, 0.041], [0.0128, 0.0338]];
  for (let y = 0.03; y > -0.017; y -= 0.0045) spoonOuter.push([Math.max(fragR(y), 0.0128) + 0.001, y]);
  spoonOuter.push([fragR(-0.0195) + 0.0026, -0.0195]);
  const th = 0.0016;
  const spoonInner = spoonOuter.map(([z, y], i) => {
    const a = spoonOuter[Math.max(0, i - 1)];
    const b = spoonOuter[Math.min(spoonOuter.length - 1, i + 1)];
    const tz = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tz, ty) || 1;
    return [z + (ty / l) * -th, y - (tz / l) * -th];
  });
  // (profile: f = -z, u = y; the strip is 1.3 cm wide, a little narrower where it hooks over the top)
  const pts = [...spoonOuter.map(([z, y]) => [-z, y]), ...spoonInner.reverse().map(([z, y]) => [-z, y])];
  profile(B, pts, 0.013, { region: WR.PLAIN, color: [0.24, 0.26, 0.15], mottle: 0.1, bevel: 0.0005, curveSegs: 2, widthFn: (f, u) => (u > 0.045 ? 0.72 : 1) });
  // cotter pin through the fuze head, crimped over on the +X side, the pull ring on the -X side
  const pinY = 0.0442, pinZ = 0.0066;
  B.seg(0, [-0.0128, pinY, pinZ], [0.0118, pinY, pinZ], 0.0011, 0.0011, { ...M.steel, color: [1.05, 1.03, 0.96], rs: 5, hs: 1 });
  B.tube(0, [[0.0118, pinY, pinZ], [0.0142, pinY - 0.0016, pinZ + 0.0012], [0.0152, pinY - 0.0052, pinZ + 0.0024]], 0.001, 0.001, { ...M.steel, color: [1.05, 1.03, 0.96], rs: 4, ts: R(hi, 6, 3) });
  B.tube(0, [[0.0118, pinY, pinZ - 0.0004], [0.0138, pinY + 0.0018, pinZ - 0.002], [0.0145, pinY + 0.0048, pinZ - 0.0034]], 0.001, 0.001, { ...M.steel, color: [1.05, 1.03, 0.96], rs: 4, ts: R(hi, 6, 3) });
  const pull = new THREE.TorusGeometry(0.0108, 0.0012, R(hi, 6, 4), R(hi, 22, 12));
  B.geom(0, pull, { ...M.steel, color: [1.1, 1.08, 1.0], rot: [0.25, 0.35, 0], at: [-0.0236, pinY - 0.0036, pinZ - 0.001] });
  P.meta.muzzle = null;
}

export default {
  id: ITEM.GRENADE,
  build: buildGrenade,
  lay: [0, 0.55, PI / 2 - 0.12, 'YXZ'], // on the ground on its side, its spoon up
  vm: { kind: 'throw', hip: [0.13, -0.12, -0.3, 0.3, 0.35, -0.12], rPose: 'ball', rGrip: { p: [0, 0, 0], q: gunGrip(0.0) }, sprint: SPRINT.throwable },
  poses: {
    ball: { curl: [[0.87, 0.99, 0.69], [0.82, 0.94, 0.66], [0.76, 0.87, 0.6], [0.67, 0.77, 0.54]], spread: 0.0, thumb: [[-0.59, -0.26, -0.77], [-0.38, -0.92, -0.05]], center: [-0.0475, -0.075, 0] }, // frag grenade
  },
};
