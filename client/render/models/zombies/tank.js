// The Tank (ZTYPE.TANK): its model, how it moves, its windup and its swing (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, smooth, mulColor } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { hulk, field, bigHand, bigFoot, tornOpen, shard, surfTube, ragPants } from '../monsters.js';
import { surfPoint } from '../humans.js';
import { SPINE, CHEST, JAW, humanP, addHumanoidBones } from '../characters/skeleton.js';
import { clearPose, R, arm, headLook, legsStatic } from '../characters/posekit.js';
import { bossHead, hide, flayed } from './helpers.js';

const PI = Math.PI;

export const type = ZTYPE.TANK;

/**
 * The Tank: a man grown past what his skin could hold. A gorilla's build that walks on its knuckles - a hump of
 * trapezius behind a small sunken head, arms as thick as its body - the hide split along every muscle and gone
 * altogether in patches, bone grown out through the shoulders, the spine and the forearms it rams with.
 */
function buildTank() {
  const P = humanP({
    hipY: 1.0, hipW: 0.22, thighLen: 0.46, shinLen: 0.45, spineLen: 0.3, chestLen: 0.45, neckOff: 0.5, neckLen: 0.08,
    headR: 0.15, shoulderW: 0.62, shoulderDrop: 0.06, uarmLen: 0.8, farmLen: 0.78, handLen: 0.3, headZ: -0.3, neckZ: -0.18, depth: 0.42,
  });
  const skinC = 0x938279, raw = 0x7c1c16;
  const mb = new MeshBuilder();
  addHumanoidBones(mb, P);
  mb.dirt = { y0: 0.6, k: 0.6 };
  mb.blood([0, 2.34, -0.5], 0.11, 0.8);
  mb.blood([0.62, 0.42, -0.05], 0.3, 0.9);
  mb.blood([-0.62, 0.42, -0.05], 0.3, 0.9);
  mb.blood([0.3, 1.62, -0.3], 0.2, 0.6);
  const yH = P.hipY, yS = P.spineY, yC = P.chestY, ySh = P.shoulderY, yE = P.elbowY, yW = P.wristY;
  const tf = field([
    { t: 0.52, y: yC + 0.2, st: 0.4, sy: 0.14, k: 0.055, sym: true }, // pectorals
    { t: 0, y: yC + 0.22, st: 0.08, sy: 0.2, k: -0.035 }, // the sternum between them
    { t: 0.5, y: yC + 0.03, st: 0.5, sy: 0.035, k: -0.022, sym: true }, // under them
    { t: 0, ridge: 't', st: 0.055, k: -0.016, y0: yH + 0.12, y1: yC + 0.02, fade: 0.08 },
    ...[0, 1, 2].map((i) => ({ t: 0.22, y: yS - 0.06 + i * 0.165, st: 0.17, sy: 0.062, k: 0.026, sym: true })), // the belly's slabs
    { t: 1.12, y: yC - 0.02, st: 0.28, sy: 0.12, k: 0.035, sym: true }, // serratus
    { t: 1.35, y: yS + 0.05, st: 0.34, sy: 0.13, k: 0.03, sym: true }, // obliques
    { t: PI, ridge: 't', st: 0.06, k: -0.04, y0: yH - 0.05, y1: ySh + 0.25, fade: 0.1 }, // the spine's furrow
    { t: PI - 0.8, y: yC + 0.14, st: 0.42, sy: 0.24, k: 0.07, sym: true }, // lats
    { t: PI - 0.42, y: ySh + 0.08, st: 0.34, sy: 0.16, k: 0.07, sym: true }, // the hump of trapezius
    { t: PI - 0.3, y: yS + 0.1, st: 0.2, sy: 0.25, k: 0.03, sym: true }, // the columns either side of the spine
    { t: PI - 0.48, y: yH - 0.04, st: 0.4, sy: 0.09, k: 0.04, sym: true }, // buttocks
  ], 1.7);
  const armF = (side) => field([
    { t: 0, y: yE + 0.34, st: 0.7, sy: 0.17, k: 0.04 }, // biceps
    { t: PI, y: yE + 0.4, st: 0.8, sy: 0.2, k: 0.035 }, // triceps
    { t: side * 1.57, ridge: 't', st: 0.1, k: -0.02, y0: yE + 0.1, y1: ySh - 0.2, fade: 0.1 }, // the groove between them
    { t: side * 1.2, y: ySh - 0.3, st: 0.5, sy: 0.04, k: -0.02 }, // under the deltoid
    { t: side * 0.9, y: yE - 0.2, st: 0.6, sy: 0.18, k: 0.03 }, // the forearm's mass, outside
    { t: -side * 1.0, ridge: 't', st: 0.1, k: -0.014, y0: yW + 0.1, y1: yE - 0.08, fade: 0.1 },
  ], 1.6);
  const legF = () => field([
    { t: 0, y: P.thighY - 0.2, st: 0.7, sy: 0.16, k: 0.03 }, // quadriceps
    { t: 0, y: P.kneeY + 0.01, st: 0.45, sy: 0.05, k: 0.025 }, // kneecap
    { t: PI, y: P.kneeY - 0.14, st: 0.7, sy: 0.1, k: 0.035 }, // calf
  ], 1.5);
  // (the trunk is made before the wound in its flank is: its hole and its rim are cut and painted through `rip`)
  let rip = null;
  const tornAt = [-1.85, -0.75, yC - 0.3, yC + 0.2];
  const B = hulk(mb, P, {
    skin: { color: skinC, region: CR.ROT, mottle: 0.16, tint: hide(31) }, raw, rawAt: -0.03, shade: 7,
    torso: [
      [0.83, 0.1, 0.1, 0.12, 2],
      [0.9, 0.3, 0.2, 0.25, 2.4],
      [1.0, 0.38, 0.25, 0.29, 2.5],
      [1.16, 0.36, 0.26, 0.26, 2.4],
      [1.32, 0.37, 0.28, 0.26, 2.3],
      [1.54, 0.45, 0.31, 0.3, 2.4],
      [1.76, 0.57, 0.36, 0.37, 2.5],
      [1.97, 0.66, 0.38, 0.45, 2.6, 0, 0.02],
      [2.13, 0.68, 0.36, 0.5, 2.6, 0, 0.03],
      [2.27, 0.57, 0.37, 0.52, 2.4, 0, 0.03],
      [2.4, 0.43, 0.34, 0.47, 2.2, 0, 0.05],
      [2.52, 0.25, 0.2, 0.3, 2, 0, 0.1],
    ],
    tf, nu: 30, nvT: 26,
    paintT: (t, y, c) => {
      flayed(3)(t, y, c);
      rip.paint(t, y, c);
    },
    holeT: (x, y, z) => rip.fn(x, y, z),
    prep: (T) => (rip = tornOpen(mb, T, ...tornAt, { ribs: 6, r: 0.024, depth: 0.06, nu: 10, nv: 12, seed: 7, rag: 0.3 })),
    neck: [0.17, 0.15], neckDown: 0.08, neckBack: 0.05,
    arm: (s) => [
      [yW - 0.03, 0.13, 0.115, 0.12],
      [yW + 0.1, 0.16, 0.14, 0.145],
      [yE - 0.44, 0.235, 0.205, 0.21],
      [yE - 0.22, 0.28, 0.25, 0.255],
      [yE - 0.06, 0.225, 0.2, 0.225],
      [yE + 0.05, 0.19, 0.19, 0.215],
      [yE + 0.3, 0.235, 0.255, 0.235],
      [yE + 0.52, 0.225, 0.235, 0.23],
      [ySh - 0.1, 0.265, 0.27, 0.275, 2, s * 0.02],
      [ySh + 0.05, 0.255, 0.25, 0.265, 2, s * 0.012],
      [ySh + 0.16, 0.18, 0.17, 0.19, 2, -s * 0.04],
      [ySh + 0.215, 0.07, 0.07, 0.08, 2, -s * 0.09],
    ],
    af: armF, paintA: (s) => flayed(s > 0 ? 11 : 17, 2.2), nuA: 16, nvA: 20,
    leg: () => [
      [P.ankleY - 0.01, 0.1, 0.1, 0.11],
      [P.ankleY + 0.06, 0.1, 0.1, 0.115],
      [P.kneeY - 0.26, 0.135, 0.12, 0.155],
      [P.kneeY - 0.11, 0.165, 0.14, 0.195],
      [P.kneeY + 0.02, 0.165, 0.17, 0.165],
      [P.thighY - 0.3, 0.2, 0.2, 0.19],
      [P.thighY - 0.12, 0.25, 0.25, 0.25],
      [P.thighY + 0.04, 0.26, 0.26, 0.27],
      [P.thighY + 0.16, 0.2, 0.2, 0.21],
    ],
    lf: legF, paintL: (s) => flayed(s > 0 ? 23 : 29, 2.4),
  });
  const { T, arms } = B;
  bossHead(mb, P, {
    face: { w: 1.2, h: 0.88, brow: 2.6, jaw: 1.7, chin: 1.3, sockets: 2.4, cheek: 1.5, noseW: 1.6 },
    skin: 0x8e7c74, gaunt: 0, eye: 0xff7030, eyeGlow: 0.9, jawScale: 1.35, fang: true, nose: 0.5, missingTeeth: 0x04,
  }, 1.42);
  // what is left of his jeans, and the belt that held them
  ragPants(mb, B, yH + 0.14, (s) => P.kneeY + (s > 0 ? 0.1 : 0.2), { color: 0x2a303a, region: CR.DENIM, push: 0.014, tear: 0.12, fray: 0.14, tint: bloodied(9, 0.5) });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const A = arms[s < 0 ? 0 : 1];
    // fists it walks on: the knuckles grown over with bone
    bigHand(mb, 'hand' + n, s, { scale: 3.3, curl: 1.18, spread: 1.05, thick: 1.4, skin: mulColor(skinC, 0.92), region: CR.ROT, tint: hide(41 + s), nu: 6 });
    const hb = mb.bonePos('hand' + n);
    for (let k = 0; k < 4; k++) shard(mb, [mb.bi('hand' + n), 1, 0, 0], [hb[0] - s * 0.05, hb[1] - 0.27, hb[2] + (-0.105 + k * 0.07) * 1.05], [hb[0] - s * 0.13, hb[1] - 0.37, hb[2] + (-0.11 + k * 0.074) * 1.05], 0.042, { rs: 5 });
    bigFoot(mb, 'foot' + n, s, { w: 2.2, l: 1.55, h: 1.9, skin: mulColor(skinC, 0.9), region: CR.ROT, tint: hide(51) });
    // bone through the forearm: a ridge of blades down its outer edge, the ram it charges with
    const fa = [mb.bi('farm' + n), 1, 0, 0];
    for (let i = 0; i < 3; i++) {
      const y = yE - 0.12 - i * 0.2;
      const a = surfPoint(A, s * 1.45, y, -0.05);
      const len = [0.3, 0.2, 0.26][i];
      shard(mb, fa, a, [a[0] + s * len * 0.35, a[1] + 0.12 - i * 0.03, a[2] + len * 0.9], [0.075, 0.06, 0.065][i], { rs: 4 }); // (raking back, not out: no wider than its hitbox)
    }
    // ...and through the shoulder: a crest of shards over each
    const ch = [mb.bi('chest'), 1, 0, 0];
    for (let i = 0; i < 3; i++) {
      const x = s * [0.38, 0.5, 0.6][i], z = [0.3, 0.14, 0.26][i];
      const y = ySh + [0.14, 0.1, 0.02][i];
      const len = [0.3, 0.42, 0.26][i];
      shard(mb, ch, [x, y - 0.06, z], [x + s * len * 0.5, y + len, z + len * 0.45], [0.075, 0.09, 0.07][i], { rs: 4 });
    }
    // veins standing out along the biceps and the forearm
    surfTube(mb, A, [[s * 0.3, yE + 0.5], [s * 0.15, yE + 0.34], [s * 0.4, yE + 0.16], [s * 0.2, yE + 0.02]], 0.011, 0.008, { color: 0x4a3046, region: CR.FLESH, ts: 10, blood: false });
    surfTube(mb, A, [[-s * 0.3, yE - 0.06], [-s * 0.5, yE - 0.26], [-s * 0.25, yE - 0.46], [-s * 0.4, yW + 0.06]], 0.01, 0.007, { color: 0x4a3046, region: CR.FLESH, ts: 10, blood: false });
  }
  // the spine come through the hump: a row of spurs, the tallest between the shoulders
  for (let i = 0; i < 6; i++) {
    const y = yC - 0.12 + i * 0.135;
    const a = surfPoint(T, PI, y, -0.06);
    const len = 0.1 + 0.14 * Math.sin((i / 5) * PI) + (i % 2) * 0.03;
    shard(mb, T.wts(y, 0), a, [0, a[1] + len * 0.7, a[2] + len], 0.062, { rs: 4 });
  }
  mb.aoStrength = 0.36;
  return { mb, P };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.5, runLean: -0.58, cycleWalk: 2.0, cycleRun: 3.2, walkStride: 0.38, walkKnee: 0.5, runStride: 0.45, runKnee: 0.7,
  limp: 0, sway: 0.6, knuckle: true, elbow: 0.3, headPitch: 0.35, headTilt: 0.05, jaw: 0.2, legSplay: 0.12, idleLean: -0.45,
};

/** Its windup (ZANIM.SPECIAL): ground slam windup: rear back with arms high, trembling, then slam and hold */
function poseSlam(z, p) {
  const t = z.stateT;
  clearPose(p, z.nb);
  const wind = smooth(t / 0.7);
  const slam = smooth((t - 0.75) / 0.15);
  const shake = t < 0.75 ? Math.sin(t * 60) * 0.03 * wind : 0;
  const up = wind * (1 - slam) - slam * 0.4;
  legsStatic(z, p, 0.35 * (1 - slam) + 0.6 * slam, -0.5 - 0.6 * slam, -0.2 + 0.4 * slam, -0.2 - 0.6 * slam, 0.15);
  R(p, SPINE, -0.25 + up * 0.5 + shake, 0, 0);
  R(p, CHEST, -0.25 + up * 0.35 - slam * 0.35, 0, 0);
  arm(p, 0, 0.4 + up * 2.8 + shake, 0.15, 0.2, 0.25 + 0.3 * up, 0.1);
  arm(p, 1, 0.4 + up * 2.8 - shake, 0.15, 0.2, 0.25 + 0.3 * up, 0.1);
  headLook(p, 0.4 + 0.3 * wind * (1 - slam), 0, 0, 0.3);
  R(p, JAW, -0.2 - 0.6 * wind, 0, 0);
}

function tankSmash(z, p, u) {
  // raise both arms overhead (0..0.45), smash down (0.45..0.6), recover
  let up;
  if (u < 0.45) up = smooth(u / 0.45);
  else if (u < 0.58) up = 1 - smooth((u - 0.45) / 0.13) * 1.35;
  else up = -0.35 * (1 - smooth((u - 0.58) / 0.42));
  const pitch = 0.4 + up * 2.6;
  R(p, SPINE, -0.2 + up * 0.35, 0, 0);
  R(p, CHEST, -0.2 + up * 0.25, 0, 0);
  arm(p, 0, pitch, 0.1 + 0.15 * up, 0.2, 0.3 + 0.4 * Math.max(0, up), 0.2);
  arm(p, 1, pitch, 0.1 + 0.15 * up, 0.2, 0.3 + 0.4 * Math.max(0, up), 0.2);
  headLook(p, 0.3 + up * 0.2, 0, 0, 0.3);
  R(p, JAW, -0.3 - 0.4 * Math.max(0, up), 0, 0);
}

export { buildTank as build, poseSlam as special, tankSmash as attack };
