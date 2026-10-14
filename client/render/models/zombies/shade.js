// The Shade (ZTYPE.SHADE): its model, how it moves and the throb of its glow (gathered by zombies/index.js).
import * as THREE from 'three';
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bigHand, tornOpen, rag, shard, surfTube } from '../monsters.js';
import { surfPoint, headPoint } from '../humans.js';
import { humanP } from '../characters/skeleton.js';
import { buildDetail, buildingFar, onHead, standardHumanoid, ripTint } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.SHADE;
export const calibrateRun = true;
// the cold light under its skin: barely there while it stalks
export const glow = (time, off) => 0.5 + 0.15 * Math.sin(time * 2.3 + off);

/**
 * The Shade: a starved, ash-dark silhouette that the night swallows whole (a beam shows it grey as a statue). What
 * gives it away in the dark are the pale eyes, the veins of cold light under its skin - faint while it stalks, flaring
 * when a light pins it (ZombieInstance.hold) - and the same light in the cage of its ribs, where its chest has opened.
 */
function buildShade() {
  const P = humanP({ hipY: 1.06, hipW: 0.09, thighLen: 0.5, shinLen: 0.49, spineLen: 0.15, chestLen: 0.2, neckOff: 0.18, neckLen: 0.14, headR: 0.098, shoulderW: 0.16, uarmLen: 0.4, farmLen: 0.41, handLen: 0.23, headZ: -0.015 });
  const far = buildingFar();
  const ash = color(0x5c5a68);
  const ashen = (p, n, c) => {
    if (fbm3(p.x * 16, p.y * 16, p.z * 16, 2, 9) > 0.6) c.lerp(ash, 0.55);
  };
  const skinC = 0x34323b;
  const L = {
    dead: true, skin: skinC, eye: 0xe6eeff, eyeGlow: 1.3, noBrows: true,
    face: { sockets: 2.2, gaunt: 1, rot: 0.9, w: 0.92, h: 1.16, jaw: 1.1, chin: 1.3, lips: 0.2, noNose: true, nose: 0 },
    gaunt: 1, build: { w: 0.87, arm: 0.7, leg: 0.72, neck: 0.7 },
    top: null, pants: { color: 0x131317, region: CR.CLOTH, tear: 0.2, tearY: 0.55, belt: false }, shoes: null, hair: null,
    fingerMul: 1.7, claws: 0.06, curl: 0.8, jawScale: 1.15, fang: true, missingTeeth: 0x24, noHands: !far,
    blood: [], dirt: { y0: 0, k: 0 }, skinTint: ashen, headTint: onHead(ashen),
  };
  const mb = new MeshBuilder();
  const yC = P.chestY;
  const built = standardHumanoid(mb, P, L, buildDetail, (T) => {
    // the chest come open down the breastbone: the ribs a cage, the cold light inside it
    const rip = tornOpen(mb, T, -0.52, 0.52, yC - 0.05, yC + 0.13, { ribs: 5, r: 0.0058, depth: 0.03, nu: 8, nv: 8, rag: 0.3, flesh: 0x9db4ff, glow: 0.6, rim: 0x14131a, bone: 0x2a2930, slope: 0, seed: 9 });
    L.hole = rip.fn;
    const rt = ripTint(T, rip, yC - 0.1, yC + 0.2, 0.14);
    L.skinTint = (p, n, c) => {
      ashen(p, n, c);
      rt(p, n, c);
    };
  });
  const light = { rs: 3, color: 0x9db4ff, region: CR.GLOW, glow: 0.55, blood: false, ao: false, cap: false };
  const vein = (S, pts, r = 0.0045) => surfTube(mb, S, pts.map(([t, y]) => [t, y, 0.003]), r, r * 0.35, { ...light, ts: pts.length * (far ? 1 : 2) });
  const { T, H } = built;
  const yS = P.spineY, yH = P.hipY, ySh = P.shoulderY;
  // veins of it: out from the chest over the shoulders and down the belly, down each limb, up the throat
  vein(T, [[0.5, yC + 0.12], [0.7, yC + 0.07], [1.0, yC + 0.1], [1.3, yC + 0.06]], 0.005);
  vein(T, [[-0.5, yC + 0.12], [-0.75, yC + 0.15], [-1.05, yC + 0.11], [-1.35, yC + 0.14]], 0.005);
  vein(T, [[0.12, yC - 0.06], [-0.1, yS + 0.08], [0.14, yS - 0.02], [-0.06, yH + 0.06]], 0.006);
  if (!far) {
    vein(T, [[-0.1, yS + 0.08], [-0.6, yS + 0.03], [-1.0, yS + 0.06]]);
    vein(T, [[0.14, yS - 0.02], [0.6, yS - 0.05], [0.95, yH + 0.1]]);
    vein(T, [[PI - 0.3, ySh - 0.02], [PI - 0.15, yC + 0.05], [PI - 0.35, yC - 0.05], [PI - 0.2, yS]]);
    vein(T, [[PI + 0.35, ySh - 0.04], [PI + 0.2, yC], [PI + 0.4, yS + 0.05]]);
    vein(built.N, [[0.5, P.neckY + 0.01], [0.3, P.neckY + 0.07], [0.55, P.neckY + 0.14]], 0.004);
    vein(built.N, [[-0.6, P.neckY + 0.0], [-0.4, P.neckY + 0.1]], 0.004);
  }
  const hp = new THREE.Vector3();
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const A = built.arms[s < 0 ? 0 : 1], Lg = built.legs[s < 0 ? 0 : 1];
    vein(A, [[0.1, A.yS - 0.05], [-0.1, A.yS - 0.17], [0.08, A.yS - 0.27], [s * 0.3, A.yE - 0.02]]);
    vein(A, [[0, A.yE - 0.04], [s * 0.15, A.yE - 0.16], [-s * 0.1, A.yE - 0.26], [s * 0.1, A.yW + 0.04]]);
    if (!far) vein(Lg, [[s * 0.4, Lg.yK + 0.12], [s * 0.2, Lg.yK - 0.02], [s * 0.5, Lg.yK - 0.16], [s * 0.3, Lg.yK - 0.3], [s * 0.45, Lg.yA + 0.06]]);
    // tear tracks of light running down from the eyes
    const track = [];
    for (const [a, l] of [[0.42, 0.06], [0.52, -0.12], [0.5, -0.3], [0.42, -0.5]]) {
      headPoint(H, s * a, l, hp);
      track.push([hp.x, hp.y, hp.z - 0.001]);
    }
    mb.tube('head', track, 0.004, 0.0014, { ...light, ts: 8 });
    if (!far) bigHand(mb, 'hand' + n, s, { scale: 1.12, curl: 0.55, spread: 1.25, fingerMul: 1.95, claws: 0.075, skin: skinC, region: CR.ROT, tint: ashen, nail: 0x0c0c10 });
  }
  // the spine: a ridge of bone spurs down the back
  for (let i = 0; i < (far ? 5 : 9); i++) {
    const y = P.chestY - 0.07 + i * (far ? 0.055 : 0.032);
    const a = surfPoint(T, PI, y, -0.008);
    const len = 0.045 + 0.03 * Math.sin((i / (far ? 4 : 8)) * PI);
    shard(mb, T.wts(y, 0), a, [0, a[1] + len * 0.6, a[2] + len], 0.012, { rs: 4, color: 0x24232a });
  }
  // what is left of a shroud: tatters off the shoulders, the forearms and the waist
  const rnd = mulberry32(4107);
  const cloth = { color: 0x0b0b0e, region: CR.CLOTH, blood: false, sway: 0.03 };
  for (let i = 0; i < (far ? 5 : 9); i++) {
    const t = (i / (far ? 5 : 9)) * TAU + rnd() * 0.4;
    rag(mb, 'hips', surfPoint(T, t, yH + 0.05, 0.012), 0.3 + rnd() * 0.3, 0.05 + rnd() * 0.04, -t, { ...cloth, seed: i + 1, nv: far ? 2 : 4 });
  }
  if (!far) {
    for (const s of [-1, 1]) {
      const A = built.arms[s < 0 ? 0 : 1], n = s < 0 ? 'L' : 'R';
      for (let i = 0; i < 3; i++) rag(mb, 'farm' + n, surfPoint(A, PI + (i - 1) * 0.7, A.yE - 0.06 - i * 0.09, 0.004), 0.26 + rnd() * 0.2, 0.04 + rnd() * 0.02, PI + (i - 1) * 0.7, { ...cloth, seed: i + 20 + s, nv: 4 });
      for (let i = 0; i < 2; i++) rag(mb, 'chest', surfPoint(T, PI + s * (0.7 + i * 0.5), ySh + 0.02, 0.008), 0.34 + rnd() * 0.26, 0.06 + rnd() * 0.03, PI + s * (0.7 + i * 0.5), { ...cloth, seed: i + 30 + s, nv: 4 });
    }
  }
  return { mb, P, A: { jawHang: 0.5 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  // long, low strides with both clawed hands reaching ahead: whatever stride the light catches is the statue it becomes
  walkLean: -0.32, runLean: -0.6, cycleWalk: 1.7, cycleRun: 3.3, walkStride: 0.42, walkKnee: 0.6, runStride: 0.75, runKnee: 1.1,
  limp: 0, sway: 0.5, armWalk: 0.55, armDroop: 0.35, armSwing: 0.1, armRun: 1.05, armOut: 0.22, elbow: 0.4, headPitch: 0.3, headTilt: 0.3, jaw: 0.45, neckFwd: 0.45,
  idleLean: -0.28, shoulderRoll: 0.2,
};

export { buildShade as build };
