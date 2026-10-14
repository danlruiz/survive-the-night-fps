// The island's props, out in the open and in its houses: a camp (campfire, tents, crates, barrels, sandbags), the farm
// (hay, woodpiles, a well, a scarecrow, pumpkins, a cart), the graveyard and the chapel (gravestones, pews, an altar),
// furniture (shelves, beds, tables, chairs), the roadside's poles, lights and signs, wrecks of a helicopter and a boat,
// towers and masts, a gas pump and a fuel tank, and the dead. Builders as in props.js: (b, r, v) with b a MeshBuilder,
// r a seeded rng, v the variant; origin at ground centre of the footprint, front to -Z.
import * as THREE from 'three';
import { rr, pick, WOODS, wheel, label, weeds, plank } from './propkit.js';
import { paneLook } from './cabin.js';

const PI = Math.PI;

export const OUTDOOR_VARIANTS = {
  gravestone: 4, grave_cross: 3, barrel: 4, crate: 3, crate_small: 3, chair: 3, fence: 3,
  campfire: 1, heli_wreck: 1, watchtower: 1, water_tower: 1, radio_mast: 1, tent: 2, corpse: 3, bones: 2, pumpkin: 3,
  power_pole: 2, road_sign: 2, tire_pile: 2, sandbags: 2, woodpile: 2, scarecrow: 1, boat: 2, log_pile: 2, strongbox: 1,
};
export const OUTDOOR_PROPS = {};

OUTDOOR_PROPS.campfire = (b, r) => {
  // ash bed + stones ring + charred teepee
  b.cyl('ash', 0.68, 0.72, 0.05, 14, { p: [0, 0.02, 0] });
  const n = 12;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2 + rr(r, -0.1, 0.1);
    const R = 0.8 + rr(r, -0.04, 0.05);
    b.rock('stone_rough', rr(r, 0.14, 0.2), { detail: 0, seed: 40 + k, scale: [1.2, 0.8, 1], sink: 0.2, p: [Math.cos(a) * R, 0.08, Math.sin(a) * R], r: [0, r() * PI, 0] });
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + 0.3;
    const base = [Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5];
    const top = [Math.cos(a) * 0.06, 0.52, Math.sin(a) * 0.06];
    b.cylBetween('charred', base, top, 0.035, 0.065, 6);
  }
  // fallen log pieces and embers
  b.cylBetween('charred', [-0.35, 0.07, 0.25], [0.3, 0.07, 0.35], 0.06, 0.07, 6);
  b.cylBetween('charred', [0.25, 0.08, -0.35], [-0.2, 0.06, -0.25], 0.05, 0.06, 6);
  for (let k = 0; k < 7; k++) b.box('ember', 0.07, 0.03, 0.05, { p: [rr(r, -0.25, 0.25), 0.05, rr(r, -0.25, 0.25)], r: [0, r() * 3, 0] });
};

OUTDOOR_PROPS.tent = (b, r, v) => {
  // A-frame tent, ridge along Z; door at -Z with an open flap; one side sagging
  const L = 2.45, hw = 1.15, H = 1.45;
  const cols = 4, rows = 3;
  const ridgeY = (z) => H - Math.sin(((z + L / 2) / L) * PI) * 0.12;
  const verts = [], faces = [];
  for (const side of [-1, 1]) {
    const base = verts.length;
    for (let i = 0; i <= cols; i++) {
      const z = -L / 2 + (i / cols) * L;
      for (let j = 0; j <= rows; j++) {
        const t = j / rows; // 0 ridge .. 1 ground
        const y = ridgeY(z) * (1 - t) + 0.02;
        let x = side * hw * t;
        const inward = Math.sin(t * PI) * Math.sin((i / cols) * PI) * (side < 0 ? 0.3 : 0.1);
        x -= side * inward;
        verts.push([x, y - (side < 0 ? inward * 0.3 : 0), z]);
      }
    }
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const a = base + i * (rows + 1) + j, bb = a + 1, c = a + rows + 1, d = c + 1;
        if (side > 0) faces.push([a, c, bb], [bb, c, d]);
        else faces.push([a, bb, c], [bb, d, c]);
      }
  }
  b.poly('canvas', verts, faces);
  // back wall (+Z) triangle
  const zb = L / 2;
  b.poly('canvas', [[-hw, 0.02, zb], [hw, 0.02, zb], [0, ridgeY(zb), zb]], [[0, 1, 2]]);
  // front: door opening (dark interior) + flaps
  const zf = -L / 2;
  b.poly('dark', [[-hw * 0.9, 0.02, zb - 0.02], [hw * 0.9, 0.02, zb - 0.02], [0, H - 0.05, zb - 0.02]], [[0, 2, 1]]);
  b.poly('dark', [[-hw * 0.95, 0.01, 1.3], [hw * 0.95, 0.01, 1.3], [hw * 0.95, 0.01, -1.3], [-hw * 0.95, 0.01, -1.3]], [[0, 1, 2], [0, 2, 3]]);
  b.poly('canvas', [[0, ridgeY(zf), zf], [-hw, 0.02, zf], [-0.25, 0.02, zf - 0.02]], [[0, 1, 2]]);
  b.poly('canvas', [[0, ridgeY(zf), zf], [0.2, 0.3, zf - 0.12], [hw * 0.9, 0.02, zf - 0.1]], [[0, 1, 2]]);
  // poles, guy ropes, stakes
  b.cyl('wood', 0.02, 0.02, H, 5, { p: [0, H / 2, zf - 0.01], c: WOODS[2] });
  b.cyl('wood', 0.02, 0.02, H, 5, { p: [0, H / 2, zb + 0.01], c: WOODS[2] });
  b.cylBetween('rope', [0, ridgeY(zf), zf], [0, 0.02, zf - 0.15], 0.006, 0.006, 3);
  b.cylBetween('rope', [0, ridgeY(zb), zb], [0, 0.02, zb + 0.1], 0.006, 0.006, 3);
  for (const [x, z] of [[-hw - 0.06, -1.1], [hw + 0.06, -1.1], [-hw - 0.06, 1.1], [hw + 0.06, 1.1]]) b.cyl('wood', 0.015, 0.008, 0.14, 4, { p: [x, 0.05, z], c: WOODS[1] });
  // tear: dark rip on the sagging side
  b.poly('dark', [[-0.62, 0.62, 0.25], [-0.72, 0.5, 0.55], [-0.66, 0.66, 0.5]], [[0, 1, 2]]);
  if (v === 1) b.box('cloth', 0.9, 0.12, 0.6, { p: [0.3, 0.06, 0.4], c: [0.3, 0.35, 0.45] }); // sleeping bag inside
};

OUTDOOR_PROPS.log_bench = (b, r) => {
  b.cyl('bark', 0.21, 0.23, 2.1, 7, { p: [0, 0.22, 0], r: [PI / 2, 0, 0.1], grain: true });
  b.disc('woodend', 0.2, 7, { p: [0, 0.22, -1.052], r: [-PI / 2, 0, 0] });
  b.disc('woodend', 0.22, 7, { p: [0, 0.22, 1.052], r: [PI / 2, 0, 0] });
  b.cylBetween('bark', [0.12, 0.3, 0.4], [0.3, 0.42, 0.55], 0.03, 0.05, 5);
  // flattened seat plank on top
  plank(b, 'wood', 0.26, 0.05, 1.7, { p: [0, 0.43, 0], c: WOODS[1] });
};

OUTDOOR_PROPS.hay_round = (b, r) => {
  b.push([0, 0.75, 0], [0, 0, 0], [1, 1, 0.87]);
  b.cyl('hay', 0.74, 0.75, 1.36, 14, { r: [0, 0, PI / 2] });
  for (const x of [-0.35, 0.35]) b.cyl('rope', 0.755, 0.755, 0.03, 14, { p: [x, 0, 0], r: [0, 0, PI / 2], open: true });
  b.pop();
};

OUTDOOR_PROPS.hay_square = (b, r) => {
  b.box('hay', 1.18, 0.56, 0.58, { p: [0, 0.29, 0], r: [0, 0, 0.01] });
  for (const x of [-0.3, 0.3]) {
    b.box('rope', 0.02, 0.58, 0.02, { p: [x, 0.29, -0.3] });
    b.box('rope', 0.02, 0.58, 0.02, { p: [x, 0.29, 0.3] });
    b.box('rope', 0.02, 0.02, 0.6, { p: [x, 0.58, 0] });
  }
};

function crateBody(b, r, s, tint) {
  // inner box of planks + edge battens + diagonal braces on the sides
  const t = s * 0.07, h = s / 2;
  b.box('planks', s - 0.02, s - 0.02, s - 0.02, { p: [0, h, 0] });
  const bat = (sx, sy, sz, p, o = {}) => plank(b, 'wood', sx, sy, sz, { p, c: tint, ...o });
  for (const y of [t / 2, s - t / 2]) {
    for (const z of [-h + t / 2, h - t / 2]) bat(s, t, t, [0, y, z]);
    for (const x of [-h + t / 2, h - t / 2]) bat(t, t, s - 2 * t, [x, y, 0]);
  }
  for (const x of [-h + t / 2, h - t / 2]) for (const z of [-h + t / 2, h - t / 2]) bat(t, s - 2 * t, t, [x, h, z]);
  // diagonals on 4 sides
  const d = Math.hypot(s - 2 * t, s - 2 * t);
  for (const [dir, rot] of [['z', 0], ['x', PI / 2]])
    for (const sgn of [-1, 1]) {
      const off = sgn * (h - t / 2 + 0.005);
      b.group({ p: dir === 'z' ? [0, h, off] : [off, h, 0], r: [0, rot, 0] }, () => bat(d, t * 0.9, t * 0.6, [0, 0, 0], { r: [0, 0, PI / 4 * (sgn > 0 ? 1 : -1)] }));
    }
}

OUTDOOR_PROPS.crate = (b, r, v) => crateBody(b, r, 1, WOODS[v]);
OUTDOOR_PROPS.crate_small = (b, r, v) => {
  crateBody(b, r, 0.6, WOODS[v + 1]);
  if (v === 2) label(b, 'stencil', 'hazard_small', 0.2, 0.2, [0.1, 0.35, -0.31], 'z-');
};

OUTDOOR_PROPS.military_crate = (b, r) => {
  b.box('olive', 1.36, 0.58, 0.76, { p: [0, 0.31, 0] });
  b.box('olive', 1.4, 0.1, 0.8, { p: [0, 0.63, 0] }); // lid
  b.box('dark', 1.41, 0.012, 0.81, { p: [0, 0.58, 0] }); // lid seam
  for (const x of [-0.5, 0.5]) {
    b.box('olive', 0.08, 0.6, 0.8, { p: [x, 0.3, 0] });
    b.box('steel', 0.06, 0.08, 0.02, { p: [x, 0.57, -0.405] }); // latches
  }
  for (const sx of [-1, 1]) {
    b.box('steel', 0.02, 0.05, 0.3, { p: [sx * 0.69, 0.42, 0] });
    b.torus('rope', 0.07, 0.012, 4, 8, PI, { p: [sx * 0.71, 0.38, 0], r: [0, PI / 2, PI] });
  }
  label(b, 'stencil', 'army', 0.8, 0.36, [0, 0.33, -0.385], 'z-');
  label(b, 'stencil', 'numbers', 0.6, 0.18, [0.2, 0.685, 0.1], 'y+');
};

// the strongbox down the mine: a steel chest bound in iron, the padlock hanging open on its hasp (front: -z)
OUTDOOR_PROPS.strongbox = (b) => {
  const steel = [0.12, 0.13, 0.15];
  b.box('paint', 0.86, 0.4, 0.52, { p: [0, 0.2, 0], c: steel });
  b.box('paint', 0.9, 0.17, 0.56, { p: [0, 0.495, 0], c: steel.map((c) => c * 1.12) }); // lid
  b.box('dark', 0.905, 0.012, 0.565, { p: [0, 0.405, 0] }); // lid seam
  b.box('rust', 0.92, 0.04, 0.58, { p: [0, 0.02, 0] }); // skid
  for (const x of [-0.3, 0.3]) {
    b.box('rust', 0.07, 0.6, 0.585, { p: [x, 0.3, 0] }); // iron bands, over the lid and down both faces
    for (const y of [0.1, 0.3, 0.5]) b.cyl('steel', 0.012, 0.012, 0.6, 6, { p: [x, y, 0], r: [PI / 2, 0, 0] }); // rivets, through and through
  }
  for (const sx of [-1, 1]) b.torus('steel', 0.07, 0.012, 4, 8, PI, { p: [sx * 0.45, 0.3, 0], r: [0, PI / 2, PI] }); // drop handles
  b.box('steel', 0.1, 0.16, 0.02, { p: [0, 0.4, -0.29] }); // hasp
  b.group({ p: [0.02, 0.3, -0.31], r: [0, 0, 0.5] }, () => {
    b.box('chrome', 0.09, 0.08, 0.035, { p: [0, -0.04, 0] }); // padlock, sprung
    b.torus('steel', 0.03, 0.008, 4, 8, PI, { p: [0, 0.01, 0] });
  });
};

OUTDOOR_PROPS.barrel = (b, r, v) => {
  const cols = [[0.55, 0.14, 0.1], [0.2, 0.3, 0.45], [0.3, 0.34, 0.22], null];
  const c = cols[v];
  const mat = c ? 'paint' : 'rust';
  const tilt = v === 3 ? 0.06 : 0;
  b.group({ p: [0, 0, 0], r: [tilt, 0, tilt * 0.5] }, () => {
    b.cyl(mat, 0.3, 0.3, 0.94, 12, { p: [0, 0.47, 0], c });
    for (const y of [0.32, 0.64]) b.cyl(mat, 0.315, 0.315, 0.04, 12, { p: [0, y, 0], open: true, c });
    b.cyl(mat, 0.315, 0.315, 0.04, 12, { p: [0, 0.93, 0], open: true, c });
    b.cyl(mat, 0.315, 0.315, 0.04, 12, { p: [0, 0.02, 0], open: true, c });
    b.cyl('dark', 0.035, 0.035, 0.02, 6, { p: [0.15, 0.95, 0.05] });
    if (v === 0) label(b, 'labels', 'hazard_small', 0.22, 0.22, [0, 0.55, -0.305], 'z-');
  });
};

OUTDOOR_PROPS.sandbags = (b, r, v) => {
  // 4 staggered courses along a slight arc, bags ~0.62 x 0.2 x 0.55
  const rows = 4;
  for (let j = 0; j < rows; j++) {
    const n = j % 2 ? 3 : 4;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.6 + rr(r, -0.03, 0.03);
      const u = x / 1.2;
      const z = (u * u) * 0.12 - 0.04;
      b.sphere('burlap', 0.5, 6, 4, { p: [x, 0.11 + j * 0.205, z], s: [0.64, 0.24, 0.58 - j * 0.04], r: [0, -u * 0.25 + rr(r, -0.08, 0.08), rr(r, -0.04, 0.04)] });
    }
  }
};

OUTDOOR_PROPS.heli_wreck = (b, r) => {
  const dark = [0.2, 0.2, 0.18];
  const e = 0.62;
  const prof = (t) => {
    const a = t * PI * 2;
    const cs = Math.cos(a), sn = Math.sin(a);
    return [Math.sign(cs) * Math.abs(cs) ** e, Math.sign(sn) * Math.abs(sn) ** e];
  };
  const secs = [
    { z: -5.2, w: 0.5, h: 0.5, y: -0.35 },
    { z: -4.85, w: 1.6, h: 1.45, y: -0.15 },
    { z: -4.1, w: 2.25, h: 2.1, y: 0.0 },
    { z: -2.9, w: 2.5, h: 2.35, y: 0.05 },
    { z: 0.8, w: 2.5, h: 2.35, y: 0.05 },
    { z: 1.6, w: 1.8, h: 1.75, y: 0.3 },
    { z: 2.3, w: 0.95, h: 1.0, y: 0.55 },
  ];
  // point on the fuselage surface (local frame) at z and around-parameter t
  const fus = (z, t, out = 1.012) => {
    let k = 0;
    while (k < secs.length - 2 && z > secs[k + 1].z) k++;
    const A = secs[k], B = secs[k + 1], f = Math.min(1, Math.max(0, (z - A.z) / (B.z - A.z)));
    const w = A.w + (B.w - A.w) * f, h = A.h + (B.h - A.h) * f, y = A.y + (B.y - A.y) * f;
    const [px, py] = prof(t);
    return [px * w * 0.5 * out, py * h * 0.5 * out + y, z];
  };
  // a patch on the skin, cut where the skin bends (at its sections and its loft's edges) so that no flat piece of it
  // cuts a chord under the curve and is hidden by the skin
  const AROUND = 14;
  const cuts = (a, b0, at) => [a, ...at.filter((v) => v > a + 1e-6 && v < b0 - 1e-6), b0];
  const panel = (mat, z0, z1, t0, t1, out = 1.012) => {
    const o = mat === 'canopy' ? { c: paneLook(0.6, t0 * 9) } : {};
    const zs = cuts(z0, z1, secs.map((s) => s.z));
    const ts = cuts(t0, t1, Array.from({ length: 2 * AROUND + 1 }, (_, k) => k / AROUND - 1));
    for (let i = 0; i < zs.length - 1; i++)
      for (let j = 0; j < ts.length - 1; j++) {
        const [za, zb, ta, tb] = [zs[i], zs[i + 1], ts[j], ts[j + 1]];
        const zm = (za + zb) / 2;
        const c = fus(zm, (ta + tb) / 2, 0);
        b.quadOut(mat, [fus(za, ta, out), fus(zb, ta, out), fus(zb, tb, out), fus(za, tb, out)], [0, c[1], zm], o);
      }
  };
  // ---- fuselage, rolled onto its side (local +y now faces +X/up, local -x faces up-left)
  b.push([0.15, 1.28, 0], [0, 0, -0.95]);
  b.loft('olive', secs, prof, AROUND, { flip: true });
  b.sphere('olive', 0.26, 6, 4, { p: [0, -0.35, -5.2], s: [1, 1, 0.6] });
  b.cyl('charred', 0.47, 0.47, 0.04, 10, { p: [0, 0.55, 2.3], r: [PI / 2, 0, 0] });
  // cockpit glass (windshields, chin windows, doors): `canopy` - the hull is a closed skin, with nothing behind them
  panel('canopy', -4.95, -4.05, 0.03, 0.21);
  panel('canopy', -4.95, -4.05, 0.29, 0.47);
  panel('canopy', -5.1, -4.45, 0.55, 0.7);
  panel('canopy', -5.1, -4.45, 0.8, 0.95);
  panel('canopy', -3.9, -3.2, 0.44, 0.56);
  panel('canopy', -3.9, -3.2, -0.06, 0.06);
  // open cabin doors (dark holes) + scorch patches
  panel('dark', -2.7, -0.7, 0.42, 0.6, 1.01);
  panel('dark', -2.7, -1.2, -0.08, 0.1, 1.01);
  panel('charred', -1.0, 1.4, 0.15, 0.36, 1.02);
  panel('charred', 0.4, 1.9, 0.6, 0.72, 1.02);
  panel('charred', -4.3, -3.5, 0.62, 0.75, 1.02);
  // engine housing + exhaust on top
  b.frustum('olive', 1.3, 2.6, 1.0, 2.2, 1.05, 1.55, { p: [0, 0, -0.5] });
  b.cylBetween('charred', [0, 1.35, 0.6], [0, 1.5, 1.4], 0.22, 0.26, 7);
  // mast + hub
  b.cyl('steel', 0.13, 0.15, 0.45, 6, { p: [0, 1.75, -0.9] });
  b.cyl('steel', 0.3, 0.3, 0.14, 8, { p: [0, 2.0, -0.9] });
  // skids: upper one intact on struts, lower one crushed
  b.cylBetween('steel', [-1.25, -1.4, -3.4], [-1.25, -1.4, 0.9], 0.055, 0.055, 6);
  b.cylBetween('steel', [-1.25, -1.4, -3.4], [-1.25, -1.2, -3.8], 0.055, 0.055, 6);
  for (const z of [-2.4, 0.1]) b.cylBetween('steel', [-0.95, -1.05, z], [-1.25, -1.4, z], 0.045, 0.045, 5);
  b.cylBetween('steel', [1.0, -1.1, -2.2], [1.15, -1.3, 0.2], 0.05, 0.05, 5);
  // attached tail boom (thin), broken at z~5
  b.loft('olive', [{ z: 2.2, w: 0.72, h: 0.8, y: 0.55 }, { z: 5.0, w: 0.46, h: 0.52, y: 0.5 }], prof, 8, { flip: true });
  b.cyl('charred', 0.24, 0.24, 0.03, 8, { p: [0, 0.5, 5.0], r: [PI / 2, 0, 0], s: [1, 1, 1.1] });
  label(b, 'stencil', 'army', 1.3, 0.5, fus(0.35, 0.5, 1.02), 'x-');
  b.pop();
  // ---- broken tail section lying on the ground, fin + tail rotor
  b.group({ p: [0.6, 0.0, 5.35], r: [-0.22, 0.16, 0] }, () => {
    b.loft('olive', [{ z: 0, w: 0.44, h: 0.5, y: 0.35 }, { z: 2.4, w: 0.32, h: 0.38, y: 0.35 }], prof, 8, { flip: true });
    b.cyl('charred', 0.22, 0.22, 0.03, 8, { p: [0, 0.35, 0], r: [PI / 2, 0, 0] });
    b.hull('olive', [[-0.03, 0.4, 2.0], [0.03, 0.4, 2.0], [-0.03, 1.6, 2.6], [0.03, 1.6, 2.6], [-0.03, 0.4, 2.6], [0.03, 0.4, 2.6], [-0.03, 1.6, 2.95], [0.03, 1.6, 2.95]]);
    b.cyl('steel', 0.07, 0.07, 0.14, 6, { p: [0.1, 1.25, 2.6], r: [0, 0, PI / 2] });
    b.box('paint', 0.03, 1.3, 0.12, { p: [0.18, 1.25, 2.6], r: [0.5, 0, 0], c: dark });
    b.box('olive', 0.9, 0.04, 0.3, { p: [0, 0.4, 1.6] });
  });
  // main rotor: one blade drooped from the hub to the ground, one broken piece nearby
  const hub = [1.3, 2.25, -0.9];
  b.beam('paint', hub, [2.1, 1.5, -2.6], 0.5, 0.05, { c: dark, side: [0, 1, 0] });
  b.beam('paint', [2.1, 1.5, -2.6], [2.3, 0.05, -5.2], 0.5, 0.05, { c: dark, side: [1, 0.3, 0] });
  b.beam('paint', [-1.4, 0.05, -4.8], [-2.2, 0.04, -1.0], 0.5, 0.05, { c: dark, side: [0, 1, 0] });
  b.beam('paint', [-1.2, 0.05, 1.8], [-1.9, 0.12, 5.6], 0.5, 0.05, { c: dark, side: [0.3, 1, 0] });
  // scorched debris
  for (let k = 0; k < 7; k++) b.box('charred', rr(r, 0.2, 0.6), 0.04, rr(r, 0.2, 0.5), { p: [rr(r, -2, 2), 0.02, rr(r, -5, 3)], r: [0, r() * 3, 0] });
  b.box('olive', 0.9, 0.05, 0.7, { p: [-1.8, 0.1, 2.8], r: [0.1, 0.5, 0.15] });
};

OUTDOOR_PROPS.military_tent = (b, r) => {
  const W = 3.9, L = 5.8, wallH = 1.55, H = 2.55;
  const hw = W / 2, hl = L / 2;
  // walls
  for (const sx of [-1, 1]) {
    b.poly('canvas_mil', [[sx * hw, 0, -hl], [sx * hw, 0, hl], [sx * (hw - 0.05), wallH, hl], [sx * (hw - 0.05), wallH, -hl]], sx > 0 ? [[0, 1, 2], [0, 2, 3]] : [[1, 0, 3], [1, 3, 2]]);
    // roof slopes (slight sag)
    const v = [];
    const f = [];
    for (let i = 0; i <= 4; i++) {
      const z = -hl + (i / 4) * L;
      const sagk = Math.sin((i / 4) * PI) * 0.08;
      v.push([sx * (hw - 0.05), wallH, z], [sx * 0.02, H - sagk, z]);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 2;
      if (sx > 0) f.push([a, a + 2, a + 1], [a + 1, a + 2, a + 3]);
      else f.push([a, a + 1, a + 2], [a + 1, a + 3, a + 2]);
    }
    b.poly('canvas_mil', v, f);
  }
  // back gable (closed)
  b.poly('canvas_mil', [[-hw, 0, hl], [hw, 0, hl], [hw - 0.05, wallH, hl], [0, H, hl], [-hw + 0.05, wallH, hl]], [[0, 1, 2], [0, 2, 3], [0, 3, 4]]);
  // front gable: upper triangle closed, door open (dark interior back plane), rolled flap
  b.poly('canvas_mil', [[-hw + 0.05, wallH, -hl], [hw - 0.05, wallH, -hl], [0, H, -hl]], [[1, 0, 2]]);
  for (const sx of [-1, 1]) b.poly('canvas_mil', [[sx * hw, 0, -hl], [sx * 0.75, 0, -hl], [sx * 0.75, wallH, -hl], [sx * (hw - 0.05), wallH, -hl]], sx > 0 ? [[1, 0, 3], [1, 3, 2]] : [[0, 1, 2], [0, 2, 3]]);
  b.cyl('canvas_mil', 0.12, 0.12, 1.55, 8, { p: [0, wallH + 0.05, -hl - 0.05], r: [0, 0, PI / 2] });
  b.poly('dark', [[-hw + 0.1, 0.01, hl - 0.1], [hw - 0.1, 0.01, hl - 0.1], [hw - 0.1, 0.01, -hl + 0.1], [-hw + 0.1, 0.01, -hl + 0.1]], [[0, 1, 2], [0, 2, 3]]);
  b.poly('dark', [[-hw + 0.08, 0, hl - 0.06], [hw - 0.08, 0, hl - 0.06], [hw - 0.1, wallH, hl - 0.06], [0, H - 0.08, hl - 0.06], [-hw + 0.1, wallH, hl - 0.06]], [[1, 0, 2], [0, 3, 2], [0, 4, 3]]);
  // poles, ridge, guy lines, stakes
  b.cyl('wood', 0.04, 0.04, H, 6, { p: [0, H / 2, -hl + 0.05], c: WOODS[2] });
  b.cyl('wood', 0.04, 0.04, H, 6, { p: [0, H / 2, hl - 0.05], c: WOODS[2] });
  for (const sx of [-1, 1])
    for (const z of [-hl + 0.3, 0, hl - 0.3]) {
      b.cylBetween('rope', [sx * (hw - 0.05), wallH, z], [sx * (hw + 0.05) * 1.0, 0.02, z], 0.006, 0.006, 3);
    }
  // cot + crate inside the door
  b.box('olive', 0.7, 0.35, 1.9, { p: [-1.1, 0.2, 0.6] });
  b.box('olive', 0.8, 0.5, 0.6, { p: [1.1, 0.25, 1.9] });
};

OUTDOOR_PROPS.boat = (b, r, v) => {
  const col = v ? [0.5, 0.56, 0.52] : [0.62, 0.62, 0.58];
  const secs = [];
  const N = 7;
  for (let k = 0; k <= N; k++) {
    const t = k / N; // bow (-z) .. stern (+z)
    const z = -2 + t * 4;
    const w = 1.36 * Math.pow(Math.sin(Math.min(1, t * 1.6 + 0.02) * PI * 0.5), 0.8) * (t > 0.85 ? 0.95 : 1);
    const h = 0.62 - (t > 0.1 ? 0 : (0.1 - t) * -1.0);
    secs.push({ z, w: Math.max(0.02, w), h: h * 2, y: 0.64 + (t < 0.15 ? (0.15 - t) * 0.6 : 0), bot: t });
  }
  const hull = (t) => {
    // U-shape from left gunwale (t=0) down to keel and up to right gunwale (t=1)
    const a = (t - 0.5) * PI;
    return [Math.sin(a), -(Math.cos(a) ** 1.4)];
  };
  b.loft('paint', secs, hull, 8, { c: col, flip: true });
  const inner = secs.map((s) => ({ ...s, w: Math.max(0.01, s.w - 0.07), h: s.h - 0.1 }));
  b.loft('wood', inner, hull, 8, { c: WOODS[3] });
  // transom
  const st = secs[N];
  const tv = [];
  for (let k = 0; k <= 8; k++) {
    const [x, y] = hull(k / 8);
    tv.push([x * st.w * 0.5, y * st.h * 0.5 + st.y, st.z]);
  }
  const tf = [];
  for (let k = 1; k < 8; k++) tf.push([0, k, k + 1]);
  b.poly('wood', tv, tf, { c: WOODS[2] });
  // gunwale rails, thwarts, oars
  for (const sx of [-1, 1]) {
    for (let k = 1; k < N; k++) {
      const a = secs[k], c = secs[k + 1];
      b.beam('wood', [sx * a.w * 0.5, a.y + 0.01, a.z], [sx * c.w * 0.5, c.y + 0.01, c.z], 0.05, 0.04, { c: WOODS[1] });
    }
  }
  for (const z of [-0.5, 0.6]) plank(b, 'wood', 1.2, 0.04, 0.22, { p: [0, 0.45, z], c: WOODS[0] });
  plank(b, 'wood', 0.08, 0.03, 2.2, { p: [0.3, 0.2, 0.1], r: [0.05, 0.1, 0], c: WOODS[1] });
  b.box('wood', 0.14, 0.02, 0.5, { p: [0.36, 0.22, 1.2], r: [0.05, 0.1, 0], c: WOODS[1] });
  b.box('water_dark', 0.7, 0.01, 1.8, { p: [0, 0.14, 0.3] });
};

OUTDOOR_PROPS.gas_pump = (b, r) => {
  const col = [0.62, 0.16, 0.12];
  b.box('concrete', 0.8, 0.14, 0.6, { p: [0, 0.07, 0] });
  b.box('paint', 0.62, 1.3, 0.42, { p: [0, 0.79, 0.02], c: col });
  b.box('paint', 0.66, 0.36, 0.46, { p: [0, 1.62, 0.02], c: [0.8, 0.78, 0.72] });
  b.cyl('paint', 0.23, 0.23, 0.46, 12, { theta: [-PI / 2, PI], p: [0, 1.8, 0.02], r: [PI / 2, 0, 0], c: [0.8, 0.78, 0.72] });
  label(b, 'labels', 'pump', 0.5, 0.5, [0, 1.12, -0.205], 'z-');
  b.box('glass', 0.5, 0.26, 0.01, { p: [0, 1.62, -0.215] });
  // nozzle holster on the side + hose loop
  b.box('steel', 0.08, 0.2, 0.12, { p: [0.35, 1.05, -0.05] });
  b.cylBetween('steel', [0.38, 1.1, -0.08], [0.42, 0.95, -0.2], 0.018, 0.022, 5);
  b.tube('rubber', [[0.31, 0.55, 0.1], [0.38, 0.3, -0.05], [0.42, 0.25, -0.3], [0.4, 0.6, -0.28], [0.4, 0.95, -0.2]], 0.022, 14, 5);
  label(b, 'stencil', 'bullet', 0.04, 0.04, [-0.15, 0.7, -0.195], 'z-');
  label(b, 'stencil', 'bullet', 0.035, 0.035, [0.1, 0.55, -0.195], 'z-');
};

function gravestoneShape(b, r, v) {
  const tilt = [0.04, -0.06, 0.18, -0.1][v];
  b.box('gravestone', 0.62, 0.1, 0.24, { p: [0, 0.05, 0] });
  b.group({ p: [0, 0.1, 0], r: [tilt, 0, tilt * 0.4] }, () => {
    if (v === 0) {
      b.box('gravestone', 0.52, 0.55, 0.16, { p: [0, 0.275, 0] });
      b.cyl('gravestone', 0.26, 0.26, 0.16, 10, { theta: [-PI / 2, PI], p: [0, 0.55, 0], r: [PI / 2, 0, 0] });
      label(b, 'stencil', 'grave', 0.42, 0.21, [0, 0.45, -0.081], 'z-');
    } else if (v === 1) {
      b.box('gravestone', 0.16, 0.78, 0.13, { p: [0, 0.39, 0] });
      b.box('gravestone', 0.5, 0.15, 0.13, { p: [0, 0.56, 0] });
      b.box('gravestone', 0.32, 0.22, 0.18, { p: [0, 0.11, 0] });
    } else if (v === 2) {
      // broken slab: stump + fallen top piece
      b.box('gravestone', 0.5, 0.42, 0.15, { p: [0, 0.21, 0] });
      label(b, 'stencil', 'grave', 0.38, 0.19, [0, 0.24, -0.076], 'z-');
    } else {
      b.frustum('gravestone', 0.46, 0.18, 0.4, 0.15, 0, 0.7, {});
      b.frustum('gravestone', 0.4, 0.15, 0.02, 0.02, 0.7, 0.86, {});
      label(b, 'stencil', 'grave', 0.34, 0.17, [0, 0.46, -0.083], 'z-', 0);
    }
  });
  if (v === 2) b.box('gravestone', 0.5, 0.14, 0.4, { p: [0.08, 0.07, -0.02], r: [0, 0.4, 0.06] });
}
OUTDOOR_PROPS.gravestone = (b, r, v) => gravestoneShape(b, r, v);

OUTDOOR_PROPS.grave_cross = (b, r, v) => {
  const tint = WOODS[v + 1].map((c) => c * 0.8);
  b.group({ r: [rr(r, -0.1, 0.1), 0, [0.12, -0.08, 0.2][v]] }, () => {
    plank(b, 'wood', 0.09, 1.4, 0.07, { p: [0, 0.7, 0], c: tint });
    plank(b, 'wood', 0.56, 0.08, 0.06, { p: [0, 1.08, -0.01], r: [0, 0, [0.04, -0.1, 0.25][v]], c: tint });
    if (v === 1) b.torus('rope', 0.05, 0.012, 4, 8, PI * 2, { p: [0, 1.08, -0.02], r: [0, 0, PI / 4] });
    if (v === 2) b.plane('cloth', 0.1, 0.35, { p: [0.15, 0.9, -0.05], r: [0, 0, 0.1], c: [0.5, 0.1, 0.08] });
  });
};

OUTDOOR_PROPS.fence = (b, r, v) => {
  const tint = WOODS[(v + 2) % WOODS.length];
  for (const x of [-1.44, 1.44]) plank(b, 'wood', 0.12, 1.1 + rr(r, -0.05, 0.05), 0.12, { p: [x, 0.55, 0], r: [rr(r, -0.04, 0.04), 0, rr(r, -0.04, 0.04)], c: tint });
  plank(b, 'wood', 0.1, 1.0, 0.1, { p: [0, 0.5, 0], c: tint, r: [0, 0, 0.03] });
  const ys = [0.95, 0.62, 0.3];
  ys.forEach((y, k) => {
    if (v === 1 && k === 1) {
      // broken rail: two hanging halves
      plank(b, 'wood', 1.4, 0.1, 0.04, { p: [-0.75, y - 0.2, -0.08], r: [0, 0, 0.28], c: tint });
      plank(b, 'wood', 0.9, 0.1, 0.04, { p: [0.95, y - 0.12, -0.08], r: [0, 0, -0.3], c: tint });
      return;
    }
    plank(b, 'wood', 3.0, 0.1, 0.04, { p: [0, y + rr(r, -0.02, 0.02), -0.08], r: [0, 0, rr(r, -0.02, 0.02)], c: tint });
  });
  if (v === 2) weeds(b, r, [[-1.2, 0.1], [0.8, 0.05]], 0.6);
};

OUTDOOR_PROPS.picnic_table = (b, r) => {
  const t = WOODS[1];
  for (let k = 0; k < 5; k++) plank(b, 'wood', 1.8, 0.05, 0.14, { p: [0, 0.76, -0.3 + k * 0.15], c: t });
  for (const z of [-0.62, 0.62]) {
    plank(b, 'wood', 1.8, 0.05, 0.13, { p: [0, 0.45, z - 0.06], c: t });
    plank(b, 'wood', 1.8, 0.05, 0.13, { p: [0, 0.45, z + 0.08], c: t });
  }
  for (const x of [-0.7, 0.7]) {
    for (const s of [-1, 1]) b.beam('wood', [x, 0, s * 0.72], [x, 0.74, s * 0.05], 0.1, 0.05, { c: t, side: [1, 0, 0] });
    plank(b, 'wood', 0.06, 0.08, 1.5, { p: [x, 0.4, 0], c: t });
  }
};

OUTDOOR_PROPS.outhouse = (b, r) => {
  const t = WOODS[2];
  // walls (planks) with a slanted tin roof; door faces -Z with moon cutout
  b.box('planks', 1.1, 2.0, 0.05, { p: [0, 1.0, 0.53] });
  for (const sx of [-1, 1]) b.box('planks', 0.05, 2.0, 1.1, { p: [sx * 0.53, 1.0, 0] });
  b.box('planks', 1.1, 0.4, 0.05, { p: [0, 1.95, -0.53] });
  for (const sx of [-1, 1]) for (const z of [-0.53, 0.53]) plank(b, 'wood', 0.08, 2.15, 0.08, { p: [sx * 0.53, 1.07, z], c: t });
  // door slightly ajar
  b.group({ p: [-0.46, 0, -0.56], r: [0, 0.35, 0] }, () => {
    b.box('planks', 0.9, 1.72, 0.04, { p: [0.45, 0.92, 0] });
    for (const y of [0.3, 1.5]) plank(b, 'wood', 0.86, 0.1, 0.03, { p: [0.45, y, -0.03], c: t });
    b.beam('wood', [0.1, 0.35, -0.03], [0.8, 1.45, -0.03], 0.08, 0.03, { c: t });
    label(b, 'stencil', 'moon', 0.22, 0.22, [0.45, 1.6, -0.022], 'z-');
    b.box('rust', 0.04, 0.1, 0.03, { p: [0.8, 0.95, -0.03] });
  });
  b.box('dark', 1.0, 1.9, 0.01, { p: [0, 0.95, -0.5] });
  b.box('tin', 1.4, 0.04, 1.45, { p: [0, 2.2, -0.02], r: [-0.14, 0, 0] });
};

OUTDOOR_PROPS.water_tower = (b, r) => {
  const legX = 1.6, top = 8;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.box('rust', 0.26, top, 0.26, { p: [sx * legX, top / 2, sz * legX] });
  // cross bracing on each face, 2 levels
  const brace = (a, c) => b.cylBetween('steel', a, c, 0.03, 0.03, 4);
  for (const lvl of [[0.3, 4], [4, 7.7]]) {
    const [y0, y1] = lvl;
    for (const s of [-1, 1]) {
      brace([-legX, y0, s * legX], [legX, y1, s * legX]);
      brace([legX, y0, s * legX], [-legX, y1, s * legX]);
      brace([s * legX, y0, -legX], [s * legX, y1, legX]);
      brace([s * legX, y0, legX], [s * legX, y1, -legX]);
    }
    for (const s of [-1, 1]) {
      b.box('rust', 3.3, 0.12, 0.12, { p: [0, y1, s * legX] });
      b.box('rust', 0.12, 0.12, 3.3, { p: [s * legX, y1, 0] });
    }
  }
  // platform + tank (wooden staves + hoops) + conical roof
  b.box('dockwood', 3.9, 0.12, 3.9, { p: [0, top + 0.06, 0] });
  b.cyl('wood', 1.85, 1.85, 3.3, 16, { p: [0, top + 0.12 + 1.65, 0], grain: true, c: [0.62, 0.55, 0.48] });
  for (const y of [0.4, 1.2, 2.0, 2.8]) b.cyl('rust', 1.88, 1.88, 0.07, 16, { p: [0, top + 0.12 + y, 0], open: true });
  b.cyl('rust', 0.1, 2.05, 0.6, 16, { p: [0, top + 0.12 + 3.3 + 0.3, 0] });
  // railing around platform
  for (const s of [-1, 1]) {
    b.box('rust', 3.9, 0.05, 0.05, { p: [0, top + 1.0, s * 1.93] });
    b.box('rust', 0.05, 0.05, 3.9, { p: [s * 1.93, top + 1.0, 0] });
    for (const t of [-1, 0, 1]) {
      b.box('rust', 0.05, 0.9, 0.05, { p: [t * 1.9, top + 0.55, s * 1.93] });
      b.box('rust', 0.05, 0.9, 0.05, { p: [s * 1.93, top + 0.55, t * 1.9] });
    }
  }
  // ladder on the front leg
  for (const sx of [-0.2, 0.2]) b.box('rust', 0.04, top + 1, 0.04, { p: [legX * -0.2 + sx, (top + 1) / 2, -legX - 0.18] });
  for (let y = 0.4; y < top + 0.8; y += 0.4) b.box('rust', 0.44, 0.03, 0.03, { p: [-legX * 0.2, y, -legX - 0.18] });
  // outlet pipe
  b.cylBetween('rust', [0.4, top, 0.3], [0.5, 0.3, 0.6], 0.07, 0.07, 6);
};

OUTDOOR_PROPS.watchtower = (b, r) => {
  const L = 1.7, floor = 8;
  const t = WOODS[2];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(b, 'wood', 0.32, floor, 0.32, { p: [sx * L, floor / 2, sz * L], c: t });
  const br = (a, c) => b.beam('wood', a, c, 0.12, 0.08, { c: WOODS[1] });
  for (const [y0, y1] of [[0.4, 4], [4, 7.6]]) {
    for (const s of [-1, 1]) {
      br([-L, y0, s * L], [L, y1, s * L]);
      br([L, y0, s * L], [-L, y1, s * L]);
      br([s * L, y0, -L], [s * L, y1, L]);
      br([s * L, y0, L], [s * L, y1, -L]);
      plank(b, 'wood', 3.6, 0.14, 0.1, { p: [0, y1, s * L], c: t });
      plank(b, 'wood', 0.1, 0.14, 3.6, { p: [s * L, y1, 0], c: t });
    }
  }
  // floor deck
  b.box('planks', 4.0, 0.16, 4.0, { p: [0, floor + 0.08, 0] });
  // cabin: posts, half walls, window frames, pyramid roof
  const cy = floor + 0.16, cH = 2.1, hw = 1.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(b, 'wood', 0.14, cH, 0.14, { p: [sx * hw, cy + cH / 2, sz * hw], c: t });
  for (const s of [-1, 1]) {
    b.box('planks', 3.6, 0.95, 0.06, { p: [0, cy + 0.475, s * hw] });
    b.box('planks', 0.06, 0.95, 3.6, { p: [s * hw, cy + 0.475, 0] });
    plank(b, 'wood', 3.7, 0.08, 0.14, { p: [0, cy + 0.98, s * hw], c: t });
    plank(b, 'wood', 0.14, 0.08, 3.7, { p: [s * hw, cy + 0.98, 0], c: t });
    plank(b, 'wood', 3.7, 0.1, 0.1, { p: [0, cy + cH, s * hw], c: t });
    plank(b, 'wood', 0.1, 0.1, 3.7, { p: [s * hw, cy + cH, 0], c: t });
    // mullions + some glass
    for (const k of [-0.6, 0.6]) {
      plank(b, 'wood', 0.06, 1.1, 0.06, { p: [k * hw, cy + 1.55, s * hw], c: t });
      plank(b, 'wood', 0.06, 1.1, 0.06, { p: [s * hw, cy + 1.55, k * hw], c: t });
    }
    if (s > 0) b.box('glass', 1.1, 1.0, 0.02, { p: [0, cy + 1.55, s * hw] });
    b.box('glass', 0.02, 1.0, 0.9, { p: [s * hw, cy + 1.55, s * 1.2] });
  }
  // inner dark floor/back to read as interior
  b.box('dark', 3.4, 0.02, 3.4, { p: [0, cy + 0.01, 0] });
  const ry = cy + cH;
  b.frustum('shingles', 4.3, 4.3, 0.05, 0.05, ry + 0.05, ry + 0.95, {});
  b.box('trim', 4.3, 0.06, 4.3, { p: [0, ry + 0.04, 0] });
  // ladder up the front (-Z) to a trapdoor
  for (const sx of [-0.25, 0.25]) b.box('wood', 0.07, floor + 0.2, 0.07, { p: [sx, (floor + 0.2) / 2, -L - 0.35], r: [0.04, 0, 0], c: t });
  for (let y = 0.35; y < floor; y += 0.35) b.box('wood', 0.5, 0.04, 0.05, { p: [0, y, -L - 0.35 + (floor - y) * 0.02 - 0.16], c: t });
};

OUTDOOR_PROPS.power_pole = (b, r, v) => {
  const lean = v ? 0.03 : -0.02;
  b.group({ r: [lean, 0, lean * 0.5] }, () => {
    b.cyl('wood', 0.12, 0.16, 9, 8, { p: [0, 4.5, 0], grain: true, c: [0.55, 0.45, 0.38] });
    plank(b, 'wood', 2.0, 0.12, 0.1, { p: [0, 8.3, 0], c: [0.55, 0.47, 0.4] });
    for (const x of [-0.85, -0.3, 0.85]) {
      b.cyl('steel', 0.015, 0.015, 0.12, 4, { p: [x, 8.42, 0] });
      b.cyl('glass', 0.05, 0.06, 0.12, 6, { p: [x, 8.52, 0] });
    }
    b.beam('steel', [-0.6, 8.25, 0], [0, 7.8, 0], 0.03, 0.03);
    b.beam('steel', [0.6, 8.25, 0], [0, 7.8, 0], 0.03, 0.03);
    // transformer can
    if (v === 0) {
      b.cyl('metal', 0.22, 0.22, 0.65, 8, { p: [0, 7.1, -0.3] });
      b.box('rust', 0.1, 0.3, 0.1, { p: [0, 7.1, -0.1] });
    }
    // dangling broken wire
    b.tube('rubber', [[0.85, 8.52, 0], [0.9, 7.4, 0.1], [0.7, 5.6, 0.2], [0.5, 4.4, 0.1]], 0.01, 10, 3);
  });
};

OUTDOOR_PROPS.streetlight = (b, r) => {
  b.cyl('metal', 0.08, 0.11, 5.7, 8, { p: [0, 2.85, 0] });
  b.cyl('concrete', 0.18, 0.2, 0.25, 8, { p: [0, 0.12, 0] });
  b.tube('metal', [[0, 5.6, 0], [0, 5.85, -0.2], [0, 5.9, -0.8], [0, 5.85, -1.35]], 0.045, 8, 5);
  b.frustum('metal', 0.26, 0.5, 0.2, 0.44, 5.72, 5.9, { p: [0, 0, -1.4] });
  b.box('dark', 0.22, 0.02, 0.4, { p: [0, 5.71, -1.4] });
  b.poly('glass', [[-0.1, 5.7, -1.55], [0.1, 5.7, -1.55], [0.02, 5.62, -1.45]], [[0, 1, 2]]);
  b.cylBetween('rust', [0.1, 0.25, 0], [0.12, 1.5, 0.02], 0.02, 0.02, 4);
};

OUTDOOR_PROPS.road_sign = (b, r, v) => {
  const bend = v ? 0.12 : -0.08;
  b.cyl('steel', 0.03, 0.03, 2.3, 5, { p: [0, 1.15, 0] });
  b.group({ p: [0, 1.9, -0.035], r: [bend, 0, 0] }, () => {
    b.plane('labels', 0.62, 0.62, { atlas: 'sign', p: [0, 0, -0.012], r: [0, PI, PI / 4] });
    b.box('rust', 0.6, 0.6, 0.012, { p: [0, 0, 0], r: [0, 0, PI / 4] });
  });
};

OUTDOOR_PROPS.dumpster = (b, r) => {
  const col = [0.24, 0.36, 0.26];
  b.frustum('paint', 1.84, 1.1, 1.9, 1.16, 0.12, 1.2, { c: col });
  b.box('dark', 1.76, 0.02, 1.04, { p: [0, 1.19, 0] });
  for (const sx of [-1, 1]) {
    b.box('paint', 0.06, 0.12, 1.16, { p: [sx * 0.97, 0.9, 0], c: col });
    b.box('steel', 0.1, 0.12, 0.3, { p: [sx * 0.97, 0.5, 0], c: col });
  }
  for (const [x, z] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) b.cyl('rubber', 0.07, 0.07, 0.05, 8, { p: [x, 0.07, z], r: [PI / 2, 0, 0] });
  // lids: one closed, one propped open towards the back
  b.box('plastic', 0.92, 0.04, 1.2, { p: [-0.47, 1.22, 0] });
  b.group({ p: [0.47, 1.22, 0.58], r: [-1.2, 0, 0] }, () => b.box('plastic', 0.92, 0.04, 1.2, { p: [0, 0, -0.6] }));
  // garbage bags peeking out
  b.sphere('plastic', 0.3, 7, 5, { p: [0.4, 1.15, -0.15], s: [1, 0.7, 1] });
  b.sphere('plastic', 0.25, 7, 5, { p: [0.65, 1.2, 0.25], s: [1, 0.8, 0.9] });
};

OUTDOOR_PROPS.well = (b, r) => {
  b.cyl('stone', 0.75, 0.8, 0.85, 12, { p: [0, 0.425, 0], open: true });
  b.cyl('stone', 0.6, 0.6, 0.85, 12, { p: [0, 0.425, 0], open: true, s: [-1, 1, 1] });
  b.torus('stone', 0.68, 0.1, 5, 12, PI * 2, { p: [0, 0.86, 0], r: [PI / 2, 0, 0] });
  b.cyl('water_dark', 0.6, 0.6, 0.02, 10, { p: [0, 0.45, 0] });
  const t = WOODS[2];
  for (const sx of [-1, 1]) plank(b, 'wood', 0.12, 1.95, 0.12, { p: [sx * 0.72, 0.98, 0], c: t });
  // gable roof
  for (const sz of [-1, 1]) b.box('shingles', 1.7, 0.04, 0.72, { p: [0, 2.0, sz * 0.3], r: [sz * 0.6, 0, 0] });
  plank(b, 'wood', 1.7, 0.08, 0.08, { p: [0, 2.2, 0], c: t });
  // crank axle + handle, rope and bucket
  b.cyl('wood', 0.06, 0.06, 1.44, 6, { p: [0, 1.55, 0], r: [0, 0, PI / 2], c: t });
  b.cylBetween('steel', [0.76, 1.55, 0], [0.84, 1.55, 0], 0.015, 0.015, 4);
  b.cylBetween('steel', [0.84, 1.55, 0], [0.84, 1.3, -0.1], 0.015, 0.015, 4);
  b.cylBetween('wood', [0.84, 1.3, -0.1], [0.98, 1.3, -0.1], 0.025, 0.025, 5, { c: t });
  b.cyl('rope', 0.08, 0.08, 0.2, 8, { p: [0, 1.55, 0], r: [0, 0, PI / 2] });
  b.cylBetween('rope', [0, 1.49, 0], [0, 1.1, 0], 0.008, 0.008, 3);
  b.cyl('wood', 0.13, 0.1, 0.2, 8, { p: [0, 1.0, 0], c: WOODS[3] });
  b.torus('rust', 0.13, 0.008, 3, 8, PI, { p: [0, 1.1, 0] });
};

OUTDOOR_PROPS.woodpile = (b, r, v) => {
  // two end posts with stacked split logs
  const t = WOODS[1];
  for (const sx of [-1, 1]) for (const sz of [-0.3, 0.3]) plank(b, 'wood', 0.08, 1.1, 0.08, { p: [sx * 1.05, 0.55, sz], c: t, r: [0, 0, sx * 0.04] });
  plank(b, 'wood', 2.2, 0.08, 0.1, { p: [0, 0.04, -0.3], c: t });
  plank(b, 'wood', 2.2, 0.08, 0.1, { p: [0, 0.04, 0.3], c: t });
  const rows = v ? 3 : 4;
  for (let j = 0; j < rows; j++) {
    const n = 7 - (j % 2);
    for (let k = 0; k < n; k++) {
      const x = -0.84 + (k + (j % 2) * 0.5) * 0.28 + rr(r, -0.02, 0.02);
      const rad = rr(r, 0.1, 0.13);
      const y = 0.08 + rad + j * 0.23;
      const len = rr(r, 0.8, 0.95);
      const zo = rr(r, -0.05, 0.05);
      const rot = r() * PI;
      b.cyl('bark', rad, rad, len, 5, { p: [x, y, zo], r: [PI / 2, rot, 0], grain: true, open: true });
      for (const e of [-1, 1]) b.disc('woodend', rad, 5, { p: [x, y, zo + e * (len / 2 + 0.002)], r: [e * PI / 2, 0, rot] });
    }
  }
};

OUTDOOR_PROPS.scarecrow = (b, r) => {
  const t = WOODS[2];
  plank(b, 'wood', 0.09, 2.2, 0.09, { p: [0, 1.1, 0.05], c: t });
  plank(b, 'wood', 1.4, 0.07, 0.07, { p: [0, 1.52, 0.05], c: t });
  // burlap head (face texture wraps a sphere: face at -Z), tilted creepily
  b.group({ p: [0.02, 1.86, 0], r: [0.2, 0.15, 0.32] }, () => {
    b.sphere('scarecrow_head', 0.17, 10, 7, { raw: true, s: [0.95, 1.15, 0.95] });
    b.cyl('hay', 0.07, 0.1, 0.1, 6, { p: [0, -0.2, 0] });
    // hat
    b.cyl('cloth', 0.28, 0.3, 0.02, 12, { p: [0, 0.16, 0], c: [0.18, 0.15, 0.12] });
    b.cyl('cloth', 0.13, 0.15, 0.18, 10, { p: [0, 0.26, 0], c: [0.18, 0.15, 0.12] });
  });
  // tattered coat: torso + ragged hem + sleeves along the crossbar
  const coat = [0.3, 0.27, 0.22];
  b.frustum('cloth', 0.46, 0.26, 0.4, 0.2, 0.95, 1.6, { c: coat });
  for (let k = 0; k < 7; k++) {
    const x = -0.21 + k * 0.07;
    b.plane('cloth', 0.08, rr(r, 0.2, 0.42), { p: [x, 0.85, -0.135], c: coat, r: [0.1, 0, rr(r, -0.2, 0.2)] });
    b.plane('cloth', 0.08, rr(r, 0.2, 0.42), { p: [x, 0.85, 0.135], c: coat, r: [-0.1, PI, rr(r, -0.2, 0.2)] });
  }
  for (const sx of [-1, 1]) {
    b.cyl('cloth', 0.08, 0.1, 0.5, 7, { p: [sx * 0.42, 1.52, 0.03], r: [0, 0, PI / 2], c: coat });
    b.cyl('hay', 0.05, 0.08, 0.14, 5, { p: [sx * 0.72, 1.5, 0.03], r: [0, 0, sx * (PI / 2 + 0.4)] });
    b.plane('cloth', 0.12, 0.25, { p: [sx * 0.55, 1.36, 0.03], c: coat, r: [0, PI / 2, sx * 0.2] });
  }
  b.box('rope', 0.44, 0.03, 0.28, { p: [0, 1.06, 0] });
  b.plane('cloth', 0.12, 0.16, { p: [0.12, 1.3, -0.13], c: [0.4, 0.06, 0.05], r: [0, 0, 0.3] });
  // straw at feet
  b.cyl('hay', 0.2, 0.26, 0.08, 7, { p: [0, 0.04, 0.05] });
};

OUTDOOR_PROPS.shelf = (b, r) => {
  const hw = 0.88, hd = 0.23;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('steel', 0.04, 2.0, 0.04, { p: [sx * hw, 1.0, sz * hd] });
  const ys = [0.12, 0.6, 1.08, 1.56, 1.96];
  for (const y of ys) b.box('metal', 1.78, 0.03, 0.48, { p: [0, y, 0] });
  const junkCols = [[0.6, 0.12, 0.1], [0.2, 0.3, 0.45], [0.7, 0.6, 0.2], [0.3, 0.34, 0.22], [0.8, 0.78, 0.7]];
  for (let s = 0; s < 4; s++) {
    let x = -0.8;
    while (x < 0.75) {
      const kind = r();
      const y = ys[s] + 0.015;
      if (kind < 0.4) {
        const h = rr(r, 0.1, 0.16);
        b.cyl('paint', 0.045, 0.045, h, 7, { p: [x + 0.05, y + h / 2, rr(r, -0.1, 0.1)], c: pick(r, junkCols) });
        x += 0.12;
      } else if (kind < 0.75) {
        const w = rr(r, 0.2, 0.35), h = rr(r, 0.15, 0.3);
        b.box('cardboard', w, h, rr(r, 0.2, 0.34), { p: [x + w / 2, y + h / 2, 0], r: [0, rr(r, -0.2, 0.2), 0] });
        x += w + 0.04;
      } else if (kind < 0.88) {
        b.cyl('bottle', 0.035, 0.04, 0.2, 6, { p: [x + 0.04, y + 0.1, 0.05] });
        x += 0.1;
      } else x += 0.2;
    }
  }
  b.box('cardboard', 0.4, 0.3, 0.3, { p: [0.4, 0.15, 0.1], r: [0, 0.3, 0.3] });
};

OUTDOOR_PROPS.bed = (b, r) => {
  for (const sx of [-1, 1]) {
    b.box('steel', 0.04, 0.04, 1.98, { p: [sx * 0.48, 0.3, 0] });
    for (const sz of [-1, 1]) b.box('steel', 0.04, sz > 0 ? 0.95 : 0.55, 0.04, { p: [sx * 0.48, sz > 0 ? 0.475 : 0.275, sz * 0.97] });
  }
  for (const sz of [-1, 1]) b.box('steel', 0.96, 0.04, 0.04, { p: [0, sz > 0 ? 0.92 : 0.52, sz * 0.97] });
  for (let k = 0; k < 5; k++) b.box('steel', 0.02, 0.5, 0.02, { p: [-0.36 + k * 0.18, 0.62, 0.97] });
  b.box('mattress', 0.92, 0.2, 1.9, { p: [0, 0.42, 0], r: [0, 0, 0.02] });
  b.sphere('cloth', 0.28, 7, 4, { p: [0.05, 0.55, 0.72], s: [1.2, 0.3, 0.6], c: [0.7, 0.66, 0.58] });
  b.box('cloth', 0.95, 0.04, 0.9, { p: [0.05, 0.54, -0.35], r: [0, 0.1, 0.05], c: [0.3, 0.32, 0.28] });
  b.plane('cloth', 0.9, 0.4, { p: [0.5, 0.36, -0.35], r: [0, PI / 2, 0.1], c: [0.3, 0.32, 0.28] });
};

OUTDOOR_PROPS.table = (b, r) => {
  const t = WOODS[1];
  for (let k = 0; k < 5; k++) plank(b, 'wood', 1.5, 0.05, 0.18, { p: [0, 0.77, -0.36 + k * 0.18], c: t });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(b, 'wood', 0.07, 0.74, 0.07, { p: [sx * 0.66, 0.37, sz * 0.36], c: t });
  for (const sz of [-1, 1]) plank(b, 'wood', 1.3, 0.08, 0.03, { p: [0, 0.68, sz * 0.36], c: t });
  b.cyl('bottle', 0.035, 0.04, 0.25, 6, { p: [0.4, 0.92, 0.1] });
  b.cyl('paint', 0.05, 0.05, 0.11, 7, { p: [-0.3, 0.85, -0.1], c: [0.7, 0.6, 0.2] });
  b.plane('blood_decal', 0.4, 0.4, { raw: true, p: [0.1, 0.8, 0.15], r: [-PI / 2, 0, 0.5] });
};

OUTDOOR_PROPS.chair = (b, r, v) => {
  const t = WOODS[(v + 1) % 5];
  const tipped = v === 2;
  b.group(tipped ? { p: [0, 0.25, 0.1], r: [-PI / 2 + 0.05, 0.4, 0] } : { p: [0, 0, 0], r: [0, v ? 0.3 : 0, 0] }, () => {
    b.push(tipped ? [0, -0.25, 0] : [0, 0, 0]);
    plank(b, 'wood', 0.44, 0.04, 0.42, { p: [0, 0.46, 0], c: t });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) plank(b, 'wood', 0.04, 0.46, 0.04, { p: [sx * 0.19, 0.23, sz * 0.18], c: t });
    for (const sx of [-1, 1]) plank(b, 'wood', 0.04, 0.46, 0.04, { p: [sx * 0.19, 0.69, 0.19], c: t });
    for (const y of [0.62, 0.78, 0.9]) plank(b, 'wood', 0.42, 0.06, 0.025, { p: [0, y, 0.19], c: t });
    b.pop();
  });
};

OUTDOOR_PROPS.pallet = (b, r) => {
  const t = WOODS[3];
  for (const z of [-0.45, 0, 0.45]) plank(b, 'wood', 1.2, 0.09, 0.1, { p: [0, 0.065, z], c: t });
  for (let k = 0; k < 7; k++) {
    if (k === 4) continue;
    plank(b, 'wood', 0.12, 0.025, 1.0, { p: [-0.54 + k * 0.18, 0.1375, 0], c: t });
  }
  for (let k = 0; k < 3; k++) plank(b, 'wood', 0.12, 0.02, 1.0, { p: [-0.5 + k * 0.5, 0.01, 0], c: t });
};

OUTDOOR_PROPS.tire_pile = (b, r, v) => {
  const n = v ? 3 : 4;
  for (let k = 0; k < n; k++) {
    const R = 0.36;
    const x = rr(r, -0.15, 0.15), z = rr(r, -0.15, 0.15);
    b.group({ p: [x, 0.11 + k * 0.2, z], r: [rr(r, -0.05, 0.05), 0, rr(r, -0.05, 0.05)] }, () => {
      const prof = [[0.2, -0.1], [0.3, -0.11], [R, -0.06], [R, 0.06], [0.3, 0.11], [0.2, 0.1]];
      b.lathe('tire', prof, 12, {});
    });
  }
  if (v) b.group({ p: [0.45, 0.35, -0.2], r: [0.2, 0.4, PI / 2 - 0.3] }, () => b.lathe('tire', [[0.2, -0.1], [0.3, -0.11], [0.35, -0.06], [0.35, 0.06], [0.3, 0.11], [0.2, 0.1]], 12, {}));
};

OUTDOOR_PROPS.pew = (b, r) => {
  const t = [0.55, 0.42, 0.34];
  plank(b, 'wood', 2.5, 0.05, 0.42, { p: [0, 0.45, -0.04], c: t });
  plank(b, 'wood', 2.5, 0.42, 0.04, { p: [0, 0.73, 0.2], r: [-0.12, 0, 0], c: t });
  plank(b, 'wood', 2.5, 0.06, 0.07, { p: [0, 0.94, 0.23], c: t });
  for (const sx of [-1, 1]) {
    b.box('wood', 0.06, 0.72, 0.5, { p: [sx * 1.27, 0.36, 0.02], c: t });
    b.cyl('wood', 0.25, 0.25, 0.06, 8, { theta: [0, PI], p: [sx * 1.27, 0.72, 0.02], r: [0, 0, PI / 2], c: t });
  }
  plank(b, 'wood', 2.4, 0.1, 0.03, { p: [0, 0.28, -0.24], c: t });
  if (r() < 2) b.box('cloth', 0.2, 0.03, 0.14, { p: [0.6, 0.485, -0.05], r: [0, 0.3, 0], c: [0.25, 0.1, 0.08] }); // hymn book
};

OUTDOOR_PROPS.altar = (b, r) => {
  b.box('stone', 1.6, 0.9, 0.62, { p: [0, 0.45, 0] });
  b.box('stone', 1.8, 0.1, 0.8, { p: [0, 0.95, 0] });
  b.box('cloth', 1.7, 0.02, 0.72, { p: [0, 1.01, 0], c: [0.7, 0.66, 0.56] });
  b.plane('cloth', 1.3, 0.55, { p: [0, 0.72, -0.365], r: [0, PI, 0], c: [0.7, 0.66, 0.56] });
  b.plane('blood_decal', 0.5, 0.5, { raw: true, p: [-0.3, 1.025, 0.05], r: [-PI / 2, 0, 1.2] });
  for (const [x, h] of [[-0.6, 0.22], [-0.45, 0.15], [0.55, 0.26], [0.68, 0.12], [0.2, 0.08]]) {
    b.cyl('bone', 0.025, 0.028, h, 6, { p: [x, 1.02 + h / 2, rr(r, -0.15, 0.2)] });
  }
  b.box('rust', 0.04, 0.4, 0.04, { p: [0, 1.22, 0.2] });
  b.box('rust', 0.24, 0.04, 0.04, { p: [0, 1.3, 0.2] });
};

OUTDOOR_PROPS.corpse = (b, r, v) => {
  const shirt = [[0.45, 0.4, 0.34], [0.3, 0.34, 0.42], [0.5, 0.22, 0.18]][v];
  const jeans = [0.24, 0.28, 0.36];
  b.plane('blood_decal', 1.4, 1.4, { raw: true, p: [0.1, 0.012, -0.3], r: [-PI / 2, 0, r() * 3] });
  // lying face down, head toward -Z
  b.sphere('cloth', 0.2, 8, 5, { p: [0, 0.13, -0.28], s: [1.05, 0.55, 1.6], c: shirt });
  b.sphere('cloth', 0.18, 7, 4, { p: [0, 0.11, 0.08], s: [0.95, 0.55, 0.9], c: jeans });
  b.sphere('flesh', 0.11, 8, 6, { p: [0.03, 0.12, -0.72], s: [0.9, 0.95, 1.05] });
  b.sphere('cloth', 0.115, 8, 5, { p: [0.03, 0.15, -0.72], s: [0.95, 0.85, 1.05], c: [0.12, 0.1, 0.08], thetaLen: PI * 0.55 });
  b.cylBetween('flesh', [0.04, 0.12, -0.6], [0.03, 0.12, -0.52], 0.05, 0.05, 6);
  // arms: one along the body, one reaching forward
  b.cylBetween('cloth', [0.2, 0.1, -0.46], [0.26, 0.08, -0.1], 0.05, 0.06, 6, { c: shirt });
  b.cylBetween('flesh', [0.26, 0.08, -0.1], [0.24, 0.06, 0.15], 0.04, 0.045, 6);
  b.cylBetween('cloth', [-0.2, 0.1, -0.46], [-0.3, 0.08, -0.78], 0.05, 0.06, 6, { c: shirt });
  b.cylBetween('flesh', [-0.3, 0.08, -0.78], [-0.24, 0.06, -1.02], 0.04, 0.045, 6);
  // legs
  b.cylBetween('cloth', [0.09, 0.1, 0.2], [0.14, 0.08, 0.68], 0.075, 0.08, 6, { c: jeans });
  b.cylBetween('cloth', [-0.09, 0.1, 0.2], [-0.2, 0.08, 0.66], 0.075, 0.08, 6, { c: jeans });
  b.box('dark', 0.1, 0.1, 0.24, { p: [0.15, 0.06, 0.8], r: [-0.3, 0, 0] });
  b.box('dark', 0.1, 0.1, 0.24, { p: [-0.21, 0.06, 0.77], r: [-0.3, 0, 0.3] });
  // exposed wound
  b.sphere('blood', 0.07, 6, 4, { p: [-0.06, 0.2, -0.32], s: [1.4, 0.5, 1] });
};

OUTDOOR_PROPS.body_bag = (b, r) => {
  const prof = (t) => {
    const a = t * PI * 2;
    return [Math.cos(a), Math.max(-0.7, Math.sin(a))];
  };
  const secs = [
    { z: -0.95, w: 0.28, h: 0.2, y: 0.1 },
    { z: -0.8, w: 0.44, h: 0.3, y: 0.14 },
    { z: -0.62, w: 0.36, h: 0.26, y: 0.13 },
    { z: -0.4, w: 0.56, h: 0.34, y: 0.15 },
    { z: 0.1, w: 0.52, h: 0.3, y: 0.14 },
    { z: 0.6, w: 0.42, h: 0.24, y: 0.12 },
    { z: 0.88, w: 0.36, h: 0.26, y: 0.13 },
    { z: 0.95, w: 0.2, h: 0.16, y: 0.09 },
  ];
  b.loft('plastic', secs, prof, 10, { flip: true });
  b.box('steel', 0.015, 0.012, 1.6, { p: [0.04, 0.3, -0.05], r: [0, 0.02, 0] });
  b.box('cloth', 0.06, 0.005, 0.1, { p: [0.08, 0.28, 0.9], c: [0.8, 0.7, 0.3] });
};

OUTDOOR_PROPS.lantern_post = (b, r) => {
  const t = WOODS[2];
  plank(b, 'wood', 0.1, 2.0, 0.1, { p: [0, 1.0, 0], c: t });
  plank(b, 'wood', 0.05, 0.05, 0.35, { p: [0, 1.9, -0.15], c: t });
  b.cylBetween('rust', [0, 1.9, -0.3], [0, 1.78, -0.3], 0.006, 0.006, 3);
  b.group({ p: [0, 1.52, -0.3] }, () => {
    b.cyl('rust', 0.07, 0.08, 0.04, 8, { p: [0, 0, 0] });
    b.cyl('glass', 0.06, 0.06, 0.16, 8, { p: [0, 0.1, 0] });
    b.cyl('rust', 0.02, 0.08, 0.06, 8, { p: [0, 0.21, 0] });
    b.torus('rust', 0.06, 0.006, 3, 10, PI, { p: [0, 0.24, 0] });
    for (const a of [0, PI / 2, PI, PI * 1.5]) b.box('rust', 0.01, 0.16, 0.01, { p: [Math.cos(a) * 0.065, 0.1, Math.sin(a) * 0.065] });
  });
};

OUTDOOR_PROPS.mailbox = (b, r) => {
  plank(b, 'wood', 0.09, 1.0, 0.09, { p: [0, 0.5, 0], c: WOODS[2], r: [0.03, 0, 0.04] });
  b.group({ p: [0, 1.02, 0], r: [0, 0, 0.04] }, () => {
    b.box('wood', 0.16, 0.04, 0.4, { p: [0, 0, 0.02], c: WOODS[1] });
    b.box('paint', 0.2, 0.12, 0.46, { p: [0, 0.08, 0], c: [0.5, 0.5, 0.48] });
    b.cyl('paint', 0.1, 0.1, 0.46, 8, { theta: [-PI / 2, PI], p: [0, 0.14, 0], r: [PI / 2, 0, 0], c: [0.5, 0.5, 0.48] });
    b.box('rust', 0.2, 0.22, 0.01, { p: [0, 0.14, -0.235], r: [0.4, 0, 0] });
    b.box('paint', 0.015, 0.14, 0.03, { p: [0.11, 0.2, 0.08], c: [0.6, 0.1, 0.08] });
    b.box('paint', 0.015, 0.05, 0.09, { p: [0.11, 0.26, 0.05], c: [0.6, 0.1, 0.08] });
  });
};

OUTDOOR_PROPS.pumpkin = (b, r, v) => {
  const g = new THREE.SphereGeometry(0.22, 12, 7);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.cos(a * 8);
    const cave = v === 2 && x > 0.1 && y > -0.05 ? 0.75 : 1;
    pos.setXYZ(i, x * k * cave, y * 0.72, z * k * cave);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 0.5);
  b.add('pumpkin', g, { p: [0, 0.16, 0], raw: true, s: [1, 1, 1] });
  b.cylBetween('bark_dead', [0, 0.3, 0], [0.03, 0.38, 0.02], 0.02, 0.03, 5);
  if (v === 1) {
    // carved face, rotten
    b.poly('dark', [[-0.1, 0.22, -0.2], [-0.03, 0.22, -0.215], [-0.065, 0.28, -0.21]], [[0, 1, 2]]);
    b.poly('dark', [[0.03, 0.22, -0.215], [0.1, 0.22, -0.2], [0.065, 0.28, -0.21]], [[0, 1, 2]]);
    b.poly('dark', [[-0.11, 0.13, -0.2], [0.11, 0.13, -0.2], [0.06, 0.08, -0.205], [-0.06, 0.08, -0.205]], [[0, 1, 2], [0, 2, 3]]);
  }
};

OUTDOOR_PROPS.bones = (b, r, v) => {
  // skull
  b.group({ p: [0.12, 0.08, -0.15], r: [0.3, r() * 3, 0.2] }, () => {
    b.sphere('bone', 0.085, 8, 6, { s: [0.85, 0.9, 1.1] });
    b.box('bone', 0.1, 0.05, 0.08, { p: [0, -0.06, -0.06] });
    for (const sx of [-1, 1]) b.sphere('dark', 0.022, 5, 4, { p: [sx * 0.032, 0.0, -0.085] });
  });
  const bone = (a, c, rad = 0.018) => {
    b.cylBetween('bone', a, c, rad, rad, 5);
    b.sphere('bone', rad * 1.7, 4, 2, { p: a });
    b.sphere('bone', rad * 1.7, 4, 2, { p: c });
  };
  for (let k = 0; k < (v ? 4 : 6); k++) {
    const x = rr(r, -0.35, 0.35), z = rr(r, -0.3, 0.35), a = r() * PI, L = rr(r, 0.2, 0.42);
    bone([x, 0.025, z], [x + Math.cos(a) * L, 0.025, z + Math.sin(a) * L], rr(r, 0.012, 0.02));
  }
  // ribs
  for (let k = 0; k < 4; k++) b.torus('bone', 0.12, 0.008, 3, 6, PI * 0.8, { p: [-0.15 + k * 0.06, 0.03, 0.2], r: [PI / 2, 0.2, 0] });
};

OUTDOOR_PROPS.dock_post = (b, r) => {
  b.cyl('wood', 0.13, 0.15, 2.5, 8, { p: [0, 1.25, 0], grain: true, c: [0.55, 0.48, 0.4], cfn: (x, y, z, c) => (y < 0.8 ? c.multiply(new THREE.Color(0.6, 0.72, 0.5)) : c) });
  b.cyl('wood', 0.1, 0.13, 0.08, 8, { p: [0, 2.54, 0], c: [0.5, 0.44, 0.38] });
  b.torus('rope', 0.15, 0.025, 5, 10, PI * 2, { p: [0, 2.1, 0], r: [PI / 2, 0, 0] });
  b.torus('rope', 0.15, 0.025, 5, 10, PI * 2, { p: [0, 2.03, 0], r: [PI / 2, 0, 0.2] });
  b.tube('rope', [[0.15, 2.05, 0], [0.4, 1.4, -0.1], [0.3, 0.3, -0.2], [0.5, 0.02, -0.4]], 0.02, 8, 4);
};

OUTDOOR_PROPS.fuel_tank = (b, r) => {
  const col = [0.72, 0.72, 0.66];
  b.cyl('paint', 1.0, 1.0, 4.2, 14, { p: [0, 1.2, 0], r: [PI / 2, 0, 0], c: col });
  for (const sz of [-1, 1]) b.sphere('paint', 1.0, 14, 5, { thetaLen: PI / 2, p: [0, 1.2, sz * 2.1], r: [sz * PI / 2, 0, 0], s: [1, 0.35, 1], c: col });
  for (const z of [-1.4, 1.4]) {
    b.box('concrete', 1.8, 0.35, 0.4, { p: [0, 0.175, z] });
    b.cyl('rust', 1.03, 1.03, 0.14, 14, { theta: [PI / 2, PI], p: [0, 1.25, z], r: [PI / 2, 0, 0], open: true });
  }
  b.cyl('rust', 0.25, 0.25, 0.15, 8, { p: [0, 2.3, 0.8] });
  b.cylBetween('rust', [0.5, 2.1, -1.5], [0.5, 2.5, -1.5], 0.04, 0.04, 5);
  b.cylBetween('rust', [0.7, 0.6, 2.3], [0.7, 0.2, 2.5], 0.05, 0.05, 5);
  label(b, 'stencil', 'flammable', 1.6, 0.8, [1.005, 1.3, 0], 'x+');
  label(b, 'stencil', 'flammable', 1.6, 0.8, [-1.005, 1.3, 0], 'x-');
  for (let y = 0.5; y < 2.2; y += 0.35) b.box('rust', 0.4, 0.03, 0.03, { p: [0, y, -2.62] });
  for (const sx of [-0.2, 0.2]) b.box('rust', 0.03, 2.0, 0.03, { p: [sx, 1.1, -2.62] });
};

OUTDOOR_PROPS.radio_mast = (b, r) => {
  const H = 14.8, s0 = 0.55, s1 = 0.35;
  const half = (y) => s0 + (s1 - s0) * (y / H);
  const corners = (y) => {
    const h = half(y);
    return [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]];
  };
  for (let k = 0; k < 4; k++) b.cylBetween('steel', corners(0)[k], corners(H)[k], 0.035, 0.045, 4, { open: true });
  const step = 1.3;
  for (let y = 0; y < H - 0.1; y += step) {
    const a = corners(y), c = corners(Math.min(H, y + step));
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      b.cylBetween('steel', a[k], c[k2], 0.012, 0.012, 3, { open: true });
      b.cylBetween('steel', a[k], a[k2], 0.012, 0.012, 3, { open: true });
    }
  }
  b.box('concrete', 1.3, 0.2, 1.3, { p: [0, 0.1, 0] });
  // antennas + dead red light
  b.cyl('steel', 0.03, 0.03, 1.2, 4, { p: [0, H + 0.4, 0] });
  b.sphere('emissive_red', 0.07, 6, 4, { p: [0, H + 1.0, 0] });
  b.box('metal', 0.25, 0.9, 0.08, { p: [0.4, H - 1.2, 0], r: [0, 0.4, 0] });
  b.box('metal', 0.25, 0.9, 0.08, { p: [-0.4, H - 2.0, 0.1], r: [0, -0.5, 0] });
  b.box('paint', 0.5, 0.6, 0.3, { p: [0, 1.0, -0.6], c: [0.5, 0.5, 0.45] });
};

OUTDOOR_PROPS.generator = (b, r) => {
  const col = [0.75, 0.6, 0.15];
  // tube frame
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.cyl('steel', 0.025, 0.025, 0.9, 5, { p: [sx * 0.62, 0.55, sz * 0.38] });
  for (const y of [0.1, 1.0])
    for (const sz of [-1, 1]) {
      b.cyl('steel', 0.025, 0.025, 1.24, 5, { p: [0, y, sz * 0.38], r: [0, 0, PI / 2] });
    }
  for (const sx of [-1, 1]) for (const y of [0.1, 1.0]) b.cyl('steel', 0.025, 0.025, 0.76, 5, { p: [sx * 0.62, y, 0], r: [PI / 2, 0, 0] });
  // engine + alternator + tank
  b.box('paint', 0.55, 0.5, 0.5, { p: [-0.25, 0.38, 0], c: [0.2, 0.2, 0.2] });
  b.cyl('paint', 0.22, 0.22, 0.5, 10, { p: [0.3, 0.36, 0], r: [0, 0, PI / 2], c: col });
  b.box('paint', 0.9, 0.22, 0.55, { p: [0, 0.85, 0], c: col });
  b.cyl('chrome', 0.07, 0.07, 0.04, 8, { p: [-0.2, 0.98, 0] });
  b.box('dark', 0.2, 0.14, 0.02, { p: [0.4, 0.55, -0.26] });
  b.cyl('rust', 0.07, 0.07, 0.4, 6, { p: [-0.25, 0.4, 0.3], r: [0, 0, PI / 2] });
  for (const sx of [-1, 1]) b.group({ p: [0.62 * sx, 0.12, 0.44] }, () => wheel(b, 0.12, 0.08, { rim: 'steel' }));
};

OUTDOOR_PROPS.cart = (b, r) => {
  const t = WOODS[2];
  // bed
  for (let k = 0; k < 7; k++) plank(b, 'wood', 1.4, 0.05, 0.28, { p: [0, 0.72, -0.9 + k * 0.29], c: t });
  for (const sx of [-1, 1]) {
    plank(b, 'wood', 0.08, 0.1, 2.1, { p: [sx * 0.66, 0.67, 0], c: t });
    plank(b, 'wood', 0.05, 0.24, 2.0, { p: [sx * 0.68, 0.9, 0], c: t });
    for (const z of [-0.9, 0, 0.9]) plank(b, 'wood', 0.05, 0.4, 0.06, { p: [sx * 0.68, 0.9, z], c: t });
    // shafts toward -Z, tips resting on the ground
    b.beam('wood', [sx * 0.4, 0.66, -0.9], [sx * 0.34, 0.06, -1.3], 0.06, 0.06, { c: t });
  }
  plank(b, 'wood', 1.4, 0.24, 0.05, { p: [0, 0.9, 1.0], c: t });
  // spoked wheels
  for (const sx of [-1, 1]) {
    b.group({ p: [sx * 0.76, 0.55, 0.15] }, () => {
      b.torus('wood', 0.52, 0.04, 4, 14, PI * 2, { r: [0, PI / 2, 0], c: WOODS[1] });
      b.torus('rust', 0.55, 0.012, 3, 14, PI * 2, { r: [0, PI / 2, 0] });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * PI * 2;
        b.cylBetween('wood', [0, 0, 0], [0, Math.cos(a) * 0.5, Math.sin(a) * 0.5], 0.018, 0.022, 4, { c: WOODS[1] });
      }
      b.cyl('wood', 0.08, 0.08, 0.14, 8, { r: [0, 0, PI / 2], c: WOODS[1] });
    });
  }
  b.cyl('rust', 0.035, 0.035, 1.6, 6, { p: [0, 0.55, 0.15], r: [0, 0, PI / 2] });
  // hay in the bed
  b.sphere('hay', 0.5, 8, 5, { p: [0.1, 0.78, 0.2], s: [1.1, 0.5, 1.6] });
};

OUTDOOR_PROPS.log_pile = (b, r) => {
  const rows = [
    { n: 4, rad: 0.27, z0: -0.825, dz: 0.55 },
    { n: 3, rad: 0.245, z0: -0.55, dz: 0.55 },
    { n: 2, rad: 0.22, z0: -0.27, dz: 0.54 },
  ];
  let y = 0;
  let prevR = 0;
  rows.forEach((row, j) => {
    y = j === 0 ? row.rad : y + Math.sqrt((prevR + row.rad) ** 2 - 0.275 ** 2) - 0.02;
    prevR = row.rad;
    for (let k = 0; k < row.n; k++) {
      const rad = row.rad * rr(r, 0.9, 1.08);
      const len = rr(r, 3.85, 4.15);
      const x = rr(r, -0.12, 0.12);
      const z = row.z0 + k * row.dz + rr(r, -0.02, 0.02);
      const yaw = rr(r, -0.03, 0.03);
      const taper = rr(r, 0.82, 0.92);
      const ly = y + (rad - row.rad);
      b.group({ p: [x, ly, z], r: [0, yaw, 0] }, () => {
        b.cyl('bark', rad * taper, rad, len, 9, { r: [0, 0, PI / 2], grain: true, open: true });
        b.disc('woodend', rad, 9, { p: [-len / 2 - 0.002, 0, 0], r: [0, 0, PI / 2], s: [1, 1, 1] });
        b.disc('woodend', rad * taper, 9, { p: [len / 2 + 0.002, 0, 0], r: [0, 0, -PI / 2] });
        // branch stubs
        if (r() < 0.6) {
          const bx = rr(r, -1.4, 1.4), a = r() * PI * 2;
          b.cylBetween('bark', [bx, Math.cos(a) * rad * 0.8, Math.sin(a) * rad * 0.8], [bx + 0.05, Math.cos(a) * (rad + 0.12), Math.sin(a) * (rad + 0.12)], 0.03, 0.045, 5);
        }
      });
    }
  });
  // stakes driven in along both long sides + chocks under the outer logs
  for (const sz of [-1, 1])
    for (const x of [-1.3, 1.2]) {
      const zz = sz * 1.13;
      b.cylBetween('wood', [x, -0.1, zz * 0.98], [x + rr(r, -0.05, 0.05), 1.0, zz * 1.04], 0.045, 0.05, 6, { c: WOODS[2] });
      b.cyl('wood', 0.005, 0.045, 0.06, 6, { p: [x, 1.02, zz * 1.04], c: WOODS[2] });
      b.frustum('wood', 0.22, 0.2, 0.22, 0.02, 0, 0.14, { p: [x + 0.2, 0, zz * 0.9], c: WOODS[1] });
    }
  // bark litter + sawdust
  for (let k = 0; k < 8; k++) b.box('bark', rr(r, 0.12, 0.3), 0.02, rr(r, 0.05, 0.12), { p: [rr(r, -2.2, 2.2), 0.01, (r() < 0.5 ? -1 : 1) * rr(r, 1.15, 1.35)], r: [0, r() * 3, 0.05] });
  for (const sx of [-1, 1]) b.sphere('wood', 0.3, 8, 3, { p: [sx * 2.2, 0, rr(r, -0.6, 0.6)], s: [1.4, 0.18, 1.1], c: [1.1, 0.95, 0.72], thetaLen: PI / 2 });
  weeds(b, r, [[-2.1, 1.3], [1.8, -1.3], [0.3, 1.35]], 0.5);
};
