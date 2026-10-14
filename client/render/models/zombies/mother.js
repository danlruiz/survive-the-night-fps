// The Mother (ZTYPE.MOTHER): its model and how it moves (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3, clamp, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { humanP } from '../characters/skeleton.js';
import { buildingFar, standardHumanoid } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.MOTHER;

/**
 * The Mother: a young woman dead late in her pregnancy, still in the nightdress she went into labour in, blood down the
 * front of it from the waist. The bump stands out under the cloth, too round and too still, on a bone of its own
 * ('womb') - until a shot tears it open (ZSTATUS.BURST, ZombieInstance.setBurst): then the bump is gone and the 'wound'
 * bone shows instead, a dark hole ringed with torn skin and cloth, two cords hanging out of it.
 */
function buildMother() {
  const P = humanP({ hipY: 0.92, hipW: 0.1, thighLen: 0.43, shinLen: 0.42, spineLen: 0.13, chestLen: 0.19, neckOff: 0.18, neckLen: 0.1, headR: 0.1, shoulderW: 0.17, uarmLen: 0.29, farmLen: 0.26, handLen: 0.17 });
  const far = buildingFar();
  const gown = 0xc4b0b4;
  const L = {
    dead: true, sex: 'f', skin: 0xb0a89e, eye: 0xd8d2c4, eyeGlow: 0.35, noBrows: true,
    face: { sockets: 1.5, gaunt: 0.5, rot: 0.4, w: 0.95, h: 1.05, jaw: 1.1, chin: 1.05, lips: 0.5, fem: 1 },
    gaunt: 0.25, build: { w: 0.95, hips: 1.15, belly: 0.5, arm: 0.9, leg: 0.92 },
    top: { kind: 'tee', color: gown, region: CR.COTTON, sleeves: 'short', hem: 0.42, tear: 0.15, collar: 'crew', tint: bloodied(19, 0.5) },
    pants: null, shoes: null, hair: { style: 'long', color: 0x3a2a1c, ragged: 0.3, length: 0.28 },
    jawScale: 1.1, claws: 0.01, curl: 0.4, missingTeeth: 0x12,
    blood: [[[0, 0.8, -0.12], 0.16, 1], [[0, 0.62, -0.1], 0.12, 0.9]], dirt: { y0: 0.4, k: 0.6 },
  };
  const mb = new MeshBuilder();
  standardHumanoid(mb, P, L);
  const yB = P.hipY + 0.07;
  // the bump, under the nightdress (on the spine: it leans and twists with her)
  mb.addBone('womb', 'spine', 0, yB, 0);
  const birth = (pp, n, c) => {
    // blood soaking up into the cloth from under the bump
    const k = clamp((yB - 0.02 - pp.y) * 9 + (fbm3(pp.x * 12, pp.y * 12, pp.z * 12, 2, 23) - 0.5) * 0.8, 0, 0.85);
    if (k > 0) c.lerp(color(0x4a0806), k);
  };
  mb.ellip('womb', [0, 0.01, -0.06], [0.135, 0.165, 0.15], { ws: far ? 10 : 16, hs: far ? 8 : 12, color: gown, region: CR.COTTON, mottle: 0.12, tint: birth });
  // what is left of it torn open, hidden until it is (ZombieInstance.setBurst)
  mb.addBone('wound', 'spine', 0, yB, 0);
  mb.ellip('wound', [0, 0, -0.112], [0.09, 0.1, 0.03], { ws: 10, hs: 8, color: 0x2a0606, region: CR.FLESH, mottle: 0.3, blood: false });
  mb.ellip('wound', [0, -0.015, -0.13], [0.06, 0.07, 0.016], { ws: 8, hs: 6, color: 0x5a1210, region: CR.FLESH, mottle: 0.35, blood: false });
  const rnd = mulberry32(61);
  const flaps = far ? 6 : 10;
  for (let i = 0; i < flaps; i++) {
    // torn skin and cloth, peeled back round the hole like petals
    const a = (i / flaps) * TAU + (rnd() - 0.5) * 0.4;
    const bx = Math.cos(a) * 0.088, by = Math.sin(a) * 0.098;
    const len = 0.03 + rnd() * 0.03;
    mb.spike('wound', [bx, by, -0.115], [bx + Math.cos(a) * len * 0.7, by + Math.sin(a) * len * 0.7, -0.15 - rnd() * 0.025], 0.026 + rnd() * 0.01, { rs: 4, color: i & 1 ? 0x8a6a68 : 0x7a2a22, region: i & 1 ? CR.COTTON : CR.FLESH, mottle: 0.35, tint: bloodied(31 + i, 0.9), noise: 0.004, nf: 40 });
  }
  // the cords, hanging out of it
  for (const s of [-1, 1]) {
    mb.tube('wound', [[s * 0.02, -0.02, -0.13], [s * 0.05, -0.12, -0.17], [s * 0.03, -0.26, -0.15], [s * 0.06, -0.38, -0.12]], 0.011, 0.007, { rs: 5, ts: 8, color: 0x8a4a58, region: CR.FLESH, mottle: 0.3, blood: false });
  }
  return { mb, P, A: { jawHang: 0.15 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  // a slow, heavy-footed sway, leaning back to carry the bump, a hand drifting to it
  walkLean: 0.04, runLean: -0.12, cycleWalk: 1.4, cycleRun: 2.2, walkStride: 0.34, walkKnee: 0.5, runStride: 0.5, runKnee: 0.85,
  limp: 0.25, sway: 1.4, waddle: 0.5, armWalk: 0.22, armDroop: 0.15, armSwing: 0.18, armRun: 0.5, armOut: 0.12, elbow: 0.35, headPitch: 0.05, headTilt: 0.3, jaw: 0.3,
  legSplay: 0.05, idleLean: 0.02,
};

export { buildMother as build };
