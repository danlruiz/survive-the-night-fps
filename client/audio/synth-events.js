// Procedural 2D event sounds, heard the same wherever the listener is: the supply plane passing over, the horde's
// horn, the dawn chorus (and the songbird phrase it is made of).
import { TAU, smoothstep, lerp, rrange, Biquad, OnePole, Pink, Wander, hann, alloc, normalize, finish } from './dsp.js';
import { addNorm, addPanned } from './synth-blocks.js';

// ------------------------------------------------------------------ 2D event sounds
export function plane(sr, rng) {
  const dur = 9;
  const n = Math.floor(dur * sr);
  const mono = new Float32Array(n);
  const tc = 4.4;
  const lp = new Biquad();
  const bp = new Biquad().bp(sr, 500, 0.7);
  const pk = new Pink(rng);
  const wl = new Biquad().lp(sr, 900, 0.7);
  let ph = 0;
  const amp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const dop = 1 - 0.075 * Math.tanh((t - tc) / 1.2);
    const a = 1 / (1 + ((t - tc) / 1.9) ** 2);
    amp[i] = a;
    if ((i & 31) === 0) lp.lp(sr, 500 + 2600 * a * a, 0.8);
    const fe = 58 * dop;
    ph += fe / sr;
    const p = ph % 1;
    const src = (p < 0.14 ? 1 : -0.16) + 0.4 * (2 * p - 1);
    const prop = 0.72 + 0.28 * Math.sin(TAU * 21 * dop * t);
    mono[i] = (lp.run(src) * 1.2 + bp.run(src) * 0.4) * prop * a + wl.run(pk.next()) * a * 0.9;
  }
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const p = Math.tanh((t - tc) / 2.2);
    L[i] = mono[i] * Math.sqrt((1 - p) / 2);
    R[i] = mono[i] * Math.sqrt((1 + p) / 2);
  }
  return finish([L, R], sr, 0.9, 0.5, 0.8);
}
export function hordeHorn(sr, rng) {
  const dur = 7.5;
  const n = Math.floor(dur * sr);
  const mono = new Float32Array(n);
  const lp = new Biquad().lp(sr, 420, 2);
  const lp2 = new Biquad().lp(sr, 700, 0.7);
  const sbp = new Biquad().bp(sr, 700, 0.8);
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  let ps = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const he = Math.min(1, t / 1.3) * (t > 5 ? Math.max(0, 1 - (t - 5) / 2.2) : 1);
    p1 += 62 / sr;
    p2 += 93.3 / sr;
    p3 += 124.6 / sr;
    const horn = lp2.run(lp.run((2 * (p1 % 1) - 1) + 0.8 * (2 * (p2 % 1) - 1) + 0.5 * (2 * (p3 % 1) - 1))) * he;
    const sf = t < 0.5 ? 170 : t < 3 ? lerp(170, 430, smoothstep((t - 0.5) / 2.5)) : lerp(430, 150, smoothstep((t - 3) / 3.6));
    ps += (sf * (1 + 0.01 * Math.sin(TAU * 0.9 * t))) / sr;
    const s = Math.sin(TAU * ps) + 0.3 * Math.sin(3 * TAU * ps);
    const se = Math.min(1, Math.max(0, t - 0.4) / 1.2) * (t > 5.6 ? Math.max(0, 1 - (t - 5.6) / 1.4) : 1);
    mono[i] = horn * 1.1 + sbp.run(s) * se * 0.8;
  }
  normalize(mono, 0.8);
  const out = [];
  const echoes = [[[0.37, 0.45], [0.93, 0.25], [1.6, 0.12]], [[0.52, 0.4], [1.21, 0.2], [1.9, 0.1]]];
  for (let ch = 0; ch < 2; ch++) {
    const c = Float32Array.from(mono);
    for (const [et, g] of echoes[ch]) {
      const d = Math.floor(et * sr);
      const e = new OnePole().lp(sr, 1100);
      for (let i = 0; i + d < n; i++) c[i + d] += e.run(mono[i]) * g;
    }
    const f = new OnePole().lp(sr, 1700);
    for (let i = 0; i < n; i++) c[i] = f.run(c[i]);
    out.push(c);
  }
  return finish(out, sr, 0.9, 0.05, 0.5);
}

// songbird phrase
export function birdPhrase(sr, rng, kind = 0) {
  const out = alloc(sr, 1.8);
  let t = 0.02;
  const notes = kind === 2 ? 1 : 3 + Math.floor(rng() * 5);
  for (let k = 0; k < notes && t < 1.5; k++) {
    const len = kind === 2 ? rrange(rng, 0.5, 0.8) : rrange(rng, 0.04, 0.13);
    const c = new Float32Array(Math.floor(len * sr));
    const f0 = rrange(rng, 2600, 5000);
    const f1 = kind === 2 ? f0 * 0.6 : f0 * rrange(rng, 0.7, 1.4);
    const trill = kind === 1 && rng() < 0.6;
    let ph = 0;
    for (let i = 0; i < c.length; i++) {
      const u = i / c.length;
      const f = lerp(f0, f1, u) * (1 + (trill ? 0.08 * Math.sin((TAU * 32 * i) / sr) : 0.01 * Math.sin((TAU * 9 * i) / sr)));
      ph += f / sr;
      c[i] = Math.sin(TAU * ph) * Math.pow(hann(u), 0.7);
    }
    addNorm(out, c, sr, t, rrange(rng, 0.5, 1));
    t += len + rrange(rng, 0.02, 0.12);
  }
  return finish(out, sr, 0.85);
}
export function rooster(sr, rng) {
  const syl = [[0, 0.12, 520, 560, 0.7], [0.16, 0.12, 600, 640, 0.8], [0.32, 0.16, 700, 760, 0.9], [0.52, 0.75, 790, 560, 1]];
  const out = alloc(sr, 1.4);
  for (const [s, d, f0, f1, a] of syl) {
    const c = new Float32Array(Math.floor(d * sr));
    const b1 = new Biquad().bp(sr, 1150, 3);
    const b2 = new Biquad().bp(sr, 2300, 4);
    const w = new Wander(rng, sr, 90);
    let ph = 0;
    for (let i = 0; i < c.length; i++) {
      const u = i / c.length;
      const f = d > 0.5 ? (u < 0.4 ? lerp(f0 * 0.95, f0, u / 0.4) : lerp(f0, f1, (u - 0.4) / 0.6)) : lerp(f0, f1, u);
      ph += (f * (1 + 0.02 * Math.sin((TAU * 7 * i) / sr))) / sr;
      const src = (2 * (ph % 1) - 1) * (1 + 0.5 * w.next());
      c[i] = (b1.run(src) + b2.run(src) * 0.6) * Math.min(1, u * 12) * Math.min(1, (1 - u) * 6);
    }
    addNorm(out, c, sr, s, a);
  }
  return out;
}
export function dawnSfx(sr, rng) {
  const dur = 6.5;
  const n = Math.floor(dur * sr);
  const outs = [new Float32Array(n), new Float32Array(n)];
  const r = rooster(sr, rng);
  const lp = new OnePole().lp(sr, 2400);
  for (let i = 0; i < r.length; i++) r[i] = lp.run(r[i]);
  for (let ch = 0; ch < 2; ch++) {
    addNorm(outs[ch], r, sr, 0.3 + ch * 0.012, ch ? 0.45 : 0.55);
    addNorm(outs[ch], r, sr, 0.3 + 0.55 + ch * 0.1, 0.12); // echo
  }
  for (let k = 0; k < 22; k++) {
    const t = 1.2 + Math.pow(rng(), 0.7) * 4.8;
    const b = birdPhrase(sr, rng, k % 3);
    const pan = rng();
    const a = rrange(rng, 0.2, 0.5);
    addPanned(outs, b, sr, t, a, pan);
  }
  return finish(outs, sr, 0.8, 0.1, 0.8);
}
