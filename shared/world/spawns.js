// Where things turn up on the island once it is built (world.js): the forest's floor-loot spots out in the woods, the
// day-one floor loot around the car, and the ring the night horde falls back to.
import { ZONE } from '../defs.js';
import { mulberry32 } from '../rng.js';
import { SCATTER_LIM } from './vegetation.js';

const PI = Math.PI;

// (lootSpawns: the kit's list, which the ring of floor loot joins)
export function scatterSpawns({ rng, seed, car, lootSpawns, heightAt, zoneClear, inLake, occupied }) {
  const LIM = SCATTER_LIM;
  const resourceSpawns = [];
  for (let a = 0; a < 3000 && resourceSpawns.length < 130; a++) {
    const x = rng.range(-LIM + 20, LIM - 20);
    const z = rng.range(-LIM + 20, LIM - 20);
    if (zoneClear(x, z)) continue;
    if (inLake(x, z)) continue;
    if (occupied(x, z, 0.8)) continue;
    resourceSpawns.push({ x, y: heightAt(x, z) + 0.02, z, zone: ZONE.FOREST });
  }
  // day-one scavenging: floor loot (the breakdown's cloth / sticks / planks table) spread evenly by
  // angle around the car, so whichever way a survivor heads out there is torch cloth before the first
  // night. Own rng stream so the rest of the valley stays identical.
  const ringRng = mulberry32(seed ^ 0x70c4);
  const RING_SPOTS = 48;
  for (let i = 0; i < RING_SPOTS; i++) {
    for (let tries = 0; tries < 12; tries++) {
      const a = ((i + ringRng()) / RING_SPOTS) * PI * 2;
      const r = ringRng.range(30, 140);
      const x = car.x + Math.sin(a) * r;
      const z = car.z + Math.cos(a) * r;
      if (Math.abs(x) > LIM - 20 || Math.abs(z) > LIM - 20) continue;
      if (zoneClear(x, z) || inLake(x, z) || occupied(x, z, 0.8)) continue;
      lootSpawns.push({ x, y: heightAt(x, z) + 0.02, z, zone: ZONE.CAMP });
      break;
    }
  }
  // fallback horde spawn ring (the night horde normally spawns around wherever the survivors are)
  const hordeSpawns = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * PI * 2;
    for (let tries = 0; tries < 8; tries++) {
      const r = rng.range(215, 270);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x) > LIM - 10 || Math.abs(z) > LIM - 10) continue;
      if (inLake(x, z)) continue;
      hordeSpawns.push({ x, z });
      break;
    }
  }
  return { resourceSpawns, hordeSpawns };
}
