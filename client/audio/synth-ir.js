// The reverb's impulse responses (registry.js renders them as the ir_* banks at the context's own rate): the forest,
// open ground and a small room for the world's sounds (audio.js crossfades between them), a long hall for the music.
// Pure, like dsp.js: stereo [Float32Array, Float32Array], seeded so every client hears the same space.
import { mulberry32, OnePole, dcBlock, fade, peakOf, scale } from './dsp.js';

// scaled so the loudest sample of either channel sits at `peak`
const scaleToPeak = (out, peak) => scale(out, peak / Math.max(peakOf(out), 1e-6));

// Outdoor forest: sparse early reflections off trunks, a diffuse tail that darkens quickly
// (foliage absorbs highs) and a few smeared slap-back echoes from distant hills.
export function forestIR(sr, dur = 3, seed = 1) {
  const rng = mulberry32(seed);
  const n = Math.floor(sr * dur);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    const c = out[ch];
    const lp = new OnePole();
    const pre = Math.floor(0.011 * sr);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      if ((i & 63) === 0) lp.lp(sr, 900 + 8500 * Math.exp(-t * 3.2));
      const env = Math.exp(-t * (6.9 / dur)) * (1 - Math.exp(-t * 60));
      c[i] = lp.run(rng() * 2 - 1) * env * 0.55;
    }
    // early reflections (tree trunks)
    for (let k = 0; k < 16; k++) {
      const t = 0.008 + rng() * 0.09;
      const i = Math.floor(t * sr);
      const g = (0.25 + rng() * 0.5) * Math.exp(-t * 12) * (rng() < 0.5 ? -1 : 1);
      for (let j = 0; j < 12 && i + j < n; j++) c[i + j] += g * Math.exp(-j / 3);
    }
    // distant slap-back echoes (hills / tree line)
    const echoes = [0.19 + rng() * 0.05, 0.41 + rng() * 0.08, 0.72 + rng() * 0.1, 1.1 + rng() * 0.15];
    const eg = [0.3, 0.2, 0.12, 0.07];
    for (let k = 0; k < echoes.length; k++) {
      const s = Math.floor(echoes[k] * sr);
      const len = Math.floor(0.05 * sr);
      const elp = new OnePole().lp(sr, 1800 - k * 300);
      for (let j = 0; j < len && s + j < n; j++) {
        c[s + j] += elp.run(rng() * 2 - 1) * eg[k] * Math.exp(-j / (0.012 * sr)) * 2.2;
      }
    }
    dcBlock(c, sr, 20);
  }
  return scaleToPeak(out, 0.6);
}

// Open ground (road, clearing): almost dry - a ground reflection, a thin fast tail and discrete, darkening slap
// echoes off the distant tree lines.
export function openIR(sr, dur = 3, seed = 3) {
  const rng = mulberry32(seed);
  const n = Math.floor(sr * dur);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    const c = out[ch];
    const lp = new OnePole();
    const pre = Math.floor(0.004 * sr);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      if ((i & 63) === 0) lp.lp(sr, 700 + 6000 * Math.exp(-t * 5));
      const env = Math.exp(-t * 7.5) * (1 - Math.exp(-t * 12));
      c[i] = lp.run(rng() * 2 - 1) * env * 0.18;
    }
    // ground reflection
    const g0 = Math.floor((0.006 + rng() * 0.004) * sr);
    for (let j = 0; j < 10 && g0 + j < n; j++) c[g0 + j] += 0.5 * Math.exp(-j / 3);
    const echoes = [0.42 + rng() * 0.05, 0.78 + rng() * 0.08, 1.35 + rng() * 0.12, 2.1 + rng() * 0.2];
    const eg = [0.32, 0.2, 0.11, 0.06];
    for (let k = 0; k < echoes.length; k++) {
      const st = Math.floor(echoes[k] * sr);
      const len = Math.floor((0.04 + 0.03 * k) * sr);
      const elp = new OnePole().lp(sr, 2600 - k * 550);
      for (let j = 0; j < len && st + j < n; j++) {
        c[st + j] += elp.run(rng() * 2 - 1) * eg[k] * Math.exp(-j / ((0.01 + 0.006 * k) * sr)) * 2.4;
      }
    }
    dcBlock(c, sr, 25);
    fade(c, sr, 0, 0.05);
  }
  return scaleToPeak(out, 0.6);
}

// Small wooden room / under a roof: dense early reflections and a short, slightly dark tail.
export function roomIR(sr, dur = 0.8, seed = 4) {
  const rng = mulberry32(seed);
  const n = Math.floor(sr * dur);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    const c = out[ch];
    const lp = new OnePole();
    const pre = Math.floor(0.0015 * sr);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      if ((i & 63) === 0) lp.lp(sr, 1500 + 6500 * Math.exp(-t * 8));
      const env = Math.exp(-t * (6.9 / 0.45)) * (1 - Math.exp(-t * 400));
      c[i] = lp.run(rng() * 2 - 1) * env * 0.5;
    }
    for (let k = 0; k < 40; k++) {
      const t = 0.0015 + Math.pow(rng(), 1.6) * 0.03;
      const i = Math.floor(t * sr);
      const g = (0.3 + rng() * 0.6) * Math.exp(-t * 40) * (rng() < 0.5 ? -1 : 1);
      for (let j = 0; j < 8 && i + j < n; j++) c[i + j] += g * Math.exp(-j / 2);
    }
    dcBlock(c, sr, 40);
    fade(c, sr, 0, 0.04);
  }
  return scaleToPeak(out, 0.6);
}

// Long, dark, dense hall for music (piano notes with long reverb).
export function hallIR(sr, dur = 5, seed = 2) {
  const rng = mulberry32(seed);
  const n = Math.floor(sr * dur);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    const c = out[ch];
    const lp = new OnePole();
    const lp2 = new OnePole();
    const pre = Math.floor(0.028 * sr);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      if ((i & 63) === 0) {
        const f = 700 + 5200 * Math.exp(-t * 1.1);
        lp.lp(sr, f);
        lp2.lp(sr, f * 1.3);
      }
      const env = Math.exp(-t * (6.9 / dur)) * (1 - Math.exp(-t * 18));
      c[i] = lp2.run(lp.run(rng() * 2 - 1)) * env;
    }
    dcBlock(c, sr, 25);
  }
  return scaleToPeak(out, 0.5);
}
