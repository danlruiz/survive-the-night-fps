// The building blocks every procedural sound is made of: the sample rates the banks render at, and small pure
// generators (a pitch-dropping thump, filtered noise, struck modes, whooshes, crackles, bubbles, creaks, rustles)
// that the synth*.js sounds layer with addNorm. No DOM / WebAudio: Float32Arrays only, so Node can run them.
import { TAU, lerp, rrange, Biquad, OnePole, ModeBank, Pink, Wander, ar, hann, normalize, mixInto, loopify, dcBlock, peakOf } from './dsp.js';

export const HI = 44100;
export const MID = 32000;
export const LO = 22050;

// ------------------------------------------------------------------ small building blocks

// add `src` into `dst` at time `t` (s), normalised so its peak equals `peak`
export function addNorm(dst, src, sr, t, peak) {
  const p = peakOf(src);
  if (p < 1e-9) return dst;
  return mixInto(dst, src, Math.floor(t * sr), peak / p);
}

// pitch-dropping sine thump
export function thump(sr, f0, f1, sweep, decay, len) {
  const n = Math.floor((len ?? decay * 7) * sr);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / sweep);
    ph += f / sr;
    out[i] = Math.sin(TAU * ph) * Math.exp(-t / decay) * (1 - Math.exp(-t / 0.0012));
  }
  return out;
}

// filtered noise burst. o: {hp, lp, bp:[f,q], sweep:[f0,f1] (bp centre sweep, exponential), a, d, env(u), lp2}
export function noise(sr, rng, dur, o = {}) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const hp = o.hp ? new Biquad().hp(sr, o.hp, 0.7) : null;
  const lp = o.lp ? new Biquad().lp(sr, o.lp, 0.7) : null;
  const lp2 = o.lp ? new Biquad().lp(sr, o.lp, 0.7) : null;
  const bp = o.bp ? new Biquad().bp(sr, o.bp[0], o.bp[1]) : null;
  const sw = o.sweep;
  const a = o.a ?? 0.001;
  const d = o.d ?? dur / 4;
  const pink = o.pink ? new Pink(rng) : null;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (sw && (i & 15) === 0) bp.bp(sr, sw[0] * Math.pow(sw[1] / sw[0], sw[2] ? Math.pow(u, sw[2]) : u), o.bp[1]);
    let x = pink ? pink.next() : rng() * 2 - 1;
    if (hp) x = hp.run(x);
    if (lp) x = lp2.run(lp.run(x));
    if (bp) x = bp.run(x);
    out[i] = x * (o.env ? o.env(u) : ar(i / sr, a, d));
  }
  return out;
}

// struck modal object (wood, metal, glass...). modes: [{f,d,a}]; excitation = short noise burst
export function modal(sr, rng, modes, len, exciteMs = 0.8, exciteLP = 0) {
  const n = Math.floor(len * sr);
  const out = new Float32Array(n);
  const bank = new ModeBank(sr, modes);
  const ex = Math.max(1, Math.floor((exciteMs / 1000) * sr));
  const elp = exciteLP ? new OnePole().lp(sr, exciteLP) : null;
  for (let i = 0; i < n; i++) {
    let x = i < ex ? (rng() * 2 - 1) * (1 - i / ex) : 0;
    if (elp) x = elp.run(x);
    out[i] = bank.run(x);
  }
  return out;
}

export function metalClick(sr, rng, f, decay = 0.012) {
  return modal(sr, rng, [
    { f, d: decay, a: 1 },
    { f: f * 1.73, d: decay * 0.8, a: 0.8 },
    { f: f * 2.94, d: decay * 0.6, a: 0.6 },
    { f: f * 4.21, d: decay * 0.45, a: 0.4 },
  ], decay * 7 + 0.004, 0.4);
}

export function woodModes(rng, k = 1, d = 1) {
  return [
    { f: 170 * k * rrange(rng, 0.92, 1.08), d: 0.07 * d, a: 1 },
    { f: 405 * k * rrange(rng, 0.92, 1.08), d: 0.05 * d, a: 0.8 },
    { f: 720 * k * rrange(rng, 0.92, 1.08), d: 0.035 * d, a: 0.6 },
    { f: 1180 * k * rrange(rng, 0.92, 1.08), d: 0.022 * d, a: 0.45 },
    { f: 2050 * k * rrange(rng, 0.9, 1.1), d: 0.012 * d, a: 0.3 },
  ];
}

export function metalModes(rng, f0, d = 1) {
  const r = [1, 2.76, 5.4, 8.93, 13.34, 1.51, 3.93];
  const dd = [1.1, 0.8, 0.55, 0.4, 0.28, 0.7, 0.45];
  const aa = [1, 0.7, 0.5, 0.35, 0.22, 0.4, 0.3];
  const m = [];
  for (let i = 0; i < r.length; i++) {
    const f = f0 * r[i] * rrange(rng, 0.985, 1.015);
    m.push({ f, d: dd[i] * d, a: aa[i] });
    m.push({ f: f * 1.004, d: dd[i] * d * 0.9, a: aa[i] * 0.5 }); // beating pair
  }
  return m;
}

// band-passed noise whoosh with a centre-frequency arc f0 -> fpk -> f1
export function whoosh(sr, rng, dur, f0, fpk, f1, q = 1.6, peakAt = 0.4) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const bp = new Biquad();
  const bp2 = new Biquad();
  const pk = new Pink(rng);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if ((i & 15) === 0) {
      const f = u < peakAt ? f0 * Math.pow(fpk / f0, u / peakAt) : fpk * Math.pow(f1 / fpk, (u - peakAt) / (1 - peakAt));
      bp.bp(sr, f, q);
      bp2.bp(sr, f * 1.5, q);
    }
    const x = pk.next() * 2 + (rng() * 2 - 1) * 0.3;
    const e = u < peakAt ? Math.pow(u / peakAt, 1.5) : Math.pow(1 - (u - peakAt) / (1 - peakAt), 2);
    out[i] = (bp.run(x) + bp2.run(x) * 0.5) * e;
  }
  return out;
}

// sparse crackles: excitation impulses coloured by a HP + BP. rate per second, amp shaped by env(u)
export function crackles(sr, rng, dur, rate, o = {}) {
  const n = Math.floor(dur * sr);
  const ex = new Float32Array(n);
  const count = Math.floor(rate * dur);
  for (let k = 0; k < count; k++) {
    const u = o.skew ? Math.pow(rng(), o.skew) : rng();
    const i = Math.floor(u * n);
    const a = Math.pow(rng(), o.pow ?? 3) * (o.env ? o.env(u) : 1) * (rng() < 0.5 ? -1 : 1);
    const len = 1 + Math.floor(rng() * (o.len ?? 0.0012) * sr);
    for (let j = 0; j < len && i + j < n; j++) ex[i + j] += a * (rng() * 2 - 1) * (1 - j / len);
  }
  const hp = new Biquad().hp(sr, o.hp ?? 1200, 0.7);
  const bp = new Biquad().bp(sr, o.bp ?? 2600, 0.9);
  for (let i = 0; i < n; i++) {
    const h = hp.run(ex[i]);
    ex[i] = h * 0.6 + bp.run(h) * 1.2;
  }
  return ex;
}

// Minnaert bubbles / wet blips (exponentially decaying sines with rising pitch)
export function bubbles(sr, rng, dur, rate, fLo = 300, fHi = 1100, o = {}) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const count = Math.max(1, Math.floor(rate * dur));
  for (let k = 0; k < count; k++) {
    const u = o.skew ? Math.pow(rng(), o.skew) : rng();
    const s = Math.floor(u * n);
    const f0 = fLo * Math.pow(fHi / fLo, rng());
    const d = rrange(rng, 0.006, 0.02) * (600 / f0) ** 0.5;
    const a = rrange(rng, 0.3, 1) * (o.env ? o.env(u) : 1);
    const len = Math.floor(d * 6 * sr);
    let ph = 0;
    for (let j = 0; j < len && s + j < n; j++) {
      const t = j / sr;
      ph += (f0 * (1 + (t / d) * 0.25)) / sr;
      out[s + j] += Math.sin(TAU * ph) * Math.exp(-t / d) * (1 - Math.exp(-t / 0.0008)) * a;
    }
  }
  return out;
}

// stick-slip creak: irregular pulse train exciting wood resonances
export function creak(sr, rng, dur, rLo = 18, rHi = 70, k = 1) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const bank = new ModeBank(sr, [
    { f: 330 * k * rrange(rng, 0.9, 1.1), d: 0.03, a: 1 },
    { f: 520 * k * rrange(rng, 0.9, 1.1), d: 0.025, a: 0.8 },
    { f: 910 * k * rrange(rng, 0.9, 1.1), d: 0.018, a: 0.6 },
    { f: 1450 * k * rrange(rng, 0.9, 1.1), d: 0.01, a: 0.35 },
  ]);
  const w = new Wander(rng, sr, rrange(rng, 1.5, 3));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const r = lerp(rLo, rHi, 0.5 + 0.5 * w.next());
    ph += r / sr;
    let x = 0;
    if (ph >= 1) {
      ph -= 1 + (rng() - 0.5) * 0.3;
      x = (0.5 + rng() * 0.5) * (rng() < 0.08 ? 2 : 1);
    }
    out[i] = bank.run(x) * hann(u * 0.5 + 0.25) * Math.min(1, u * 8);
  }
  return out;
}

// cloth rustle
export function rustle(sr, rng, dur, f = 2400) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const bp = new Biquad().bp(sr, f, 0.6);
  const hp = new Biquad().hp(sr, 700, 0.7);
  const w = new Wander(rng, sr, 40);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const g = Math.max(0, 0.4 + 0.6 * w.next());
    out[i] = bp.run(hp.run(rng() * 2 - 1)) * g * g * hann(u);
  }
  return out;
}

// Final tidy-up for a seamless loop: NaN guard and DC block on every channel, then the tail crossfaded into the head
// (loopify: the input is loop + xf seconds long) and the loop normalised to `peak`.
export function finishLoop(x, sr, xf, peak = 0.85) {
  for (const c of Array.isArray(x) ? x : [x]) {
    for (let i = 0; i < c.length; i++) if (c[i] !== c[i]) c[i] = 0;
    dcBlock(c, sr);
  }
  return normalize(loopify(x, sr, xf), peak);
}
