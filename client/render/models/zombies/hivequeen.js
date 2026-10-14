// The Hive Queen (ZTYPE.BOSS_HIVEQUEEN), a boss: its model, how it moves, its special, its swing and the throb of its
// glow (gathered by zombies/index.js).
import * as THREE from 'three';
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3, clamp, lerp, smooth, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { deadHead } from '../people.js';
import { oldLook, bloodied } from '../deadlooks.js';
import { hulk, field, ringLoft, bigHand, bigFoot, blister, rag, shard, bound, angDiff } from '../monsters.js';
import { surfPoint, headPoint, sheet } from '../humans.js';
import { SPINE, CHEST, JAW, humanP, addHumanoidBones } from '../characters/skeleton.js';
import { clearPose, R, arm, headLook, legsStatic } from '../characters/posekit.js';
import { mulColor, hide } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.BOSS_HIVEQUEEN;
// the sac on her back
export const glow = (time, off) => 0.8 + 0.25 * Math.sin(time * 3.1 + off);

/**
 * The Hive Queen: a woman three and a half metres tall and starved to the bone, carrying a roost. Four jointed legs of
 * chitin have grown out of her back and hold up the sac that hangs behind her hips - plated above, lit green from
 * inside below, its back pocked with the cells her bats crawl out of. Scythes of the same stuff run back from her
 * forearms, a crown of it has come through her scalp, and her jaw has parted into mandibles. Her gown is still on her.
 */
function buildHiveQueen() {
  const P = humanP({
    hipY: 1.4, hipW: 0.16, thighLen: 0.68, shinLen: 0.64, spineLen: 0.34, chestLen: 0.42, neckOff: 0.4, neckLen: 0.26,
    headR: 0.24, shoulderW: 0.4, shoulderDrop: 0.08, uarmLen: 0.82, farmLen: 0.86, handLen: 0.34, headZ: -0.06, depth: 0.3,
  });
  const chit = 0x343a2a, skinC = 0x6a745c, gown = 0x1e1826;
  const mb = new MeshBuilder();
  mb.bloodColor = color(0x2a4a08);
  addHumanoidBones(mb, P);
  mb.dirt = { y0: 0.5, k: 0.5 };
  mb.blood([0, 3.0, -0.3], 0.2, 0.5);
  const yH = P.hipY, yS = P.spineY, yC = P.chestY, ySh = P.shoulderY, yE = P.elbowY, yW = P.wristY;
  const skinT = hide(71, 0x3a4a2a, 0x4a4458, 3);
  const ribs = (t, y) => {
    if (y < yC - 0.22 || y > yC + 0.24) return 0;
    const fr = clamp(Math.cos(t) * 0.6 + 0.6, 0, 1) * (Math.abs(Math.sin(t)) > 0.1 ? 1 : 0.25);
    const r = Math.abs(Math.sin(((y - yC + 0.22) * PI) / 0.075));
    return (r * r * 0.022 - 0.012) * fr;
  };
  const tf0 = field([
    { t: 0, y: yS + 0.1, st: 0.8, sy: 0.14, k: -0.035 }, // a belly sunk under the ribs
    { t: 0.9, y: yH + 0.04, st: 0.25, sy: 0.07, k: 0.03, sym: true }, // the points of the hips
    { t: 0.45, y: ySh - 0.02, st: 0.5, sy: 0.03, k: 0.02, sym: true }, // collarbones
    { t: PI, ridge: 't', st: 0.06, k: 0.02, y0: yH, y1: ySh + 0.1, fade: 0.06 }, // the spine standing out
    { t: PI - 0.55, y: yC + 0.2, st: 0.3, sy: 0.12, k: 0.03, sym: true }, // shoulder blades
  ]);
  const tf = (t, y) => tf0(t, y) + ribs(t, y) + (Math.abs(angDiff(t, PI)) < 0.12 ? 0.012 * Math.abs(Math.sin(y * 34)) : 0);
  const B = hulk(mb, P, {
    skin: { color: skinC, region: CR.ROT, mottle: 0.16, tint: skinT }, shade: 16,
    torso: [
      [1.2, 0.08, 0.08, 0.1, 2],
      [1.3, 0.2, 0.15, 0.2, 2.3],
      [1.42, 0.27, 0.18, 0.22, 2.4],
      [1.6, 0.2, 0.14, 0.16, 2.2],
      [1.78, 0.2, 0.15, 0.16, 2.2],
      [2.0, 0.28, 0.2, 0.2, 2.3],
      [2.2, 0.35, 0.23, 0.24, 2.4],
      [2.38, 0.4, 0.22, 0.26, 2.5],
      [2.48, 0.42, 0.19, 0.25, 2.5],
      [2.58, 0.3, 0.15, 0.2, 2.3],
      [2.66, 0.14, 0.1, 0.13, 2],
    ],
    tf, nu: 26, nvT: 28,
    neck: [0.088, 0.078], neckDown: 0.08,
    arm: (s) => [
      [yW - 0.01, 0.04, 0.036, 0.04],
      [yW + 0.1, 0.05, 0.045, 0.05],
      [yE - 0.3, 0.066, 0.06, 0.06],
      [yE - 0.05, 0.06, 0.055, 0.06],
      [yE + 0.03, 0.064, 0.06, 0.068],
      [yE + 0.3, 0.07, 0.07, 0.07],
      [ySh - 0.1, 0.086, 0.086, 0.086],
      [ySh + 0.02, 0.09, 0.086, 0.09],
      [ySh + 0.08, 0.05, 0.05, 0.05, 2, -s * 0.03],
      [ySh + 0.1, 0.015, 0.015, 0.015, 2, -s * 0.05],
    ],
    nuA: 10, nvA: 14,
    leg: () => [
      [P.ankleY - 0.01, 0.045, 0.045, 0.05],
      [P.ankleY + 0.08, 0.05, 0.05, 0.056],
      [P.kneeY - 0.3, 0.07, 0.06, 0.086],
      [P.kneeY - 0.05, 0.075, 0.075, 0.075],
      [P.kneeY + 0.05, 0.08, 0.086, 0.08],
      [P.thighY - 0.3, 0.105, 0.105, 0.1],
      [P.thighY - 0.05, 0.125, 0.125, 0.125],
      [P.thighY + 0.1, 0.12, 0.12, 0.125],
    ],
    nuL: 10, nvL: 10,
  });
  const { T, arms } = B;
  const hr = P.headR;
  const L = oldLook({
    sex: 'f', face: { w: 0.86, h: 1.05, d: 1.35, jaw: 0.9, chin: 1.2, sockets: 2.6, gaunt: 1, rot: 0.8, cheek: 1.5, noNose: true, fem: 0.4 },
    skin: skinC, gaunt: 1, eye: 0x90ff48, eyeGlow: 1.1, jawScale: 1.2, fang: true, nose: 0, missingTeeth: 0x10,
    hair: { color: 0x14100e, long: true },
    headTint: (lx, ly, lz, c) => lz > 0.05 && ly > 0 && c.lerp(color(chit), 0.5),
  });
  L.blood = null;
  L.hair = { style: 'long', color: 0x14100e, length: 0.3, ragged: 0.3 };
  const H = deadHead(mb, P, L);
  // a crown of chitin through the scalp: a fan of blades, the tallest at the back
  const hp = new THREE.Vector3();
  const hb = mb.bonePos('head');
  const hw = [mb.bi('head'), 1, 0, 0];
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) / 3; // -1..1 across the head
    headPoint(H, a * 1.5 + Math.sign(a || 1) * 0.5, 0.75 - Math.abs(a) * 0.22, hp);
    const base = [hb[0] + hp.x * 0.9, hb[1] + hp.y - 0.03, hb[2] + hp.z * 0.9];
    const len = hr * (1.5 - Math.abs(a) * 0.6);
    shard(mb, hw, base, [base[0] + a * len * 0.5, base[1] + len * 0.9, base[2] + len * 0.55], hr * 0.16, { rs: 4, color: i % 2 ? 0x4a5038 : chit });
  }
  // mandibles where the corners of her mouth were, on the jaw
  const jw = [mb.bi('jaw'), 1, 0, 0];
  for (const s of [-1, 1]) {
    headPoint(H, s * 0.75, -0.5, hp);
    const a = [hb[0] + hp.x, hb[1] + hp.y, hb[2] + hp.z];
    bound(mb, jw, () => ringLoft(mb, 'root', [
      { c: a, rx: 0.03, ry: 0.045 }, { c: [a[0] + s * 0.06, a[1] - 0.1, a[2] - 0.12], rx: 0.024, ry: 0.04 },
      { c: [a[0] + s * 0.02, a[1] - 0.18, a[2] - 0.26], rx: 0.016, ry: 0.028 }, { c: [a[0] - s * 0.06, a[1] - 0.2, a[2] - 0.34], rx: 0.004, ry: 0.006 },
    ], { nu: 6, sub: 2, color: 0x24281c, region: CR.CHITIN, mottle: 0.2, blood: false, cap0: 0.01 }));
  }
  // what is left of a gown: a bodice in tatters, its skirts hanging from the hips in strips
  sheet(mb, T, 0, TAU, yH + 0.02, yC + 0.2, 22, 12, 0.014, { color: gown, region: CR.CLOTH, mottle: 0.2, tint: bloodied(7, 0.4), tear: { amt: 0.36, f: 5.5, seed: 44, fn: (x, y, z) => z > 0.1 || y > yC + 0.12 + 0.1 * fbm3(x * 8, 0, z * 8, 2, 2) } });
  const rnd = mulberry32(606);
  for (let i = 0; i < 12; i++) {
    const t = -2.2 + (i / 11) * 4.4;
    const a = surfPoint(T, t, yH + 0.03 + rnd() * 0.04, 0.02);
    rag(mb, 'hips', a, 0.7 + rnd() * 0.55, 0.16 + rnd() * 0.1, -t, { color: i % 3 ? gown : 0x2a2030, region: CR.CLOTH, seed: i + 11, sway: 0.1, nv: 5, taper: 0.3 });
  }
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const A = arms[s < 0 ? 0 : 1];
    bigHand(mb, 'hand' + n, s, { scale: 1.6, curl: 0.5, spread: 1.1, fingerMul: 1.45, claws: 0.1, skin: mulColor(skinC, 0.85), region: CR.ROT, tint: skinT, nail: 0x1a1c12 });
    bigFoot(mb, 'foot' + n, s, { w: 1.3, l: 1.6, h: 1.3, skin: mulColor(skinC, 0.85), region: CR.ROT, tint: skinT, claws: 0.05 });
    // the scythe: a blade of chitin out of the back of the forearm, running back past the elbow
    const e = surfPoint(A, PI, yE - 0.3, -0.02);
    bound(mb, [mb.bi('farm' + n), 1, 0, 0], () => ringLoft(mb, 'root', [
      { c: [e[0], yE - 0.5, e[2] - 0.02], rx: 0.012, ry: 0.03 }, { c: [e[0], yE - 0.25, e[2] + 0.05], rx: 0.022, ry: 0.075 },
      { c: [e[0] + s * 0.01, yE + 0.05, e[2] + 0.12], rx: 0.02, ry: 0.07 }, { c: [e[0] + s * 0.02, yE + 0.32, e[2] + 0.2], rx: 0.012, ry: 0.04 }, { c: [e[0] + s * 0.03, yE + 0.52, e[2] + 0.3], rx: 0.003, ry: 0.006 },
    ], { nu: 6, sub: 2, up: [0, 0, 1], color: chit, region: CR.CHITIN, mottle: 0.25, blood: false, cap0: 0.01, tint: (p, nn, c) => p.z > e[2] + 0.1 && c.lerp(color(0x8a8a60), 0.35) }));
    // plates of it over the shoulders
    bound(mb, [mb.bi('chest'), 1, 0, 0], () => mb.ellip('root', [s * 0.38, ySh + 0.07, 0.03], [0.2, 0.09, 0.19], { ws: 9, hs: 6, color: chit, region: CR.CHITIN, rot: [0, 0, -s * 0.45], noise: 0.012, nf: 9 }));
  }
  // the cells of the roost, down her back between the legs' roots: dark holes in a crust of wax
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 4 - (j % 2); i++) {
      const t = PI + (i - (3 - (j % 2)) / 2) * 0.3, y = yC - 0.14 + j * 0.105;
      blister(mb, T, t, y, 0.05, 0.5, { color: 0x100c08, glow: 0, region: CR.FLESH, rim: 0x8e8454, ws: 6, hs: 4 });
    }
  }
  // the sac (own bone, child of the hips): hung behind her, tilted up, swollen in the middle
  mb.addBone('abdomen', 'hips', 0, P.hipY + 0.08, 0.22);
  const ern = mulberry32(77);
  const sacRings = (grow) => [
    { c: [0, 1.5, 0.16], rx: 0.14, ry: 0.14 }, { c: [0, 1.55, 0.4], rx: 0.3, ru: 0.26, rd: 0.3 }, { c: [0, 1.63, 0.74], rx: 0.5, ru: 0.4, rd: 0.5 },
    { c: [0, 1.7, 1.1], rx: 0.58, ru: 0.44, rd: 0.56 }, { c: [0, 1.75, 1.45], rx: 0.5, ru: 0.38, rd: 0.48 }, { c: [0, 1.81, 1.74], rx: 0.31, ru: 0.24, rd: 0.29 }, { c: [0, 1.87, 1.92], rx: 0.1, ry: 0.1 },
  ].map((r) => ({ c: r.c, rx: r.rx + grow, ru: (r.ru ?? r.ry) + grow, rd: (r.rd ?? r.ry) + grow }));
  const band = (s) => Math.pow(Math.abs(Math.sin(s * PI * 5.5)), 6);
  ringLoft(mb, 'abdomen', sacRings(0), {
    nu: 18, sub: 4, color: 0x8cf050, region: CR.GLOW, glow: 0.5, mottle: 0.25, blood: false, cap0: 0.02, cap1: 0.05,
    dr: (s) => -0.035 * band(s),
    paint: (s, a, c, p) => {
      c.lerp(color(0x1c2216), band(s) * 0.85); // the grooves between its segments
      // what is in it, seen through the skin: dark shapes hanging in the light
      const m = fbm3(p.x * 5, p.y * 5, p.z * 5, 2, 9);
      if (m > 0.54) c.lerp(color(0x162a0c), clamp((m - 0.54) * 7, 0, 0.9));
      if (Math.abs(fbm3(p.x * 3, p.y * 7, p.z * 3, 2, 21) - 0.5) < 0.02) c.lerp(color(0x1e3a10), 0.8); // veins
    },
  });
  // plates of chitin over its back, one a segment, a gap between each
  ringLoft(mb, 'abdomen', sacRings(0.025), {
    nu: 18, sub: 4, color: 0x2a3020, region: CR.CHITIN, mottle: 0.3, blood: false, cap0: 0.02,
    tear: { amt: 0, fn: (x, y, z) => y < 1.5 + (z - 0.16) * 0.21 + 0.1 + 0.05 * Math.sin(z * 9) || band((z - 0.16) / 1.76) > 0.45 },
    tint: (p, nn, c) => c.lerp(color(0x5a6040), clamp((fbm3(p.x * 9, p.y * 9, p.z * 9, 2, 3) - 0.5) * 3, 0, 0.5)),
  });
  bound(mb, [mb.bi('abdomen'), 1, 0, 0], () => {
    // the mouths of the roost along its back
    for (let i = 0; i < 9; i++) {
      const z = 0.5 + ern() * 1.15, x = (ern() - 0.5) * 0.5;
      const y = 1.55 + (z - 0.4) * 0.2 + 0.4 * Math.sin(clamp((z - 0.2) / 1.7, 0, 1) * PI) * Math.sqrt(Math.max(0.1, 1 - (x / 0.5) ** 2)) + 0.02;
      mb.ellip('root', [x, y, z], [0.07, 0.03, 0.075], { ws: 7, hs: 4, color: 0x0c0a06, region: CR.FLESH, blood: false, mottle: 0.1, rot: [0.2, 0, -x * 1.2], tint: (p, nn, c) => nn.y < 0.6 && c.lerp(color(0x8e8454), 0.8) });
    }
    // eggs through the skin of its underside
    for (let i = 0; i < 7; i++) {
      const z = 0.55 + ern() * 1.1, a = (ern() - 0.5) * 1.9;
      const k = Math.sin(clamp((z - 0.16) / 1.76, 0, 1) * PI);
      mb.ellip('root', [Math.sin(a) * 0.56 * k, 1.56 + (z - 0.4) * 0.2 - Math.cos(a) * 0.52 * k, z], [0.085, 0.085, 0.1], { ws: 7, hs: 5, color: 0xc8ff90, glow: 0.85, region: CR.GLOW, ao: false, blood: false });
    }
    mb.ellip('root', [0, 1.5, 0.3], [0.22, 0.22, 0.26], { ws: 8, hs: 6, color: chit, region: CR.CHITIN });
  });
  // four legs out of her back: sleg{i} (upper) -> slegb{i} (lower)
  const legsS = [[-1, 0.0], [1, 0.0], [-1, 0.25], [1, 0.25]];
  for (let i = 0; i < 4; i++) {
    const [s, zo] = legsS[i];
    const by = P.chestY - 0.05 - zo * 0.8, bz = 0.2 + zo;
    mb.addBone('sleg' + i, 'chest', s * 0.2, by, bz);
    const kx = s * 0.95, ky = by + 0.75, kz = bz + 0.35 + zo;
    mb.addBone('slegb' + i, 'sleg' + i, kx, ky, kz);
    const a = [s * 0.2, by, bz], k = [kx, ky, kz], f = [kx + s * 0.55, 0.02, kz + 0.25 + zo * 1.5];
    const mid = (p, q, u, lift = 0) => [lerp(p[0], q[0], u), lerp(p[1], q[1], u) + lift, lerp(p[2], q[2], u)];
    const co = { color: chit, region: CR.CHITIN, mottle: 0.25, blood: false };
    ringLoft(mb, 'sleg' + i, [{ c: mid(a, k, -0.12), rx: 0.1 }, { c: a, rx: 0.085 }, { c: mid(a, k, 0.3, 0.03), rx: 0.06 }, { c: mid(a, k, 0.75, 0.02), rx: 0.05 }, { c: k, rx: 0.075 }], { nu: 7, sub: 2, ...co, cap1: 0.03 });
    ringLoft(mb, 'slegb' + i, [{ c: k, rx: 0.08 }, { c: mid(k, f, 0.12), rx: 0.055 }, { c: mid(k, f, 0.5, 0), rx: 0.05, ry: 0.036 }, { c: mid(k, f, 0.85), rx: 0.03, ry: 0.022 }, { c: f, rx: 0.006 }], { nu: 7, sub: 2, ...co, color: 0x2a3020, cap0: 0.03, tint: (p, nn, c) => p.y < 0.5 && c.lerp(color(0x8a8a60), 0.3 * (1 - p.y / 0.5)) });
    // spurs down the shin
    for (let j = 0; j < 3; j++) {
      const p = mid(k, f, 0.25 + j * 0.2);
      shard(mb, [mb.bi('slegb' + i), 1, 0, 0], p, [p[0] + s * 0.1, p[1] + 0.12, p[2] + 0.06], 0.022, { color: 0x4a5038 });
    }
  }
  return { mb, P };
}

// ------------------------------------------------------------------ bat

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.25, runLean: -0.4, cycleWalk: 2.6, cycleRun: 3.6, walkStride: 0.4, walkKnee: 0.7, runStride: 0.55, runKnee: 0.9,
  limp: 0, sway: 0.5, armWalk: 0.7, armDroop: 0.7, armSwing: 0.12, armRun: 0.9, elbow: 1.9, headPitch: 0.25, headTilt: 0.1, jaw: 0.3, legSplay: 0.08,
  idleLean: -0.25, mantis: true,
};

/** Its special (ZANIM.SPECIAL): spit barrage: rapid head recoils */
function poseBarrage(z, p) {
  const t = z.stateT;
  clearPose(p, z.nb);
  legsStatic(z, p, 0.2, -0.3, -0.05, -0.2, 0.1);
  const u = (t % 0.32) / 0.32;
  const rec = u < 0.15 ? smooth(u / 0.15) : 1 - smooth((u - 0.15) / 0.85);
  R(p, SPINE, -0.2 + rec * 0.08, 0, 0);
  R(p, CHEST, -0.15 + rec * 0.1, 0, 0);
  headLook(p, 0.25 + rec * 0.45, Math.sin(t * 3) * 0.3, 0, 0.4);
  R(p, JAW, -0.2 - 0.5 * rec, 0, 0);
  arm(p, 0, 0.9, 0.5, 0.3, 2.0, 0.4);
  arm(p, 1, 0.9, 0.5, 0.3, 2.0, 0.4);
  z.abdPulse = 0.08 * rec;
}

function queenSlash(z, p, u) {
  const k = Math.sin(u * TAU);
  R(p, SPINE, -0.2, 0.2 * k, 0);
  R(p, CHEST, -0.2, 0.2 * k, 0);
  arm(p, 0, 1.2 + 0.8 * k, 0.4, 0.3, 0.6 + 1.0 * Math.max(0, -k), 0.4);
  arm(p, 1, 1.2 - 0.8 * k, 0.4, 0.3, 0.6 + 1.0 * Math.max(0, k), 0.4);
  headLook(p, 0.15, 0, 0);
  R(p, JAW, -0.3, 0, 0);
}

export { buildHiveQueen as build, poseBarrage as special, queenSlash as attack };
