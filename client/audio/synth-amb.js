// Pure generators for ambience beds and ambient one-shots (AMB_DEFS; registry.js gathers them).
import { TAU, clamp, lerp, rrange, Biquad, Pink, Brown, Wander, hann, alloc, normalize, finish, loopify } from './dsp.js';
import { MID, LO, addNorm, thump, noise, modal, creak, crackles, finishLoop, addPanned, distant } from './synth-blocks.js';
import { voice } from './synth-voice.js';
import { birdPhrase } from './synth-events.js';

// ------------------------------------------------------------------ ambience beds (seamless loops)
function bedWind(sr, rng) {
  const Ls = 10;
  const X = 1.5;
  const n = Math.ceil((Ls + X) * sr);
  const gust = new Float32Array(n);
  const g1 = new Wander(rng, sr, 0.18);
  const g2 = new Wander(rng, sr, 0.05);
  for (let i = 0; i < n; i++) gust[i] = clamp(0.55 + 0.35 * g1.next() + 0.25 * g2.next(), 0.1, 1.2);
  const outs = [];
  for (let ch = 0; ch < 2; ch++) {
    const c = new Float32Array(n);
    const pk = new Pink(rng);
    const br = new Brown(rng);
    const bp = new Biquad();
    const lpb = new Biquad().lp(sr, 170, 0.7);
    const wh = new Biquad();
    const ww = new Wander(rng, sr, 0.3);
    for (let i = 0; i < n; i++) {
      if ((i & 63) === 0) {
        bp.bp(sr, 260 + 420 * gust[i], 0.55);
        wh.bp(sr, 950 + 350 * ww.next(), 14);
      }
      c[i] = bp.run(pk.next()) * gust[i] * 1.8 + lpb.run(br.next()) * 0.7 + wh.run(rng() * 2 - 1) * Math.max(0, gust[i] - 0.65) * 2.5;
    }
    outs.push(c);
  }
  return finishLoop(outs, sr, X, 0.8);
}
function bedPines(sr, rng) {
  const Ls = 8;
  const X = 1;
  const n = Math.ceil((Ls + X) * sr);
  const gust = new Wander(rng, sr, 0.15);
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = clamp(0.5 + 0.5 * gust.next(), 0.05, 1);
  const outs = [];
  for (let ch = 0; ch < 2; ch++) {
    const c = new Float32Array(n);
    const hp = new Biquad().hp(sr, 1900, 0.7);
    const lp = new Biquad().lp(sr, 6500, 0.7);
    const fl = new Wander(rng, sr, 11);
    for (let i = 0; i < n; i++) c[i] = lp.run(hp.run(rng() * 2 - 1)) * g[i] * g[i] * (0.7 + 0.3 * fl.next());
    outs.push(c);
  }
  return finishLoop(outs, sr, X, 0.7);
}
function bedCrickets(sr, rng) {
  const Ls = 8;
  const X = 0.6;
  const T = Ls + X;
  const n = Math.ceil(T * sr);
  const outs = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 9; c++) {
    const f = rrange(rng, 3900, 5200);
    const pulses = 3 + Math.floor(rng() * 2);
    const plen = rrange(rng, 0.012, 0.019);
    const pgap = rrange(rng, 0.008, 0.013);
    const period = rrange(rng, 0.42, 0.95);
    const amp = c < 6 ? rrange(rng, 0.35, 1) : rrange(rng, 0.1, 0.22);
    const pan = rng();
    const gl = Math.sqrt(1 - pan);
    const gr = Math.sqrt(pan);
    let t = rng() * period;
    const pl = Math.floor(plen * sr);
    while (t < T) {
      if (rng() > 0.08) {
        for (let p = 0; p < pulses; p++) {
          const s = Math.floor((t + p * (plen + pgap)) * sr);
          for (let j = 0; j < pl && s + j < n; j++) {
            const u = j / pl;
            const tt = (s + j) / sr;
            const v = (Math.sin(TAU * f * tt) + 0.15 * Math.sin(TAU * 2 * f * tt)) * Math.pow(Math.sin(Math.PI * u), 0.6) * amp;
            outs[0][s + j] += v * gl;
            outs[1][s + j] += v * gr;
          }
        }
      }
      t += period * (1 + (rng() - 0.5) * 0.1);
    }
  }
  // continuous tree-cricket trill
  const tw = new Wander(rng, sr, 0.25);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const am = Math.max(0, Math.sin(TAU * 42 * t)) ** 2;
    const v = Math.sin(TAU * 2900 * t) * am * 0.12 * (0.6 + 0.4 * tw.next());
    outs[0][i] += v * 0.8;
    outs[1][i] += v * 0.5;
  }
  return finishLoop(outs, sr, X, 0.75);
}
function bedDrone(sr, rng) {
  const Ls = 12;
  const X = 1.5;
  const n = Math.ceil((Ls + X) * sr);
  const outs = [];
  for (let ch = 0; ch < 2; ch++) {
    const c = new Float32Array(n);
    const br = new Brown(rng);
    const lp = new Biquad().lp(sr, 120, 0.8);
    const w = new Wander(rng, sr, 0.1);
    const pk = new Pink(rng);
    const bp = new Biquad().bp(sr, 300, 1.2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      c[i] = lp.run(br.next()) * (0.6 + 0.4 * w.next()) * 1.5 + bp.run(pk.next()) * 0.35 * (0.5 + 0.5 * Math.sin(TAU * 0.15 * t));
    }
    outs.push(c);
  }
  const noiseLoop = loopify(outs, sr, X);
  // periodic tonal layer (frequencies are multiples of 1/Ls so it loops without a crossfade)
  const N = noiseLoop[0].length;
  const q = (f) => Math.round(f * Ls) / Ls;
  const tones = [[[q(41.2), 0.5], [q(43.7), 0.4], [q(82.4), 0.18], [q(2350), 0.012], [q(2353.4), 0.012]], [[q(41.2), 0.5], [q(43.6), 0.4], [q(87.3), 0.15], [q(1760), 0.01], [q(1763.2), 0.01]]];
  for (let ch = 0; ch < 2; ch++) {
    const c = noiseLoop[ch];
    const tone = new Float32Array(N);
    // phasor recurrence per partial (cheap sine generation); periodic over the loop length
    for (const [f, amp] of tones[ch]) {
      const w = (TAU * f) / sr;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      const p0 = rng() * TAU;
      let x = Math.cos(p0);
      let y = Math.sin(p0);
      for (let i = 0; i < N; i++) {
        tone[i] += y * amp;
        const nx = x * cw - y * sw;
        y = x * sw + y * cw;
        x = nx;
        if ((i & 4095) === 4095) {
          // renormalise to stop amplitude drift
          const m = 1 / Math.sqrt(x * x + y * y);
          x *= m;
          y *= m;
        }
      }
    }
    for (let i = 0; i < N; i++) {
      const am = 0.7 + 0.3 * Math.sin(((TAU * i) / sr / Ls) * 2 + ch);
      c[i] = c[i] * 0.35 + tone[i] * am;
    }
  }
  return normalize(noiseLoop, 0.8);
}
// home: the room tone inside the team's walls at night (issue #303). A warm, close murmur - low rumble, the wind
// heard through planks, a faint creak of timber - with none of the drone's minor-second beating
export function bedHome(sr, rng) {
  const Ls = 10;
  const X = 1.5;
  const n = Math.ceil((Ls + X) * sr);
  const outs = [];
  for (let ch = 0; ch < 2; ch++) {
    const c = new Float32Array(n);
    const br = new Brown(rng);
    const lp = new Biquad().lp(sr, 140, 0.7);
    const pk = new Pink(rng);
    const thru = new Biquad().bp(sr, 380, 0.8); // the wind, through the boards
    const w = new Wander(rng, sr, 0.08);
    const w2 = new Wander(rng, sr, 0.2);
    for (let i = 0; i < n; i++) c[i] = lp.run(br.next()) * 1.4 * (0.8 + 0.2 * w.next()) + thru.run(pk.next()) * 0.25 * (0.6 + 0.4 * w2.next());
    outs.push(c);
  }
  return finishLoop(outs, sr, X, 0.7);
}
function bedHorde(sr, rng) {
  const Ls = 8;
  const X = 1;
  const T = Ls + X;
  const n = Math.ceil(T * sr);
  const outs = [new Float32Array(n), new Float32Array(n)];
  for (let k = 0; k < 12; k++) {
    const dur = rrange(rng, 0.9, 2.2);
    const b = rrange(rng, 65, 120);
    const v = voice(sr, rng, {
      dur, pitch: [[0, b], [0.3, b * rrange(rng, 1.05, 1.4)], [1, b * 0.75]], vowels: [[0, 'uh'], [0.5, 'a'], [1, 'o']],
      fscale: rrange(rng, 0.75, 0.9), bw: 1.8, jitter: 0.07, shimmer: 0.4, sub: 0.5, gurgle: 0.5, rasp: 0.5, breath: 0.35, drive: 3,
      chest: 0.5, env: [[0, 0], [0.15, 1], [0.6, 0.7], [1, 0]],
    });
    const lp = new Biquad().lp(sr, rrange(rng, 900, 1500), 0.7);
    for (let i = 0; i < v.length; i++) v[i] = lp.run(v[i]);
    const t = rng() * (T - dur);
    const pan = rng();
    const a = rrange(rng, 0.3, 1);
    addPanned(outs, v, sr, t, a, pan);
  }
  for (const c of outs) distant(c, sr, 1600, [[0.31, 0.35], [0.72, 0.2]]);
  return finishLoop(outs, sr, X, 0.8);
}

// rain: a hiss of pink noise under thousands of tiny droplet ticks, with a soft low wash of heavy rain
function bedRain(sr, rng) {
  const Ls = 8;
  const X = 1;
  const n = Math.ceil((Ls + X) * sr);
  const outs = [];
  for (let ch = 0; ch < 2; ch++) {
    const c = new Float32Array(n);
    const pk = new Pink(rng);
    const hp = new Biquad().hp(sr, 500, 0.7);
    const lp = new Biquad().lp(sr, 7500, 0.6);
    const br = new Brown(rng);
    const lpb = new Biquad().lp(sr, 260, 0.7);
    const sw = new Wander(rng, sr, 0.35);
    for (let i = 0; i < n; i++) c[i] = lp.run(hp.run(pk.next())) * (0.85 + 0.15 * sw.next()) * 1.4 + lpb.run(br.next()) * 0.5;
    // droplets: short decaying pings at random pitches, a few loud ones close by
    const count = Math.floor(n / sr * 900);
    for (let k = 0; k < count; k++) {
      const i0 = Math.floor(rng() * n);
      const f = rrange(rng, 1800, 6500);
      const a = Math.pow(rng(), 4) * 0.9 + 0.05;
      const len = Math.floor(sr * 0.006);
      const w = (TAU * f) / sr;
      for (let j = 0; j < len && i0 + j < n; j++) c[i0 + j] += Math.sin(w * j) * a * Math.exp(-j / (len * 0.25));
    }
    outs.push(c);
  }
  return finishLoop(outs, sr, X, 0.8);
}

// ------------------------------------------------------------------ ambient one-shots (mono; engine positions them)
export function crow(sr, rng) {
  const caws = 2 + Math.floor(rng() * 3);
  const out = alloc(sr, caws * 0.48 + 0.5);
  const base = rrange(rng, 480, 600);
  for (let k = 0; k < caws; k++) {
    const d = rrange(rng, 0.22, 0.34);
    const c = new Float32Array(Math.floor(d * sr));
    const b1 = new Biquad().bp(sr, 1300, 3);
    const b2 = new Biquad().bp(sr, 2300, 4);
    const w = new Wander(rng, sr, 130);
    let ph = 0;
    for (let i = 0; i < c.length; i++) {
      const u = i / c.length;
      const f = base * (u < 0.3 ? lerp(0.9, 1.1, u / 0.3) : lerp(1.1, 0.85, (u - 0.3) / 0.7));
      ph += f / sr;
      const src = (2 * (ph % 1) - 1) * (1 + 0.9 * w.next()) + (rng() * 2 - 1) * 0.4;
      c[i] = Math.tanh((b1.run(src) + b2.run(src) * 0.7) * 3) * Math.min(1, u * 15) * Math.pow(1 - u, 0.7);
    }
    addNorm(out, c, sr, k * rrange(rng, 0.38, 0.5), rrange(rng, 0.7, 1));
  }
  distant(out, sr, 3500, [[0.3, 0.18]]);
  return finish(out, sr);
}
export function bird(sr, rng, i) {
  return birdPhrase(sr, rng, i % 3);
}
function owl(sr, rng, i) {
  const pat = i % 2 ? [[0, 0.35], [0.55, 0.18], [0.78, 0.22], [1.25, 0.55]] : [[0, 0.45], [0.9, 0.3], [1.35, 0.6]];
  const out = alloc(sr, 2.6);
  const f0 = rrange(rng, 340, 400);
  for (const [t, d] of pat) {
    const c = new Float32Array(Math.floor(d * sr));
    const lp = new Biquad().bp(sr, f0 * 1.1, 2);
    let ph = 0;
    for (let j = 0; j < c.length; j++) {
      const u = j / c.length;
      ph += (f0 * (1 - 0.06 * u)) / sr;
      const env = Math.min(1, u * 5) * Math.pow(1 - u, 1.2);
      c[j] = (Math.sin(TAU * ph) + 0.08 * Math.sin(2 * TAU * ph) + lp.run(rng() * 2 - 1) * 0.5) * env;
    }
    addNorm(out, c, sr, t, 0.9);
  }
  distant(out, sr, 1800, [[0.33, 0.2]]);
  return finish(out, sr);
}
export function wolf(sr, rng, i) {
  const dur = rrange(rng, 3.6, 5);
  const out = alloc(sr, dur + 2.2);
  const howl = (f0, d, vibHz) => {
    const n = Math.floor(d * sr);
    const c = new Float32Array(n);
    const fm = new Biquad();
    const w = new Wander(rng, sr, 0.8);
    let ph = 0;
    for (let j = 0; j < n; j++) {
      const t = j / sr;
      const u = j / n;
      if ((j & 63) === 0) fm.bp(sr, lerp(700, 1100, Math.sin(Math.PI * u)), 1.4);
      let f = u < 0.15 ? lerp(f0 * 0.62, f0, Math.sin((u / 0.15) * Math.PI * 0.5)) : u > 0.75 ? lerp(f0, f0 * 0.7, (u - 0.75) / 0.25) : f0 * (1 + 0.03 * w.next());
      f *= 1 + 0.012 * Math.sin(TAU * vibHz * t) * Math.min(1, t);
      ph += f / sr;
      const s = Math.sin(TAU * ph) + 0.45 * Math.sin(2 * TAU * ph) + 0.2 * Math.sin(3 * TAU * ph) + 0.08 * Math.sin(4 * TAU * ph);
      const env = Math.min(1, t / 0.35) * (u > 0.8 ? (1 - u) / 0.2 : 1);
      c[j] = (s * 0.6 + fm.run(s) * 1.2 + (rng() * 2 - 1) * 0.04) * env;
    }
    return c;
  };
  const f0 = rrange(rng, 480, 560);
  addNorm(out, howl(f0, dur, rrange(rng, 4.5, 6)), sr, 0, 1);
  if (i === 2) addNorm(out, howl(f0 * 1.26, dur * 0.8, 5.2), sr, 0.9, 0.7);
  distant(out, sr, 2200, [[0.41, 0.35], [0.95, 0.2], [1.6, 0.1]]);
  return finish(out, sr, 0.9, 0.01, 0.4);
}
export function scream(sr, rng) {
  const b = rrange(rng, 620, 760);
  const d = rrange(rng, 1.5, 2.2);
  const v = voice(sr, rng, {
    dur: d, pitch: [[0, b * 0.8], [0.1, b * 1.2], [0.5, b * 1.1], [0.8, b], [1, b * 0.65]], vowels: [[0, 'ae'], [0.3, 'a'], [1, 'a']],
    fscale: 1.22, bw: 1.3, jitter: 0.04, vib: 0.02, vibHz: 6, shimmer: 0.2, rasp: 0.35, breath: 0.3, drive: 2.2, chest: 0.1,
    env: [[0, 0], [0.08, 1], [0.7, 0.85], [1, 0]],
  });
  const out = alloc(sr, d + 1.4);
  addNorm(out, v, sr, 0, 1);
  distant(out, sr, 1800, [[0.45, 0.35], [1.05, 0.18]]);
  return finish(out, sr, 0.9, 0.01, 0.3);
}
export function whisper(sr, rng) {
  const dur = rrange(rng, 1.8, 2.8);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const vv = ['a', 'e', 'i', 'o', 'u', 'uh', 'er'];
  const pts = [];
  const env = [[0, 0]];
  let t = 0.05;
  while (t < dur - 0.15) {
    const sl = rrange(rng, 0.09, 0.2);
    pts.push([t / dur, vv[Math.floor(rng() * vv.length)]]);
    env.push([t / dur, 0.1], [(t + sl * 0.3) / dur, rrange(rng, 0.5, 1)], [(t + sl) / dur, 0.15]);
    t += sl + (rng() < 0.2 ? rrange(rng, 0.08, 0.25) : 0.01);
  }
  env.push([1, 0]);
  const v = voice(sr, rng, {
    dur, pitch: [[0, 150], [1, 140]], vowels: pts.length > 1 ? pts : [[0, 'a'], [1, 'u']], voiced: 0, breath: 1.4, bw: 1.3,
    drive: 1.2, hp: 400, a3: 0.7, a4: 0.4, env,
  });
  addNorm(out, v, sr, 0, 1);
  // sibilants
  for (let k = 0; k < 3 + rng() * 3; k++) {
    const s = noise(sr, rng, rrange(rng, 0.08, 0.16), { hp: 4500, env: hann });
    addNorm(out, s, sr, rng() * (dur - 0.2), rrange(rng, 0.2, 0.45));
  }
  return finish(out, sr, 0.85, 0.02, 0.1);
}
function treeCreak(sr, rng) {
  const d = rrange(rng, 1.4, 3);
  const out = alloc(sr, d + 0.3);
  addNorm(out, creak(sr, rng, d, rrange(rng, 8, 20), rrange(rng, 35, 80), rrange(rng, 0.6, 1)), sr, 0, 1);
  return finish(out, sr);
}
export function twig(sr, rng) {
  const out = alloc(sr, 0.5);
  addNorm(out, noise(sr, rng, 0.02, { hp: 1000, a: 0.0002, d: 0.003 }), sr, 0, 0.8);
  addNorm(out, modal(sr, rng, [{ f: rrange(rng, 800, 1100), d: 0.015 }, { f: rrange(rng, 1600, 2000), d: 0.012, a: 0.7 }, { f: 2900, d: 0.008, a: 0.5 }], 0.1, 0.4), sr, 0, 1);
  addNorm(out, modal(sr, rng, [{ f: rrange(rng, 1200, 1500), d: 0.01 }, { f: 2400, d: 0.008, a: 0.6 }], 0.08, 0.3), sr, rrange(rng, 0.02, 0.05), 0.5);
  addNorm(out, noise(sr, rng, 0.2, { hp: 2500, lp: 7000, env: hann }), sr, 0.03, 0.2);
  return finish(out, sr);
}
export function bell(sr, rng) {
  const f = 196;
  const r = [0.5, 1, 1.19, 1.5, 2, 2.52, 3.0, 4.07];
  const d = [5, 3.6, 2.6, 2.2, 1.9, 1.3, 0.9, 0.6];
  const a = [0.5, 0.8, 0.6, 0.35, 1, 0.3, 0.25, 0.15];
  const modes = [];
  for (let k = 0; k < r.length; k++) {
    modes.push({ f: f * r[k], d: d[k], a: a[k] });
    modes.push({ f: f * r[k] * 1.0025, d: d[k] * 0.9, a: a[k] * 0.4 });
  }
  const out = modal(sr, rng, modes, 6.5, 2, 3000);
  distant(out, sr, 1500, [[0.5, 0.25], [1.2, 0.12]]);
  return finish(out, sr, 0.85, 0.001, 0.5);
}
export function woodpecker(sr, rng) {
  const out = alloc(sr, 1.3);
  let t = 0.01;
  for (let k = 0; k < 14; k++) {
    addNorm(out, modal(sr, rng, [{ f: 1050, d: 0.01 }, { f: 1850, d: 0.008, a: 0.7 }, { f: 2650, d: 0.006, a: 0.5 }], 0.05, 0.3), sr, t, 1 - k * 0.03);
    t += 1 / (16 + k * 0.4);
  }
  distant(out, sr, 3000, [[0.35, 0.15]]);
  return finish(out, sr);
}

// thunder, far: a long low roll that swells and rattles as the sound arrives from the length of the bolt
export function thunder(sr, rng) {
  const dur = rrange(rng, 6.5, 9);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const br = new Brown(rng);
  const lp = new Biquad().lp(sr, rrange(rng, 160, 260), 0.7);
  const lp2 = new Biquad().lp(sr, 520, 0.6);
  const pk = new Pink(rng);
  const rattle = new Wander(rng, sr, 9);
  // swells: [time, attack, decay, gain]
  const swells = [];
  let t = rrange(rng, 0.02, 0.3);
  for (let k = 0; k < 3 + Math.floor(rng() * 3); k++) {
    swells.push([t, rrange(rng, 0.08, 0.35), rrange(rng, 0.8, 2.2), k === 0 ? rrange(rng, 0.6, 1) : rrange(rng, 0.35, 1)]);
    t += rrange(rng, 0.5, 1.8);
  }
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    let e = 0;
    for (const [t0, a, d, g] of swells) if (tt > t0) e += g * (tt - t0 < a ? (tt - t0) / a : Math.exp(-(tt - t0 - a) / d));
    const r = 0.65 + 0.35 * rattle.next();
    out[i] = (lp.run(br.next()) * 2.2 + lp2.run(pk.next()) * 0.5) * e * r;
  }
  return finish(out, sr, 0.9, 0.05, 1.2);
}
// thunder, close: a ripping crack right overhead, a chest-thumping boom, then the roll
function thunderNear(sr, rng) {
  const out = alloc(sr, 7.5);
  // the tear: a burst of crackles over the first ~0.3 s on top of a white-hot snap
  addNorm(out, noise(sr, rng, 0.25, { hp: 600, a: 0.0006, d: 0.04 }), sr, 0, 1);
  addNorm(out, crackles(sr, rng, 0.45, 240, { hp: 700, bp: 1900, pow: 2, env: (u) => Math.exp(-u * 3) }), sr, 0.01, 0.8);
  addNorm(out, noise(sr, rng, 1.4, { lp: 1600, a: 0.005, d: 0.35, pink: true }), sr, 0.02, 0.75);
  addNorm(out, thump(sr, 70, 34, 0.25, 0.7, 2.2), sr, 0.03, 0.95);
  const roll = thunder(sr, rng);
  addNorm(out, roll, sr, 0.35, 0.8);
  return finish(out, sr, 0.95, 0.0005, 1);
}

// ------------------------------------------------------------------ registries
export const AMB_DEFS = [
  { bank: 'bed_wind', n: 1, sr: LO, gen: bedWind },
  { bank: 'bed_pines', n: 1, sr: LO, gen: bedPines },
  { bank: 'bed_crickets', n: 1, sr: MID, gen: bedCrickets },
  { bank: 'bed_drone', n: 1, sr: LO, gen: bedDrone },
  { bank: 'bed_home', n: 1, sr: LO, group: 'late', gen: bedHome },
  { bank: 'bed_horde', n: 1, sr: LO, group: 'late', gen: bedHorde },
  { bank: 'bed_rain', n: 1, sr: MID, group: 'late', gen: bedRain },
  { bank: 'amb_thunder', n: 3, sr: LO, group: 'late', gen: thunder },
  { bank: 'amb_thunder_near', n: 2, sr: LO, group: 'late', gen: thunderNear },
  { bank: 'amb_crow', n: 3, sr: LO, group: 'late', gen: crow },
  { bank: 'amb_bird', n: 4, sr: MID, group: 'late', gen: bird },
  { bank: 'amb_owl', n: 2, sr: LO, group: 'late', gen: owl },
  { bank: 'amb_wolf', n: 3, sr: LO, group: 'late', gen: wolf },
  { bank: 'amb_scream', n: 2, sr: LO, group: 'late', gen: scream },
  { bank: 'amb_whisper', n: 3, sr: MID, group: 'late', gen: whisper },
  { bank: 'amb_creak', n: 4, sr: LO, group: 'late', gen: treeCreak },
  { bank: 'amb_twig', n: 2, sr: MID, group: 'late', gen: twig },
  { bank: 'amb_bell', n: 1, sr: LO, group: 'late', gen: bell },
  { bank: 'amb_woodpecker', n: 1, sr: MID, group: 'late', gen: woodpecker },
];
