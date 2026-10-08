// What the field map [M], its key, its panel and the minimap share (issue #225): one look per kind of marker - a
// colour AND a shape, so no two are told apart by colour alone - and the words for where a thing is (how far, which
// way, which grid square: "Old Hank is down in D6").
//
// A badge is <i class="mk k-KIND">: the same element on the map, in the key, in a row of the panel, on a chip, on an
// edge pin and on the minimap's rim, so whatever the key shows is what the map draws.
//   you    red disc, an arrow             mate   navy disc, the mate's initial      down   red disc, a fallen figure
//   car    black square, the car / plane  part   orange square, the supply          crate  red triangle (supply drop)
//   sup    orange dashed ring (a supply is rumoured to be in that place)     schem  blue dashed ring (a schematic)
//   ping   a pin: green go / red danger / gold loot                          bench  green square, a wrench
//   way    purple ring, a flag (yours)    teamway teal flag (a teammate's)     veh    blue square (the mainland)
import { el } from './dom.js';

export const GRID = 80; // m: a grid square of the survey (mapcanvas.js draws its lines)
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const PING_WORD = ['Go here', 'Danger', 'Loot']; // (PING_KIND: GO, DANGER, LOOT)

// a badge of a kind; icon: trusted SVG markup (a glyph or an item's icon), or plain text (a mate's initial)
export function badge(kind, icon, parent) {
  const b = el('i', 'mk k-' + kind, parent);
  setBadge(b, kind, icon);
  return b;
}

// (cheap to call every frame: it only writes what changed)
export function setBadge(b, kind, icon) {
  if (b._k !== kind) {
    b.className = 'mk k-' + kind;
    b._k = kind;
  }
  if (b._i !== icon) {
    b._i = icon;
    if (icon && icon.charCodeAt(0) === 60) b.innerHTML = icon; // '<': our own SVG
    else b.textContent = icon || '';
  }
}

// a teammate's initial for their badge (user text: only ever set as text)
export const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

// "115 m", "1.2 km"
export const fmtDist = (d) => (d >= 995 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m');

// which way (dx, dz) is from you, as a compass point (north is -z)
export const dirOf = (dx, dz) => DIRS[(((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8)];

// the grid square a spot is in: a letter across (west to east), a number down (north to south), as on the map's edges
export function gridRef(world, x, z) {
  const n = Math.max(1, Math.round(world.size / GRID));
  const c = Math.max(0, Math.min(n - 1, Math.floor((x + world.half) / GRID)));
  const r = Math.max(0, Math.min(n - 1, Math.floor((z + world.half) / GRID)));
  return LETTERS[c] + (r + 1);
}
export const gridLetter = (i) => LETTERS[i] || '';

// the place a spot is in or beside (for "Marlowe · Route 9 Gas Station"), or null out in the open
export function placeAt(world, x, z, reach = 24) {
  let best = null;
  let bd = Infinity;
  for (const zn of world.zones) {
    const d = Math.hypot(x - zn.x, z - zn.z) - (zn.flat || 20);
    if (d < reach && d < bd) {
      bd = d;
      best = zn;
    }
  }
  return best;
}
