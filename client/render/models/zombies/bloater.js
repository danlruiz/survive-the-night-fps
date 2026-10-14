// The Bloater (ZTYPE.BOSS_BLOATER), a boss: its model, how it moves, its special, its swing and the throb of its glow
// (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3, smooth, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { oldLook, bloodied } from '../deadlooks.js';
import { hulk, field, bigHand, bigFoot, blister, bound } from '../monsters.js';
import { sheet } from '../humans.js';
import { SPINE, CHEST, NECK, HEAD, JAW, humanP, addHumanoidBones } from '../characters/skeleton.js';
import { clearPose, R, arm, headLook, legsStatic } from '../characters/posekit.js';
import { legStumps, swollen, marbled, pox, split, bossHead } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.BOSS_BLOATER;
// the pustules throb
export const glow = (time, off) => 0.75 + 0.35 * Math.sin(time * 1.9 + off);

/**
 * The Bloater: a boomer three times over. The gut is most of it - an apron of swollen flesh hanging past the knees,
 * marbled with dark veins, split in a dozen places and studded with sacs of bile that glow through the skin - with a
 * small head drowned in the fat of its neck and arms that cannot reach round it. What it wore is still on its shoulders.
 */
function buildBloater() {
  const P = humanP({ hipY: 0.86, hipW: 0.15, thighLen: 0.4, shinLen: 0.4, spineLen: 0.16, chestLen: 0.22, neckOff: 0.2, neckLen: 0.05, headR: 0.115, shoulderW: 0.33, uarmLen: 0.3, farmLen: 0.28, handLen: 0.17, headZ: -0.04 });
  const skinC = 0xa4a664;
  const mb = new MeshBuilder();
  addHumanoidBones(mb, P);
  mb.addBone('belly', 'spine', 0, P.spineY - 0.02, -0.1); // the gut, on its own bone so it heaves (poseExtras)
  mb.dirt = { y0: 0.3, k: 0.5 };
  mb.blood([0, 1.5, -0.2], 0.1, 0.6);
  const yH = P.hipY, yS = P.spineY, yC = P.chestY, ySh = P.shoulderY, yE = P.elbowY, yW = P.wristY;
  const tf = field([
    { t: 0, y: 0.66, st: 1.2, sy: 0.03, k: -0.06 }, // the fold where the gut's apron hangs from
    { t: 0, y: yS - 0.02, st: 0.1, sy: 0.04, k: 0.04 }, // the navel, turned inside out
    { t: 0.7, y: yC + 0.07, st: 0.5, sy: 0.07, k: 0.035, sym: true }, // a chest lying on the gut
    { t: 0.7, y: yC - 0.02, st: 0.6, sy: 0.025, k: -0.03, sym: true },
    { t: 1.5, y: yS + 0.0, st: 0.4, sy: 0.12, k: 0.05, sym: true }, // flanks
    { t: 1.1, y: yH - 0.02, st: 0.5, sy: 0.2, k: 0.04 }, // a second, lopsided swelling on one side
    { t: PI, ridge: 't', st: 0.08, k: -0.025, y0: 0.7, y1: ySh, fade: 0.08 },
    { t: PI, y: yS + 0.04, st: 1.2, sy: 0.025, k: -0.03 }, // the rolls of its back
    { t: PI, y: yC + 0.0, st: 1.2, sy: 0.025, k: -0.028 },
    { t: PI - 0.5, y: 0.78, st: 0.45, sy: 0.1, k: 0.04, sym: true },
  ]);
  const vein = marbled(61, 0.03);
  const B = hulk(mb, P, {
    skin: { color: skinC, region: CR.SKIN, mottle: 0.18, tint: swollen(23, 5) }, shade: 9,
    torso: [
      [0.35, 0.14, 0.11, 0.1, 2, 0, -0.42],
      [0.43, 0.36, 0.26, 0.2, 2.2, 0, -0.42],
      [0.55, 0.5, 0.36, 0.3, 2.3, 0, -0.36],
      [0.7, 0.57, 0.46, 0.5, 2.3, 0, -0.26],
      [0.86, 0.6, 0.54, 0.52, 2.3, 0, -0.2],
      [1.02, 0.58, 0.56, 0.5, 2.3, 0, -0.18],
      [1.16, 0.53, 0.5, 0.44, 2.3, 0, -0.14],
      [1.28, 0.47, 0.4, 0.38, 2.4, 0, -0.08],
      [1.38, 0.43, 0.31, 0.34, 2.5, 0, -0.03],
      [1.44, 0.28, 0.22, 0.27, 2.3, 0, 0],
      [1.49, 0.12, 0.1, 0.13, 2, 0, 0.02],
    ],
    tf, nu: 30, nvT: 26, paintT: vein,
    belly: { bone: 'belly', y: 0.82, sy: 0.4, k: 0.85 },
    neck: [0.115, 0.105], neckDown: 0.07, neckBack: 0.0,
    arm: (s) => [
      [yW - 0.01, 0.06, 0.055, 0.058],
      [yW + 0.06, 0.075, 0.07, 0.07],
      [yE - 0.1, 0.105, 0.095, 0.1],
      [yE + 0.0, 0.1, 0.1, 0.106],
      [yE + 0.14, 0.126, 0.126, 0.126],
      [ySh - 0.06, 0.142, 0.14, 0.142],
      [ySh + 0.03, 0.13, 0.13, 0.132],
      [ySh + 0.09, 0.07, 0.07, 0.072, 2, -s * 0.03],
      [ySh + 0.11, 0.02, 0.02, 0.02, 2, -s * 0.05],
    ],
    nuA: 14, nvA: 12,
    leg: () => [
      [P.ankleY - 0.005, 0.07, 0.07, 0.075],
      [P.ankleY + 0.06, 0.075, 0.075, 0.085],
      [P.kneeY - 0.2, 0.105, 0.095, 0.12],
      [P.kneeY - 0.07, 0.12, 0.11, 0.135],
      [P.kneeY + 0.03, 0.125, 0.13, 0.125],
      [P.thighY - 0.2, 0.16, 0.16, 0.15],
      [P.thighY - 0.05, 0.18, 0.18, 0.18],
      [P.thighY + 0.08, 0.17, 0.17, 0.18],
    ],
    nvL: 10,
  });
  const { T, legs } = B;
  const L = oldLook({
    face: { w: 1.28, cheek: 1.8, jaw: 1.45, chin: 0.85, nose: 1.2, gaunt: 0, sockets: 1.6, rot: 0.2, lips: 1.3 },
    skin: skinC, gaunt: 0, eye: 0xe8e070, eyeGlow: 0.5, jawScale: 1.15, missingTeeth: 0x52,
    headTint: (lx, ly, lz, c) => swollen(23, 5)({ x: lx * 3, y: ly * 3, z: lz * 3 }, { y: 0 }, c),
  });
  L.blood = null;
  bossHead(mb, P, L, 1.25);
  // what it wore: the legs of its trousers, their seat split, and a shirt's yoke still across the shoulders
  for (const Lg of legs) {
    const yb = P.ankleY + (Lg.side > 0 ? 0.16 : 0.1);
    sheet(mb, Lg, 0, TAU, yb, Lg.yHi - 0.04, 14, 7, 0.012, { color: 0x34322a, region: CR.TWILL, mottle: 0.14, tint: bloodied(9, 0.5), tear: { amt: 0.12, f: 9, seed: 81 + Lg.side, fn: (x, y, z) => y < yb + 0.06 * fbm3(x * 14, y * 3, z * 14, 2, 11) } });
  }
  sheet(mb, T, PI - 1.5, PI + 1.5, 0.6, 0.92, 12, 5, 0.012, { color: 0x34322a, region: CR.TWILL, mottle: 0.14, tear: { amt: 0.2, f: 8, seed: 5, fn: (x, y) => Math.abs(x) < 0.03 + (0.92 - y) * 0.1 } });
  sheet(mb, T, 0, TAU, yC + 0.06, ySh + 0.05, 24, 5, 0.012, { color: 0x7e7a66, region: CR.COTTON, mottle: 0.16, tint: bloodied(7, 0.6), tear: { amt: 0.3, f: 8, seed: 31, fn: (x, y, z) => z < 0.05 && Math.abs(x) < 0.16 + (ySh - y) * 0.6 } });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    bigHand(mb, 'hand' + n, s, { scale: 1.55, curl: 0.45, thick: 1.5, skin: skinC, region: CR.SKIN, tint: swollen(23, 5) });
    bigFoot(mb, 'foot' + n, s, { w: 1.9, l: 1.4, h: 1.6, skin: skinC, region: CR.SKIN, tint: swollen(23, 5) });
  }
  // sacs of bile standing out of the gut, the biggest low on its front; splits between them; boils everywhere else
  const rnd = mulberry32(4817);
  const sac = (t, y, r) => blister(mb, T, t, y, r, 0.75, { color: 0xc6dc58, glow: 0.3, rim: 0x7a2c20, ws: 9, hs: 6, noise: r * 0.08, nf: 20, tint: (p, n, c) => fbm3(p.x * 30, p.y * 30, p.z * 30, 2, 5) < 0.42 && c.lerp(color(0x3a5a18), 0.5) });
  sac(-0.35, 0.72, 0.15);
  sac(0.5, 0.9, 0.12);
  sac(0.1, 1.12, 0.09);
  sac(-0.9, 0.98, 0.1);
  sac(1.25, 0.72, 0.11);
  sac(0.25, 0.5, 0.09);
  sac(PI + 0.5, 1.12, 0.1);
  sac(PI - 0.7, 0.95, 0.09);
  split(mb, T, 0.12, 0.76, 1.04, 0.035, { wander: 0.03 });
  split(mb, T, -0.62, 0.86, 1.1, 0.026, { wander: 0.04 });
  split(mb, T, 0.9, 0.58, 0.8, 0.026, { wander: 0.03 });
  split(mb, T, -0.2, 0.42, 0.6, 0.02, { wander: 0.03 });
  pox(mb, T, rnd, 16, -1.5, 1.5, 0.45, 1.2, 0.05, 0.016, { glow: 0.2 });
  pox(mb, T, rnd, 9, PI - 1.4, PI + 1.4, 0.75, 1.36, 0.05, 0.02, { glow: 0.14 });
  for (const A of B.arms) pox(mb, A, rnd, 3, A.side * 0.6, A.side * 2.2, yE, ySh - 0.04, 0.03, 0.016, { glow: 0.12 });
  // a goitre of it under the jaw, and what runs off the chin
  blister(mb, B.N, -0.2, P.neckY + 0.02, 0.075, 0.9, { color: 0xc8d860, glow: 0.3, rim: 0x7a4030, ws: 8, hs: 6 });
  const jb = mb.bonePos('jaw');
  bound(mb, [mb.bi('jaw'), 1, 0, 0], () => mb.tube('root', [[0, jb[1] - P.headR * 0.55, jb[2] - P.headR * 1.0], [0.01, jb[1] - P.headR * 1.3, jb[2] - P.headR * 1.12], [0.0, jb[1] - P.headR * 2.2, jb[2] - P.headR * 1.05]], 0.016, 0.006, { rs: 5, ts: 5, color: 0xa8c040, region: CR.GLOW, glow: 0.35, blood: false }));
  legStumps(mb, P, { thighR: 0.17, pants: { color: 0x34322a } });
  mb.aoStrength = 0.35;
  return { mb, P };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  // the boomer's waddle, slower and wider, leaning back to carry the gut
  walkLean: 0.1, runLean: 0.0, cycleWalk: 1.75, cycleRun: 2.4, walkStride: 0.28, walkKnee: 0.4, runStride: 0.34, runKnee: 0.55,
  limp: 0, sway: 2.6, waddle: 1, armWalk: 0.18, armDroop: 0.12, armSwing: 0.18, armRun: 0.35, armOut: 0.55, elbow: 0.3, headPitch: 0.05, headTilt: 0.12, jaw: 0.35,
  legSplay: 0.16, idleLean: 0.08, neckFwd: 0.05,
};

/**
 * Its special (ZANIM.SPECIAL): heaving bile: rears back with the gut swelling (0..0.45), then pitches forward and
 * retches it out, loops ~0.8 s
 */
function poseRetch(z, p) {
  const t = z.stateT;
  const u = (t % 0.8) / 0.8;
  clearPose(p, z.nb);
  legsStatic(z, p, 0.3, -0.3, -0.12, -0.12, 0.16);
  z.standOn = true;
  const back = u < 0.45 ? smooth(u / 0.45) : 1 - smooth((u - 0.45) / 0.12);
  const fwd = u < 0.45 ? 0 : u < 0.6 ? smooth((u - 0.45) / 0.15) : 1 - smooth((u - 0.6) / 0.4) * 0.7;
  const q = Math.sin(t * 34) * 0.025 * fwd;
  R(p, SPINE, 0.05 + back * 0.28 - fwd * 0.32 + q, 0, 0);
  R(p, CHEST, back * 0.2 - fwd * 0.28, 0, 0);
  R(p, NECK, back * 0.3 - fwd * 0.45, 0, 0);
  R(p, HEAD, back * 0.25 - fwd * 0.15 + q, 0, 0);
  R(p, JAW, -0.2 - back * 0.25 - fwd * 0.85, 0, 0);
  arm(p, 0, 0.35 + back * 0.3 + fwd * 0.5, 0.45 + back * 0.5, 0, 0.5 - fwd * 0.2, 0.3);
  arm(p, 1, 0.35 + back * 0.3 + fwd * 0.5, 0.45 + back * 0.5, 0, 0.5 - fwd * 0.2, 0.3);
  z.bellyPulse = 0.14 * back + 0.2 * fwd;
}

function bloaterSlap(z, p, u) {
  // one stubby arm swung out wide and back (0..0.45), slapped across the front (0.45..0.6), dragged back round
  const w = u < 0.45 ? smooth(u / 0.45) : u < 0.6 ? 1 - smooth((u - 0.45) / 0.15) * 2 : -1 + smooth((u - 0.6) / 0.4);
  const side = z.armSide, sg = side ? 1 : -1;
  R(p, SPINE, 0.06, -sg * w * 0.28, 0);
  R(p, CHEST, -0.02, -sg * w * 0.3, 0);
  arm(p, side, 1.25 + 0.15 * Math.abs(w), 0.15 + 1.05 * w, 0.2, 0.25 + 0.35 * Math.max(0, w), 0.25);
  arm(p, 1 - side, 0.45, 0.55, 0, 0.45, 0.2);
  headLook(p, 0.08, sg * w * 0.25, 0, 0.3);
  R(p, JAW, -0.3 - 0.35 * Math.abs(w), 0, 0);
  z.bellyPulse = 0.05;
}

export { buildBloater as build, poseRetch as special, bloaterSlap as attack };
