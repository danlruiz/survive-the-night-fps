// What every prop builder builds with (props.js and its families: props-vehicles.js, props-mainland.js,
// props-street.js, props-interior.js; aircraft.js and vehicles.js too): seeded draws, the tones of old wood, a wheel,
// a label, weeds round a prop's foot, a plank, a tapering slab. Nothing here draws a random number but from the rng
// it is handed.
const PI = Math.PI;

// a type's name as a number: what its builder's seeds are made from (createProp, createDriveCar)
export function typeHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}
// a draw of r between a and b, and a pick of one of arr
export const rr = (r, a, b) => a + (b - a) * r();
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
// a colour times k
export const mul = (c, k) => c.map((q) => q * k);

// the tones of weathered wood a builder picks from (vertex colours over the `wood` texture)
export const WOODS = [[0.95, 0.9, 0.85], [0.8, 0.74, 0.68], [0.7, 0.66, 0.62], [1, 0.95, 0.88], [0.62, 0.56, 0.5]];
// litter's paper: newsprint, card, a grey sheet, a brown bag
export const PAPER = [[0.74, 0.72, 0.64], [0.6, 0.56, 0.46], [0.5, 0.52, 0.5], [0.66, 0.5, 0.4]];

/** wheel: axis along X, centred at origin. flat: 0..0.3 squash */
export function wheel(b, r, w, { flat = 0, rim = 'chrome', rimR = 0.62, spokes = 0 } = {}) {
  const ri = r * rimR, hw = w / 2;
  b.group({ p: [0, -flat * r * 0.5, 0], s: [1, 1 - flat * 0.5, 1] }, () => {
    const prof = [[ri, hw * 0.8], [r * 0.9, hw], [r, hw * 0.55], [r, -hw * 0.55], [r * 0.9, -hw], [ri, -hw * 0.8]];
    b.lathe('tire', prof, 12, { r: [0, 0, PI / 2] });
    b.cyl(rim, ri, ri, w * 0.72, 10, { r: [0, 0, PI / 2] });
    b.cyl('rust', ri * 0.35, ri * 0.35, w * 0.8, 6, { r: [0, 0, PI / 2] });
  });
}

/** stencil / label quad on a face. dir: 'z-' | 'z+' | 'x-' | 'x+' | 'y+' */
export function label(b, mat, atlas, w, h, p, dir = 'z-', rot = 0) {
  const R = { 'z-': [0, PI, rot], 'z+': [0, 0, rot], 'x-': [0, -PI / 2, rot], 'x+': [0, PI / 2, rot], 'y+': [-PI / 2, 0, rot] }[dir];
  b.plane(mat, w, h, { atlas, p, r: R, order: dir === 'y+' ? 'XYZ' : 'YXZ' });
}

/** weeds: crossed alpha cards around points (no sway material) */
export function weeds(b, r, pts, h = 0.5) {
  for (const [x, z] of pts) {
    const s = rr(r, 0.6, 1.2);
    for (let k = 0; k < 2; k++) b.plane('weeds', 0.55 * s, h * s, { raw: true, p: [x, (h * s) / 2, z], r: [0, r() * PI + (k * PI) / 2, 0], c: [0.8, 0.8, 0.75] });
  }
}

/** simple plank (grain along its longest axis) */
export function plank(b, mat, sx, sy, sz, o = {}) {
  return b.box(mat, sx, sy, sz, { grain: true, ...o });
}

// A tapering slab between a root and a tip section, for a wing, a tailplane or a fin: each section is
// { at: [x, y, z] of its leading edge's middle, c: chord (along +Z), t: thickness }. up: the fin stands (its
// thickness is across X); otherwise it lies (thickness in Y). A closed hexahedron.
export function slab(b, mat, root, tip, o = {}, up = false) {
  const C = [];
  for (let k = 0; k < 8; k++) {
    // (hull's corners: bit 0 the +X one, bit 1 the +Y one, bit 2 the +Z one)
    const far = up ? k & 2 : (k & 1) === (tip.at[0] > root.at[0] ? 1 : 0);
    const s = far ? tip : root;
    const thick = ((up ? k & 1 : k & 2) ? 0.5 : -0.5) * s.t;
    const z = s.at[2] + (k & 4 ? s.c : 0);
    C.push(up ? [s.at[0] + thick, s.at[1], z] : [s.at[0], s.at[1] + thick, z]);
  }
  return b.hull(mat, C, o);
}
