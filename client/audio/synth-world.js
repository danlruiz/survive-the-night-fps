// Procedural sounds of things happening in the world: impacts (flesh, wood, metal, glass), explosions, fire, acid,
// a crate landing, a grave heaving, the quest car. Pure like synth.js: (sampleRate, rng) => Float32Array.
import { TAU, lerp, rrange, Biquad, ModeBank, Pink, Brown, hann, alloc, normalize, finish, softclip } from './dsp.js';
import { addNorm, thump, noise, modal, metalClick, woodModes, metalModes, whoosh, crackles, bubbles, creak } from './synth-blocks.js';

// ------------------------------------------------------------------ impacts
export function fleshHit(sr, rng, heavy = 0) {
  const out = alloc(sr, 0.45);
  addNorm(out, thump(sr, rrange(rng, 95, 120), 50, 0.02, 0.04 + heavy * 0.02), sr, 0, 0.9);
  addNorm(out, noise(sr, rng, 0.2, { bp: [1200, 2.5], sweep: [rrange(rng, 1300, 1700), 450], a: 0.001, d: 0.05 + heavy * 0.02 }), sr, 0.002, 0.8);
  addNorm(out, noise(sr, rng, 0.08, { lp: 700, a: 0.001, d: 0.02 }), sr, 0, 0.6);
  addNorm(out, bubbles(sr, rng, 0.25, 20, 500, 1600, { env: (u) => 1 - u }), sr, 0.01, 0.25);
  if (heavy) addNorm(out, crackles(sr, rng, 0.04, 400, { hp: 1800, bp: 3000 }), sr, 0.004, 0.5 * heavy);
  softclip(out, 1.6);
  return finish(out, sr);
}
export function headshotWet(sr, rng) {
  const out = alloc(sr, 0.6);
  addNorm(out, fleshHit(sr, rng, 1), sr, 0, 0.9);
  addNorm(out, crackles(sr, rng, 0.05, 500, { hp: 1500, bp: 2600, pow: 1.5 }), sr, 0.003, 0.7);
  addNorm(out, bubbles(sr, rng, 0.4, 40, 600, 2200, { env: (u) => (1 - u) ** 2 }), sr, 0.02, 0.35);
  return finish(out, sr);
}
export function woodHit(sr, rng, k = 1) {
  const out = alloc(sr, 0.4);
  addNorm(out, modal(sr, rng, woodModes(rng, k * rrange(rng, 0.9, 1.15)), 0.38, 1.5, 3000), sr, 0, 1);
  addNorm(out, thump(sr, 120, 70, 0.015, 0.03), sr, 0, 0.5);
  addNorm(out, noise(sr, rng, 0.05, { bp: [2500, 1], a: 0.0005, d: 0.008 }), sr, 0, 0.4);
  return finish(out, sr);
}
export function woodBreak(sr, rng) {
  const out = alloc(sr, 1.4);
  addNorm(out, noise(sr, rng, 0.08, { hp: 300, a: 0.0005, d: 0.02 }), sr, 0, 0.9);
  addNorm(out, modal(sr, rng, woodModes(rng, 0.7, 1.5), 0.5, 2), sr, 0, 1);
  // splinters
  const sp = alloc(sr, 1.0);
  for (let k = 0; k < 34; k++) {
    const t = Math.pow(rng(), 1.8) * 0.8;
    const m = modal(sr, rng, [{ f: rrange(rng, 700, 3200), d: rrange(rng, 0.006, 0.02) }, { f: rrange(rng, 1500, 4500), d: 0.008, a: 0.6 }], 0.08, 0.5);
    addNorm(sp, m, sr, t, rrange(rng, 0.2, 1) * (1 - t));
  }
  addNorm(out, sp, sr, 0.01, 0.7);
  addNorm(out, creak(sr, rng, 0.45, 25, 90, 1.2), sr, 0.12, 0.35);
  for (let k = 0; k < 4; k++) addNorm(out, woodHit(sr, rng, rrange(rng, 1.2, 2)), sr, 0.35 + k * rrange(rng, 0.1, 0.22), rrange(rng, 0.15, 0.35));
  softclip(out, 1.4);
  return finish(out, sr);
}
export function metalHit(sr, rng, f0) {
  const out = alloc(sr, 1.4);
  addNorm(out, modal(sr, rng, metalModes(rng, f0 ?? rrange(rng, 300, 460)), 1.4, 0.5), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.03, { hp: 3000, a: 0.0003, d: 0.004 }), sr, 0, 0.5);
  addNorm(out, thump(sr, 160, 90, 0.01, 0.02), sr, 0, 0.35);
  return finish(out, sr);
}
export function glassBreak(sr, rng) {
  const out = alloc(sr, 1.0);
  addNorm(out, noise(sr, rng, 0.12, { hp: 2500, a: 0.0005, d: 0.03 }), sr, 0, 0.8);
  const sh = alloc(sr, 1.0);
  for (let k = 0; k < 26; k++) {
    const t = Math.pow(rng(), 2) * 0.65;
    const m = modal(sr, rng, [
      { f: rrange(rng, 2600, 8500), d: rrange(rng, 0.03, 0.2) },
      { f: rrange(rng, 3500, 9500), d: rrange(rng, 0.02, 0.1), a: 0.6 },
    ], 0.35, 0.3);
    addNorm(sh, m, sr, t, rrange(rng, 0.2, 1) * (1 - t * 0.9));
  }
  addNorm(out, sh, sr, 0.005, 0.9);
  return finish(out, sr);
}
export function hammerBuild(sr, rng) {
  const out = alloc(sr, 1.1);
  let t = 0;
  for (let k = 0; k < 3; k++) {
    addNorm(out, woodHit(sr, rng, rrange(rng, 1.0, 1.2)), sr, t, 0.9);
    addNorm(out, modal(sr, rng, [{ f: rrange(rng, 2300, 2700), d: 0.05 }, { f: rrange(rng, 3700, 4200), d: 0.03, a: 0.6 }], 0.25, 0.3), sr, t, 0.35);
    t += rrange(rng, 0.26, 0.32);
  }
  return finish(out, sr);
}
export function explosion(sr, rng) {
  // mono: played through a PannerNode
  const dur = 3.4;
  const n = Math.floor(dur * sr);
  const c = new Float32Array(n);
  const boom = new Float32Array(n);
  const lp = new Biquad();
  const lp2 = new Biquad();
  const br = new Brown(rng);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) {
      const f = 130 + 2600 * Math.exp(-t / 0.18);
      lp.lp(sr, f, 0.7);
      lp2.lp(sr, f, 0.7);
    }
    const e = (1 - Math.exp(-t / 0.004)) * (0.85 * Math.exp(-t / 0.22) + 0.15 * Math.exp(-t / 0.9));
    boom[i] = lp2.run(lp.run(rng() * 2 - 1)) * e * 3 + br.next() * Math.exp(-t / 1.1) * 0.25;
  }
  addNorm(c, boom, sr, 0, 1);
  addNorm(c, thump(sr, 80, 24, 0.25, 0.6, dur), sr, 0, 0.9);
  addNorm(c, noise(sr, rng, 0.03, { hp: 700, a: 0.0003, d: 0.006 }), sr, 0, 0.8);
  addNorm(c, crackles(sr, rng, 2.8, 70, { hp: 900, bp: 2200, skew: 1.6, env: (u) => (1 - u) ** 2, len: 0.004 }), sr, 0.12, 0.25);
  addNorm(c, noise(sr, rng, 2.4, { hp: 1200, lp: 5000, env: (u) => hann(u * 0.5 + 0.05) * (1 - u) }), sr, 0.4, 0.06);
  normalize(c, 1);
  softclip(c, 1.8);
  return finish(c, sr, 0.95, 0.0002, 0.2);
}
export function slam(sr, rng) {
  const out = alloc(sr, 1.8);
  addNorm(out, thump(sr, 65, 28, 0.12, 0.3, 1.8), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.6, { lp: 1200, a: 0.002, d: 0.09 }), sr, 0, 0.9);
  addNorm(out, crackles(sr, rng, 1.4, 50, { hp: 700, bp: 1800, skew: 1.5, env: (u) => (1 - u) ** 2, len: 0.004 }), sr, 0.05, 0.25);
  addNorm(out, woodHit(sr, rng, 0.5), sr, 0, 0.3);
  normalize(out, 1);
  softclip(out, 1.7);
  return finish(out, sr, 0.95);
}

// ------------------------------------------------------------------ misc world sfx
export function acidSizzle(sr, rng) {
  const out = alloc(sr, 1.3);
  addNorm(out, noise(sr, rng, 1.3, { hp: 2500, bp: [5500, 0.6], env: (u) => Math.min(1, u * 30) * Math.exp(-u * 2.5) }), sr, 0, 0.6);
  addNorm(out, crackles(sr, rng, 1.3, 140, { hp: 2000, bp: 4500, pow: 2, env: (u) => Math.exp(-u * 2) }), sr, 0, 0.8);
  addNorm(out, bubbles(sr, rng, 1.2, 30, 500, 1800, { env: (u) => Math.exp(-u * 2) }), sr, 0.02, 0.4);
  return finish(out, sr);
}
export function fireWhoosh(sr, rng) {
  const out = alloc(sr, 1.9);
  addNorm(out, glassBreak(sr, rng), sr, 0, 0.55);
  const n = Math.floor(1.8 * sr);
  const w = new Float32Array(n);
  const lp = new Biquad();
  const pk = new Pink(rng);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) lp.lp(sr, 150 + 3400 * (1 - Math.exp(-t / 0.12)) * Math.exp(-t / 0.9), 0.8);
    w[i] = lp.run(pk.next()) * Math.min(1, t / 0.12) * Math.exp(-t / 0.6);
  }
  addNorm(out, w, sr, 0.03, 1);
  addNorm(out, thump(sr, 95, 45, 0.05, 0.12), sr, 0.03, 0.6);
  addNorm(out, crackles(sr, rng, 1.6, 45, { hp: 1500, env: (u) => 1 - u }), sr, 0.1, 0.4);
  return finish(out, sr);
}
export function campfireAdd(sr, rng) {
  const out = alloc(sr, 1.3);
  addNorm(out, woodHit(sr, rng, 1.4), sr, 0, 0.5);
  addNorm(out, whoosh(sr, rng, 0.7, 200, 1600, 500, 0.8, 0.45), sr, 0.04, 0.8);
  addNorm(out, crackles(sr, rng, 1.2, 30, { hp: 1500, env: (u) => Math.exp(-u * 2.5) }), sr, 0.08, 0.6);
  return finish(out, sr);
}
export function crateLand(sr, rng) {
  const out = alloc(sr, 1.4);
  addNorm(out, thump(sr, 75, 38, 0.05, 0.12), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.3, { lp: 500, a: 0.002, d: 0.08 }), sr, 0, 0.8);
  addNorm(out, modal(sr, rng, woodModes(rng, 0.55, 1.8), 0.6, 2, 2000), sr, 0, 0.8);
  addNorm(out, creak(sr, rng, 0.5, 20, 60, 0.9), sr, 0.18, 0.3);
  for (let k = 0; k < 4; k++) addNorm(out, metalClick(sr, rng, rrange(rng, 1500, 3000), 0.02), sr, 0.04 + rng() * 0.3, 0.15);
  softclip(out, 1.5);
  return finish(out, sr);
}
// A grave heaving (St. Agnes Cemetery): the ground groaning under a load, soil sliding, grit and small stones
// shifting, something knocking from underneath. It lasts the warning (CEMETERY.STIR) and a little over.
export function graveStir(sr, rng) {
  const out = alloc(sr, 1.7);
  addNorm(out, noise(sr, rng, 1.6, { lp: 170, env: (u) => Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 0.7 }), sr, 0, 1);
  addNorm(out, noise(sr, rng, 1.5, { hp: 700, bp: [1900, 0.7], env: (u) => u * (1 - u) * 4 * (0.6 + 0.4 * Math.sin(u * 40)) }), sr, 0.05, 0.4);
  addNorm(out, crackles(sr, rng, 1.5, 70, { hp: 900, bp: 2400, skew: 1.2, env: (u) => 0.3 + 0.7 * u, len: 0.005 }), sr, 0.05, 0.5);
  for (let k = 0; k < 3; k++) addNorm(out, thump(sr, rrange(rng, 70, 95), 40, 0.03, 0.09), sr, 0.22 + k * 0.4 + rng() * 0.1, 0.55);
  softclip(out, 1.4);
  return finish(out, sr, 0.9, 0.03, 0.15);
}
// ...and breaking open: one heavy thump of turf, and the dirt it threw coming down after it
export function graveBurst(sr, rng) {
  const out = alloc(sr, 1.5);
  addNorm(out, thump(sr, 85, 34, 0.06, 0.16, 1.4), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.45, { lp: 900, a: 0.002, d: 0.1 }), sr, 0, 0.85);
  addNorm(out, noise(sr, rng, 0.9, { hp: 1200, bp: [2600, 0.6], env: (u) => Math.min(1, u * 14) * (1 - u) ** 2 }), sr, 0.03, 0.35);
  addNorm(out, crackles(sr, rng, 1.2, 110, { hp: 800, bp: 2000, skew: 1.6, env: (u) => (1 - u) ** 1.5, len: 0.005 }), sr, 0.08, 0.5);
  softclip(out, 1.5);
  return finish(out, sr, 0.95);
}
export function carPart(sr, rng) {
  const out = alloc(sr, 1.1);
  addNorm(out, metalHit(sr, rng, rrange(rng, 170, 200)), sr, 0, 0.9);
  for (let k = 0; k < 5; k++) addNorm(out, metalClick(sr, rng, 2200, 0.01), sr, 0.3 + k * 0.065, 0.35);
  addNorm(out, modal(sr, rng, metalModes(rng, 260, 0.4), 0.5, 0.6), sr, 0.68, 0.5);
  return finish(out, sr);
}
export function carStart(sr, rng) {
  const dur = 4.6;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  // A) starter motor cranking with compression strokes
  const crankEnd = 1.75;
  const cn = Math.floor(crankEnd * sr);
  const cr = new Float32Array(cn);
  const bp = new Biquad().bp(sr, 900, 1);
  const lpn = new Biquad().lp(sr, 350, 0.8);
  let ph = 0;
  for (let i = 0; i < cn; i++) {
    const t = i / sr;
    const comp = Math.pow(0.5 + 0.5 * Math.sin(TAU * 5.6 * t), 3);
    const f = (150 + 40 * Math.min(1, t)) * (1 - 0.1 * comp);
    ph += f / sr;
    const saw = 2 * (ph % 1) - 1;
    const e = Math.min(1, t / 0.05) * (t > crankEnd - 0.15 ? (crankEnd - t) / 0.15 : 1);
    cr[i] = (bp.run(saw) * 0.8 + lpn.run(rng() * 2 - 1) * comp * 2.5) * e;
  }
  addNorm(out, cr, sr, 0, 0.6);
  for (let t = 0.1; t < crankEnd - 0.1; t += 1 / 5.6) addNorm(out, thump(sr, 80, 55, 0.03, 0.05), sr, t, 0.3);
  // B) sputters
  for (const t of [1.55, 1.82, 2.02, 2.28]) {
    addNorm(out, thump(sr, 110, 50, 0.02, 0.06), sr, t + rng() * 0.04, 0.7);
    addNorm(out, noise(sr, rng, 0.1, { bp: [420, 1.2], a: 0.001, d: 0.03 }), sr, t, 0.5);
  }
  // C) engine catches: firing pulses exciting exhaust resonances, revving then settling to idle
  const s0 = 2.35;
  const en = n - Math.floor(s0 * sr);
  const ex = new Float32Array(en);
  let fp = 0;
  for (let i = 0; i < en; i++) {
    const t = i / sr;
    const rate = t < 0.5 ? lerp(10, 44, t / 0.5) : t < 1.1 ? lerp(44, 24, (t - 0.5) / 0.6) : 24 + Math.sin(t * 3) * 0.8;
    fp += (rate * (1 + (rng() - 0.5) * 0.08)) / sr;
    if (fp >= 1) {
      fp -= 1;
      const L = Math.floor(0.002 * sr);
      for (let j = 0; j < L && i + j < en; j++) ex[i + j] += (rng() * 2 - 1) * (1 - j / L) * (0.7 + rng() * 0.3);
    }
  }
  const bank = new ModeBank(sr, [{ f: 85, d: 0.03, a: 1 }, { f: 170, d: 0.02, a: 0.7 }, { f: 340, d: 0.012, a: 0.4 }, { f: 700, d: 0.006, a: 0.25 }]);
  const rum = new Biquad().lp(sr, 250, 0.9);
  const br = new Brown(rng);
  for (let i = 0; i < en; i++) {
    const t = i / sr;
    const e = Math.min(1, t / 0.08) * (t > 1.9 ? Math.max(0, 1 - (t - 1.9) / 0.35) * 0.6 + 0.4 : 1);
    ex[i] = (bank.run(ex[i]) + rum.run(br.next()) * 0.6) * e;
  }
  addNorm(out, ex, sr, s0, 1);
  softclip(out, 2);
  return finish(out, sr, 0.95, 0.002, 0.3);
}
