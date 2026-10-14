// Every special kind of the dead has its own module here, holding its numbers and what it does. Zombies
// (server/zombies.js) keeps the shared mechanics (moving, melee, the windup and the flight every special uses) and
// dispatches to these through these tables:
//   triggers[ztype](z, target, tx, ty, tz, dist): may it start its special now (Zombies.windup)? true if it did
//   acts[stateAct](z, target, tx, ty, tz, dist): what it does once the windup is over (Zombies.fireSpecial)
//   states[state](z, dt, target, tx, ty, tz, dist): a special state of its own that takes over its tick (Zombies.special)
//   moves[ztype](z, dt, target, tx, ty, tz, dist): a way of getting about of its own that may take over its tick while
//     it has no special going (a crawler's trees; Zombies.special): true if it did
//   aims[stateAct](z, dt): where it turns through the windup of that act, if not to its prey (a dog squaring up to the
//     piece it rams; Zombies.special)
//   chases[ztype](z, tx, tz, dist, out): how it comes at its prey, dist m off at (tx, tz), if not straight in (a
//     spitter keeps its distance; Zombies.updateOne): its pace x, with the way it goes written in out; 0 to come on
//   nears[ztype](z, target, dist): what it may set off with its prey dist m off, once it has squared up to strike (a
//     boomer swells up beside them; Zombies.updateOne)
//   steps[ztype](z, dt, dist, moveSpeed): what it may set off once it has taken its step (a boomer held up by what
//     was built bursts against it; Zombies.updateOne)
//   releases[ztype](z, p): what it does once it lets go of (or is torn off) p, whom it had pinned or roped (a crawler
//     off a face runs for a tree; Zombies.releaseLink)
//   spots[ztype]: a spot on its body of its own that a bullet can strike (the Mother's belly; Zombies.spotHit):
//     at(z, pos, x, y, zz): did a bullet that struck its body (not its head nor a leg) at (x, y, zz), its feet at pos,
//     go in there? struck(z, by, dirX, dirZ): what that does, once the bullet's damage is dealt (Combat.fire)
//   deaths[ztype](z, attacker, opts, sunKill): what it does as it dies, once its loot is down (Zombies.dies, from
//     Combat.killZombie: a smoker's last breath, a boomer's blast)
// and one list:
//   bursts: the kinds whose body bursts as they die, however they are killed (Zombies.bursts: the boomer)
// A module's methods are laid onto Zombies, so they are called on it as this.name(...) like any of its own.
import { addMethods } from './util.js';
// To add a special: a new file here, and its line in each of the two lists below (kept in file-name order, so two new
// kinds only meet on a line when their names sort next to each other).
import * as bat from './bat.js';
import * as boomer from './boomer.js';
import * as bosses from './bosses.js';
import * as crawler from './crawler.js';
import * as dog from './dog.js';
import * as flammer from './flammer.js';
import * as leaper from './leaper.js';
import * as mother from './mother.js';
import * as roper from './roper.js';
import * as screecher from './screecher.js';
import * as shade from './shade.js';
import * as smoker from './smoker.js';
import * as spitter from './spitter.js';
import * as tank from './tank.js';

const KINDS = {
  bat,
  boomer,
  bosses,
  crawler,
  dog,
  flammer,
  leaper,
  mother,
  roper,
  screecher,
  shade,
  smoker,
  spitter,
  tank,
};

export const TRIGGERS = {};
export const ACTS = {};
export const STATES = {};
export const MOVES = {};
export const AIMS = {};
export const CHASES = {};
export const NEARS = {};
export const STEPS = {};
export const RELEASES = {};
export const SPOTS = {};
export const DEATHS = {};
export const BURSTS = new Set();

for (const [name, k] of Object.entries(KINDS)) {
  for (const [table, into] of [
    [k.triggers, TRIGGERS],
    [k.acts, ACTS],
    [k.states, STATES],
    [k.moves, MOVES],
    [k.aims, AIMS],
    [k.chases, CHASES],
    [k.nears, NEARS],
    [k.steps, STEPS],
    [k.releases, RELEASES],
    [k.spots, SPOTS],
    [k.deaths, DEATHS],
  ]) {
    for (const [key, fn] of Object.entries(table || {})) {
      if (into[key]) throw new Error(`specials/${name}.js: ${key} is already taken`);
      into[key] = fn;
    }
  }
  for (const t of k.bursts || []) BURSTS.add(t);
}

export function installSpecials(cls) {
  for (const k of Object.values(KINDS)) if (k.methods) addMethods(cls, k.methods);
}
