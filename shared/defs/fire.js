// Fire: on the dead (BURN), on what the survivors built (STRUCT_FIRE) and on a survivor (PLAYER_FIRE).
import { STRUCT_DEFS } from './structures.js';

// Burning: a status any zombie can be given (Combat.ignite) - the flamethrower and molotov fires do. It takes `dps`
// for `time` seconds after the fire that lit it; more fire tops the time back up, it does not stack.
export const BURN = { time: 5, dps: 18 };

// A fire on what the survivors built (the flammer sets them: ZOMBIE_DEFS fireproof / igniteRange, Game.updateStructures).
// A piece that is not metal (nor a torch or a campfire, which are fires already: structBurns) burns at `dps` a second
// until it is gone or somebody puts it out with the hammer in hand (a repair: free, and that is all the swing does).
// Once it has burned `spreadAfter` s it may catch each piece within `gap` m of it, `spread` of a chance a second each.
export const STRUCT_FIRE = { dps: 25, spreadAfter: 3, spread: 0.25, gap: 0.3 };
export const structBurns = (stype) => !!STRUCT_DEFS[stype] && !STRUCT_DEFS[stype].metal && !STRUCT_DEFS[stype].burn;
// A survivor set alight by a flammer's blow burns at `dps` a second until the fire is put out - it does not go out by
// itself, and they cannot jump while it burns. Each press of [Space] beats it down (stop, drop and roll), and so does
// each press of a teammate's within `reach` m (they beat the flames out): `presses` between them put it out, and it
// creeps back `decay` of the way a second between presses. Going down, or into water deep enough to swim, puts it
// out at once (Game.updateFire)
export const PLAYER_FIRE = { dps: 5, presses: 5, reach: 2, decay: 0.3 };
