// The island's props of the road and its places: jersey barriers, a boom gate, a saw table, a gravel pile, a hunting
// stand, a billboard, the motel's sign, a satellite dish, chain-link fence. Builders as in props.js: (b, r, v) with b a
// MeshBuilder, r a seeded rng, v the variant; origin at ground centre of the footprint, front to -Z.
import * as THREE from 'three';
import { rr, WOODS, weeds, plank } from './propkit.js';

const PI = Math.PI;

export const ROADSIDE_VARIANTS = {
  jersey_barrier: 2, boom_gate: 2, saw_table: 1, gravel_pile: 2, hunting_stand: 1, billboard: 1, motel_sign: 1, satellite_dish: 1,
  fence_chain: 2,
};
export const ROADSIDE_PROPS = {};

ROADSIDE_PROPS.jersey_barrier = (b, r, v) => {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0);
  s.lineTo(0.3, 0);
  s.lineTo(0.3, 0.075);
  s.lineTo(0.2, 0.26);
  s.lineTo(0.085, 0.82);
  s.lineTo(0.06, 0.85);
  s.lineTo(-0.06, 0.85);
  s.lineTo(-0.085, 0.82);
  s.lineTo(-0.2, 0.26);
  s.lineTo(-0.3, 0.075);
  s.lineTo(-0.3, 0);
  const L = 2.96;
  b.extrude('concrete', s, L, { r: [0, -PI / 2, 0], p: [L / 2, 0, 0] });
  // drain slot through the base + lifting loops on top
  b.box('dark', 0.36, 0.09, 0.605, { p: [0.4, 0.045, 0] });
  for (const x of [-1.0, 1.0]) b.torus('rust', 0.06, 0.012, 4, 8, PI, { p: [x, 0.85, 0] });
  // chipped end chunks + rubble
  b.rock('concrete', 0.12, { detail: 0, seed: 91 + v, scale: [1.3, 0.7, 1], p: [-1.62, 0.05, 0.28], r: [0, 0.4, 0] });
  b.rock('concrete', 0.07, { detail: 0, seed: 94, p: [1.4, 0.03, -0.42] });
  b.box('dark', 0.004, 0.2, 0.12, { p: [-L / 2 - 0.002, 0.6, 0.02], r: [0.3, 0, 0] });
  // faded painted stripes on the upper slope of both faces
  const slope = (side, x0, x1, c) => {
    // quad on the face between (z=0.2,y=0.26) and (z=0.085,y=0.82) mirrored by side
    const n = [side * 0.98, 0.2];
    const pt = (x, t) => {
      const z = 0.2 + (0.085 - 0.2) * t, y = 0.26 + (0.82 - 0.26) * t;
      return [x, y + n[1] * 0.004, side * z + n[0] * 0.004];
    };
    const k = 0.22;
    const pts = [pt(x0, 0.08), pt(x1, 0.08), pt(x1 + k, 0.92), pt(x0 + k, 0.92)];
    b.quadOut('paint', pts, [0, 0.5, 0], { c });
  };
  if (v === 1) {
    for (const side of [-1, 1])
      for (let k = 0; k < 9; k++) {
        const x0 = -1.38 + k * 0.3;
        slope(side, x0, x0 + 0.15, k % 2 ? [0.82, 0.8, 0.72] : [0.72, 0.2, 0.08]);
      }
  } else {
    for (const side of [-1, 1]) {
      slope(side, -1.46, -0.9, [0.8, 0.62, 0.12]);
      slope(side, 0.8, 1.2, [0.8, 0.62, 0.12]);
    }
    b.box('paint', 2.6, 0.004, 0.1, { p: [0.05, 0.852, 0], c: [0.8, 0.64, 0.14] });
  }
  weeds(b, r, [[-1.2, 0.36], [0.9, -0.36], [1.5, 0.3]], 0.4);
};

ROADSIDE_PROPS.boom_gate = (b, r, v) => {
  const px = -2.1;
  const white = [0.82, 0.8, 0.72], red = [0.7, 0.12, 0.08];
  b.box('concrete', 0.55, 0.12, 0.5, { p: [px, 0.06, 0.02] });
  b.box('paint', 0.34, 0.92, 0.34, { p: [px, 0.58, 0.04], c: white });
  b.box('paint', 0.36, 0.14, 0.36, { p: [px, 0.9, 0.04], c: red });
  b.box('paint', 0.38, 0.03, 0.38, { p: [px, 1.055, 0.04], c: white });
  b.box('dark', 0.2, 0.3, 0.004, { p: [px, 0.5, -0.135] });
  b.box('steel', 0.04, 0.06, 0.02, { p: [px + 0.06, 0.48, -0.14] });
  b.cyl('taillight', 0.06, 0.07, 0.1, 8, { p: [px, 1.12, 0.04] });
  // pivot hub on the front face
  b.cyl('steel', 0.09, 0.09, 0.08, 10, { p: [px, 0.98, -0.17], r: [PI / 2, 0, 0] });
  const arm = (x0, x1, y, z, tilt) => {
    b.group({ p: [x0, y, z], r: [0, 0, tilt] }, () => {
      const L = x1 - x0, n = Math.max(1, Math.round(L / 0.42));
      const seg = L / n;
      for (let k = 0; k < n; k++) b.box('paint', seg, 0.09, 0.07, { p: [seg * (k + 0.5), 0, 0], c: k % 2 ? white : red });
      b.cyl('taillight', 0.035, 0.035, 0.02, 8, { p: [L - 0.1, 0, -0.04], r: [PI / 2, 0, 0] });
    });
  };
  // counterweight behind the pivot
  b.box('metal', 0.34, 0.2, 0.12, { p: [px - 0.22, 0.98, -0.2] });
  if (v === 1) {
    // arm snapped: stub on the hub + broken piece lying on the road
    arm(px + 0.05, 0.4, 0.98, -0.2, 0.0);
    b.box('rust', 0.06, 0.07, 0.06, { p: [0.44, 0.98, -0.2], r: [0, 0, 0.4] });
    b.group({ p: [0.9, 0.05, -0.1], r: [0, -0.25, 0.02] }, () => arm(0, 1.9, 0, 0, 0));
  } else arm(px + 0.05, 2.3, 0.98, -0.2, 0.0);
  // warning plate hanging from the arm
  b.plane('labels', 0.3, 0.3, { atlas: 'sign', p: [v === 1 ? -0.4 : 0.2, 0.74, -0.24], r: [0, PI, PI / 4] });
  b.cylBetween('wire', [v === 1 ? -0.4 : 0.2, 0.93, -0.22], [v === 1 ? -0.4 : 0.2, 0.84, -0.23], 0.004, 0.004, 3);
  weeds(b, r, [[px + 0.3, 0.3], [px - 0.2, -0.35]], 0.5);
};

ROADSIDE_PROPS.saw_table = (b, r) => {
  const top = 0.82;
  // welded frame
  for (const sx of [-1, 1]) {
    for (const z of [-1.6, -0.5, 0.5, 1.6]) b.box('rust', 0.1, top - 0.06, 0.1, { p: [sx * 0.7, (top - 0.06) / 2, z] });
    b.box('rust', 0.12, 0.16, 3.4, { p: [sx * 0.7, top - 0.08, 0] });
    b.box('rust', 0.08, 0.08, 3.3, { p: [sx * 0.7, 0.22, 0] });
  }
  for (const z of [-1.6, 1.6]) b.box('rust', 1.4, 0.08, 0.08, { p: [0, 0.22, z] });
  // roller bed (gap for the blade)
  for (let z = -1.55; z <= 1.56; z += 0.3) {
    if (Math.abs(z) < 0.4) continue;
    b.cyl('steel', 0.05, 0.05, 1.3, 7, { p: [0, top - 0.02, z], r: [0, 0, PI / 2] });
  }
  b.box('metal', 1.3, 0.04, 0.78, { p: [0, top - 0.01, 0] });
  b.box('dark', 0.03, 0.045, 0.9, { p: [0, top - 0.005, 0] });
  // blade housing under the table + motor + belt
  b.box('metal', 0.3, 0.55, 1.1, { p: [0, 0.48, 0] });
  b.box('paint', 0.4, 0.34, 0.5, { p: [0.45, 0.4, 0.6], c: [0.28, 0.36, 0.3] });
  b.cyl('paint', 0.16, 0.16, 0.5, 10, { p: [0.45, 0.4, 0.6], r: [0, 0, PI / 2], c: [0.3, 0.38, 0.32] });
  b.tube('rubber', [[0.2, 0.4, 0.6], [0.1, 0.55, 0.3], [0.05, 0.68, 0.0]], 0.02, 6, 4);
  b.box('paint', 0.12, 0.2, 0.08, { p: [0.76, 0.7, -1.6], c: [0.6, 0.12, 0.08] });
  b.cyl('dark', 0.03, 0.03, 0.04, 6, { p: [0.76, 0.72, -1.65], r: [PI / 2, 0, 0] });
  // big circular blade, axis along X, peeking ~0.35 m above the bed
  const R = 0.5, cy = 0.6;
  b.cyl('chrome', R, R, 0.01, 24, { p: [0, cy, 0], r: [0, 0, PI / 2] });
  b.cyl('rust', R * 0.72, R * 0.72, 0.012, 20, { p: [0, cy, 0], r: [0, 0, PI / 2], open: false });
  b.cyl('rust', 0.09, 0.09, 0.05, 8, { p: [0, cy, 0], r: [0, 0, PI / 2] });
  const teeth = 28, verts = [], faces = [];
  for (let k = 0; k < teeth; k++) {
    const a0 = (k / teeth) * PI * 2, a1 = ((k + 0.7) / teeth) * PI * 2;
    const p = (a, rr2) => [0, cy + Math.cos(a) * rr2, Math.sin(a) * rr2];
    const i = verts.length;
    verts.push(p(a0, R - 0.005), p(a1, R - 0.005), p(a0 + 0.03, R + 0.045));
    faces.push([i, i + 1, i + 2], [i, i + 2, i + 1]);
  }
  b.poly('chrome', verts, faces);
  // a log riding on the rollers toward the blade
  b.group({ p: [0.32, top + 0.17, -1.0], r: [PI / 2, 0, 0] }, () => {
    b.cyl('bark', 0.16, 0.17, 1.2, 8, { grain: true, open: true });
    b.disc('woodend', 0.16, 8, { p: [0, 0.6, 0] });
    b.disc('woodend', 0.17, 8, { p: [0, -0.6, 0], r: [PI, 0, 0] });
  });
  // sawdust, blood
  for (const [x, z, s] of [[0.1, 0.3, 0.5], [-0.3, -0.4, 0.35], [0.4, 1.2, 0.3]]) b.sphere('wood', s, 8, 3, { p: [x, 0, z], s: [1.3, 0.25, 1], c: [1.12, 0.96, 0.72], thetaLen: PI / 2 });
  b.plane('blood_decal', 0.5, 0.5, { raw: true, p: [0.18, top + 0.012, 0.25], r: [-PI / 2, 0, 1.1] });
  b.sphere('blood', 0.03, 5, 3, { p: [0.006, cy + 0.3, -0.25], s: [0.3, 1.4, 1.2] });
  weeds(b, r, [[0.8, 1.2], [-0.8, -0.9]], 0.5);
};

ROADSIDE_PROPS.gravel_pile = (b, r) => {
  // lumpy cone (lathe with periodic angular noise so the seam stays closed)
  const prof = [[2.56, -0.02], [2.5, 0.1], [2.3, 0.38], [1.95, 0.8], [1.5, 1.26], [0.95, 1.74], [0.4, 2.05], [0.0, 2.12]];
  const seg = 22;
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rad = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const n = 0.09 * Math.sin(a * 2 + ph[0]) + 0.06 * Math.sin(a * 3 + ph[1]) + 0.04 * Math.sin(a * 5 + ph[2]) + 0.03 * Math.sin(a * 7 + y * 3 + ph[3]);
    const k = 1 + n * Math.min(1, rad / 1.2);
    const yy = y > 0.05 ? y * (1 + n * 0.35) : y;
    pos.setXYZ(i, x * k, yy, z * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.8 + pos.getY(i) * 0.3, pos.getZ(i) * 0.8 - pos.getY(i) * 0.3);
  b.add('gravel', g, { raw: true });
  // spilled skirt + a few boulders
  for (let k = 0; k < 9; k++) {
    const a = r() * PI * 2, d = rr(r, 2.3, 2.7);
    b.sphere('gravel', rr(r, 0.25, 0.45), 6, 3, { p: [Math.cos(a) * d, -0.02, Math.sin(a) * d], s: [1.6, 0.22, 1.1], thetaLen: PI / 2, r: [0, a, 0] });
  }
  for (let k = 0; k < 6; k++) {
    const a = r() * PI * 2, d = rr(r, 0.6, 2.6);
    const y = d > 2.3 ? 0.1 : 2.1 - d * 0.8;
    b.rock('stone_rough', rr(r, 0.12, 0.3), { detail: 0, seed: 600 + k, p: [Math.cos(a) * d, y, Math.sin(a) * d], r: [0, r() * 3, 0] });
  }
  weeds(b, r, [[2.4, 0.8], [-2.2, -1.2], [0.5, -2.5]], 0.5);
};

ROADSIDE_PROPS.hunting_stand = (b, r) => {
  const t = WOODS[2], L = 0.7, fl = 3.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(b, 'wood', 0.12, fl + 0.05, 0.12, { p: [sx * L, (fl + 0.05) / 2, sz * L], c: t });
  // X bracing + girts on all four sides
  const br = (a, c) => b.beam('wood', a, c, 0.08, 0.04, { c: WOODS[1] });
  for (const s of [-1, 1]) {
    br([-L, 0.35, s * (L + 0.07)], [L, 2.95, s * (L + 0.07)]);
    br([L, 0.35, s * (L + 0.08)], [-L, 2.95, s * (L + 0.08)]);
    br([s * (L + 0.07), 0.35, -L], [s * (L + 0.07), 2.95, L]);
    br([s * (L + 0.08), 0.35, L], [s * (L + 0.08), 2.95, -L]);
    plank(b, 'wood', 1.56, 0.1, 0.05, { p: [0, 1.6, s * (L + 0.085)], c: t });
    plank(b, 'wood', 0.05, 0.1, 1.56, { p: [s * (L + 0.085), 1.6, 0], c: t });
  }
  // platform deck + joists
  for (let k = 0; k < 8; k++) plank(b, 'wood', 1.62, 0.05, 0.19, { p: [0, fl + 0.025, -0.72 + k * 0.205 + rr(r, -0.01, 0.01)], c: WOODS[k % 2 ? 1 : 3] });
  for (const s of [-1, 1]) plank(b, 'wood', 0.08, 0.14, 1.6, { p: [s * 0.55, fl - 0.07, 0], c: t });
  // rail posts + rails
  const top = fl + 1.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(b, 'wood', 0.08, top - fl, 0.08, { p: [sx * (L + 0.02), fl + (top - fl) / 2, sz * (L + 0.02)], c: t });
  for (const s of [-1, 1]) {
    plank(b, 'wood', 1.6, 0.06, 0.06, { p: [0, top - 0.03, s * (L + 0.04)], c: t });
    plank(b, 'wood', 0.06, 0.06, 1.6, { p: [s * (L + 0.04), top - 0.03, 0], c: t });
    plank(b, 'wood', 0.06, 0.06, 1.6, { p: [s * (L + 0.04), fl + 0.5, 0], c: t });
  }
  plank(b, 'wood', 1.6, 0.06, 0.06, { p: [0, fl + 0.5, L + 0.04], c: t });
  // camo tarp wrapped around the rail (3 sides + two front flaps), sagging between posts
  const tarp = (a, c, sag) => {
    const cols = 4, rows = 2, verts = [], faces = [];
    for (let i = 0; i <= cols; i++)
      for (let j = 0; j <= rows; j++) {
        const u = i / cols, w2 = j / rows;
        const x = a[0] + (c[0] - a[0]) * u, z = a[1] + (c[1] - a[1]) * u;
        const y = top - 0.05 - w2 * 0.85 - Math.sin(u * PI) * sag * (0.3 + w2);
        const bulge = Math.sin(u * PI) * sag * w2 * 0.6;
        const nx = -(c[1] - a[1]), nz = c[0] - a[0], nl = Math.hypot(nx, nz) || 1;
        verts.push([x + (nx / nl) * bulge, y + (j === rows && i % 2 ? -0.06 : 0), z + (nz / nl) * bulge]);
      }
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const q = i * (rows + 1) + j;
        faces.push([q, q + rows + 1, q + 1], [q + 1, q + rows + 1, q + rows + 2]);
      }
    b.poly('canvas_mil', verts, faces);
  };
  const e = L + 0.07;
  tarp([-e, e], [e, e], 0.06);
  tarp([e, e], [e, -e], 0.08);
  tarp([-e, -e], [-e, e], 0.05);
  tarp([-e, -e], [-0.3, -e], 0.03);
  tarp([0.35, -e], [e, -e], 0.03);
  for (const [x, z] of [[-e, e], [e, e], [e, -e], [-e, -e]]) b.torus('rope', 0.04, 0.008, 3, 6, PI * 2, { p: [x, top - 0.05, z], r: [PI / 2, 0, 0] });
  // seat + ladder on the -Z side
  plank(b, 'wood', 0.6, 0.05, 0.35, { p: [0, fl + 0.45, 0.4], c: WOODS[1] });
  plank(b, 'wood', 0.06, 0.4, 0.06, { p: [0, fl + 0.22, 0.4], c: t });
  for (const sx of [-0.23, 0.23]) b.beam('wood', [sx, 0, -1.25], [sx, fl + 0.3, -e - 0.03], 0.07, 0.05, { c: t });
  for (let k = 1; k < 11; k++) {
    const u = k / 11.3;
    b.box('wood', 0.5, 0.04, 0.06, { p: [0, u * (fl + 0.3), -1.25 + (1.25 - e - 0.03) * u - 0.03], c: WOODS[1] });
  }
  weeds(b, r, [[-0.7, -0.9], [0.8, 0.8], [0.9, -0.6]], 0.6);
};

ROADSIDE_PROPS.billboard = (b, r) => {
  const t = [0.58, 0.48, 0.4];
  for (const sx of [-1, 1]) {
    b.cyl('wood', 0.12, 0.15, 6.5, 8, { p: [sx * 2.0, 3.25, 0.1], grain: true, c: t });
    // knee braces to the board
    b.beam('wood', [sx * 2.0, 2.6, 0.12], [sx * 1.4, 3.7, 0.08], 0.1, 0.08, { c: WOODS[2] });
    b.beam('wood', [sx * 2.0, 2.6, 0.12], [sx * 2.6, 3.7, 0.08], 0.1, 0.08, { c: WOODS[2] });
  }
  // stringers + plank backing
  for (const y of [3.75, 4.9, 6.05]) plank(b, 'wood', 5.6, 0.14, 0.09, { p: [0, y, -0.02], c: WOODS[1] });
  b.box('planks', 5.4, 2.6, 0.04, { p: [0, 4.9, -0.085] });
  // painted frame + poster
  const fr = [0.3, 0.32, 0.3];
  plank(b, 'wood', 5.5, 0.1, 0.05, { p: [0, 6.2, -0.12], c: fr });
  plank(b, 'wood', 5.5, 0.1, 0.05, { p: [0, 3.6, -0.12], c: fr });
  for (const sx of [-1, 1]) plank(b, 'wood', 0.1, 2.7, 0.05, { p: [sx * 2.7, 4.9, -0.12], c: fr });
  b.plane('labels', 5.3, 2.5, { atlas: 'billboard', p: [0, 4.9, -0.108], r: [0, PI, 0] });
  // peeling strips
  b.plane('cloth', 0.35, 0.9, { p: [1.6, 4.1, -0.2], r: [0.35, PI + 0.2, 0.15], c: [0.76, 0.74, 0.64] });
  b.plane('cloth', 0.28, 0.6, { p: [-2.1, 5.6, -0.16], r: [0.2, PI - 0.3, -0.25], c: [0.66, 0.7, 0.72] });
  // catwalk + dead lamps
  b.box('metal', 5.2, 0.04, 0.34, { p: [0, 3.5, -0.3] });
  for (let k = 0; k < 14; k++) b.box('dark', 0.02, 0.041, 0.3, { p: [-2.5 + k * 0.38, 3.5, -0.3] });
  for (const x of [-2.2, 0, 2.2]) b.beam('rust', [x, 3.48, -0.45], [x, 3.0, -0.06], 0.05, 0.04, { side: [1, 0, 0] });
  b.box('rust', 5.2, 0.03, 0.03, { p: [0, 3.9, -0.46] });
  for (const x of [-2.4, -0.4, 1.6]) b.box('rust', 0.03, 0.4, 0.03, { p: [x, 3.7, -0.46] });
  for (const x of [-1.6, 0, 1.6]) {
    b.tube('rust', [[x, 6.2, -0.1], [x, 6.45, -0.3], [x, 6.4, -0.55]], 0.02, 5, 4);
    b.frustum('metal', 0.14, 0.22, 0.28, 0.34, 6.28, 6.38, { p: [x, 0, -0.56] });
  }
  // back: horizontal stiffeners visible from behind
  for (const y of [4.3, 5.5]) plank(b, 'wood', 5.2, 0.1, 0.06, { p: [0, y, -0.02], c: WOODS[2] });
  weeds(b, r, [[-2.0, -0.3], [2.1, 0.3], [0.4, -0.2]], 0.7);
};

ROADSIDE_PROPS.motel_sign = (b, r) => {
  const teal = [0.3, 0.6, 0.58], cream = [0.85, 0.8, 0.66];
  b.cyl('concrete', 0.36, 0.4, 0.3, 10, { p: [0, 0.15, 0.12] });
  b.cyl('metal', 0.13, 0.15, 6.9, 8, { p: [0, 3.45, 0.12] });
  b.cyl('rust', 0.16, 0.16, 0.3, 8, { p: [0, 0.45, 0.12] });
  // arrow board (extruded), front faces -Z
  const s = new THREE.Shape();
  s.moveTo(-0.72, 5.25);
  s.lineTo(1.2, 5.25);
  s.lineTo(1.2, 6.45);
  s.lineTo(-0.72, 6.45);
  s.lineTo(-0.72, 6.72);
  s.lineTo(-1.3, 5.85);
  s.lineTo(-0.72, 4.98);
  s.lineTo(-0.72, 5.25);
  const dz = 0.24;
  b.extrude('paint', s, dz, { p: [0, 0, -0.1], c: teal });
  b.plane('labels', 1.75, 0.86, { atlas: 'motel', p: [0.24, 5.85, -0.103], r: [0, PI, 0] });
  b.plane('labels', 1.75, 0.86, { atlas: 'motel', p: [0.24, 5.85, dz - 0.1 + 0.003] });
  // bulbs around the arrow edge
  const pts = [[-0.72, 6.72], [-1.3, 5.85], [-0.72, 4.98]];
  const edge = (a, c, n) => {
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = a[0] + (c[0] - a[0]) * u, y = a[1] + (c[1] - a[1]) * u;
      b.sphere(r() < 0.25 ? 'dark' : 'glass', 0.035, 5, 3, { p: [x * 0.96 + 0.01, y + (y > 5.85 ? -0.05 : 0.05) * 0.6, -0.12] });
    }
  };
  edge(pts[0], pts[1], 4);
  edge(pts[1], pts[2], 4);
  for (let k = 0; k < 9; k++) {
    const x = -0.55 + k * 0.2;
    b.sphere(r() < 0.3 ? 'dark' : 'glass', 0.035, 5, 3, { p: [x, 6.38, -0.12] });
    b.sphere(r() < 0.3 ? 'dark' : 'glass', 0.035, 5, 3, { p: [x, 5.32, -0.12] });
  }
  // cream trim cap + star on top
  b.box('paint', 1.96, 0.06, 0.28, { p: [0.24, 6.47, 0.02], c: cream });
  const st = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * PI * 2 + PI / 2, R = k % 2 ? 0.12 : 0.28;
    const x = 0.8 + Math.cos(a) * R, y = 6.78 + Math.sin(a) * R;
    if (k === 0) st.moveTo(x, y);
    else st.lineTo(x, y);
  }
  b.extrude('paint', st, 0.08, { p: [0, 0, -0.02], c: [0.72, 0.58, 0.2] });
  b.cyl('metal', 0.02, 0.02, 0.28, 4, { p: [0.8, 6.55, 0.02] });
  // NO VACANCY box hung below
  b.box('paint', 1.3, 0.34, 0.18, { p: [0.3, 4.62, 0.02], c: [0.22, 0.22, 0.2] });
  b.plane('labels', 1.24, 0.3, { atlas: 'vacancy', p: [0.3, 4.62, -0.072], r: [0, PI, 0] });
  for (const x of [-0.2, 0.8]) b.cylBetween('steel', [x, 4.79, 0.02], [x, 5.25, 0.02], 0.012, 0.012, 4);
  // brace from the pole
  b.beam('metal', [0, 4.4, 0.12], [0.9, 5.25, 0.06], 0.06, 0.06);
  b.beam('metal', [0, 4.4, 0.12], [-0.6, 5.25, 0.06], 0.06, 0.06);
  // rust drips
  for (const x of [-0.4, 0.5, 1.0]) b.box('rust', 0.05, 0.3 + r() * 0.3, 0.004, { p: [x, 5.1, -0.104] });
  weeds(b, r, [[0.3, 0.4], [-0.35, -0.1]], 0.6);
};

ROADSIDE_PROPS.satellite_dish = (b, r) => {
  const white = [0.84, 0.84, 0.8];
  b.cyl('concrete', 0.42, 0.46, 0.34, 10, { p: [0, 0.17, 0] });
  b.cyl('metal', 0.11, 0.12, 1.4, 8, { p: [0, 1.04, 0] });
  b.box('paint', 0.22, 0.3, 0.12, { p: [0.14, 0.9, 0.08], c: [0.5, 0.52, 0.46] });
  b.tube('rubber', [[0.15, 0.8, 0.1], [0.3, 0.5, 0.2], [0.35, 0.2, 0.3], [0.5, 0.02, 0.5]], 0.018, 8, 4);
  // yoke + elevation jack
  b.box('metal', 0.3, 0.16, 0.3, { p: [0, 1.8, 0] });
  for (const sx of [-1, 1]) b.box('metal', 0.04, 0.4, 0.2, { p: [sx * 0.16, 1.95, -0.06] });
  b.cylBetween('chrome', [0, 1.5, 0.12], [0, 2.3, 0.25], 0.03, 0.03, 6);
  // dish tilted up toward -Z
  const f = 0.9, Rr = 1.25;
  const prof = [];
  for (let k = 0; k <= 7; k++) {
    const rr2 = (k / 7) * Rr;
    prof.push([Math.max(0.001, rr2), (rr2 * rr2) / (4 * f)]);
  }
  b.group({ p: [0, 2.02, -0.08], r: [-0.72, 0, 0] }, () => {
    b.lathe('paint', prof.slice().reverse(), 20, { c: white }); // concave face
    b.lathe('paint', prof.map(([x, y]) => [x, y - 0.014]), 20, { c: white.map((c) => c * 0.82) }); // convex back
    b.torus('paint', Rr, 0.025, 4, 20, PI * 2, { p: [0, (Rr * Rr) / (4 * f) - 0.006, 0], r: [PI / 2, 0, 0], c: white });
    // back frame: ring + ribs + hub
    b.torus('steel', 0.6, 0.02, 3, 12, PI * 2, { p: [0, 0.07, 0], r: [PI / 2, 0, 0] });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2;
      b.cylBetween('steel', [0, -0.04, 0], [Math.cos(a) * 1.1, (1.1 * 1.1) / (4 * f) - 0.03, Math.sin(a) * 1.1], 0.015, 0.015, 3);
    }
    b.cyl('metal', 0.14, 0.18, 0.14, 8, { p: [0, -0.06, 0] });
    // feed horn on three struts
    const fy = f;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * PI * 2 + PI / 2;
      b.cylBetween('steel', [Math.cos(a) * Rr * 0.96, (Rr * Rr) / (4 * f), Math.sin(a) * Rr * 0.96], [0, fy - 0.05, 0], 0.014, 0.014, 4);
    }
    b.cyl('paint', 0.07, 0.05, 0.2, 8, { p: [0, fy, 0], c: [0.5, 0.5, 0.46] });
    b.cyl('dark', 0.05, 0.05, 0.02, 8, { p: [0, fy - 0.1, 0] });
    b.tube('rubber', [[0, fy + 0.08, 0], [0.1, fy - 0.1, -0.3], [Math.cos(PI / 2) * Rr * 0.9, 0.35, Math.sin(PI / 2) * Rr * 0.9]], 0.012, 8, 3);
  });
  weeds(b, r, [[0.5, 0.3], [-0.45, -0.3], [0.1, 0.55]], 0.5);
};

ROADSIDE_PROPS.fence_chain = (b, r, v) => {
  const H = 1.95;
  for (const x of [-1.5, 1.5]) {
    b.cyl('steel', 0.035, 0.035, H + 0.05, 6, { p: [x, (H + 0.05) / 2, 0] });
    b.cyl('steel', 0.045, 0.04, 0.05, 6, { p: [x, H + 0.05, 0] });
    b.cyl('concrete', 0.1, 0.12, 0.08, 6, { p: [x, 0.03, 0] });
    // barbed-wire arm leaning outward (-Z)
    b.beam('steel', [x, H + 0.02, 0], [x, 2.2, -0.14], 0.03, 0.03, { side: [1, 0, 0] });
  }
  b.cyl('steel', 0.022, 0.022, 3.0, 6, { p: [0, H - 0.02, 0], r: [0, 0, PI / 2] });
  b.cylBetween('wire', [-1.5, 0.08, 0.0], [1.5, 0.08, 0.0], 0.004, 0.004, 3);
  // sagging, bellied mesh
  const cols = 10, rows = 6, W = 2.96;
  const verts = [], uvs = [], idx = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, w = j / rows;
      const x = -W / 2 + u * W;
      const mid = Math.sin(u * PI);
      let y = 0.06 + w * (H - 0.1) - mid * 0.06 * w;
      let z = -mid * 0.09 * (1 - w) ** 1.5 * (v === 1 ? 2.2 : 1);
      if (j === 0) y += mid * (v === 1 ? 0.35 : 0.08) * (r() * 0.5 + 0.75);
      if (v === 1 && i >= cols - 2 && j <= 1) {
        // peeled-up corner
        y += (i - (cols - 3)) * 0.12;
        z -= (i - (cols - 3)) * 0.12;
      }
      verts.push(x, y, z);
      uvs.push(x, y);
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, c = a + cols + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add('chainlink', g, { raw: true });
  // three barbed strands on the arms
  for (let s = 0; s < 3; s++) {
    const t = (s + 1) / 3;
    const y = H + 0.02 + (2.2 - H - 0.02) * t, z = -0.14 * t;
    const sag = s === 1 && v === 1 ? -0.2 : -0.02;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      pts.push([-1.5 + 3 * u, y + Math.sin(u * PI) * sag, z]);
    }
    b.tube('wire', pts, 0.004, 8, 3);
    for (let k = 0; k < 5; k++) {
      const u = (k + 0.5) / 5;
      const p = [-1.5 + 3 * u, y + Math.sin(u * PI) * sag, z];
      b.cylBetween('wire', [p[0] - 0.02, p[1] - 0.02, p[2]], [p[0] + 0.02, p[1] + 0.02, p[2]], 0.003, 0.003, 3);
      b.cylBetween('wire', [p[0], p[1] + 0.02, p[2] - 0.02], [p[0], p[1] - 0.02, p[2] + 0.02], 0.003, 0.003, 3);
    }
  }
  if (v === 1) b.plane('cloth', 0.2, 0.3, { p: [0.4, 2.02, -0.08], r: [0.1, 0, 0.3], c: [0.45, 0.2, 0.15] });
  weeds(b, r, [[-1.3, 0.05], [0.4, 0.0], [1.2, -0.05]], 0.5);
};
