// The roper (ZTYPE.ROPER): its model, how it moves and its windup (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, clamp, lerp, smooth, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { limb, blister } from '../monsters.js';
import { surfPoint } from '../humans.js';
import { SPINE, CHEST, NECK, JAW, humanP } from '../characters/skeleton.js';
import { clearPose, R, A, arm, headLook, legsStatic } from '../characters/posekit.js';
import { buildingFar, standardHumanoid } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.ROPER;

/**
 * The roper: a big man in a work shirt, and what he throws is his own tongue - metres of it, kept wound in loops
 * round his neck and down one arm like a line on a dock. The neck is swollen to hold its root and the jaw has come
 * apart to let it out; its end hangs out of the mouth to his chest.
 */
function buildRoper() {
  const P = humanP({ hipY: 1.0, thighLen: 0.46, shinLen: 0.46, spineLen: 0.14, chestLen: 0.22, neckOff: 0.2, neckLen: 0.1, headR: 0.12, shoulderW: 0.2, uarmLen: 0.33, farmLen: 0.3, handLen: 0.19 });
  const far = buildingFar();
  const L = {
    dead: true, skin: 0x8e8672, eye: 0xe0e0c0, eyeGlow: 0.25, noBrows: true,
    face: { sockets: 1.8, gaunt: 0.5, rot: 0.6, w: 1.1, jaw: 1.5, chin: 1.25, lips: 0.3, nose: 0.6 },
    gaunt: 0.3, build: { w: 1.14, d: 1.12, arm: 1.12, leg: 1.04, neck: 1.5, belly: 0.35 },
    top: { kind: 'shirt', color: 0x54483c, region: CR.CANVAS, sleeves: 'rolled', tear: 0.26, open: 0.34, under: { color: 0x8a8672, region: CR.COTTON }, collar: 'shirt', hem: 0.05, tint: bloodied(7, 0.7) },
    pants: { color: 0x2f3440, region: CR.DENIM, tear: 0.14, tearY: 0.12, tint: bloodied(9, 0.5) },
    shoes: { kind: 'work', color: 0x30261c }, hair: { style: 'balding', color: 0x2a2018 },
    jawScale: 1.45, fang: true, missingTeeth: 0x42, cheekTear: 1, curl: 0.6,
    blood: [[[0, 1.6, -0.14], 0.14, 1], [[0, 1.4, -0.16], 0.12, 0.9]], dirt: { y0: 0.4, k: 0.6 },
  };
  const mb = new MeshBuilder();
  const built = standardHumanoid(mb, P, L);
  const { T, arms } = built;
  const tongue = (bone, pts, r0, r1, o = {}) => limb(mb, bone, pts, pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1))), {
    nu: far ? 5 : 7, sub: far ? 1 : 2, color: 0x8e3440, region: CR.FLESH, mottle: 0.25, blood: false, flat: 0.8,
    paint: (s, a, c) => {
      c.multiplyScalar(0.8 + 0.2 * Math.sin(s * 60)); // ringed like a worm
      if (Math.cos(a) < -0.3) c.lerp(color(0xb8787a), 0.4); // paler underneath
    },
    ...o,
  });
  // loops of it round the neck, thrown over the left shoulder
  const nY = P.neckY, ySh = P.shoulderY;
  const turns = far ? 2 : 3;
  const coil = [];
  for (let i = 0; i <= turns * 8; i++) {
    const a = (i / 8) * TAU + 0.6, u = i / (turns * 8);
    const y = nY + 0.085 - u * 0.1 + 0.008 * Math.sin(a * 2);
    const r = 0.082 + u * 0.03;
    coil.push([Math.sin(a) * r * 1.05, y, -Math.cos(a) * r + 0.012]);
  }
  tongue('neck', coil, 0.021, 0.025, { cap0: 0.02 });
  const sh = surfPoint(T, -1.45, ySh + 0.045, 0.03);
  const drape = [coil[coil.length - 1], [sh[0] * 0.75, ySh + 0.07, sh[2] - 0.05], [sh[0] - 0.01, sh[1] + 0.012, sh[2] + 0.01], surfPoint(T, PI + 0.9, ySh - 0.06, 0.03), surfPoint(T, PI + 0.6, P.chestY + 0.02, 0.03), surfPoint(T, PI + 1.3, P.chestY - 0.1, 0.03), surfPoint(T, -1.2, P.chestY - 0.13, 0.035), surfPoint(T, -0.5, P.chestY - 0.06, 0.035)];
  tongue('chest', drape, 0.025, 0.02, { cap1: 0.02, wts: (p) => T.wts(clamp(p[1], T.yLo, T.yHi), p[0]) });
  // ...and more wound down the left forearm, the way a man carries a line
  if (!far) {
    const A = arms[0];
    const wrap = [];
    for (let i = 0; i <= 22; i++) {
      const u = i / 22;
      wrap.push(surfPoint(A, u * TAU * 2.75 + 1, lerp(A.yE - 0.03, A.yW + 0.035, u), 0.017));
    }
    tongue('farmL', wrap, 0.017, 0.015, { cap0: 0.012, cap1: 0.012, sub: 1 });
  }
  // the throat swollen round its root
  blister(mb, built.T, 0, nY + 0.0, 0.07, 0.75, { color: 0x8a6a62, glow: 0, region: CR.TUMOR, rim: 0x6a3a3a, ws: far ? 6 : 9, hs: far ? 4 : 6, tall: 1.2 });
  // its end, out of the mouth and down to the chest (on the jaw: it swings as the mouth works)
  const hb = mb.bonePos('head');
  const m0 = [0, hb[1] + P.headR * 0.42, hb[2] - P.headR * 0.5];
  tongue('jaw', [m0, [0.004, m0[1] - 0.012, m0[2] - 0.075], [0.012, m0[1] - 0.075, m0[2] - 0.098], [0.02, m0[1] - 0.17, m0[2] - 0.088], [0.012, m0[1] - 0.25, m0[2] - 0.07], [0.0, m0[1] - 0.3, m0[2] - 0.075]], 0.024, 0.009, { cap1: 0.02, nu: far ? 5 : 8 });
  return { mb, P, A: { jawHang: 0.38 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.18, runLean: -0.26, cycleWalk: 1.5, cycleRun: 2.1, walkStride: 0.38, walkKnee: 0.55, runStride: 0.5, runKnee: 0.9,
  limp: 0.35, sway: 0.8, armWalk: 0.25, armDroop: 0.1, armSwing: 0.22, armRun: 0.7, elbow: 0.3, headPitch: -0.1, headTilt: 0.35, jaw: 0.35,
  idleLean: -0.15,
};

/** Its windup (ZANIM.SPECIAL): mouth wide open, head forward, right arm extended */
function poseTongue(z, p) {
  const t = z.stateT;
  clearPose(p, z.nb);
  const k = smooth(t / 0.3);
  const q = Math.sin(t * 30) * 0.02 * k;
  legsStatic(z, p, 0.3 * k, -0.25 * k, -0.2 * k, -0.08, 0.06);
  R(p, SPINE, -0.15 - 0.15 * k, 0.1 * k, 0);
  R(p, CHEST, -0.1 - 0.1 * k, 0.15 * k, 0);
  A(p, NECK, -0.35 * k, 0, 0);
  headLook(p, 0.15 * k + q, 0, 0, 0);
  A(p, NECK, -0.3 * k, 0, 0);
  R(p, JAW, -1.1 * k, 0, 0);
  arm(p, 1, 1.5 * k + 0.1, 0.05, -0.2, 0.05, 0.1);
  arm(p, 0, 0.3, 0.3, 0, 0.8 * k, 0.3);
}

export { buildRoper as build, poseTongue as special };
