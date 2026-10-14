// A Mother's baby (ZTYPE.BABY): its model and how it moves (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder } from '../skinning.js';
import { CR } from '../charTextures.js';
import { humanP } from '../characters/skeleton.js';
import { standardHumanoid } from './helpers.js';

export const type = ZTYPE.BABY;

/**
 * A Mother's baby: a newborn, grey-blue and still slick with her, on its front from the start (ZOMBIE_DEFS crawl, posed
 * by poseCrawl). Built big - about two and a half times a real one, a toddler's frame on a newborn's proportions: the
 * great head, short fat limbs - and calibrate() brings it down to its size. Its mouth hangs open in the cry.
 */
function buildBaby() {
  const P = humanP({ hipY: 0.5, hipW: 0.085, thighLen: 0.22, shinLen: 0.19, spineLen: 0.15, chestLen: 0.16, neckOff: 0.11, neckLen: 0.04, headR: 0.16, shoulderW: 0.16, shoulderDrop: 0.03, uarmLen: 0.22, farmLen: 0.19, handLen: 0.11, depth: 0.14 });
  const L = {
    dead: true, skin: 0x8e97a0, eye: 0xe8eef0, eyeGlow: 0.6, noBrows: true,
    face: { sockets: 1.3, gaunt: 0, rot: 0.3, w: 1.15, h: 0.9, jaw: 0.8, chin: 0.7, lips: 0.7, nose: 0.6, cheek: 1.6, ear: 0.8 },
    gaunt: 0, build: { w: 1.05, d: 1.15, belly: 1, arm: 1.25, leg: 1.3, neck: 1.2 },
    top: null, pants: null, shoes: null, hair: { style: 'buzz', color: 0x2a221c },
    jawScale: 0.9, claws: 0.0, curl: 0.6,
    blood: [[[0, 0.75, -0.1], 0.18, 1], [[0, 1.0, 0.1], 0.2, 0.8]], dirt: { y0: 0.3, k: 0.3 },
  };
  const mb = new MeshBuilder();
  standardHumanoid(mb, P, L);
  // the cord, still on it, trailing from the belly
  mb.tube('spine', [[0, -0.06, -0.12], [0.02, -0.14, -0.1], [0.06, -0.26, -0.02], [0.04, -0.36, 0.1]], 0.02, 0.012, { rs: 5, ts: 6, color: 0x8a4a58, region: CR.FLESH, mottle: 0.3, blood: false });
  return { mb, P, A: { jawHang: 0.35 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  // (it only ever crawls: poseCrawl reads its head and jaw from here)
  walkLean: -0.2, runLean: -0.3, cycleWalk: 1.2, cycleRun: 1.8, walkStride: 0.3, walkKnee: 0.5, runStride: 0.4, runKnee: 0.8,
  limp: 0, sway: 0.6, armWalk: 0.25, armDroop: 0.1, armSwing: 0.2, armRun: 0.5, elbow: 0.3, headPitch: 0.1, headTilt: 0.4, jaw: 0.55,
  idleLean: -0.1,
};

export { buildBaby as build };
