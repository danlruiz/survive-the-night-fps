// The smoker (ZTYPE.SMOKER): its model, how it moves and its windup (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3, clamp, smooth, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { blister } from '../monsters.js';
import { SPINE, CHEST, NECK, HEAD, JAW, humanP } from '../characters/skeleton.js';
import { clearPose, R, arm, legsStatic } from '../characters/posekit.js';
import { buildDetail, standardHumanoid } from './helpers.js';

const PI = Math.PI;

export const type = ZTYPE.SMOKER;

/**
 * The smoker: a big man gone grey-black with what he breathes out, in a stoker's boiler shirt open over a chest swollen
 * with it. Sacs of smoke bulge from his throat, over his shoulders and down his back, and the vents it seeps out of -
 * pits rimmed with a dull ember glow - pock the skin between them: what shows of one from behind, in the dark.
 */
function buildSmoker() {
  const P = humanP({ hipY: 0.99, thighLen: 0.46, shinLen: 0.46, spineLen: 0.14, chestLen: 0.22, neckOff: 0.19, neckLen: 0.09, headR: 0.112, shoulderW: 0.195, uarmLen: 0.32, farmLen: 0.29, handLen: 0.19 });
  const far = buildDetail < 0.7;
  // soot: blackest round the vents, the throat and the mouth, streaked down the front where it leaks
  const soot = (p, n, c) => {
    const m = fbm3(p.x * 10, p.y * 10, p.z * 10, 2, 41);
    c.lerp(color(0x161412), clamp((m - 0.35) * 1.4, 0, 0.55));
    if (p.y > 1.3 && p.z < 0) c.lerp(color(0x0e0c0a), clamp((1.55 - Math.abs(p.y - 1.45) * 8) * 0.3, 0, 0.4));
  };
  const L = {
    dead: true, skin: 0x6a645c, eye: 0xd88a40, eyeGlow: 0.45, noBrows: true,
    face: { sockets: 1.6, gaunt: 0.4, rot: 0.7, w: 1.06, jaw: 1.2, chin: 1.1, lips: 0.3, nose: 0.8 },
    gaunt: 0.25, build: { w: 1.12, d: 1.14, arm: 1.08, leg: 1.04, neck: 1.35, belly: 0.9 },
    top: { kind: 'shirt', color: 0x3c3a34, region: CR.CANVAS, sleeves: 'rolled', tear: 0.3, open: 0.4, under: { color: 0x4a4640, region: CR.COTTON }, collar: 'shirt', hem: 0.05, tint: bloodied(13, 0.35, (p, n, c) => c.lerp(color(0x1a1816), clamp(fbm3(p.x * 8, p.y * 8, p.z * 8, 2, 7) - 0.3, 0, 0.6))) },
    pants: { color: 0x2a2826, region: CR.TWILL, tear: 0.12, tearY: 0.16, tint: bloodied(17, 0.3) },
    shoes: { kind: 'work', color: 0x221c16 }, hair: { style: 'balding', color: 0x1a1612 },
    jawScale: 1.15, missingTeeth: 0x24, curl: 0.55, claws: 0.01,
    blood: [[[0, 1.58, -0.13], 0.1, 0.5]], dirt: { y0: 0.5, k: 0.8 }, skinTint: soot,
  };
  const mb = new MeshBuilder();
  const built = standardHumanoid(mb, P, L);
  const T = built.T, nY = P.neckY, yC = P.chestY;
  const sac = { color: 0x3e3934, glow: 0, region: CR.TUMOR, rim: 0x1c1814, mottle: 0.25, ws: far ? 6 : 9, hs: far ? 4 : 6 };
  const vent = { color: 0x1a120c, glow: 0.35, region: CR.GLOW, rim: 0xa04a18, ws: far ? 5 : 6, hs: 4 };
  // the throat swollen with it, and the chest under the open shirt
  blister(mb, T, 0, nY + 0.01, 0.068, 0.8, { ...sac, tall: 1.15 });
  blister(mb, T, -0.25, yC + 0.06, 0.06, 0.6, sac);
  // sacs over the shoulders and down the back
  blister(mb, T, PI + 0.55, P.shoulderY - 0.03, 0.075, 0.75, sac);
  blister(mb, T, PI - 0.4, yC + 0.02, 0.085, 0.7, { ...sac, tall: 1.2 });
  if (!far) {
    blister(mb, T, PI + 0.15, P.spineY + 0.04, 0.06, 0.6, sac);
    // the vents it seeps out of
    const rnd = mulberry32(53);
    for (let i = 0; i < 8; i++) blister(mb, T, PI + (rnd() - 0.5) * 2.6, P.spineY + rnd() * (P.shoulderY - P.spineY), 0.014 + rnd() * 0.01, 0.35, vent);
    blister(mb, T, 0.5, yC + 0.12, 0.016, 0.35, vent);
  }
  return { mb, P, A: { jawHang: 0.2 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.22, runLean: -0.32, cycleWalk: 1.55, cycleRun: 2.2, walkStride: 0.36, walkKnee: 0.5, runStride: 0.48, runKnee: 0.85,
  limp: 0.3, sway: 1.0, armWalk: 0.25, armDroop: 0.12, armSwing: 0.2, armRun: 0.6, elbow: 0.3, headPitch: 0.05, headTilt: 0.25, jaw: 0.3,
  idleLean: -0.2,
};

/**
 * Its windup (ZANIM.SPECIAL): breathing out its cloud: draws itself up, chest swelling (0..0.5), then doubles over and
 * lets it out, jaw wide
 */
function poseExhale(z, p) {
  const t = z.stateT;
  clearPose(p, z.nb);
  legsStatic(z, p, 0.25, -0.3, -0.1, -0.12, 0.08);
  z.standOn = true;
  const draw = smooth(Math.min(1, t / 0.5));
  const out = smooth(clamp((t - 0.5) / 0.3, 0, 1));
  const q = Math.sin(t * 30) * 0.02 * out;
  R(p, SPINE, -0.1 + draw * 0.25 - out * 0.5 + q, 0, 0);
  R(p, CHEST, draw * 0.2 - out * 0.3, 0, 0);
  R(p, NECK, draw * 0.25 - out * 0.4, 0, 0);
  R(p, HEAD, draw * 0.3 - out * 0.2 + q, 0, 0);
  R(p, JAW, -0.15 - draw * 0.15 - out * 0.8, 0, 0);
  arm(p, 0, 0.25 + draw * 0.2, 0.35 + draw * 0.35, 0, 0.5, 0.3);
  arm(p, 1, 0.25 + draw * 0.2, 0.35 + draw * 0.35, 0, 0.5, 0.3);
}

export { buildSmoker as build, poseExhale as special };
