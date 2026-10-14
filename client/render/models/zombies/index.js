// Every kind of the dead the client draws on the humanoid rig has its own module here, the client twin of
// server/specials/: its model (build), how it moves (style), and whatever it does that no other kind does - its windup
// (special, posed over its idle when specialFromIdle), its swing (attack), the throb of what glows on it (glow), a pose
// of its own (pose: the bat) - plus how many looks it comes in (variants) and whether its height is measured on its run
// (calibrateRun). The kinds on the dog's rig are in dogs.js. This gathers them into the tables characters/ reads.
// Which kinds have a far copy is on each kind's row (ZOMBIE_DEFS lod).
import { ZTYPE, ZOMBIE_DEFS } from '../../../../shared/defs.js';
import { DOG_VARIANTS } from './dogs.js';
import * as walker from './walker.js';
import * as runner from './runner.js';
import * as tank from './tank.js';
import * as spitter from './spitter.js';
import * as leaper from './leaper.js';
import * as roper from './roper.js';
import * as boomer from './boomer.js';
import * as bat from './bat.js';
import * as abomination from './abomination.js';
import * as hivequeen from './hivequeen.js';
import * as shade from './shade.js';
import * as brute from './brute.js';
import * as bloater from './bloater.js';
import * as smoker from './smoker.js';
import * as screecher from './screecher.js';
import * as flammer from './flammer.js';
import * as mother from './mother.js';
import * as baby from './baby.js';

const KINDS = { walker, runner, tank, spitter, leaper, roper, boomer, bat, abomination, hivequeen, shade, brute, bloater, smoker, screecher, flammer, mother, baby };

export const BUILDERS = {}; // ztype -> (variant) => { mb, P, A }
export const STYLES = {}; // ztype -> how it moves (z.st)
export const VARIANTS = { ...DOG_VARIANTS }; // ztype -> how many looks (1 when unset)
export const ATTACKS = {}; // ztype -> (z, p, u): its swing, u the swing's progress 0..1
export const SPECIALS = {}; // ztype -> (z, p): its windup
export const SPECIAL_FROM_IDLE = new Set(); // ...posed over its idle pose
export const GLOWS = {}; // ztype -> (time, off): what the glow on it is multiplied by
export const POSES = {}; // ztype -> (z): it poses itself (not poseHumanoid)
export const CALIBRATE_RUN = new Set(); // its head height is measured on its run, not its walk

for (const [name, k] of Object.entries(KINDS)) {
  const t = k.type;
  if (BUILDERS[t]) throw new Error(`zombies/${name}.js: ztype ${t} is already taken`);
  BUILDERS[t] = k.build;
  if (k.style) STYLES[t] = k.style;
  if (k.variants) VARIANTS[t] = k.variants;
  if (k.attack) ATTACKS[t] = k.attack;
  if (k.special) SPECIALS[t] = k.special;
  if (k.specialFromIdle) SPECIAL_FROM_IDLE.add(t);
  if (k.glow) GLOWS[t] = k.glow;
  if (k.pose) POSES[t] = k.pose;
  if (k.calibrateRun) CALIBRATE_RUN.add(t);
}

// (types whose far copy is worth having: everything people.js builds whole)
export const LOD_TYPES = new Set(Object.values(ZTYPE).filter((t) => ZOMBIE_DEFS[t].lod)); // (each kind's row's lod: shared/defs/zombies.js)
