// Procedural zombie + survivor characters.
// Every character is ONE SkinnedMesh (one draw call) with rigid skinning. Geometry/material are shared
// per type+variant; each instance owns only its Skeleton + bones. Animation is fully procedural and
// writes bone rotations; state changes crossfade from a pose snapshot.
//
// This is the door the game comes in by; the work is done in:
//   characters/skeleton.js     the humanoid rig's bones and proportions
//   characters/posekit.js      the pieces a pose is written with
//   characters/pose.js         how the humanoid dead move (and a survivor turned)
//   characters/gait.js         ...their planted feet
//   characters/zombie.js       a zombie's rig cache, calibration and instance (ZombieInstance)
//   characters/survivorrig.js  a survivor's models, built once and kept
//   characters/survivor.js     a survivor's instance (SurvivorInstance)
//   zombies/<kind>.js          each kind's model, style of moving, windup and swing (gathered by zombies/index.js)
import { dogStats } from './dog.js';
import { zombieStats } from './characters/zombie.js';
import { survivorStats } from './characters/survivorrig.js';
// (for the sandboxes, which must not import shared/appearance.js themselves: they are lent to older trees)
export { lookKey, randomLook, mulberry } from '../../../shared/appearance.js';
export { setZombieViewer } from './characters/pose.js';
export { zombieModelOf, zombieVariants, createZombie, debugRig } from './characters/zombie.js';
export { createSurvivor, setCradle, setStockPocket } from './characters/survivor.js';
export { evictLooks, lookWarm, warmLook, SURVIVOR_LOOKS, warmSurvivor } from './characters/survivorrig.js';

/** Debug info for the sandbox: triangle counts + calibration per type/variant. */
export function modelStats() {
  return [...zombieStats(), ...dogStats(), ...survivorStats()];
}
