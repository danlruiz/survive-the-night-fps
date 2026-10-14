// The Brute (ZTYPE.BOSS_BRUTE), night 1's boss: its model, how it moves, its special and its swing (gathered by
// zombies/index.js).
import * as THREE from 'three';
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, fbm3, clamp, lerp, smooth, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { hulk, field, ringLoft, bigHand, stitches, chain, strap, bound, ragPants, angleOn, reweigh } from '../monsters.js';
import { surfPoint, sheet } from '../humans.js';
import { SPINE, CHEST, JAW, humanP, addHumanoidBones } from '../characters/skeleton.js';
import { clearPose, R, arm, headLook, legsStatic } from '../characters/posekit.js';
import { mulColor, bossHead, hide } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.BOSS_BRUTE;

/** A rubber boot on a hulk's leg: the foot lofted heel to toe on the foot bone, the shaft up the shin (Lg: its surface). */
function bigBoot(mb, Lg, s, o) {
  const n = s < 0 ? 'L' : 'R';
  const b = mb.bonePos('foot' + n);
  const w = o.w, l = o.l, h = o.h;
  const col = o.color;
  const at = (x, y, z) => [b[0] + x * w, y * h, b[2] + z * l];
  const sole = color(o.sole ?? 0x141210);
  ringLoft(mb, 'foot' + n, [
    { c: at(0, 0.04, 0.066), rx: 0.03 * w, ru: 0.04 * h, rd: 0.04 * h },
    { c: at(0, 0.052, 0.04), rx: 0.042 * w, ru: 0.062 * h, rd: 0.052 * h },
    { c: at(0, 0.05, -0.02), rx: 0.046 * w, ru: 0.06 * h, rd: 0.05 * h },
    { c: at(0, 0.04, -0.08), rx: 0.05 * w, ru: 0.04 * h, rd: 0.04 * h },
    { c: at(0, 0.034, -0.13), rx: 0.052 * w, ru: 0.032 * h, rd: 0.034 * h },
    { c: at(0, 0.03, -0.165), rx: 0.044 * w, ru: 0.026 * h, rd: 0.03 * h },
  ].map((r) => ({ ...r, n: 3 })), {
    color: col, region: CR.LEATHER, mottle: 0.12, nu: 12, sub: 2, cap0: 0.012 * l, cap1: 0.016 * l,
    tint: (p, nn, c) => {
      if (p.y < 0.03 * h) c.copy(sole);
    },
  });
  sheet(mb, Lg, 0, TAU, b[1] - 0.01, o.top, 14, 4, (t, y) => 0.03 + 0.012 * smooth((y - b[1]) / (o.top - b[1])), { color: col, region: CR.LEATHER, mottle: 0.12 });
  sheet(mb, Lg, 0, TAU, o.top - 0.03, o.top, 14, 1, 0.052, { color: mulColor(col, 0.75), region: CR.LEATHER, cap1: 0 });
}

/**
 * The Brute, night 1's boss: the slaughterhouse's butcher, twice the size he was. Fat over slabs of muscle, a gut that
 * hangs over his belt under a blood-soaked apron, forearms red to the elbow, rubber boots; a small bald head sunk
 * between his shoulders, a cleaver's scar stitched across it. The hook he was hung on is still through his left
 * shoulder with its chain down his back, somebody's cleaver is in the other, and he has brought a hook of his own.
 */
function buildBrute() {
  const P = humanP({
    hipY: 1.08, hipW: 0.19, thighLen: 0.5, shinLen: 0.5, spineLen: 0.3, chestLen: 0.38, neckOff: 0.34, neckLen: 0.07,
    headR: 0.125, shoulderW: 0.5, shoulderDrop: 0.06, uarmLen: 0.46, farmLen: 0.42, handLen: 0.22, headZ: -0.14, neckZ: -0.08, depth: 0.4,
  });
  const skinC = 0xa8948a;
  const mb = new MeshBuilder();
  addHumanoidBones(mb, P);
  mb.addBone('belly', 'spine', 0, P.spineY - 0.05, -0.1); // the gut: its own bone so it heaves with the breathing (poseExtras)
  mb.dirt = { y0: 0.5, k: 0.5 };
  mb.blood([0, 2.2, -0.32], 0.08, 0.8);
  mb.blood([0.5, 1.2, -0.05], 0.3, 1);
  mb.blood([-0.5, 1.2, -0.05], 0.3, 1);
  const yH = P.hipY, yS = P.spineY, yC = P.chestY, ySh = P.shoulderY, yE = P.elbowY, yW = P.wristY;
  const tf = field([
    { t: 0.55, y: yC + 0.07, st: 0.42, sy: 0.1, k: 0.05, sym: true }, // a sagging chest
    { t: 0.55, y: yC - 0.06, st: 0.5, sy: 0.03, k: -0.03, sym: true }, // the fold under it
    { t: 0, y: yC + 0.1, st: 0.1, sy: 0.14, k: -0.02 },
    { t: 0, y: yH + 0.0, st: 0.9, sy: 0.04, k: -0.05 }, // under the paunch
    { t: 0, y: yS - 0.05, st: 0.07, sy: 0.03, k: -0.03 }, // the navel
    { t: 1.6, y: yS - 0.12, st: 0.45, sy: 0.1, k: 0.045, sym: true }, // love handles
    { t: PI, ridge: 't', st: 0.07, k: -0.03, y0: yH, y1: ySh + 0.1, fade: 0.1 },
    { t: PI, y: yS + 0.06, st: 1.1, sy: 0.03, k: -0.028 }, // the rolls of a fat back
    { t: PI, y: yC - 0.04, st: 1.1, sy: 0.03, k: -0.025 },
    { t: PI - 0.5, y: yC + 0.14, st: 0.5, sy: 0.12, k: 0.045, sym: true },
    { t: PI - 0.4, y: ySh + 0.04, st: 0.4, sy: 0.08, k: 0.05, sym: true }, // trapezius piled up behind the head
    { t: PI - 0.45, y: yH - 0.05, st: 0.4, sy: 0.09, k: 0.04, sym: true },
  ]);
  const armF = (side) => field([
    { t: 0, y: yE + 0.2, st: 0.8, sy: 0.1, k: 0.03 },
    { t: PI, y: yE + 0.22, st: 0.8, sy: 0.12, k: 0.03 },
    { t: side * 1.3, y: ySh - 0.2, st: 0.6, sy: 0.03, k: -0.02 },
    { t: side * 0.9, y: yE - 0.12, st: 0.7, sy: 0.1, k: 0.025 },
    { t: PI, y: yE + 0.0, st: 0.5, sy: 0.04, k: 0.02 }, // the point of the elbow
  ]);
  // red to the elbows: the blood of his trade, dried black in the creases
  const butcher = (t, y, c) => {
    const k = clamp((yE + 0.08 - y) * 5 + (fbm3(t * 2, y * 6, 3, 2, 17) - 0.5) * 1.4, 0, 1);
    c.lerp(color(0x4a0806), k * 0.85);
  };
  const B = hulk(mb, P, {
    skin: { color: skinC, region: CR.ROT, mottle: 0.14, tint: hide(57, 0x6a2a2a, 0x74786a, 3.2) }, shade: 9,
    torso: [
      [0.92, 0.1, 0.1, 0.12, 2],
      [1.0, 0.32, 0.22, 0.27, 2.4],
      [1.1, 0.43, 0.36, 0.31, 2.5],
      [1.25, 0.48, 0.47, 0.32, 2.4],
      [1.42, 0.49, 0.47, 0.32, 2.4],
      [1.6, 0.47, 0.4, 0.33, 2.4],
      [1.78, 0.5, 0.34, 0.36, 2.5],
      [1.93, 0.56, 0.31, 0.38, 2.6],
      [2.04, 0.57, 0.28, 0.39, 2.6, 0, 0.02],
      [2.13, 0.44, 0.27, 0.37, 2.4, 0, 0.03],
      [2.21, 0.3, 0.22, 0.3, 2.2, 0, 0.05],
      [2.28, 0.15, 0.11, 0.17, 2, 0, 0.07],
    ],
    tf, nu: 28, nvT: 24,
    belly: { bone: 'belly', y: yS - 0.02, sy: 0.26, k: 0.82 },
    neck: [0.15, 0.135], neckDown: 0.08, neckBack: 0.04,
    arm: (s) => [
      [yW - 0.02, 0.085, 0.075, 0.08],
      [yW + 0.07, 0.1, 0.09, 0.09],
      [yE - 0.2, 0.15, 0.13, 0.135],
      [yE - 0.08, 0.155, 0.14, 0.145],
      [yE + 0.02, 0.14, 0.14, 0.15],
      [yE + 0.2, 0.172, 0.178, 0.172],
      [ySh - 0.1, 0.192, 0.19, 0.192, 2, s * 0.01],
      [ySh + 0.02, 0.186, 0.18, 0.19, 2, 0],
      [ySh + 0.1, 0.13, 0.13, 0.14, 2, -s * 0.03],
      [ySh + 0.14, 0.05, 0.05, 0.05, 2, -s * 0.06],
    ],
    af: armF, paintA: () => butcher, nuA: 16, nvA: 16,
    leg: () => [
      [P.ankleY - 0.01, 0.085, 0.085, 0.09],
      [P.ankleY + 0.08, 0.09, 0.09, 0.1],
      [P.kneeY - 0.26, 0.12, 0.11, 0.14],
      [P.kneeY - 0.1, 0.14, 0.125, 0.165],
      [P.kneeY + 0.02, 0.14, 0.15, 0.14],
      [P.thighY - 0.25, 0.18, 0.18, 0.17],
      [P.thighY - 0.08, 0.21, 0.21, 0.21],
      [P.thighY + 0.06, 0.215, 0.21, 0.22],
      [P.thighY + 0.15, 0.17, 0.17, 0.18],
    ],
    legEnd: () => P.kneeY - 0.2, nvL: 8,
  });
  const { T, arms, legs } = B;
  const H = bossHead(mb, P, {
    // a small, brutal head: the brow a shelf, the jaw a slab, the nose broken flat, a cleaver scar stitched shut across it
    face: { w: 1.16, h: 0.92, brow: 2.4, jaw: 1.6, chin: 1.3, noseW: 1.9, ear: 1.3, sockets: 2.0, cheek: 1.5 },
    headTint: (lx, ly, lz, c) => {
      const u = lx * 0.8 + ly * 0.6; // a line from the left temple down across the nose to the right jaw
      if (Math.abs(u - 0.004) < 0.011 && lz < 0) c.lerp(color(0x4a1414), 0.75);
      if (Math.abs(u - 0.004) < 0.022 && lz < 0 && Math.abs(Math.sin((lx - ly) * 120)) > 0.85) c.lerp(color(0x1a0a08), 0.8); // the stitches
    },
    skin: skinC, gaunt: 0, eye: 0xffa040, eyeGlow: 0.7, socket: 0.2, jawScale: 1.3, nose: 0.3, missingTeeth: 0x24,
  }, 1.36);
  void H;
  // heavy trousers into rubber boots
  ragPants(mb, B, yH + 0.1, () => P.kneeY - 0.16, { color: 0x2e2a26, region: CR.TWILL, push: 0.014, tear: 0.03, fray: 0.02, nvL: 8, tint: bloodied(11, 0.5) });
  for (const Lg of legs) bigBoot(mb, Lg, Lg.side, { w: 2.0, l: 1.55, h: 1.7, color: 0x1e2420, top: P.kneeY - 0.1 });
  // the apron: a bib up the chest and over the gut (it heaves with it), a skirt hanging from the paunch to the knees
  const apronTint = (p, n, c) => {
    const m = fbm3(p.x * 5, p.y * 4, p.z * 5, 3, 91);
    const smear = fbm3(p.x * 2.5, p.y * 9, p.z * 2.5, 2, 17); // streaks running down
    c.lerp(color(0x5a0806), clamp((m - 0.4) * 3.5 + (smear - 0.55) * 2.5 + (1.5 - p.y) * 0.6, 0, 0.95)); // soaked from the belly down
    c.lerp(color(0x2a0604), clamp((m - 0.62) * 4, 0, 0.6)); // dried black where it pooled
    c.lerp(color(0x2a1c14), clamp((0.95 - p.y) * 1.2, 0, 0.4)); // filth at the hem
  };
  const apron = { color: 0xd8d0b8, region: CR.CANVAS, mottle: 0.2, blood: false, tint: apronTint };
  const aT = 1.0, bibY = yC + 0.2, pA = 0.022;
  const bibW = (y) => (y > yC - 0.02 ? lerp(0.62, 0.42, clamp((y - yC + 0.02) / (bibY - yC + 0.02), 0, 1)) : aT);
  sheet(mb, T, -aT, aT, yH - 0.03, bibY, 14, 14, pA, { ...apron, double: true, tear: { amt: 0, fn: (x, y, z) => y > yC - 0.02 && Math.abs(angleOn(T, x, y, z)) > bibW(y) } });
  reweigh(mb, T.wts3);
  {
    const W = 10, Hn = 6;
    const geo = new THREE.PlaneGeometry(1, 1, W, Hn);
    const pa = geo.attributes.position;
    const yTop = yH - 0.02, yBot = P.kneeY + 0.1;
    for (let i = 0; i < pa.count; i++) {
      const u = pa.getX(i) * 2, v = 0.5 - pa.getY(i);
      const top = surfPoint(T, u * aT, yTop, pA);
      const sag = 0.014 * Math.sin(u * 7 + v * 3) * v; // cloth folds towards the hem
      pa.setXYZ(i, top[0] * (1 + 0.06 * v), lerp(yTop, yBot, v) - (v > 0.99 ? 0.03 * fbm3(u * 3, 1, 1, 2, 4) : 0), top[2] - 0.03 * v + sag);
    }
    geo.computeVertexNormals();
    bound(mb, [mb.bi('hips'), 1, 0, 0], () => mb.geom('root', geo, { ...apron, double: true, keepNormals: true }));
  }
  // its neck strap, and the ties round the waist knotted at the back
  const tie = { color: 0x8a8270, region: CR.CANVAS, mottle: 0.2 };
  strap(mb, T, [[-0.42, bibY - 0.01, pA], [-0.5, ySh - 0.02], [-0.8, ySh + 0.07], [PI + 0.5, ySh + 0.08], [PI, ySh + 0.05], [PI - 0.5, ySh + 0.08], [0.8, ySh + 0.07], [0.5, ySh - 0.02], [0.42, bibY - 0.01, pA]], 0.03, 0.008, { ...tie, segs: 26 });
  strap(mb, T, [[aT, yS - 0.06, pA], [1.5, yS - 0.07], [2.1, yS - 0.08], [2.7, yS - 0.08], [PI, yS - 0.09], [3.6, yS - 0.08], [4.2, yS - 0.08], [4.8, yS - 0.07], [TAU - aT, yS - 0.06, pA]], 0.03, 0.008, { ...tie, segs: 26 });
  // an old wound sewn shut across the back, in butcher's twine
  stitches(mb, T, [[PI + 0.95, yC + 0.16], [PI + 0.55, yC + 0.05], [PI + 0.2, yC - 0.1], [PI - 0.1, yS + 0.1]], { n: 12, w: 0.07, scar: 0x5a1a18 });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    bigHand(mb, 'hand' + n, s, { scale: 2.25, curl: s > 0 ? 1.2 : 0.75, spread: 1.05, thick: 1.4, skin: 0x5a1a14, region: CR.ROT, nu: 6 });
  }
  const steel = { color: 0x6a665e, region: CR.PLAIN, mottle: 0.4, blood: false };
  const wood = { color: 0x4a3524, region: CR.LEATHER, mottle: 0.25, blood: false };
  // the hook in his right fist: a wooden bar across the palm, the steel out between his fingers and down to its point
  {
    const hb = mb.bonePos('handR');
    const hw = [mb.bi('handR'), 1, 0, 0];
    const at = (x, y, z) => [hb[0] + x, hb[1] + y, hb[2] + z];
    bound(mb, hw, () => {
      mb.seg('root', at(-0.05, -0.19, -0.16), at(-0.05, -0.19, 0.16), 0.036, 0.036, { rs: 7, ...wood, caps: 2 });
      mb.tube('root', [at(-0.05, -0.2, 0), at(-0.03, -0.4, 0.0), at(-0.02, -0.52, -0.03), at(-0.02, -0.62, -0.12), at(-0.02, -0.61, -0.24), at(-0.02, -0.52, -0.3), at(-0.02, -0.42, -0.28)], 0.034, 0.008, { rs: 6, ts: 16, ...steel, tint: (p, nn, c) => p.y < hb[1] - 0.45 && c.lerp(color(0x4a0806), 0.6) });
    });
  }
  // the hook he was hung on, still through the back of his left shoulder, and its chain down his back
  {
    const cw = [mb.bi('chest'), 1, 0, 0];
    const a = surfPoint(T, PI + 0.75, ySh - 0.02, 0);
    bound(mb, cw, () => mb.tube('root', [[a[0], a[1] - 0.12, a[2] + 0.07], [a[0], a[1] + 0.08, a[2] + 0.12], [a[0], a[1] + 0.2, a[2] + 0.02], [a[0] + 0.01, a[1] + 0.16, a[2] - 0.12], [a[0] + 0.02, a[1] + 0.04, a[2] - 0.16]], 0.024, 0.01, { rs: 6, ts: 12, ...steel }));
    chain(mb, (x, y) => T.wts(y, x), [[a[0], a[1] - 0.12, a[2] + 0.07], [a[0] + 0.03, a[1] - 0.32, a[2] + 0.06], [a[0] + 0.08, yC - 0.05, surfPoint(T, PI + 0.6, yC - 0.05, 0.04)[2]], [a[0] + 0.14, yS + 0.05, surfPoint(T, PI + 0.45, yS + 0.05, 0.04)[2]], [a[0] + 0.12, yS - 0.2, surfPoint(T, PI + 0.4, yS - 0.2, 0.05)[2]]], 0.036, { color: 0x4e4a44 });
    // ...and a cleaver somebody left in the other one
    const b = surfPoint(T, PI - 0.7, ySh - 0.08, 0);
    bound(mb, cw, () => {
      mb.box('root', [b[0] + 0.02, b[1] + 0.06, b[2] + 0.07], [0.012, 0.2, 0.22], { ...steel, rot: [0.5, 0.25, 0], tint: (p, nn, c) => p.z < b[2] + 0.05 && c.lerp(color(0x4a0806), 0.7) });
      mb.seg('root', [b[0] + 0.045, b[1] + 0.13, b[2] + 0.15], [b[0] + 0.1, b[1] + 0.25, b[2] + 0.31], 0.022, 0.02, { rs: 6, ...wood, caps: 2 });
    });
    void arms;
  }
  mb.aoStrength = 0.34;
  return { mb, P };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  // a heavy, rolling waddle under the gut, fists swinging wide of it; enraged (RUN) it lumbers in bent forward
  walkLean: -0.16, runLean: -0.42, cycleWalk: 2.1, cycleRun: 3.1, walkStride: 0.3, walkKnee: 0.42, runStride: 0.5, runKnee: 0.85,
  limp: 0, sway: 1.5, waddle: 1, armWalk: 0.2, armDroop: 0.08, armSwing: 0.3, armRun: 0.55, armOut: 0.34, elbow: 0.35, headPitch: 0.12, headTilt: 0.06, jaw: 0.3,
  legSplay: 0.12, idleLean: -0.1, neckFwd: 0.1, shoulderRoll: 0.05,
};

/**
 * Its special (ZANIM.SPECIAL): the enrage roar: rears up, chest out, fists spread wide and trembling, head thrown back
 */
function poseRoar(z, p) {
  const t = z.stateT;
  clearPose(p, z.nb);
  const k = smooth(t / 0.35) * (1 - smooth((t - 1.05) / 0.3));
  const sh = Math.sin(t * 38) * 0.035 * k;
  legsStatic(z, p, 0.28 * k, -0.4 * k, -0.12 * k, -0.18 * k, 0.16);
  z.standOn = true;
  R(p, SPINE, -0.1 + 0.2 * k, 0, 0);
  R(p, CHEST, 0.18 * k + sh, 0, 0);
  arm(p, 0, 0.35 + 0.35 * k + sh, 0.15 + 1.05 * k, 0.3, 0.3 + 0.9 * k, 0.2);
  arm(p, 1, 0.35 + 0.35 * k - sh, 0.15 + 1.05 * k, 0.3, 0.3 + 0.9 * k, 0.2);
  headLook(p, 0.1 + 0.55 * k + sh, 0, 0, 0.4);
  R(p, JAW, -0.25 - 0.75 * k, 0, 0);
  z.bellyPulse = 0.1 * k;
}

export { buildBrute as build, poseRoar as special };
// its swing is the tank's: both fists raised overhead and smashed down
export { attack } from './tank.js';
