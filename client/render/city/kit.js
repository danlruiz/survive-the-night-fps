// What every part of the city's building kit (citykit.js) builds with: the tiers, the numbers that are the same on
// every client, a face of a building and the walls, boxes and decals laid on one, the styles and their colours.

// (DETAIL: the fine things of a face, seen from near only. ROOM: what is inside a room that is walked into - its
// lining, its doors, what hangs on its walls - seen from nearer still: from across the street, not from the next
// block. Neither casts a shadow.)
export const TIER = { FAR: 0, STREET: 1, DETAIL: 2, ROOM: 3 };
export const PI = Math.PI;
export const WHITE = [1, 1, 1];
export const CEIL_N = [0.62, -0.35, 0.7];
export const PLASTER_CEIL_N = [0.62, 0, 0.78]; // (a plastered ceiling takes the light as the walls under it do)

// a number in 0..1 from up to four integers: the same on every client, whatever was drawn before it
export const hash = (a, b = 0, c = 0, d = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647) + Math.imul(d | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const rngOf = (seed) => {
  let a = (Math.imul(seed | 0, 2654435761) + 1013904223) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ------------------------------------------------------------------ a face of a building
// The face of the box [x0, x1] x [z0, z1] whose outward normal is (nx, nz): where its left end is (seen from
// outside), which way it runs, how long it is.
export function faceOf(x0, x1, z0, z1, nx, nz) {
  const tx = nz, tz = -nx;
  const ax = tx > 0 ? x0 : tx < 0 ? x1 : nx > 0 ? x1 : x0;
  const az = tz > 0 ? z0 : tz < 0 ? z1 : nz > 0 ? z1 : z0;
  return { ax, az, tx, tz, nx, nz, len: tx ? x1 - x0 : z1 - z0 };
}
export const FACES = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // front, right, back, left (their outward normals)
// The same wall of that box seen from inside it: its normal points into the box.
export function innerFace(x0, x1, z0, z1, nx, nz) {
  const tx = -nz, tz = nx;
  const ax = tx > 0 ? x0 : tx < 0 ? x1 : nx > 0 ? x1 : x0;
  const az = tz > 0 ? z0 : tz < 0 ? z1 : nz > 0 ? z1 : z0;
  return { ax, az, tx, tz, nx: -nx, nz: -nz, len: tx ? x1 - x0 : z1 - z0 };
}
// a point of a face: s along it, y up, d into the wall
export const fp = (F, s, y, d = 0) => [F.ax + F.tx * s - F.nx * d, y, F.az + F.tz * s - F.nz * d];

// a rectangle of a face, flat on it at depth d: the wall itself (u in metres along the building, v the height)
export function wallQuad(S, F, mat, tier, s0, s1, y0, y1, d = 0, col = WHITE) {
  if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
  const u = F.u0 || 0;
  S.quad(mat, tier, fp(F, s0, y0, d), fp(F, s1, y0, d), fp(F, s1, y1, d), fp(F, s0, y1, d), [[u + s0, S.oy + y0], [u + s1, S.oy + y0], [u + s1, S.oy + y1], [u + s0, S.oy + y1]], col);
}
// the same, facing the other way (the inside of a wall that is seen from behind)
export function wallBack(S, F, mat, tier, s0, s1, y0, y1, d, col = WHITE) {
  if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
  S.quad(mat, tier, fp(F, s1, y0, d), fp(F, s0, y0, d), fp(F, s0, y1, d), fp(F, s1, y1, d), [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], col);
}
// a box in a face's frame: s0..s1 along, y0..y1 up, d0..d1 into the wall (d0 < d1; the far face is left out when
// `open`)
export function faceBox(S, F, mat, tier, s0, s1, y0, y1, d0, d1, col = WHITE, open = true) {
  const a = fp(F, (s0 + s1) / 2, (y0 + y1) / 2, (d0 + d1) / 2);
  // (the face's frame turned into the building's: a box along x there is along t here)
  S.box(mat, tier, a[0], a[1], a[2], F.tx ? s1 - s0 : d1 - d0, y1 - y0, F.tx ? d1 - d0 : s1 - s0, { c: col, skip: open ? (F.nx > 0 ? 2 : F.nx < 0 ? 1 : F.nz > 0 ? 32 : 16) : 0 });
}
// a decal from the city's atlas laid on a face: its middle (s, y), its size; grime: blended (soot, rust, damp) -
// otherwise cut out (lettering, ivy, a board)
export function decal(S, F, name, s, y, w, h, grime = true, tier = TIER.STREET, d = -0.02) {
  S.cell(grime ? 'citygrime' : 'citysign', tier, name, fp(F, s - w / 2, y - h / 2, d), fp(F, s + w / 2, y - h / 2, d), fp(F, s + w / 2, y + h / 2, d), fp(F, s - w / 2, y + h / 2, d));
}

// ------------------------------------------------------------------ styles
// bay: the width a window takes of a wall. win: [w, h] of the opening. sill: its foot over the storey's floor.
// rec: how deep the glass stands in the wall. frame: what the window's frame is made of.
export const STYLE = {
  walkup: { bay: 3.0, win: [1.1, 1.75], sill: 0.8, rec: 0.2, frame: 'sash', stone: true, cornice: 0.34, roof: ['tank', 'bulkhead', 'vents'] },
  shopflat: { bay: 3.1, win: [1.2, 1.6], sill: 0.85, rec: 0.18, frame: 'sash', stone: true, cornice: 0.26, roof: ['bulkhead', 'vents', 'aerial'] },
  slab: { bay: 3.4, win: [1.7, 1.45], sill: 0.95, rec: 0.14, frame: 'metal', balcony: true, cornice: 0, roof: ['bulkhead', 'vents', 'aerial', 'plant'] },
  office: { bay: 3.2, win: [2.5, 1.75], sill: 0.85, rec: 0.26, frame: 'metal', fins: true, cornice: 0, roof: ['plant', 'bulkhead', 'aerial', 'billboard'] },
  glass: { bay: 1.75, win: [1.6, 2.2], sill: 0.7, rec: 0.1, frame: 'metal', curtain: true, cornice: 0, roof: ['plant', 'bulkhead', 'aerial'] },
  warehouse: { bay: 4.4, win: [2.8, 2.2], sill: 1.1, rec: 0.22, frame: 'metal', panes: true, cornice: 0.2, roof: ['skylights', 'vents', 'tank'] },
  stone: { bay: 3.4, win: [1.2, 2.2], sill: 0.9, rec: 0.3, frame: 'trim', stone: true, cornice: 0.4, roof: ['bulkhead'] },
};
// faded paint for a rendered front (the 'plaster' material takes it as a vertex colour)
export const STUCCO = [[0.78, 0.72, 0.56], [0.62, 0.7, 0.74], [0.8, 0.66, 0.6], [0.72, 0.74, 0.62], [0.82, 0.8, 0.72], [0.66, 0.6, 0.52], [0.58, 0.66, 0.6]];
export const ROOM_TINT = [[0.86, 0.9, 0.8], [0.92, 0.86, 0.7], [0.82, 0.86, 0.92], [0.94, 0.9, 0.84], [0.9, 0.8, 0.76], [0.8, 0.84, 0.74]];
// what a fire leaves of a wall's colour (a burnt room's lining, the smoked inside of a shell)
export const SOOTY = [0.33, 0.3, 0.27];

// a clump of weeds: crossed cards of the island's blades
export function weedsAt(S, x, y, z, h, rnd, tier = TIER.STREET) {
  for (let k = 0; k < 2; k++) {
    const a = rnd() * PI + (k * PI) / 2;
    const dx = Math.cos(a) * 0.3, dz = Math.sin(a) * 0.3;
    S.quad('weeds', tier, [x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.78, 0.8, 0.7]);
    S.quad('weeds', tier, [x + dx, y, z + dz], [x - dx, y, z - dz], [x - dx, y + h, z - dz], [x + dx, y + h, z + dz], [[1, 0], [0, 0], [0, 1], [1, 1]], [0.78, 0.8, 0.7]);
  }
}
