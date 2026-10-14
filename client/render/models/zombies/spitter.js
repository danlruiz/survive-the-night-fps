// The spitter (ZTYPE.SPITTER): its model, how it moves, its windup and the throb of its glow (gathered by
// zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3, clamp, lerp, smooth, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { ringLoft, tornOpen, blister, surfTube, bound } from '../monsters.js';
import { SPINE, CHEST, NECK, HEAD, JAW, humanP } from '../characters/skeleton.js';
import { clearPose, R, arm, legsStatic } from '../characters/posekit.js';
import { buildDetail, standardHumanoid, ripTint } from './helpers.js';

const PI = Math.PI;

export const type = ZTYPE.SPITTER;
// the acid in its pouch
export const glow = (time, off) => 0.8 + 0.25 * Math.sin(time * 3.1 + off);

/**
 * The spitter: starved to a rake, all of it gone into the acid it carries. A long neck with a pouch of the stuff hung
 * under the jaw from chin to collarbone, lit from inside; a jaw eaten loose; the front of its shirt and the chest under
 * it burned through to the breastbone by what it drools; a little round belly full of more.
 */
function buildSpitter() {
  const P = humanP({ hipY: 1.0, thighLen: 0.47, shinLen: 0.46, spineLen: 0.14, chestLen: 0.2, neckOff: 0.17, neckLen: 0.24, headR: 0.1, shoulderW: 0.165, uarmLen: 0.34, farmLen: 0.31, handLen: 0.19, neckZ: 0.0, headZ: -0.02 });
  const far = buildDetail < 0.7;
  const scald = (p, n, c) => {
    // acid burns: yellowed, blistered patches, worst down the front
    const m = fbm3(p.x * 12, p.y * 12, p.z * 12, 2, 3);
    if (m > 0.6) c.lerp(color(0x9ab040), Math.min(0.6, (m - 0.6) * 5));
    if (p.z < -0.02 && p.y > 0.9 && p.y < 1.55) c.lerp(color(0x8a7a2a), clamp((1.55 - p.y) * 0.5 * (0.5 + m), 0, 0.4));
  };
  const L = {
    dead: true, skin: 0x8c9670, eye: 0xb8ff60, eyeGlow: 0.9, noBrows: true,
    face: { sockets: 1.85, gaunt: 1, rot: 0.8, w: 0.95, h: 1.12, jaw: 1.1, chin: 1.15, lips: 0.4 },
    gaunt: 1, build: { w: 0.92, arm: 0.8, leg: 0.82, neck: 0.78, belly: 1.3 },
    top: { kind: 'tee', color: 0x6c6c5a, region: CR.COTTON, sleeves: 'short', tear: 0.3, hem: 0.09, tint: bloodied(7, 0.4, (p, n, c) => p.z < 0 && Math.abs(p.x) < 0.1 && c.lerp(color(0x4a4a1a), clamp((1.5 - p.y) * 1.6, 0, 0.75))) },
    pants: { color: 0x3a3a34, region: CR.TWILL, tear: 0.15, tearY: 0.22, tint: bloodied(9, 0.5) },
    shoes: null, hair: null,
    fingerMul: 1.25, claws: 0.02, curl: 0.6, jawScale: 1.1, missingTeeth: 0x21, cheekTear: -1,
    blood: [[[0, 1.62, -0.12], 0.1, 0.6]], dirt: { y0: 0.4, k: 0.5 }, skinTint: scald,
  };
  const mb = new MeshBuilder();
  const yC = P.chestY;
  const built = standardHumanoid(mb, P, L, buildDetail, (T) => {
    // burned through to the breastbone
    const rip = tornOpen(mb, T, -0.5, 0.42, yC + 0.0, yC + 0.15, { ribs: 4, r: 0.0055, depth: 0.012, nu: 7, nv: 7, rag: 0.45, flesh: 0x5a3a14, rim: 0x6a6a1a, slope: 0.3, seed: 4 });
    L.hole = rip.fn;
    const rt = ripTint(T, rip, yC - 0.06, yC + 0.2, 0.14);
    L.skinTint = (p, n, c) => {
      scald(p, n, c);
      rt(p, n, c);
    };
  });
  // the pouch (own bone for pulsing): from under the jaw to the collarbones, in lobes
  mb.addBone('sac', 'neck', 0, P.neckY + P.neckLen * 0.5, -0.03);
  const nY = P.neckY, hY = P.headY;
  const veined = (p, n, c) => {
    if (fbm3(p.x * 40, p.y * 40, p.z * 40, 2, 5) < 0.4) c.lerp(color(0x3a5a18), 0.6);
    if (Math.abs(fbm3(p.x * 22, p.y * 9, p.z * 22, 2, 15) - 0.5) < 0.03) c.lerp(color(0x1e3a10), 0.8);
  };
  ringLoft(mb, 'sac', [
    { c: [0, hY - 0.005, -0.05], rx: 0.028, ry: 0.024 }, { c: [0, hY - 0.05, -0.082], rx: 0.066, ry: 0.058 }, { c: [0, lerp(nY, hY, 0.45), -0.108], rx: 0.1, ry: 0.088 },
    { c: [0, nY + 0.03, -0.108], rx: 0.094, ry: 0.08 }, { c: [0, nY - 0.04, -0.09], rx: 0.045, ry: 0.036 },
  ], {
    nu: far ? 7 : 12, sub: far ? 1 : 3, up: [0, 0, -1], color: 0x9cff48, region: CR.GLOW, glow: 0.7, mottle: 0.2, blood: false, ao: false, cap0: 0.01, cap1: 0.012, tint: veined,
    dr: (s, a) => 0.009 * Math.sin(a * 3 + 1) * Math.sin(s * PI) + 0.006 * Math.sin(s * 14),
  });
  if (!far) {
    bound(mb, [mb.bi('sac'), 1, 0, 0], () => {
      for (const s of [-1, 1]) mb.ellip('root', [s * 0.058, lerp(nY, hY, 0.3), -0.058], [0.04, 0.056, 0.042], { ws: 8, hs: 6, color: 0x8cf040, region: CR.GLOW, glow: 0.55, blood: false, ao: false, tint: veined });
      mb.ellip('root', [0.03, nY + 0.0, -0.1], [0.03, 0.036, 0.028], { ws: 7, hs: 5, color: 0x8cf040, region: CR.GLOW, glow: 0.6, blood: false, ao: false, tint: veined });
    });
    // what it drools: strands off the jaw, and the runs of it down its front
    const hb = mb.bonePos('head');
    const wet = { color: 0x9ae040, glow: 0.45, region: CR.GLOW, blood: false, ao: false };
    bound(mb, [mb.bi('jaw'), 1, 0, 0], () => {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.022, y0 = hb[1] + P.headR * 0.15, z0 = hb[2] - P.headR * 0.82;
        mb.tube('root', [[x, y0, z0], [x * 1.2, y0 - 0.05 - i * 0.02, z0 - 0.006], [x * 1.3, y0 - 0.1 - i * 0.035, z0 + 0.004]], 0.0045, 0.0015, { rs: 4, ts: 3, ...wet });
        mb.ellip('root', [x * 1.3, y0 - 0.105 - i * 0.035, z0 + 0.004], [0.006, 0.009, 0.006], { ws: 5, hs: 3, ...wet });
      }
    });
    surfTube(mb, built.T, [[0.1, yC + 0.2], [0.14, yC + 0.1], [0.08, yC - 0.02], [0.12, yC - 0.14]], 0.006, 0.003, { ...wet, glow: 0.35, ts: 8 });
    surfTube(mb, built.T, [[-0.3, yC + 0.18], [-0.22, yC + 0.02], [-0.3, yC - 0.1]], 0.005, 0.0025, { ...wet, glow: 0.35, ts: 6 });
    // blisters of it up the back and over the shoulders: what shows of a spitter from behind, in the dark
    const rnd = mulberry32(31);
    for (let i = 0; i < 9; i++) blister(mb, built.T, PI + (rnd() - 0.5) * 2.4, P.spineY + rnd() * (P.shoulderY - P.spineY), 0.014 + rnd() * 0.014, 0.7, { color: 0xa8f048, glow: 0.5, rim: 0x5a5a1a, ws: 6, hs: 4 });
  }
  return { mb, P, A: { jawHang: 0.3 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.35, runLean: -0.5, cycleWalk: 1.45, cycleRun: 2.3, walkStride: 0.38, walkKnee: 0.6, runStride: 0.65, runKnee: 1.1,
  limp: 0.25, sway: 1.2, armWalk: 0.3, armDroop: 0.12, armSwing: 0.25, armRun: 0.6, elbow: 0.5, headPitch: 0.05, headTilt: 0.2, jaw: 0.3, neckFwd: 0.55,
  idleLean: -0.35,
};

/** Its windup (ZANIM.SPECIAL): rear head back, then lunge forward spitting (loops ~1.2s) */
function poseSpit(z, p) {
  const t = z.stateT;
  const u = (t % 1.2) / 1.2;
  clearPose(p, z.nb);
  legsStatic(z, p, 0.3, -0.3, -0.1, -0.1, 0.05);
  const back = u < 0.45 ? smooth(u / 0.45) : 1 - smooth((u - 0.45) / 0.12);
  const fwd = u < 0.45 ? 0 : u < 0.62 ? smooth((u - 0.45) / 0.17) : 1 - smooth((u - 0.62) / 0.38);
  R(p, SPINE, -0.2 + back * 0.35 - fwd * 0.35, 0, 0);
  R(p, CHEST, -0.2 + back * 0.3 - fwd * 0.3, 0, 0);
  R(p, NECK, back * 0.5 - fwd * 0.6, 0, 0);
  R(p, HEAD, back * 0.4 - fwd * 0.15, 0, 0);
  R(p, JAW, -0.2 - back * 0.3 - fwd * 0.75, 0, 0);
  arm(p, 0, 0.3 + back * 0.4, 0.5 * back, 0, 0.6, 0.3);
  arm(p, 1, 0.3 + back * 0.4, 0.5 * back, 0, 0.6, 0.3);
  z.sacPulse = 0.18 * back + 0.1 * fwd;
}

export { buildSpitter as build, poseSpit as special };
