// What the dead's AI shares between server/zombies.js and the specials' own modules (server/specials/*.js)
import { CRAWL_HEIGHT } from '../../shared/constants.js';
import { raycastWorld, footprintContains, COL } from '../../shared/collision.js';

export const GRAV = 16;
const _strike = { t: -1, col: null, terrain: false };

// how tall it stands, or lies: what its reach is measured from
export function bodyHeight(z) {
  return z.legs === 3 ? CRAWL_HEIGHT : z.def.height;
}

// how far the nearest of these survivors is from (x, z), along the ground (m; Infinity with none)
export function nearestHuman(humans, x, z) {
  let md = Infinity;
  for (const h of humans) md = Math.min(md, Math.hypot(h.state.x - x, h.state.z - z));
  return md;
}

// is any of these survivors within r m of (x, z), along the ground?
export function humanWithin(humans, x, z, r) {
  return humans.some((h) => Math.hypot(h.state.x - x, h.state.z - z) < r);
}

// how high above a survivor's feet the dead strike at them: the chest, lower when they crouch, lower still when down
export const strikeHeight = (s) => (s.downed ? 0.3 : s.crouch ? 0.6 : 0.9);

// does nothing stop a blow at (x, z) where the line to it struck c (null: nothing did)? A survivor standing in a gate or
// the door boards they are squeezing through (HUMANPASS) is still in reach
export const passesTo = (c, x, z) => !c || !!(c.flags & COL.HUMANPASS && footprintContains(c, x, z));

// Is the line of a blow from (ox, oy, oz) to (tx, ty, tz) open: nothing solid in between, barricades and boarded doors
// included (passesTo)? Terrain is not in the way, so a bump in the ground never shields a downed survivor. The rule
// the dead strike by (Zombies.canReach), and a player-zombie's claws (Combat.meleeClear)
export function strikeOpen(world, ox, oy, oz, tx, ty, tz) {
  let dx = tx - ox;
  let dy = ty - oy;
  let dz = tz - oz;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  raycastWorld(world, ox, oy, oz, dx, dy, dz, l, _strike);
  return passesTo(_strike.col, tx, tz);
}

export function turn(a, b, maxStep) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep;
  if (d < -maxStep) d = -maxStep;
  return a + d;
}

// Lays a special's methods onto the Zombies class, as if they had been written in it (not enumerable, like a class's
// own). Two modules giving the same name is a mistake, not an override.
export function addMethods(cls, methods) {
  for (const [k, v] of Object.entries(methods)) {
    if (k in cls.prototype) throw new Error(`Zombies.${k} is defined twice`);
    Object.defineProperty(cls.prototype, k, { value: v, writable: true, configurable: true });
  }
}
