// Co-op roles (#276): what each perk branch lets a survivor do for the team, that the team can see and count on.
// The perks themselves (progress.js) are numbers only their owner feels; a role is the part teammates notice. A
// survivor holds a branch's role once they have taken a Tier 2 perk in it (ROLE_TIER), so a role is a choice: ten
// perk points cover at most five Tier 2 perks, and a new player has their first one at level 6.
//
//   Guardian (Survivor)  a downed teammate within GUARD.range of them stops bleeding out
//   Spotter  (Gunner)    their danger ping marks one of the dead: everyone else hits it MARK.hurt harder
//   Scout    (Scavenger) a car supply still in its hiding place within SCOUT.range of them is pinned on the team's compass
//   Medic    (Support)   teammates within MEDIC.range of them (and they) revive MEDIC.revive the time
//   Runner   (Movement)  crouch and [E] on a downed teammate: drag them along, at DRAG.pace, until [E] again
//
// The Spotter's mark and the Runner's drag each need two survivors acting together: one marks and the others shoot,
// one drags and the others cover. Every role shows over its holder's head and in the player list (client), so a
// team knows who to call for. All numbers are first guesses. scripts/test-roles.js holds the rules.
import { PERKS } from './progress.js';

// role ids are the perk branches' groups (progress.js PERK_GROUPS 0..4), in that order
export const ROLE = { GUARDIAN: 0, SPOTTER: 1, SCOUT: 2, MEDIC: 3, RUNNER: 4 };
export const ROLE_TIER = 1; // a perk of this tier (progress.js: Tier 2) in a branch gives its role
// icon: a glyph of client/ui/icons.js
export const ROLES = [
  { id: ROLE.GUARDIAN, name: 'Guardian', icon: 'shield', text: 'A downed teammate near you stops bleeding out' },
  { id: ROLE.SPOTTER, name: 'Spotter', icon: 'ping', text: 'Your danger ping marks one of the dead: your team hits it 25% harder' },
  { id: ROLE.SCOUT, name: 'Scout', icon: 'search', text: "Car supplies hidden near you show on the team's compass" },
  { id: ROLE.MEDIC, name: 'Medic', icon: 'cross', text: 'Teammates near you revive 25% faster' },
  { id: ROLE.RUNNER, name: 'Runner', icon: 'arrowRight', text: 'Crouch and press [E] on a downed teammate to drag them to safety' },
];

export const GUARD = { range: 3.5 }; // m between the Guardian (on their feet) and the downed teammate
export const MEDIC = { range: 10, revive: 0.75 }; // m; a revive's time is multiplied by this (once, however many Medics)
// MARK: a mark lasts `time` s; the ping must land within `range` m of the one it marks; `hurt`: damage from anyone but
// the Spotter who placed it is multiplied by this
export const MARK = { time: 10, range: 2.5, hurt: 1.25 };
export const SCOUT = { range: 25, every: 0.5 }; // m to the hiding place; s between looks
// DRAG: the Runner's every pace is multiplied by `pace` while dragging (the one dragged is pulled along at 4.4 m/s,
// playersim's pull, so this keeps a sprint under it); the grip is lost past `slip` m
export const DRAG = { pace: 0.55, slip: 4.5 };

// the tier-2 perk ids of each branch
const KEYS = ROLES.map((r) => PERKS.filter((p) => p.group === r.id && p.tier >= ROLE_TIER && p.tier < 3).map((p) => p.id));

// The roles a set of perks (a mask of ids, as s.perks) holds: a bitmask of ROLE ids
const cache = new Map();
export function rolesOf(perks) {
  perks >>>= 0;
  let m = cache.get(perks);
  if (m !== undefined) return m;
  m = 0;
  KEYS.forEach((ids, r) => {
    if (ids.some((id) => perks & (1 << id))) m |= 1 << r;
  });
  cache.set(perks, m);
  return m;
}

export const hasRole = (perks, role) => (rolesOf(perks) & (1 << role)) !== 0;
export const roleList = (perks) => ROLES.filter((r) => rolesOf(perks) & (1 << r.id));
