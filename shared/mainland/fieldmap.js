// What the mainland's field map shows (mainland.js; client/ui/mapmainland.js draws it).
import { ZONE } from '../defs.js';
import { PLACES } from '../mainland-layout.js';
import { HALF, FX, P } from './consts.js';

// Where the field map writes each place's name (the picture's own spots for them, clear of the roads and of each
// other: label, the middle of the name), which names are of lesser places (minor: smaller letters), which of what is
// named inside the city (city: written only when the map is zoomed in), and the picture's marks (marks: the town, the
// church, the industry, the gas station, the airport, the camps, the tunnels' and the mines' mouths, the quarry, the
// lighthouse, the radio tower and the water tower: client/ui/mapmainland.js).
// Sets each place's label and minor, and each landmark's city; returns the marks: [{ kind, x, z }]
export function mapMainland({ plan, PIT, landmarks, mine }) {
  const { city, inCity, tunnels, camps, zones, zoneById } = plan;
  const LABEL = {
    [ZONE.BRIDGEHEAD]: [0.178, 0.418],
    [ZONE.INDUSTRIAL]: [0.232, 0.59],
    [ZONE.SUBURB]: [0.458, 0.336],
    [ZONE.WESTGATE]: [0.487, 0.538],
    [ZONE.NORTH_COAST]: [0.242, 0.15],
    [ZONE.TRUCKSTOP]: [0.568, 0.6],
    [ZONE.OUTPOST]: [0.922, 0.188],
    [ZONE.AGGREGATES]: [0.603, 0.858],
    [ZONE.PASSAGE]: [0.846, 0.754],
    [ZONE.SOUTH_FOREST]: [0.54, 0.752],
    [ZONE.LIGHTHOUSE]: [0.108, 0.702],
    [ZONE.CITY]: [0.346, 0.43],
  };
  const MINOR = [ZONE.BRIDGEHEAD, ZONE.LIGHTHOUSE, ZONE.MARINA, ZONE.LOGGING, ZONE.FIREHOUSE, ZONE.TERMINAL, ZONE.HANGARS, ZONE.FUEL_DEPOT];
  for (const zn of zones) {
    if (LABEL[zn.id]) zn.label = P(LABEL[zn.id]);
    if (MINOR.includes(zn.id)) zn.minor = true;
  }
  // (the airport's three: inside its fence, clear of each other and of the map's edge)
  for (const [id, dx, dz] of [[ZONE.TERMINAL, 0, -16], [ZONE.HANGARS, -30, 26], [ZONE.FUEL_DEPOT, -50, 16]]) {
    const zn = zoneById[id];
    zn.label = [Math.min(zn.x + dx, HALF - 110), zn.z + dz];
  }
  zoneById[ZONE.FIREHOUSE].label = [zoneById[ZONE.FIREHOUSE].x + 34, zoneById[ZONE.FIREHOUSE].z + 18];
  for (const m of landmarks) if (inCity(m.x, m.z, 12)) m.city = true;
  // (what the picture names that is no place: the passes where it writes them, the airport over its field)
  for (const m of landmarks) {
    if (m.name === 'North Pass') m.label = P([0.745, 0.136]);
    if (m.name === 'East Pass') m.label = P([0.808, 0.487]);
  }
  landmarks.push({ x: FX(0.94), z: FX(0.535), name: 'Airport', big: true });
  const marks = [];
  const zp = (id) => zoneById[id];
  // (on Main Street in the middle of the square, just south of the town hall: the badge is wider than the hall, and on
  // it, as the picture has it, it hid the hall's footprint; here the hall's front is its edge and the fountain's ring
  // of trees clear of it)
  marks.push({ kind: 'town', x: city.x, z: city.z + 4 });
  marks.push({ kind: 'church', ...(([x, z]) => ({ x, z }))(P([0.183, 0.128])) });
  marks.push({ kind: 'industrial', x: zp(ZONE.INDUSTRIAL).x + 10, z: zp(ZONE.INDUSTRIAL).z - 6 });
  marks.push({ kind: 'gas', x: zp(ZONE.TRUCKSTOP).x + 26, z: zp(ZONE.TRUCKSTOP).z - 4 });
  marks.push({ kind: 'airport', x: FX(0.94), z: FX(0.505) });
  for (const [x, z] of [[zp(ZONE.SOUTH_FOREST).x, zp(ZONE.SOUTH_FOREST).z], ...camps]) marks.push({ kind: 'tent', x, z });
  for (const t of tunnels) {
    if (t.s0 === undefined) continue;
    for (const s of [t.s0, t.s1]) marks.push({ kind: 'tunnel', x: t.a[0] + t.dx * s, z: t.a[1] + t.dz * s });
  }
  if (mine) for (const p of mine.portals) marks.push({ kind: 'mine', x: p.x, z: p.z });
  for (const [x, z] of [P(PLACES.mineA), [zp(ZONE.PASSAGE).x + 6, zp(ZONE.PASSAGE).z - 22]]) marks.push({ kind: 'mine', x, z });
  marks.push({ kind: 'pit', x: PIT.x, z: PIT.z, r: PIT.r, floor: PIT.floor, steps: PIT.steps });
  marks.push({ kind: 'quarry', x: zp(ZONE.AGGREGATES).x + 30, z: zp(ZONE.AGGREGATES).z + 30 });
  marks.push({ kind: 'lighthouse', x: zp(ZONE.LIGHTHOUSE).x, z: zp(ZONE.LIGHTHOUSE).z });
  marks.push({ kind: 'tower', x: zp(ZONE.OUTPOST).x - 6, z: zp(ZONE.OUTPOST).z - 18 });
  marks.push({ kind: 'watertower', x: zp(ZONE.OUTPOST).x + 12, z: zp(ZONE.OUTPOST).z - 22 });
  return marks;
}
