// What flies (PROJ: the dead's spit and rope, what the survivors throw and fire) and what lingers where it landed
// (AREA). Numeric ids are part of the wire protocol - do not renumber.
import { ITEM } from './itemdefs.js';
import { uniqueIds } from '../ids.js';

export const PROJ = uniqueIds('PROJ', {
  ACID: 1,
  ROPE: 2,
  MOLOTOV: 3,
  PIPEBOMB: 4,
  ROCK: 5,
  FLARE: 6, // road flare: lands and burns (light)
  GRENADE: 7, // frag grenade: bounces, rolls, bursts on its fuse
  DECOY: 8, // noisemaker: lands and rings, luring the dead
  ROCKET: 9, // an RPG grenade in flight: bursts on impact
  SKYFLARE: 10, // a flare gun's parachute flare: climbs, opens its chute, drifts down burning (shared/skyflare.js)
});
// the item each thrown projectile is (THROWABLES holds its numbers)
export const PROJ_ITEM = { [PROJ.MOLOTOV]: ITEM.MOLOTOV, [PROJ.PIPEBOMB]: ITEM.PIPEBOMB, [PROJ.FLARE]: ITEM.FLARE, [PROJ.GRENADE]: ITEM.GRENADE, [PROJ.DECOY]: ITEM.DECOY };
export const AREA = uniqueIds('AREA', {
  ACID: 1,
  FIRE: 2,
  SMOKE: 3, // a smoker's cloud: nothing but what it hides (shared/smoke.js)
});
