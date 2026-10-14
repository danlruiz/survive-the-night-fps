// The singles of Calder Field that never got away (shared/props.js light_plane), built as the twin is (aircraft.js,
// out of aircraftkit.js).
import { label, weeds } from './propkit.js';
import { DULL, DIRT, clamp01, smooth, tint, shell, turn, makeBody, skinPatch, onTh, onSide, band, hoop, skinShape, FOIL_COARSE, lifting, panel, surfPatch, blade, acWheel } from './aircraftkit.js';

const PI = Math.PI;

// ================================================================== the single
// A light aircraft that did not get away: a four-seat high-wing single of the same years, 8.3 m long and 11 m
// across. A flat-four in a cowling behind a two-blade propeller, a cabin under the wing with a door a side, the
// tail cone tapering to a swept fin; the wing held by a strut each side; a nose wheel on an oleo and the main wheels
// on a sprung steel leg. White gone grey, with a stripe down its side.
//   variant 0: its nose leg has collapsed: it is down on its propeller and the folded leg, the tail in the air
//   variant 1: level on three flat tyres, its cowling gone from round the engine, the right wing tip crumpled
// It is built level, as it flew (LP.*: the ground at y = 0 under sound tyres), and then put down as it lies.
export const LP = { AXLE_Z: -0.75, WHEEL_R: 0.22, NOSE_Z: -2.45, NOSE_R: 0.18, HUB_Y: 1.22, HUB_Z: -3.68, PROP_R: 0.95, FIRE: 4, PITCH: 0.19, SINK: 0.06 };
export const LIGHT = makeBody([
  { z: -3.6, yb: 1.04, yt: 1.4, hw: 0.2, n: 2.2 },
  { z: -3.56, yb: 0.94, yt: 1.47, hw: 0.4, n: 2.8 },
  { z: -3.4, yb: 0.88, yt: 1.52, hw: 0.5, n: 3.2 },
  { z: -3.0, yb: 0.82, yt: 1.56, hw: 0.53, n: 3.2 },
  { z: -2.6, yb: 0.76, yt: 1.58, hw: 0.55, n: 3 },
  { z: -2.45, yb: 0.72, yt: 1.6, hw: 0.56, n: 3 },
  { z: -2.1, yb: 0.66, yt: 1.86, hw: 0.565, n: 3, wl: 0.45 },
  { z: -1.75, yb: 0.62, yt: 2.1, hw: 0.57, n: 3.2, wl: 0.42 },
  { z: -0.9, yb: 0.6, yt: 2.13, hw: 0.57, n: 3.4, wl: 0.42 },
  { z: -0.2, yb: 0.62, yt: 2.1, hw: 0.56, n: 3.2, wl: 0.42 },
  { z: 0.5, yb: 0.7, yt: 1.78, hw: 0.5, n: 2.8 },
  { z: 1.1, yb: 0.8, yt: 1.6, hw: 0.42, n: 2.6 },
  { z: 2.2, yb: 0.98, yt: 1.52, hw: 0.28, n: 2.4 },
  { z: 3.3, yb: 1.15, yt: 1.46, hw: 0.16, n: 2.2 },
  { z: 4.0, yb: 1.26, yt: 1.43, hw: 0.07, n: 2 },
  { z: 4.08, yb: 1.3, yt: 1.4, hw: 0.02, n: 2 },
]);
// the wing on the cabin's roof: 1.63 m of chord out to the end of the flaps, tapered beyond; 12 % thick
const LW = { Y: 2.02, KINK: 2.6, TIP: 5.4, ROUND: 0.08, BOX: 0.7, HINGE: 0.72, BEND: 4.2 };
export const lightWingAt = (x) => {
  const a = Math.abs(x), f = clamp01((a - LW.KINK) / (LW.TIP - LW.KINK)), over = clamp01((a - LW.TIP) / LW.ROUND);
  const k = Math.sqrt(1 - 0.8 * over * over), c = 1.63 - 0.5 * f;
  return { le: [x, LW.Y + 0.03 * a, -1.78 + 0.08 * f + c * (1 - k) * 0.4], c: c * k, t: 0.12 * (1 - 0.75 * over * over) };
};
export const LWINGS = lifting(lightWingAt, { m: 0.02, us: FOIL_COARSE });
const lightTailAt = (x) => {
  const a = Math.abs(x), f = clamp01(a / 1.72), over = clamp01((a - 1.72) / 0.05);
  const k = Math.sqrt(1 - 0.8 * over * over), c = 1.1 - 0.4 * f;
  return { le: [x, 1.4, 3.0 + 0.3 * f + c * (1 - k) * 0.4], c: c * k, t: 0.09 * (1 - 0.75 * over * over) };
};
export const LTAILS = lifting(lightTailAt, { us: FOIL_COARSE });
const lightFinAt = (y) => {
  const f = clamp01((y - 1.38) / 1.34), over = clamp01((y - 2.72) / 0.05);
  const k = Math.sqrt(1 - 0.8 * over * over), c = 1.45 - 0.85 * f;
  return { le: [0, y, 2.7 + 1.02 * f + c * (1 - k) * 0.4], c: c * k, t: 0.09 * (1 - 0.75 * over * over) };
};
export const LFINS = lifting(lightFinAt, { up: true, us: FOIL_COARSE });
const WHITE = [0.8, 0.79, 0.74];
// (the right wing's tip, crumpled: folded down from LW.BEND out, pushed back, its skin buckled)
const crumple = (p) => {
  const d = p[0] - LW.BEND;
  if (d <= 0) return p;
  const y0 = LW.Y + 0.03 * LW.BEND, a = 0.62 * Math.min(1, d / 0.3);
  const dy = p[1] - y0 + 0.035 * Math.sin(d * 13 + p[2] * 4);
  return [LW.BEND + d * Math.cos(a) + dy * Math.sin(a), y0 - d * Math.sin(a) + dy * Math.cos(a), p[2] + 0.22 * d];
};

export function lightPlane(b, r, v) {
  const stripe = v ? [0.16, 0.24, 0.44] : [0.5, 0.16, 0.12];
  const white = (x, y, z) => tint(WHITE, 1 - 0.3 * smooth(1.0, 0.62, y) * (z < 1 ? 1 : 0.5) - 0.05 * smooth(2, 4, z));
  const bare = v === 1; // the cowling is off
  const sink = v === 1 ? LP.SINK : 0.012;
  // as it lies: pitched onto its nose about the main wheels' axle, or let down onto its flat tyres
  if (v === 0) b.push([0, LP.WHEEL_R - sink, LP.AXLE_Z], [-LP.PITCH, 0, 0]).push([0, -LP.WHEEL_R, -LP.AXLE_Z]);
  else b.push([0, -sink, 0]);

  // ---- the fuselage; without its cowling it begins at the firewall
  shell(b, 'aircraft', LIGHT.rings(bare ? LP.FIRE : 0, LIGHT.S.length - 1, 18), { cfn: white });
  if (!bare) {
    // the nose bowl's two inlets, the landing light under the spinner, the line round the cowling's back edge
    for (const sx of [-1, 1]) skinPatch(b, 'dark', LIGHT, onTh([[-3.592, sx * (PI / 2 - 0.1)], [-3.5, sx * (PI / 2 - 0.2)], [-3.5, sx * (PI / 2 + 1.0)], [-3.592, sx * (PI / 2 + 0.9)]]), 2, 4, { out: 0.008 });
    skinPatch(b, 'glass', LIGHT, onTh([[-3.59, -0.3], [-3.52, -0.3], [-3.52, 0.3], [-3.59, 0.3]]), 1, 3, { out: 0.008 });
    hoop(b, 'aircraft', LIGHT, -2.6, 0.012, { c: DIRT, out: 0.006 });
  } else lightEngine(b);
  b.cylBetween('rust', [0.2, 0.84, -2.78], [0.22, 0.64, -2.64], 0.028, 0.028, 6); // the exhaust
  // the windscreen, broken: the dark of the cabin in its frame, what glass is left in the corners
  skinPatch(b, 'dark', LIGHT, onTh([[-2.42, PI - 1.0], [-1.8, PI - 0.86], [-1.8, PI + 0.86], [-2.42, PI + 1.0]]), 3, 8, { out: 0.01 });
  skinPatch(b, 'canopy', LIGHT, onTh([[-2.42, PI + 1.0], [-2.42, PI + 0.25], [-2.2, PI + 0.5], [-1.95, PI + 0.9]]), 2, 2, { out: 0.016 });
  skinPatch(b, 'canopy', LIGHT, onTh([[-2.42, PI - 1.0], [-2.42, PI - 0.62], [-2.3, PI - 0.72], [-2.15, PI - 0.96]]), 1, 1, { out: 0.016 });
  skinPatch(b, 'canopy', LIGHT, onTh([[-0.12, PI - 0.62], [0.46, PI - 0.6], [0.46, PI + 0.6], [-0.12, PI + 0.62]]), 2, 4, { out: 0.014 }); // the back window
  for (const sx of [-1, 1]) {
    // the door's window, the one behind it, the door's outline and its handle
    for (const w of [[[-2.12, 1.56], [-1.05, 1.56], [-1.05, 1.9], [-1.74, 1.9]], [[-0.9, 1.56], [-0.2, 1.6], [-0.3, 1.9], [-0.9, 1.9]]]) {
      const c = [0, 1].map((a) => w.reduce((s, p) => s + p[a] / w.length, 0));
      skinShape(b, 'aircraft', LIGHT, sx, w.map(([z, y]) => [c[0] + (z - c[0]) * 1.1, c[1] + (y - c[1]) * 1.16]), { c: DULL, out: 0.008, fan: true });
      skinShape(b, 'canopy', LIGHT, sx, w, { out: 0.014, fan: true });
    }
    for (const z of [-2.3, -0.98]) skinPatch(b, 'aircraft', LIGHT, onSide(LIGHT, sx, [[z - 0.006, 0.78], [z + 0.006, 0.78], [z + 0.006, 1.5], [z - 0.006, 1.5]]), 1, 4, { c: DIRT, out: 0.006 });
    band(b, 'aircraft', LIGHT, sx, [[-2.3, 0.774, 0.786], [-1.6, 0.774, 0.786], [-0.98, 0.774, 0.786]], { c: DIRT, out: 0.006 });
    b.box('steel', 0.014, 0.025, 0.1, { p: [LIGHT.at(-1.12, sx * LIGHT.thAt(-1.12, 1.36), 0.008)[0], 1.36, -1.12] });
    // the stripe: from the cowling down the side to the tail, a thin one over it
    const line = [];
    for (const z of [-3.45, -3.0, -2.6, -2.0, -1.2, -0.4, 0.5, 1.2, 2.0, 2.8, 3.4, 3.9]) {
      if (bare && z < -2.6) continue;
      const k = smooth(0.3, 3.9, z);
      line.push([z, 1.2 + 0.14 * k - 0.07 + 0.04 * k, 1.2 + 0.14 * k + 0.07 - 0.04 * k]);
    }
    band(b, 'aircraft', LIGHT, sx, line, { c: stripe, out: 0.008 });
    band(b, 'aircraft', LIGHT, sx, line.map(([z, , y1]) => [z, y1 + 0.022, y1 + 0.04]), { c: stripe, out: 0.008 });
  }

  // ---- the wing: one piece over the cabin, then each side out to its tip
  const wo = { c: WHITE, crease: 55 };
  panel(b, 'aircraft', LWINGS, [-0.6, 0.6], 0, 1, wo);
  for (const sx of [-1, 1]) {
    const bent = v === 1 && sx > 0;
    const s = (...xs) => xs.map((x) => sx * x);
    const flap = { u: LW.HINGE, d: v === 0 ? 0.5 : 0.04 }, ail = { u: LW.HINGE, d: sx * (v === 0 ? 0.16 : -0.1) };
    panel(b, 'aircraft', LWINGS, s(0.6, LW.KINK), 0, LW.BOX, wo);
    panel(b, 'aircraft', LWINGS, s(0.62, LW.KINK - 0.02), LW.HINGE, 1, wo, flap);
    if (!bent) {
      panel(b, 'aircraft', LWINGS, s(LW.KINK, 5.15), 0, LW.BOX, wo);
      panel(b, 'aircraft', LWINGS, s(LW.KINK + 0.02, 5.13), LW.HINGE, 1, wo, ail);
      panel(b, 'aircraft', LWINGS, s(5.15, LW.TIP, 5.45, 5.48), 0, 1, wo);
      for (const side of [-1, 1]) surfPatch(b, 'aircraft', LWINGS, s(5.0, 5.3), [0.02, 0.98], side, { c: stripe, nu: 6, out: 0.004 });
    } else {
      // (the same, in more pieces, so that it folds where it was hit)
      const out = { ...wo, warp: crumple };
      panel(b, 'aircraft', LWINGS, s(LW.KINK, LW.BEND), 0, LW.BOX, wo);
      panel(b, 'aircraft', LWINGS, s(LW.BEND, 4.35, 4.5, 4.8, 5.15), 0, LW.BOX, out);
      panel(b, 'aircraft', LWINGS, s(LW.KINK + 0.02, 4.1), LW.HINGE, 1, wo, ail);
      panel(b, 'aircraft', LWINGS, s(4.24, 4.5, 4.8, 5.13), LW.HINGE, 1, out, { u: LW.HINGE, d: 0.5 });
      panel(b, 'aircraft', LWINGS, s(5.15, LW.TIP, 5.45, 5.48), 0, 1, out);
    }
    // skin joints, and the strut from the cabin's sill up to the wing
    for (const x of [1.3, LW.KINK, 3.9]) surfPatch(b, 'aircraft', LWINGS, s(x - 0.006, x + 0.006), [0.05, 0.68], 1, { c: DIRT, nu: 6, out: 0.003 });
    b.beam('aircraft', [sx * 0.55, 0.72, -1.02], LWINGS.pt(sx * 2.72, 0.42, -1, -0.02), 0.035, 0.11, { side: [0, 0, 1], c: WHITE });
    const tip = lightWingAt(sx * 5.47);
    if (!bent) b.sphere(sx < 0 ? 'emissive_red' : 'glass', 0.03, 6, 5, { p: [sx * 5.48, tip.le[1], tip.le[2] + tip.c * 0.3] });
  }

  // ---- the tail: the fin and its fillet, the rudder, the tailplane and its elevators
  panel(b, 'aircraft', LFINS, [1.38, 2.72, 2.75, 2.77], 0, 0.6, wo);
  panel(b, 'aircraft', LFINS, [1.47, 2.7], 0.62, 1, wo, { u: 0.62, d: v ? -0.2 : 0.25 });
  for (const sx of [-1, 1]) {
    surfPatch(b, 'aircraft', LFINS, [2.42, 2.7], [0.03, 0.58], sx, { c: stripe, nu: 4, out: 0.004 });
    label(b, 'stencil', 'numbers', 0.4, 0.15, [sx * 0.058, 1.86, 3.5], sx < 0 ? 'x-' : 'x+');
    panel(b, 'aircraft', LTAILS, [0.05, 1.72, 1.75, 1.77].map((x) => sx * x), 0, 0.56, wo);
    panel(b, 'aircraft', LTAILS, [sx * 0.12, sx * 1.7], 0.58, 1, wo, { u: 0.58, d: v ? -0.22 : 0.3 });
  }
  shell(b, 'aircraft', [[1.45, 1.5, 1.57, 0.012], [2.2, 1.44, 1.64, 0.025], [2.95, 1.4, 1.76, 0.035]].map(([z, yb, yt, w]) => [[-w, yb, z], [w, yb, z], [w * 0.35, yt, z], [-w * 0.35, yt, z]]), { c: WHITE, crease: 30 });
  b.sphere('glass', 0.03, 6, 5, { p: [0, 1.35, 4.08] });

  // ---- the propeller: two blades in a spinner. Nose down, the one underneath is bent back along the ground
  b.group({ p: [0, LP.HUB_Y, LP.HUB_Z] }, () => {
    turn(b, 'aircraft', [[0.001, -0.3], [0.045, -0.275], [0.095, -0.17], [0.128, -0.04], [0.135, 0.04], [0.135, 0.06], [0.001, 0.06]], 10, { axis: 'z', c: stripe, crease: 40 });
    b.group({ p: [0, 0, -0.02], r: [0, 0, v ? 0.5 : 0.12] }, () => blade(b, LP.PROP_R, null, 6));
    b.group({ p: [0, 0, -0.02], r: [0, 0, PI + (v ? 0.5 : 0.12)] }, () => blade(b, LP.PROP_R, v === 0 ? { r0: 0.4, a: 0.92 } : null, 6));
  });

  // ---- the gear: the main wheels on their sprung leg, in spats on the one and bare on the other
  for (const sx of [-1, 1]) {
    const z = LP.AXLE_Z;
    b.beam('aircraft', [sx * 0.42, 0.68, z], [sx * 0.98, 0.37, z], 0.032, 0.15, { side: [0, 0, 1], c: WHITE });
    b.beam('aircraft', [sx * 0.97, 0.375, z], [sx * 1.2, LP.WHEEL_R + 0.03, z], 0.03, 0.13, { side: [0, 0, 1], c: WHITE });
    b.cylBetween('steel', [sx * 1.14, LP.WHEEL_R, z], [sx * 1.34, LP.WHEEL_R, z], 0.02, 0.02, 6);
    b.box('rubber', 0.12, 0.02, 0.2, { p: [sx * 0.7, 0.55, z], r: [0, 0, -sx * 0.5] }); // the step
    b.group({ p: [sx * 1.27, LP.WHEEL_R, z] }, () => acWheel(b, LP.WHEEL_R, 0.15, sink, 10));
    if (v === 0) {
      const spat = makeBody([{ z: z - 0.42, yb: 0.27, yt: 0.31, hw: 0.02, n: 2 }, { z: z - 0.36, yb: 0.15, yt: 0.41, hw: 0.085, n: 2.2 }, { z: z - 0.16, yb: 0.09, yt: 0.49, hw: 0.115, n: 2.4 }, { z: z + 0.08, yb: 0.09, yt: 0.48, hw: 0.115, n: 2.4 }, { z: z + 0.36, yb: 0.17, yt: 0.38, hw: 0.07, n: 2.2 }, { z: z + 0.56, yb: 0.25, yt: 0.31, hw: 0.015, n: 2 }], sx * 1.27);
      shell(b, 'aircraft', spat.rings(0, 5, 10), { c: WHITE });
      for (const s2 of [-1, 1]) band(b, 'aircraft', spat, s2, [[z - 0.34, 0.27, 0.31], [z - 0.1, 0.26, 0.32], [z + 0.3, 0.27, 0.31]], { c: stripe, out: 0.005 });
    }
  }
  const nz = LP.NOSE_Z;
  if (v === 0) {
    // the nose leg, folded back under the belly, its wheel on its side on the ground
    b.cylBetween('steel', [0, 0.8, -2.58], [0.03, 0.46, -2.2], 0.03, 0.03, 8);
    b.cylBetween('chrome', [0.03, 0.46, -2.2], [0.05, 0.36, -2.06], 0.02, 0.02, 6);
    b.group({ p: [0.06, 0.31, -1.98], r: [0.19, 0, PI / 2], order: 'XZY' }, () => acWheel(b, LP.NOSE_R, 0.12, 0.012, 8));
  } else {
    b.cylBetween('steel', [0, LP.NOSE_R + 0.3, nz], [0, 0.84, nz - 0.1], 0.032, 0.032, 8);
    b.cylBetween('chrome', [0, LP.NOSE_R + 0.24, nz], [0, LP.NOSE_R + 0.32, nz], 0.022, 0.022, 6);
    b.box('steel', 0.18, 0.05, 0.07, { p: [0, LP.NOSE_R + 0.24, nz] });
    for (const sx of [-1, 1]) b.box('steel', 0.02, 0.26, 0.06, { p: [sx * 0.08, LP.NOSE_R + 0.11, nz] });
    b.cylBetween('steel', [-0.095, LP.NOSE_R, nz], [0.095, LP.NOSE_R, nz], 0.016, 0.016, 5);
    b.group({ p: [0, LP.NOSE_R, nz] }, () => acWheel(b, LP.NOSE_R, 0.12, sink, 8));
  }
  b.pop();
  if (v === 0) b.pop();
  weeds(b, r, [[0.6, -2.4], [-0.6, 0.7], [0.3, 2.7], [-2.5, -1.0], [3.3, -0.7]], 0.6);
}
// its engine with the cowling off: a flat-four on its mount in front of the firewall, the battery beside it
function lightEngine(b) {
  const y = LP.HUB_Y;
  b.box('steel', 0.24, 0.28, 0.64, { p: [0, y, -3.12] });
  b.box('steel', 0.18, 0.12, 0.42, { p: [0, y - 0.19, -3.1] });
  b.box('steel', 0.16, 0.14, 0.18, { p: [0, y - 0.3, -2.98] }); // the carburettor
  for (const sx of [-1, 1])
    for (let k = 0; k < 2; k++) {
      const z = -3.28 + k * 0.3 + sx * 0.02;
      b.cylBetween('steel', [sx * 0.11, y, z], [sx * 0.3, y, z], 0.09, 0.09, 8);
      b.box('steel', 0.09, 0.2, 0.19, { p: [sx * 0.335, y, z] });
      b.box('paint', 0.024, 0.14, 0.14, { p: [sx * 0.39, y, z], c: [0.5, 0.5, 0.48] });
      b.cylBetween('rust', [sx * 0.3, y - 0.1, z], [sx * 0.2, y - 0.36, -2.82], 0.018, 0.018, 5);
    }
  b.cyl('steel', 0.035, 0.035, 0.22, 8, { p: [0, y, -3.53], r: [PI / 2, 0, 0] });
  b.cyl('steel', 0.15, 0.15, 0.02, 12, { p: [0, y, -3.47], r: [PI / 2, 0, 0] });
  b.box('steel', 0.26, 0.26, 0.1, { p: [0, y, -2.76] });
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) b.cylBetween('steel', [sx * 0.36, y + sy * 0.26, -2.6], [sx * 0.12, y + sy * 0.11, -2.84], 0.013, 0.013, 5);
  b.box('plastic', 0.18, 0.17, 0.12, { p: [-0.3, y + 0.12, -2.68] });
}
