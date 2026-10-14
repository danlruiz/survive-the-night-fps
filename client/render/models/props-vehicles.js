// The vehicles that never left (shared/props.js): the sedan and its wrecks, the pickup, the tractor, the camper, the
// ambulance, the school bus, the dump truck, the airfield's fuel bowser and fire engine, the burnt-out cars and the
// jack-knifed lorry; and the quest car made to run again for the crossing (createDriveCar). Builders as in props.js:
// (b, r, v) with b a MeshBuilder, r a seeded rng, v the variant; origin at ground centre of the footprint, front to -Z.
// What is behind their glass is cabin.js's.
import * as THREE from 'three';
import { MeshBuilder, partsToGroup, makeRng } from '../materials.js';
import { typeHash, rr, WOODS, wheel, label, weeds, plank, mul } from './propkit.js';
import { hullShell, boxShell, profShell, leaf, seat, dash, steering, mirror, sitter, luggage, childSeat, rubbish, bloodPatch, burntSeat, deck, busRows, paneLook, LINING, CHAR, SEATS } from './cabin.js';

const PI = Math.PI;

export const VEHICLE_VARIANTS = { car: 1, car_wreck: 8, pickup_truck: 4, camper: 2, school_bus: 2, dump_truck: 2, ambulance: 1, fuel_truck: 1, car_burnt: 2, semi_truck: 2, fire_truck: 1 };
export const VEHICLE_PROPS = {};

export const CAR_COLORS = [[0.36, 0.45, 0.55], [0.5, 0.36, 0.24], [0.66, 0.6, 0.46], [0.3, 0.4, 0.32], [0.5, 0.18, 0.15], [0.55, 0.55, 0.52]];

export function sedan(b, r, o) {
  const col = o.color;
  const W = 1.8, hw = W / 2;
  const fa = -1.4, ra = 1.35, wr = 0.32;
  const sink = o.sink || 0;
  b.push([0, -sink, 0]);
  // lower body side profile (shape x = world z), extruded across the width
  const s = new THREE.Shape();
  s.moveTo(-2.25, 0.27);
  s.lineTo(fa - 0.4, 0.27);
  s.absarc(fa, 0.3, 0.4, PI, 0, true);
  // (o.slim - a car that is driven: the floor pan hangs lower between the axles, and the well in it is as deep. Legs
  // as long as a survivor's go in it: sedanCabin)
  const tubY = o.slim ? 0.22 : TUB.y;
  if (o.slim) {
    s.lineTo(TUB.z0 - 0.05, 0.27);
    s.lineTo(TUB.z0 - 0.01, 0.2);
    s.lineTo(TUB.z1 + 0.01, 0.2);
    s.lineTo(TUB.z1 + 0.04, 0.27);
  }
  s.lineTo(ra - 0.4, 0.27);
  s.absarc(ra, 0.3, 0.4, PI, 0, true);
  s.lineTo(2.25, 0.27);
  s.lineTo(2.3, 0.42);
  s.lineTo(2.3, 0.8);
  s.lineTo(2.22, 0.9);
  // (the boot: a well under its lid, as deep as the back wheels' arches let it be)
  s.lineTo(BOOT.z1, 0.9);
  s.lineTo(BOOT.z1, BOOT.y);
  s.lineTo(BOOT.z0, BOOT.y);
  s.lineTo(BOOT.z0, 0.92);
  s.lineTo(1.25, 0.92);
  // (the cabin: a well down to the floor between the scuttle and the back seat, the doors closing its two sides)
  s.lineTo(TUB.z1, 0.92);
  s.lineTo(TUB.z1, tubY);
  s.lineTo(TUB.z0, tubY);
  s.lineTo(TUB.z0, 0.92);
  s.lineTo(-0.88, 0.92);
  if (o.hoodOpen) {
    s.lineTo(-0.88, 0.73);
    s.lineTo(-2.14, 0.73);
    s.lineTo(-2.14, 0.86);
  } else s.lineTo(-2.14, 0.88);
  s.lineTo(-2.27, 0.84);
  s.lineTo(-2.31, 0.7);
  s.lineTo(-2.31, 0.4);
  s.lineTo(-2.25, 0.27);
  b.extrude('carpaint', s, W, { r: [0, -PI / 2, 0], p: [hw, 0, 0], c: col });
  // the doors, front and back each side (o.doorsOff: [[side, 0 front | 1 back]]: standing open, built by the caller)
  for (const sx of [-1, 1])
    for (const [k, z0, z1] of [[0, TUB.z0, 0.46], [1, 0.46, TUB.z1]]) {
      if ((o.doorsOff || []).some((d) => d[0] === sx && d[1] === k)) continue;
      b.box('carpaint', TUB.door, 0.92 - TUB.y, z1 - z0, { p: [sx * (hw - TUB.door / 2), (0.92 + TUB.y) / 2, (z0 + z1) / 2], c: col });
    }
  // the boot's two sides, its lid (a part of its own: the wreck system finds it and hinges it at its front edge -
  // forced with a blade or a bat, client/render/wrecks.js `pry`; o.bootOpen: the caller builds it standing up), and
  // what is in it: carpet, the spare wheel lying flat, a jack, what nobody wanted
  for (const sx of [-1, 1]) b.box('carpaint', 0.1, 0.92 - BOOT.y, BOOT.z1 - BOOT.z0, { p: [sx * (hw - 0.05), (0.92 + BOOT.y) / 2, (BOOT.z0 + BOOT.z1) / 2], c: col });
  if (!o.bootOpen) b.box('carpaint', W - 0.16, 0.03, BOOT.z1 - BOOT.z0 + 0.06, { p: [0, 0.932, (BOOT.z0 + BOOT.z1) / 2 + 0.01], c: col });
  {
    const zc = (BOOT.z0 + BOOT.z1) / 2, lw = W - 0.21, carpet = o.burnt ? CHAR : [0.14, 0.14, 0.15];
    deck(b, 0, BOOT.y + 0.012, zc, lw, BOOT.z1 - BOOT.z0 - 0.01, carpet);
    for (const z of [BOOT.z0 + 0.006, BOOT.z1 - 0.006]) b.box('cabin_fine', lw, 0.92 - BOOT.y - 0.03, 0.01, { p: [0, (0.9 + BOOT.y) / 2, z], c: carpet });
    b.cyl('cabin_fine', 0.27, 0.27, 0.1, 10, { p: [-0.38, BOOT.y + 0.064, zc + 0.06], c: o.burnt ? [0.16, 0.1, 0.07] : [0.07, 0.07, 0.07] });
    b.cyl('cabin_fine', 0.15, 0.15, 0.104, 8, { p: [-0.38, BOOT.y + 0.066, zc + 0.06], c: [0.26, 0.17, 0.12] });
    if (!o.burnt) {
      b.box('cabin_fine', 0.3, 0.07, 0.1, { p: [0.3, BOOT.y + 0.05, zc - 0.2], r: [0, 0.3, 0], c: [0.4, 0.14, 0.1] }); // the jack
      b.box('cabin_fine', 0.04, 0.03, 0.4, { p: [0.36, BOOT.y + 0.03, zc + 0.16], r: [0, -0.5, 0], c: [0.2, 0.2, 0.2] });
      b.box('cabin_fine', 0.34, 0.012, 0.26, { p: [0.5, BOOT.y + 0.02, zc + 0.22], r: [0, 0.8, 0], c: [0.44, 0.4, 0.3] }); // a rag
      b.box('cabin_fine', 0.3, 0.13, 0.22, { p: [0.12, BOOT.y + 0.08, zc + 0.24], r: [0, -0.2, 0], c: [0.42, 0.34, 0.2] }); // an empty box
    }
  }
  // wheel wells (dark chassis block filling the arch tunnel)
  for (const z of [fa, ra]) b.box('dark', W - 0.03, 0.44, 0.82, { p: [0, 0.49, z] });
  if (o.hoodOpen) {
    // fenders + engine bay
    for (const sx of [-1, 1]) b.box('carpaint', 0.12, 0.16, 1.26, { p: [sx * (hw - 0.06), 0.8, -1.51], c: col });
    b.box('dark', W - 0.26, 0.02, 1.24, { p: [0, 0.74, -1.51] });
    b.box('rust', 0.62, 0.3, 0.6, { p: [0.05, 0.86, -1.5] });
    b.box('metal', 0.5, 0.08, 0.5, { p: [0.05, 1.0, -1.5] });
    b.cyl('chrome', 0.2, 0.2, 0.08, 10, { p: [0.05, 1.08, -1.5] });
    b.box('metal', 1.4, 0.3, 0.06, { p: [0, 0.8, -2.08] });
    b.box('rust', 0.3, 0.04, 0.22, { p: [-0.55, 0.76, -1.2] }); // empty battery tray
    b.tube('rubber', [[0.4, 0.95, -1.3], [0.55, 0.9, -1.7], [0.45, 0.85, -2.0]], 0.025, 6, 4);
    b.tube('rubber', [[-0.3, 0.95, -1.6], [-0.45, 0.8, -1.9], [-0.35, 0.8, -2.04]], 0.03, 6, 4);
    // hood hinged at the cowl, propped open
    const ang = 1.05;
    b.group({ p: [0, 0.9, -0.9], r: [ang, 0, 0] }, () => {
      b.box('carpaint', W - 0.12, 0.045, 1.26, { p: [0, 0, -0.63], c: col });
    });
    b.cylBetween('steel', [0.6, 0.66, -2.0], [0.6, 0.9 + Math.sin(ang) * 1.05, -0.9 - Math.cos(ang) * 1.05], 0.008, 0.008, 4);
  } else {
    b.box('carpaint', W - 0.1, 0.04, 1.26, { p: [0, 0.9, -1.52], c: col });
  }
  // greenhouse (dark interior hull) + glass panes + pillars + roof
  const gb = 0.92, gt = 1.42;
  const B = { zf: -0.86, zr: 1.24, x: hw - 0.07 }, T = { zf: -0.12, zr: 0.94, x: hw - 0.2 };
  const C = [];
  for (let k = 0; k < 8; k++) {
    const X = k & 1 ? 1 : -1, top = k & 2, Z = k & 4;
    const q = top ? T : B;
    C.push([X * q.x, top ? gt : gb, Z ? q.zr : q.zf]);
  }
  // (a shell: the pillars and the rails are what is left of its faces round the openings; open underneath into the
  // well, and its roof is the lid laid on it below)
  const lerp3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  const out = (p, n, d = 0.006) => [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
  const glass = o.glass || ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'];
  const dirt = o.dirt ?? 0.45;
  // (a pane: 'ok', 'gone', 'shard' (a tooth of it left in a corner), 'blood' (smeared from inside), or its own look)
  const gl = (k) => (glass[k] === 'ok' ? paneLook(dirt, k) : glass[k] === 'blood' ? [Math.min(1, dirt + 0.2), 0.2, 0.9] : glass[k]);
  // (o.slim: a car that is driven - game/vehicles.js - has thin pillars: whoever sits in it looks out past them)
  const sl = !!o.slim;
  const sideHoles = (k0) => [[sl ? 0.03 : 0.075, sl ? 0.485 : 0.47, sl ? 0.05 : 0.08, sl ? 0.96 : 0.93, gl(k0)], [sl ? 0.515 : 0.53, sl ? 0.975 : 0.965, sl ? 0.05 : 0.08, sl ? 0.96 : 0.93, gl(k0 + 1)]];
  hullShell(b, 'carpaint', C, {
    c: col, t: 0.03, lining: o.burnt ? CHAR : LINING, skip: ['yn'], bare: ['yp'],
    holes: { zn: [sl ? [0.018, 0.982, 0.04, 0.965, gl(0)] : [0.045, 0.955, 0.08, 0.93, gl(0)]], zp: [[0.05, 0.95, 0.09, 0.92, gl(1)]], xp: sideHoles(2), xn: sideHoles(4) },
  });
  sedanCabin(b, o, hw);
  for (const sx of [-1, 1]) {
    const bf = sx > 0 ? C[1] : C[0], br = sx > 0 ? C[5] : C[4], tf = sx > 0 ? C[3] : C[2], tr = sx > 0 ? C[7] : C[6];
    const n = [sx, 0.22, 0];
    const bottomAt = (t) => lerp3(bf, br, t), topAt = (t) => lerp3(tf, tr, t);
    // pillars
    b.beam('carpaint', out(bf, n, 0.01), out(tf, n, 0.01), sl ? 0.04 : 0.07, sl ? 0.035 : 0.05, { c: col, side: [0, 0, 1] });
    b.beam('carpaint', out(br, n, 0.01), out(tr, n, 0.01), 0.1, 0.05, { c: col, side: [0, 0, 1] });
    b.beam('carpaint', out(bottomAt(0.5), n, 0.01), out(topAt(0.5), n, 0.01), sl ? 0.05 : 0.07, 0.05, { c: col, side: [0, 0, 1] });
    // door seams + handles on lower body
    for (const z of [-0.86, 0.46, 1.22]) b.box('dark', 0.01, 0.56, 0.012, { p: [sx * (hw + 0.002), 0.6, z] });
    for (const z of [0.3, 1.05]) b.box('chrome', 0.03, 0.03, 0.12, { p: [sx * (hw + 0.012), 0.8, z] });
    b.box('dark', 0.012, 0.04, 4.3, { p: [sx * (hw + 0.002), 0.45, 0] }); // rub strip
  }
  b.box('carpaint', T.x * 2 + 0.06, 0.05, T.zr - T.zf + 0.08, { p: [0, gt + 0.02, (T.zf + T.zr) / 2], c: col });
  // mirror + antenna
  b.box('chrome', 0.1, 0.09, 0.05, { p: [-(hw + 0.02), 1.0, -0.72] });
  if (!o.noMirrorR) b.box('chrome', 0.1, 0.09, 0.05, { p: [hw + 0.02, 1.0, -0.72] });
  b.cylBetween('steel', [0.75, 0.9, 1.9], [0.8, 1.55, 2.0], 0.004, 0.006, 3);
  // bumpers, grille, lights, plates
  b.box('chrome', W + 0.04, 0.15, 0.12, { p: [0, 0.4, -2.35] });
  b.box('chrome', W + 0.04, 0.15, 0.12, { p: [0, 0.4, 2.35] });
  b.box('dark', 1.0, 0.2, 0.02, { p: [0, 0.64, -2.315] });
  for (let k = 0; k < 4; k++) b.box('chrome', 1.0, 0.018, 0.02, { p: [0, 0.56 + k * 0.05, -2.322] });
  for (const sx of [-1, 1]) {
    for (const k of [0, 1]) {
      const smashed = o.smashed && sx < 0 && k === 0;
      b.box('chrome', 0.2, 0.15, 0.03, { p: [sx * (0.62 + k * 0.2), 0.66, -2.31] });
      b.box(smashed ? 'dark' : 'glass', 0.16, 0.11, 0.02, { p: [sx * (0.62 + k * 0.2), 0.66, -2.327] });
    }
    b.box('taillight', 0.36, 0.14, 0.03, { p: [sx * 0.66, 0.68, 2.31] });
  }
  if (!o.noPlates) {
    label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.58, 2.316], 'z+');
    label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.4, -2.415], 'z-');
  }
  b.pop();
  // wheels
  if (o.noWheels) return; // (createDriveCar: they are built apart, to turn)
  const wheels = o.wheels || { fl: 'ok', fr: 'ok', rl: 'ok', rr: 'ok' };
  const wpos = { fl: [-0.8, fa], fr: [0.8, fa], rl: [-0.8, ra], rr: [0.8, ra] };
  for (const [k, [x, z]] of Object.entries(wpos)) {
    const st = wheels[k];
    if (st === 'gone') {
      b.cyl('rust', 0.14, 0.14, 0.12, 8, { p: [x * 0.9, 0.33 - sink, z], r: [0, 0, PI / 2] });
      continue;
    }
    if (st === 'rim') {
      b.group({ p: [x, 0.2, z] }, () => b.cyl('rust', 0.21, 0.21, 0.16, 10, { r: [0, 0, PI / 2], s: [1, 1, 1] }));
      continue;
    }
    b.group({ p: [x, wr, z] }, () => wheel(b, wr, 0.2, { flat: st === 'flat' ? 0.3 : 0 }));
  }
}

// The sedan's cabin: the well in its body (see `sedan`), its floor at TUB.y, from the scuttle at z0 to the back
// seat's back at z1; door: how thick its doors are.
const TUB = { z0: -0.84, z1: 0.9, y: 0.33, door: 0.1 };
// ...and its boot: a well from z0 to z1 behind the back window, its floor at y (just over the arches of the back wheels)
const BOOT = { z0: 1.36, z1: 2.14, y: 0.72 };
// What is in it. o.cabin: what was left there - 0 nothing but rubbish, 1 the driver still at the wheel, 2 cases and a
// child's seat in the back, 3 somebody dead in the passenger seat, 4 stripped (the back seat gone, a door card off);
// o.burnt: a fire's leavings. o.seats: the upholstery (an index of cabin.js SEATS).
function sedanCabin(b, o, hw) {
  // (o.slim: a car that is driven - render/models/vehicles.js. Its well is deeper and its dash shallower: a survivor's
  // legs are as long as anybody's, and they go under it; its back cushion a little lower, under the roof's fall)
  const sl = !!o.slim;
  const fy = sl ? 0.24 : TUB.y + 0.02, iw = (hw - TUB.door) * 2 - 0.01, len = TUB.z1 - TUB.z0, zc = (TUB.z0 + TUB.z1) / 2;
  const burnt = !!o.burnt, what = o.cabin || 0;
  const trim = burnt ? CHAR : [0.15, 0.14, 0.13];
  const sc = burnt ? CHAR : SEATS[(o.seats ?? 0) % SEATS.length];
  // the floor, the scuttle and the back of the well; the shelf under the back window; the door cards
  deck(b, 0, fy, zc, iw, len - 0.02, burnt ? CHAR : undefined);
  b.box('cabin_fine', iw, 0.92 - fy, 0.02, { p: [0, (0.92 + fy) / 2, TUB.z0 + 0.012], c: trim });
  b.box('cabin_fine', iw, 0.92 - fy, 0.02, { p: [0, (0.92 + fy) / 2, TUB.z1 - 0.012], c: trim });
  b.box('cabin_fine', iw, 0.014, 1.24 - TUB.z1 - 0.02, { p: [0, 0.928, (TUB.z1 + 1.24) / 2 - 0.02], c: trim });
  for (const sx of [-1, 1])
    for (const [k, z0, z1] of [[0, TUB.z0, 0.46], [1, 0.46, TUB.z1]]) {
      if ((o.doorsOff || []).some((d) => d[0] === sx && d[1] === k)) continue;
      const stripped = what === 4 && sx > 0 && k === 0;
      if (!stripped) b.box('cabin_fine', 0.012, 0.92 - fy - 0.02, z1 - z0 - 0.03, { p: [sx * (iw / 2 - 0.003), (0.92 + fy) / 2, (z0 + z1) / 2], c: mul(sc, 0.8) });
      if (!stripped && !burnt && !o.slim) b.box('cabin_fine', 0.05, 0.05, (z1 - z0) * 0.5, { p: [sx * (iw / 2 - 0.03), 0.72, (z0 + z1) / 2 + 0.05], c: trim }); // the armrest (o.slim: none - an elbow is there)
    }
  // seats: where createDriveCar seats the survivors (DRIVE_CAR_SEATS)
  const fz = -0.147, rz = 0.64, fh = (sl ? 0.358 : 0.44) - fy, rh = (sl ? 0.354 : 0.46) - fy;
  if (sl) for (const sx of [-1, 1]) b.box('dark', 0.02, TUB.y + 0.03 - fy, len, { p: [sx * (iw / 2 + 0.005), (TUB.y + 0.03 + fy) / 2, zc] }); // the well's sides, down from the sills
  if (burnt) {
    for (const sx of [-1, 1]) burntSeat(b, sx * 0.38, fy, fz, { h: fh });
    burntSeat(b, 0, fy, rz, { w: 1.3, h: rh });
    b.box('cabin_fine', iw, 0.2, 0.26, { p: [0, 0.83, -0.7], c: CHAR }); // what is left of the dash
    b.cylBetween('cabin_fine', [-0.38, 0.86, -0.62], [-0.38, 1.0, -0.42], 0.02, 0.02, 4, { c: [0.2, 0.12, 0.08] });
    b.torus('cabin_fine', 0.17, 0.012, 3, 9, PI * 2, { p: [-0.38, 1.0, -0.42], r: [-(PI / 2 - 0.42), 0, 0], c: [0.2, 0.12, 0.08] });
    rubbish(b, [0, fy, 0.1], 1.2, 1.2, 4, 3);
    return;
  }
  for (const sx of [-1, 1]) seat(b, sx * 0.38, fy, fz, { h: fh, c: sc, bh: 0.58, d: 0.46 });
  if (what !== 4) seat(b, 0, fy, sl ? rz + 0.035 : rz, { w: 1.32, h: rh, c: sc, bh: 0.56, d: sl ? 0.35 : 0.42, heads: 2, rake: 0.2 });
  dash(b, 0.955, -0.85, iw, sl ? { d: 0.19, h: 0.2, wheelX: -0.38, noGlove: true } : { d: 0.3, wheelX: -0.38, gloveOpen: what === 4 || what === 0 });
  if (!o.noSteer) steering(b, [-0.38, 1.0, -0.42]); // (noSteer: a car that is driven has a wheel of its own, which turns)
  mirror(b, [0, 1.3, -0.24]);
  b.box('cabin_fine', 0.2, 0.2, 0.74, { p: [0, fy + 0.1, -0.2], c: trim }); // the tunnel between the seats, and the lever on it
  if (!sl) b.cylBetween('cabin_fine', [0, fy + 0.2, -0.34], [0.01, fy + 0.4, -0.38], 0.012, 0.018, 4, { c: [0.08, 0.08, 0.08] });
  if (what === 1) {
    sitter(b, [-0.38, 0.44, fz], { wheel: true, lean: 0.15, shirt: [0.3, 0.27, 0.2], side: -1 });
    rubbish(b, [0.38, 0.445, fz], 0.3, 0.3, 2, 1);
  } else if (what === 2) {
    luggage(b, [-0.2, 0.46, rz], 0, { r: 0.1 });
    childSeat(b, [0.4, 0.46, rz - 0.02]);
    rubbish(b, [0.3, fy, 0.2], 0.5, 0.3, 3, 2);
  } else if (what === 3) {
    // (on the side away from the open door: o.bodySide)
    const sd = o.bodySide ?? 1;
    sitter(b, [sd * 0.38, 0.44, fz], { lean: 0.8, side: sd, flesh: true, shirt: [0.36, 0.33, 0.3], legs: [0.2, 0.18, 0.15] });
    bloodPatch(b, [sd * 0.38, 0.446, fz - 0.05], 0.4, 0.36, 0.3);
    bloodPatch(b, [sd * 0.42, 0.8, fz + 0.3], 0.3, 0.3, 0, PI / 2 + 0.17);
  } else if (what === 4) {
    rubbish(b, [0, fy, 0.6], 1.2, 0.5, 6, 5);
    b.box('cabin_fine', 0.5, 0.012, 0.6, { p: [0.3, fy + 0.01, 0.6], r: [0, 0.4, 0], c: mul(sc, 0.7) }); // the door card, on the floor
  } else if (what === 0) rubbish(b, [0.1, fy, 0.25], 1.1, 0.4, 5, 0);
}

function cinderBlocks(b, x, z, h) {
  b.box('concrete', 0.4, 0.2, 0.2, { p: [x, 0.1, z], r: [0, 0.15, 0] });
  b.box('concrete', 0.4, 0.2, 0.2, { p: [x, 0.3, z - 0.02], r: [0, -0.1, 0] });
  plank(b, 'wood', 0.3, h - 0.4, 0.3, { p: [x, 0.4 + (h - 0.4) / 2, z], c: WOODS[1] });
}

VEHICLE_PROPS.car = (b, r) => {
  b.push([0, 0, 0], [0, 0, 0], [1, 1, 0.952]);
  sedan(b, r, {
    color: [0.34, 0.42, 0.52],
    hoodOpen: true,
    smashed: true,
    wheels: { fl: 'gone', fr: 'ok', rl: 'ok', rr: 'flat' },
    glass: ['ok', 'ok', 'ok', 'gone', 'gone', 'ok'],
    dirt: 0.5,
  });
  cinderBlocks(b, -0.62, -1.4, 0.3);
  b.box('rust', 0.12, 0.2, 0.3, { p: [-0.72, 0.1, 0.6] }); // jack under the sill
  b.pop();
};

// (eight of them: four bodies as there always were (v % 4: the colour, the wheels, which door stands open), and what
// is in the cabin and on its glass by the rest of v)
VEHICLE_PROPS.car_wreck = (b, r, v0) => {
  const v = v0 % 4, w = v0 >> 2;
  b.push([0, 0, 0], [0, 0, 0], [1, 1, 4.42 / 4.66]);
  const col = CAR_COLORS[(v + 1) % CAR_COLORS.length].map((c) => c * 0.85);
  const hx = v % 2 ? 0.9 : -0.9, sg = Math.sign(hx);
  // glass: screen, back window, right front, right back, left front, left back. The one over the open door is out
  const glass = [['gone', 'ok', 'gone', 'gone', 'gone', 'ok'], ['ok', 'shard', 'gone', 'ok', 'ok', 'gone'], ['shard2', 'ok', 'ok', 'gone', 'gone', 'ok'], ['gone', 'gone', 'gone', 'shard', 'ok', 'ok']][v];
  const cabin = [[0, 3], [1, 4], [2, 0], [4, 1]][v][w];
  if (cabin === 3) glass[sg > 0 ? 4 : 2] = 'blood';
  sedan(b, r, {
    color: col,
    sink: 0.12,
    smashed: true,
    noPlates: v % 2 === 1,
    noMirrorR: true,
    wheels: v % 2 ? { fl: 'rim', fr: 'flat', rl: 'rim', rr: 'rim' } : { fl: 'flat', fr: 'rim', rl: 'flat', rr: 'rim' },
    glass,
    cabin,
    bodySide: -sg,
    seats: v0 + 1,
    dirt: [0.4, 0.75, 0.2, 0.6][v] + w * 0.12,
    doorsOff: [[sg, 0]],
  });
  // an open door (driver side): the doorway is the cabin's own
  b.group({ p: [hx, 0.52, -0.84], r: [0, sg * -0.9, 0] }, () => {
    b.box('carpaint', 0.06, 0.52, 1.25, { p: [sg * 0.03, 0, 0.62], c: col });
    b.beam('carpaint', [sg * 0.03, 0.26, 0.05], [sg * 0.08, 0.72, 0.62], 0.04, 0.04, { c: col });
  });
  b.pop();
  weeds(b, r, [[0.75, -1.6], [-0.75, 1.2], [0.7, 1.9], [-0.7, -0.6], [0.2, 1.95]], 0.55);
};

// (four of them: the two there always were (v % 2), and what is in the cab by the rest of v)
VEHICLE_PROPS.pickup_truck = (b, r, v0) => {
  const v = v0 % 2, w = v0 >> 1;
  const col = v ? [0.52, 0.2, 0.16] : [0.33, 0.44, 0.42];
  const W = 1.96, hw = W / 2;
  const fa = -1.62, ra = 1.62, wr = 0.38;
  // front body (hood + fenders) profile
  const s = new THREE.Shape();
  s.moveTo(-2.62, 0.4);
  s.lineTo(fa - 0.48, 0.4);
  s.absarc(fa, 0.42, 0.48, PI, 0, true);
  s.lineTo(-0.9, 0.4);
  s.lineTo(-0.9, 1.16);
  s.lineTo(-2.55, 1.12);
  s.lineTo(-2.66, 1.0);
  s.lineTo(-2.66, 0.5);
  s.lineTo(-2.62, 0.4);
  b.extrude('carpaint', s, W, { r: [0, -PI / 2, 0], p: [hw, 0, 0], c: col });
  b.box('dark', W - 0.03, 0.5, 0.95, { p: [0, 0.62, fa] });
  // cab lower: a tub, open at the top into the greenhouse
  boxShell(b, 'carpaint', W, 0.76, 1.42, { p: [0, 0.78, -0.2], c: col, t: 0.1, skip: ['yp'], lining: [0.15, 0.14, 0.13] });
  // cab greenhouse: a shell on it - the screen, a window each side (one gone on the second truck), one in the back
  const C = [];
  for (let k = 0; k < 8; k++) {
    const X = k & 1 ? 1 : -1, top = k & 2, Z = k & 4;
    C.push([X * (top ? hw - 0.16 : hw - 0.05), top ? 1.86 : 1.16, Z ? (top ? 0.42 : 0.48) : top ? -0.5 : -0.88]);
  }
  hullShell(b, 'carpaint', C, {
    c: col, t: 0.03, skip: ['yn'], bare: ['yp'], look: (k) => paneLook(v ? 0.72 : 0.38, k + w),
    holes: { zn: [[0.04, 0.96, 0.07, 0.93]], zp: [[0.14, 0.86, 0.22, 0.86, w ? 'shard' : undefined]], xn: [[0.07, 0.93, 0.08, 0.93, v === 1 ? 'gone' : undefined]], xp: [[0.07, 0.93, 0.08, 0.93]] },
  });
  // in it: a bench, the dash and the wheel, a rack across the back window - a gun still in it, or the driver still
  // at the wheel and the rack empty
  seat(b, 0, 0.5, -0.12, { w: 1.56, h: 0.4, bh: 0.6, d: 0.5, heads: 0, c: SEATS[v ? 1 : 3], rake: 0.12 });
  dash(b, 1.2, -0.8, 1.74, { d: 0.26, h: 0.3, wheelX: -0.45 });
  steering(b, [-0.45, 1.28, -0.4], { R: 0.19 });
  mirror(b, [0, 1.72, -0.5]);
  for (const x of [-0.52, 0.52]) b.box('cabin_fine', 0.03, 0.32, 0.05, { p: [x, 1.55, 0.385], c: [0.1, 0.1, 0.1] });
  if (!w) {
    b.box('cabin_fine', 1.02, 0.03, 0.03, { p: [0.06, 1.64, 0.375], c: [0.08, 0.08, 0.09] });
    b.box('cabin_fine', 0.34, 0.085, 0.034, { p: [-0.56, 1.625, 0.375], r: [0, 0, 0.1], c: [0.3, 0.2, 0.12] });
    rubbish(b, [0.35, 0.905, -0.12], 0.6, 0.3, 4, v + 4);
  } else {
    sitter(b, [-0.45, 0.9, -0.12], { wheel: true, lean: 0.2, side: -1, shirt: [0.34, 0.2, 0.16] });
    b.cyl('cabin_fine', 0.04, 0.045, 0.24, 6, { p: [0.3, 1.02, -0.1], c: [0.2, 0.3, 0.24] }); // a flask on the bench
  }
  const n = (p, v2, d = 0.008) => [p[0] + v2[0] * d, p[1] + v2[1] * d, p[2] + v2[2] * d];
  for (const sx of [-1, 1]) {
    const q = sx > 0 ? [C[1], C[5], C[7], C[3]] : [C[0], C[4], C[6], C[2]];
    const nn = [sx, 0.15, 0];
    b.beam('carpaint', n(q[0], nn, 0.012), n(q[3], nn, 0.012), 0.08, 0.05, { c: col });
    b.beam('carpaint', n(q[1], nn, 0.012), n(q[2], nn, 0.012), 0.1, 0.05, { c: col });
    b.box('dark', 0.01, 0.66, 0.012, { p: [sx * (hw + 0.002), 0.8, -0.88] });
    b.box('dark', 0.01, 0.66, 0.012, { p: [sx * (hw + 0.002), 0.8, 0.46] });
    b.box('chrome', 0.03, 0.03, 0.12, { p: [sx * (hw + 0.012), 1.05, 0.3] });
    b.box('chrome', 0.12, 0.16, 0.04, { p: [sx * (hw + 0.06), 1.28, -0.84] });
  }
  b.box('carpaint', W - 0.26, 0.05, 0.98, { p: [0, 1.88, -0.04], c: col });
  // bed
  const bz0 = 0.52, bz1 = 2.66, bl = bz1 - bz0, bzc = (bz0 + bz1) / 2;
  b.box('rust', W - 0.1, 0.06, bl, { p: [0, 0.74, bzc] });
  for (const sx of [-1, 1]) {
    b.box('carpaint', 0.08, 0.5, bl, { p: [sx * (hw - 0.04), 0.98, bzc], c: col });
    b.box('carpaint', 0.12, 0.06, bl, { p: [sx * (hw - 0.05), 1.24, bzc], c: col });
    b.box('carpaint', 0.08, 0.36, bl, { p: [sx * (hw - 0.04), 0.55, bzc], c: col });
    b.cyl('rust', 0.5, 0.5, 0.35, 8, { theta: [-PI / 2, PI], p: [sx * (hw - 0.25), 0.74, ra], r: [0, 0, PI / 2] });
  }
  b.box('carpaint', W - 0.1, 0.52, 0.07, { p: [0, 1.0, bz1 - 0.035], c: col, r: [v ? 0.35 : 0, 0, 0] });
  b.box('carpaint', W - 0.1, 0.5, 0.07, { p: [0, 1.0, bz0 + 0.04], c: col });
  // junk in the bed
  b.group({ p: [0.3, 0.9, 1.9], r: [PI / 2 - 0.15, 0, 0.2] }, () => wheel(b, 0.34, 0.2, { rim: 'rust' }));
  plank(b, 'wood', 0.18, 0.04, 1.9, { p: [-0.5, 0.8, 1.5], r: [0.05, 0.1, 0], c: WOODS[2] });
  b.box('paint', 0.3, 0.4, 0.18, { p: [-0.55, 0.97, 2.3], c: [0.6, 0.12, 0.1] });
  // front: bumper, grille, round headlights
  b.box('chrome', W + 0.06, 0.18, 0.14, { p: [0, 0.48, -2.72] });
  b.box('chrome', W + 0.06, 0.16, 0.12, { p: [0, 0.5, 2.72] });
  b.box('dark', 1.3, 0.38, 0.02, { p: [0, 0.8, -2.665] });
  for (let k = 0; k < 5; k++) b.box('chrome', 1.3, 0.02, 0.03, { p: [0, 0.64 + k * 0.08, -2.672] });
  for (const sx of [-1, 1]) {
    b.cyl('chrome', 0.1, 0.1, 0.05, 10, { p: [sx * 0.78, 0.84, -2.66], r: [PI / 2, 0, 0] });
    b.cyl(sx < 0 && v === 1 ? 'dark' : 'glass', 0.08, 0.08, 0.02, 10, { p: [sx * 0.78, 0.84, -2.69], r: [PI / 2, 0, 0] });
    b.box('taillight', 0.08, 0.26, 0.03, { p: [sx * (hw - 0.06), 1.0, 2.7] });
  }
  label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.72, 2.705], 'z+');
  // wheels
  for (const [x, z, st] of [[-0.86, fa, 'flat'], [0.86, fa, 'ok'], [-0.86, ra, 'ok'], [0.86, ra, v ? 'flat' : 'ok']]) {
    b.group({ p: [x, wr, z] }, () => wheel(b, wr, 0.24, { flat: st === 'flat' ? 0.28 : 0 }));
  }
  weeds(b, r, [[0.8, 0.2], [-0.75, 2.2], [0.7, -2.2]], 0.5);
};

VEHICLE_PROPS.tractor = (b, r) => {
  const col = [0.46, 0.15, 0.1];
  // big rear wheels (tractor front faces -Z)
  for (const sx of [-1, 1]) {
    b.group({ p: [sx * 0.78, 0.78, 0.95] }, () => {
      const prof = [[0.5, 0.2], [0.72, 0.22], [0.78, 0.12], [0.78, -0.12], [0.72, -0.22], [0.5, -0.2]];
      b.lathe('tire', prof, 14, { r: [0, 0, PI / 2] });
      b.cyl('paint', 0.5, 0.5, 0.3, 12, { r: [0, 0, PI / 2], c: [0.55, 0.48, 0.25] });
      b.cyl('rust', 0.12, 0.12, 0.42, 6, { r: [0, 0, PI / 2] });
      // tread lugs
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * PI * 2;
        b.box('tire', 0.4, 0.06, 0.1, { p: [0, Math.cos(a) * 0.79, Math.sin(a) * 0.79], r: [a, 0, 0], s: [1, 1, 1] });
      }
    });
    // fender over rear wheel
    b.cyl('paint', 0.86, 0.86, 0.34, 10, { theta: [-PI / 2 - 0.2, PI * 0.8], open: true, p: [sx * 0.78, 0.8, 0.95], r: [0, 0, PI / 2], c: col });
    // front wheels
    b.group({ p: [sx * 0.62, 0.42, -1.25] }, () => wheel(b, 0.42, 0.2, { rim: 'rust', rimR: 0.55 }));
  }
  // chassis / engine hood (long box from front to the seat)
  b.box('rust', 0.5, 0.35, 2.6, { p: [0, 0.62, -0.5] });
  b.frustum('paint', 0.66, 1.9, 0.6, 1.84, 0.78, 1.42, { p: [0, 0, -0.75], c: col });
  b.box('metal', 0.62, 0.52, 0.06, { p: [0, 1.1, -1.72] }); // grille
  for (let k = 0; k < 6; k++) b.box('dark', 0.5, 0.025, 0.02, { p: [0, 0.9 + k * 0.08, -1.755] });
  b.cyl('glass', 0.07, 0.07, 0.04, 8, { p: [-0.2, 1.3, -1.72], r: [PI / 2, 0, 0] });
  b.cyl('dark', 0.07, 0.07, 0.04, 8, { p: [0.2, 1.3, -1.72], r: [PI / 2, 0, 0] });
  // front axle
  b.box('rust', 1.1, 0.12, 0.14, { p: [0, 0.42, -1.25] });
  // exhaust stack + air intake
  b.cyl('rust', 0.05, 0.06, 1.1, 6, { p: [0.2, 1.95, -1.2] });
  b.cyl('rust', 0.07, 0.05, 0.12, 6, { p: [0.2, 2.52, -1.2], r: [0.3, 0, 0] });
  b.cyl('paint', 0.07, 0.07, 0.4, 6, { p: [-0.18, 1.62, -1.3], c: col });
  // operator station: platform, seat, steering
  b.box('rust', 1.2, 0.08, 0.8, { p: [0, 0.82, 0.75] });
  b.box('metal', 0.2, 0.5, 0.3, { p: [0, 1.05, 0.95] });
  b.box('cloth', 0.44, 0.08, 0.4, { p: [0, 1.34, 0.98], c: [0.2, 0.18, 0.16] });
  b.box('cloth', 0.44, 0.35, 0.08, { p: [0, 1.52, 1.18], r: [-0.15, 0, 0], c: [0.2, 0.18, 0.16] });
  b.cylBetween('steel', [0, 1.3, 0.2], [0, 1.72, 0.55], 0.025, 0.025, 5);
  b.torus('dark', 0.19, 0.02, 4, 12, PI * 2, { p: [0, 1.74, 0.58], r: [PI / 2 - 0.6, 0, 0] });
  // roll bar
  for (const sx of [-1, 1]) b.box('paint', 0.08, 1.4, 0.08, { p: [sx * 0.55, 1.55, 1.4], c: [0.3, 0.3, 0.28] });
  b.box('paint', 1.18, 0.08, 0.08, { p: [0, 2.25, 1.4], c: [0.3, 0.3, 0.28] });
  // rear hitch
  b.box('rust', 0.3, 0.1, 0.4, { p: [0, 0.55, 1.65] });
  weeds(b, r, [[0.6, -1.5], [-0.3, 1.5], [-0.6, -0.2]], 0.6);
};

// (the frame round a window of the coach, and the curtain hung inside it: the opening and its pane are the wall's)
function rvWindow(b, x, z0, z1, y0, y1, side, o = {}) {
  const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2, w = z1 - z0, h = y1 - y0;
  b.box('chrome', 0.012, h + 0.08, 0.03, { p: [x + side * 0.012, yc, z0 - 0.03] });
  b.box('chrome', 0.012, h + 0.08, 0.03, { p: [x + side * 0.012, yc, z1 + 0.03] });
  b.box('chrome', 0.012, 0.03, w + 0.08, { p: [x + side * 0.012, y1 + 0.03, zc] });
  b.box('chrome', 0.012, 0.03, w + 0.08, { p: [x + side * 0.012, y0 - 0.03, zc] });
  if (o.curtain) {
    const cw = w * o.curtain;
    const cz = o.broken ? zc - w / 2 + cw / 2 : zc + w / 2 - cw / 2;
    b.plane('cloth', cw, h * 0.98, { p: [x - side * (o.broken ? 0.02 : 0.06), yc - (o.broken ? 0.05 : 0), cz], r: [o.broken ? side * 0.15 : 0, side * PI / 2, 0], c: o.cc });
  }
}

VEHICLE_PROPS.camper = (b, r, v) => {
  const body = v ? [0.8, 0.8, 0.76] : [0.8, 0.72, 0.56];
  const s1 = v ? [0.2, 0.3, 0.46] : [0.42, 0.25, 0.13];
  const s2 = v ? [0.36, 0.5, 0.62] : [0.66, 0.4, 0.14];
  const cab = v ? [0.72, 0.72, 0.68] : [0.74, 0.66, 0.5];
  const curt = v ? [0.4, 0.44, 0.5] : [0.62, 0.44, 0.22];
  const W = 2.34, hw = W / 2, CW = 2.04, chw = CW / 2;
  const fa = -2.45, ra = 1.75, wr = 0.4, sink = 0.06;
  b.push([0, -sink, 0]);
  // chassis
  for (const sx of [-1, 1]) b.box('dark', 0.12, 0.2, 5.8, { p: [sx * 0.45, 0.5, 0] });
  // ---- cab lower body (hood, fenders, doors)
  const c = new THREE.Shape();
  c.moveTo(-3.2, 0.4);
  c.lineTo(fa - 0.47, 0.4);
  c.absarc(fa, 0.42, 0.47, PI, 0, true);
  c.lineTo(-1.5, 0.4);
  c.lineTo(-1.5, 1.2);
  c.lineTo(-2.3, 1.2);
  c.lineTo(-2.55, 1.13);
  c.lineTo(-3.14, 1.04);
  c.lineTo(-3.26, 0.94);
  c.lineTo(-3.26, 0.5);
  c.lineTo(-3.2, 0.4);
  b.extrude('carpaint', c, CW, { r: [0, -PI / 2, 0], p: [chw, 0, 0], c: cab });
  b.box('dark', CW - 0.03, 0.5, 0.92, { p: [0, 0.64, fa] });
  // cab greenhouse
  const C = [];
  for (let k = 0; k < 8; k++) {
    const X = k & 1 ? 1 : -1, top = k & 2, Z = k & 4;
    C.push([X * (top ? chw - 0.1 : chw - 0.03), top ? 1.94 : 1.2, Z ? -1.5 : top ? -1.98 : -2.32]);
  }
  // (a shell, standing on the cab's floor and open behind onto the coach's front wall)
  const dirty = v ? 0.75 : 0.45;
  hullShell(b, 'carpaint', C, {
    c: cab, t: 0.03, skip: ['yn', 'zp'], look: (k) => paneLook(dirty, k),
    holes: { zn: [[0.035, 0.965, 0.06, 0.95]], xn: [[0.12, 0.93, 0.07, 0.94, v === 1 ? 'gone' : undefined]], xp: [[0.12, 0.93, 0.07, 0.94]] },
  });
  deck(b, 0, 1.215, -1.9, CW - 0.1, 0.8);
  for (const sx of [-1, 1]) seat(b, sx * 0.52, 1.2, -1.78, { w: 0.5, h: 0.09, bh: 0.4, d: 0.4, c: SEATS[v ? 2 : 1] });
  dash(b, 1.34, -2.29, CW - 0.14, { d: 0.22, h: 0.14, wheelX: -0.52 });
  steering(b, [-0.52, 1.52, -2.0], { R: 0.18, tilt: 0.6 });
  mirror(b, [0, 1.82, -1.99]);
  const nn = (p, d, k = 0.008) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
  b.beam('carpaint', nn(C[0], [-1, 0.2, 0], 0.012), nn(C[2], [-1, 0.2, 0], 0.012), 0.07, 0.05, { c: cab });
  b.beam('carpaint', nn(C[1], [1, 0.2, 0], 0.012), nn(C[3], [1, 0.2, 0], 0.012), 0.07, 0.05, { c: cab });
  for (const sx of [-1, 1]) {
    b.box('dark', 0.01, 0.74, 0.012, { p: [sx * (chw + 0.002), 0.8, -2.0] });
    b.box('chrome', 0.03, 0.03, 0.12, { p: [sx * (chw + 0.012), 1.05, -1.7] });
    b.cylBetween('steel', [sx * (chw + 0.01), 1.5, -2.2], [sx * (chw + 0.2), 1.62, -2.3], 0.012, 0.012, 4);
    b.box('chrome', 0.06, 0.26, 0.14, { p: [sx * (chw + 0.22), 1.55, -2.3] });
  }
  // front: grille, square lights, bumper, plate
  b.box('dark', 1.1, 0.34, 0.02, { p: [0, 0.76, -3.265] });
  for (let k = 0; k < 4; k++) b.box('chrome', 1.1, 0.02, 0.025, { p: [0, 0.64 + k * 0.08, -3.272] });
  for (const sx of [-1, 1]) {
    b.box('chrome', 0.3, 0.22, 0.03, { p: [sx * 0.76, 0.78, -3.265] });
    b.box(sx < 0 && v === 1 ? 'dark' : 'glass', 0.26, 0.18, 0.02, { p: [sx * 0.76, 0.78, -3.28] });
  }
  b.box('chrome', CW + 0.1, 0.18, 0.12, { p: [0, 0.46, -3.3] });
  label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.46, -3.362], 'z-');
  // ---- living box (overcab bunk + coach), extruded side profile
  const s = new THREE.Shape();
  s.moveTo(-1.5, 0.62);
  s.lineTo(-1.5, 1.96);
  s.lineTo(-2.42, 1.96);
  s.lineTo(-2.6, 2.1);
  s.lineTo(-2.64, 2.62);
  s.quadraticCurveTo(-2.64, 2.9, -2.36, 2.9);
  s.lineTo(3.16, 2.9);
  s.lineTo(3.24, 2.82);
  s.lineTo(3.24, 0.72);
  s.lineTo(3.14, 0.62);
  s.lineTo(ra + 0.5, 0.62);
  s.absarc(ra, 0.62, 0.5, 0, PI, false);
  s.lineTo(-1.5, 0.62);
  // (a shell: its windows are openings in its two sides, in the overcab's nose and in the back; the door on the kerb
  // side shut, with a light in it - or, on the second one, hanging open on the way in)
  const dz0 = 0.15, dz1 = 0.78;
  const wl = [[-1.0, -0.3, 1.66, 2.3, v === 0 ? 'shard' : undefined], [2.2, 2.9, 1.66, 2.3], [0.5, 1.3, 1.66, 2.3], [-2.3, -1.75, 2.28, 2.62]];
  const wr2 = [[-1.0, -0.3, 1.66, 2.3], [2.2, 2.9, 1.66, 2.3, v === 1 ? 'gone' : undefined], [-2.3, -1.75, 2.28, 2.62], v === 1 ? [dz0, dz1, 1.16, 2.48, 'gone'] : [0.275, 0.655, 1.9, 2.26]];
  profShell(b, 'carpaint', s.getPoints(5).map((p) => [p.x, p.y]), W, {
    c: body, t: 0.04, lining: [0.3, 0.27, 0.21], sides: { L: wl, R: wr2 }, look: (k) => paneLook(dirty, k + 5),
    edges: [{ at: [[-2.6, 2.1], [-2.64, 2.62]], holes: [[-0.72, 0.72, 0.27, 0.73]] }, { at: [[3.24, 2.82], [3.24, 0.72]], holes: [[-0.52, 0.52, 0.552, 0.762]] }, { at: [[-2.36, 2.9], [3.16, 2.9]], holes: [[-0.67, -0.33, 0.741, 0.803, 'gone']] }],
  });
  b.box('dark', W - 0.1, 0.5, 1.0, { p: [0, 0.8, ra] }); // rear wheel well
  // inside: a floor over the wheels; the bunk over the cab and one across the back; a dinette under the window on
  // the road side, a galley opposite; cupboards along the top
  const fy = 1.14, wood = [0.34, 0.26, 0.17];
  deck(b, 0, fy + 0.01, 0.82, W - 0.1, 4.7, [0.2, 0.17, 0.13]);
  b.box('cabin_fine', W - 0.14, 0.06, 1.0, { p: [0, 2.03, -2.02], c: wood }); // the overcab bunk
  b.box('cabin_fine', W - 0.3, 0.12, 0.9, { p: [0, 2.12, -2.0], c: [0.44, 0.42, 0.36] });
  b.box('cabin_fine', 0.5, 0.09, 0.3, { p: [-0.6, 2.22, -1.72], r: [0, 0.2, 0], c: [0.52, 0.5, 0.44] });
  b.box('cabin_fine', W - 0.14, 0.5, 0.9, { p: [0, fy + 0.25, 2.72], c: wood }); // the bed across the back
  b.box('cabin_fine', W - 0.2, 0.14, 0.86, { p: [0, fy + 0.57, 2.72], c: [0.42, 0.4, 0.35] });
  b.box('cabin_fine', 1.3, 0.06, 0.8, { p: [0.25, fy + 0.66, 2.74], r: [0, 0.06, 0.02], c: curt });
  b.box('cabin_fine', 0.5, 0.1, 0.32, { p: [-0.75, fy + 0.69, 2.66], r: [0, -0.2, 0], c: [0.52, 0.5, 0.44] });
  seat(b, -0.74, fy, 0.42, { w: 0.76, h: 0.42, bh: 0.46, d: 0.36, heads: 0, back: -1, c: SEATS[v ? 2 : 1], rake: 0.06 });
  seat(b, -0.74, fy, 1.4, { w: 0.76, h: 0.42, bh: 0.46, d: 0.36, heads: 0, c: SEATS[v ? 2 : 1], rake: 0.06 });
  b.box('cabin_fine', 0.62, 0.04, 0.52, { p: [-0.8, fy + 0.7, 0.91], c: wood });
  b.box('cabin_fine', 0.05, 0.68, 0.05, { p: [-0.6, fy + 0.34, 0.91], c: [0.2, 0.2, 0.2] });
  b.box('cabin_fine', 0.5, 0.86, 1.2, { p: [0.88, fy + 0.43, -0.75], c: wood }); // the galley
  b.box('cabin_fine', 0.36, 0.02, 0.4, { p: [0.86, fy + 0.87, -0.5], c: [0.4, 0.42, 0.42] });
  for (const sx of [-1, 1]) b.box('cabin_fine', 0.3, 0.36, 3.6, { p: [sx * (hw - 0.2), 2.62, 0.9], c: mul(wood, 0.9) });
  if (v) {
    luggage(b, [-0.74, fy + 0.42, 1.4], 1, { r: 1.5 });
    rubbish(b, [0.2, fy + 0.02, 0.6], 0.9, 2.0, 7, 4);
  } else {
    // somebody under the blanket on the back bed, and the table still laid
    b.box('cabin_fine', 0.5, 0.2, 1.5, { p: [0.3, fy + 0.72, 2.72], r: [0, PI / 2 + 0.08, 0], c: mul(curt, 0.8) });
    b.sphere('cabin_fine', 0.095, 6, 4, { p: [-0.62, fy + 0.8, 2.66], s: [0.9, 1, 1.05], c: [0.7, 0.66, 0.54] });
    b.cyl('cabin_fine', 0.035, 0.04, 0.22, 5, { p: [-0.74, fy + 0.83, 0.86], c: [0.16, 0.26, 0.14] });
    b.cyl('cabin_fine', 0.09, 0.09, 0.012, 7, { p: [-0.9, fy + 0.726, 1.0], c: [0.66, 0.64, 0.58] });
    rubbish(b, [0.2, fy + 0.02, 0.8], 0.8, 1.6, 4, 6);
  }
  // stripes: straight bands along the coach + a sweep up onto the overcab
  for (const sx of [-1, 1]) {
    const x = sx * (hw + 0.004);
    const band = (y0, y1, zA, zB, col) => b.quadOut('carpaint', [[x, y0, zA], [x, y0, zB], [x, y1, zB], [x, y1, zA]], [0, (y0 + y1) / 2, (zA + zB) / 2], { c: col });
    band(1.34, 1.52, -1.2, 3.24, s1);
    band(1.25, 1.3, -1.2, 3.24, s2);
    b.quadOut('carpaint', [[x, 1.34, -1.2], [x, 1.52, -1.2], [x, 2.36, -2.58], [x, 2.18, -2.58]], [0, 1.9, -1.9], { c: s1 });
    b.quadOut('carpaint', [[x, 1.25, -1.2], [x, 1.3, -1.2], [x, 2.14, -2.54], [x, 2.09, -2.52]], [0, 1.7, -1.9], { c: s2 });
    // windows (some smashed), curtains half drawn
    rvWindow(b, sx * hw, -1.0, -0.3, 1.66, 2.3, sx, { curtain: 0.45, cc: curt, broken: sx < 0 && v === 0 });
    rvWindow(b, sx * hw, 2.2, 2.9, 1.66, 2.3, sx, { curtain: 0.6, cc: curt, broken: sx > 0 && v === 1 });
    if (sx < 0) rvWindow(b, sx * hw, 0.5, 1.3, 1.66, 2.3, sx, { curtain: 0.35, cc: curt });
    rvWindow(b, sx * hw, -2.3, -1.75, 2.28, 2.62, sx, { curtain: 0.5, cc: curt });
    // skirt rust + propane/storage hatch
    b.box('dark', 0.012, 0.36, 0.5, { p: [x + sx * 0.002, 0.95, -0.9] });
    b.box('carpaint', 0.012, 0.32, 0.46, { p: [x + sx * 0.006, 0.95, -0.9], c: body.map((q) => q * 0.9) });
  }
  // entry door (curb side +X) with window + step; hanging open on the second variant
  const doorLeaf = () => {
    // (shut, its light is the pane in the wall behind it; open, its own)
    leaf(b, 'carpaint', dz1 - dz0 - 0.03, 1.8, 0.035, [-0.19, 0.19, 0.32, 0.68], { axis: 'x', c: body.map((q) => q * 0.97), pane: v === 1 ? undefined : false, look: paneLook(dirty, 9) });
    b.box('carpaint', 0.004, 0.18, dz1 - dz0 - 0.03, { p: [0.02, -0.18, 0], c: s1 });
    b.box('chrome', 0.04, 0.05, 0.1, { p: [0.03, 0.0, -0.2] });
  };
  if (v === 1) b.group({ p: [hw + 0.02, 1.58, dz1], r: [0, -1.2, 0] }, () => b.group({ p: [0, 0, -(dz1 - dz0) / 2] }, doorLeaf));
  else b.group({ p: [hw + 0.02, 1.58, (dz0 + dz1) / 2] }, doorLeaf);
  b.box('rust', 0.3, 0.05, 0.56, { p: [hw + 0.05, 0.42, (dz0 + dz1) / 2] });
  // overcab front window, rear window, roof gear, ladder, spare tyre, lights, bumper
  b.quadOut('carpaint', [[-hw + 0.02, 2.02, -2.62], [hw - 0.02, 2.02, -2.62], [hw - 0.02, 2.14, -2.645], [-hw + 0.02, 2.14, -2.645]], [0, 2.1, -2.2], { c: s1 });
  b.box('paint', 0.72, 0.18, 0.86, { p: [0.2, 2.99, 0.4], c: [0.78, 0.76, 0.7] });
  for (let k = 0; k < 5; k++) b.box('dark', 0.6, 0.01, 0.02, { p: [0.2, 3.0, 0.08 + k * 0.16] });
  b.box('dark', 0.44, 0.08, 0.44, { p: [-0.5, 2.94, -1.4] });
  b.plane('carglass', 0.38, 0.38, { p: [-0.5, 2.98, 1.9], r: [-PI / 2 + 0.15, 0, 0], c: paneLook(dirty, 12) }); // the roof light, propped open over its hole
  for (const x of [0.62, 1.0]) b.box('steel', 0.03, 2.3, 0.03, { p: [x, 1.8, 3.29] });
  for (let y = 0.9; y < 2.9; y += 0.3) b.box('steel', 0.4, 0.025, 0.025, { p: [0.81, y, 3.29] });
  b.group({ p: [-0.5, 1.1, 3.4] }, () => {
    b.lathe('tire', [[0.24, -0.1], [0.34, -0.11], [0.38, -0.05], [0.38, 0.05], [0.34, 0.11], [0.24, 0.1]], 12, { r: [PI / 2, 0, 0] });
    b.cyl('paint', 0.37, 0.37, 0.02, 12, { p: [0, 0, 0.11], r: [PI / 2, 0, 0], c: s1 });
  });
  for (const sx of [-1, 1]) {
    b.box('taillight', 0.14, 0.34, 0.03, { p: [sx * 0.98, 0.95, 3.25] });
    b.box('paint', 0.1, 0.06, 0.03, { p: [sx * 0.98, 2.84, 3.25], c: [0.8, 0.45, 0.1] });
  }
  b.box('chrome', W - 0.2, 0.14, 0.14, { p: [0, 0.58, 3.3] });
  label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.76, 3.262], 'z+');
  // grime streak down the nose
  b.box('rust', 0.3, 0.3, 0.004, { p: [0.5, 2.35, -2.66] });
  b.pop();
  // wheels: flat and cracked; rear duals
  for (const [x, z] of [[-0.86, fa], [0.86, fa]]) b.group({ p: [x, wr - sink * 0.5, z] }, () => wheel(b, wr, 0.24, { flat: 0.3, rim: 'steel' }));
  for (const sx of [-1, 1]) for (const x of [0.78, 1.02]) b.group({ p: [sx * x, wr - sink * 0.5, ra] }, () => wheel(b, wr, 0.22, { flat: x > 0.9 ? 0.32 : 0.18, rim: 'steel' }));
  weeds(b, r, [[1.3, -0.5], [-1.3, 1.0], [1.25, 2.6], [-1.2, -2.8], [0.4, 3.4]], 0.6);
};

// the ambulance on the clinic's car park: a box body on a van chassis, cab at -z, an orange stripe and red crosses,
// one rear door hanging open on the dark inside
VEHICLE_PROPS.ambulance = (b, r) => {
  const white = [0.82, 0.82, 0.78], orange = [0.74, 0.3, 0.1];
  const W = 2.1, hw = W / 2, CW = 1.96, chw = CW / 2;
  const fa = -1.85, ra = 1.6, wr = 0.38;
  for (const sx of [-1, 1]) b.box('dark', 0.12, 0.2, 5.3, { p: [sx * 0.45, 0.48, 0] }); // chassis rails
  // cab: nose, cabin, windscreen and side glass
  b.box('carpaint', CW, 0.62, 1.05, { p: [0, 0.83, -2.32], c: white });
  b.box('dark', CW - 0.04, 0.5, 0.9, { p: [0, 0.62, fa] }); // front wheel well
  // (the cab: a shell - the screen and a window each side; two seats, the dash, a clipboard left on it)
  const cabC = [];
  for (let k = 0; k < 8; k++) {
    const X = k & 1 ? 1 : -1, top = k & 2, Z = k & 4 ? 1 : -1;
    cabC.push(top ? [(X * (CW - 0.16)) / 2, 1.9, -1.15 + Z * 0.5] : [(X * CW) / 2, 1.14, -1.3 + Z * 0.65]);
  }
  hullShell(b, 'carpaint', cabC, { c: white, t: 0.04, look: (k) => paneLook(0.5, k), holes: { zn: [[0.077, 0.923, 0.157, 0.843]], xn: [[0.2, 0.74, 0.2, 0.8]], xp: [[0.2, 0.74, 0.2, 0.8, 'blood']] } });
  for (const sx of [-1, 1]) seat(b, sx * 0.48, 1.18, -1.05, { w: 0.5, h: 0.1, bh: 0.36, d: 0.4, c: SEATS[2] });
  dash(b, 1.36, -1.84, CW - 0.2, { d: 0.22, h: 0.16, wheelX: -0.48 });
  steering(b, [-0.48, 1.52, -1.5], { R: 0.18, tilt: 0.55 });
  mirror(b, [0, 1.78, -1.52]);
  b.box('cabin_fine', 0.22, 0.012, 0.3, { p: [0.4, 1.368, -1.72], r: [0, 0.3, 0], c: [0.6, 0.58, 0.5] });
  bloodPatch(b, [0.48, 1.285, -1.05], 0.36, 0.3, 0.2);
  for (const sx of [-1, 1]) {
    b.box('carpaint', 0.012, 0.2, 2.2, { p: [sx * (chw + 0.004), 1.02, -1.75], c: orange });
    b.box('chrome', 0.06, 0.24, 0.14, { p: [sx * (chw + 0.16), 1.5, -1.86] }); // mirror
    b.box('chrome', 0.03, 0.03, 0.12, { p: [sx * (chw + 0.012), 1.08, -1.0] });
  }
  b.box('dark', 1.2, 0.3, 0.02, { p: [0, 0.86, -2.85] }); // grille
  for (let k = 0; k < 3; k++) b.box('chrome', 1.2, 0.02, 0.025, { p: [0, 0.76 + k * 0.09, -2.856] });
  for (const sx of [-1, 1]) b.box(sx < 0 ? 'dark' : 'glass', 0.26, 0.18, 0.02, { p: [sx * 0.78, 0.88, -2.855] });
  b.box('chrome', CW + 0.1, 0.18, 0.12, { p: [0, 0.5, -2.86] });
  label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.5, -2.922], 'z-');
  // the box: patient compartment from behind the cab to the rear doors - a shell, a small window high in each side,
  // the whole of the back the doorway
  boxShell(b, 'carpaint', W, 1.95, 3.55, { p: [0, 1.6, 1.07], c: white, t: 0.05, lining: [0.36, 0.36, 0.33], look: (k) => paneLook(0.55, k + 4), holes: { xn: [[-1.22, -0.72, 0.45, 0.75]], xp: [[-1.22, -0.72, 0.45, 0.75]], zp: [[-0.93, 0.93, -0.85, 0.85, 'gone']] } });
  // in it: a bench down the left for whoever rode with the patient, cupboards down the right, the oxygen, the
  // drip still hanging; and what was on the floor when they left
  const by = 0.675;
  b.box('cabin_fine', 0.42, 0.44, 2.5, { p: [-0.78, by + 0.22, 1.0], c: [0.2, 0.22, 0.24] });
  b.box('cabin_fine', 0.42, 0.06, 2.5, { p: [-0.78, by + 0.47, 1.0], c: [0.16, 0.2, 0.3] });
  b.box('cabin_fine', 0.34, 0.8, 1.3, { p: [0.83, by + 0.4, 0.05], c: [0.46, 0.46, 0.42] });
  b.box('cabin_fine', 0.3, 0.5, 2.9, { p: [0.85, 2.25, 1.05], c: [0.46, 0.46, 0.42] });
  for (let k = 0; k < 4; k++) b.box('cabin_fine', 0.012, 0.4, 0.02, { p: [0.695, 2.25, -0.1 + k * 0.72], c: [0.22, 0.22, 0.2] });
  b.cyl('cabin_fine', 0.07, 0.07, 0.6, 7, { p: [-0.86, by + 0.8, -0.45], c: [0.2, 0.34, 0.24] });
  b.cyl('cabin_fine', 0.03, 0.03, 0.08, 5, { p: [-0.86, by + 1.14, -0.45], c: [0.5, 0.5, 0.46] });
  b.cylBetween('cabin_fine', [-0.5, 2.5, 1.5], [-0.5, 2.0, 1.5], 0.008, 0.008, 3, { c: [0.5, 0.5, 0.46] });
  b.box('cabin_fine', 0.1, 0.16, 0.03, { p: [-0.5, 1.92, 1.5], c: [0.6, 0.62, 0.56] });
  b.box('cabin_fine', 0.36, 0.2, 1.5, { p: [-0.78, by + 0.6, 0.9], r: [0, 0.03, 0], c: [0.12, 0.13, 0.14] }); // somebody they did not get to the clinic, bagged
  bloodPatch(b, [0.1, by + 0.008, 1.9], 0.7, 0.5, 0.4);
  bloodPatch(b, [-0.2, by + 0.008, 0.8], 0.3, 0.9, -0.2);
  rubbish(b, [0.1, by, 0.9], 0.8, 2.0, 6, 8);
  b.box('dark', W - 0.04, 0.5, 1.0, { p: [0, 0.66, ra] }); // rear wheel well
  for (const sx of [-1, 1]) {
    const x = sx * (hw + 0.005);
    b.box('carpaint', 0.012, 0.24, 3.55, { p: [x, 1.2, 1.07], c: orange });
    label(b, 'labels', 'cross_mark', 0.66, 0.66, [sx * (hw + 0.008), 1.92, 1.4], sx < 0 ? 'x-' : 'x+');
    b.box('rust', 0.006, 0.3 + r() * 0.3, 0.4, { p: [sx * (hw + 0.012), 0.82, 0.3 + r()] });
  }
  // light bar and beacons, all dead
  b.box('dark', 1.5, 0.06, 0.3, { p: [0, 2.6, -0.45] });
  for (const sx of [-1, 1]) b.box('taillight', 0.5, 0.13, 0.24, { p: [sx * 0.46, 2.69, -0.45] });
  for (const sx of [-1, 1]) b.box('taillight', 0.16, 0.08, 0.1, { p: [sx * 0.8, 2.61, 2.72] });
  // the rear: the left door shut, the right one swung wide; a stretcher half out of the dark
  const door = () => leaf(b, 'carpaint', 0.93, 1.7, 0.04, [-0.25, 0.25, 0.2, 0.6], { c: white.map((q) => q * 0.97), look: paneLook(0.6, 2) });
  b.group({ p: [-0.47, 1.6, 2.87] }, door);
  label(b, 'labels', 'cross_mark', 0.36, 0.36, [-0.47, 1.35, 2.893], 'z+');
  b.group({ p: [0.95, 1.6, 2.87], r: [0, 1.95, 0] }, () => b.group({ p: [-0.465, 0, 0] }, door));
  b.box('steel', 0.56, 0.04, 1.5, { p: [0.4, 0.98, 2.6], r: [-0.08, 0, 0] });
  b.box('mattress', 0.52, 0.07, 1.4, { p: [0.4, 1.03, 2.6], r: [-0.08, 0, 0] });
  b.box('chrome', W, 0.12, 0.26, { p: [0, 0.58, 2.96] }); // step bumper
  for (const sx of [-1, 1]) b.box('taillight', 0.12, 0.3, 0.03, { p: [sx * 0.99, 1.0, 2.86] });
  for (const [x, z, flat] of [[-0.84, fa, 0.3], [0.84, fa, 0.05], [-0.88, ra, 0.1], [0.88, ra, 0.32]]) b.group({ p: [x, wr - flat * 0.1, z] }, () => wheel(b, wr, 0.24, { flat, rim: 'steel' }));
  weeds(b, r, [[1.2, -0.6], [-1.2, 1.2], [0.3, 3.2], [-1.1, -2.6]], 0.55);
};

VEHICLE_PROPS.school_bus = (b, r, v) => {
  const yel = [0.82, 0.58, 0.12];
  const hw = 1.25, sink = 0.12;
  const fa = -4.3, ra = 2.35, wr = 0.5;
  const z0 = -3.95, z1 = 5.2;
  b.push([0, -sink, 0]);
  for (const sx of [-1, 1]) b.box('dark', 0.16, 0.24, 9.8, { p: [sx * 0.5, 0.58, 0.1] });
  // ---- hood + fenders (conventional nose)
  const h = new THREE.Shape();
  h.moveTo(-5.16, 0.52);
  h.lineTo(fa - 0.57, 0.52);
  h.absarc(fa, 0.54, 0.57, PI, 0, true);
  h.lineTo(z0, 0.52);
  h.lineTo(z0, 1.62);
  h.lineTo(-5.0, 1.5);
  h.lineTo(-5.2, 1.3);
  h.lineTo(-5.2, 0.62);
  h.lineTo(-5.16, 0.52);
  b.extrude('carpaint', h, 2.14, { r: [0, -PI / 2, 0], p: [1.07, 0, 0], c: yel });
  b.box('dark', 2.1, 0.56, 1.06, { p: [0, 0.8, fa] });
  b.box('dark', 1.3, 0.62, 0.02, { p: [0, 1.0, -5.205] });
  for (let k = 0; k < 6; k++) b.box('chrome', 1.3, 0.025, 0.03, { p: [0, 0.74 + k * 0.1, -5.212] });
  b.box('carpaint', 1.2, 0.02, 0.9, { p: [0, 1.62, -4.45], r: [-0.1, 0, 0], c: yel.map((c) => c * 0.95) }); // hood seam strip
  for (const sx of [-1, 1]) {
    b.cyl('chrome', 0.13, 0.13, 0.06, 10, { p: [sx * 0.78, 1.05, -5.19], r: [PI / 2, 0, 0] });
    b.cyl(sx < 0 ? 'glass' : 'dark', 0.1, 0.1, 0.02, 10, { p: [sx * 0.78, 1.05, -5.225], r: [PI / 2, 0, 0] });
    b.box('paint', 0.12, 0.08, 0.03, { p: [sx * 0.95, 1.3, -5.12], c: [0.8, 0.5, 0.1] });
  }
  b.box('dark', 2.4, 0.26, 0.16, { p: [0, 0.55, -5.28] });
  label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.55, -5.365], 'z-');
  // ---- body: lower box + window band + rounded roof
  const L = z1 - z0, zc = (z0 + z1) / 2;
  b.box('carpaint', hw * 2, 1.15, L, { p: [0, 0.55 + 0.575, zc], c: yel });
  // (the window band is open from side to side: a floor on the body, the ceiling, and what is in between)
  const look = (k) => paneLook(v ? 0.7 : 0.5, k);
  let np = 0;
  const glass = (w2, h2, o) => b.plane('carglass', w2, h2, { ...o, c: look(np++) });
  deck(b, 0, 1.712, zc, hw * 2 - 0.08, L - 0.08, [0.1, 0.1, 0.1]);
  b.box('cabin', hw * 2 - 0.1, 0.012, L - 0.1, { p: [0, 2.452, zc], c: LINING });
  const green = [0.17, 0.26, 0.19];
  busRows(b, [-0.72, 0.72], 1.71, -2.62, 0.667, 12, 0.88, { c: green, bh: 0.44, skip: (k, x) => (k * 7 + (x > 0 ? 3 : 0)) % 11 === 5 || (v === 1 && k === 4 && x < 0) });
  seat(b, -0.7, 1.71, -3.42, { w: 0.5, h: 0.12, bh: 0.44, d: 0.4, c: green, heads: 0 });
  b.box('cabin_fine', hw * 2 - 0.3, 0.16, 0.22, { p: [0, 1.8, -3.84], c: [0.1, 0.1, 0.1] });
  steering(b, [-0.7, 2.0, -3.66], { R: 0.22, tilt: 0.9 });
  b.cylBetween('cabin_fine', [0.3, 1.72, -3.2], [0.3, 2.44, -3.2], 0.018, 0.018, 4, { c: [0.5, 0.5, 0.46] }); // the pole by the steps
  if (v === 1) {
    sitter(b, [-0.7, 1.83, -3.42], { wheel: true, lean: 0.1, side: -1, shirt: [0.24, 0.26, 0.3] });
    for (const [x, z] of [[0.6, 0.72], [-0.8, 2.72]]) b.box('cabin_fine', 0.3, 0.26, 0.14, { p: [x, 1.94, z - 0.04], r: [0.2, 0.3, 0], c: [0.5, 0.2, 0.16] }); // satchels left on the seats
  } else {
    for (const [x, z, c] of [[0.5, 1.39, [0.2, 0.3, 0.46]], [-0.6, 4.72, [0.5, 0.36, 0.16]], [0.8, 3.39, [0.44, 0.18, 0.2]]]) b.box('cabin_fine', 0.3, 0.26, 0.14, { p: [x, 1.94, z - 0.04], r: [0.2, -0.4, 0], c });
    rubbish(b, [0, 1.712, 1.5], 0.4, 6, 8, 2);
  }
  const roof = new THREE.Shape();
  roof.moveTo(-hw, 2.46);
  roof.lineTo(hw, 2.46);
  roof.lineTo(hw, 2.62);
  roof.quadraticCurveTo(hw, 2.99, hw - 0.36, 3.0);
  roof.lineTo(-hw + 0.36, 3.0);
  roof.quadraticCurveTo(-hw, 2.99, -hw, 2.62);
  roof.lineTo(-hw, 2.46);
  b.extrude('carpaint', roof, L, { p: [0, 0, z0], c: yel, curveSegments: 4 });
  // front & rear caps above/below the windscreen
  for (const [z, s] of [[z0, -1], [z1, 1]]) {
    b.box('carpaint', hw * 2, 0.06, 0.04, { p: [0, 1.73, z + s * 0.02], c: yel });
    b.box('carpaint', hw * 2, 0.06, 0.04, { p: [0, 2.44, z + s * 0.02], c: yel });
    label(b, 'stencil', 'bus_text', 1.12, 0.28, [0, 2.7, z + s * 0.004], s < 0 ? 'z-' : 'z+');
    for (const sx of [-1, 1]) {
      b.cyl('paint', 0.065, 0.065, 0.05, 8, { p: [sx * 0.8, 2.78, z + s * 0.02], r: [PI / 2, 0, 0], c: [0.85, 0.5, 0.1] });
      b.cyl('taillight', 0.065, 0.065, 0.05, 8, { p: [sx * 1.0, 2.72, z + s * 0.02], r: [PI / 2, 0, 0] });
    }
  }
  // windscreen (2 panes, one smashed), entry door on the curb side (+X)
  glass(1.05, 0.64, { p: [-0.58, 2.08, z0 - 0.035], r: [0, PI, 0] });
  if (v !== 1) glass(1.05, 0.64, { p: [0.58, 2.08, z0 - 0.035], r: [0, PI, 0] });
  b.box('carpaint', 0.08, 0.72, 0.05, { p: [0, 2.08, z0 - 0.02], c: yel });
  for (const sx of [-1, 1]) b.box('carpaint', 0.14, 0.72, 0.05, { p: [sx * (hw - 0.07), 2.08, z0 - 0.02], c: yel }); // the screen's corner posts
  for (const zz of [-3.72, -3.36]) {
    // (the door's leaves: their upper lights look into the bus; the lower ones are in the body, on the step well)
    b.box('dark', 0.02, 1.04, 0.34, { p: [hw + 0.002, 1.12, zz] });
    b.box('cabin_fine', 0.012, 0.6, 0.28, { p: [hw + 0.008, 1.12, zz], c: [0.2, 0.19, 0.17] });
    glass(0.28, 0.72, { p: [hw + 0.014, 2.02, zz], r: [0, PI / 2, 0] });
    glass(0.28, 0.6, { p: [hw + 0.016, 1.12, zz], r: [0, PI / 2, 0] });
    b.box('carpaint', 0.04, 0.78, 0.04, { p: [hw - 0.012, 2.09, zz + 0.18], c: yel });
  }
  b.box('carpaint', 0.04, 0.78, 0.04, { p: [hw - 0.012, 2.09, -3.9], c: yel });
  // side windows: pillars + split sash, some panes gone
  const nWin = 12, wz0 = -3.05, wz1 = 4.95, step = (wz1 - wz0) / nWin;
  for (const sx of [-1, 1]) {
    const x = sx * (hw - 0.012);
    for (let k = 0; k <= nWin; k++) b.box('carpaint', 0.04, 0.78, 0.1, { p: [x, 2.09, wz0 + k * step], c: yel });
    if (sx < 0) for (const zz of [-3.72, -3.36]) b.box('carpaint', 0.04, 0.78, 0.36, { p: [x, 2.09, zz], c: yel });
    b.box('chrome', 0.03, 0.035, wz1 - wz0, { p: [x + sx * 0.008, 2.1, (wz0 + wz1) / 2] });
    for (let k = 0; k < nWin; k++) {
      const zz = wz0 + (k + 0.5) * step;
      const R = [0, sx * PI / 2, 0];
      if (r() > 0.25) glass(step - 0.1, 0.34, { p: [x + sx * 0.016, 1.9, zz], r: R });
      if (r() > 0.5) glass(step - 0.1, 0.3, { p: [x + sx * 0.016, 2.29, zz], r: R });
    }
    // black rub rails + rust along the skirt
    for (const y of [0.95, 1.3, 1.62]) b.box('dark', 0.02, 0.05, L - 0.1, { p: [sx * (hw + 0.006), y, zc] });
    b.box('rust', 0.01, 0.16, L * 0.6, { p: [sx * (hw + 0.004), 0.62, zc + 0.8] });
    // crossview mirrors
    b.cylBetween('steel', [sx * 1.0, 1.55, -5.0], [sx * 1.25, 1.75, -5.15], 0.015, 0.015, 4);
    b.sphere('chrome', 0.1, 7, 5, { p: [sx * 1.27, 1.8, -5.16], s: [1, 1, 0.5] });
  }
  // stop arm (driver side), rear emergency door, bumper
  b.cyl('paint', 0.22, 0.22, 0.02, 8, { p: [-hw - 0.03, 1.85, -3.3], r: [0, 0, PI / 2], c: [0.62, 0.08, 0.06] });
  // (the emergency door: its panel below the sill, its light and the two beside it looking down the bus)
  b.box('dark', 0.02, 1.1, 0.9, { p: [0, 1.15, z1 + 0.012], r: [0, PI / 2, 0] });
  b.group({ p: [0, 2.08, z1 + 0.005] }, () => leaf(b, 'carpaint', 1.0, 0.76, 0.03, [-0.35, 0.35, -0.31, 0.31], { c: yel, pane: false }));
  glass(0.7, 0.62, { p: [0, 2.08, z1 + 0.012] });
  b.box('chrome', 0.14, 0.04, 0.05, { p: [0.3, 1.5, z1 + 0.03] });
  for (const sx of [-1, 1]) {
    b.box('carpaint', 0.14, 0.76, 0.03, { p: [sx * (hw - 0.07), 2.08, z1 + 0.005], c: yel });
    b.box('carpaint', 0.62, 0.08, 0.03, { p: [sx * 0.86, 1.74, z1 + 0.005], c: yel });
    b.box('carpaint', 0.62, 0.07, 0.03, { p: [sx * 0.86, 2.425, z1 + 0.005], c: yel });
    glass(0.6, 0.62, { p: [sx * 0.86, 2.08, z1 + 0.012] });
    b.box('taillight', 0.18, 0.18, 0.04, { p: [sx * 1.0, 1.0, z1 + 0.02] });
  }
  b.box('dark', 2.44, 0.26, 0.16, { p: [0, 0.55, z1 + 0.08] });
  label(b, 'labels', 'plate', 0.32, 0.16, [0, 0.8, z1 + 0.024], 'z+');
  // roof hatches + rust patches
  for (const z of [-1.5, 2.6]) b.box('metal', 0.7, 0.05, 0.7, { p: [0, 3.02, z] });
  b.pop();
  // wheels (flat, sunk) : single front, dual rear
  for (const sx of [-1, 1]) {
    b.group({ p: [sx * 1.0, wr - sink, fa] }, () => wheel(b, wr, 0.3, { flat: 0.3, rim: 'steel', rimR: 0.55 }));
    for (const x of [0.86, 1.12]) b.group({ p: [sx * x, wr - sink, ra] }, () => wheel(b, wr, 0.26, { flat: 0.28, rim: 'steel', rimR: 0.55 }));
  }
  weeds(b, r, [[1.4, -2.0], [-1.4, 0.5], [1.35, 3.6], [-1.3, 4.9], [0.6, -5.4], [-1.35, -3.9]], 0.7);
};

/** chunky off-road tyre with tread lugs, axis along X. lugs=false for hidden inner duals */
function bigTire(b, R, w, rimCol, flat = 0, lugs = true) {
  b.group({ p: [0, -flat * R * 0.5, 0], s: [1, 1 - flat * 0.5, 1] }, () => {
    const prof = [[R * 0.5, w * 0.36], [R * 0.9, w * 0.5], [R * 0.96, w * 0.4], [R * 0.96, -w * 0.4], [R * 0.9, -w * 0.5], [R * 0.5, -w * 0.36]];
    b.lathe('tire', prof, 12, { r: [0, 0, PI / 2] });
    if (!lugs) return;
    b.cyl('paint', R * 0.5, R * 0.5, w * 0.62, 10, { r: [0, 0, PI / 2], c: rimCol });
    b.cyl('rust', R * 0.2, R * 0.24, w * 0.74, 6, { r: [0, 0, PI / 2] });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * PI * 2;
      b.box('tire', w * 0.86, R * 0.07, R * 0.14, { p: [0, Math.cos(a) * R * 0.975, Math.sin(a) * R * 0.975], r: [a, 0, 0] });
    }
  });
}

VEHICLE_PROPS.dump_truck = (b, r, v) => {
  const yel = [0.74, 0.5, 0.12];
  const fa = -2.3, ra = 1.95, wr = 0.72;
  // wheels
  for (const sx of [-1, 1]) {
    b.group({ p: [sx * 1.0, wr, fa] }, () => bigTire(b, wr, 0.52, yel, sx < 0 ? 0.12 : 0));
    for (const x of [0.76, 1.03]) b.group({ p: [sx * x, wr, ra] }, () => bigTire(b, wr, 0.46, yel, 0, x > 0.9));
  }
  // frame + axles + fuel tank
  for (const sx of [-1, 1]) b.box('rust', 0.2, 0.36, 6.6, { p: [sx * 0.45, 1.0, -0.2] });
  b.box('rust', 2.0, 0.2, 0.3, { p: [0, 0.72, fa] });
  b.box('rust', 2.0, 0.26, 0.4, { p: [0, 0.72, ra] });
  b.cyl('metal', 0.3, 0.3, 1.1, 10, { p: [-0.9, 1.1, -0.35], r: [PI / 2, 0, 0] });
  b.box('rust', 0.5, 0.36, 0.7, { p: [0.9, 1.05, -0.3] }); // battery/tool box
  // ---- engine hood + radiator + bumper
  b.frustum('carpaint', 1.7, 1.5, 1.6, 1.46, 1.05, 2.05, { p: [0, 0, -2.95], c: yel });
  b.box('dark', 1.4, 0.8, 0.03, { p: [0, 1.5, -3.71] });
  for (let k = 0; k < 7; k++) b.box('steel', 1.4, 0.03, 0.04, { p: [0, 1.17 + k * 0.11, -3.72] });
  b.box('rust', 2.5, 0.36, 0.34, { p: [0, 0.88, -3.52] });
  for (const sx of [-1, 1]) {
    b.box('steel', 0.24, 0.18, 0.08, { p: [sx * 0.9, 1.25, -3.72] });
    b.box(sx < 0 ? 'glass' : 'dark', 0.2, 0.14, 0.02, { p: [sx * 0.9, 1.25, -3.765] });
    // front fenders over the wheels
    b.cyl('carpaint', wr + 0.12, wr + 0.12, 0.6, 10, { theta: [-PI / 2 - 0.3, PI * 0.95], open: true, p: [sx * 1.0, wr, fa], r: [0, 0, PI / 2], c: yel });
    b.box('carpaint', 0.6, 0.05, 0.9, { p: [sx * 1.0, 1.58, fa - 0.6], c: yel, r: [0.25, 0, 0] });
  }
  // deck over the fenders + handrails + ladder up to the cab
  b.box('rust', 2.5, 0.06, 1.2, { p: [0, 1.6, -1.55] });
  for (const sx of [-1, 1]) {
    b.cylBetween('steel', [sx * 1.22, 1.6, -2.1], [sx * 1.22, 2.5, -2.1], 0.02, 0.02, 4);
    b.cylBetween('steel', [sx * 1.22, 2.5, -2.1], [sx * 1.22, 2.5, -1.1], 0.02, 0.02, 4);
  }
  for (let k = 0; k < 4; k++) b.box('rust', 0.4, 0.04, 0.2, { p: [-1.3, 0.35 + k * 0.33, -1.25 - k * 0.04] });
  b.cylBetween('rust', [-1.5, 0.3, -1.3], [-1.5, 1.6, -1.45], 0.02, 0.02, 4);
  b.cylBetween('rust', [-1.1, 0.3, -1.3], [-1.1, 1.6, -1.45], 0.02, 0.02, 4);
  // ---- cab
  const cabCol = yel.map((c) => c * 0.95);
  // (a shell: the screen in two lights, a window each side - one gone on the second truck)
  boxShell(b, 'carpaint', 2.0, 1.2, 1.1, {
    p: [0, 2.23, -1.5], c: cabCol, t: 0.05, look: (k) => paneLook(0.62, k + v),
    holes: { zn: [[-0.81, -0.03, -0.07, 0.47], [0.03, 0.81, -0.07, 0.47, v ? 'shard' : undefined]], xn: [[-0.42, 0.42, -0.03, 0.47]], xp: [[-0.42, 0.42, -0.03, 0.47, v === 1 ? 'gone' : undefined]] },
  });
  seat(b, -0.42, 1.68, -1.36, { w: 0.6, h: 0.36, bh: 0.5, d: 0.44, c: SEATS[4], heads: 0 });
  seat(b, 0.5, 1.68, -1.36, { w: 0.5, h: 0.36, bh: 0.5, d: 0.44, c: SEATS[4], heads: 0 });
  dash(b, 2.14, -2.0, 1.86, { d: 0.22, h: 0.3, wheelX: -0.42 });
  steering(b, [-0.42, 2.22, -1.72], { R: 0.2, tilt: 0.75 });
  b.box('cabin_fine', 0.26, 0.14, 0.2, { p: [0.5, 2.11, -1.36], r: [0, 0.3, 0], c: [0.6, 0.5, 0.12] }); // a hard hat on the seat
  b.cyl('cabin_fine', 0.04, 0.045, 0.22, 6, { p: [0.1, 2.25, -1.9], c: [0.24, 0.3, 0.34] });
  for (const sx of [-1, 1]) {
    b.box('dark', 0.012, 1.1, 0.012, { p: [sx * 1.004, 2.2, -1.0] });
    b.box('chrome', 0.03, 0.04, 0.14, { p: [sx * 1.02, 2.0, -1.12] });
    b.cylBetween('steel', [sx * 1.0, 2.6, -2.0], [sx * 1.35, 2.5, -2.2], 0.015, 0.015, 4);
    b.box('dark', 0.05, 0.36, 0.2, { p: [sx * 1.37, 2.35, -2.2] });
  }
  b.cyl('rust', 0.07, 0.08, 1.5, 7, { p: [0.75, 2.3, -2.25] });
  b.cyl('charred', 0.08, 0.07, 0.1, 7, { p: [0.75, 3.07, -2.25] });
  // ---- dump bed: sides from extruded profile, sloped floor, head board + canopy over the cab
  const sp = new THREE.Shape();
  sp.moveTo(-0.9, 1.5);
  sp.lineTo(3.3, 1.28);
  sp.lineTo(3.58, 1.72);
  sp.lineTo(3.4, 2.78);
  sp.lineTo(-0.9, 2.96);
  sp.lineTo(-0.9, 1.5);
  for (const sx of [-1, 1]) {
    b.extrude('carpaint', sp, 0.08, { r: [0, -PI / 2, 0], p: [sx * 1.26 + 0.04, 0, 0], c: yel });
    for (const z of [-0.3, 0.6, 1.5, 2.4, 3.2]) b.box('carpaint', 0.08, 1.35 - z * 0.05, 0.12, { p: [sx * 1.32, 2.12 - z * 0.03, z], c: yel });
    b.box('carpaint', 0.12, 0.1, 4.4, { p: [sx * 1.3, 2.9, 1.25], r: [-0.042, 0, 0], c: yel });
    b.cylBetween('chrome', [sx * 0.35, 1.2, -0.7], [sx * 0.35, 1.55, -0.2], 0.07, 0.07, 6); // hoist rams
  }
  b.beam('rust', [0, 1.52, -0.9], [0, 1.3, 3.32], 2.5, 0.08, { side: [0, 1, 0.05] });
  b.beam('rust', [0, 1.3, 3.3], [0, 1.74, 3.58], 2.5, 0.08, { side: [0, 0.5, -1] });
  b.box('carpaint', 2.6, 1.55, 0.1, { p: [0, 2.24, -0.95], c: yel });
  b.box('carpaint', 2.6, 0.1, 1.45, { p: [0, 3.06, -1.65], c: yel });
  for (const x of [-0.8, 0, 0.8]) b.box('carpaint', 0.1, 0.14, 1.45, { p: [x, 2.97, -1.65], c: yel });
  // leftover gravel in the bed + rust patches
  b.sphere('gravel', 1, 10, 4, { p: [0.2, 1.4, 2.2], s: [1.1, 0.35, 1.3], thetaLen: PI / 2 });
  for (const [x, y, z] of [[0.6, 1.62, 1.4], [-0.5, 1.58, 2.8], [0.1, 1.72, 2.1]]) b.rock('stone_rough', 0.12, { detail: 0, seed: 400 + (x * 10) | 0, p: [x, y, z] });
  b.box('rust', 0.01, 0.8, 1.2, { p: [1.345, 2.0, 2.2] });
  weeds(b, r, [[1.4, 0.2], [-1.4, 3.3], [1.3, -3.3], [-0.6, -3.7]], 0.6);
};

// The quest car repaired and running, for the crossing: the same sedan as the 'car' prop (its colour, its rust),
// hood shut, all four wheels on, nothing under it, and its cabin cleared out, so survivors can be seated in it.
// wheels: the four of them (front left, front right, rear left, rear right), each a child with its origin on its
// axle and its axis along X (spin rotation.x). DRIVE_CAR_SEATS: where the seat cushions are, in the car's frame.
const CAR_Z = 0.952; // (the 'car' prop's sedan is this much shorter than the builder's)
export const DRIVE_CAR_SEATS = [
  { x: -0.38, y: 0.44, z: -0.14 }, // driver (left-hand drive)
  { x: 0.38, y: 0.44, z: -0.14 }, // front passenger
  { x: -0.38, y: 0.46, z: 0.62 }, // rear left
  { x: 0.38, y: 0.46, z: 0.62 }, // rear right
];
export function createDriveCar(seed = 7) {
  const h = typeHash('car');
  const b = new MeshBuilder(h);
  b.push([0, 0, 0], [0, 0, 0], [1, 1, CAR_Z]);
  sedan(b, makeRng(h * 31 + 5), { color: [0.34, 0.42, 0.52], noWheels: true, glass: ['ok', 'ok', 'ok', 'gone', 'gone', 'ok'], dirt: 0.5, cabin: -1 }); // (nothing left lying in it: the survivors sit there)
  b.pop();
  const group = partsToGroup(b.build(), 'drive_car');
  const wb = new MeshBuilder(h + 1);
  wheel(wb, 0.32, 0.2);
  const parts = wb.build();
  const wheels = [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.35], [0.8, 1.35]].map(([x, z]) => {
    const w = partsToGroup(parts, 'wheel');
    w.position.set(x, 0.32, z * CAR_Z);
    group.add(w);
    return w;
  });
  void seed;
  return { group, wheels };
}

// The airfield's fuel bowser, cab to -Z: a square forward-control cab and a long elliptical tank on a three-axle
// chassis, faded yellow; the hose reel in a cabinet at the back, its hose out on the ground.
VEHICLE_PROPS.fuel_truck = (b, r) => {
  const yel = [0.74, 0.6, 0.16], grey = [0.5, 0.5, 0.48];
  const wr = 0.5;
  for (const sx of [-1, 1]) b.box('rust', 0.16, 0.3, 7.2, { p: [sx * 0.48, 0.92, 0] }); // chassis rails
  // cab
  // (a shell: the screen, and a window each side - the one on the left gone)
  boxShell(b, 'carpaint', 2.4, 1.5, 1.7, {
    p: [0, 1.85, -2.9], c: yel, t: 0.05, look: (k) => paneLook(0.5, k),
    holes: { zn: [[-1.0, 1.0, 0, 0.54]], xn: [[-0.42, 0.42, 0.04, 0.54, 'gone']], xp: [[-0.42, 0.42, 0.04, 0.54]] },
  });
  for (const sx of [-1, 1]) seat(b, sx * 0.6, 1.15, -2.7, { w: 0.56, h: 0.5, bh: 0.5, d: 0.46, c: SEATS[4] });
  dash(b, 1.82, -3.7, 2.26, { d: 0.26, h: 0.4, wheelX: -0.6 });
  steering(b, [-0.6, 1.92, -3.34], { R: 0.21, tilt: 0.8 });
  mirror(b, [0, 2.3, -3.6]);
  b.box('cabin_fine', 0.24, 0.3, 0.012, { p: [0.5, 1.98, -3.5], r: [-0.5, 0.2, 0], c: [0.62, 0.6, 0.5] }); // the day's sheet, on its board
  b.box('carpaint', 2.4, 0.36, 0.3, { p: [0, 0.92, -3.6], c: grey }); // bumper
  b.box('dark', 1.3, 0.36, 0.02, { p: [0, 1.42, -3.76] }); // grille
  for (let k = 0; k < 4; k++) b.box('steel', 1.3, 0.025, 0.03, { p: [0, 1.29 + k * 0.09, -3.765] });
  for (const sx of [-1, 1]) {
    b.box(sx < 0 ? 'dark' : 'glass', 0.24, 0.16, 0.02, { p: [sx * 0.95, 1.4, -3.762] });
    b.box('dark', 0.012, 1.3, 0.012, { p: [sx * 1.204, 1.8, -2.3] });
    b.box('rust', 0.3, 0.05, 0.6, { p: [sx * 1.08, 0.72, -2.7] }); // step
  }
  b.box('taillight', 0.5, 0.1, 0.2, { p: [0, 2.66, -2.9] }); // beacon bar
  // tank: an ellipse in section, domed ends, a walkway and two hatches on top
  b.cyl('carpaint', 1, 1, 4.9, 16, { p: [0, 1.95, 0.75], r: [PI / 2, 0, 0], s: [1.2, 1, 0.88], c: yel });
  for (const sz of [-1, 1]) b.sphere('carpaint', 1, 16, 5, { thetaLen: PI / 2, p: [0, 1.95, 0.75 + sz * 2.45], r: [sz * PI / 2, 0, 0], s: [1.2, 0.3, 0.88], c: yel });
  b.box('steel', 0.6, 0.03, 4.6, { p: [0, 2.84, 0.75] });
  for (const z of [-0.6, 2.0]) b.cyl('rust', 0.26, 0.26, 0.06, 10, { p: [0, 2.86, z] });
  for (const sx of [-1, 1]) {
    label(b, 'stencil', 'flammable', 1.8, 0.8, [sx * 1.205, 2.0, 0.6], sx < 0 ? 'x-' : 'x+');
    b.box('rust', 0.01, 0.5 + r() * 0.4, 0.7, { p: [sx * 1.2, 1.4, -0.6 + r() * 2.4] });
    b.box('rust', 0.8, 0.06, 5.0, { p: [sx * 0.8, 1.06, 0.75] }); // the tank's cradle
  }
  // the pump cabinet at the back: a reel of hose, the hose run out and dropped beside the truck
  b.box('carpaint', 2.4, 1.3, 0.8, { p: [0, 1.6, 3.38], c: grey });
  b.box('dark', 1.5, 0.9, 0.02, { p: [0, 1.6, 3.785] });
  b.tube('rubber', [[-0.5, 1.2, 3.72], [-0.9, 0.5, 3.7], [-1.1, 0.06, 3.3], [-1.15, 0.05, 2.2], [-0.9, 0.05, 1.4]], 0.035, 12, 5);
  for (const sx of [-1, 1]) b.box('taillight', 0.2, 0.12, 0.02, { p: [sx * 0.95, 1.1, 3.785] });
  // axles and wheels: one steering axle, a pair behind (a tyre flat)
  for (const [z, x, flat] of [[-2.7, -0.98, 0], [-2.7, 0.98, 0.3], [1.5, -0.98, 0], [1.5, 0.98, 0], [2.75, -0.98, 0.1], [2.75, 0.98, 0]]) b.group({ p: [x, wr - flat * 0.12, z] }, () => bigTire(b, wr, 0.42, yel, flat));
  for (const z of [-2.7, 1.5, 2.75]) b.box('rust', 2.0, 0.18, 0.22, { p: [0, 0.52, z] });
  weeds(b, r, [[1.1, -1.2], [-1.1, 0.4], [1.0, 3.4], [-0.5, -3.6]], 0.55);
};

// A car the fire had: the shell on its rims, soot and rust for paint, no glass.
VEHICLE_PROPS.car_burnt = (b, r, v) => {
  b.push([0, 0, 0], [0, 0, 0], [1, 1, 4.42 / 4.66]);
  sedan(b, r, {
    color: v ? [0.16, 0.1, 0.07] : [0.1, 0.09, 0.085],
    sink: 0.14,
    smashed: true,
    noPlates: true,
    noMirrorR: true,
    wheels: { fl: 'rim', fr: 'rim', rl: 'rim', rr: v ? 'gone' : 'rim' },
    glass: ['gone', 'gone', 'gone', 'gone', 'gone', 'gone'],
    burnt: true,
  });
  b.pop();
  for (let k = 0; k < 4; k++) b.box('charred', rr(r, 0.2, 0.5), 0.03, rr(r, 0.15, 0.4), { p: [rr(r, -0.7, 0.7), 0.02, rr(r, -1.9, 1.9)], r: [0, r() * 3, 0] });
};

// An articulated lorry jack-knifed across the road: the trailer along Z, the tractor slewed off to one side at its
// nose (-Z). The second kind burnt out: the trailer's skin gone to its ribs, everything soot.
VEHICLE_PROPS.semi_truck = (b, r, v) => {
  const burnt = v === 1;
  const body = burnt ? [0.13, 0.11, 0.1] : [0.62, 0.6, 0.55], cabc = burnt ? [0.12, 0.1, 0.09] : [0.34, 0.16, 0.13];
  const wr = 0.52;
  b.push([1.1, 0, 0.75]); // (so that the two of them together stand round the prop's origin)
  // the trailer: a box van on a frame, two axles at the back, its legs down at the front
  for (const sx of [-1, 1]) b.box('rust', 0.14, 0.26, 12.4, { p: [sx * 0.5, 1.14, 1.5] });
  if (burnt) {
    b.box('charred', 2.5, 0.08, 12.4, { p: [0, 1.31, 1.5] });
    for (let k = 0; k < 9; k++) {
      const z = -4.4 + k * 1.5;
      for (const sx of [-1, 1]) b.box('rust', 0.06, 2.5, 0.06, { p: [sx * 1.24, 2.6, z], r: [0, 0, sx * rr(r, -0.04, 0.1)] });
      if (k % 2 === 0) b.box('rust', 2.5, 0.06, 0.06, { p: [0, 3.82, z] });
    }
    b.box('charred', 2.5, 2.5, 0.06, { p: [0, 2.6, -4.68] });
    b.box('ash', 2.3, 0.3, 11.8, { p: [0, 1.5, 1.5] });
  } else {
    b.box('paint', 2.55, 2.6, 12.4, { p: [0, 2.6, 1.5], c: body });
    for (const sx of [-1, 1]) {
      b.box('rust', 0.012, rr(r, 0.5, 0.9), rr(r, 2, 4), { p: [sx * 1.281, 1.75, rr(r, -1, 4)] });
      label(b, 'stencil', 'numbers', 2.4, 0.9, [sx * 1.282, 3.0, 1.0], sx < 0 ? 'x-' : 'x+');
    }
    b.box('dark', 2.3, 2.4, 0.02, { p: [0.0, 2.6, 7.705] }); // the doors
  }
  for (const z of [5.6, 6.9]) {
    b.box('rust', 2.2, 0.16, 0.2, { p: [0, wr, z] });
    for (const x of [-1.05, 1.05]) b.group({ p: [x, wr, z] }, () => bigTire(b, wr, 0.5, [0.3, 0.3, 0.3], burnt ? 0.5 : x > 0 && z > 6 ? 0.3 : 0, !burnt));
  }
  for (const sx of [-1, 1]) b.box('rust', 0.1, 1.05, 0.1, { p: [sx * 0.6, 0.52, -2.6] });
  // the tractor, turned out to the left of the trailer's nose about its fifth wheel
  b.group({ p: [0, 0, -4.2], r: [0, 0.6, 0] }, () => {
    for (const sx of [-1, 1]) b.box('rust', 0.14, 0.26, 5.4, { p: [sx * 0.45, 0.92, -1.6] });
    b.cyl('rust', 0.5, 0.5, 0.08, 10, { p: [0, 1.12, 0] }); // the fifth wheel
    // the cab: a shell - the screen and a window in each door; the seats, and the bunk behind them. Burnt: no
    // glass, and what the fire left
    const gw = burnt ? 'gone' : undefined;
    boxShell(b, 'carpaint', 2.4, 2.3, 2.1, {
      p: [0, 2.2, -2.6], c: cabc, t: 0.05, lining: burnt ? CHAR : LINING, look: (k) => paneLook(0.55, k),
      holes: { zn: [[-1.0, 1.0, 0.19, 0.91, gw]], xn: [[-0.75, -0.05, 0.2, 0.86, gw]], xp: [[-0.75, -0.05, 0.2, 0.86, burnt ? 'gone' : 'shard']] },
    });
    deck(b, 0, 1.96, -2.6, 2.28, 1.98, burnt ? CHAR : undefined);
    if (burnt) {
      for (const sx of [-1, 1]) burntSeat(b, sx * 0.62, 1.96, -3.0, { h: 0.3 });
      b.box('cabin_fine', 2.2, 0.3, 0.24, { p: [0, 2.3, -3.48], c: CHAR });
    } else {
      for (const sx of [-1, 1]) seat(b, sx * 0.62, 1.96, -3.0, { w: 0.56, h: 0.3, bh: 0.56, d: 0.46, c: SEATS[5] });
      dash(b, 2.42, -3.62, 2.26, { d: 0.26, h: 0.4, wheelX: -0.62 });
      steering(b, [-0.62, 2.5, -3.28], { R: 0.22, tilt: 0.8 });
      b.box('cabin_fine', 2.2, 0.4, 0.8, { p: [0, 2.16, -2.02], c: [0.24, 0.22, 0.2] }); // the bunk
      b.box('cabin_fine', 1.6, 0.07, 0.7, { p: [0.2, 2.4, -2.02], r: [0, 0.04, 0.02], c: [0.34, 0.2, 0.16] });
      b.box('cabin_fine', 0.4, 0.1, 0.3, { p: [-0.8, 2.42, -2.02], c: [0.52, 0.5, 0.44] });
      rubbish(b, [0.62, 2.265, -3.0], 0.4, 0.3, 3, 9);
    }
    b.box('carpaint', 2.2, 1.2, 1.5, { p: [0, 1.65, -4.3], c: cabc }); // bonnet
    b.box(burnt ? 'charred' : 'chrome', 1.6, 0.9, 0.04, { p: [0, 1.62, -5.07] }); // grille
    b.box(burnt ? 'rust' : 'chrome', 2.4, 0.3, 0.2, { p: [0, 0.82, -5.1] });
    for (const sx of [-1, 1]) {
      b.cyl(burnt ? 'rust' : 'chrome', 0.07, 0.07, 2.4, 6, { p: [sx * 1.12, 2.6, -1.5] }); // stacks
      b.cyl('rust', 0.3, 0.3, 1.3, 8, { p: [sx * 1.0, 0.9, -1.8], r: [PI / 2, 0, 0] }); // tanks
      b.group({ p: [sx * 1.05, wr, -4.2] }, () => bigTire(b, wr, 0.4, [0.3, 0.3, 0.3], burnt ? 0.5 : 0, !burnt));
      for (const z of [-0.5, 0.75]) b.group({ p: [sx * 1.05, wr, z] }, () => bigTire(b, wr, 0.5, [0.3, 0.3, 0.3], burnt ? 0.5 : 0, !burnt));
    }
  });
  weeds(b, r, [[1.1, 2.0], [-1.1, 5.0], [0.9, -3.0]], 0.55);
  b.pop();
};

// The airfield's crash tender, cab to -Z: a big square body on six wheels, faded red over yellow, a monitor on the
// roof, hose lockers down its sides, ladders on top.
VEHICLE_PROPS.fire_truck = (b, r) => {
  const red = [0.5, 0.14, 0.1], yel = [0.66, 0.56, 0.16];
  const wr = 0.62;
  b.box('rust', 1.1, 0.3, 7.6, { p: [0, 1.0, 0] });
  // the cab: a shell - a deep screen, a long window each side; the crew's seats in two rows, their helmets on the dash
  boxShell(b, 'carpaint', 2.5, 2.1, 2.3, {
    p: [0, 2.2, -2.85], c: red, t: 0.05, look: (k) => paneLook(0.45, k),
    holes: { zn: [[-1.05, 1.05, -0.01, 0.81]], xn: [[-0.7, 0.4, 0.04, 0.76]], xp: [[-0.7, 0.4, 0.04, 0.76]] },
  });
  deck(b, 0, 1.9, -2.85, 2.38, 2.18);
  for (const sx of [-1, 1]) seat(b, sx * 0.7, 1.9, -3.3, { w: 0.56, h: 0.34, bh: 0.56, d: 0.46, c: SEATS[0] });
  seat(b, 0, 1.9, -2.4, { w: 2.0, h: 0.34, bh: 0.56, d: 0.44, c: SEATS[0], heads: 0 });
  dash(b, 2.42, -3.94, 2.36, { d: 0.26, h: 0.44, wheelX: -0.7 });
  steering(b, [-0.7, 2.5, -3.6], { R: 0.22, tilt: 0.8 });
  for (const [x, c] of [[0.3, [0.66, 0.56, 0.16]], [0.74, [0.6, 0.5, 0.14]]]) b.sphere('cabin_fine', 0.13, 7, 4, { p: [x, 2.43, -3.8], thetaLen: PI / 2, c });
  b.box('cabin_fine', 0.5, 0.36, 0.2, { p: [0.5, 2.44, -2.36], r: [0.2, 0.2, 0], c: [0.3, 0.26, 0.14] }); // a coat left on the back seat
  b.box('carpaint', 2.5, 1.0, 5.4, { p: [0, 1.65, 1.2], c: yel }); // lockers
  b.box('carpaint', 2.5, 1.0, 5.4, { p: [0, 2.65, 1.2], c: red }); // tank
  b.box('carpaint', 2.5, 0.4, 0.3, { p: [0, 1.0, -4.0], c: yel }); // bumper
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) b.box('steel', 0.012, 0.8, 1.1, { p: [sx * 1.256, 1.65, -0.8 + k * 1.3] }); // roller shutters
    b.box('rust', 0.012, rr(r, 0.3, 0.7), rr(r, 1, 2), { p: [sx * 1.257, 2.5, rr(r, 0, 2.6)] });
    b.box('taillight', 0.22, 0.14, 0.02, { p: [sx * 0.95, 1.4, 3.906] });
    b.box('glass', 0.3, 0.2, 0.02, { p: [sx * 0.9, 1.4, -4.006] });
    for (const z of [-2.9, 1.4, 2.85]) b.group({ p: [sx * 1.0, wr, z] }, () => bigTire(b, wr, 0.5, red, sx > 0 && z > 2 ? 0.3 : 0));
    plank(b, 'wood', 0.06, 0.06, 4.2, { p: [sx * 0.5, 3.22, 1.4], c: WOODS[1] });
  }
  for (let k = 0; k < 8; k++) plank(b, 'wood', 1.0, 0.04, 0.05, { p: [0, 3.22, -0.4 + k * 0.5], c: WOODS[1] });
  // the monitor, and the beacons
  b.cyl('steel', 0.12, 0.14, 0.2, 8, { p: [0, 3.19, -1.2] });
  b.cylBetween('steel', [0, 3.22, -1.2], [0, 3.0, -2.3], 0.06, 0.05, 6);
  b.box('taillight', 1.4, 0.14, 0.24, { p: [0, 3.2, -3.2] });
  label(b, 'stencil', 'numbers', 1.0, 0.4, [-1.258, 2.75, 1.4], 'x-');
  label(b, 'stencil', 'numbers', 1.0, 0.4, [1.258, 2.75, 1.4], 'x+');
  weeds(b, r, [[1.1, -1.2], [-1.1, 2.4]], 0.55);
};
