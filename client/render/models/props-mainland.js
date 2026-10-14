// What stands and lies about the mainland (shared/mainland.js) outside the city's own streets and rooms: rubble, dead
// traffic lights and bus shelters, the dressing years of nobody leave (litter, debris, ivy, carts, wire, fallen
// signs), awnings, a subway entrance, shipping containers and the docks' freighter, and Calder Field's baggage carts,
// windsock, runway lights and the airliner that came down short. Builders as in props.js: (b, r, v) with b a
// MeshBuilder, r a seeded rng, v the variant; origin at ground centre of the footprint, front to -Z.
import * as THREE from 'three';
import { rr, pick, WOODS, label, weeds, plank, slab, PAPER } from './propkit.js';
import { paneLook } from './cabin.js';

const PI = Math.PI;

export const MAINLAND_VARIANTS = {
  rubble_pile: 3, traffic_light: 2, bus_shelter: 2, litter: 3, debris: 3, rubble_slope: 2, ivy: 3, shopping_cart: 2, suitcases: 1, razor_wire: 1,
  barricade: 1, fallen_sign: 2, pole_down: 1, dumpster_tipped: 1, awning: 2, subway_entrance: 1, shipping_container: 3, power_transformer: 1,
  school_desk: 2, baggage_cart: 1, windsock: 1, runway_light: 2, airliner_wreck: 1,
};
export const MAINLAND_PROPS = {};

// What a building came down as: broken slabs at all angles on a mound of bricks and dust, rebar standing out of it.
MAINLAND_PROPS.rubble_pile = (b, r) => {
  const prof = [[2.3, -0.02], [2.2, 0.12], [1.85, 0.42], [1.3, 0.8], [0.7, 1.08], [0.0, 1.16]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18);
  const ph = [r() * 6, r() * 6, r() * 6];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    // (periodic in the angle, so the seam stays closed; never further out than the collider)
    const n = 0.05 * Math.sin(a * 2 + ph[0]) + 0.04 * Math.sin(a * 3 + ph[1]) + 0.03 * Math.sin(a * 5 + ph[2]) - 0.12;
    const k = 1 + n * Math.min(1, Math.hypot(x, z) / 1.0);
    pos.setXYZ(i, x * k, y > 0.05 ? y * (1 + n) : y, z * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.7 + pos.getY(i) * 0.3, pos.getZ(i) * 0.7 - pos.getY(i) * 0.3);
  b.add('gravel', g, { raw: true });
  // what the heap is made of, where it shows: floor slabs on edge, standing out of it (inside the collider's circle)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + rr(r, -0.4, 0.4), d = rr(r, 0.5, 1.1);
    b.box('concrete', rr(r, 1.5, 2.1), rr(r, 0.16, 0.24), rr(r, 1.0, 1.5), { p: [Math.cos(a) * d, 0.75 - d * 0.3, Math.sin(a) * d], r: [rr(r, -0.9, 0.9), r() * 3, rr(r, -0.7, 0.7)] });
  }
  // slabs: each tipped, half buried
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * PI * 2 + rr(r, -0.3, 0.3), d = rr(r, 0.3, 1.2);
    b.box('concrete', rr(r, 0.8, 1.3), rr(r, 0.14, 0.22), rr(r, 0.6, 1.0), { p: [Math.cos(a) * d, 0.92 - d * 0.5, Math.sin(a) * d], r: [rr(r, -0.4, 0.4), r() * 3, rr(r, -0.35, 0.35)] });
  }
  for (let k = 0; k < 9; k++) {
    const a = r() * PI * 2, d = rr(r, 0.4, 1.8);
    b.box('brick', 0.22, 0.07, 0.1, { p: [Math.cos(a) * d, 1.08 - d * 0.5, Math.sin(a) * d], r: [r(), r() * 3, r()] });
  }
  for (let k = 0; k < 5; k++) {
    const a = r() * PI * 2, d = rr(r, 0.2, 1.0);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0.85 - d * 0.45;
    b.cylBetween('rust', [x, y, z], [x + rr(r, -0.2, 0.2), y + rr(r, 0.25, 0.45), z + rr(r, -0.2, 0.2)], 0.012, 0.012, 4);
  }
  weeds(b, r, [[1.9, 0.7], [-1.8, -1.0], [0.4, -2.0]], 0.45);
};

// A traffic light on the corner, dead: the pole, the arm out over the street (-Z), a head hanging from the arm and
// one on the pole.
MAINLAND_PROPS.traffic_light = (b, r, v) => {
  b.cyl('metal', 0.07, 0.11, 5.3, 8, { p: [0, 2.65, 0] });
  b.cyl('concrete', 0.13, 0.14, 0.24, 8, { p: [0, 0.12, 0] });
  b.cylBetween('metal', [0, 5.1, 0], [0, 5.3, -2.9], 0.05, 0.04, 6);
  b.cylBetween('metal', [0, 4.3, 0], [0, 5.18, -1.4], 0.025, 0.025, 4);
  const head = (y, z) => {
    b.box('dark', 0.26, 0.95, 0.2, { p: [0, y, z] });
    for (let k = 0; k < 3; k++) {
      b.cyl(k === (v ? 0 : 2) ? 'glass' : 'taillight', 0.1, 0.1, 0.02, 8, { p: [0.14, y + 0.3 - k * 0.3, z], r: [0, 0, PI / 2] });
      b.box('dark', 0.14, 0.02, 0.2, { p: [0.2, y + 0.42 - k * 0.3, z] });
    }
  };
  head(4.72, -2.7);
  head(3.0, 0.18);
};

// A bus shelter, open to the street (-Z): a steel frame, a back and two ends of glass (one end smashed), a bench.
MAINLAND_PROPS.bus_shelter = (b, r, v) => {
  for (const sx of [-1, 1]) for (const z of [-0.5, 0.68]) b.box('metal', 0.08, 2.4, 0.08, { p: [sx * 1.75, 1.2, z] });
  b.box('metal', 3.6, 0.1, 1.4, { p: [0, 2.45, 0.05] });
  b.box('metal', 3.5, 0.08, 0.06, { p: [0, 0.3, 0.68] });
  // (panes one sees through: `carglass`, as a vehicle's)
  b.plane('carglass', 3.42, 1.9, { p: [0, 1.3, 0.68], c: paneLook(0.55, 1) });
  b.plane('carglass', 1.1, 1.9, { p: [-1.75, 1.3, 0.09], r: [0, PI / 2, 0], c: paneLook(0.55, 2) });
  if (!v) b.plane('carglass', 1.1, 1.9, { p: [1.75, 1.3, 0.09], r: [0, PI / 2, 0], c: paneLook(0.55, 3) });
  else for (let k = 0; k < 5; k++) b.box('glass', 0.14, 0.01, 0.1, { p: [1.5 - r() * 0.5, 0.01, -0.3 + r() * 0.8], r: [0, r() * 3, 0] });
  plank(b, 'wood', 2.8, 0.06, 0.36, { p: [0, 0.48, 0.42], c: WOODS[2] });
  for (const sx of [-1, 1]) b.box('metal', 0.06, 0.45, 0.3, { p: [sx * 1.2, 0.225, 0.42] });
  weeds(b, r, [[-1.5, 0.5], [1.2, -0.3]], 0.45);
};

// ------------------------------------------------------------------ the mainland's dressing: what years of nobody
// leave in a street. Most of it has no collider (shared/props.js): it is walked over.
// Rubbish blown flat over three metres of ground: papers, cans, bottles, a shoe, a split bag.
MAINLAND_PROPS.litter = (b, r, v) => {
  for (let k = 0; k < 13; k++) b.box('cloth', rr(r, 0.18, 0.42), 0.004, rr(r, 0.14, 0.3), { p: [rr(r, -1.35, 1.35), 0.004 + k * 0.0008, rr(r, -1.35, 1.35)], r: [0, r() * PI, 0], c: pick(r, PAPER) });
  for (let k = 0; k < 4; k++) b.cyl('steel', 0.033, 0.033, 0.12, 6, { p: [rr(r, -1.2, 1.2), 0.033, rr(r, -1.2, 1.2)], r: [PI / 2, r() * PI, 0], order: 'YXZ' });
  for (let k = 0; k < 3; k++) b.cyl(k ? 'bottle_brown' : 'bottle', 0.035, 0.035, 0.2, 6, { p: [rr(r, -1.2, 1.2), 0.035, rr(r, -1.2, 1.2)], r: [PI / 2, r() * PI, 0], order: 'YXZ' });
  b.box('rubber', 0.1, 0.07, 0.27, { p: [rr(r, -1, 1), 0.035, rr(r, -1, 1)], r: [0, r() * PI, 0] }); // a shoe
  b.sphere('plastic', 0.24, 7, 5, { p: [rr(r, -0.9, 0.9), 0.095, rr(r, -0.9, 0.9)], s: [1.2, 0.4, 0.9] }); // a bag, split
  b.box('cardboard', 0.5, 0.012, 0.36, { p: [rr(r, -1, 1), 0.008, rr(r, -1, 1)], r: [0, r() * PI, 0] });
  if (v === 2) b.box('cardboard', 0.42, 0.14, 0.3, { p: [rr(r, -0.8, 0.8), 0.07, rr(r, -0.8, 0.8)], r: [0, r() * PI, 0] }); // a crushed box
};

// What came off a building, small enough to step over: bricks, lumps of concrete, a bent bar.
MAINLAND_PROPS.debris = (b, r, v) => {
  // A low drift of grit and broken stuff, highest in the middle and feathered out to nothing at its edge (it lies on
  // the ground, it is no pad on it), with the lumps sunk in it: broken concrete with its faces every way up, bricks
  // whole and in halves, a bit of slab half buried, a bent bar.
  const H = 0.16 + v * 0.05;
  const prof = [[1.3, -0.03], [1.24, 0.004], [1.0, H * 0.3], [0.7, H * 0.68], [0.36, H * 0.92], [0.001, H]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const ph = [r() * 6, r() * 6, r() * 6];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    // (lumpy, longer one way than the other; the rim stays on the ground)
    const s = 1 + 0.22 * Math.sin(a * 2 + ph[0]) + 0.1 * Math.sin(a * 5 + ph[1]);
    const lift = y > 0.01 ? 1 + 0.35 * Math.sin(a * 3 + ph[2]) * (y / H) : 1;
    pos.setXYZ(i, x * s, y * lift, z * s * 0.85);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.7, pos.getZ(i) * 0.7);
  b.add('gravel', g, { raw: true });
  const top = (x, z) => H * Math.max(0, 1 - Math.hypot(x / 1.1, z / 0.95)) ** 0.8;
  // lumps of concrete, half in the drift
  for (let k = 0; k < 5 + v * 2; k++) {
    const x = rr(r, -0.85, 0.85), z = rr(r, -0.7, 0.7);
    const sz = rr(r, 0.12, 0.3) * (1.2 - Math.hypot(x, z) * 0.4);
    b.rock(k % 5 === 4 ? 'brick' : 'concrete', sz, { detail: 0, seed: 70 + k * 7 + v * 31, scale: [rr(r, 1, 1.5), rr(r, 0.55, 0.85), 1], p: [x, top(x, z) + sz * 0.1, z], r: [0, r() * PI, 0] });
  }
  // bricks, lying every way on it and round its edge
  for (let k = 0; k < 10; k++) {
    const a = r() * PI * 2, d = rr(r, 0.15, 1.25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85;
    const half = k % 3 === 0;
    b.box('brick', half ? 0.11 : 0.22, 0.065, 0.1, { p: [x, top(x, z) + 0.02, z], r: [rr(r, -0.35, 0.35), r() * PI, rr(r, -0.35, 0.35)] });
  }
  // a piece of slab, its far edge in the drift and the near one on the ground
  {
    const x = rr(r, -0.4, 0.4), z = rr(r, -0.35, 0.35);
    const w = rr(r, 0.55, 0.85);
    b.box('concrete', w, 0.1, rr(r, 0.4, 0.6), { p: [x, top(x, z) * 0.6 + 0.02, z], r: [Math.atan2(top(x, z), w) * 0.8, r() * PI, rr(r, -0.06, 0.06)] });
  }
  const x = rr(r, -0.5, 0.5), z = rr(r, -0.5, 0.5);
  b.tube('rust', [[x - 0.6, 0.02, z], [x, top(x, z) + 0.03, z + 0.15], [x + 0.4, top(x, z) + 0.18, z + 0.1], [x + 0.55, top(x, z) + 0.38, z + 0.3]], 0.012, 8, 4);
};

// A slope of rubble that can be walked up: what a storey came down as. Its colliders are six steps (props.js); the
// heap itself lies just under them, and slabs and lumps stand up through it to their treads.
const SLOPE = { BASE: 3.5, STEP: 0.55, RISE: 0.4, STEPS: 6 };
// how much further out than a circle the heap reaches at angle a: most of the way to a square (never past it)
const slopeShape = (a) => 1 + 0.8 * (1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) - 1);
MAINLAND_PROPS.rubble_slope = (b, r, v) => {
  const { BASE, STEP, RISE, STEPS } = SLOPE;
  const top = RISE * STEPS;
  const prof = [[BASE - 0.05, -0.02], [BASE - 0.05, 0.04]];
  for (let s = 1; s <= 5; s++) prof.push([BASE - 0.05 - (BASE - 0.85) * (s / 5), 0.04 + (top - RISE - 0.08) * (s / 5)]);
  prof.push([0.6, top - 0.1], [0.001, top - 0.05]);
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const ph = [r() * 6, r() * 6];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    // squared off towards the colliders' corners, and never out past them (periodic in the angle: the seam holds)
    const sq = slopeShape(a);
    const n = 1 - 0.035 * (1 + Math.sin(a * 3 + ph[0])) - 0.02 * (1 + Math.sin(a * 7 + ph[1]));
    pos.setXYZ(i, x * sq * n, y, z * sq * n);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.6 + pos.getY(i) * 0.3, pos.getZ(i) * 0.6 - pos.getY(i) * 0.3);
  b.add('gravel', g, { raw: true });
  // floor slabs lying down its sides, as they slid (flat to the heap: a foot goes over them)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2 + rr(r, -0.3, 0.3);
    const d = rr(r, 1.5, 2.3);
    b.group({ r: [0, -a, 0] }, () => b.box('concrete', rr(r, 1.7, 2.4), 0.16, rr(r, 1.2, 1.8), { p: [d, 0.1 + ((top - RISE) * (BASE - d)) / BASE, 0], r: [rr(r, -0.1, 0.1), rr(r, -0.5, 0.5), -0.5] }));
  }
  // on every tread, lumps and slabs lying in the heap up to the step's top (which is what a foot stands on)
  for (let s = 0; s < STEPS; s++) {
    const h = BASE - STEP * (s + 0.5); // the middle of this tread, measured square
    const y = 0.04 + ((top - RISE - 0.08) * (BASE - 0.05 - h)) / (BASE - 0.85); // the heap's surface there
    for (let k = 0; k < (s < 4 ? 8 : 5); k++) {
      const a = (k / 8) * PI * 2 + r() * 0.7;
      const d = h * slopeShape(a) * 0.95;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (k % 3 === 0) b.box('concrete', rr(r, 0.6, 0.9), 0.12, rr(r, 0.4, 0.6), { p: [x, y + 0.03, z], r: [rr(r, -0.12, 0.12), r() * PI, rr(r, -0.12, 0.12)] });
      else if (k % 3 === 1) b.rock('concrete', rr(r, 0.17, 0.22), { seed: s * 13 + k + v * 5, scale: [1.2, 0.75, 1], p: [x, y, z] });
      else for (let j = 0; j < 3; j++) b.box('brick', 0.22, 0.07, 0.1, { p: [x + rr(r, -0.15, 0.15), y + 0.02 + j * 0.04, z + rr(r, -0.15, 0.15)], r: [r() * 0.3, r() * PI, r() * 0.3] });
    }
  }
  // a floor slab lying down the heap, its outer edge low, and bars standing out of the top
  b.group({ r: [0, v ? 2.2 : 0.6, 0] }, () => b.box('concrete', 2.0, 0.18, 1.3, { p: [1.2, 1.32, 0], r: [0, 0, -0.36] }));
  for (let k = 0; k < 6; k++) {
    const a = r() * PI * 2, d = rr(r, 0.1, 0.5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    b.cylBetween('rust', [x, top - 0.3, z], [x + rr(r, -0.12, 0.12), top - 0.02, z + rr(r, -0.12, 0.12)], 0.012, 0.012, 4);
  }
  weeds(b, r, [[2.9, 1.2], [-2.8, -1.6], [0.6, -3.0], [-1.2, 2.9]], 0.5);
};

// Ivy up a wall: a mat of creeper, its back flat on the wall (local z = 0), growing out to z = -0.3. Stems from the
// ground, the growth thick low down and ragged at the top. The third kind is dead: brown, half fallen away.
MAINLAND_PROPS.ivy = (b, r, v) => {
  const dead = v === 2;
  const W = 3.2, H = dead ? 3.6 : v ? 4.2 : 5;
  const tint = () => (dead ? [rr(r, 0.42, 0.52), rr(r, 0.34, 0.4), rr(r, 0.2, 0.26)] : [rr(r, 0.22, 0.34), rr(r, 0.4, 0.56), rr(r, 0.16, 0.24)]);
  // the outline: how high it has got at x
  const reach = (x) => H * (0.55 + 0.45 * Math.sin((x / W + 0.5) * PI) * (0.8 + 0.2 * Math.sin(x * 4.3 + v * 2)));
  for (let k = 0; k < (dead ? 34 : 58); k++) {
    const x = rr(r, -W / 2 + 0.6, W / 2 - 0.6);
    const y = 0.6 + (reach(x) - 1.1) * Math.pow(r(), 1.4);
    const s = rr(r, 0.75, 1.15);
    // (cards both ways up and on their sides: a tangle, not a lawn)
    b.plane('weeds', 0.9 * s, 0.9 * s, { raw: true, p: [x, y, -0.075 - (k % 6) * 0.04], r: [rr(r, -0.12, 0.12), PI, r() * PI * 2], c: tint() });
  }
  for (let k = 0; k < 5; k++) {
    const x0 = -W / 2 + 0.4 + (k / 4) * (W - 0.8);
    const top = reach(x0) * rr(r, 0.6, 0.85);
    b.tube('bark_dead', [[x0, 0, -0.05], [x0 + rr(r, -0.25, 0.25), top * 0.35, -0.04], [x0 + rr(r, -0.4, 0.4), top * 0.7, -0.05], [x0 + rr(r, -0.5, 0.5), top, -0.04]], 0.018, 8, 4);
  }
};

// A supermarket trolley, where it was left (one kind: on its side).
MAINLAND_PROPS.shopping_cart = (b, r, v) => {
  b.group(v ? { p: [0.5, 0.3, 0], r: [0, 0, PI / 2 - 0.06] } : { p: [0, 0, 0] }, () => {
    // the basket: a wire frame, wider at the top and the back, with mesh sides (chain link reads as wire)
    const y0 = 0.42, y1 = 0.92;
    for (const sx of [-1, 1]) {
      b.cylBetween('steel', [sx * 0.2, y0, -0.42], [sx * 0.27, y1, -0.46], 0.008, 0.008, 4);
      b.cylBetween('steel', [sx * 0.24, y0, 0.36], [sx * 0.28, y1, 0.44], 0.008, 0.008, 4);
      b.cylBetween('steel', [sx * 0.2, y0, -0.42], [sx * 0.24, y0, 0.36], 0.008, 0.008, 4);
      b.cylBetween('steel', [sx * 0.27, y1, -0.46], [sx * 0.28, y1, 0.44], 0.01, 0.01, 4);
      for (let k = 1; k < 6; k++) b.cylBetween('steel', [sx * (0.2 + k * 0.007), y0, -0.42 + k * 0.13], [sx * (0.27 + k * 0.002), y1, -0.46 + k * 0.15], 0.004, 0.004, 3);
      // the chassis and its castors
      b.cylBetween('steel', [sx * 0.22, 0.14, -0.4], [sx * 0.24, 0.14, 0.42], 0.012, 0.012, 4);
      b.cylBetween('steel', [sx * 0.24, 0.14, 0.42], [sx * 0.26, 0.98, 0.5], 0.012, 0.012, 4);
      for (const z of [-0.38, 0.4]) b.cyl('rubber', 0.055, 0.055, 0.03, 8, { p: [sx * 0.22, 0.055, z], r: [0, 0, PI / 2] });
    }
    for (const [ya, za, yb, zb] of [[y0, -0.42, y1, -0.46], [y0, 0.36, y1, 0.44]]) {
      b.cylBetween('steel', [-0.2, ya, za], [0.2, ya, za], 0.008, 0.008, 4);
      b.cylBetween('steel', [-0.27, yb, zb], [0.27, yb, zb], 0.01, 0.01, 4);
      for (let k = -2; k <= 2; k++) b.cylBetween('steel', [k * 0.09, ya, za], [k * 0.12, yb, zb], 0.004, 0.004, 3);
    }
    for (let k = -3; k <= 3; k++) b.cylBetween('steel', [-0.2, y0, k * 0.12], [0.2, y0, k * 0.12], 0.004, 0.004, 3);
    b.cylBetween('plastic', [-0.26, 0.98, 0.5], [0.26, 0.98, 0.5], 0.016, 0.016, 5); // the handle
  });
};

// Cases and bags somebody could not carry any further: two suitcases, a holdall, one burst open with what was in it.
MAINLAND_PROPS.suitcases = (b, r) => {
  b.box('plastic', 0.5, 0.7 * 0.5, 0.24, { p: [-0.35, 0.175, -0.1], r: [0, 0.3, 0] });
  b.box('cloth', 0.62, 0.22, 0.42, { p: [0.28, 0.11, 0.18], r: [0, -0.5, 0], c: [0.4, 0.2, 0.16] });
  b.box('cloth', 0.62, 0.03, 0.42, { p: [0.36, 0.26, -0.12], r: [-1.2, -0.5, 0], order: 'YXZ', c: [0.4, 0.2, 0.16] }); // its lid, thrown back
  for (let k = 0; k < 4; k++) b.box('cloth', rr(r, 0.2, 0.34), 0.02, rr(r, 0.16, 0.26), { p: [0.2 + rr(r, -0.3, 0.3), 0.012 + k * 0.004, 0.25 + rr(r, -0.2, 0.2)], r: [0, r() * PI, 0], c: pick(r, PAPER) });
  b.cyl('canvas', 0.15, 0.15, 0.5, 8, { p: [-0.2, 0.15, 0.3], r: [PI / 2, 1.1, 0], order: 'YXZ' }); // the holdall
  b.cylBetween('steel', [-0.5, 0.35, -0.17], [-0.2, 0.35, -0.02], 0.01, 0.01, 4);
};

// Concertina wire: a coil of it strung between two stakes, along X.
MAINLAND_PROPS.razor_wire = (b, r) => {
  for (const sx of [-1, 1]) b.box('rust', 0.05, 0.9, 0.05, { p: [sx * 1.42, 0.45, 0] });
  const turns = 9, R = 0.38;
  const pts = [];
  for (let k = 0; k <= turns * 8; k++) {
    const a = (k / 8) * PI * 2;
    pts.push([-1.4 + (2.8 * k) / (turns * 8), 0.42 + Math.sin(a) * R, Math.cos(a) * R]);
  }
  b.tube('wire', pts, 0.008, turns * 16, 3);
  // the barbs
  for (let k = 0; k < turns * 8; k += 2) {
    const p = pts[k];
    b.box('steel', 0.05, 0.012, 0.012, { p, r: [r() * PI, r() * PI, 0] });
  }
  b.cylBetween('wire', [-1.42, 0.85, 0], [1.42, 0.85, 0], 0.005, 0.005, 3);
};

// A barricade of furniture across a gap, along X: a table on its side, a door, a mattress, chairs and planks jammed in.
MAINLAND_PROPS.barricade = (b, r) => {
  b.box('wood', 1.5, 0.9, 0.06, { p: [-0.8, 0.45, -0.1], r: [0.12, 0, 0], c: WOODS[1] }); // the table's top
  for (const [x, y] of [[-1.45, 0.1], [-0.15, 0.1], [-1.45, 0.8], [-0.15, 0.8]]) b.box('wood', 0.07, 0.07, 0.55, { p: [x, y, 0.22], c: WOODS[1] });
  b.box('door', 0.85, 1.3, 0.05, { p: [0.7, 0.72, -0.25], r: [0.14, 0.1, 0.2] });
  b.box('mattress', 1.3, 0.9, 0.2, { p: [0.8, 0.52, 0.12], r: [-0.2, 0, -0.06] });
  for (const [x, z, a] of [[-0.3, 0.12, 0.4], [1.15, 0.1, -0.5]]) {
    b.group({ p: [x, 0.72, z], r: [1.9, a, 0.3] }, () => {
      b.box('wood', 0.42, 0.04, 0.42, { c: WOODS[3] });
      b.box('wood', 0.42, 0.5, 0.04, { p: [0, 0.25, 0.19], c: WOODS[3] });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('wood', 0.04, 0.36, 0.04, { p: [sx * 0.18, -0.18, sz * 0.18], c: WOODS[3] });
    });
  }
  for (let k = 0; k < 4; k++) plank(b, 'wood', rr(r, 1.6, 2.6), 0.03, 0.14, { p: [rr(r, -0.2, 0.2), 0.4 + k * 0.24, -0.42 + r() * 0.04], r: [0, 0, rr(r, -0.12, 0.12)], c: WOODS[k % 5] });
  b.box('cardboard', 0.5, 0.4, 0.4, { p: [-1.2, 0.2, -0.3], r: [0, 0.3, 0] });
};

// A shop's sign, where it fell: a long board face up on the pavement, its letters all but gone, a bracket still on it.
MAINLAND_PROPS.fallen_sign = (b, r, v) => {
  const col = v ? [0.2, 0.3, 0.4] : [0.5, 0.18, 0.14];
  b.box('paint', 3.0, 0.07, 0.8, { p: [0, 0.1, 0], r: [0.1, 0, 0.02], c: col });
  for (let k = 0; k < 6; k++) b.box('paint', rr(r, 0.16, 0.3), 0.012, rr(r, 0.3, 0.44), { p: [-1.1 + k * 0.44, 0.145 - (k - 2.5) * 0.009, -0.04], r: [0.1, 0, 0.02], c: [0.74, 0.7, 0.6] });
  for (const sx of [-1, 1]) b.cylBetween('rust', [sx * 1.2, 0.08, 0.4], [sx * 1.3, 0.05, 0.9], 0.02, 0.02, 4);
  for (let k = 0; k < 5; k++) b.box('glass', 0.12, 0.008, 0.09, { p: [rr(r, -1.3, 1.3), 0.004, rr(r, -0.5, -0.42)], r: [0, r() * PI, 0] });
};

// A power pole down across the ground (along X): the pole, its crossarm and insulators, the wires it brought with it.
MAINLAND_PROPS.pole_down = (b, r) => {
  b.cylBetween('bark_dead', [-4.4, 0.16, 0], [4.4, 0.2, 0.25], 0.15, 0.11, 8);
  b.box('wood', 0.1, 0.1, 2.0, { p: [3.6, 0.36, 0.2], r: [0.12, 0.1, 0], c: WOODS[4] });
  for (const dz of [-0.8, 0, 0.8]) b.cyl('bone', 0.04, 0.05, 0.12, 6, { p: [3.6, 0.47 + dz * 0.12, 0.2 + dz], r: [0.12, 0, 0] });
  for (const dz of [-0.8, 0.8]) b.tube('wire', [[3.6, 0.5 + dz * 0.12, 0.2 + dz], [2.2, 0.05, dz * 1.0], [0.4, 0.03, dz * 0.9 + 0.2], [-1.5, 0.03, dz * 0.6]], 0.008, 10, 3);
  b.box('rust', 0.5, 0.35, 0.4, { p: [-3.6, 0.4, 0.1], r: [0, 0, 0.1] }); // the transformer can it carried, split
  weeds(b, r, [[-2, 0.4], [1.2, -0.4], [3.9, 0.8]], 0.45);
};

// A dumpster on its side, its lids open on the ground, what was in it thrown out in front (-Z).
MAINLAND_PROPS.dumpster_tipped = (b, r) => {
  const col = [0.24, 0.36, 0.26];
  b.box('paint', 1.2, 1.1, 1.84, { p: [0.05, 0.57, 0], c: col });
  b.box('dark', 0.02, 1.0, 1.72, { p: [-0.56, 0.57, 0] }); // its mouth
  for (const sz of [-1, 1]) b.box('plastic', 0.9, 0.04, 0.86, { p: [-0.95 + 0.26, 0.03, sz * 0.45], r: [0, sz * 0.1, 0] });
  for (const [x, z] of [[0.66, -0.7], [0.66, 0.7]]) b.cyl('rubber', 0.07, 0.07, 0.05, 8, { p: [x, 0.95, z], r: [0, 0, PI / 2] });
  b.sphere('plastic', 0.28, 7, 5, { p: [-0.5, 0.2, 0.3], s: [1, 0.7, 1] });
  b.sphere('plastic', 0.24, 7, 5, { p: [-0.45, 0.17, -0.4], s: [1, 0.7, 1.1] });
  for (let k = 0; k < 6; k++) b.box('cloth', rr(r, 0.2, 0.36), 0.004, rr(r, 0.14, 0.26), { p: [-0.5 + rr(r, -0.12, 0.12), 0.005 + k * 0.001, rr(r, -0.85, 0.85)], r: [0, r() * PI, 0], c: pick(r, PAPER) });
};

// A shop's awning, torn: its frame bent down off the wall (the wall is local z = 0, it hangs out towards -Z), what
// is left of the canvas in strips. The origin is where it is fixed to the wall.
MAINLAND_PROPS.awning = (b, r, v) => {
  const col = v ? [0.2, 0.34, 0.26] : [0.5, 0.2, 0.16];
  for (const sx of [-1, 1]) {
    b.cylBetween('rust', [sx * 1.6, 0, -0.02], [sx * 1.6, -0.55 - (sx > 0 ? 0.25 : 0), -1.2], 0.02, 0.02, 4);
    b.cylBetween('rust', [sx * 1.6, -0.75, -0.02], [sx * 1.6, -0.5 - (sx > 0 ? 0.25 : 0), -1.0], 0.015, 0.015, 4);
  }
  b.cylBetween('rust', [-1.6, -0.55, -1.2], [1.6, -0.8, -1.2], 0.02, 0.02, 4);
  b.box('rust', 3.3, 0.05, 0.03, { p: [0, 0, -0.02] });
  // strips of canvas from the wall out to the bar, some gone, the rest sagging; a scalloped edge hanging from the bar
  for (let k = 0; k < 7; k++) {
    if (r() < 0.3) continue;
    const x = -1.38 + k * 0.46, drop = -0.55 - ((x + 1.6) / 3.2) * 0.25;
    const len = Math.hypot(1.18, drop);
    b.box('cloth', 0.44, 0.012, len, { p: [x, drop / 2, -0.6], r: [Math.atan2(-drop, 1.18), 0, 0], c: k % 2 ? col : [0.7, 0.66, 0.56] });
    if (r() < 0.6) b.box('cloth', 0.44, rr(r, 0.14, 0.3), 0.01, { p: [x, drop - 0.1, -1.2], c: col });
  }
};

// The way down to the underground, shut: a kerb round the stairwell with railings on three sides, open to -Z, the
// stair choked with rubble and a roll gate rusted half down, a post with its roundel at the corner.
MAINLAND_PROPS.subway_entrance = (b, r) => {
  const W = 3.6, D = 6.4;
  for (const sx of [-1, 1]) {
    b.box('concrete', 0.3, 0.5, D, { p: [sx * (W / 2 - 0.15), 0.25, 0] });
    b.box('metal', 0.05, 0.05, D - 0.2, { p: [sx * (W / 2 - 0.15), 1.1, 0] });
    for (let k = 0; k < 6; k++) b.box('metal', 0.04, 0.6, 0.04, { p: [sx * (W / 2 - 0.15), 0.8, -D / 2 + 0.2 + k * 1.2] });
  }
  b.box('concrete', W, 0.5, 0.3, { p: [0, 0.25, D / 2 - 0.15] });
  b.box('metal', W - 0.2, 0.05, 0.05, { p: [0, 1.1, D / 2 - 0.15] });
  for (let k = 0; k < 4; k++) b.box('metal', 0.04, 0.6, 0.04, { p: [-W / 2 + 0.3 + k * 1.0, 0.8, D / 2 - 0.15] });
  // the well: dark at the back, the first steps down, then the fall of rubble that filled it
  b.box('dark', W - 0.6, 0.02, D - 0.6, { p: [0, 0.02, 0.1] });
  for (let k = 0; k < 4; k++) b.box('concrete', W - 0.6, 0.16, 0.34, { p: [0, 0.34 - k * 0.09, -D / 2 + 0.25 + k * 0.34] });
  for (let k = 0; k < 7; k++) b.rock('concrete', rr(r, 0.3, 0.5), { seed: 31 + k * 3, scale: [1.3, 0.7, 1], p: [rr(r, -1.0, 1.0), 0.2 + r() * 0.2, rr(r, -1.2, 2.2)] });
  b.box('concrete', 1.8, 0.16, 1.2, { p: [0.3, 0.42, 1.2], r: [0.3, 0.5, 0.1] });
  // the gate: slats, down as far as the heap
  for (let k = 0; k < 5; k++) b.box('rust', W - 0.64, 0.1, 0.03, { p: [0, 0.98 - k * 0.11, -0.6], r: [0, 0, 0.03] });
  // the sign
  b.cyl('metal', 0.05, 0.06, 3.2, 6, { p: [W / 2 - 0.15, 1.6, -D / 2 + 0.15] });
  b.cyl('paint', 0.36, 0.36, 0.06, 14, { p: [W / 2 - 0.15, 3.2, -D / 2 + 0.15], r: [PI / 2, 0, 0], c: [0.5, 0.16, 0.12] });
  for (const z of [-0.035, 0.035]) {
    // the letter M, both faces
    for (const [x, a] of [[-0.14, 0], [0.14, 0], [-0.07, -0.42], [0.07, 0.42]]) b.box('paint', 0.05, a ? 0.3 : 0.36, 0.01, { p: [W / 2 - 0.15 + x, 3.2 + (a ? 0.04 : 0), -D / 2 + 0.15 + z], r: [0, 0, a], c: [0.8, 0.78, 0.7] });
  }
  weeds(b, r, [[1.2, -2.6], [-1.3, 2.4], [0.2, 0.4]], 0.5);
};

// A shipping container: corrugated steel gone to rust along every seam, its doors at +Z (the third kind: one ajar).
MAINLAND_PROPS.shipping_container = (b, r, v) => {
  const col = [[0.42, 0.2, 0.14], [0.16, 0.3, 0.38], [0.36, 0.4, 0.3]][v];
  const W = 2.44, H = 2.6, D = 6.06;
  b.box('paint', W - 0.06, H - 0.1, D - 0.06, { p: [0, H / 2, 0], c: col });
  // the corner posts and rails stand proud of the ribbed sides
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('paint', 0.14, H, 0.14, { p: [sx * (W / 2 - 0.07), H / 2, sz * (D / 2 - 0.07)], c: col });
  for (const sx of [-1, 1]) for (const y of [0.08, H - 0.08]) b.box('paint', 0.12, 0.16, D, { p: [sx * (W / 2 - 0.06), y, 0], c: col });
  // (the ribs a shade lighter than the panel between them, and standing further out: the corrugation reads from across
  // the yard, where the light alone does not draw it)
  const rib = col.map((v) => Math.min(1, v * 1.28 + 0.02));
  for (const sx of [-1, 1]) for (let k = 0; k < 14; k++) b.box('paint', 0.07, H - 0.4, 0.18, { p: [sx * (W / 2 - 0.005), H / 2, -D / 2 + 0.45 + k * 0.4], c: rib });
  for (let k = 0; k < 5; k++) b.box('paint', 0.36, H - 0.4, 0.06, { p: [-W / 2 + 0.42 + k * 0.4, H / 2, -D / 2 - 0.005], c: rib }); // (and down its blind end)
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) b.box('rust', 0.012, rr(r, 0.4, 1.2), rr(r, 0.6, 1.6), { p: [sx * (W / 2 + 0.001), rr(r, 0.4, 1.4), rr(r, -2.2, 2.2)] });
  // the doors: two leaves with their locking bars
  for (const sx of [-1, 1]) {
    const ajar = v === 2 && sx > 0;
    b.group({ p: [sx * (W / 2 - 0.08), 0, D / 2 - 0.02], r: [0, ajar ? 0.3 : 0, 0] }, () => {
      b.box('paint', 1.12, H - 0.3, 0.05, { p: [-sx * 0.56, H / 2, ajar ? -0.03 : 0], c: col });
      for (const dx of [0.3, 0.8]) b.cyl('steel', 0.018, 0.018, H - 0.4, 5, { p: [-sx * dx, H / 2, 0.035 - (ajar ? 0.03 : 0)] });
    });
    if (ajar) b.box('dark', 1.1, H - 0.3, 0.02, { p: [sx * 0.57, H / 2, D / 2 - 0.05] });
  }
};

// A cargo ship 120 m long (the docks' freighter, drawn only: its solids are the docks' own boxes). Its origin is its
// keel under the middle of the hull, the bow to -Z. The hull is lofted from one section - a flat bottom, the bilge, the
// side standing straight to the deck - pinched to a raked stem with its flare (each height runs further forward than
// the one under it), the run of the stern lifted aft of the midbody to a flat transom; painted in bands at their
// heights (antifouling under the waterline, the boot-top at it, the topsides, the sheer line). On deck: the rails, the
// house aft with its windows, the bridge and its wings, the funnel, a mast forward, the anchors in their hawses.
MAINLAND_PROPS.freighter_hull = (b) => {
  const D = 12; // keel to main deck amidships
  const WL = 4.6; // the waterline
  // the section, half of it, from the keel out and up: [x, y] (row 7: the top of the boot-top, a band of red over the
  // waterline; rows 9-10 the sheer strake, pale)
  const SEC = [[0, 0], [7.4, 0], [8.7, 0.3], [9.5, 1.0], [9.9, 2.0], [10, 3.2], [10, WL - 0.3], [10, WL + 1.3], [10, 8.5], [10, D - 0.35], [10, D]];
  const RED = [0.36, 0.11, 0.07];
  const HULL = [0.06, 0.065, 0.075];
  const BANDS = [[0, 7, RED], [7, 9, HULL], [9, 10, [0.6, 0.58, 0.53]]];
  const zs = [];
  for (let z = -74; z < -40; z += 1.7) zs.push(z);
  for (let z = -40; z < 40; z += 10) zs.push(z);
  for (let z = 40; z <= 60.01; z += 2.5) zs.push(z);
  // the sheer: the deck rises to the bow (the forecastle stands 3 m over the main deck) and a little to the stern
  const sheer = (z) => 3.0 * (z < -46 ? Math.min(1, (-46 - z) / 8) : 0) + 1.0 * (z > 44 ? Math.min(1, (z - 44) / 16) : 0);
  // a point of the section at station z
  const at = (z, x0, y0) => {
    let x = x0, y = y0;
    if (y0 > WL + 1.3) y += sheer(z) * ((y0 - WL - 1.3) / (D - WL - 1.3));
    if (z > 40) {
      const s = Math.min(1, (z - 40) / 20);
      const keel = 4.4 * s * s;
      if (y < keel) y = keel + (y - keel) * 0.1;
      x *= 1 - 0.1 * s * s;
    }
    if (z < -40) {
      // (the stem raked, and the flare: each height runs further forward and wider than the one under it)
      const stem = -66 - 8 * (Math.min(y, D) / D);
      const f = Math.min(1, (-40 - z) / (-40 - stem));
      x *= Math.sqrt(Math.max(0, 1 - f ** 2.2)) * (1 + 0.06 * (y / D) * f);
    }
    return [x, y];
  };
  for (const [j0, j1, col] of BANDS) {
    for (const side of [1, -1]) {
      const pos = [], uv = [], idx = [];
      const m = j1 - j0 + 1;
      for (const z of zs) {
        for (let j = j0; j <= j1; j++) {
          const [x, y] = at(z, SEC[j][0], SEC[j][1]);
          pos.push(x * side, y, z);
          uv.push(z, y);
        }
      }
      for (let ii = 0; ii + 1 < zs.length; ii++) {
        for (let jj = 0; jj + 1 < m; jj++) {
          const a = ii * m + jj, bb = a + 1, c = a + m, d = c + 1;
          if (side > 0) idx.push(a, bb, c, bb, d, c);
          else idx.push(a, c, bb, bb, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      b.add('paint', g, { raw: true, c: col });
    }
  }
  // the transom: the last section, closed (a fan from its middle)
  {
    const z = zs[zs.length - 1];
    const ring = [];
    for (let k = 0; k < SEC.length; k++) ring.push(at(z, SEC[k][0], SEC[k][1]));
    const pos = [0, 8, z];
    for (const [x, y] of ring) pos.push(x, y, z);
    for (let k = ring.length - 1; k >= 0; k--) pos.push(-ring[k][0], ring[k][1], z);
    const idx = [];
    const n = ring.length * 2;
    for (let k = 1; k < n; k++) idx.push(0, k, k + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, k) => (k % 3 === 0 ? [v] : k % 3 === 1 ? [v] : [])), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.add('paint', g, { raw: true, c: HULL });
  }
  const edge = (z) => at(z, 10, D)[0];
  const deckAt = (z) => D + sheer(z);
  // the forecastle's deck, stepped up over the bow, and its front to the main deck with a door and the ladders up
  for (let z = -66; z < -46; z += 2) {
    const w = Math.max(0.5, Math.min(edge(z), edge(z + 2)) * 2 - 0.2);
    b.box('paint', w, 0.2, 2.05, { p: [0, deckAt(z + 1) - 0.1, z + 1], c: [0.22, 0.2, 0.18] });
  }
  b.box('paint', 19.4, 3.0, 0.3, { p: [0, D + 1.5, -46.2], c: HULL });
  b.box('dark', 1.0, 1.9, 0.05, { p: [3, D + 0.95, -46.04] });
  for (const sx of [-6, 6]) b.box('steel', 0.7, 0.06, 3.2, { p: [sx, D + 1.5, -44.8], r: [0.8, 0, 0] });
  // the windlass on the forecastle
  for (const sx of [-2.4, 2.4]) b.cyl('dark', 0.55, 0.55, 1.0, 10, { p: [sx, D + 3.6, -58], r: [0, 0, PI / 2] });
  // the rails along the deck's edge, following the sheer up over the forecastle
  for (const side of [1, -1]) {
    for (let z = -71; z < 59; z += 2.5) b.box('steel', 0.07, 1.1, 0.07, { p: [edge(z) * side - side * 0.12, deckAt(z) + 0.55, z] });
    for (let k = 0; k + 1 < zs.length; k++) {
      const [z0, z1] = [zs[k], zs[k + 1]];
      const [x0, x1] = [edge(z0) * side - side * 0.12, edge(z1) * side - side * 0.12];
      const [y0, y1] = [deckAt(z0), deckAt(z1)];
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      if (len < 0.05) continue;
      for (const y of [1.1, 0.6]) b.box('steel', 0.05, 0.05, len, { p: [(x0 + x1) / 2, (y0 + y1) / 2 + y, (z0 + z1) / 2], r: [-Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)), Math.atan2(x1 - x0, z1 - z0), 0], order: 'YXZ' });
    }
  }
  // the anchors in their hawses, either side of the bow, and the rust run down from them
  for (const side of [1, -1]) {
    b.cyl('dark', 0.55, 0.55, 0.3, 10, { p: [edge(-63) * side * 0.99, 11.4, -63], r: [0, 0, PI / 2] });
    b.box('paint', 0.03, 4.2, 0.5, { p: [edge(-63) * side + side * 0.02, 8.9, -63], c: [0.3, 0.13, 0.07] });
  }
  // the hull's plating: the strakes along it and the butts of its plates every 6 m, the weld lines a shade darker; a
  // rust run under each scupper; the draught marks fore and aft; a pilot door; the accommodation ladder down to the quay
  for (const side of [1, -1]) {
    for (const y of [6.8, 8.6, 10.3]) b.box('paint', 0.04, 0.07, 82, { p: [side * 10.02, y, -1], c: [0.025, 0.028, 0.032] });
    for (let z = -36; z <= 40; z += 6) b.box('paint', 0.04, D - WL - 1.65, 0.07, { p: [side * 10.02, (WL + 1.3 + D - 0.35) / 2, z], c: [0.025, 0.028, 0.032] });
    for (let z = -32; z <= 36; z += 9) b.box('paint', 0.035, 2.6 + ((z * 7) & 3) * 0.4, 0.35, { p: [side * 10.03, D - 1.9, z + 2], c: [0.27, 0.12, 0.06] });
    for (const z of [-60, 54]) for (let k = 0; k < 6; k++) b.box('paint', 0.04, 0.1, 0.5, { p: [at(z, 10, 2 + k)[0] * side + side * 0.03, 2.2 + k * 0.6, z], c: [0.85, 0.85, 0.8] });
  }
  b.box('dark', 0.05, 1.8, 1.0, { p: [10.03, 7.6, 30] });
  // (the accommodation ladder is hoisted along the side, clear of the quay: let down it reached where people walk)
  b.box('steel', 0.08, 0.9, 9.5, { p: [10.15, 10.2, 20] });
  // THE HOUSE: one tall narrow block at the stern, five decks of cabins, its windows in rows on its front and its
  // sides, the bridge on its top with its wings out to the ship's sides, the funnel abaft it, a lifeboat in its davits
  // either side (the containers fill the deck forward of it: the docks lay them in their bays)
  const white = [0.72, 0.7, 0.64];
  const HZ0 = 45, HZ1 = 56, HW = 14, HH = 14;
  const hzc = (HZ0 + HZ1) / 2;
  b.box('paint', HW, HH, HZ1 - HZ0, { p: [0, D + HH / 2, hzc], c: white });
  for (let k = 0; k < 5; k++) {
    const y = D + 1.6 + k * 2.75;
    for (let x = -HW / 2 + 1.1; x <= HW / 2 - 1.1; x += 1.5) b.box('dark', 0.9, 0.8, 0.05, { p: [x, y, HZ0 - 0.02] });
    for (const side of [1, -1]) for (let z = HZ0 + 1.2; z < HZ1 - 0.8; z += 1.6) b.box('dark', 0.05, 0.8, 0.9, { p: [side * (HW / 2 + 0.02), y, z] });
    b.box('paint', HW + 0.3, 0.12, 0.3, { p: [0, y + 1.2, HZ0 - 0.1], c: [0.55, 0.53, 0.48] });
  }
  const BY = D + HH;
  b.box('paint', 12, 3.0, 6.5, { p: [0, BY + 1.5, HZ0 + 3.25], c: white });
  b.box('paint', 21.2, 0.3, 3.2, { p: [0, BY + 0.15, HZ0 + 1.6], c: [0.55, 0.53, 0.48] }); // (the deck of the wings)
  for (const side of [1, -1]) {
    b.box('paint', 4.6, 1.1, 0.08, { p: [side * 8.3, BY + 0.85, HZ0 + 0.04], c: white });
    b.box('paint', 0.08, 1.1, 3.1, { p: [side * 10.56, BY + 0.85, HZ0 + 1.6], c: white });
    for (const sz of [-1, 1]) b.box('paint', 0.18, 1.6, 0.18, { p: [side * 9.8, BY - 0.8, HZ0 + 1.6 + sz * 1.2], r: [0, 0, side * -0.5], c: white }); // (its brackets)
  }
  b.box('dark', 11.6, 1.1, 0.06, { p: [0, BY + 1.95, HZ0 - 0.04], r: [0.16, 0, 0] });
  for (const side of [1, -1]) b.box('dark', 0.06, 1.0, 5.6, { p: [side * 6.02, BY + 1.95, HZ0 + 3.3] });
  b.box('paint', 12.6, 0.25, 7.0, { p: [0, BY + 3.12, HZ0 + 3.25], c: [0.55, 0.53, 0.48] });
  b.box('steel', 0.3, 4.2, 0.3, { p: [0, BY + 5.3, HZ0 + 4] });
  b.box('steel', 3.6, 0.12, 0.25, { p: [0, BY + 6.6, HZ0 + 4] });
  b.box('dark', 2.6, 0.18, 0.5, { p: [0, BY + 5.0, HZ0 + 4.4], r: [0, 0.6, 0] });
  // the funnel abaft the bridge, raked, its band and its cap
  b.cyl('paint', 1.55, 2.1, 7, 16, { p: [0, BY + 3.5, HZ1 - 2.2], r: [0.12, 0, 0], c: [0.08, 0.08, 0.09] });
  b.cyl('paint', 1.7, 1.75, 1.3, 16, { p: [0, BY + 4.6, HZ1 - 2.05], r: [0.12, 0, 0], c: [0.5, 0.12, 0.08] });
  b.cyl('dark', 1.62, 1.62, 0.35, 16, { p: [0, BY + 7.0, HZ1 - 1.75], r: [0.12, 0, 0] });
  // the lifeboats in their davits, either side of the house
  for (const side of [1, -1]) {
    b.box('paint', 2.2, 1.8, 7.0, { p: [side * (HW / 2 + 1.7), D + 7.6, hzc], c: [0.85, 0.36, 0.08] });
    b.box('paint', 2.3, 0.5, 7.1, { p: [side * (HW / 2 + 1.7), D + 8.75, hzc], c: [0.8, 0.78, 0.72] });
    for (const sz of [-3, 3]) b.box('steel', 0.2, 3.6, 0.2, { p: [side * (HW / 2 + 0.5), D + 8, hzc + sz], r: [0, 0, side * -0.35] });
  }
  // the mast forward, on the forecastle, with its crosstree and lamp
  b.box('steel', 0.45, 12, 0.45, { p: [0, D + 3 + 6, -52] });
  b.box('steel', 4.4, 0.25, 0.25, { p: [0, D + 3 + 9.5, -52] });
  b.cyl('dark', 0.18, 0.18, 0.4, 8, { p: [0, D + 3 + 12.2, -52] });
};

// A substation transformer: a steel tank with banks of cooling fins down both sides, three bushings on its lid, on
// a concrete plinth; oil down its side.
MAINLAND_PROPS.power_transformer = (b, r) => {
  b.box('concrete', 2.4, 0.3, 1.9, { p: [0, 0.15, 0] });
  b.box('metal', 1.5, 1.6, 1.2, { p: [0, 1.1, 0] });
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) b.box('metal', 0.36, 1.3, 0.04, { p: [sx * 0.94, 1.05, -0.48 + k * 0.16] });
  for (const sx of [-1, 1]) b.box('rust', 0.3, 0.06, 1.1, { p: [sx * 0.92, 1.72, 0] });
  for (let k = -1; k <= 1; k++) {
    b.cyl('bone', 0.06, 0.09, 0.6, 8, { p: [k * 0.45, 2.2, 0] });
    for (let j = 0; j < 4; j++) b.cyl('bone', 0.12, 0.12, 0.03, 8, { p: [k * 0.45, 2.02 + j * 0.13, 0] });
    b.cyl('steel', 0.02, 0.02, 0.26, 4, { p: [k * 0.45, 2.63, 0] });
  }
  b.cyl('metal', 0.22, 0.22, 0.9, 8, { p: [0, 2.05, 0.42], r: [0, 0, PI / 2] }); // the conservator
  b.box('dark', 0.5, 1.2, 0.012, { p: [0.3, 0.95, -0.607] });
  label(b, 'labels', 'hazard_small', 0.3, 0.3, [-0.35, 1.3, -0.607], 'z-');
  weeds(b, r, [[1.1, 0.9], [-1.0, -0.9]], 0.5);
};

// A pupil's desk and its chair (one kind: both over on their sides).
MAINLAND_PROPS.school_desk = (b, r, v) => {
  b.group(v ? { p: [0.37, 0.33, 0], r: [0, 0.3, PI / 2] } : { p: [0, 0, 0] }, () => {
    b.box('wood', 0.62, 0.03, 0.42, { p: [0, 0.72, -0.08], c: WOODS[3] });
    b.box('metal', 0.56, 0.1, 0.34, { p: [0, 0.65, -0.08] });
    for (const sx of [-1, 1]) {
      b.cylBetween('steel', [sx * 0.27, 0, -0.24], [sx * 0.27, 0.7, -0.22], 0.012, 0.012, 4);
      b.cylBetween('steel', [sx * 0.27, 0, 0.06], [sx * 0.27, 0.7, 0.06], 0.012, 0.012, 4);
    }
  });
  b.group(v ? { p: [0.1, 0.24, 0.05], r: [PI / 2, 0.6, 0] } : { p: [0, 0, 0.24] }, () => {
    b.box('wood', 0.36, 0.025, 0.34, { p: [0, 0.42, 0], c: WOODS[1] });
    b.box('wood', 0.36, 0.2, 0.025, { p: [0, 0.68, 0.16], c: WOODS[1] });
    for (const sx of [-1, 1]) {
      b.cylBetween('steel', [sx * 0.16, 0, -0.15], [sx * 0.16, 0.42, -0.15], 0.01, 0.01, 4);
      b.cylBetween('steel', [sx * 0.16, 0, 0.16], [sx * 0.16, 0.78, 0.16], 0.01, 0.01, 4);
    }
  });
};

// ------------------------------------------------------------------ Calder Field
// (the plane at Calder Field, the wreck and the one that flies, and the light aircraft round it: aircraft.js,
// lightplane.js)
// A baggage cart: a flat bed on four small wheels with rails at its ends, a tow bar, cases left on it.
MAINLAND_PROPS.baggage_cart = (b, r) => {
  b.box('paint', 1.4, 0.08, 2.4, { p: [0, 0.5, 0], c: [0.62, 0.5, 0.16] });
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      b.box('paint', 0.05, 0.9, 0.05, { p: [sx * 0.66, 0.99, sz * 1.16], c: [0.62, 0.5, 0.16] });
      b.cyl('rubber', 0.2, 0.2, 0.12, 8, { p: [sx * 0.6, 0.2, sz * 0.85], r: [0, 0, PI / 2] });
    }
    b.box('paint', 1.36, 0.05, 0.05, { p: [0, 1.42, sz * 1.16], c: [0.62, 0.5, 0.16] });
    b.box('rust', 1.2, 0.08, 0.08, { p: [0, 0.3, sz * 0.85] });
  }
  b.cylBetween('rust', [0, 0.4, -1.2], [0, 0.3, -1.4], 0.03, 0.03, 5);
  b.box('plastic', 0.7, 0.26, 0.5, { p: [-0.2, 0.67, -0.5], r: [0, 0.2, 0] });
  b.box('cloth', 0.6, 0.4, 0.3, { p: [0.25, 0.74, 0.3], r: [0, -0.3, 0], c: [0.4, 0.2, 0.16] });
  b.box('cloth', 0.5, 0.22, 0.36, { p: [-0.25, 0.65, 0.75], c: [0.2, 0.26, 0.36] });
  b.box('plastic', 0.55, 0.2, 0.4, { p: [-0.15, 0.9, -0.45], r: [0, -0.4, 0.05] });
};

// A windsock on its pole, limp: the frame ring at the top, the sock hanging torn from it.
MAINLAND_PROPS.windsock = (b, r) => {
  b.cyl('concrete', 0.16, 0.18, 0.2, 8, { p: [0, 0.1, 0] });
  b.cyl('metal', 0.045, 0.07, 6, 6, { p: [0, 3, 0] });
  b.torus('steel', 0.3, 0.012, 4, 10, PI * 2, { p: [0.32, 5.9, 0], r: [0, PI / 2, 0] });
  b.cylBetween('steel', [0, 5.9, 0], [0.32, 5.9, 0], 0.012, 0.012, 4);
  // the sock: rings of cloth, each smaller and hanging further down
  for (let k = 0; k < 5; k++) {
    if (k === 3) continue; // (a band gone)
    const rad = 0.3 - k * 0.04;
    b.cyl('cloth', rad - 0.03, rad, 0.42, 8, { p: [0.36 + k * 0.06, 5.66 - k * 0.42, 0], r: [0, 0, 0.14], c: k % 2 ? [0.74, 0.7, 0.62] : [0.62, 0.3, 0.14] });
  }
};

// A runway edge light: a stake, a round housing, a lens (one kind: the lens smashed, glass on the ground).
MAINLAND_PROPS.runway_light = (b, r, v) => {
  b.cyl('concrete', 0.13, 0.14, 0.06, 8, { p: [0, 0.03, 0] });
  b.cyl('metal', 0.03, 0.03, 0.22, 5, { p: [0, 0.17, 0] });
  b.cyl('paint', 0.09, 0.07, 0.1, 8, { p: [0, 0.31, 0], c: [0.62, 0.5, 0.16] });
  if (!v) b.sphere('glass', 0.075, 8, 4, { thetaLen: PI / 2, p: [0, 0.36, 0] });
  else for (let k = 0; k < 4; k++) b.box('glass', 0.05, 0.006, 0.04, { p: [rr(r, -0.12, 0.12), 0.064, rr(r, -0.12, 0.12)], r: [0, r() * PI, 0] });
  if (!v) b.cyl('dark', 0.07, 0.07, 0.01, 8, { p: [0, 0.362, 0] });
};

// An airliner that came down short: a twin-jet of fifty seats, broken behind the wing. The front of it lies along
// -Z on its belly, the left wing still on it; the tail section is slewed off to the right behind; the right wing was
// torn away and lies beside the break, an engine thrown clear of it. Scorched where it burnt.
const LINER = { R: 1.35, Y: 1.2 };
const roundProf = (t) => [Math.cos(t * PI * 2), Math.sin(t * PI * 2)];
MAINLAND_PROPS.airliner_wreck = (b, r) => {
  const white = [0.72, 0.72, 0.68], soot = [0.16, 0.14, 0.13], red = [0.46, 0.14, 0.12];
  const R = LINER.R, Y = LINER.Y;
  const D = R * 2;
  // a length of fuselage along Z in the builder's current frame, with its cheat line and windows; c: its colour
  const tube = (secs, c, wins) => {
    b.loft('aircraft', secs, roundProf, 14, { c, flip: true });
    if (!wins) return;
    for (const sx of [-1, 1]) {
      for (let z = wins[0]; z < wins[1]; z += 0.56) b.box('dark', 0.02, 0.3, 0.24, { p: [sx * (R - 0.012), Y + 0.42, z] });
      b.box('aircraft', 0.016, 0.22, wins[1] - wins[0] + 0.6, { p: [sx * (R - 0.004), Y + 0.02, (wins[0] + wins[1]) / 2], c: red });
    }
  };
  // ---- the front section: nose at z -14, broken off at z 1.5
  tube([{ z: -14.0, w: 0.3, h: 0.3, y: Y - 0.3 }, { z: -13.3, w: 1.5, h: 1.4, y: Y - 0.2 }, { z: -12.0, w: 2.4, h: 2.3, y: Y - 0.06 }, { z: -10.4, w: D, h: D, y: Y }, { z: 0.6, w: D, h: D, y: Y }, { z: 1.5, w: D - 0.1, h: D - 0.1, y: Y }], white, [-9.6, 0.4]);
  b.sphere('aircraft', 0.16, 6, 4, { p: [0, Y - 0.3, -14.0], c: soot });
  // the cockpit's glass, the door ahead of the wing open with what is left of its slide on the ground
  for (const sx of [-1, 1]) b.box('canopy', 0.9, 0.42, 0.03, { p: [sx * 0.5, Y + 0.62, -12.25], r: [-0.62, sx * -0.5, 0], order: 'YXZ', c: paneLook(0.55, sx) });
  b.box('dark', 0.03, 1.7, 0.86, { p: [-(R - 0.01), Y + 0.1, -9.9] });
  b.box('aircraft', 0.06, 1.7, 0.86, { p: [-R - 0.3, Y + 0.1, -10.9], r: [0, 0.35, 0], c: white });
  b.box('plastic', 0.9, 0.06, 0.8, { p: [-1.75, 0.38, -9.9], r: [0, 0, -0.5] }); // (a box of the fuselage's covers it)
  // the break: torn skin, the frames and the floor showing, seats thrown down
  b.cyl('dark', R - 0.06, R - 0.06, 0.04, 14, { p: [0, Y, 1.48], r: [PI / 2, 0, 0] });
  b.box('rust', D - 0.3, 0.1, 0.5, { p: [0, Y - 0.5, 1.6] });
  for (let k = 0; k < 7; k++) {
    const a = 0.3 + k * 0.85;
    b.box('aircraft', 0.5, 0.03, rr(r, 0.4, 0.9), { p: [Math.cos(a) * (R - 0.05), Y + Math.sin(a) * (R - 0.05), 1.7], r: [rr(r, -0.5, 0.5), 0, a + PI / 2], order: 'ZXY', c: k % 2 ? soot : white });
  }
  planeLinerScorch(b, soot, R, Y, -2.5, 1.4);
  // the left wing, on it, drooped to the ground at its tip; its engine under it
  slab(b, 'aircraft', { at: [-R + 0.3, Y - 0.55, -4.4], c: 3.6, t: 0.5 }, { at: [-12.4, 0.5, -1.6], c: 1.3, t: 0.2 }, { c: white });
  b.loft('aircraft', [{ z: -6.4, w: 1.3, h: 1.3, y: 0.66, x: -4.6 }, { z: -5.9, w: 1.44, h: 1.44, y: 0.72, x: -4.6 }, { z: -3.6, w: 1.2, h: 1.2, y: 0.66, x: -4.6 }, { z: -3.0, w: 0.5, h: 0.5, y: 0.62, x: -4.6 }], roundProf, 12, { c: white, flip: true });
  b.cyl('dark', 0.56, 0.56, 0.04, 12, { p: [-4.6, 0.68, -6.38], r: [PI / 2, 0, 0] });
  b.cyl('steel', 0.2, 0.2, 0.3, 8, { p: [-4.6, 0.68, -6.3], r: [PI / 2, 0, 0] });
  // ---- the tail section, slewed: cabin, the cone, the fin and tailplane
  b.group({ p: [3.2, 0, 3.4], r: [0, 0.55, 0.16] }, () => {
    tube([{ z: 0, w: D - 0.1, h: D - 0.1, y: Y }, { z: 0.8, w: D, h: D, y: Y }, { z: 5.5, w: D, h: D, y: Y }, { z: 8.6, w: 1.5, h: 1.7, y: Y + 0.36 }, { z: 10.6, w: 0.3, h: 0.4, y: Y + 0.6 }], white, [1.2, 5.2]);
    b.cyl('dark', R - 0.1, R - 0.1, 0.04, 14, { p: [0, Y, 0.02], r: [PI / 2, 0, 0] });
    slab(b, 'aircraft', { at: [0, Y + 1.2, 5.4], c: 3.6, t: 0.3 }, { at: [0, Y + 4.4, 8.4], c: 1.8, t: 0.16 }, { c: red }, true);
    for (const sx of [-1, 1]) slab(b, 'aircraft', { at: [sx * 0.3, Y + 0.7, 7.0], c: 2.2, t: 0.22 }, { at: [sx * 4.6, Y + 0.9, 8.6], c: 1.0, t: 0.1 }, { c: white });
    planeLinerScorch(b, soot, R, Y, 0.1, 3.0);
  });
  // ---- the right wing, torn off, flat on the ground beside the break; the engine it carried, thrown clear
  b.group({ p: [7.6, 0.02, -3.0], r: [0, 0.5, 0] }, () => {
    slab(b, 'aircraft', { at: [-4.6, 0.3, -1.6], c: 3.4, t: 0.5 }, { at: [5.2, 0.16, 0.4], c: 1.3, t: 0.2 }, { c: white });
    b.box('aircraft', 2.6, 0.04, 0.7, { p: [1.0, 0.36, 1.6], r: [0.3, 0.1, 0], c: soot }); // a flap, hanging off
    for (let k = 0; k < 5; k++) b.cylBetween('rust', [-4.6, 0.3, -1.2 + k * 0.6], [-5.0 - r() * 0.3, 0.1 + r() * 0.4, -1.3 + k * 0.6], 0.02, 0.02, 4);
  });
  b.group({ p: [6.2, 0, -9.4], r: [0, 1.1, 0.2] }, () => {
    b.loft('aircraft', [{ z: -1.5, w: 1.3, h: 1.3, y: 0.62 }, { z: -1.0, w: 1.44, h: 1.44, y: 0.66 }, { z: 1.0, w: 1.2, h: 1.2, y: 0.62 }, { z: 1.5, w: 0.5, h: 0.5, y: 0.6 }], roundProf, 12, { c: soot, flip: true });
    b.cyl('dark', 0.56, 0.56, 0.04, 12, { p: [0, 0.64, -1.48], r: [PI / 2, 0, 0] });
    for (let k = 0; k < 8; k++) b.box('steel', 0.08, 0.5, 0.02, { p: [Math.cos((k / 8) * PI * 2) * 0.3, 0.64 + Math.sin((k / 8) * PI * 2) * 0.3, -1.44], r: [0, 0.3, (k / 8) * PI * 2 + PI / 2], order: 'ZYX' });
  });
  // what was thrown out along the furrow: seats, cases, torn skin, burnt ground
  b.box('ash', 9, 0.02, 7, { p: [1.5, 0.012, 2.4], r: [0, 0.3, 0] });
  for (let k = 0; k < 5; k++) {
    const x = rr(r, -1.0, 2.6), z = rr(r, 1.9, 3.4);
    b.group({ p: [x, 0.02, z], r: [k % 2 ? 1.4 : 0, r() * PI, 0] }, () => {
      b.box('cloth', 0.5, 0.12, 0.5, { p: [0, 0.3, 0], c: [0.2, 0.26, 0.36] });
      b.box('cloth', 0.5, 0.7, 0.1, { p: [0, 0.65, 0.22], c: [0.2, 0.26, 0.36] });
      b.box('steel', 0.44, 0.24, 0.06, { p: [0, 0.12, 0] });
    });
  }
  for (let k = 0; k < 5; k++) b.box('aircraft', rr(r, 0.6, 1.3), 0.02, rr(r, 0.4, 0.9), { p: [rr(r, -1.2, 2.8), 0.03 + k * 0.01, rr(r, 1.8, 3.6)], r: [rr(r, -0.1, 0.1), r() * PI, 0], c: k % 2 ? soot : white });
  weeds(b, r, [[1.6, -8], [-1.7, -3], [0.6, 2.6], [-6, -0.6], [8, -2.2]], 0.6);
};
// soot over a length of an airliner's fuselage: ragged patches on its upper skin
function planeLinerScorch(b, soot, R, Y, z0, z1) {
  for (let k = 0; k < 6; k++) {
    const a = 0.5 + k * 0.42;
    b.box('aircraft', 0.9, 0.012, z1 - z0, { p: [Math.cos(a) * (R + 0.004), Y + Math.sin(a) * (R + 0.004), (z0 + z1) / 2], r: [0, 0, a - PI / 2], c: soot });
  }
}
