// What the dead's AI shares between server/zombies.js and the specials' own modules (server/specials/*.js)
import { CRAWL_HEIGHT } from '../../shared/constants.js';

export const GRAV = 16;

// how tall it stands, or lies: what its reach is measured from
export function bodyHeight(z) {
  return z.legs === 3 ? CRAWL_HEIGHT : z.def.height;
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
