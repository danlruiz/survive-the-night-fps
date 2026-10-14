// The runner (ZTYPE.RUNNER): its model and how it moves (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32 } from '../skinning.js';
import { CR } from '../charTextures.js';
import { humanP } from '../characters/skeleton.js';
import { standardHumanoid, exposedRibs } from './helpers.js';

export const type = ZTYPE.RUNNER;
export const variants = 3;
export const calibrateRun = true;

const PANTS = [0x3b4a63, 0x7d7055, 0x262626, 0x4a3a2a, 0x55555a, 0x2f3d52];

function buildRunner(v) {
  const P = humanP({ hipY: 0.94, thighLen: 0.44, shinLen: 0.43, spineLen: 0.12, chestLen: 0.19, neckOff: 0.19, headR: 0.104, shoulderW: 0.17, uarmLen: 0.31, farmLen: 0.28, handLen: 0.18 });
  const rnd = mulberry32(2000 + v * 31);
  const L = {
    skin: [0x8a8a7e, 0x7a8470, 0x8c8078][v % 3], skinRegion: CR.GORE, gaunt: 0.95, ribs: 1, armR: 0.038, thighR: 0.068, neckR: 0.04, chestR: 0.148,
    shirt: v % 2 === 0 ? { color: v === 0 ? 0x8a8472 : 0x5a2a24, type: 'tank', tear: 0.4, seed: 71 + v, rags: 4, hem: 0.0 } : null,
    pants: { color: PANTS[(v + 2) % PANTS.length], region: CR.DENIM, tearY: 0.35 + rnd() * 0.1 },
    shoes: null, hair: { color: 0x1a1410, patchy: 0.55, cover: 0.5 },
    eye: 0xe0d890, eyeGlow: 0.3, socket: 0.22, fingerMul: 1.15, claws: 0.02, curl: 0.7,
    blood: [[[0, 1.5, -0.1], 0.12, 1], [[0.05, 1.2, -0.13], 0.15, 1], [[-0.1, 0.95, -0.1], 0.1, 1], [[0.17, 0.8, 0], 0.08, 1]],
    missingTeeth: 0x12, fang: true,
    ...[{ cheekTear: 1 }, { skullPatch: [-0.3, 0.8, 0.35, 0.6] }, { oneEye: -1, noEar: 1, jawHang: 0.25 }][v % 3],
  };
  const mb = new MeshBuilder();
  const built = standardHumanoid(mb, P, L);
  exposedRibs(mb, P, -1, -0.07, 4, built);
  return { mb, P, A: L.jawHang ? { jawHang: L.jawHang } : null };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.75, runLean: -0.95, cycleWalk: 1.2, cycleRun: 2.9, limp: 0, headPitch: 0.25, headTilt: 0.15, jaw: 0.35,
  idleLean: -0.6, twitchy: 1,
  // stalking prowl: crouched, quick light steps, arms hanging forward
  gWalk: {
    ref: 2.2, duty: 0.6, lift: 0.08, strike: 0.1, toeOff: -0.6, rollIn: 0.12, heelOff: 0.55, bias: -0.04, width: 0.03, ext: 0.92, bob: 0.015, vt: 0.7,
    hipYaw: 0.12, drop: 0.04, sway: 0.03, roll: 0.05, nod: 0.05, headRoll: 0.06, droop: 0.4, armSwing: 0.22, elbow: 0.5, hipLean: 0.25, head: 0, neck: 0.45,
  },
  // feral sprint: flight phase, heels kicked up behind, forefoot landings
  gRun: {
    ref: 5.6, duty: 0.34, lift: 0.36, liftPow: 0.62, strike: 0.02, toeOff: -0.95, rollIn: 0.1, heelOff: 0.35, bias: -0.1, width: 0, ext: 0.99, vt: 0.8,
    pitchRate: 1.4, comp: 0.02, flight: 0.05, hipYaw: 0.2, drop: 0.04, sway: 0.015, roll: 0.03, nod: 0.1, sprint: true, asym: true, hipLean: 0.3,
  },
};

export { buildRunner as build };
