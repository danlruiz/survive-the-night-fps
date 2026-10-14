// The city's building kit. Port Calder (shared/mainland.js) says what stands on every lot - a block of storeys of
// such a style, so many of them standing whole and what is left of the rest; the room at its foot; the walls of a
// shell; a heap of what came down - and this file builds what is seen of it: walls with their window openings cut
// into them (reveals, sills, lintels, frames, glass that is whole, broken, gone or boarded), cornices and parapets,
// fins and string courses, fire escapes, balconies, drainpipes, what stands on a roof, storeys cut open on their
// slabs, columns and rooms, rubble, the lining of the rooms that can be walked into, and what the years laid on all
// of it (soot, rust, damp, ivy, paint). Everything is written straight into the static world's merged buffers
// (staticworld.js), in tiers: what is read from across the city (TIER.FAR), and what is only seen from the street
// or from in front of it (STREET, DETAIL, ROOM), so a tower costs a few thousand triangles a mile off.
//
// Frames. A building's own: x along its width, z along its depth, its front at -z (as the Builder that put it
// there: shared/worldkit.js). A face of it: s along the wall to the right as seen from outside, y up, d into the
// wall (so -d stands proud of it).
//
// The kit is in city/: what every part of it builds with (kit.js), the soup it is written into (soup.js), a building
// (building.js) and its faces (facade.js), the rooms (room.js), and what came down (ruins.js). This file builds a
// city, and the signs that stand where there is none, out of them.
import { TIER, rngOf } from './city/kit.js';
import { Soup } from './city/soup.js';
import { rubble, shell, fallen, pancake } from './city/ruins.js';
import { room } from './city/room.js';
import { building } from './city/building.js';

export { TIER } from './city/kit.js';

// ------------------------------------------------------------------ boards and marks put anywhere
// G (from the world): { x, y, z, ry, w, h, cell, back, tilt, grime }: a rectangle of the city's atlas facing -Z of
// its own frame, its middle at (x, y, z); back: a board behind it (metres thick) and posts down to `post` under it.
function sign(S, G) {
  S.frame(G.x, G.y, G.z, G.ry);
  const hw = G.w / 2, hh = G.h / 2;
  const tl = G.tilt || 0;
  const pts = [[hw, -hh + tl * hw, 0], [-hw, -hh - tl * hw, 0], [-hw, hh - tl * hw, 0], [hw, hh + tl * hw, 0]];
  const tier = G.far ? TIER.FAR : TIER.STREET;
  S.cell(G.grime ? 'citygrime' : 'citysign', tier, G.cell, pts[0], pts[1], pts[2], pts[3]);
  if (G.back) {
    const b = G.back;
    S.box('metal', tier, 0, 0, b / 2 + 0.01, G.w + 0.08, G.h + 0.08, b, { rz: -Math.atan(tl) });
    if (G.two) S.cell('citysign', tier, G.cell, [-hw, -hh - tl * hw, b + 0.02], [hw, -hh + tl * hw, b + 0.02], [hw, hh + tl * hw, b + 0.02], [-hw, hh - tl * hw, b + 0.02]);
  }
  for (const px of G.posts || []) S.bar('rust', tier, [px, -hh - (G.post || 0), 0.06], [px, hh, 0.06], 0.1);
}

// signs on their own, where there is no city (the island's AIRPORT signs: airportsigns.js)
export function buildSigns(signs, add) {
  const S = new Soup();
  for (const G of signs) {
    sign(S, G);
    S.flush(add, G.x, G.z);
  }
}

// ------------------------------------------------------------------ the city
export function buildCity(world, add) {
  const C = world.city;
  const S = new Soup();
  for (const B of C.buildings || []) {
    building(S, B);
    S.flush(add, B.x, B.z);
  }
  for (const W of C.shells || []) {
    shell(S, W);
    S.flush(add, (W.x0 + W.x1) / 2, (W.z0 + W.z1) / 2);
  }
  for (const R of C.rooms || []) {
    room(S, R);
    S.flush(add, R.x, R.z);
  }
  for (const H of C.heaps || []) {
    S.frame(H.x, H.y, H.z, H.ry || 0);
    rubble(S, 0, 0, 0, H.rx, H.rz, H.h, rngOf(H.seed), TIER.FAR, 0, H.brick ?? 0.3, !!H.ash);
    S.flush(add, H.x, H.z);
  }
  for (const T of C.fallen || []) {
    fallen(S, T);
    S.flush(add, T.x, T.z);
    S.frame(0, 0, 0, 0);
  }
  for (const P of C.pancakes || []) {
    pancake(S, P);
    S.flush(add, P.x, P.z);
  }
  for (const G of C.signs || []) {
    sign(S, G);
    S.flush(add, G.x, G.z);
  }
}
