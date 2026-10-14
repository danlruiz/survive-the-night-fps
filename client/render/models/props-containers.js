// The island's props that are searched: bags, lockers, cabinets, a toolbox, a fridge, and Mercy Clinic's medicine
// cabinet, drug locker and wheelchair. Builders as in props.js: (b, r, v) with b a
// MeshBuilder, r a seeded rng, v the variant; origin at ground centre of the footprint, front to -Z.
import { rr, WOODS, label, plank } from './propkit.js';

const PI = Math.PI;

export const CONTAINER_VARIANTS = {
  duffel_bag: 3, locker: 2, cabinet: 2, toolbox: 1, fridge: 2, medicine_cabinet: 1, drug_locker: 1, wheelchair: 1,
};
export const CONTAINER_PROPS = {};

/** close a loft end: fan from the ring of section `sec` to a (bulged) centre point */
function loftCap(b, mat, sec, profile, N, bulge, o = {}) {
  const ring = [];
  for (let k = 0; k <= N; k++) {
    const [px, py] = profile(k / N, sec);
    ring.push([px * sec.w * 0.5 + (sec.x || 0), py * sec.h * 0.5 + (sec.y || 0), sec.z]);
  }
  const c = [sec.x || 0, sec.y || 0, sec.z + bulge];
  const verts = [c, ...ring];
  const faces = [];
  for (let k = 1; k <= N; k++) faces.push(bulge < 0 ? [0, k + 1, k] : [0, k, k + 1]);
  b.poly(mat, verts, faces, o);
}

// ------------------------------------------------------------------ searchable containers
const BAG_COLS = [[0.36, 0.38, 0.24], [0.15, 0.15, 0.16], [0.2, 0.26, 0.38]];

CONTAINER_PROPS.duffel_bag = (b, r, v) => {
  const col = BAG_COLS[v % 3];
  const trim = col.map((c) => c * 0.62);
  // soft padded body, built along Z then turned so the long axis runs along X
  const prof = (t) => {
    const a = t * PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** 0.72, Math.max(-0.84, Math.sign(s) * Math.abs(s) ** 0.8)];
  };
  const L = 0.76, W0 = 0.38, H0 = 0.31, yc = 0.132;
  const ts = [0, 0.03, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97, 1];
  const secs = ts.map((t) => {
    const e = Math.sqrt(Math.max(0, 1 - Math.abs(2 * t - 1) ** 6));
    const sag = 1 - 0.13 * Math.sin(t * PI) * (t > 0.4 ? 1.2 : 0.8); // half-empty: the middle slumps
    return { z: -L / 2 + t * L, w: Math.max(0.02, W0 * e * (1 + 0.05 * Math.sin(t * PI))), h: Math.max(0.02, H0 * e * sag), y: yc - (1 - sag) * 0.1 };
  });
  const N = 10;
  b.push([0, 0, 0], [0, PI / 2, 0]);
  b.loft('cloth', secs, prof, N, { c: col, flip: true });
  loftCap(b, 'cloth', secs[0], prof, N, -0.012, { c: trim });
  loftCap(b, 'cloth', secs[secs.length - 1], prof, N, 0.012, { c: trim });
  // two webbing bands around the body
  for (const t of [0.3, 0.7]) {
    const s = secs[ts.indexOf(t)];
    b.loft('cloth', [-0.022, 0.022].map((dz) => ({ ...s, z: s.z + dz, w: s.w * 1.04, h: s.h * 1.04 })), prof, N, { c: trim, flip: true });
  }
  const topAt = (t) => {
    const s = secs.reduce((a, c) => (Math.abs(c.z - (-L / 2 + t * L)) < Math.abs(a.z - (-L / 2 + t * L)) ? c : a));
    return s.y + s.h / 2;
  };
  // zipper: closed half + open slit showing the dark inside and a crumpled shirt
  const zipPts = [];
  for (const t of [0.1, 0.2, 0.3, 0.4, 0.5]) zipPts.push([0, topAt(t) + 0.002, -L / 2 + t * L]);
  b.tube('rubber', zipPts, 0.0045, 6, 3);
  b.box('steel', 0.018, 0.006, 0.03, { p: [0.012, topAt(0.5) + 0.004, -L / 2 + 0.5 * L], r: [0, 0.4, 0.2] });
  b.sphere('dark', 0.5, 8, 4, { p: [0, topAt(0.7) - 0.018, -L / 2 + 0.7 * L], s: [0.075, 0.03, 0.3] });
  b.sphere('cloth', 0.5, 7, 4, { p: [0.01, topAt(0.66) - 0.004, -L / 2 + 0.66 * L], s: [0.07, 0.035, 0.1], r: [0.2, 0.3, 0], c: v === 1 ? [0.5, 0.18, 0.14] : [0.62, 0.58, 0.5] });
  for (const sx of [-1, 1]) b.box('cloth', 0.012, 0.018, 0.2, { p: [sx * 0.04, topAt(0.7) - 0.004, -L / 2 + 0.7 * L], r: [0, 0, sx * 0.5], c: trim });
  // carry handles flopped over the top
  for (const z of [-0.07, 0.07]) {
    const y = topAt(0.5);
    b.tube('cloth', [[-0.13, y - 0.07, z], [-0.08, y + 0.01, z], [0.0, y + 0.035, z + 0.01], [0.07, y + 0.02, z], [0.12, y - 0.05, z]], 0.011, 8, 4, { c: trim });
  }
  // end loop + side pocket
  b.torus('cloth', 0.03, 0.007, 3, 8, PI, { p: [0, secs[1].y + 0.02, -L / 2 - 0.004], r: [0, PI / 2, 0], c: trim });
  b.box('cloth', 0.02, 0.1, 0.16, { p: [W0 / 2 - 0.004, yc, -0.1], r: [0, 0, -0.08], c: col.map((c) => c * 0.9) });
  b.pop();
  // shoulder strap lying on the ground
  b.tube('cloth', [[-0.36, 0.17, 0.03], [-0.34, 0.03, -0.14], [-0.15, 0.008, -0.22], [0.1, 0.008, -0.2], [0.3, 0.012, -0.18], [0.37, 0.12, -0.03]], 0.012, 14, 4, { c: trim, s: [1, 1, 1] });
};

const LOCKER_COLS = [[0.44, 0.5, 0.45], [0.34, 0.42, 0.52]];

CONTAINER_PROPS.locker = (b, r, v) => {
  const col = LOCKER_COLS[v];
  const inner = col.map((c) => c * 0.42);
  const W = 0.94, H = 1.88, D = 0.48, y0 = 0.05, t = 0.02;
  const hy = y0 + (H - y0) / 2, hh = H - y0;
  const zf = -D / 2;
  b.box('dark', W - 0.06, y0, D - 0.06, { p: [0, y0 / 2, 0.01] }); // plinth
  // shell: back, sides, top, bottom, divider
  b.box('paint', W, hh, t, { p: [0, hy, D / 2 - t / 2], c: col });
  for (const sx of [-1, 1]) b.box('paint', t, hh, D, { p: [sx * (W / 2 - t / 2), hy, 0], c: col });
  b.box('paint', W, t, D, { p: [0, H - t / 2, 0], c: col });
  b.box('paint', W, t, D, { p: [0, y0 + t / 2, 0], c: col });
  b.box('paint', t, hh, D, { p: [0, hy, 0], c: col });
  // shadowed interior of the right compartment (door ajar)
  const cx = W / 4;
  b.box('paint', W / 2 - t * 1.5, hh - t * 2, 0.01, { p: [cx, hy, D / 2 - t - 0.006], c: inner });
  for (const sx of [-1, 1]) b.box('paint', 0.006, hh - t * 2, D - t, { p: [cx + sx * (W / 4 - t * 0.8), hy, 0], c: inner.map((c) => c * 1.2) });
  b.box('paint', W / 2 - t * 1.5, 0.006, D - t, { p: [cx, H - t - 0.004, 0], c: inner.map((c) => c * 0.7) });
  b.box('steel', W / 2 - t * 1.5, 0.015, D - 0.05, { p: [cx, 1.56, 0.01] }); // hat shelf
  b.box('cardboard', 0.22, 0.14, 0.26, { p: [cx + 0.04, 1.64, 0.04], r: [0, 0.2, 0] });
  // hanging jacket + boots on the floor
  b.cylBetween('steel', [cx, 1.5, 0.0], [cx, 1.44, -0.02], 0.006, 0.006, 3);
  b.group({ p: [cx - 0.02, 1.43, -0.02], r: [0.06, 0.25, 0.04] }, () => {
    b.frustum('cloth', 0.34, 0.1, 0.3, 0.09, -0.62, 0, { c: [0.3, 0.26, 0.18] });
    for (const sx of [-1, 1]) b.cylBetween('cloth', [sx * 0.14, -0.04, 0], [sx * 0.16, -0.5, 0.02], 0.045, 0.04, 5, { c: [0.27, 0.23, 0.16] });
  });
  for (const x of [cx - 0.08, cx + 0.08]) b.box('rubber', 0.1, 0.12, 0.26, { p: [x, y0 + t + 0.06, 0.02], r: [0, x > cx ? 0.2 : -0.1, 0] });
  // door: panel + louvres + handle + number plate. Built from its hinge (local x=0) toward dir.
  const dw = W / 2 - 0.02, dh = hh - 0.06;
  const door = (dir, hasLock) => {
    const cxl = (dir * dw) / 2;
    b.box('paint', dw, dh, 0.018, { p: [cxl, 0, 0], c: col.map((c) => c * 1.04) });
    b.box('paint', dw - 0.06, 0.012, 0.012, { p: [cxl, dh / 2 - 0.02, -0.012], c: col });
    b.box('paint', dw - 0.06, 0.012, 0.012, { p: [cxl, -dh / 2 + 0.02, -0.012], c: col });
    for (const vy of [dh / 2 - 0.12, -dh / 2 + 0.14])
      for (let k = 0; k < 5; k++) b.plane('dark', dw * 0.6, 0.011, { p: [cxl, vy - k * 0.028, -0.0095], r: [0, PI, 0] });
    const hx = dir * (dw - 0.05);
    b.box('chrome', 0.03, 0.12, 0.02, { p: [hx, 0.05, -0.018] });
    if (hasLock) {
      b.box('steel', 0.04, 0.05, 0.012, { p: [hx, -0.05, -0.014] });
      b.torus('steel', 0.018, 0.004, 3, 8, PI * 2, { p: [hx, -0.1, -0.026] });
    }
    b.plane('labels', 0.08, 0.04, { atlas: 'plate', p: [cxl, dh / 2 - 0.3, -0.0095], r: [0, PI, 0] });
    // the inside of the door (seen when it hangs open)
    b.box('paint', dw - 0.04, dh - 0.04, 0.01, { p: [cxl, 0, 0.012], c: inner.map((c) => c * 1.5) });
  };
  // left door closed (hinge on the outer left edge), slightly dented
  b.group({ p: [-W / 2 + 0.012, hy, zf - 0.012], r: [0.006, 0, 0.004] }, () => door(1, true));
  b.box('dark', 0.004, hh - 0.04, 0.004, { p: [0, hy, zf - 0.004] });
  // right door hanging ajar on its right-hand hinge
  b.group({ p: [W / 2 - 0.012, hy, zf - 0.01], r: [0, -1.05, 0] }, () => door(-1, false));
  for (const x of [-0.18, 0.2]) b.box('dark', 0.1, 0.004, 0.08, { p: [x, H + 0.002, 0.05], r: [0, r() * 2, 0] });
  if (v === 0) b.box('cardboard', 0.34, 0.14, 0.3, { p: [-0.18, H + 0.07, 0.02], r: [0, 0.25, 0] });
  else b.box('cloth', 0.3, 0.05, 0.3, { p: [0.2, H + 0.025, 0.04], r: [0, -0.4, 0], c: [0.3, 0.32, 0.26] });
};

CONTAINER_PROPS.cabinet = (b, r, v) => {
  const col = v ? [0.5, 0.62, 0.52] : [0.8, 0.74, 0.58];
  const W = 1.2, H = 0.9, D = 0.55, kick = 0.08;
  const zf = -D / 2 + 0.03;
  b.box('dark', W - 0.1, kick, D - 0.1, { p: [0, kick / 2, 0.04] });
  b.box('paint', W, H - kick - 0.035, D - 0.03, { p: [0, kick + (H - kick - 0.035) / 2, 0.015], c: col });
  plank(b, 'wood', W + 0.03, 0.035, D + 0.02, { p: [0, H - 0.0175, 0], c: WOODS[4].map((c) => c * 0.9) });
  // shadowed openings behind the pulled drawer / open door
  b.box('dark', 0.54, 0.15, 0.004, { p: [0.29, 0.75, zf - 0.001] });
  b.box('dark', 0.54, 0.5, 0.004, { p: [-0.29, 0.36, zf - 0.001] });
  const face = (w, h, framed) => {
    b.box('paint', w, h, 0.02, { c: col.map((c) => c * 1.05) });
    if (framed) {
      const f = col.map((c) => c * 0.86);
      for (const sy of [-1, 1]) b.box('paint', w - 0.08, 0.025, 0.012, { p: [0, sy * (h / 2 - 0.05), -0.014], c: f });
      for (const sx of [-1, 1]) b.box('paint', 0.025, h - 0.08, 0.012, { p: [sx * (w / 2 - 0.05), 0, -0.014], c: f });
    }
  };
  const knob = (p) => b.cyl('chrome', 0.014, 0.012, 0.025, 6, { p, r: [PI / 2, 0, 0] });
  // drawers: left closed, right pulled out
  b.group({ p: [-0.29, 0.75, zf - 0.01] }, () => {
    face(0.55, 0.16, false);
    knob([0, 0, -0.022]);
  });
  const out = 0.16;
  b.group({ p: [0.29, 0.75, zf - 0.01 - out], r: [0, 0.03, 0] }, () => {
    face(0.55, 0.16, false);
    knob([0, 0, -0.022]);
    for (const sx of [-1, 1]) b.box('wood', 0.015, 0.12, 0.34, { p: [sx * 0.25, -0.01, 0.18], c: col.map((c) => c * 0.8) });
    b.box('dark', 0.48, 0.005, 0.3, { p: [0, -0.05, 0.17] });
    b.box('paint', 0.1, 0.04, 0.06, { p: [0.08, -0.03, 0.1], r: [0, 0.4, 0], c: [0.7, 0.62, 0.3] });
  });
  // doors: right closed, left ajar
  b.group({ p: [0.29, 0.36, zf - 0.01] }, () => {
    face(0.55, 0.5, true);
    knob([-0.22, 0.14, -0.022]);
  });
  b.group({ p: [-0.565, 0.36, zf - 0.01], r: [0, 0.55, 0] }, () => {
    b.group({ p: [0.275, 0, 0] }, () => {
      face(0.55, 0.5, true);
      knob([0.22, 0.14, -0.022]);
    });
  });
  // clutter on top
  b.cyl('paint', 0.06, 0.06, 0.14, 8, { p: [0.35, H + 0.07, 0.05], c: [0.62, 0.2, 0.12] });
  b.cyl('bottle', 0.035, 0.04, 0.24, 6, { p: [0.15, H + 0.12, 0.12] });
  b.box('cloth', 0.26, 0.012, 0.2, { p: [-0.3, H + 0.006, 0.0], r: [0, 0.4, 0], c: [0.55, 0.5, 0.4] });
  if (v === 0) b.box('cardboard', 0.3, 0.2, 0.26, { p: [-0.25, H + 0.1, 0.08], r: [0, -0.2, 0] });
};

CONTAINER_PROPS.toolbox = (b, r) => {
  const red = [0.62, 0.11, 0.08];
  b.box('paint', 0.52, 0.17, 0.25, { p: [0, 0.09, 0], c: red });
  b.box('rust', 0.5, 0.008, 0.23, { p: [0, 0.004, 0] });
  b.frustum('paint', 0.53, 0.26, 0.49, 0.17, 0.176, 0.225, { c: red.map((c) => c * 1.05) });
  b.box('dark', 0.535, 0.008, 0.262, { p: [0, 0.174, 0] });
  for (const sx of [-1, 1]) {
    b.box('chrome', 0.035, 0.05, 0.012, { p: [sx * 0.17, 0.17, -0.131] });
    b.box('steel', 0.03, 0.05, 0.03, { p: [sx * 0.12, 0.245, 0] });
    b.box('rust', 0.02, 0.02, 0.255, { p: [sx * 0.255, 0.012, 0] }); // rusty feet rails
  }
  b.cyl('steel', 0.011, 0.011, 0.28, 6, { p: [0, 0.272, 0], r: [0, 0, PI / 2] });
  b.cyl('rubber', 0.017, 0.017, 0.15, 6, { p: [0, 0.272, 0], r: [0, 0, PI / 2] });
  // screwdriver + wrench on the lid
  b.cylBetween('steel', [-0.2, 0.232, 0.05], [-0.02, 0.232, 0.08], 0.004, 0.004, 4);
  b.cylBetween('paint', [-0.02, 0.232, 0.08], [0.07, 0.234, 0.095], 0.011, 0.011, 6, { c: [0.8, 0.62, 0.1] });
  b.box('steel', 0.2, 0.006, 0.022, { p: [0.08, 0.229, -0.05], r: [0, -0.3, 0] });
  b.torus('steel', 0.017, 0.006, 3, 7, PI * 1.5, { p: [0.175, 0.229, -0.08], r: [PI / 2, 0, 0.6] });
  label(b, 'stencil', 'bullet', 0.03, 0.03, [0.1, 0.1, -0.1255], 'z-');
};

CONTAINER_PROPS.fridge = (b, r, v) => {
  const col = [0.8, 0.78, 0.68];
  const W = 0.78, D = 0.64, H = 1.78, y0 = 0.08;
  const zf = -D / 2 + 0.02;
  b.box('dark', W - 0.06, y0, D - 0.06, { p: [0, y0 / 2, 0.02] });
  for (let k = 0; k < 4; k++) b.box('steel', W - 0.1, 0.01, 0.01, { p: [0, 0.018 + k * 0.018, -D / 2 + 0.05] });
  const bh = H - y0 - 0.05, by = y0 + bh / 2;
  if (v === 1) {
    // hollow shell: the main compartment is open
    b.box('paint', W, bh, 0.03, { p: [0, by, D / 2 + 0.005], c: col });
    for (const sx of [-1, 1]) b.box('paint', 0.03, bh, D, { p: [sx * (W / 2 - 0.015), by, 0.02], c: col });
    b.box('paint', W, 0.04, D, { p: [0, y0 + 0.02, 0.02], c: col });
    b.box('paint', W, 0.48, D, { p: [0, 1.5, 0.02], c: col });
  } else b.box('paint', W, bh, D, { p: [0, by, 0.02], c: col });
  // rounded crown
  b.cyl('paint', 0.05, 0.05, W, 8, { p: [0, H - 0.05, zf + 0.05], r: [0, 0, PI / 2], c: col, theta: [PI, PI / 2] });
  b.box('paint', W, 0.05, D - 0.05, { p: [0, H - 0.025, 0.045], c: col });
  // coil grille on the back + power cord
  b.box('dark', W - 0.12, H - 0.4, 0.02, { p: [0, 0.95, D / 2 + 0.03] });
  b.tube('rubber', [[0.25, 0.3, D / 2 + 0.03], [0.3, 0.1, D / 2 + 0.08], [0.2, 0.01, D / 2 + 0.2]], 0.008, 6, 3);
  // freezer door (top) + fridge door
  const doorF = (h, handleY, handleL) => {
    b.box('paint', W - 0.01, h, 0.05, { p: [0, 0, -0.025], c: col.map((c) => c * 1.03) });
    b.box('rubber', W - 0.03, 0.012, 0.012, { p: [0, -h / 2 + 0.006, 0.003] });
    b.box('rubber', W - 0.03, 0.012, 0.012, { p: [0, h / 2 - 0.006, 0.003] });
    const hx = -W / 2 + 0.06;
    b.cylBetween('chrome', [hx, handleY - handleL / 2, -0.085], [hx, handleY + handleL / 2, -0.085], 0.014, 0.014, 6);
    for (const s of [-1, 1]) b.box('chrome', 0.03, 0.03, 0.04, { p: [hx, handleY + s * handleL * 0.4, -0.065] });
  };
  b.group({ p: [0, 1.5, zf] }, () => {
    doorF(0.46, -0.1, 0.18);
    b.box('chrome', 0.16, 0.035, 0.008, { p: [0.12, 0.15, -0.054] }); // badge
  });
  b.box('dark', W, 0.02, 0.03, { p: [0, 1.26, zf - 0.01] });
  if (v === 1) {
    // main door hanging open on its right hinge: rotten interior
    const iz = zf + 0.01;
    b.box('paint', W - 0.06, 1.1, 0.01, { p: [0, 0.68, D / 2 - 0.04], c: [0.3, 0.3, 0.26] });
    for (const sx of [-1, 1]) b.box('paint', 0.01, 1.1, D - 0.1, { p: [sx * (W / 2 - 0.035), 0.68, 0.02], c: [0.45, 0.44, 0.38] });
    b.box('paint', W - 0.06, 0.01, D - 0.1, { p: [0, 1.23, 0.02], c: [0.4, 0.4, 0.35] });
    b.box('paint', W - 0.06, 0.01, D - 0.1, { p: [0, 0.14, 0.02], c: [0.25, 0.24, 0.2] });
    for (const y of [0.5, 0.86]) b.box('steel', W - 0.08, 0.008, D - 0.14, { p: [0, y, 0.04] });
    b.cyl('bottle', 0.035, 0.035, 0.22, 6, { p: [-0.2, 0.62, 0.1] });
    b.cyl('paint', 0.05, 0.05, 0.1, 7, { p: [0.15, 0.56, 0.0], c: [0.6, 0.5, 0.2] });
    b.box('cardboard', 0.18, 0.2, 0.1, { p: [0.12, 0.97, 0.12] });
    b.sphere('blood', 0.06, 6, 3, { p: [-0.1, 0.9, -0.02], s: [1.6, 0.4, 1.2] });
    b.group({ p: [W / 2, 0.66, iz], r: [0, -1.25, 0] }, () => {
      b.group({ p: [-W / 2 + 0.005, 0, 0] }, () => doorF(1.12, 0.3, 0.3));
      b.box('paint', W - 0.08, 1.02, 0.02, { p: [-W / 2 + 0.005, 0, 0.012], c: [0.66, 0.64, 0.56] });
      for (const y of [-0.3, 0.1]) b.box('plastic', W - 0.12, 0.08, 0.07, { p: [-W / 2, y, 0.05] });
    });
  } else {
    b.group({ p: [0, 0.66, zf] }, () => doorF(1.12, 0.3, 0.3));
    b.plane('blood_decal', 0.34, 0.5, { raw: true, p: [0.12, 0.62, zf - 0.052], r: [0, PI, 0.3] });
  }
  // rust streaks creeping up from the base
  for (const x of [-0.3, 0.1, 0.33]) b.box('rust', 0.05 + r() * 0.04, 0.12 + r() * 0.12, 0.004, { p: [x, y0 + 0.08, -D / 2 + 0.018] });
  b.box('cardboard', 0.3, 0.02, 0.24, { p: [0.05, H + 0.01, 0.05], r: [0, 0.3, 0] });
};

// ---- Mercy Clinic (shared/clinic.js)
// medicine cabinet: white enamelled steel, drawers below, two doors above - one shut with a red cross on it, the
// other hanging open on what is left on the shelves (front: -z)
CONTAINER_PROPS.medicine_cabinet = (b, r) => {
  const white = [0.86, 0.87, 0.82];
  const W = 0.9, H = 1.8, D = 0.45, zf = -D / 2;
  b.box('dark', W - 0.08, 0.08, D - 0.08, { p: [0, 0.04, 0.02] }); // plinth
  b.box('paint', W, 0.62, D, { p: [0, 0.39, 0], c: white });
  for (const y of [0.25, 0.55]) {
    b.box('paint', W - 0.08, 0.24, 0.02, { p: [0, y, zf - 0.008], c: white.map((c) => c * 1.04) });
    b.box('chrome', 0.3, 0.025, 0.03, { p: [0, y + 0.05, zf - 0.03] });
  }
  // upper case: back, sides, top, shelves
  const y0 = 0.7, dy = (y0 + H) / 2, dh = H - y0;
  b.box('paint', W, dh, 0.02, { p: [0, dy, D / 2 - 0.01], c: white });
  for (const sx of [-1, 1]) b.box('paint', 0.025, dh, D, { p: [sx * (W / 2 - 0.0125), dy, 0], c: white });
  b.box('paint', W, 0.03, D, { p: [0, H - 0.015, 0], c: white });
  b.box('dark', W - 0.06, dh - 0.04, 0.004, { p: [0, dy, D / 2 - 0.024] });
  for (const y of [1.02, 1.36]) b.box('steel', W - 0.05, 0.012, D - 0.06, { p: [0, y, 0.01] });
  // bottles, jars and cartons
  for (const [sy, n] of [[0.7, 4], [1.026, 5], [1.366, 4]]) {
    for (let k = 0; k < n; k++) {
      const x = -0.34 + ((k + r() * 0.6) * 0.7) / n;
      const z = rr(r, -0.06, 0.1);
      const what = r();
      if (what < 0.35) b.cyl('bottle_brown', 0.028, 0.032, 0.13, 6, { p: [x, sy + 0.065, z] });
      else if (what < 0.6) b.cyl('paint', 0.03, 0.03, 0.09, 7, { p: [x, sy + 0.045, z], c: [0.85, 0.85, 0.8] });
      else if (what < 0.8) b.box('cardboard', 0.1, 0.07, 0.06, { p: [x, sy + 0.035, z], r: [0, rr(r, -0.4, 0.4), 0] });
      else b.cyl('bottle', 0.03, 0.035, 0.16, 6, { p: [x, sy + 0.08, z] });
    }
  }
  const dw = W / 2 - 0.015, door = white.map((c) => c * 1.03);
  b.box('paint', dw, dh - 0.03, 0.02, { p: [-W / 4, dy, zf - 0.01], c: door });
  label(b, 'labels', 'cross_mark', 0.2, 0.2, [-W / 4, dy + 0.2, zf - 0.0215], 'z-');
  b.box('chrome', 0.02, 0.14, 0.025, { p: [-0.04, dy, zf - 0.03] });
  b.group({ p: [W / 2 - 0.012, dy, zf - 0.01], r: [0, -1.25, 0] }, () => {
    b.box('paint', dw, dh - 0.03, 0.02, { p: [-dw / 2, 0, 0], c: door });
    b.box('chrome', 0.02, 0.14, 0.025, { p: [-dw + 0.04, 0, -0.02] });
  });
  for (const x of [-0.3, 0.22]) b.box('rust', 0.05 + r() * 0.04, 0.1 + r() * 0.1, 0.004, { p: [x, 0.14, zf - 0.02] });
};

// the drug locker of the isolation ward: a squat steel cabinet for what was counted out under two keys, its heavy
// door standing open (front: -z)
CONTAINER_PROPS.drug_locker = (b) => {
  const grey = [0.2, 0.23, 0.24];
  const W = 0.8, H = 1.25, D = 0.6, zf = -D / 2, t = 0.04;
  const hh = H - 0.06, hy = 0.06 + hh / 2;
  b.box('dark', W - 0.06, 0.06, D - 0.06, { p: [0, 0.03, 0] });
  b.box('paint', W, hh, t, { p: [0, hy, D / 2 - t / 2], c: grey });
  for (const sx of [-1, 1]) b.box('paint', t, hh, D, { p: [sx * (W / 2 - t / 2), hy, 0], c: grey });
  for (const y of [H - t / 2, 0.06 + t / 2]) b.box('paint', W, t, D, { p: [0, y, 0], c: grey });
  b.box('dark', W - t * 2, hh - t * 2, 0.004, { p: [0, hy, D / 2 - t - 0.004] });
  for (const y of [0.5, 0.86]) b.box('steel', W - t * 2, 0.012, D - 0.1, { p: [0, y, 0.02] });
  // what is in it: cartons with a red cross, jars, boxes of ampoules
  b.box('paint', 0.3, 0.2, 0.24, { p: [-0.16, 0.2, 0.02], c: [0.8, 0.8, 0.76] });
  label(b, 'labels', 'cross_mark', 0.14, 0.14, [-0.16, 0.2, -0.102], 'z-');
  b.box('paint', 0.24, 0.16, 0.2, { p: [0.17, 0.18, 0.04], r: [0, 0.3, 0], c: [0.8, 0.8, 0.76] });
  for (const [x, y] of [[-0.24, 0.506], [-0.12, 0.506], [0.02, 0.506], [0.22, 0.866], [0.1, 0.866]]) b.cyl('paint', 0.035, 0.035, 0.1, 7, { p: [x, y + 0.05, 0.03], c: [0.85, 0.85, 0.8] });
  b.box('cardboard', 0.22, 0.09, 0.16, { p: [0.2, 0.551, 0.04], r: [0, -0.2, 0] });
  b.box('cardboard', 0.2, 0.08, 0.14, { p: [-0.18, 0.906, 0.05], r: [0, 0.25, 0] });
  // the door, hung on the left: a wheel handle, two locks, the warning nobody heeded
  b.group({ p: [-W / 2 + 0.02, hy, zf - 0.03], r: [0, 1.15, 0] }, () => {
    b.box('paint', W - 0.04, hh - 0.04, 0.05, { p: [(W - 0.04) / 2, 0, 0], c: grey.map((c) => c * 1.08) });
    b.torus('chrome', 0.07, 0.012, 5, 10, PI * 2, { p: [0.5, 0.05, -0.06] });
    b.cyl('steel', 0.02, 0.02, 0.06, 6, { p: [0.5, 0.05, -0.04], r: [PI / 2, 0, 0] });
    for (const y of [0.3, -0.25]) b.cyl('chrome', 0.022, 0.022, 0.02, 8, { p: [0.64, y, -0.03], r: [PI / 2, 0, 0] });
    label(b, 'labels', 'hazard_small', 0.14, 0.14, [0.24, 0.3, -0.027], 'z-');
  });
};

// a folding hospital wheelchair, left where its last passenger got out of it (front: -z)
CONTAINER_PROPS.wheelchair = (b) => {
  const vinyl = [0.16, 0.2, 0.26];
  for (const sx of [-1, 1]) {
    const x = sx * 0.24;
    b.cylBetween('chrome', [x, 0.5, 0.12], [x, 0.5, -0.3], 0.012, 0.012, 5); // seat rail
    b.cylBetween('chrome', [x, 0.3, 0.16], [x, 0.92, 0.22], 0.012, 0.012, 5); // back post
    b.cylBetween('chrome', [x, 0.92, 0.22], [x, 0.9, 0.34], 0.012, 0.012, 5);
    b.cylBetween('rubber', [x, 0.9, 0.3], [x, 0.9, 0.38], 0.018, 0.018, 5); // push handle
    b.cylBetween('chrome', [x, 0.5, -0.3], [x, 0.14, -0.38], 0.012, 0.012, 5); // down to the footrest
    b.box('steel', 0.14, 0.012, 0.1, { p: [x * 0.75, 0.13, -0.42] });
    b.cylBetween('chrome', [x, 0.68, 0.2], [x, 0.68, -0.18], 0.012, 0.012, 5); // armrest
    b.box('rubber', 0.04, 0.02, 0.26, { p: [x, 0.695, 0] });
    b.cylBetween('chrome', [x, 0.68, -0.18], [x, 0.5, -0.2], 0.012, 0.012, 5);
    // the big wheel with its push rim, and the caster in front of it
    b.group({ p: [sx * 0.3, 0.3, 0.14] }, () => {
      b.torus('rubber', 0.285, 0.016, 5, 14, PI * 2, { r: [0, PI / 2, 0] });
      b.torus('chrome', 0.25, 0.007, 4, 14, PI * 2, { p: [sx * 0.03, 0, 0], r: [0, PI / 2, 0] });
      for (let k = 0; k < 6; k++) b.cylBetween('steel', [0, 0, 0], [0, Math.cos((k / 6) * PI * 2) * 0.28, Math.sin((k / 6) * PI * 2) * 0.28], 0.004, 0.004, 3);
    });
    b.cyl('rubber', 0.06, 0.06, 0.03, 8, { p: [x, 0.06, -0.3], r: [0, 0, PI / 2] });
    b.cylBetween('chrome', [x, 0.06, -0.3], [x, 0.3, -0.3], 0.008, 0.008, 4);
  }
  b.cylBetween('chrome', [-0.3, 0.3, 0.14], [0.3, 0.3, 0.14], 0.01, 0.01, 5); // axle
  b.box('cloth', 0.46, 0.02, 0.42, { p: [0, 0.5, -0.09], c: vinyl });
  b.box('cloth', 0.46, 0.36, 0.02, { p: [0, 0.72, 0.21], c: vinyl });
};
