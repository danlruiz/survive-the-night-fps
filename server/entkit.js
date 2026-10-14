// What the world's entities and side systems share on the server (the deer, the cat, the vehicles, the handcars, the
// fair, the mounted gun, the bell and the radio, the cemetery, the clinic's wards, the generators): a module's own
// random stream in the game's place, how a survivor's hands and arms are taken up, how far [E] reaches a moving seat,
// putting a survivor somewhere (the admin commands), and how an animal on foot moves.
import { INTERACT_REACH, INTERACT_SLACK, EYE_HEIGHT, SLOT_BUILD, SLOT_THROW, SLOT_RADIO, SLOT_PRIMARY, SLOT_PISTOL, SLOT_MELEE } from '../shared/constants.js';
import { canReach, groundAt } from '../shared/collision.js';
import { eyeHeight } from '../shared/playersim.js';
import { swimming } from '../shared/swim.js';

const TAU = Math.PI * 2;
const GRAV = 16;

// head, chest, shins: where a light on a zombie's body counts (as Zombies.isLit's: light on any of them pins a Shade)
export const BODY_AT = [0.9, 0.55, 0.2];

// Lays a module's methods onto a class, as if they had been written in it (not enumerable, like a class's own), the way
// server/specials does onto Zombies. Two modules giving the same name is a mistake, not an override.
export function addMethods(cls, methods) {
  for (const [k, v] of Object.entries(methods)) {
    if (k in cls.prototype) throw new Error(`${cls.name}.${k} is defined twice`);
    Object.defineProperty(cls.prototype, k, { value: v, writable: true, configurable: true });
  }
}

// ---------------------------------------------------------------- random streams
// fn() run with `rng` in the game's place (game.rng): for the calls into the game that draw from its stream (a noise's
// scatter, where a drop lands, a zombie's looks), so that a system with a stream of its own never moves what the rest
// of a seeded run rolls. Returns what fn does.
export function withRng(g, rng, fn) {
  const own = g.rng;
  g.rng = rng;
  try {
    return fn();
  } finally {
    g.rng = own;
  }
}

// ---------------------------------------------------------------- a survivor's hands and arms
// [E] is taken at most once every `gap` seconds from a survivor (p.interactT): false when it is too soon, else it is
// taken now
export function interactReady(g, p, gap = 0.15) {
  if (g.time - p.interactT < gap) return false;
  p.interactT = g.time;
  return true;
}

// on a ride or a handcar, held by a leaper or a rope, or arms full of the mounted gun: they cannot get on anything else
export function boardBlocked(s) {
  return !!(s.ride || s.cart || s.pinned || s.pulled || s.hmg);
}

// can survivor p carry something in their arms (the cat, the mounted gun)? Alive, a survivor, on their feet, held by
// nothing, on no ride or handcar, not swimming
export function canCarry(p, world) {
  const s = p.state;
  return p.alive && !p.zombie && !p.downed && !s.pinned && !s.pulled && !s.ride && !s.cart && !swimming(world, s);
}

// something has just been taken up in the arms of the survivor whose state is s: a reload or a kick under way is over,
// and a hammer, a throwable or the walkie-talkie in the hand (which would still have the mouse) goes back to a weapon
export function freeHands(s) {
  s.reloadT = 0;
  s.recoil = 0;
  if (s.slot === SLOT_BUILD || s.slot === SLOT_THROW || s.slot === SLOT_RADIO) s.slot = s.weapons[SLOT_PRIMARY] ? SLOT_PRIMARY : s.weapons[SLOT_PISTOL] ? SLOT_PISTOL : SLOT_MELEE;
}

// Does the survivor whose state is s reach a seat on the move at (x, y, z) - the middle of its pick, of radius r - as
// the client offered [E] on it, `slack` m further out for where it was drawn a moment ago, with no wall in the way?
export function reachesSeat(world, s, x, y, z, r, slack) {
  const ey = s.y + eyeHeight(s);
  if (Math.hypot(x - s.x, y - ey, z - s.z) > Math.hypot(INTERACT_REACH, r) + INTERACT_SLACK + slack) return false;
  return canReach(world, s.x, ey, s.z, x, y, z, s.y + EYE_HEIGHT);
}

// Survivor p put at (x, z), on whatever is highest under `fromY` there, standing still (the admin commands' teleports)
export function putPlayer(g, p, x, z, fromY = 200) {
  const s = p.state;
  s.x = x;
  s.z = z;
  s.y = groundAt(g.world, x, z, fromY, 0.3);
  s.vx = s.vy = s.vz = 0;
  g.fillHistory(p);
}

// ---------------------------------------------------------------- an animal on foot (the deer, the cat)
// heading a turned towards b, by at most max (rad)
export function turnToward(a, b, max) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + Math.max(-max, Math.min(max, d));
}

// its velocity eased towards (dvx, dvz): at `fast` per second when that is a run (over 3 m/s), else at `slow`
export function easeVelocity(e, dvx, dvz, dt, fast, slow) {
  const accel = Math.min(1, dt * (Math.hypot(dvx, dvz) > 3 ? fast : slow));
  e.vx += (dvx - e.vx) * accel;
  e.vz += (dvz - e.vz) * accel;
  if (Math.abs(e.vx) < 1e-3 && Math.abs(e.vz) < 1e-3) e.vx = e.vz = 0;
}

// Where it is stepping to (pos, at height y) moved round every survivor nearer than `min` to it. Players are never
// pushed: their prediction stays exact.
export function keepOffSurvivors(pos, y, min, humans) {
  for (const h of humans) {
    const ddx = pos.x - h.state.x;
    const ddz = pos.z - h.state.z;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 < min * min && Math.abs(h.state.y - y) < 1.8) {
      const d = Math.sqrt(d2) || 0.01;
      pos.x = h.state.x + (ddx / d) * min;
      pos.z = h.state.z + (ddz / d) * min;
    }
  }
}

// a sidestep round what holds it up while it heads along (dx, dz): to one side or the other, a little onwards (`on`),
// for t to 2t seconds
export function sidestep(e, rng, dx, dz, t, on) {
  const side = rng() < 0.5 ? 1 : -1;
  e.detourT = t + rng() * t;
  e.detourX = -dz * side + dx * on;
  e.detourZ = dx * side + dz * on;
}

// down onto the ground at height gy: falling while it is over it, on it otherwise
export function settleOnGround(e, gy, dt) {
  if (e.y > gy + 0.05) {
    e.vy -= GRAV * dt;
    e.y = Math.max(gy, e.y + e.vy * dt);
    if (e.y <= gy) e.vy = 0;
  } else {
    e.y = gy;
    e.vy = 0;
  }
}

