// Procedural zombie dog. ONE rigidly-skinned SkinnedMesh like the zombies and the stray cat (see skinning.js):
// geometry is shared per coat, each instance owns its skeleton. Emaciated and mangy, lips peeled back off
// its teeth, clouded glowing eyes; per coat an exposed ribcage, a torn ear, a stump tail or an old collar.
// Procedural trot / gallop / bite / crouch / lunge / feed / stagger / death, blended by smoothed ZANIM
// weights. Faces -Z, meters, feet at y = 0. Same view interface as createZombie().
import * as THREE from 'three';
import { ZANIM } from '../../../shared/defs.js';
import { MeshBuilder, instantiateRig, setFx, getCharacterMaterial, fbm3, noise3, clamp, lerp, smooth } from './skinning.js';
import { CR } from './charTextures.js';
import { ringLoft, bound, chain } from './monsters.js';

const TAU = Math.PI * 2;

// bone bind positions (model space). The server hitbox is a body cylinder around the origin and a head
// sphere 0.5 m ahead of it at 0.58 m (ZOMBIE_DEFS[ZTYPE.DOG]).
const B = {
  hips: [0, 0.55, 0.24],
  chest: [0, 0.56, -0.16],
  neck: [0, 0.59, -0.3],
  head: [0, 0.625, -0.45],
  jaw: [0, 0.585, -0.5],
  ear: [0.048, 0.685, -0.465],
  tail: [[0, 0.6, 0.37], [0, 0.585, 0.46], [0, 0.56, 0.55]],
  tailEnd: [0, 0.53, 0.64],
  // front leg: shoulder -> elbow -> wrist -> paw
  fu: [0.1, 0.5, -0.2],
  fl: [0.1, 0.3, -0.16],
  fp: [0.1, 0.085, -0.19],
  fpaw: [0.1, 0.022, -0.225],
  // hind leg: hip -> stifle -> hock -> paw
  hu: [0.1, 0.52, 0.3],
  hk: [0.1, 0.32, 0.23],
  hh: [0.1, 0.14, 0.34],
  hpaw: [0.1, 0.022, 0.31],
};
const TAIL_N = B.tail.length;
/** Paw sole (ground contact) relative to the wrist (fp*) / hock (hh*) bone, for foot-planting measurements. */
export const DOG_SOLES = { fp: [0, -B.fp[1], B.fpaw[2] - 0.01 - B.fp[2]], hh: [0, -B.hh[1], B.hpaw[2] - 0.005 - B.hh[2]] };

// coats: fur, darker saddle over the back, pale belly/muzzle, ears (up / floppy), zombie damage
const COATS = [
  { name: 'shepherd', fur: 0x6e4e2e, saddle: 0x1d1814, belly: 0x9a7a52, ears: 'up', ribs: 1, collar: 0x5a2a1c, tongue: -1 },
  { name: 'husky', fur: 0x6f6c66, saddle: 0x3a3836, belly: 0xb4b0a6, ears: 'up', tornEar: -1, stump: true, oneEye: 1 },
  { name: 'black lab', fur: 0x201e1c, ears: 'flop', ribs: -1, collar: 0x8a1c14, flay: 1 },
  { name: 'mutt', fur: 0x5e3c24, belly: 0x8c6a48, ears: 'flop', tornEar: 1, tongue: 1, flay: -1 },
  { name: 'pit', fur: 0xa89c86, belly: 0xc4baa6, ears: 'up', ribs: -1, tornEar: 1, stump: true, oneEye: -1 },
];
// (tongue: lolling out of that side; oneEye: that socket empty; flay: that side of the muzzle bare to the bone)
export const DOG_COATS = COATS.length;
// The Alpha (ZTYPE.BOSS_ALPHA): the pack's leader, the same dog built heavier and drawn at ALPHA_SCALE. Near-black and
// mangier still, a ridge of bone spurs down its spine, longer fangs, eyes that burn red
const ALPHA = { name: 'alpha', fur: 0x24211e, saddle: 0x0c0b0a, belly: 0x45382e, ears: 'up', tornEar: 1, ribs: -1, alpha: true, bulk: 1.22, mange: 0.5, flay: 1 };
export const ALPHA_SCALE = 2.0;
// The crawler (ZTYPE.CRAWLER): a flying squirrel the infection has grown to the size of a cat, on the same rig, drawn at
// SQUIRREL_SCALE. Grey-brown over a cream belly, mangy, a flat, wide brush of a tail (flatTail), short round ears
// (earLen), huge eyes that burn amber in the dark (bigEyes: and a halo round each, SquirrelEyes) so that one up a tree
// is seen from far off, and hooked claws (claws: x a dog's) to take hold of bark, or a face. Its gliding membrane
// (Membrane) is drawn apart from the rig, stretched each frame from wrist to ankle down both flanks
const SQUIRREL = { name: 'squirrel', fur: 0x7a6c5c, saddle: 0x4c4036, belly: 0xd6cab0, ears: 'up', earLen: 0.036, flatTail: true, tailBulk: 2.5, bulk: 0.92, mange: 0.6, claws: 1.7, tornEar: -1, ribs: 1, bigEyes: true };
export const SQUIRREL_SCALE = 0.7;
// ...and low and long: a little wider, much lower on its legs, its body a dog's length (x, y, z of the drawn size)
const SQUIRREL_SHAPE = [1.1, 0.5, 0.74];
// its head: short and round, the snout pushed in (the head bone's scale, x y z)
const SQUIRREL_HEAD = [1.18, 1.08, 0.62];

const C_MANGE = new THREE.Color(0x7c6a64); // bald, diseased skin
const C_SCAB = new THREE.Color(0x3a1410);
const C_TEETH = 0xb8ab84;
const C_GUM = 0x4a0e10;

// per-part fur colouring; P/N are bind-pose model-space position/normal
function coatTint(coat, part, seed) {
  const saddle = coat.saddle != null ? new THREE.Color(coat.saddle) : null;
  const belly = coat.belly != null ? new THREE.Color(coat.belly) : null;
  return (P, N, C) => {
    if (saddle && (part === 'body' || part === 'neck')) {
      // dark saddle over the back and down the neck
      const k = smooth(clamp((P.y - 0.55 + (fbm3(P.x * 9, P.y * 9, P.z * 9, 2, 3) - 0.5) * 0.08) * 14, 0, 1));
      if (P.z > -0.3 && P.z < 0.36) C.lerp(saddle, k * 0.85);
    }
    if (coat.flatTail && part === 'tail' && saddle) C.lerp(saddle, smooth(clamp((P.z - 0.45) * 4, 0, 1)) * 0.7); // (darker to its tip)
    if (belly) {
      let b = 0;
      if (part === 'body') b = N.y < -0.35 ? 0.8 : 0;
      else if (part === 'neck') b = N.y < -0.2 ? 0.6 : 0;
      else if (part === 'head') b = P.y < 0.6 && P.z < -0.5 ? 0.7 : 0;
      else if (part === 'leg') b = P.y < 0.2 ? 0.55 : 0;
      if (b) C.lerp(belly, b);
    }
    // mange: bald, scabbed patches
    if (part !== 'paw') {
      const m = fbm3(P.x * 10 + seed, P.y * 10, P.z * 10, 3, 31);
      const t = coat.mange ?? 0.58;
      if (m > t) C.lerp(C_MANGE, clamp((m - t) * 9, 0, 0.9));
      if (m > t + 0.1) C.lerp(C_SCAB, clamp((m - t - 0.1) * 10, 0, 0.7));
    }
  };
}

function buildDog(coatIdx) {
  const coat = coatIdx === 'alpha' ? ALPHA : coatIdx === 'squirrel' ? SQUIRREL : COATS[coatIdx % COATS.length];
  const seed = coatIdx === 'alpha' ? 77.3 : coatIdx === 'squirrel' ? 41.9 : coatIdx * 13.7;
  const bk = coat.bulk || 1; // a heavier build: body, neck and legs this much thicker
  const hi = coat.alpha ? 1.4 : 1.12; // the Alpha is seen close and alone: a finer mesh
  const mb = new MeshBuilder();
  mb.addBone('root', null, 0, 0, 0);
  mb.addBone('hips', 'root', ...B.hips);
  mb.addBone('chest', 'hips', ...B.chest);
  mb.addBone('neck', 'chest', ...B.neck);
  mb.addBone('head', 'neck', ...B.head);
  mb.addBone('jaw', 'head', ...B.jaw);
  mb.addBone('earL', 'head', -B.ear[0], B.ear[1], B.ear[2]);
  mb.addBone('earR', 'head', B.ear[0], B.ear[1], B.ear[2]);
  for (let i = 0; i < TAIL_N; i++) mb.addBone('tail' + i, i ? 'tail' + (i - 1) : 'hips', ...B.tail[i]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    mb.addBone('fu' + n, 'chest', s * B.fu[0], B.fu[1], B.fu[2]);
    mb.addBone('fl' + n, 'fu' + n, s * B.fl[0], B.fl[1], B.fl[2]);
    mb.addBone('fp' + n, 'fl' + n, s * B.fp[0], B.fp[1], B.fp[2]);
    mb.addBone('hu' + n, 'hips', s * B.hu[0], B.hu[1], B.hu[2]);
    mb.addBone('hk' + n, 'hu' + n, s * B.hk[0], B.hk[1], B.hk[2]);
    mb.addBone('hh' + n, 'hk' + n, s * B.hh[0], B.hh[1], B.hh[2]);
  }
  const bi = (n) => mb.bi(n);
  const furs = {};
  const fur = (part) => furs[part] || (furs[part] = { color: coat.fur, region: CR.PLAIN, mottle: 0.22, mf: 40, tint: coatTint(coat, part, seed) });
  const plain = (color, o = {}) => ({ color, region: CR.PLAIN, mottle: 0.15, ao: false, ws: 6, hs: 4, ...o });
  const on = (bone, fn) => bound(mb, [bi(bone), 1, 0, 0], fn);
  const blend = (a, b, t) => (t <= 0 ? [a, 1, b, 0] : t >= 1 ? [b, 1, a, 0] : [a, 1 - t, b, t]);
  const G = (x) => Math.exp(-x * x);
  const raw = new THREE.Color(0x7a1c18);

  // ---- the trunk: one hide from the rump to the back of the skull, over a deep narrow ribcage, a tucked-up starved
  // loin and a bony rump; skinned across the loin, the shoulders and the neck so that it bends instead of telescoping
  const hips = bi('hips'), chest = bi('chest'), neck = bi('neck'), head = bi('head');
  const wz = (z) => (z > 0.14 ? [hips, 1, chest, 0] : z > -0.04 ? blend(hips, chest, (0.14 - z) / 0.18) : z > -0.23 ? [chest, 1, neck, 0] : z > -0.33 ? blend(chest, neck, (-0.23 - z) / 0.1) : z > -0.4 ? [neck, 1, head, 0] : blend(neck, head, (-0.4 - z) / 0.07));
  const trunk = [
    [0.445, 0.575, 0.026, 0.026, 0.034], [0.4, 0.568, 0.06, 0.05, 0.072], [0.32, 0.562, 0.078, 0.058, 0.098], [0.22, 0.556, 0.07, 0.056, 0.084],
    [0.12, 0.55, 0.066, 0.056, 0.078], [0.02, 0.546, 0.078, 0.062, 0.112], [-0.08, 0.542, 0.09, 0.07, 0.152], [-0.17, 0.546, 0.092, 0.076, 0.162],
    [-0.25, 0.56, 0.082, 0.076, 0.14], [-0.32, 0.586, 0.064, 0.066, 0.094], [-0.4, 0.616, 0.053, 0.055, 0.066], [-0.46, 0.636, 0.046, 0.046, 0.05],
  ];
  // the wound some of them carry: a flank torn open to the ribs (coat.ribs: which side)
  const rs = coat.ribs || 0;
  const inRip = (x, y, z) => (rs && x * rs > 0.03 ? 1 - Math.hypot((z + 0.13) / 0.105, (y - 0.5) / 0.085) - (fbm3(z * 14 + seed, y * 14, 2, 2, 5) - 0.5) * 0.5 : -1);
  ringLoft(mb, 'chest', trunk.map(([z, y, rx, ru, rd]) => ({ c: [0, y, z], rx: rx * bk, ru: ru * bk, rd: rd * bk, n: 2.25 })), {
    ...fur('body'), nu: Math.round(14 * hi), sub: 2, cap0: 0.02, wts: (p) => wz(p[2]),
    tear: rs ? { amt: 0, fn: (x, y, z) => inRip(x, y, z) > 0.08 } : null,
    dr: (s, a) => {
      const z = lerp(0.445, -0.46, s);
      const side = Math.abs(Math.sin(a));
      let d = 0;
      // ribs through the hide, the knobs of the spine, the points of the hips, the shoulder blades
      if (z < 0.07 && z > -0.24) d += 0.0055 * (Math.pow(Math.abs(Math.sin((z + 0.24) * 34)), 2) - 0.45) * smooth((side - 0.35) * 3) * smooth((0.07 - z) * 14) * smooth((z + 0.24) * 14) * (Math.cos(a) < 0.75 ? 1 : 0);
      d += 0.006 * G(a / 0.16) * (0.4 + 0.6 * Math.abs(Math.sin(z * 46))) * smooth((z + 0.3) * 8) + 0.006 * G((Math.PI * 2 - a) / 0.16) * (0.4 + 0.6 * Math.abs(Math.sin(z * 46))) * smooth((z + 0.3) * 8);
      d += 0.012 * G((z - 0.3) / 0.035) * (G((a - 0.75) / 0.3) + G((a - Math.PI * 2 + 0.75) / 0.3));
      d += 0.009 * G((z + 0.225) / 0.05) * (G((a - 0.6) / 0.35) + G((a - Math.PI * 2 + 0.6) / 0.35));
      d -= 0.008 * G((z - 0.12) / 0.07) * G((side - 1) / 0.5) * (Math.cos(a) < 0 ? 1 : 0.3); // the hollow of the flank
      return d * bk;
    },
    paint: (s, a, c, p) => {
      const z = p.z;
      if (z < 0.07 && z > -0.24 && Math.cos(a) < 0.75) c.multiplyScalar(0.82 + 0.3 * Math.pow(Math.abs(Math.sin((z + 0.24) * 34)), 2) * Math.abs(Math.sin(a)));
      if (rs) {
        const k = inRip(p.x, p.y, p.z);
        if (k > -0.45) c.lerp(raw, clamp((k + 0.45) * 2, 0, 0.9));
      }
    },
  });
  if (rs) {
    on('chest', () => {
      mb.ellip('root', [rs * 0.06 * bk, 0.5, -0.13], [0.03 * bk, 0.085, 0.1], plain(0x3a0a08, { region: CR.GORE, mottle: 0.3, blood: false, ws: 8, hs: 6 }));
      for (let i = 0; i < 5; i++) {
        const z = -0.215 + i * 0.04;
        mb.tube('root', [[rs * 0.062 * bk, 0.6, z], [rs * 0.094 * bk, 0.52, z + 0.008], [rs * 0.085 * bk, 0.425, z + 0.018]], 0.0072, 0.0058, { rs: 4, ts: 4, color: 0xd8ccb0, region: CR.BONE, blood: false, cap: false });
      }
    });
  }
  if (coat.collar != null) {
    // somebody's pet once
    const g = new THREE.TorusGeometry(0.062 * bk, 0.011, 5, 14);
    g.rotateX(0.31);
    g.translate(0, 0.598, -0.36);
    on('neck', () => {
      mb.geom('root', g, { color: coat.collar, region: CR.LEATHER, mottle: 0.2 });
      mb.box('root', [0, 0.528, -0.372], [0.022, 0.028, 0.004], { color: 0xb09a58, region: CR.PLAIN, mottle: 0.1, glow: 0.08 });
    });
  }

  // ---- the head: skull, stop and muzzle as one, the lips peeled back off the teeth
  const skull = [
    [-0.425, 0.64, 0.04, 0.042, 0.04], [-0.468, 0.645, 0.058, 0.056, 0.05], [-0.508, 0.646, 0.06, 0.048, 0.05], [-0.542, 0.636, 0.047, 0.036, 0.04],
    [-0.585, 0.627, 0.036, 0.029, 0.03], [-0.632, 0.622, 0.03, 0.025, 0.024], [-0.662, 0.62, 0.024, 0.02, 0.018],
  ];
  const flay = coat.flay || 0; // the side of the muzzle with the hide gone
  ringLoft(mb, 'head', skull.map(([z, y, rx, ru, rd]) => ({ c: [0, y, z], rx, ru, rd, n: 2.3 })), {
    ...fur('head'), nu: Math.round(12 * hi), sub: 2, cap1: 0.008,
    dr: (s, a) => {
      const z = lerp(-0.425, -0.662, s);
      const m = Math.PI * 2 - a;
      return 0.008 * G((z + 0.52) / 0.02) * (G((a - 0.75) / 0.3) + G((m - 0.75) / 0.3)) // brows over the eyes
        - 0.006 * G((z + 0.55) / 0.02) * (G((a - 1.2) / 0.3) + G((m - 1.2) / 0.3)) // the sockets
        + 0.007 * G((z + 0.495) / 0.03) * (G((a - 1.75) / 0.35) + G((m - 1.75) / 0.35)) // cheeks
        - 0.004 * G((z + 0.5) / 0.05) * G(a / 0.12) - 0.004 * G((z + 0.5) / 0.05) * G(m / 0.12); // the furrow up the forehead
    },
    paint: (s, a, c, p) => {
      if (p.z < -0.55 && p.y < 0.612) c.lerp(new THREE.Color(C_GUM), 0.85); // the lips drawn back: gum
      if (flay && p.x * flay > 0.012 && p.z < -0.5 && p.y < 0.65) c.lerp(raw, clamp((-0.5 - p.z) * 14, 0, 0.9) * (0.75 + 0.25 * Math.sin(p.y * 300)));
    },
  });
  on('head', () => mb.ellip('root', [0, 0.626, -0.664], [0.021, 0.017, 0.016], plain(0x141010, { mottle: 0.05 })));
  // the lower jaw (drops on its own bone)
  ringLoft(mb, 'jaw', [[-0.488, 0.592, 0.036, 0.012, 0.022], [-0.54, 0.586, 0.034, 0.012, 0.022], [-0.6, 0.582, 0.028, 0.011, 0.018], [-0.648, 0.582, 0.022, 0.01, 0.014]].map(([z, y, rx, ru, rd]) => ({ c: [0, y, z], rx, ru, rd, n: 2.3 })), {
    ...fur('head'), nu: Math.round(9 * hi), sub: 2, cap0: 0.006, cap1: 0.008,
    paint: (s, a, c) => Math.cos(a) > 0.2 && c.lerp(new THREE.Color(0x3a0a0c), 0.9), // the floor of the mouth
  });
  on('jaw', () => {
    // a tongue, lolling out of one side on some
    if (coat.tongue) mb.tube('root', [[0, 0.592, -0.55], [coat.tongue * 0.016, 0.594, -0.62], [coat.tongue * 0.034, 0.58, -0.66], [coat.tongue * 0.04, 0.55, -0.672]], 0.012, 0.007, { rs: 5, ts: 6, color: 0x7a2a34, region: CR.FLESH, blood: false, sx: 1 });
  });
  const tooth = plain(C_TEETH, { region: CR.BONE, blood: false, mottle: 0.25, rs: 4 });
  for (const s of [-1, 1]) {
    // teeth along both jaws: incisors across the front, the long canines, a ragged row of cheek teeth
    for (let i = 0; i < 6; i++) {
      const z = -0.535 - i * 0.022;
      const x = s * (0.034 - i * 0.0035);
      const fang = i === 5;
      const h = fang ? (coat.alpha ? 0.045 : 0.032) : 0.011 + (i % 2) * 0.005;
      on('head', () => mb.spike('root', [x, 0.603, z], [x * 0.97, 0.603 - h, z - (fang ? 0.004 : 0)], fang ? 0.0065 : 0.0048, tooth));
      if (i < 5) on('jaw', () => mb.spike('root', [x * 0.9, 0.588, z + 0.006], [x * 0.88, 0.588 + h * 0.85, z + 0.006], fang ? 0.0055 : 0.0042, tooth));
    }
    on('jaw', () => mb.spike('root', [s * 0.014, 0.588, -0.636], [s * 0.014, 0.588 + (coat.alpha ? 0.036 : 0.026), -0.64], 0.0052, tooth));
    for (let i = 0; i < 3; i++) on('head', () => mb.spike('root', [s * (0.005 + i * 0.008), 0.606, -0.668 + i * 0.004], [s * (0.005 + i * 0.008), 0.596, -0.67 + i * 0.004], 0.0036, tooth));
    // clouded, faintly glowing eyes in bruised sockets (one of them gone, on some). A flying squirrel's: huge, bulging,
    // burning amber (bigEyes)
    const ek = coat.bigEyes ? 1.9 : 1;
    on('head', () => {
      mb.ellip('root', [s * 0.04 * (coat.bigEyes ? 1.12 : 1), 0.656, -0.546], [0.015 * ek, 0.013 * ek, 0.011 * ek], plain(0x241010, { region: CR.GORE }));
      if (coat.oneEye !== s) mb.ellip('root', [s * 0.042 * (coat.bigEyes ? 1.16 : 1), 0.657, -0.552], [0.0098 * ek, 0.0088 * ek, 0.0072 * ek * 1.25], coat.alpha ? plain(0xff3a18, { region: CR.GLOW, glow: 1, mottle: 0, blood: false }) : coat.bigEyes ? plain(0xffb238, { region: CR.GLOW, glow: 1, mottle: 0, blood: false }) : plain(0xcfc47a, { glow: 0.45, mottle: 0, blood: false }));
    });
  }
  // ears: flattened four-sided cones; pricked or floppy, one torn short on some
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const torn = coat.tornEar === s;
    const len = torn ? 0.04 * (coat.earLen ? 0.6 : 1) : coat.earLen || 0.072;
    for (const inner of [false, true]) {
      const g = new THREE.ConeGeometry(inner ? 0.028 : 0.042, inner ? len * 0.75 : len, 4, 1);
      g.rotateY(Math.PI / 4);
      g.scale(1, 1, 0.34);
      g.translate(0, (inner ? len * 0.375 : len * 0.5) - 0.006, inner ? -0.006 : 0);
      const rot = coat.ears === 'flop' ? [-0.35, 0, -s * 2.1] : [0.15, 0, -s * 0.38];
      mb.geom('ear' + n, g, { rot, ...(inner ? plain(torn ? 0x4a1210 : 0x5c3a36, { region: CR.SKIN }) : fur('ear')) });
    }
  }

  // ---- the tail: one tapering loft down its bones, or a gnawed stump
  {
    const T = [B.tail[0], B.tail[1], B.tail[2], B.tailEnd];
    const tb = [bi('tail0'), bi('tail1'), bi('tail2')];
    if (coat.stump) {
      ringLoft(mb, 'tail0', [{ c: [0, 0.6, 0.36], rx: 0.03 }, { c: [0, 0.593, 0.41], rx: 0.026 }, { c: [0, 0.59, 0.435], rx: 0.02 }], { ...fur('tail'), nu: 7, sub: 1 });
      on('tail0', () => mb.ellip('root', [0, 0.59, 0.437], [0.02, 0.02, 0.012], plain(0x5a0c0a, { region: CR.GORE, blood: false })));
    } else {
      const tk = bk * (coat.tailBulk || 1); // (a flying squirrel's: a wide brush, flat as a feather: flatTail)
      const fl = coat.flatTail ? 0.32 : 1;
      const rings = coat.flatTail ? [0.032, 0.029, 0.026, 0.022, 0.016] : [0.032, 0.029, 0.023, 0.017, 0.008];
      ringLoft(mb, 'tail0', [[0, 0.6, 0.35], T[0], T[1], T[2], T[3]].map((c, i) => ({ c, rx: rings[i] * tk, ry: rings[i] * tk * fl })), {
        ...fur('tail'), nu: coat.flatTail ? 10 : 7, sub: coat.flatTail ? 3 : 2, cap1: 0.012,
        wts: (p) => (p[2] < T[1][2] - 0.02 ? [tb[0], 1, 0, 0] : p[2] < T[1][2] + 0.02 ? blend(tb[0], tb[1], (p[2] - T[1][2] + 0.02) / 0.04) : p[2] < T[2][2] - 0.02 ? [tb[1], 1, 0, 0] : p[2] < T[2][2] + 0.02 ? blend(tb[1], tb[2], (p[2] - T[2][2] + 0.02) / 0.04) : [tb[2], 1, 0, 0]),
        dr: (s, a) => 0.004 * Math.sin(a * 5 + s * 30), // a ragged, half-bald brush
      });
    }
  }

  // ---- legs: thin and long, the joints knobby, blended at the elbow / stifle and the wrist / hock; big splayed paws
  const mid = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const X = (p) => [s * p[0], p[1], p[2]];
    const jw = (a, b, c, y1, y2) => (p) => (p[1] > y1 + 0.028 ? [a, 1, b, 0] : p[1] > y1 - 0.028 ? blend(a, b, (y1 + 0.028 - p[1]) / 0.056) : p[1] > y2 + 0.02 ? [b, 1, c, 0] : p[1] > y2 - 0.02 ? blend(b, c, (y2 + 0.02 - p[1]) / 0.04) : [c, 1, 0, 0]);
    const leg = (rings, bone, w) => ringLoft(mb, bone, rings.map((r) => ({ c: X(r[0]), rx: r[1] * bk, ry: r[2] * bk })), { ...fur('leg'), nu: Math.round(8 * hi), sub: 2, up: [0, 0, -1], wts: w, cap0: 0.01, cap1: 0.008 });
    // front: the shoulder blade riding on the ribs, the upper arm, the forearm, the pastern
    leg([
      [[0.05, 0.6, -0.225], 0.022, 0.034], [mid([0.05, 0.6, -0.225], B.fu, 0.55), 0.03, 0.052], [B.fu, 0.036, 0.052], [mid(B.fu, B.fl, 0.5), 0.03, 0.042], [B.fl, 0.026, 0.033],
      [mid(B.fl, B.fp, 0.3), 0.024, 0.028], [mid(B.fl, B.fp, 0.75), 0.018, 0.02], [B.fp, 0.021, 0.022], [mid(B.fp, B.fpaw, 0.75), 0.019, 0.021],
    ], 'fu' + n, jw(bi('fu' + n), bi('fl' + n), bi('fp' + n), B.fl[1], B.fp[1]));
    // hind: a flat slab of thigh, the stifle, the long shank, the hock standing out behind
    leg([
      [[0.06, 0.585, 0.3], 0.024, 0.05], [mid(B.hu, B.hk, 0.2), 0.04, 0.086], [mid(B.hu, B.hk, 0.6), 0.036, 0.066], [B.hk, 0.028, 0.038], [mid(B.hk, B.hh, 0.45), 0.021, 0.028],
      [mid(B.hk, B.hh, 0.85), 0.018, 0.022], [B.hh, 0.02, 0.026], [mid(B.hh, B.hpaw, 0.5), 0.016, 0.018], [mid(B.hh, B.hpaw, 0.82), 0.018, 0.02],
    ], 'hu' + n, jw(bi('hu' + n), bi('hk' + n), bi('hh' + n), B.hk[1], B.hh[1]));
    for (const [bone, c, r] of [['fp' + n, [0.1, 0.02, -0.232], [0.028, 0.02, 0.04]], ['hh' + n, [0.1, 0.02, 0.305], [0.027, 0.019, 0.038]]]) {
      on(bone, () => {
        mb.ellip('root', X(c), [r[0] * bk, r[1], r[2] * bk], { ws: 7, hs: 4, ...fur('paw') });
        // four toes, a claw on each
        for (let t = 0; t < 4; t++) {
          const tx = (t - 1.5) * 0.013 * bk, tz = c[2] - r[2] * bk * (0.72 + (t === 1 || t === 2 ? 0.16 : 0));
          mb.ellip('root', [s * c[0] + tx, 0.014, tz], [0.0085 * bk, 0.011, 0.015 * bk], { ws: 5, hs: 3, ...fur('paw') });
          const cl = coat.claws || 1; // (a flying squirrel's: long hooked claws, for bark)
          mb.spike('root', [s * c[0] + tx, 0.013, tz - 0.011 * bk], [s * c[0] + tx * 1.05, 0.002 + 0.004 * (cl - 1), tz - (0.011 + 0.016 * cl) * bk], 0.0036 * bk, plain(0x1a1410, { region: CR.BONE, rs: 4 }));
        }
      });
    }
  }
  if (coat.alpha) {
    // bone spurs down the spine from the withers to the rump, raking back, the tallest over the shoulders
    const bone = { color: 0xd4c6a6, region: CR.BONE, blood: false, mottle: 0.25, rs: 4 };
    for (let i = 0; i < 7; i++) {
      const z = -0.25 + i * 0.085 + (i % 2) * 0.012;
      const y = 0.6 + 0.085 * bk - 0.004 * i - (z < -0.2 ? 0.0 : 0.012);
      const h = [0.062, 0.04, 0.07, 0.03, 0.05, 0.026, 0.034][i]; // (broken off short, some of them)
      bound(mb, wz(z), () => mb.spike('root', [0, y - 0.014, z], [(i % 3 - 1) * 0.012, y + h, z + h * 0.8], 0.016 + (i < 3 ? 0.004 : 0), bone));
    }
    // a ruff of matted fur over the neck and shoulders
    on('neck', () => mb.ellip('root', [0, 0.605, -0.27], [0.082, 0.066, 0.1], { ws: 10, hs: 7, noise: 0.018, nf: 34, ...fur('neck') }));
    // the chain it broke: twice round its neck, the end dragging
    chain(mb, (x, y, z) => wz(z), [[0, 0.668, -0.33], [0.066, 0.612, -0.345], [0, 0.532, -0.36], [-0.066, 0.606, -0.352], [0, 0.676, -0.36], [0.07, 0.62, -0.376], [0.01, 0.53, -0.386]], 0.017, { color: 0x56524a });
    chain(mb, [bi('chest'), 1, 0, 0], [[0.01, 0.53, -0.386], [0.03, 0.44, -0.36], [0.05, 0.34, -0.33], [0.045, 0.25, -0.31]], 0.017, { color: 0x56524a });
    // old scars across the muzzle and flank
    mb.blood([0.04, 0.64, -0.56], 0.04, 1);
    mb.blood([-0.1, 0.55, -0.05], 0.08, 0.9);
  }
  // blood: soaked muzzle and chest, a bite wound on the haunch
  mb.blood([0, 0.575, -0.6], 0.075, 1);
  mb.blood([0, 0.42, -0.24], 0.085, 0.8);
  mb.blood([-0.1, 0.5, 0.25], 0.06, 0.9);
  mb.dirt = { y0: 0.25, k: 1.2 };
  mb.aoStrength = 0.3;
  return mb.build();
}

const rigs = new Map();
function getRig(coat) {
  let r = rigs.get(coat);
  if (!r) {
    r = buildDog(coat);
    rigs.set(coat, r);
  }
  return r;
}

// ------------------------------------------------------------------ animation
const n1 = (t, seed) => noise3(t, seed * 1.7, 0.5, 13) * 2 - 1;
// leg phase offsets (fractions of a cycle): diagonal trot vs. rotary gallop
const TROT_OFF = { LF: 0, RH: 0.02, RF: 0.5, LH: 0.52 };
const RUN_OFF = { LH: 0, RH: 0.1, LF: 0.5, RF: 0.62 };
// pose states (weights are smoothed towards the server's ZANIM state)
const S_LOCO = 0, S_ATK = 1, S_SPC = 2, S_AIR = 3, S_STAG = 4, S_DEAD = 5, S_EAT = 6, NS = 7;
const STATE_OF = { [ZANIM.IDLE]: S_LOCO, [ZANIM.WALK]: S_LOCO, [ZANIM.RUN]: S_LOCO, [ZANIM.ATTACK]: S_ATK, [ZANIM.SPECIAL]: S_SPC, [ZANIM.AIRBORNE]: S_AIR, [ZANIM.STAGGER]: S_STAG, [ZANIM.DEAD]: S_DEAD, [ZANIM.EAT]: S_EAT };
const BLEND = [9, 16, 14, 14, 18, 14, 6]; // 1/s towards each state

// A flying squirrel's gliding membrane, both sides: a sheet from the shoulder to the hip along the flank (inside the
// body) out to the wrist and the ankle, its free edge cut in between them. It is not skinned on the rig (two bones a
// vertex could not hold it to four): each frame it is stretched between where those four joints are, in the mesh's
// space. spread: 1 flat out between the limbs, gliding or on a face; less, gathered in along the flank as it runs
const MEM_U = 8, MEM_V = 4;
const C_MEM = new THREE.Color(0x5e5044), C_MEM_EDGE = new THREE.Color(0xd8ccb2), C_MEM_RAW = new THREE.Color(0x6a3a32);
let _memMat = null;
const _mInv = new THREE.Matrix4();
const _ma = new THREE.Vector3(), _mb = new THREE.Vector3(), _mc = new THREE.Vector3(), _md = new THREE.Vector3();
const _mi = new THREE.Vector3(), _mo = new THREE.Vector3();
class Membrane {
  constructor(inst) {
    this.inst = inst;
    const nv = (MEM_U + 1) * (MEM_V + 1);
    const pos = new Float32Array(nv * 2 * 3);
    const col = new Float32Array(nv * 2 * 3);
    const idx = [];
    const c = new THREE.Color();
    for (let side = 0; side < 2; side++) {
      const o = side * nv;
      for (let i = 0; i <= MEM_U; i++) {
        for (let j = 0; j <= MEM_V; j++) {
          const v = j / MEM_V;
          c.copy(C_MEM).lerp(C_MEM_EDGE, smooth(clamp((v - 0.72) * 4, 0, 1)) * 0.8);
          if (noise3(i * 0.9 + side * 5, j * 0.8, 0.5, 47) > 0.62) c.lerp(C_MEM_RAW, 0.6); // (mange: raw, bald skin)
          c.toArray(col, (o + i * (MEM_V + 1) + j) * 3);
          if (i < MEM_U && j < MEM_V) {
            const a = o + i * (MEM_V + 1) + j, b = a + MEM_V + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.pos = pos;
    _memMat ||= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, _memMat);
    this.mesh.frustumCulled = false; // (its points move with the rig: drawn with the body it is part of)
    this.mesh.castShadow = true;
  }

  update(spread) {
    const d = this.inst;
    const X = d.X;
    d.mesh.updateWorldMatrix(true, true);
    _mInv.copy(d.mesh.matrixWorld).invert();
    const at = (out, bone) => out.setFromMatrixPosition(d.bones[X[bone]].matrixWorld).applyMatrix4(_mInv);
    const k = 0.25 + 0.75 * clamp(spread, 0, 1);
    const pos = this.pos;
    const nv = (MEM_U + 1) * (MEM_V + 1);
    for (let side = 0; side < 2; side++) {
      const n = side ? 'R' : 'L';
      at(_ma, 'fu' + n);
      at(_mb, 'fp' + n);
      at(_mc, 'hh' + n);
      at(_md, 'hu' + n);
      for (let i = 0; i <= MEM_U; i++) {
        const u = i / MEM_U;
        _mi.lerpVectors(_ma, _md, u);
        _mo.lerpVectors(_mb, _mc, u);
        // the free edge cut in between wrist and ankle; the sheet billows a little
        const cut = 0.32 * Math.sin(Math.PI * u);
        _mo.lerp(_mi, cut);
        for (let j = 0; j <= MEM_V; j++) {
          const v = (j / MEM_V) * k;
          const o = (side * nv + i * (MEM_V + 1) + j) * 3;
          pos[o] = _mi.x + (_mo.x - _mi.x) * v;
          pos[o + 1] = _mi.y + (_mo.y - _mi.y) * v - 0.025 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (j / MEM_V)) * k;
          pos[o + 2] = _mi.z + (_mo.z - _mi.z) * v;
        }
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }
}

// the halo round a flying squirrel's eyes (a soft amber glow, added to what is behind it)
const EYE_HALO = 0.16;
let _haloMat = null;
function eyeHaloMaterial() {
  if (_haloMat) return _haloMat;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,230,160,1)');
  gr.addColorStop(0.18, 'rgba(255,180,60,0.85)');
  gr.addColorStop(0.5, 'rgba(255,120,20,0.25)');
  gr.addColorStop(1, 'rgba(255,90,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  _haloMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  return _haloMat;
}

class DogInstance {
  constructor(coat, seed) {
    const rig = getRig(coat);
    this.S = coat === 'alpha' ? ALPHA_SCALE : coat === 'squirrel' ? SQUIRREL_SCALE : 1; // drawn at this size (the rig is a dog's)
    this.alpha = coat === 'alpha';
    this.squirrel = coat === 'squirrel';
    this.latched = false; // a crawler on a survivor's face (setLatched): stood up against it, clinging
    this.latchK = 0;
    this.perched = 0; // ...up a tree (setPerched: 0..1, how far up off the ground): head down on the trunk, clinging
    this.perchK = 0;
    const inst = instantiateRig(rig, getCharacterMaterial(), (rig.sphere.radius * 1.6 + 0.3) * this.S);
    this.mesh = inst.mesh;
    this.bones = inst.bones;
    this.skeleton = inst.skeleton;
    this.fx = inst.fx;
    this.nb = this.bones.length;
    this.X = {};
    for (const [name, idx] of rig.names) this.X[name] = idx;
    this.rx = new Float32Array(this.nb);
    this.ry = new Float32Array(this.nb);
    this.rz = new Float32Array(this.nb);
    this.object = new THREE.Group();
    this.object.name = 'zombie';
    this.mesh.scale.setScalar(this.S);
    if (this.squirrel) this.mesh.scale.set(this.S * SQUIRREL_SHAPE[0], this.S * SQUIRREL_SHAPE[1], this.S * SQUIRREL_SHAPE[2]);
    this.object.add(this.mesh);
    const r = (k) => noise3(seed * 0.618 + k * 7.1, k, 0.3, 29);
    this.seed = seed;
    this.sd = seed * 0.37;
    this.side = r(1) < 0.5 ? 1 : -1; // side it falls on when it dies
    this.limpLeg = r(2) < 0.45 ? ['LF', 'RF', 'LH', 'RH'][Math.floor(r(3) * 4) & 3] : null;
    this.limp = 0.35 + r(4) * 0.4;
    this.headLow = this.alpha ? 0.06 : 0.15 + r(5) * 0.2; // (the Alpha carries its head up)
    this.state = ZANIM.IDLE;
    this.stateT = 0;
    this.w = new Float32Array(NS);
    this.w[S_LOCO] = 1;
    this.phase = r(6) * TAU;
    this.wRun = 0;
    this.wMove = 0;
    this.speed = 0;
    this.hit = 0;
    this.flinchT = 9; // since the last hit (flinch)
    this.flinchSide = 1;
    this.voxT = 9; // since the last bark / snarl (jaw and head move with it)
    this.voxKind = 0;
    this.headless = false;
    this.time = 0;
    this._seen = true;
    this.mesh.onBeforeRender = () => {
      this._seen = true;
    };
    // anchors: skull centre + mouth (effects, calibration)
    this.headCenter = new THREE.Object3D();
    this.headCenter.position.set(0, 0.64 - B.head[1], -0.51 - B.head[2]);
    this.bones[this.X.head].add(this.headCenter);
    this.mouth = new THREE.Object3D();
    this.mouth.position.set(0, 0.58 - B.jaw[1], -0.63 - B.jaw[2]);
    this.bones[this.X.jaw].add(this.mouth);
    this.object.userData.mouth = this.mouth;
    this.object.userData.head = this.headCenter;
    if (this.squirrel) {
      this.headScale = SQUIRREL_HEAD;
      this.membrane = new Membrane(this);
      this.mesh.add(this.membrane.mesh);
      // a halo round each eye, so that one up a tree in the dark is seen from far off
      for (const s of [-1, 1]) {
        const halo = new THREE.Sprite(eyeHaloMaterial());
        halo.position.set(s * 0.049, 0.657 - B.head[1], -0.56 - B.head[2]);
        halo.scale.setScalar(EYE_HALO);
        halo.renderOrder = 2;
        this.bones[this.X.head].add(halo);
      }
    }
    this.pose(0);
  }

  update(dt, anim, speed, time, inView = false) {
    if (dt > 0.1) dt = 0.1;
    if (anim !== this.state) {
      this.state = anim;
      this.stateT = 0;
    }
    this.stateT += dt;
    this.time = time;
    this.speed = speed;
    // on a face: it swings up off its feet to lie belly-on against it, head over the top of the skull (the mesh pitched
    // about its feet, which the server holds just in front of the survivor's eyes)
    this.latchK += ((this.latched && anim === ZANIM.ATTACK ? 1 : 0) - this.latchK) * Math.min(1, dt * 14);
    // up a tree: pitched head down about its feet, its belly to the bark (which is behind it: it faces out)
    this.perchK += ((anim === ZANIM.AIRBORNE ? 0 : this.perched) - this.perchK) * Math.min(1, dt * 10);
    if (this.squirrel) {
      this.mesh.rotation.x = (Math.PI / 2) * this.latchK - (Math.PI / 2) * this.perchK;
      this.mesh.position.set(0, -0.12 * this.latchK + 0.1 * this.perchK, 0.12 * this.perchK);
    }
    const cur = STATE_OF[anim] ?? S_LOCO;
    for (let i = 0; i < NS; i++) this.w[i] += ((i === cur ? 1 : 0) - this.w[i]) * Math.min(1, dt * BLEND[cur]);
    const moving = anim === ZANIM.WALK || anim === ZANIM.RUN;
    this.wRun += (clamp((speed - 2.4 * Math.sqrt(this.S)) / 2.2, 0, 1) - this.wRun) * Math.min(1, dt * 5);
    this.wMove += ((moving ? clamp(speed / 0.8, 0, 1) : 0) - this.wMove) * Math.min(1, dt * 7);
    if (anim !== ZANIM.DEAD) {
      const stride = lerp(1.08, 2.7, this.wRun) * this.S; // ground covered per gait cycle (keeps planted paws from sliding)
      this.phase = (this.phase + (dt * speed * TAU) / stride) % (TAU * 1000);
    }
    if (this.hit > 0) this.hit = Math.max(0, this.hit - dt * 5);
    this.flinchT += dt;
    this.voxT += dt;
    const glow = anim === ZANIM.DEAD ? Math.max(0.15, 1 - this.stateT * 0.6) : 1;
    setFx(this.fx, this.hit, glow);
    const seen = this._seen;
    this._seen = false;
    if (!seen && !inView && this.w[cur] > 0.99) return;
    this.pose(time);
  }

  add(name, w, x, y = 0, z = 0) {
    const i = this.X[name];
    this.rx[i] += x * w;
    this.ry[i] += y * w;
    this.rz[i] += z * w;
  }

  pose(t) {
    this.rx.fill(0);
    this.ry.fill(0);
    this.rz.fill(0);
    const w = this.w;
    const st = { hy: 0, hz: 0, ry: 0, rootX: 0, rootY: 0 };
    if (w[S_LOCO] > 0.001) {
      this.poseLoco(t, w[S_LOCO], st);
      if (this.squirrel) this.poseHunch(w[S_LOCO], st);
    }
    if (w[S_ATK] > 0.001) {
      const L = this.latchK;
      if (L < 0.999) this.poseBite(t, w[S_ATK] * (1 - L), st);
      if (L > 0.001) this.poseCling(t, w[S_ATK] * L, st);
    }
    if (w[S_SPC] > 0.001) this.poseCrouch(t, w[S_SPC], st);
    if (w[S_AIR] > 0.001) {
      if (this.squirrel) this.poseGlide(t, w[S_AIR], st);
      else this.poseLeap(t, w[S_AIR], st);
    }
    if (this.perchK > 0.001) this.posePerch(t, this.perchK * (1 - w[S_AIR]), st);
    if (w[S_STAG] > 0.001) this.poseStagger(t, w[S_STAG], st);
    if (w[S_EAT] > 0.001) this.poseFeed(t, w[S_EAT], st);
    if (w[S_DEAD] > 0.001) this.poseDead(t, w[S_DEAD], st);
    const live = 1 - w[S_DEAD];
    if (this.flinchT < 0.35) {
      // hit: the head snaps away and the body jerks to one side
      const k = Math.sin((this.flinchT / 0.35) * Math.PI) * live;
      const sg = this.flinchSide;
      this.add('neck', k, 0.25, sg * 0.35, sg * 0.2);
      this.add('chest', k, 0.05, -sg * 0.12, -sg * 0.1);
      this.add('hips', k, 0, sg * 0.08, sg * 0.1);
    }
    const vd = this.voxKind ? 0.75 : 0.9;
    if (this.voxT < vd) {
      // bark / snarl: jaws work with the sound, a snap of the head on each bark
      const u = this.voxT / vd;
      const env = Math.sin(u * Math.PI) * live;
      const open = this.voxKind ? Math.max(0, Math.sin(u * Math.PI * 6)) * 0.55 : 0.25 + Math.sin(this.voxT * 30) * 0.06;
      this.add('jaw', env, -open);
      this.add('head', env, this.voxKind ? open * 0.3 : 0.05);
      this.add('earL', env, 0.5);
      this.add('earR', env, 0.5);
    }
    const bones = this.bones;
    for (let i = 1; i < this.nb; i++) bones[i].rotation.set(this.rx[i], this.ry[i], this.rz[i]);
    bones[this.X.hips].position.set(B.hips[0], B.hips[1] + st.hy, B.hips[2] + st.hz);
    bones[this.X.root].position.set(st.rootX, st.rootY, 0);
    this.scaleHead();
    if (this.membrane) this.membrane.update(Math.max(this.w[S_AIR], this.latchK * this.w[S_ATK], this.perchK * 0.45));
  }

  scaleHead() {
    const hs = this.headScale;
    if (this.headless) this.bones[this.X.head].scale.setScalar(0.001);
    else if (hs) this.bones[this.X.head].scale.set(hs[0], hs[1], hs[2]);
    else this.bones[this.X.head].scale.setScalar(1);
  }

  // stand / trot / gallop (speed-driven), with a hitching limp, a low twitchy head and panting
  poseLoco(t, W, st) {
    const M = this.wMove;
    const R = this.wRun;
    const ph = this.phase;
    const sd = this.sd;
    const trot = 1 - R;
    const ampF = lerp(0.42, 0.95, R) * M;
    const ampH = lerp(0.4, 0.85, R) * M;
    const flexF = lerp(0.9, 1.5, R) * M;
    const flexH = lerp(0.7, 1.25, R) * M;
    for (const key of ['LF', 'RF', 'LH', 'RH']) {
      const th = ph + TAU * lerp(TROT_OFF[key], RUN_OFF[key], R);
      let s = Math.sin(th);
      let lift = Math.max(0, Math.cos(th));
      if (key === this.limpLeg) {
        // favours a bad leg: short, hitching steps with the paw barely set down
        s *= 1 - this.limp * 0.5;
        lift = lift * (1 - this.limp * 0.3) + this.limp * 0.35 * M;
      }
      const side = key[0];
      if (key[1] === 'F') {
        this.add('fu' + side, W, s * ampF + 0.04);
        this.add('fl' + side, W, -lift * flexF);
        this.add('fp' + side, W, lift * flexF * 0.9 + (s < 0 ? -s * 0.2 * M : 0));
      } else {
        this.add('hu' + side, W, s * ampH - 0.04);
        this.add('hk' + side, W, -lift * flexH - 0.05);
        this.add('hh' + side, W, lift * flexH * 0.85 + 0.05);
      }
    }
    // spine: gallop flex + bounding bob, trot roll
    const flex = Math.sin(ph) * 0.14 * R * M;
    st.hy += ((Math.abs(Math.sin(ph * 2)) - 0.5) * 0.014 * trot + (0.5 + 0.5 * Math.sin(ph)) * 0.05 * R) * M * W;
    this.add('hips', W, flex, 0, Math.sin(ph) * 0.04 * trot * M);
    this.add('chest', W, -flex * 1.3, 0, -Math.sin(ph) * 0.03 * trot * M);
    // head: carried low and forward, stretched out at a gallop; sniffs and twitches when standing
    const idle = 1 - M;
    const lookY = n1(t * 0.3, sd) * 0.7 * idle;
    const sniff = Math.max(0, n1(t * 0.5, sd + 5)) * 0.35 * idle;
    const twitch = Math.pow(Math.max(0, n1(t * 1.7, sd + 9)), 6) * 6;
    this.add('neck', W, -this.headLow - 0.12 * R * M - sniff + Math.sin(ph * 2) * 0.05 * trot * M, lookY * 0.5 + twitch * 0.25, twitch * 0.2);
    this.add('head', W, this.headLow * 0.6 + 0.18 * R * M + sniff * 0.4 + twitch * 0.3, lookY * 0.6, n1(t * 0.2, sd + 7) * 0.15 * idle);
    // panting, snapping at the air now and then
    const pant = 0.1 + Math.sin(t * 11 + sd) * 0.05 + 0.1 * R * M;
    this.add('jaw', W, -(pant + Math.max(0, n1(t * 0.9, sd + 11) - 0.55) * 1.2));
    // ears half back, pinned flat at a gallop; tail low, streaming behind at speed
    const ear = 0.25 + 0.6 * R * M;
    this.add('earL', W, ear, 0, -0.1);
    this.add('earR', W, ear, 0, 0.1);
    for (let i = 0; i < TAIL_N; i++) {
      const x = lerp(i === 0 ? 0.85 : 0.18, i === 0 ? 0.25 : 0.05, R * M) + Math.sin(ph + i * 0.9) * 0.1 * R * M;
      this.add('tail' + i, W, x, Math.sin(t * 1.3 + i * 0.8 + sd) * 0.18 * idle + Math.sin(ph + i) * 0.1 * trot * M);
    }
  }

  // a flying squirrel goes about low and hunched: knees and elbows bent under it, its back arched up over its hips, its
  // brush of a tail carried up over its back and curled at the tip
  poseHunch(W, st) {
    st.hy -= 0.06 * W;
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, [-2.0, -0.7, 0.6][i] ?? 0.3);
    this.add('hips', W, 0.1);
    this.add('chest', W, -0.12);
    this.add('neck', W, -0.15);
    this.add('head', W, 0.1);
    for (const s of ['L', 'R']) {
      this.add('fu' + s, W, 0.35);
      this.add('fl' + s, W, -0.7);
      this.add('fp' + s, W, 0.4);
      this.add('hu' + s, W, 0.4);
      this.add('hk' + s, W, -0.65);
      this.add('hh' + s, W, 0.4);
    }
  }

  // ATTACK: rear the head back, lunge-snap, then a tearing head shake
  poseBite(t, W, st) {
    const u = (this.stateT % 0.7) / 0.7;
    const reach = u < 0.25 ? -smooth(u / 0.25) * 0.4 : u < 0.4 ? lerp(-0.4, 1, smooth((u - 0.25) / 0.15)) : lerp(1, 0.2, smooth((u - 0.4) / 0.6));
    const open = u < 0.3 ? smooth(u / 0.3) * 0.85 : u < 0.4 ? lerp(0.85, 0.05, (u - 0.3) / 0.1) : 0.05 + Math.max(0, Math.sin(u * 30)) * 0.1;
    const shake = u > 0.4 ? Math.sin(u * 45) * 0.3 * (1 - u) : 0;
    this.add('neck', W, -0.1 + reach * 0.35, shake, shake * 0.6);
    this.add('head', W, 0.05 - reach * 0.15, shake * 0.8);
    this.add('jaw', W, -open);
    this.add('chest', W, -0.08 - reach * 0.06);
    st.hz += reach * 0.05 * W;
    // front legs braced wide, hind legs driving
    for (const s of ['L', 'R']) {
      this.add('fu' + s, W, -0.15 + reach * 0.15, 0, s === 'L' ? -0.1 : 0.1);
      this.add('fl' + s, W, -0.2);
      this.add('fp' + s, W, 0.25);
      this.add('hu' + s, W, 0.15 - reach * 0.2);
      this.add('hk' + s, W, -0.3);
      this.add('hh' + s, W, 0.3);
    }
    this.add('earL', W, 0.9, 0, -0.15);
    this.add('earR', W, 0.9, 0, 0.15);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 0.35 : 0.05);
  }

  // ATTACK on a face (a crawler, latched): all four limbs spread and hooked round the head, the tail lashing, the head
  // down over the brow gnawing at it
  poseCling(t, W, st) {
    const gnaw = Math.max(0, Math.sin(t * 13 + this.sd));
    const writhe = Math.sin(t * 7.3 + this.sd) * 0.12;
    this.add('hips', W, 0.15, writhe, 0);
    this.add('chest', W, -0.1, -writhe, 0);
    this.add('neck', W, -0.6 + gnaw * 0.15, writhe * 0.5);
    this.add('head', W, -0.35 + gnaw * 0.2);
    this.add('jaw', W, -(0.2 + gnaw * 0.5));
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1;
      this.add('fu' + s, W, 0.9, 0, sg * 0.55);
      this.add('fl' + s, W, -0.9 - gnaw * 0.2);
      this.add('fp' + s, W, 0.9);
      this.add('hu' + s, W, -0.5, 0, sg * 1.0);
      this.add('hk' + s, W, 0.6);
      this.add('hh' + s, W, -0.4);
    }
    this.add('earL', W, 1.0, 0, -0.2);
    this.add('earR', W, 1.0, 0, 0.2);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? -0.4 : 0.1, Math.sin(t * 9 + i * 0.9) * 0.35);
  }

  // SPECIAL (lunge wind-up): crouched low on coiled legs, head down, snarling. The Alpha's, held past a wind-up, is
  // its howl to the pack: it sits back on its haunches, throat to the sky
  poseCrouch(t, W, st) {
    const howl = this.alpha ? smooth(clamp((this.stateT - 0.38) / 0.3, 0, 1)) : 0;
    if (howl > 0.001) this.poseHowl(t, W * howl, st);
    W *= 1 - howl;
    if (W < 0.001) return;
    const quiver = Math.sin(t * 40 + this.sd) * 0.02;
    st.hy -= 0.08 * W;
    this.add('hips', W, -0.12);
    this.add('chest', W, -0.1);
    this.add('neck', W, -0.35 + quiver, 0, quiver);
    this.add('head', W, 0.45);
    this.add('jaw', W, -0.45 - quiver * 3);
    for (const s of ['L', 'R']) {
      this.add('fu' + s, W, 0.45);
      this.add('fl' + s, W, -0.95);
      this.add('fp' + s, W, 0.55);
      this.add('hu' + s, W, 0.55);
      this.add('hk' + s, W, -0.85);
      this.add('hh' + s, W, 0.55);
    }
    this.add('earL', W, 1.1, 0, -0.2);
    this.add('earR', W, 1.1, 0, 0.2);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 0.15 : 0, Math.sin(t * 22) * 0.05);
  }

  poseHowl(t, W, st) {
    const u = this.stateT - 0.38;
    const tr = Math.sin(t * 26) * 0.03 * smooth(clamp(u / 0.4, 0, 1)); // the throat quivers with it
    st.hy -= 0.05 * W;
    this.add('hips', W, 0.32);
    this.add('chest', W, 0.18);
    this.add('neck', W, 0.75 + tr, 0, tr);
    this.add('head', W, 0.3);
    this.add('jaw', W, -0.55 - Math.abs(tr) * 3);
    for (const s of ['L', 'R']) {
      this.add('fu' + s, W, -0.35);
      this.add('fl' + s, W, 0.1);
      this.add('fp' + s, W, 0.15);
      this.add('hu' + s, W, 0.95);
      this.add('hk' + s, W, -1.3);
      this.add('hh' + s, W, 0.6);
    }
    this.add('earL', W, -0.2, 0, -0.1);
    this.add('earR', W, -0.2, 0, 0.1);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 0.4 : 0.1);
  }

  // AIRBORNE (lunge): stretched out flat, forelegs reaching, jaws wide
  poseLeap(t, W, st) {
    const u = clamp(this.stateT / 0.45, 0, 1);
    this.add('hips', W, 0.12 - u * 0.2);
    this.add('neck', W, 0.1);
    this.add('head', W, -0.05);
    this.add('jaw', W, -0.8);
    for (const s of ['L', 'R']) {
      this.add('fu' + s, W, 1.15 - u * 0.3);
      this.add('fl' + s, W, 0.15);
      this.add('fp' + s, W, -0.2);
      this.add('hu' + s, W, -0.95);
      this.add('hk' + s, W, 0.35);
      this.add('hh' + s, W, -0.4);
    }
    this.add('earL', W, 1.2);
    this.add('earR', W, 1.2);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 0.05 : -0.05);
  }

  // AIRBORNE, a flying squirrel's: spread-eagled to glide, the forelegs out and forward, the hind legs out and back,
  // stretching the membrane between them flat; its head up, its jaws open, its tail out straight behind as a rudder
  poseGlide(t, W, st) {
    const u = clamp(this.stateT / 0.3, 0, 1);
    const flap = Math.sin(t * 9 + this.sd) * 0.05;
    this.add('hips', W, -0.05);
    this.add('neck', W, 0.35);
    this.add('head', W, 0.15);
    this.add('jaw', W, -0.5 - 0.2 * u);
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1;
      this.add('fu' + s, W, 0.55, 0, sg * (0.6 + 0.75 * u + flap));
      this.add('fl' + s, W, -0.15);
      this.add('fp' + s, W, 0.1);
      this.add('hu' + s, W, -0.65, 0, sg * (0.55 + 0.7 * u - flap));
      this.add('hk' + s, W, 0.1);
      this.add('hh' + s, W, -0.2);
    }
    this.add('earL', W, 1.1, 0, -0.1);
    this.add('earR', W, 1.1, 0, 0.1);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 0.15 : -0.04, Math.sin(t * 5 + i) * 0.06);
  }

  // up a tree (perchK): head down on the trunk (the mesh pitched: rig -Y is the bark), all four limbs splayed and hooked
  // into it, the tail up the trunk behind it; its head bent back out from the bark to watch whoever is below, turning a
  // little, the jaws working now and then
  posePerch(t, W, st) {
    const look = Math.sin(t * 0.7 + this.sd) * 0.35;
    const chew = Math.max(0, Math.sin(t * 3.1 + this.sd * 2)) * 0.3;
    this.add('chest', W, 0.1);
    this.add('neck', W, 0.85, look * 0.6);
    this.add('head', W, 0.45, look * 0.4);
    this.add('jaw', W, -0.1 - chew);
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1;
      this.add('fu' + s, W, 0.5, 0, sg * 0.75);
      this.add('fl' + s, W, -0.5);
      this.add('fp' + s, W, 0.6);
      this.add('hu' + s, W, -0.35, 0, sg * 0.7);
      this.add('hk' + s, W, 0.3);
      this.add('hh' + s, W, 0.5);
    }
    this.add('earL', W, 0.9);
    this.add('earR', W, 0.9);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? -0.25 : -0.08, Math.sin(t * 1.4 + i) * 0.1);
  }

  // STAGGER: knocked sideways, head thrown back
  poseStagger(t, W, st) {
    const u = clamp(this.stateT / 0.35, 0, 1);
    const k = Math.sin(u * Math.PI);
    this.add('hips', W, -0.1 * k, 0.25 * k, 0.2 * k);
    this.add('chest', W, 0.1 * k, -0.2 * k, -0.15 * k);
    this.add('neck', W, 0.3 * k, 0.5 * k, 0.3 * k);
    this.add('head', W, 0.2 * k);
    this.add('jaw', W, -0.5 * k);
    for (const s of ['L', 'R']) {
      this.add('fu' + s, W, -0.2 * k, 0, (s === 'L' ? -0.3 : 0.3) * k);
      this.add('fl' + s, W, -0.3 * k);
      this.add('hu' + s, W, 0.2 * k);
      this.add('hk' + s, W, -0.4 * k);
      this.add('hh' + s, W, 0.3 * k);
    }
    this.add('earL', W, 0.8 * k);
    this.add('earR', W, 0.8 * k);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 0.6 : 0.2);
  }

  // EAT: front end down on a carcass, tearing at it
  poseFeed(t, W, st) {
    const sd = this.sd;
    const tear = Math.max(0, Math.sin(t * 2.3 + sd));
    const chew = Math.max(0, Math.sin(t * 8 + sd));
    st.hy -= 0.03 * W;
    this.add('hips', W, -0.28);
    this.add('chest', W, -0.05);
    this.add('neck', W, -0.55 + tear * 0.15, Math.sin(t * 1.7 + sd) * 0.2, Math.sin(t * 3.1) * tear * 0.15);
    this.add('head', W, -0.1 + tear * 0.35, Math.sin(t * 5 + sd) * tear * 0.2);
    this.add('jaw', W, -(0.08 + chew * 0.3));
    for (const s of ['L', 'R']) {
      this.add('fu' + s, W, 0.5, 0, s === 'L' ? -0.12 : 0.12);
      this.add('fl' + s, W, -0.75);
      this.add('fp' + s, W, 0.35);
      this.add('hu' + s, W, 0.12);
      this.add('hk' + s, W, -0.2);
      this.add('hh' + s, W, 0.15);
    }
    this.add('earL', W, 0.3, 0, -0.1);
    this.add('earR', W, 0.3, 0, 0.1);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 0.9 : 0.2, Math.sin(t * 0.9 + i) * 0.1);
  }

  // DEAD: legs buckle, it rolls onto its side, a few kicks, then limp
  poseDead(t, W, st) {
    const T = this.stateT;
    const buckle = smooth(clamp(T / 0.25, 0, 1));
    const roll = smooth(clamp((T - 0.1) / 0.4, 0, 1));
    const kick = Math.max(0, 1 - T / 1.6) * Math.sin(T * 24) * 0.25;
    const sg = this.side;
    this.rz[this.X.root] += sg * 1.5 * roll * W;
    st.rootX += sg * 0.42 * roll * W;
    st.rootY += (0.1 * roll - 0.12 * buckle * (1 - roll)) * W;
    this.add('neck', W, -0.35 * roll, 0, -sg * 0.3 * roll);
    this.add('head', W, 0.25 * roll);
    this.add('jaw', W, -0.35 - 0.1 * buckle);
    for (const s of ['L', 'R']) {
      const k = s === 'L' ? kick : -kick;
      this.add('fu' + s, W, lerp(0.3, 0.45, roll) + k);
      this.add('fl' + s, W, -0.6 * buckle * (1 - roll) - 0.25 * roll);
      this.add('fp' + s, W, 0.3);
      this.add('hu' + s, W, lerp(0.35, -0.3, roll) - k);
      this.add('hk' + s, W, -0.7 * buckle * (1 - roll) - 0.2 * roll);
      this.add('hh' + s, W, 0.4 * buckle * (1 - roll) + 0.1);
    }
    this.add('earL', W, 0.5);
    this.add('earR', W, 0.5);
    for (let i = 0; i < TAIL_N; i++) this.add('tail' + i, W, i === 0 ? 1.0 : 0.1);
  }

  hurt() {
    this.flinchT = 0;
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
  }

  vocalize(kind) {
    this.voxKind = kind;
    this.voxT = 0;
  }

  flash(a) {
    this.hit = Math.max(this.hit, clamp(a, 0, 1));
    setFx(this.fx, this.hit, 1);
  }

  setLatched(v) {
    this.latched = !!v;
  }

  setHeadless(v) {
    this.headless = !!v;
    this.scaleHead();
  }

  setPerched(k) {
    this.perched = clamp(k, 0, 1);
  }

  anchorWorld(anchor, out) {
    anchor.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(anchor.matrixWorld);
  }

  dispose() {
    this.skeleton.dispose();
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}

/** Triangle counts per coat (models sandbox stats). */
export function dogStats() {
  const out = COATS.map((c, i) => ({ type: 'dog', variant: i, tris: getRig(i).tris, bones: getRig(i).bones.length }));
  out.push({ type: 'alpha', variant: 0, tris: getRig('alpha').tris, bones: getRig('alpha').bones.length });
  out.push({ type: 'squirrel', variant: 0, tris: getRig('squirrel').tris, bones: getRig('squirrel').bones.length });
  return out;
}

/**
 * A zombie dog view with the createZombie() interface: { object, update(dt, anim, speed, time, inView), flash, hurt, vocalize, setHeadless,
 * setLatched, anchorWorld, dispose }. seed picks the coat (same hash as the other zombie variants) + per-instance quirks;
 * alpha: true for The Alpha, 'squirrel' for the crawler.
 */
export function createZombieDog(seed = 0, alpha = false) {
  const coat = alpha === 'squirrel' ? 'squirrel' : alpha ? 'alpha' : (((seed >>> 0) * 2654435761) >>> 0) % COATS.length;
  const d = new DogInstance(coat, seed >>> 0);
  return {
    object: d.object,
    update: (dt, anim, speed, time, inView) => d.update(dt, anim, speed, time, inView),
    flash: (a) => d.flash(a),
    hurt: () => d.hurt(),
    vocalize: (kind) => d.vocalize(kind),
    setHeadless: (v) => d.setHeadless(v),
    setLatched: (v) => d.setLatched(v),
    setPerched: (k) => d.setPerched(k),
    anchorWorld: (a, out) => d.anchorWorld(a, out),
    dispose: () => d.dispose(),
    _inst: d,
  };
}
