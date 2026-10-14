// The Abomination (ZTYPE.BOSS_ABOMINATION), a boss: its model, how it moves, its special and its swing (gathered by
// zombies/index.js).
import * as THREE from 'three';
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, lerp, smooth } from '../skinning.js';
import { CR } from '../charTextures.js';
import { hulk, field, ringLoft, limb, bigHand, bigFoot, tornOpen, blister, rag, shard, strap, bound, jointW } from '../monsters.js';
import { surfPoint } from '../humans.js';
import { SPINE, CHEST, JAW, humanP, addHumanoidBones } from '../characters/skeleton.js';
import { clearPose, R, arm, headLook, legsStatic } from '../characters/posekit.js';
import { mulColor, bossHead, hide, flayed } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.BOSS_ABOMINATION;

/**
 * Somebody the body has not finished taking in: a skull pressing out under its hide at `c` (model coordinates), facing
 * along `dir`, the sockets and the mouth sunk dark, an arm still reaching out of the flesh beside it. Bound by w.
 */
function absorbed(mb, w, c, dir, r, o) {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
  const at = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).multiplyScalar(r).applyQuaternion(q);
    return [c[0] + v.x, c[1] + v.y, c[2] + v.z];
  };
  const dark = { color: 0x1c0806, region: CR.FLESH, mottle: 0.1, blood: false, ao: false };
  bound(mb, w, () => {
    mb.ellip('root', c, [r * 0.82, r * 1.02, r * 0.92], { ws: 10, hs: 8, q, color: o.skin, region: CR.ROT, mottle: 0.2, tint: o.tint, noise: r * 0.03, nf: 9 });
    mb.ellip('root', at(0, -0.62, -0.5), [r * 0.52, r * 0.5, r * 0.5], { ws: 8, hs: 6, q, color: o.skin, region: CR.ROT, mottle: 0.2, tint: o.tint }); // the jaw
    for (const s of [-1, 1]) mb.ellip('root', at(s * 0.36, 0.12, -0.8), [r * 0.2, r * 0.17, r * 0.14], { ws: 6, hs: 4, q, ...dark });
    mb.ellip('root', at(0, -0.55, -0.9), [r * 0.26, r * 0.3, r * 0.14], { ws: 7, hs: 5, q, ...dark }); // a mouth stretched open
    for (let i = 0; i < 5; i++) mb.box('root', at((i - 2) * 0.1, -0.36, -0.99), [r * 0.07, r * 0.12, r * 0.05], { q, color: 0xc8bc98, region: CR.BONE, mottle: 0.2, blood: false, ao: false });
  });
  if (o.arm) {
    // the arm: out of the flesh below the head, bent at the elbow, the fingers spread
    const a = at(o.arm * 0.9, -0.9, -0.1), e = at(o.arm * 1.5, -1.3, -1.5), h = at(o.arm * 1.1, -0.5, -2.7);
    bound(mb, w, () => {
      ringLoft(mb, 'root', [{ c: a, rx: r * 0.34 }, { c: [lerp(a[0], e[0], 0.5), lerp(a[1], e[1], 0.5), lerp(a[2], e[2], 0.5)], rx: r * 0.27 }, { c: e, rx: r * 0.22 }, { c: [lerp(e[0], h[0], 0.5), lerp(e[1], h[1], 0.5), lerp(e[2], h[2], 0.5)], rx: r * 0.2 }, { c: h, rx: r * 0.15 }], { nu: 7, sub: 2, color: o.skin, region: CR.ROT, mottle: 0.2, tint: o.tint, cap1: r * 0.1 });
      for (let i = 0; i < 4; i++) {
        const f = at(o.arm * 1.1 + (i - 1.5) * 0.3, -0.15 + Math.abs(i - 1.5) * -0.12, -3.5);
        mb.tube('root', [h, [lerp(h[0], f[0], 0.55), lerp(h[1], f[1], 0.55) + r * 0.12, lerp(h[2], f[2], 0.55)], f], r * 0.07, r * 0.035, { rs: 4, ts: 3, color: o.skin, region: CR.ROT, tint: o.tint });
      }
    });
  }
}

/**
 * The Abomination: what the dead make of each other. Four metres of several people grown into one - a hump of them on
 * its back, faces still pressing out of it and an arm or two still reaching - with one arm far bigger than the other, a
 * trunk split open down the front into a mouth of ribs, two withered arms left over beside it, and too many eyes.
 */
function buildAbomination() {
  const P = humanP({
    hipY: 1.5, hipW: 0.32, thighLen: 0.72, shinLen: 0.68, spineLen: 0.42, chestLen: 0.6, neckOff: 0.72, neckLen: 0.14,
    headR: 0.3, shoulderW: 0.9, shoulderDrop: 0.08, uarmLen: 1.05, farmLen: 1.0, handLen: 0.5, headZ: -0.42, neckZ: -0.22, depth: 0.6,
  });
  const skinC = 0x96736a, raw = 0x7a1614;
  const mb = new MeshBuilder();
  addHumanoidBones(mb, P);
  mb.dirt = { y0: 0.9, k: 0.6 };
  mb.blood([0, 3.48, -0.75], 0.2, 0.9);
  mb.blood([0, 2.1, -0.6], 0.6, 0.8);
  mb.blood([0.95, 0.9, -0.1], 0.5, 0.9);
  mb.blood([-0.95, 1.0, -0.1], 0.4, 0.8);
  const yH = P.hipY, yS = P.spineY, yC = P.chestY, ySh = P.shoulderY, yE = P.elbowY, yW = P.wristY;
  const skinT = hide(41, 0x6a1c1c, 0x5a5268, 2.4);
  const tf = field([
    { t: 0.6, y: yC + 0.36, st: 0.42, sy: 0.2, k: 0.08, sym: true }, // slabs of chest either side of the split
    { t: 0.6, y: yC + 0.1, st: 0.5, sy: 0.05, k: -0.04, sym: true },
    { t: 1.2, y: yC - 0.05, st: 0.3, sy: 0.18, k: 0.06, sym: true },
    { t: 1.4, y: yS + 0.0, st: 0.36, sy: 0.2, k: 0.05, sym: true },
    { t: PI, ridge: 't', st: 0.07, k: -0.07, y0: yH - 0.1, y1: ySh + 0.2, fade: 0.15 },
    { t: PI - 0.8, y: yC + 0.2, st: 0.42, sy: 0.3, k: 0.1, sym: true },
    { t: PI - 0.5, y: ySh + 0.14, st: 0.4, sy: 0.22, k: 0.1 }, // the hump, lopsided
    { t: PI + 0.45, y: ySh + 0.0, st: 0.4, sy: 0.25, k: 0.14 },
    { t: PI - 0.48, y: yH - 0.06, st: 0.4, sy: 0.14, k: 0.06, sym: true },
    // where one body meets the next: seams round the trunk
    { t: 2.2, y: yC + 0.25, st: 0.9, sy: 0.035, k: -0.05 },
    { t: -1.3, y: yS + 0.2, st: 0.8, sy: 0.035, k: -0.05 },
  ]);
  const armF = (side) => field([
    { t: 0, y: yE + 0.45, st: 0.7, sy: 0.22, k: 0.06 },
    { t: PI, y: yE + 0.5, st: 0.8, sy: 0.26, k: 0.05 },
    { t: side * 1.57, ridge: 't', st: 0.1, k: -0.03, y0: yE + 0.12, y1: ySh - 0.25, fade: 0.12 },
    { t: side * 1.2, y: ySh - 0.4, st: 0.5, sy: 0.05, k: -0.03 },
    { t: side * 0.9, y: yE - 0.28, st: 0.6, sy: 0.22, k: 0.05 },
    { t: 2.5, y: yE - 0.5, st: 1.2, sy: 0.04, k: -0.04 }, // a seam round the forearm
  ], side > 0 ? 1.3 : 1);
  let maw = null;
  const mawAt = [-0.4, 0.4, yS - 0.12, yC + 0.2];
  const armK = (s) => (s > 0 ? 1 : 0.8);
  const B = hulk(mb, P, {
    skin: { color: skinC, region: CR.ROT, mottle: 0.18, tint: skinT }, raw, rawAt: -0.035, shade: 6,
    torso: [
      [1.26, 0.15, 0.14, 0.16, 2],
      [1.38, 0.46, 0.3, 0.36, 2.4],
      [1.52, 0.6, 0.4, 0.44, 2.5],
      [1.75, 0.6, 0.46, 0.42, 2.4],
      [1.95, 0.62, 0.5, 0.42, 2.4],
      [2.25, 0.68, 0.5, 0.46, 2.4],
      [2.55, 0.8, 0.52, 0.56, 2.5],
      [2.85, 0.93, 0.52, 0.7, 2.6, 0.03, 0.04],
      [3.1, 0.98, 0.5, 0.8, 2.6, 0.04, 0.06],
      [3.3, 0.82, 0.5, 0.84, 2.5, 0.05, 0.06],
      [3.5, 0.58, 0.44, 0.72, 2.3, 0.06, 0.1],
      [3.68, 0.3, 0.26, 0.44, 2, 0.06, 0.2],
    ],
    tf, nu: 28, nvT: 25,
    paintT: (t, y, c) => {
      flayed(5, 0.9, 0.58)(t, y, c);
      maw.paint(t, y, c);
    },
    holeT: (x, y, z) => maw.fn(x, y, z),
    prep: (T) => (maw = tornOpen(mb, T, ...mawAt, { ribs: 0, depth: 0.2, nu: 10, nv: 14, seed: 12, rag: 0.22, flesh: 0x5a100e })),
    neck: [0.26, 0.24], neckDown: 0.12, neckBack: 0.08,
    arm: (s) => {
      const m = armK(s);
      return [
        [yW - 0.04, 0.17, 0.15, 0.16],
        [yW + 0.14, 0.2, 0.18, 0.19],
        [yE - 0.55, 0.3, 0.27, 0.28],
        [yE - 0.28, 0.36, 0.33, 0.33],
        [yE - 0.08, 0.29, 0.26, 0.29],
        [yE + 0.07, 0.25, 0.25, 0.28],
        [yE + 0.4, 0.31, 0.34, 0.31],
        [yE + 0.7, 0.3, 0.31, 0.3],
        [ySh - 0.14, 0.35, 0.35, 0.36, 2, s * 0.03],
        [ySh + 0.07, 0.34, 0.33, 0.35, 2, s * 0.01],
        [ySh + 0.22, 0.24, 0.23, 0.25, 2, -s * 0.05],
        [ySh + 0.3, 0.09, 0.09, 0.1, 2, -s * 0.12],
      ].map((r) => [r[0], r[1] * m, r[2] * m, r[3] * m, r[4] || 2, r[5] || 0]);
    },
    af: armF, paintA: (s) => flayed(s > 0 ? 13 : 19, 1.3, 0.58), nuA: 15, nvA: 18,
    leg: () => [
      [P.ankleY - 0.01, 0.14, 0.14, 0.15],
      [P.ankleY + 0.1, 0.15, 0.15, 0.165],
      [P.kneeY - 0.4, 0.2, 0.18, 0.23],
      [P.kneeY - 0.15, 0.23, 0.2, 0.27],
      [P.kneeY + 0.03, 0.23, 0.24, 0.23],
      [P.thighY - 0.4, 0.29, 0.29, 0.27],
      [P.thighY - 0.12, 0.34, 0.34, 0.33],
      [P.thighY + 0.08, 0.35, 0.34, 0.36],
      [P.thighY + 0.22, 0.27, 0.27, 0.28],
    ],
    lf: () => field([{ t: 0, y: P.thighY - 0.3, st: 0.7, sy: 0.24, k: 0.05 }, { t: 0, y: P.kneeY + 0.02, st: 0.45, sy: 0.07, k: 0.04 }, { t: PI, y: P.kneeY - 0.22, st: 0.7, sy: 0.16, k: 0.05 }]),
    paintL: (s) => flayed(s > 0 ? 23 : 31, 1.5, 0.6),
  });
  const { T, arms } = B;
  const hr = P.headR;
  bossHead(mb, P, {
    face: { w: 1.12, brow: 2.5, jaw: 1.8, chin: 1.35, sockets: 2.6, rot: 1, cheek: 1.4 },
    skin: skinC, gaunt: 0.3, eye: 0xff3010, eyeGlow: 1, jawScale: 1.55, fang: true, nose: 0.2, cheekTear: 1,
  }, 1.12);
  // more eyes than a head has room for, up the left of its brow
  for (const [x, y, r] of [[-0.42, 1.38, 0.075], [-0.2, 1.52, 0.06], [-0.55, 1.12, 0.055], [0.3, 1.45, 0.05]]) {
    mb.ellip('head', [x * hr, hr * y, -hr * (0.86 - Math.abs(x) * 0.25)], [hr * r * 1.5, hr * r * 1.3, hr * r], { ws: 6, hs: 4, color: 0x2a0806, region: CR.FLESH, ao: false, blood: false, mottle: 0 });
    mb.ellip('head', [x * hr, hr * y, -hr * (0.9 - Math.abs(x) * 0.25)], [hr * r, hr * r * 0.85, hr * r * 0.7], { ws: 6, hs: 4, color: 0xff4020, glow: 1, region: CR.PLAIN, ao: false, blood: false, mottle: 0 });
  }
  // the mouth down its front: the ribs of the chest it opened, grown into teeth along both lips
  {
    const [t0, t1, y0, y1] = mawAt;
    for (let i = 0; i < 9; i++) {
      const u = (i + 0.5) / 9;
      const y = lerp(y0 + 0.05, y1 - 0.05, u);
      const wd = Math.sin(u * PI) ** 0.6;
      for (const s of [-1, 1]) {
        if ((i * 7 + (s > 0 ? 3 : 0)) % 11 === 0) continue; // (a gap or two)
        const a = surfPoint(T, s * lerp(0.1, t1 * 0.92, wd), y, -0.05);
        const len = (0.16 + 0.1 * wd) * (0.8 + ((i * 13 + s * 5) % 7) / 14);
        shard(mb, T.wts(y, a[0]), a, [a[0] - s * len * 0.75, a[1] + (s > 0 ? 0.03 : -0.03), a[2] - len * 0.75], 0.05, { rs: 4, color: 0xd2c6a4 });
      }
    }
    // a throat of gut behind them
    const c = surfPoint(T, 0, (y0 + y1) / 2, -0.24);
    bound(mb, T.wts((y0 + y1) / 2, 0), () => mb.ellip('root', c, [0.16, 0.26, 0.1], { ws: 8, hs: 7, color: 0x2a0606, region: CR.FLESH, mottle: 0.3, blood: false, noise: 0.02, nf: 12 }));
  }
  // withered extra arms beside it, on bones of their own (poseExtras): xarm -> xfarm
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const sy2 = P.chestY - 0.3;
    mb.addBone('xarm' + n, 'chest', s * 0.55, sy2, -0.35);
    mb.addBone('xfarm' + n, 'xarm' + n, s * 0.55, sy2 - 0.55, -0.35);
    const xa = mb.bi('xarm' + n), xf = mb.bi('xfarm' + n);
    const jw = jointW(xa, xf, sy2 - 0.55, 0.06);
    const x = s * 0.55, z = -0.35;
    ringLoft(mb, 'xarm' + n, [
      { c: [x - s * 0.06, sy2 + 0.14, z + 0.12], rx: 0.13 }, { c: [x, sy2, z], rx: 0.1 }, { c: [x, sy2 - 0.28, z], rx: 0.075 }, { c: [x, sy2 - 0.55, z], rx: 0.082 },
      { c: [x, sy2 - 0.8, z], rx: 0.062 }, { c: [x, sy2 - 1.03, z], rx: 0.05 }, { c: [x - s * 0.01, sy2 - 1.1, z], rx: 0.062, ry: 0.04 },
    ], { nu: 8, sub: 2, up: [0, 0, -1], color: 0xa48278, region: CR.ROT, mottle: 0.2, tint: skinT, wts: (p) => jw(p[1]), cap1: 0.03 });
    for (let f = 0; f < 3; f++) {
      limb(mb, 'xfarm' + n, [[x, sy2 - 1.1, z + (f - 1) * 0.045], [x - s * 0.03, sy2 - 1.24, z + (f - 1) * 0.07 - 0.02], [x - s * 0.07, sy2 - 1.36, z + (f - 1) * 0.085 - 0.07]], [0.022, 0.018, 0.012], { nu: 5, sub: 1, color: 0xa48278, region: CR.ROT });
      shard(mb, [xf, 1, 0, 0], [x - s * 0.07, sy2 - 1.35, z + (f - 1) * 0.085 - 0.07], [x - s * 0.12, sy2 - 1.47, z + (f - 1) * 0.09 - 0.13], 0.014, { color: 0x2a2016 });
    }
  }
  // the hands that slam and throw: the right the bigger, both clawed
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    bigHand(mb, 'hand' + n, s, { scale: s > 0 ? 4.3 : 3.4, curl: 0.5, spread: 1.1, thick: 1.25, fingerMul: 1.35, claws: s > 0 ? 0.2 : 0.16, skin: mulColor(skinC, 0.86), region: CR.ROT, tint: skinT, nu: 6 });
    bigFoot(mb, 'foot' + n, s, { w: 3.1, l: 2.3, h: 2.7, skin: mulColor(skinC, 0.88), region: CR.ROT, tint: skinT, claws: 0.09 });
  }
  // the hump: the people in it
  const cw = [mb.bi('chest'), 1, 0, 0];
  const body = { skin: mulColor(skinC, 1.08), tint: skinT };
  {
    const a = surfPoint(T, PI + 0.55, ySh + 0.12, -0.13);
    absorbed(mb, cw, a, [0.55, 0.5, 0.8], 0.21, { ...body, arm: 1 });
    const b = surfPoint(T, PI - 0.75, ySh - 0.1, -0.12);
    absorbed(mb, cw, b, [-0.8, 0.25, 0.7], 0.19, body);
    const c = surfPoint(T, -1.25, yC + 0.4, -0.11);
    absorbed(mb, cw, c, [-1, 0.1, -0.35], 0.18, body);
    const d = surfPoint(T, PI + 0.1, yC + 0.15, -0.1);
    absorbed(mb, T.wts(yC + 0.15, 0), d, [0.2, -0.1, 1], 0.17, body);
  }
  // the spines of all of them, come out through the back in a broken row
  const rnd = mulberry32(4242);
  for (let i = 0; i < 7; i++) {
    const y = yC - 0.1 + i * 0.2;
    const tt = PI + (i % 2 ? 0.16 : -0.14);
    const a = surfPoint(T, tt, y, -0.08);
    const len = 0.3 + rnd() * 0.3;
    shard(mb, T.wts(y, a[0]), a, [a[0] * 1.3, a[1] + len * 0.7, a[2] + len], 0.085, { rs: 4 });
  }
  shard(mb, [mb.bi('uarmR'), 1, 0, 0], surfPoint(arms[1], 2.0, ySh - 0.1, -0.06), [1.3, ySh + 0.25, 0.45], 0.09, { rs: 4 });
  shard(mb, [mb.bi('farmR'), 1, 0, 0], surfPoint(arms[1], 2.0, yE - 0.25, -0.06), [1.3, yE - 0.05, 0.5], 0.08, { rs: 4 });
  // sores that glow under the skin of its back and shoulders
  for (let i = 0; i < 6; i++) blister(mb, T, PI + (rnd() - 0.5) * 2.2, ySh - 0.5 + rnd() * 0.7, 0.07 + rnd() * 0.04, 0.6, { color: 0xffa040, glow: 0.9, rim: 0x5a1410, ws: 7, hs: 5 });
  // what it still wears of what they wore: rags round the hips
  const rc = [0x2a2622, 0x3a3428, 0x26303a, 0x4a2a22, 0x2e2e2a];
  for (let i = 0; i < 11; i++) {
    const t = (i / 11) * TAU + rnd() * 0.3;
    const a = surfPoint(T, t, yH + 0.08 + rnd() * 0.06, 0.02);
    rag(mb, 'hips', a, 0.5 + rnd() * 0.45, 0.22 + rnd() * 0.16, -t, { color: rc[i % rc.length], region: i % 2 ? CR.DENIM : CR.CLOTH, seed: i + 3, sway: 0.08, nv: 4 });
  }
  strap(mb, T, [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2, 4.8, 5.4, 6.0, TAU].map((t) => [t, yH + 0.12 + 0.03 * Math.sin(t * 2)]), 0.07, 0.02, { color: 0x2a2018, region: CR.LEATHER, segs: 36 });
  mb.aoStrength = 0.36;
  return { mb, P };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.3, runLean: -0.45, cycleWalk: 3.0, cycleRun: 4.2, walkStride: 0.35, walkKnee: 0.5, runStride: 0.5, runKnee: 0.75,
  limp: 0.3, sway: 0.7, armWalk: 0.35, armDroop: 0.15, armSwing: 0.25, armRun: 0.6, elbow: 0.4, headPitch: 0.2, headTilt: 0.1, jaw: 0.3, legSplay: 0.1,
  idleLean: -0.3, roar: true,
};

/** Its special (ZANIM.SPECIAL): two-arm ground slam, loops */
function poseSlam(z, p) {
  const t = z.stateT;
  const u = (t % 1.6) / 1.6;
  clearPose(p, z.nb);
  legsStatic(z, p, 0.35, -0.45, -0.1, -0.2, 0.12);
  const up = u < 0.5 ? smooth(u / 0.5) : u < 0.62 ? 1 - smooth((u - 0.5) / 0.12) * 1.4 : -0.4 * (1 - smooth((u - 0.62) / 0.38));
  R(p, SPINE, -0.25 + up * 0.35, 0, 0);
  R(p, CHEST, -0.2 + up * 0.3, 0, 0);
  arm(p, 0, 0.5 + up * 2.3, 0.2, 0.2, 0.3 + 0.3 * Math.max(0, up), 0.2);
  arm(p, 1, 0.5 + up * 2.3, 0.2, 0.2, 0.3 + 0.3 * Math.max(0, up), 0.2);
  headLook(p, 0.3 + up * 0.3, 0, 0, 0.3);
  R(p, JAW, -0.3 - 0.6 * Math.max(0, up), 0, 0);
}

function abomSweep(z, p, u) {
  // sweeping right claw from right to left
  const w = u < 0.4 ? smooth(u / 0.4) : u < 0.6 ? 1 - smooth((u - 0.4) / 0.2) * 2 : -1 + smooth((u - 0.6) / 0.4);
  R(p, SPINE, -0.2, w * 0.35, 0);
  R(p, CHEST, -0.15, w * 0.35, 0);
  arm(p, 1, 1.4, 0.6 + 0.8 * w, 0.2, 0.4, 0.3);
  arm(p, 0, 0.6, 0.4, 0, 0.6, 0.2);
  headLook(p, 0.15, -w * 0.3, 0, 0.3);
  R(p, JAW, -0.35 - 0.25 * Math.abs(w), 0, 0);
}

export { buildAbomination as build, poseSlam as special, abomSweep as attack };
