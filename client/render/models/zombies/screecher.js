// The screecher (ZTYPE.SCREECHER): its model, how it moves and its windup (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, smooth } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { blister } from '../monsters.js';
import { SPINE, CHEST, JAW, humanP } from '../characters/skeleton.js';
import { clearPose, R, arm, headLook, legsStatic } from '../characters/posekit.js';
import { buildingFar, standardHumanoid } from './helpers.js';

export const type = ZTYPE.SCREECHER;

/**
 * The screecher: a woman in what is left of a hospital gown, barefoot, long hair hanging in strings. Her throat has
 * swollen into a raw red sac on either side of the windpipe, lit from inside, and her jaw hangs open wide enough to
 * scream with: that and the white of her eyes is what shows of her in the dark.
 */
function buildScreecher() {
  const P = humanP({ hipY: 0.95, hipW: 0.1, thighLen: 0.44, shinLen: 0.43, spineLen: 0.13, chestLen: 0.19, neckOff: 0.17, neckLen: 0.13, headR: 0.098, shoulderW: 0.165, uarmLen: 0.3, farmLen: 0.27, handLen: 0.18 });
  const far = buildingFar();
  const L = {
    dead: true, sex: 'f', skin: 0xa8a49a, eye: 0xf4f0e0, eyeGlow: 0.8, noBrows: true,
    face: { sockets: 1.9, gaunt: 0.9, rot: 0.5, w: 0.95, h: 1.1, jaw: 1.25, chin: 1.1, lips: 0.3, fem: 1 },
    gaunt: 0.8, build: { w: 0.9, arm: 0.86, leg: 0.88, neck: 1.15 },
    top: { kind: 'tee', color: 0x8ea4aa, region: CR.COTTON, sleeves: 'short', hem: 0.4, tear: 0.4, collar: 'v', tint: bloodied(13, 0.8) },
    pants: null, shoes: null, hair: { style: 'long', color: 0x1a1612, ragged: 0.35, length: 0.3 },
    fingerMul: 1.15, claws: 0.02, curl: 0.5, jawScale: 1.35, missingTeeth: 0x14, cheekTear: 1,
    blood: [[[0, 1.5, -0.1], 0.12, 1], [[0, 1.3, -0.14], 0.12, 0.9]], dirt: { y0: 0.4, k: 0.7 },
  };
  const mb = new MeshBuilder();
  const built = standardHumanoid(mb, P, L);
  // the sacs either side of the windpipe, and the wound across the throat they bulge out of
  const nY = P.neckY;
  const raw = { color: 0xa83a30, glow: 0.35, region: CR.TUMOR, rim: 0x5a1010, ws: far ? 6 : 9, hs: far ? 4 : 6 };
  for (const t of [-0.45, 0.45]) blister(mb, built.T, t, nY - 0.005, 0.042, 0.8, { ...raw, tall: 1.4 });
  if (!far) blister(mb, built.T, 0, nY - 0.03, 0.03, 0.5, { ...raw, glow: 0.2, tall: 0.6 });
  return { mb, P, A: { jawHang: 0.55 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  // a stiff, hurried stagger with the head thrown about on its long neck, arms hanging
  walkLean: -0.25, runLean: -0.45, cycleWalk: 1.35, cycleRun: 2.4, walkStride: 0.4, walkKnee: 0.55, runStride: 0.62, runKnee: 1.0,
  limp: 0.2, sway: 0.9, armWalk: 0.3, armDroop: 0.2, armSwing: 0.2, armRun: 0.6, elbow: 0.3, headPitch: 0.1, headTilt: 0.4, jaw: 0.4, neckFwd: 0.3,
  idleLean: -0.2, twitchy: 1,
};

/**
 * Its windup (ZANIM.SPECIAL): rears back with the arms flung out, head thrown back and the jaw wide, shaking with the
 * scream
 */
function poseScream(z, p) {
  const t = z.stateT;
  clearPose(p, z.nb);
  const k = smooth(t / 0.45);
  const q = Math.sin(t * 45) * 0.04 * k;
  legsStatic(z, p, 0.15 * k, -0.2 * k, -0.15 * k, -0.15 * k, 0.12);
  R(p, SPINE, 0.15 * k, 0, 0);
  R(p, CHEST, 0.2 * k + q, 0, 0);
  arm(p, 0, 0.5 * k, 0.9 * k, 0.2, 0.3, 0.4 * k);
  arm(p, 1, 0.5 * k, 0.9 * k, 0.2, 0.3, 0.4 * k);
  headLook(p, 0.55 * k + q, 0, 0, 0.5);
  R(p, JAW, -0.25 - 0.95 * k, 0, 0);
}

export { buildScreecher as build, poseScream as special };
