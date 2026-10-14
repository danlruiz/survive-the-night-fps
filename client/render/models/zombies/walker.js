// The walker (ZTYPE.WALKER), the rank and file of the dead: its model and how it moves (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder } from '../skinning.js';
import { walkerLook, WALKER_VARIANTS } from '../deadlooks.js';
import { humanP } from '../characters/skeleton.js';
import { standardHumanoid, exposedRibs } from './helpers.js';

export const type = ZTYPE.WALKER;
export const variants = WALKER_VARIANTS; // (deadlooks.js walkerLook)

function buildWalker(v) {
  const L = walkerLook(v);
  const f = L.sex === 'f';
  const P = humanP({ headR: f ? 0.098 : 0.102, neckLen: 0.1, ...(f ? { shoulderW: 0.172, hipW: 0.1, uarmLen: 0.28, farmLen: 0.25 } : null) });
  const mb = new MeshBuilder();
  // (the wound in the side, before the body is built: its tint goes on as the skin is made)
  if (v % 3 === 0) L.wounds = [...(L.wounds || []), [0.07, P.spineY + 0.03, -0.1, 0.06]];
  const built = standardHumanoid(mb, P, L);
  if (L.gaunt > 0.85 && !L.top) exposedRibs(mb, P, v % 2 ? 1 : -1, -0.06, 4, built);
  return { mb, P, A: L.jawHang ? { jawHang: L.jawHang } : null };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -0.6, runLean: -0.6, cycleWalk: 1.3, cycleRun: 2.0, limp: 0.65, headPitch: -0.15, headTilt: 0.28, jaw: 0.22,
  idleLean: -0.45, reachArms: true, shoulderRoll: 0.18,
  // planted-foot gait (poseGait): a hunched, lurching shamble that drags the limp leg
  gWalk: {
    ref: 1.9, duty: 0.62, lift: 0.07, strike: 0.22, toeOff: -0.55, rollIn: 0.15, heelOff: 0.62, bias: -0.03, width: 0.03, ext: 0.985, bob: 0, vault: 0.7, vt: 0.7,
    hipYaw: 0.16, drop: 0.08, hike: 0.12, sway: 0.055, roll: 0.12, nod: 0.07, headRoll: 0.18, droop: 0.1, armSwing: 0.32, elbow: 0.22, stumble: true, hipLean: 0.2,
  },
  gRun: {
    ref: 3.5, duty: 0.54, lift: 0.1, strike: 0.2, toeOff: -0.6, rollIn: 0.15, heelOff: 0.55, bias: -0.05, width: 0.03, ext: 0.98, bob: 0, vault: 0.5, vt: 0.7,
    hipYaw: 0.18, drop: 0.07, hike: 0.12, sway: 0.045, roll: 0.1, nod: 0.09, headRoll: 0.15, droop: 0.2, armSwing: 0.45, elbow: 0.3, stumble: true, hipLean: 0.2,
  },
};

export { buildWalker as build };
