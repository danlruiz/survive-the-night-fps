// The boomer (ZTYPE.BOOMER): its model, how it moves, its windup and its swing (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3 } from '../skinning.js';
import { CR } from '../charTextures.js';
import { deadHead } from '../people.js';
import { oldLook, bloodied } from '../deadlooks.js';
import { hulk, field, bigHand, bigFoot, blister, bound, ragPants } from '../monsters.js';
import { sheet } from '../humans.js';
import { SPINE, CHEST, HEAD, JAW, humanP, addHumanoidBones } from '../characters/skeleton.js';
import { R, A, arm, headLook } from '../characters/posekit.js';
import { buildDetail, legStumps, swollen, marbled, pox, split } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.BOOMER;

/**
 * The boomer: a corpse blown up tight with gas and bile, about to go. A drum of a belly that has ridden its undershirt
 * up to the chest and burst its fly, the skin stretched thin and green over it and split where it could not stretch,
 * the neck and face swollen shut round small eyes.
 */
function buildBoomer() {
  const P = humanP({ hipY: 0.88, hipW: 0.13, thighLen: 0.4, shinLen: 0.4, spineLen: 0.14, chestLen: 0.22, neckOff: 0.2, neckLen: 0.06, headR: 0.12, shoulderW: 0.27, uarmLen: 0.28, farmLen: 0.26, handLen: 0.17 });
  const d = buildDetail, far = d < 0.7;
  const g = (n) => Math.max(6, Math.round(n * (far ? 0.62 : 1)));
  const skinC = 0xaeaa6a;
  const mb = new MeshBuilder();
  addHumanoidBones(mb, P);
  mb.addBone('belly', 'spine', 0, P.spineY + 0.02, -0.08); // (it swells and pulses: poseExtras)
  mb.dirt = { y0: 0.4, k: 0.5 };
  mb.blood([0, 1.5, -0.14], 0.1, 0.7);
  const yH = P.hipY, yS = P.spineY, yC = P.chestY, ySh = P.shoulderY, yE = P.elbowY, yW = P.wristY;
  const tf = field([
    { t: 0, y: yH - 0.04, st: 1.0, sy: 0.03, k: -0.03 }, // the fold under the belly
    { t: 0, y: yS + 0.0, st: 0.1, sy: 0.035, k: 0.03 }, // a navel pushed out
    { t: 0.6, y: yC + 0.05, st: 0.4, sy: 0.06, k: 0.02, sym: true },
    { t: 0.6, y: yC - 0.02, st: 0.5, sy: 0.02, k: -0.016, sym: true },
    { t: PI, ridge: 't', st: 0.08, k: -0.014, y0: yH, y1: ySh, fade: 0.06 },
    { t: PI, y: yS + 0.06, st: 1.0, sy: 0.02, k: -0.016 },
    { t: PI - 0.45, y: yH - 0.04, st: 0.42, sy: 0.07, k: 0.022, sym: true },
  ]);
  const vein = marbled(8);
  const B = hulk(mb, P, {
    skin: { color: skinC, region: CR.SKIN, mottle: 0.16, tint: swollen(21) }, shade: 12,
    torso: [
      [0.74, 0.08, 0.08, 0.1, 2],
      [0.8, 0.24, 0.2, 0.2, 2.3, 0, -0.03],
      [0.88, 0.35, 0.35, 0.25, 2.3, 0, -0.06],
      [1.0, 0.4, 0.44, 0.26, 2.3, 0, -0.08],
      [1.1, 0.4, 0.44, 0.26, 2.3, 0, -0.08],
      [1.2, 0.36, 0.37, 0.26, 2.3, 0, -0.05],
      [1.3, 0.325, 0.27, 0.25, 2.4, 0, -0.02],
      [1.39, 0.31, 0.2, 0.23, 2.5],
      [1.44, 0.2, 0.15, 0.19, 2.3],
      [1.475, 0.08, 0.07, 0.09, 2],
    ],
    tf, nu: g(24), nvT: g(18), paintT: far ? null : vein,
    belly: { bone: 'belly', y: yS + 0.02, sy: 0.2, k: 0.85 },
    neck: [0.092, 0.085], neckDown: 0.07,
    arm: (s) => [
      [yW - 0.01, 0.04, 0.036, 0.038],
      [yW + 0.06, 0.05, 0.046, 0.046],
      [yE - 0.09, 0.074, 0.066, 0.07],
      [yE + 0.0, 0.07, 0.07, 0.076],
      [yE + 0.13, 0.086, 0.088, 0.088],
      [ySh - 0.05, 0.096, 0.096, 0.098],
      [ySh + 0.03, 0.09, 0.09, 0.092],
      [ySh + 0.08, 0.05, 0.05, 0.052, 2, -s * 0.02],
      [ySh + 0.095, 0.015, 0.015, 0.015, 2, -s * 0.04],
    ],
    nuA: g(12), nvA: g(11),
    leg: () => [
      [P.ankleY - 0.01, 0.05, 0.05, 0.055],
      [P.ankleY + 0.06, 0.055, 0.054, 0.062],
      [P.kneeY - 0.2, 0.078, 0.07, 0.09],
      [P.kneeY - 0.07, 0.088, 0.08, 0.1],
      [P.kneeY + 0.03, 0.092, 0.096, 0.092],
      [P.thighY - 0.2, 0.118, 0.118, 0.112],
      [P.thighY - 0.05, 0.132, 0.132, 0.134],
      [P.thighY + 0.07, 0.125, 0.125, 0.13],
    ],
    nuL: g(12), nvL: g(9),
  });
  const { T, legs } = B;
  const L = oldLook({
    face: { w: 1.22, cheek: 1.8, jaw: 1.4, chin: 0.8, nose: 1.1, gaunt: 0, sockets: 1.5, rot: 0.2, lips: 1.3 },
    skin: skinC, gaunt: 0, eye: 0xe0dc80, eyeGlow: 0.3, jawScale: 1.1, missingTeeth: 0x48,
    headTint: (lx, ly, lz, c) => swollen(21)({ x: lx * 3, y: ly * 3, z: lz * 3 }, { y: 0 }, c),
  });
  L.blood = null;
  deadHead(mb, P, L, d);
  // trousers that no longer close, their waistband under the belly
  const pcol = 0x3b3a30;
  ragPants(mb, B, yH - 0.02, (s) => P.ankleY + (s > 0 ? 0.12 : 0.05), { color: pcol, region: CR.TWILL, push: 0.009, tear: far ? 0 : 0.1, fray: 0.06, nu: g(20), nvT: 3, nuL: g(12), nvL: g(8), tint: bloodied(9, 0.5) });
  // the undershirt it has swollen out of: ridden up over the belly, split down the front
  const shirtTear = { amt: far ? 0 : 0.2, f: 11, seed: 171, fn: (x, y, z) => (y < yC - 0.03 + 0.05 * fbm3(x * 14, 0, z * 14, 2, 3)) || (z < 0 && Math.abs(x) < 0.02 + (ySh - y) * 0.16 && y < ySh - 0.02) };
  sheet(mb, T, 0, TAU, yC - 0.06, ySh + 0.045, g(22), g(7), 0.008, { color: 0x9a9680, region: CR.COTTON, mottle: 0.16, tint: bloodied(7, 0.6), tear: shirtTear });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    if (far) {
      bound(mb, [mb.bi('hand' + n), 1, 0, 0], () => mb.box('hand' + n, [0, -0.08, 0], [0.04, 0.16, 0.085], { round: 0.5, seg: 1, color: skinC, region: CR.SKIN }));
      bound(mb, [mb.bi('foot' + n), 1, 0, 0], () => mb.box('foot' + n, [0, -P.ankleY + 0.035, -0.05], [0.11, 0.07, 0.26], { round: 0.5, seg: 1, color: skinC, region: CR.SKIN }));
    } else {
      bigHand(mb, 'hand' + n, s, { scale: 1.2, curl: 0.45, thick: 1.5, skin: skinC, region: CR.SKIN, tint: swollen(21) });
      bigFoot(mb, 'foot' + n, s, { w: 1.4, l: 1.1, h: 1.3, skin: skinC, region: CR.SKIN, tint: swollen(21) });
    }
  }
  if (!far) {
    // where the skin has given: splits down the drum of the belly, what is under them lit a sick green
    split(mb, T, 0.16, yS - 0.12, yS + 0.14, 0.022, { wander: 0.03 });
    split(mb, T, -0.5, yS - 0.02, yS + 0.16, 0.017, { wander: 0.04 });
    split(mb, T, 0.75, yH + 0.0, yS + 0.06, 0.015, { wander: 0.03 });
    const rnd = mulberry32(99);
    pox(mb, T, rnd, 9, -1.3, 1.3, yH - 0.06, yC - 0.02, 0.05, 0.018, { glow: 0.16 });
    pox(mb, T, rnd, 5, PI - 1.2, PI + 1.2, yS, ySh - 0.03, 0.04, 0.016, { glow: 0.12 });
    // a goitre of bile under the jaw
    blister(mb, B.N, 0.25, P.neckY + 0.03, 0.05, 0.9, { color: 0xc8d060, glow: 0.22, rim: 0x7a4030 });
  }
  legStumps(mb, P, { thighR: 0.12, pants: { color: pcol } });
  void legs;
  mb.aoStrength = 0.33;
  return { mb, P };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: 0.08, runLean: -0.02, cycleWalk: 1.0, cycleRun: 1.5, walkStride: 0.3, walkKnee: 0.45, runStride: 0.38, runKnee: 0.6,
  limp: 0, sway: 2.2, waddle: 1, armWalk: 0.15, armDroop: 0.1, armSwing: 0.2, armRun: 0.4, armOut: 0.35, elbow: 0.25, headPitch: 0.0, headTilt: 0.1, jaw: 0.25,
  legSplay: 0.1, idleLean: 0.05,
};

/**
 * Its windup (ZANIM.SPECIAL), over its idle pose (specialFromIdle): the belly swells, the head goes back, the jaw
 * drops.
 */
export const specialFromIdle = true;
function poseSwell(z, p) {
  z.bellyPulse = 0.12;
  A(p, SPINE, 0.12, 0, 0);
  A(p, HEAD, 0.25, 0, 0);
  R(p, JAW, -0.6, 0, 0);
  arm(p, 0, 0.4, 0.7, 0, 0.3);
  arm(p, 1, 0.4, 0.7, 0, 0.3);
}

/** Its swing (ZANIM.ATTACK): a belly bump, lurching. */
function bellyBump(z, p, u) {
  const k = Math.sin(u * TAU);
  R(p, SPINE, 0.1 + 0.2 * k, 0, 0);
  R(p, CHEST, -0.1 - 0.25 * Math.max(0, -k), 0, 0);
  arm(p, 0, 0.9 + 0.3 * k, 0.4, 0, 0.5);
  arm(p, 1, 0.9 - 0.3 * k, 0.4, 0, 0.5);
  headLook(p, 0.1, 0, 0);
  R(p, JAW, -0.4 - 0.3 * Math.max(0, k), 0, 0);
}

export { buildBoomer as build, poseSwell as special, bellyBump as attack };
