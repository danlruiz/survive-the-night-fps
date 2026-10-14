// The aircraft of Calder Field (shared/props.js: plane_wreck, light_plane; shared/mainland.js puts them down): the
// twin the run ends in (here), and the singles that never got away (lightplane.js). Builders as in props.js: (b, r, v)
// with b a MeshBuilder, r a seeded rng, v the variant; origin at ground centre of the footprint, nose to -Z, the
// pilot's left at -X. What they are built with is aircraftkit.js.
import { MeshBuilder, partsToGroup, makeRng } from '../materials.js';
import { label, weeds } from './propkit.js';
import { DULL, DIRT, lerp, clamp01, smooth, sub, norm, tint, shell, turn, makeBody, skinPatch, onTh, onSide, band, hoop, outlineSide, skinShape, roundRect, FOIL_COARSE, lifting, panel, surfPatch, blade, acWheel, drum } from './aircraftkit.js';
import { LP, LIGHT, lightWingAt, LWINGS, LTAILS, LFINS, lightPlane } from './lightplane.js';

const PI = Math.PI;

// ================================================================== the twin
// The plane at Calder Field: a light piston twin of the nineteen-sixties, eight seats, on its three wheels. 11.2 m
// from its nose to its tail cone, 15.4 m across the wings, 4.4 m to the top of its fin. A long nose with a baggage
// bay, a raked two-pane windscreen, four cabin windows a side and the airstair door behind the left wing; a low
// wing of 6 degrees dihedral, the same chord out to the engines and tapered beyond them; a flat-six in a nacelle
// faired into each wing, the main wheels' legs coming down out of the nacelles behind them; a swept fin with a
// dorsal fillet. Bare metal gone dull, a faded blue cheat line, black de-icing boots.
const T = {
  EX: 2.4, // each engine's thrust line: this far out,
  EY: 1.62, // this high,
  HUB_Z: -3.85, // and its propeller's hub here
  PROP_R: 1.15,
  GEAR_Z: -1.0, // the main wheels' axles (behind the centre of gravity, a quarter of the chord back)
  WHEEL_R: 0.29,
  NOSE_Z: -4.5,
  NOSE_R: 0.22,
  FIRE: 5, // the nacelle's station at the firewall: the cowling is what is ahead of it
};
const SKIN = [0.6, 0.61, 0.6], BLUE = [0.2, 0.3, 0.46], SOOT = [0.17, 0.16, 0.15], BLACK = [0.07, 0.07, 0.075];
// The fuselage: a pointed nose that droops below the centre line, the windscreen's rake from -3.9 to -3.2, a cabin
// 1.5 m wide and 1.66 high with nearly flat sides, a tail cone swept up to the tail light.
const FUS = makeBody([
  { z: -5.75, yb: 1.5, yt: 1.56, hw: 0.03, n: 2 },
  { z: -5.68, yb: 1.4, yt: 1.66, hw: 0.14, n: 2 },
  { z: -5.5, yb: 1.29, yt: 1.78, hw: 0.29, n: 2 },
  { z: -5.2, yb: 1.18, yt: 1.9, hw: 0.44, n: 2.1 },
  { z: -4.8, yb: 1.1, yt: 2.0, hw: 0.56, n: 2.2 },
  { z: -4.3, yb: 1.04, yt: 2.09, hw: 0.66, n: 2.3 },
  { z: -3.9, yb: 1.01, yt: 2.16, hw: 0.71, n: 2.4, wl: 0.48 },
  { z: -3.67, yb: 1.0, yt: 2.31, hw: 0.73, n: 2.5, wl: 0.46 },
  { z: -3.43, yb: 1.0, yt: 2.47, hw: 0.745, n: 2.6, wl: 0.44 },
  { z: -3.2, yb: 1.0, yt: 2.62, hw: 0.75, n: 2.7, wl: 0.42 },
  { z: -2.7, yb: 1.0, yt: 2.66, hw: 0.75, n: 2.8, wl: 0.42 },
  { z: -0.8, yb: 1.0, yt: 2.66, hw: 0.75, n: 2.8, wl: 0.42 },
  { z: 1.0, yb: 1.0, yt: 2.66, hw: 0.75, n: 2.8, wl: 0.42 },
  { z: 2.0, yb: 1.06, yt: 2.63, hw: 0.7, n: 2.6, wl: 0.45 },
  { z: 3.0, yb: 1.22, yt: 2.56, hw: 0.58, n: 2.4 },
  { z: 4.0, yb: 1.48, yt: 2.47, hw: 0.42, n: 2.2 },
  { z: 4.8, yb: 1.75, yt: 2.38, hw: 0.26, n: 2 },
  { z: 5.25, yb: 1.93, yt: 2.33, hw: 0.14, n: 2 },
  { z: 5.42, yb: 2.05, yt: 2.25, hw: 0.05, n: 2 },
]);
// The wing: 2.3 m of chord from the root to WING.KINK, just outboard of the engines, and from there tapered to
// half that at the tip, the leading edge swept back a little and the trailing edge forward; 16 % thick at the root,
// 12 at the tip; the tip rounded off over its last 15 cm.
const WING = { Y: 1.12, DIHEDRAL: 0.105, KINK: 2.9, TIP: 7.55, ROUND: 0.15, C0: 2.3, C1: 1.15, LE0: -1.9, LE1: -1.55, T0: 0.16, T1: 0.12, BOX: 0.7, HINGE: 0.72 };
const wingAt = (x) => {
  const a = Math.abs(x), f = clamp01((a - WING.KINK) / (WING.TIP - WING.KINK)), over = clamp01((a - WING.TIP) / WING.ROUND);
  const k = Math.sqrt(1 - 0.8 * over * over);
  const c = lerp(WING.C0, WING.C1, f);
  return { le: [x, WING.Y + WING.DIHEDRAL * a, lerp(WING.LE0, WING.LE1, f) + c * (1 - k) * 0.4], c: c * k, t: lerp(WING.T0, WING.T1, a / WING.TIP) * (1 - 0.75 * over * over) };
};
const WINGS = lifting(wingAt, { m: 0.02 });
// the tailplane on the tail cone, 5.4 m across, and the fin, swept 31 degrees
const TAIL = { SPAN: 2.65, ROUND: 0.07, BOX: 0.58, HINGE: 0.6 };
const tailAt = (x) => {
  const a = Math.abs(x), f = clamp01(a / TAIL.SPAN), over = clamp01((a - TAIL.SPAN) / TAIL.ROUND);
  const k = Math.sqrt(1 - 0.8 * over * over), c = 1.45 - 0.65 * f;
  return { le: [x, 2.2 + 0.09 * a, 3.95 + 0.55 * f + c * (1 - k) * 0.4], c: c * k, t: (0.1 - 0.01 * f) * (1 - 0.75 * over * over) };
};
const TAILS = lifting(tailAt, { us: FOIL_COARSE });
const FIN = { Y0: 2.25, Y1: 4.35, ROUND: 0.08, BOX: 0.6, HINGE: 0.62 };
const finAt = (y) => {
  const f = clamp01((y - FIN.Y0) / (FIN.Y1 - FIN.Y0)), over = clamp01((y - FIN.Y1) / FIN.ROUND);
  const k = Math.sqrt(1 - 0.8 * over * over), c = 2.05 - 1.05 * f;
  return { le: [0, y, 3.3 + 1.25 * f + c * (1 - k) * 0.4], c: c * k, t: (0.1 - 0.01 * f) * (1 - 0.75 * over * over) };
};
const FINS = lifting(finAt, { up: true, us: FOIL_COARSE });
// A nacelle: the cowling's nose bowl round the spinner, the cowling back to the firewall, then the fairing over and
// under the wing - its top line coming down onto the wing's upper surface, its belly (the wheel's well) under the
// wing - out to a point behind the trailing edge.
const NAC = [
  { z: -3.74, yb: 1.46, yt: 1.78, hw: 0.17, n: 2 },
  { z: -3.71, yb: 1.36, yt: 1.87, hw: 0.31, n: 2.5 },
  { z: -3.62, yb: 1.29, yt: 1.93, hw: 0.39, n: 3 },
  { z: -3.4, yb: 1.25, yt: 1.96, hw: 0.425, n: 3.2 },
  { z: -3.0, yb: 1.23, yt: 1.97, hw: 0.43, n: 3.2 },
  { z: -2.2, yb: 1.21, yt: 1.97, hw: 0.43, n: 3 },
  { z: -1.9, yb: 1.19, yt: 1.955, hw: 0.43, n: 3 },
  { z: -1.3, yb: 1.15, yt: 1.885, hw: 0.42, n: 2.8 },
  { z: -0.6, yb: 1.15, yt: 1.75, hw: 0.38, n: 2.5 },
  { z: -0.05, yb: 1.2, yt: 1.6, hw: 0.31, n: 2.2 },
  { z: 0.4, yb: 1.28, yt: 1.48, hw: 0.2, n: 2 },
  { z: 0.75, yb: 1.35, yt: 1.41, hw: 0.04, n: 2 },
];
const NACS = { [-1]: makeBody(NAC, -T.EX), 1: makeBody(NAC, T.EX) };
// (a cowling half as it lies on the ground: about its own middle)
const COWL_OFF = makeBody(NAC.slice(1, T.FIRE + 1).map((s) => ({ ...s, z: s.z + 3, yb: s.yb - T.EY, yt: s.yt - T.EY })));

const fusTint = (x, y, z) => {
  // (grime along the belly, soot back along the tail cone)
  const low = smooth(1.6, 1.02, y);
  const k = 1 - 0.32 * low - 0.07 * smooth(3, 5.4, z);
  return [SKIN[0] * k, SKIN[1] * k * (1 - 0.02 * low), SKIN[2] * k * (1 - 0.07 * low)];
};
const nacTint = (x, y, z) => tint(SKIN, 1 - 0.3 * smooth(1.5, 1.2, y) * smooth(-2.6, -1.6, z));

// the cabin windows' places, the door's, the bays'
const CABIN_WIN = [0, 1, 2, 3].map((k) => roundRect(-2.3 + k * 0.8, -1.74 + k * 0.8, 1.98, 2.42, 0.09));
const DOOR = { Z0: 0.88, Z1: 1.5, Y0: 1.24, Y1: 2.44 };
const PUMP = { Z0: -3.55, Z1: -3.0, TH0: 0.14, TH1: 0.62 };

// the fuselage, its glass and what is painted on it
function twinFuselage(b) {
  shell(b, 'aircraft', FUS.rings(0, FUS.S.length - 1, 26), { cfn: fusTint });
  // the anti-glare panel on the nose, then the windscreen: two panes either side of a centre post, on a frame
  skinPatch(b, 'aircraft', FUS, onTh([[-5.25, PI - 0.42], [-3.93, PI - 0.6], [-3.93, PI + 0.6], [-5.25, PI + 0.42]]), 5, 6, { c: BLACK, out: 0.008 });
  skinPatch(b, 'aircraft', FUS, onTh([[-3.92, PI - 0.78], [-3.2, PI - 0.74], [-3.2, PI + 0.74], [-3.92, PI + 0.78]]), 3, 8, { c: DULL, out: 0.012 });
  for (const sx of [-1, 1]) {
    skinPatch(b, 'canopy', FUS, onTh([[-3.87, PI - sx * 0.05], [-3.87, PI - sx * 0.7], [-3.25, PI - sx * 0.66], [-3.25, PI - sx * 0.045]]), 3, 3, { out: 0.018 });
    b.cylBetween('rubber', FUS.at(-3.9, PI - sx * 0.2, 0.02), FUS.at(-3.52, PI - sx * 0.42, 0.028), 0.007, 0.007, 4); // its wiper
    // the cockpit's side window, its front edge raked with the windscreen's post
    const side = [[-3.6, 2.06], [-2.78, 2.06], [-2.78, 2.4], [-3.2, 2.4]];
    skinShape(b, 'aircraft', FUS, sx, [[-3.69, 2.02], [-2.73, 2.02], [-2.73, 2.44], [-3.19, 2.44]], { c: DULL, out: 0.01 });
    skinShape(b, 'canopy', FUS, sx, side);
    for (const w of CABIN_WIN) {
      const mid = [(w[0][0] + w[6][0]) / 2, 2.2];
      skinShape(b, 'aircraft', FUS, sx, w.map(([z, y]) => [mid[0] + (z - mid[0]) * 1.14, mid[1] + (y - mid[1]) * 1.16]), { c: DULL, out: 0.01 });
      skinShape(b, 'canopy', FUS, sx, w);
    }
    // the cheat line: from the nose's point back along under the windows to the tail, a thin line under it
    const line = [];
    for (const z of [-5.62, -5.4, -5.1, -4.7, -4.3, -3.9, -3.4, -2.7, -1.6, -0.5, 0.6, 1.6, 2.4, 3.2, 3.9, 4.5]) {
      const yc = lerp(1.54, 1.84, smooth(-5.7, -3.6, z)) + 0.2 * smooth(2.4, 4.6, z), h = lerp(0.02, 0.075, smooth(-5.7, -4.6, z)) * (1 - 0.6 * smooth(3, 4.6, z));
      line.push([z, yc - h, yc + h, h]);
    }
    band(b, 'aircraft', FUS, sx, line, { c: BLUE, out: 0.01 });
    band(b, 'aircraft', FUS, sx, line.slice(3).map(([z, y0, , h]) => [z, y0 - 0.045 - h * 0.25, y0 - 0.03]), { c: BLUE, out: 0.01 });
  }
  // skin joints: a line round the fuselage at each frame, the baggage bay's door on the left of the nose, the
  // pump's bay under it on the right
  for (const z of [-4.3, -2.62, -0.2, 1.7, 3.0, 4.0]) hoop(b, 'aircraft', FUS, z, 0.014, { c: DIRT, out: 0.006, n: 26 });
  outlineSide(b, 'aircraft', FUS, -1, -5.0, -4.38, 1.5, 1.86, 0.014, { c: DIRT, out: 0.007 });
  b.box('steel', 0.012, 0.03, 0.09, { p: [FUS.at(-4.5, -FUS.thAt(-4.5, 1.56), 0.006)[0], 1.56, -4.5] });
  for (const th of [PUMP.TH0, PUMP.TH1]) skinPatch(b, 'aircraft', FUS, onTh([[PUMP.Z0, th - 0.012], [PUMP.Z1, th - 0.012], [PUMP.Z1, th + 0.012], [PUMP.Z0, th + 0.012]]), 2, 1, { c: DIRT, out: 0.006 });
  for (const z of [PUMP.Z0, PUMP.Z1]) skinPatch(b, 'aircraft', FUS, onTh([[z - 0.007, PUMP.TH0], [z + 0.007, PUMP.TH0], [z + 0.007, PUMP.TH1], [z - 0.007, PUMP.TH1]]), 1, 3, { c: DIRT, out: 0.006 });
  // an aerial's blade on the roof, the tail light in the cone's end, the red beacon on the fin, the pitot on the nose
  b.box('aircraft', 0.012, 0.14, 0.2, { p: [0, 2.7, 0.4], r: [-0.3, 0, 0], c: DULL });
  b.sphere('glass', 0.045, 8, 6, { p: [0, 2.15, 5.43] });
  b.cyl('steel', 0.03, 0.035, 0.03, 8, { p: [0, 4.445, 5.05] });
  b.sphere('emissive_red', 0.04, 8, 6, { p: [0, 4.475, 5.05] });
  b.cylBetween('steel', [0.3, 1.42, -5.05], [0.34, 1.34, -5.1], 0.012, 0.012, 5);
  b.cylBetween('steel', [0.34, 1.34, -5.02], [0.34, 1.34, -5.3], 0.009, 0.012, 5);
}

// a wing, without what moves on it: whole at the root, behind the engine and at the tip, cut short at WING.BOX of
// its chord where the flaps and the aileron hang
function twinWing(b, sx) {
  const o = { c: SKIN, crease: 55 };
  const s = (...xs) => xs.map((x) => sx * x);
  panel(b, 'aircraft', WINGS, s(0.5, 0.92), 0, 1, o);
  panel(b, 'aircraft', WINGS, s(0.92, 1.98), 0, WING.BOX, o);
  panel(b, 'aircraft', WINGS, s(1.98, 2.82), 0, 1, o);
  panel(b, 'aircraft', WINGS, s(2.82, WING.KINK, 7.25), 0, WING.BOX, o);
  panel(b, 'aircraft', WINGS, s(7.25, WING.TIP, 7.62, 7.67, 7.7), 0, 1, o);
  // the de-icing boot along the outer wing's leading edge, the landing light let into it
  for (const side of [-1, 1]) {
    surfPatch(b, 'rubber', WINGS, s(2.95, 7.2), [0, 0.055], side, { le: true, nu: 4 });
    surfPatch(b, 'glass', WINGS, s(5.0, 5.32), [0, 0.03], side, { le: true, nu: 3, out: 0.008 });
  }
  // skin joints along the chord and the line of the spar; the fuel filler; soot under the wing behind the exhausts
  for (const x of [1.45, 3.0, 4.3, 5.8]) surfPatch(b, 'aircraft', WINGS, s(x - 0.007, x + 0.007), [0.07, 0.68], 1, { c: DIRT, nu: 6, out: 0.003 });
  for (const [x0, x1] of [[0.8, WING.KINK], [WING.KINK, 7.3]]) surfPatch(b, 'aircraft', WINGS, s(x0, x1), [0.296, 0.304], 1, { c: DIRT, nu: 1, out: 0.003 });
  b.cyl('steel', 0.05, 0.05, 0.008, 8, { p: WINGS.pt(sx * 3.5, 0.24, 1, 0.004) });
  for (const [x0, x1] of [[T.EX + 0.44, T.EX + 0.8], [T.EX - 0.8, T.EX - 0.44]]) surfPatch(b, 'aircraft', WINGS, s(x0, x1), [0.04, 0.69], -1, { c: SOOT, nu: 5, out: 0.003 });
  // the light on the tip
  const tip = wingAt(sx * 7.69);
  b.sphere(sx < 0 ? 'emissive_red' : 'glass', 0.035, 6, 5, { p: [sx * 7.7, tip.le[1], tip.le[2] + tip.c * 0.3] });
}
// ...and the tail's: the tailplane either side, the fin with its dorsal fillet, their boots, the registration
function twinTail(b) {
  const o = { c: SKIN, crease: 55 };
  for (const sx of [-1, 1]) {
    panel(b, 'aircraft', TAILS, [0.1, TAIL.SPAN, 2.69, 2.72].map((x) => sx * x), 0, TAIL.BOX, o);
    for (const side of [-1, 1]) surfPatch(b, 'rubber', TAILS, [sx * 0.42, sx * 2.6], [0, 0.06], side, { le: true, nu: 3 });
    label(b, 'stencil', 'numbers', 0.52, 0.2, [sx * 0.092, 3.0, 4.32], sx < 0 ? 'x-' : 'x+');
    surfPatch(b, 'rubber', FINS, [3.1, 4.3], [0, 0.06], sx, { le: true, nu: 3 });
  }
  panel(b, 'aircraft', FINS, [FIN.Y0, FIN.Y1, 4.4, 4.43], 0, FIN.BOX, o);
  const fillet = [[1.7, 2.5, 2.66, 0.012], [2.6, 2.4, 2.79, 0.03], [3.5, 2.3, 2.95, 0.045], [3.92, 2.3, 3.03, 0.05]];
  shell(b, 'aircraft', fillet.map(([z, yb, yt, w]) => [[-w, yb, z], [w, yb, z], [w * 0.35, yt, z], [-w * 0.35, yt, z]]), { c: SKIN, crease: 30 });
}
// what moves: flaps, ailerons, elevators, the rudder with its tab. down: as the wreck stands, the flaps and the
// elevators hanging, the controls wherever the wind left them; otherwise as it flies
function twinControls(b, down) {
  const o = { c: DULL, crease: 55 };
  for (const sx of [-1, 1]) {
    const flap = { u: WING.HINGE, d: down ? 0.38 : 0.1 };
    panel(b, 'aircraft', WINGS, [sx * 0.94, sx * 1.96], WING.HINGE, 1, o, flap);
    panel(b, 'aircraft', WINGS, [sx * 2.84, sx * WING.KINK, sx * 4.28], WING.HINGE, 1, o, flap);
    panel(b, 'aircraft', WINGS, [sx * 4.32, sx * 7.23], WING.HINGE, 1, o, { u: WING.HINGE, d: down ? sx * 0.14 : 0 });
    const lift = { u: TAIL.HINGE, d: down ? 0.3 : 0 };
    panel(b, 'aircraft', TAILS, [sx * 0.3, sx * 2.63], TAIL.HINGE, 1, o, lift);
    surfPatch(b, 'aircraft', TAILS, [sx * 0.45, sx * 1.3], [0.86, 0.99], 1, { c: DIRT, nu: 1, hinge: lift, out: 0.003 }); // (its trim tab)
  }
  const rudder = { u: FIN.HINGE, d: down ? 0.16 : 0 };
  panel(b, 'aircraft', FINS, [2.44, 4.33], FIN.HINGE, 1, { c: BLUE, crease: 55 }, rudder);
  for (const side of [-1, 1]) surfPatch(b, 'aircraft', FINS, [2.6, 3.3], [0.87, 0.99], side, { c: tint(BLUE, 0.7), nu: 1, hinge: rudder, out: 0.003 });
}

// a nacelle behind its firewall, with the well the wheel folds into and the exhausts' soot along it
function twinNacelle(b, sx) {
  const N = NACS[sx];
  shell(b, 'aircraft', N.rings(T.FIRE, NAC.length - 1, 20), { cfn: nacTint });
  skinPatch(b, 'dark', N, onTh([[-1.56, -0.7], [-0.46, -0.7], [-0.46, 0.7], [-1.56, 0.7]]), 3, 6, { out: 0.008 });
  for (const s2 of [-1, 1]) band(b, 'aircraft', N, s2, [[-2.18, 1.24, 1.4], [-1.7, 1.2, 1.36], [-1.1, 1.17, 1.3], [-0.5, 1.2, 1.27]], { c: SOOT, out: 0.006 });
  // the exhaust stacks, out of the bottom of the cowling either side
  for (const s2 of [-1, 1]) {
    const x = sx * T.EX + s2 * 0.3;
    b.tube('rust', [[x, 1.5, -3.36], [x, 1.42, -3.0], [x - s2 * 0.02, 1.33, -2.7], [x, 1.2, -2.42], [x + s2 * 0.01, 1.14, -2.3]], 0.034, 8, 6);
    b.cyl('dark', 0.026, 0.026, 0.006, 6, { p: [x + s2 * 0.01, 1.14, -2.298], r: [PI / 2 + 0.45, 0, 0] });
  }
}
// a cowling: the nose bowl with an air inlet either side of the spinner, the scoop under its chin, the line where
// its halves meet, the cowl flap open at the back between the exhausts
function twinCowl(b, sx) {
  const N = NACS[sx], x = sx * T.EX;
  shell(b, 'aircraft', N.rings(0, T.FIRE, 20), { c: DULL });
  for (const s2 of [-1, 1]) {
    skinPatch(b, 'dark', N, onTh([[-3.728, s2 * (PI / 2 - 0.5)], [-3.635, s2 * (PI / 2 - 0.6)], [-3.635, s2 * (PI / 2 + 0.8)], [-3.728, s2 * (PI / 2 + 0.7)]]), 2, 5, { out: 0.008 });
    band(b, 'aircraft', N, s2, [[-3.56, 1.612, 1.628], [-2.9, 1.612, 1.628], [-2.22, 1.612, 1.628]], { c: DIRT, out: 0.006 });
  }
  b.box('aircraft', 0.4, 0.012, 0.22, { p: [x, 1.168, -2.32], r: [0.4, 0, 0], c: DULL });
  hoop(b, 'aircraft', N, -2.21, 0.014, { c: DIRT, out: 0.006 });
  const scoop = makeBody([{ z: -3.52, yb: 1.13, yt: 1.27, hw: 0.12, n: 3 }, { z: -3.3, yb: 1.12, yt: 1.27, hw: 0.13, n: 3 }, { z: -2.7, yb: 1.18, yt: 1.26, hw: 0.08, n: 2.5 }, { z: -2.5, yb: 1.21, yt: 1.25, hw: 0.02, n: 2 }], x);
  shell(b, 'aircraft', scoop.rings(0, 3, 10), { c: DULL });
  b.box('dark', 0.19, 0.09, 0.01, { p: [x, 1.2, -3.523] });
}
// The left engine as it is under its cowling: a flat-six on its mount - crankcase, three cylinders a side, the sump,
// the ring gear and the shaft out to the propeller's flange - and on the accessory case behind it one magneto and
// the bright bare pad where the other goes.
function twinEngine(b, sx) {
  const x = sx * T.EX, y = T.EY;
  b.box('steel', 0.26, 0.3, 0.95, { p: [x, y, -3.05] });
  b.box('steel', 0.2, 0.12, 0.62, { p: [x, y - 0.2, -3.05] });
  for (const s2 of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const z = -3.34 + k * 0.28 + s2 * 0.022;
      b.cylBetween('steel', [x + s2 * 0.12, y, z], [x + s2 * 0.3, y, z], 0.085, 0.085, 8);
      for (let f = 0; f < 3; f++) b.cyl('steel', 0.1, 0.1, 0.012, 8, { p: [x + s2 * (0.17 + f * 0.045), y, z], r: [0, 0, PI / 2] }); // cooling fins
      b.box('steel', 0.09, 0.21, 0.2, { p: [x + s2 * 0.335, y, z] });
      b.box('paint', 0.024, 0.15, 0.15, { p: [x + s2 * 0.39, y, z], c: [0.5, 0.5, 0.48] });
      b.cylBetween('steel', [x + s2 * 0.3, y - 0.1, z], [x + s2 * 0.08, y - 0.24, z], 0.02, 0.02, 5); // its intake pipe from the sump
    }
  b.cyl('steel', 0.04, 0.04, 0.32, 8, { p: [x, y, -3.66], r: [PI / 2, 0, 0] });
  b.cyl('steel', 0.075, 0.075, 0.03, 10, { p: [x, y, -3.81], r: [PI / 2, 0, 0] });
  b.cyl('steel', 0.17, 0.17, 0.02, 14, { p: [x, y, -3.58], r: [PI / 2, 0, 0] });
  b.cyl('steel', 0.05, 0.05, 0.14, 8, { p: [x + 0.17, y + 0.14, -3.46], r: [PI / 2, 0, 0] }); // the alternator
  b.box('steel', 0.3, 0.3, 0.12, { p: [x, y, -2.52] }); // the accessory case
  b.box('steel', 0.09, 0.1, 0.13, { p: [x + 0.09, y + 0.1, -2.41] });
  b.cyl('plastic', 0.04, 0.04, 0.05, 8, { p: [x + 0.09, y + 0.1, -2.325], r: [PI / 2, 0, 0] });
  b.box('paint', 0.1, 0.11, 0.012, { p: [x - 0.09, y + 0.1, -2.454], c: [0.78, 0.22, 0.1] });
  // the mount: four tubes from the firewall's corners to the engine's feet, braced
  for (const s2 of [-1, 1])
    for (const sy of [-1, 1]) {
      b.cylBetween('steel', [x + s2 * 0.3, y + sy * 0.26, -2.2], [x + s2 * 0.13, y + sy * 0.12, -2.62], 0.014, 0.014, 5);
      b.cylBetween('steel', [x + s2 * 0.3, y + sy * 0.26, -2.2], [x + s2 * 0.13, y - sy * 0.12, -2.62], 0.011, 0.011, 4);
    }
}
function twinMagneto(b) {
  const x = -T.EX, y = T.EY;
  b.box('steel', 0.09, 0.1, 0.13, { p: [x - 0.09, y + 0.1, -2.41] });
  b.cyl('plastic', 0.04, 0.04, 0.05, 8, { p: [x - 0.09, y + 0.1, -2.325], r: [PI / 2, 0, 0] });
  b.tube('rubber', [[x - 0.09, y + 0.13, -2.34], [x - 0.2, y + 0.19, -2.5], [x - 0.24, y + 0.15, -2.9], [x - 0.3, y + 0.1, -3.3]], 0.008, 8, 4);
}
// a propeller: three blades in a spinner, its hub at the origin, its shaft along Z
function twinProp(b) {
  turn(b, 'aircraft', [[0.001, -0.4], [0.05, -0.375], [0.105, -0.27], [0.15, -0.12], [0.17, 0.03], [0.17, 0.09], [0.001, 0.09]], 14, { axis: 'z', c: DULL, crease: 40 });
  for (let k = 0; k < 3; k++) b.group({ p: [0, 0, -0.03], r: [0, 0, 0.4 + (k * PI * 2) / 3] }, () => blade(b, T.PROP_R));
}

// A main wheel's leg, what of it is fixed to the nacelle: the oleo's cylinder, its braces, the two doors of the
// well hanging open either side of it.
function twinLeg(b, sx) {
  const x = sx * T.EX, z = T.GEAR_Z, N = NACS[sx];
  b.cylBetween('steel', [x, 0.9, z], [x, 1.3, z], 0.05, 0.05, 10);
  b.cyl('steel', 0.063, 0.063, 0.05, 10, { p: [x, 0.915, z] });
  b.cylBetween('steel', [x, 1.0, z - 0.04], [x, 1.22, z - 0.52], 0.02, 0.02, 6);
  b.cylBetween('steel', [x, 1.06, z], [x - sx * 0.28, 1.25, z], 0.016, 0.016, 5);
  for (const s2 of [-1, 1]) {
    const h = N.at(-1.0, s2 * 0.82);
    b.box('aircraft', 0.012, 0.36, 1.08, { p: [h[0] + s2 * 0.028, h[1] - 0.17, -1.02], r: [0, 0, s2 * 0.16], c: SKIN });
  }
}
// ...and what rides on the oleo: the piston, the half fork, the torque links, the wheel with its brake. sink: how
// far the tyre has let the axle down.
function twinFoot(b, sx, sink) {
  const x = sx * T.EX, z = T.GEAR_Z, y = T.WHEEL_R - sink;
  b.cylBetween('chrome', [x, y + 0.36, z], [x, 0.92, z], 0.032, 0.032, 8);
  b.box('steel', 0.21, 0.07, 0.09, { p: [x + sx * 0.075, y + 0.385, z] });
  b.box('steel', 0.035, 0.42, 0.08, { p: [x + sx * 0.16, y + 0.2, z] });
  b.cylBetween('steel', [x - sx * 0.07, y, z], [x + sx * 0.185, y, z], 0.026, 0.026, 6);
  b.cyl('steel', 0.11, 0.11, 0.025, 10, { p: [x + sx * 0.12, y, z], r: [0, 0, PI / 2] });
  b.beam('steel', [x, 0.9, z + 0.06], [x, (0.9 + y + 0.4) / 2, z + 0.21], 0.05, 0.016, { side: [0, 0, 1] });
  b.beam('steel', [x, (0.9 + y + 0.4) / 2, z + 0.21], [x, y + 0.4, z + 0.06], 0.05, 0.016, { side: [0, 0, 1] });
  b.group({ p: [x, y, z] }, () => acWheel(b, T.WHEEL_R, 0.18, sink));
}
// the nose wheel's: the well under the nose with its doors open, the oleo, the fork, the taxi light on the leg
function twinNoseGear(b) {
  const z = T.NOSE_Z, y = T.NOSE_R - 0.01;
  skinPatch(b, 'dark', FUS, onTh([[-4.9, -0.42], [-4.12, -0.42], [-4.12, 0.42], [-4.9, 0.42]]), 3, 6, { out: 0.008 });
  for (const sx of [-1, 1]) {
    const h = FUS.at(z, sx * 0.44);
    b.box('aircraft', 0.01, 0.3, 0.72, { p: [h[0] + sx * 0.02, h[1] - 0.145, z - 0.02], r: [0, 0, sx * 0.14], c: SKIN });
    b.box('steel', 0.024, 0.36, 0.07, { p: [sx * 0.095, y + 0.16, z] });
  }
  b.cylBetween('steel', [0, 0.74, z], [0, 1.16, z + 0.05], 0.042, 0.042, 10);
  b.cyl('steel', 0.054, 0.054, 0.045, 10, { p: [0, 0.755, z] });
  b.cylBetween('chrome', [0, y + 0.34, z], [0, 0.76, z], 0.028, 0.028, 8);
  b.box('steel', 0.215, 0.06, 0.08, { p: [0, y + 0.34, z] });
  b.cylBetween('steel', [-0.11, y, z], [0.11, y, z], 0.02, 0.02, 6);
  b.beam('steel', [0, 0.74, z - 0.05], [0, 0.65, z - 0.17], 0.045, 0.014, { side: [0, 0, 1] });
  b.beam('steel', [0, 0.65, z - 0.17], [0, y + 0.37, z - 0.05], 0.045, 0.014, { side: [0, 0, 1] });
  b.cylBetween('steel', [0, 0.95, z + 0.02], [0, 1.1, z + 0.4], 0.016, 0.016, 5); // the drag brace
  b.cyl('steel', 0.055, 0.06, 0.05, 8, { p: [0, 0.9, z - 0.06], r: [PI / 2, 0, 0] });
  b.cyl('glass', 0.048, 0.048, 0.008, 8, { p: [0, 0.9, z - 0.088], r: [PI / 2, 0, 0] });
  b.group({ p: [0, y, z] }, () => acWheel(b, T.NOSE_R, 0.13, 0.01, 12));
}

// half a cowling lying on the ground at the origin, its length along Z: the top half on its back, or the bottom
// half as it came off
function cowlHalf(b, top) {
  const mid = top ? PI : 0, lift = top ? 0.352 : 0.412;
  const rings = COWL_OFF.S.map((s) => {
    const arc = [];
    for (let k = 0; k <= 8; k++) arc.push(COWL_OFF.pt(s.z, mid - PI / 2 + (k / 8) * PI));
    const c = [0, (s.yb + s.yt) / 2];
    return [...arc, ...arc.map((p) => [c[0] + (p[0] - c[0]) * 0.955, c[1] + (p[1] - c[1]) * 0.955, p[2]]).reverse()];
  });
  b.group({ p: [0, lift, 0], r: [0, 0, top ? PI : 0] }, () => shell(b, 'aircraft', rings, { c: DULL, caps: 'strip', crease: 40 }));
}

const PLANE_BITS = {
  // what never changes: the airframe, the right engine in its cowling, the left one bare under where its goes, the
  // nose wheel and the right main wheel
  base(b) {
    twinFuselage(b);
    twinTail(b);
    for (const sx of [-1, 1]) {
      twinWing(b, sx);
      twinNacelle(b, sx);
      twinLeg(b, sx);
    }
    twinCowl(b, 1);
    twinEngine(b, -1);
    twinFoot(b, 1, 0.012);
    twinNoseGear(b);
  },
  controlsDown: (b) => twinControls(b, true),
  controlsFly: (b) => twinControls(b, false),
  cowlL: (b) => twinCowl(b, -1),
  // ...its two halves on the concrete outboard of the engine, where they were put down
  cowlDown(b) {
    b.group({ p: [-3.0, 0, -2.95], r: [0, 0.12, 0] }, () => cowlHalf(b, true));
    b.group({ p: [-3.02, 0, -1.3], r: [0, -0.1, 0] }, () => cowlHalf(b, false));
  },
  magneto: twinMagneto,
  // the bay under the nose, open: its panel hanging by the hinge, the bracket in it empty, two hoses loose
  pumpOpen(b) {
    skinPatch(b, 'dark', FUS, onTh([[PUMP.Z0, PUMP.TH0], [PUMP.Z1, PUMP.TH0], [PUMP.Z1, PUMP.TH1], [PUMP.Z0, PUMP.TH1]]), 2, 3, { out: 0.014 });
    const zc = (PUMP.Z0 + PUMP.Z1) / 2, h = FUS.at(zc, PUMP.TH1), m = FUS.at(zc, (PUMP.TH0 + PUMP.TH1) / 2);
    b.box('aircraft', 0.012, 0.36, PUMP.Z1 - PUMP.Z0, { p: [h[0] + 0.035, h[1] - 0.175, zc], r: [0, 0, 0.18], c: SKIN });
    b.box('paint', 0.16, 0.03, 0.14, { p: [m[0], m[1] - 0.03, zc], c: [0.78, 0.22, 0.1] });
    for (const dz of [-0.14, 0.12]) b.tube('rubber', [[m[0] - 0.05, m[1] + 0.02, zc + dz], [m[0] - 0.08, m[1] - 0.1, zc + dz * 1.2], [m[0] - 0.05, m[1] - 0.2, zc + dz * 1.1]], 0.011, 6, 4);
  },
  // the radio fitted: a mast on the roof with a wire back to the fin, a blade under the belly; and not: the mast's
  // socket bare on the roof
  radio(b) {
    b.cylBetween('steel', [0, 2.64, -1.72], [0, 3.08, -1.52], 0.012, 0.02, 6);
    b.cylBetween('wire', [0, 3.07, -1.52], [0, 4.3, 4.56], 0.005, 0.005, 3);
    b.box('aircraft', 0.012, 0.2, 0.3, { p: [0.2, 0.9, 0.9], r: [0.25, 0, 0], c: DULL });
  },
  radioOut: (b) => b.box('paint', 0.07, 0.012, 0.07, { p: [0, 2.662, -1.72], c: [0.78, 0.22, 0.1] }),
  // a drum of avgas poured in, stood empty under the right wing outboard of the engine
  drum(b, r, i) {
    b.group({ p: [3.24 - (i === 1 ? 0.06 : 0), 0, -1.7 + i * 0.66], r: [0, i * 1.3, 0] }, () => drum(b, [0.16, 0.36, 0.6]));
  },
  // the cabin door, down: the opening, and the door hanging from its sill as the steps it is, on its two cables
  doorOpen(b) {
    skinPatch(b, 'dark', FUS, onSide(FUS, -1, [[DOOR.Z0, DOOR.Y0], [DOOR.Z1, DOOR.Y0], [DOOR.Z1, DOOR.Y1], [DOOR.Z0, DOOR.Y1]]), 1, 6, { out: 0.016 });
    const zc = (DOOR.Z0 + DOOR.Z1) / 2;
    const sill = [FUS.at(zc, -FUS.thAt(zc, DOOR.Y0))[0] - 0.01, DOOR.Y0, zc], foot = [sill[0] - 0.85, DOOR.Y0 - 0.85, zc];
    const d = norm(sub(foot, sill)), up = [d[1], -d[0], 0];
    b.beam('aircraft', sill, foot, DOOR.Z1 - DOOR.Z0, 0.04, { side: up, c: SKIN });
    for (const sz of [-1, 1]) {
      b.beam('aircraft', [sill[0] + up[0] * 0.06, sill[1] + up[1] * 0.06, zc + sz * 0.29], [foot[0] + up[0] * 0.06, foot[1] + up[1] * 0.06, zc + sz * 0.29], 0.02, 0.09, { side: up, c: DULL });
      b.cylBetween('wire', [foot[0] + up[0] * 0.1, foot[1] + up[1] * 0.1, zc + sz * 0.3], [-0.71, 2.2, zc + sz * 0.3], 0.006, 0.006, 4);
    }
    for (const f of [0.14, 0.38, 0.62, 0.86]) b.box('steel', 0.24, 0.025, 0.54, { p: [lerp(sill[0], foot[0], f) - 0.03, lerp(sill[1], foot[1], f) + 0.1, zc] });
  },
  doorShut(b) {
    outlineSide(b, 'aircraft', FUS, -1, DOOR.Z0, DOOR.Z1, DOOR.Y0, DOOR.Y1, 0.016, { c: DIRT, out: 0.007 });
    const w = roundRect(DOOR.Z0 + 0.13, DOOR.Z1 - 0.13, 2.02, 2.38, 0.08);
    skinShape(b, 'aircraft', FUS, -1, w.map(([z, y]) => [1.19 + (z - 1.19) * 1.16, 2.2 + (y - 2.2) * 1.16]), { c: DULL, out: 0.01 });
    skinShape(b, 'canopy', FUS, -1, w);
    b.box('steel', 0.014, 0.03, 0.11, { p: [FUS.at(1.0, -FUS.thAt(1.0, 1.82), 0.008)[0], 1.82, 1.0] });
  },
  wheelFlat: (b) => twinFoot(b, -1, 0.085),
  wheelSound: (b) => twinFoot(b, -1, 0.012),
  // somebody was working on it: chocks, a step ladder at the bare engine, a tool tray, oil on the concrete, weeds
  // through the cracks
  ground(b, r) {
    for (const [x, z, rad] of [[T.EX, T.GEAR_Z, T.WHEEL_R], [0, T.NOSE_Z, T.NOSE_R]])
      for (const s of [-1, 1]) b.hull('wood', [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [x + (k & 1 ? 0.15 : -0.15), k & 2 ? 0.11 : 0, z + s * (rad * 0.62 + ((s > 0) === !!(k & 4) ? 0.2 : k & 2 ? 0.07 : 0))]), { c: [0.74, 0.6, 0.2] });
    // the ladder: two frames hinged at the top, three treads up the front one
    for (const sz of [-1, 1]) {
      b.cylBetween('steel', [-1.52, 0, -3.0 + sz * 0.2], [-1.76, 0.95, -3.0 + sz * 0.17], 0.014, 0.014, 5);
      b.cylBetween('steel', [-2.0, 0, -3.0 + sz * 0.2], [-1.76, 0.95, -3.0 + sz * 0.17], 0.014, 0.014, 5);
    }
    for (let k = 1; k <= 3; k++) b.box('steel', 0.1, 0.02, 0.38, { p: [-1.52 - k * 0.06, k * 0.24, -3.0] });
    b.box('steel', 0.14, 0.02, 0.36, { p: [-1.76, 0.955, -3.0] });
    // the tray, a spanner and a hammer in it
    b.group({ p: [-1.72, 0, -2.2], r: [0, 0.4, 0] }, () => {
      b.box('rust', 0.5, 0.012, 0.3, { p: [0, 0.006, 0] });
      for (const s of [-1, 1]) {
        b.box('rust', 0.5, 0.08, 0.012, { p: [0, 0.04, s * 0.15] });
        b.box('rust', 0.012, 0.08, 0.3, { p: [s * 0.25, 0.04, 0] });
      }
      b.box('steel', 0.24, 0.012, 0.03, { p: [-0.05, 0.02, 0.04], r: [0, 0.3, 0] });
      b.cylBetween('wood', [-0.1, 0.03, -0.06], [0.14, 0.03, -0.08], 0.014, 0.014, 5);
      b.box('steel', 0.03, 0.03, 0.09, { p: [0.15, 0.03, -0.08] });
    });
    b.box('dark', 1.1, 0.004, 0.9, { p: [-2.5, 0.003, -2.5], r: [0, 0.3, 0] });
    weeds(b, r, [[0.6, -4.9], [-3.2, -1.6], [3.3, 0.5], [0.5, 4.9], [-0.7, 2.9]], 0.5);
  },
};
// which pieces show: sup = [propeller, magneto, pump, radio, avgas 0..3] fitted; fixed: as it flies
function planeShows(sup, fixed) {
  const s = sup || [0, 0, 0, 0, 0];
  return {
    controlsDown: !fixed,
    controlsFly: fixed,
    cowlL: fixed || s[1] > 0,
    cowlDown: !fixed && !(s[1] > 0),
    magneto: fixed || s[1] > 0,
    pumpOpen: !fixed && !(s[2] > 0),
    radio: fixed || s[3] > 0,
    radioOut: !fixed && !(s[3] > 0),
    drum0: !fixed && s[4] > 0,
    drum1: !fixed && s[4] > 1,
    drum2: !fixed && s[4] > 2,
    doorOpen: !fixed,
    doorShut: fixed,
    wheelFlat: !fixed,
    wheelSound: fixed,
    ground: !fixed,
    propL: fixed || s[0] > 0,
    propR: true,
  };
}
const planeBit = (b, r, name) => (name.startsWith('drum') ? PLANE_BITS.drum(b, r, +name.slice(4)) : PLANE_BITS[name](b, r));
// the prop: the plane with nothing fitted, in one piece
function planeWreck(b, r) {
  PLANE_BITS.base(b, r);
  const shows = planeShows(null, false);
  for (const name in shows) {
    if (!shows[name]) continue;
    if (name === 'propR') b.group({ p: [T.EX, T.EY, T.HUB_Z] }, () => twinProp(b));
    else if (name !== 'propL') planeBit(b, r, name);
  }
}

// The quest plane as the game draws it (in place of the 'plane_wreck' prop, at the same origin): group, its two
// propellers (props: [left, right], each a child with its origin on its hub and its axis along Z - spin rotation.z;
// the left one is hidden until it is fitted), setParts(supplies) to show what has been fitted of [propeller,
// magneto, pump, radio, avgas 0..3], and setFixed(true) for the aircraft whole and shut, as it flies.
const QUEST_SEED = 40219;
export function createQuestPlane(seed = 7) {
  const r = makeRng(QUEST_SEED * 31 + 5);
  const b = new MeshBuilder(QUEST_SEED);
  PLANE_BITS.base(b, r);
  const group = partsToGroup(b.build(), 'quest_plane');
  const bits = {};
  const pb = new MeshBuilder(QUEST_SEED + 1, { ao: false });
  twinProp(pb);
  const propParts = pb.build();
  for (const name in planeShows(null, false)) {
    let g;
    if (name === 'propL' || name === 'propR') {
      g = partsToGroup(propParts, 'propeller');
      g.position.set((name === 'propL' ? -1 : 1) * T.EX, T.EY, T.HUB_Z);
    } else {
      const sb = new MeshBuilder(QUEST_SEED + 2 + Object.keys(bits).length);
      planeBit(sb, r, name);
      g = partsToGroup(sb.build(), name);
    }
    group.add(g);
    bits[name] = g;
  }
  let sup = [0, 0, 0, 0, 0];
  let fixed = false;
  const show = () => {
    const shows = planeShows(sup, fixed);
    for (const name in shows) bits[name].visible = shows[name];
  };
  show();
  void seed;
  return {
    group,
    props: [bits.propL, bits.propR],
    setParts(supplies) {
      sup = Array.from(supplies || sup);
      show();
    },
    setFixed(on) {
      fixed = !!on;
      show();
    },
  };
}
// (the take-off's: the same aircraft whole)
export function createFlightPlane(seed = 7) {
  const q = createQuestPlane(seed);
  q.setFixed(true);
  return q;
}

export const AIRCRAFT_PROPS = { plane_wreck: planeWreck, light_plane: lightPlane };
// (for the scratch checks in scripts/: the tables the models are made from)
export const AIRCRAFT_DATA = { T, FUS, NAC, NACS, WING, WINGS, wingAt, TAILS, tailAt, FINS, finAt, LP, LIGHT, LWINGS, lightWingAt, LTAILS, LFINS, planeShows, PLANE_BITS };
