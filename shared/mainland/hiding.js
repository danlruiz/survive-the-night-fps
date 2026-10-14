// Hiding places for the plane's parts besides their own set places (HIDE in acts.js), so each run deals its parts
// round the whole map (Game.placeSupplies): floor loot points of every place but the bridgehead and the lighthouse's
// islet, on the ground or a floor that runs on round them, with nothing solid at their height for HIDE_ROOM (the
// propeller is 2 m across) or HIDE_ROOM_SMALL. At most HIDES of each kind a place, HIDE_APART m apart. They take
// nothing from the seed's draws, so nothing else on it moves.
import { ZONE } from '../defs.js';
import { COL, footprintContains } from '../collision.js';
import { HIDE } from '../acts.js';

const HIDE_ROOM = 1;
const HIDE_ROOM_SMALL = 0.4;
const HIDES = 2;
const HIDE_APART = 6;

// adds them to partSpots, as { x, y, z, zone, supply: HIDE.ANY or HIDE.SMALL }
export function hidingPlaces({ lootSpawns, partSpots, staticGrid, heightAt, zoneById }) {
  const solid = (c) => !(c.flags & COL.NOBLOCK);
  const restsOn = (l, r, near) => {
    const tops = near.filter((c) => solid(c) && c.y1 > l.y - 0.3 && c.y1 < l.y + 0.05);
    if (!tops.some((c) => footprintContains(c, l.x, l.z, 0))) return l.y - heightAt(l.x, l.z) < 0.3;
    return [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => tops.some((c) => footprintContains(c, l.x + dx, l.z + dz, 0)));
  };
  const room = (l, r, near) => !near.some((c) => solid(c) && c.y0 < l.y + 0.45 && c.y1 > l.y + 0.05 && footprintContains(c, l.x, l.z, r));
  const counts = new Map();
  const taken = partSpots.slice();
  for (const l of lootSpawns) {
    if (l.zone === ZONE.BRIDGEHEAD || l.zone === ZONE.LIGHTHOUSE || !zoneById[l.zone]) continue;
    if (taken.some((o) => Math.hypot(o.x - l.x, o.z - l.z) < HIDE_APART)) continue;
    const near = staticGrid.query(l.x, l.z, HIDE_ROOM + 2, []);
    const kind = restsOn(l, HIDE_ROOM, near) && room(l, HIDE_ROOM, near) ? HIDE.ANY : restsOn(l, HIDE_ROOM_SMALL, near) && room(l, HIDE_ROOM_SMALL, near) ? HIDE.SMALL : 0;
    const key = `${l.zone}:${kind}`;
    if (!kind || (counts.get(key) || 0) >= HIDES) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
    const sp = { x: l.x, y: l.y, z: l.z, zone: l.zone, supply: kind };
    partSpots.push(sp);
    taken.push(sp);
  }
}
