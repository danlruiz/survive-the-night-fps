// Pure generators for the score: the instruments music.js plays (piano, music box, taiko, bass, brass, swells) and
// the cinematic stingers, with their bank registries (MUSIC_DEFS, STINGER_DEFS; registry.js gathers them).
import { TAU, clamp, lerp, rrange, Biquad, Wander, Curve, polyblep, hann, alloc, normalize, finish, softclip, mixInto, reverse, widen, semis, mtof, peakOf } from './dsp.js';
import { HI, MID, LO, addNorm, thump, noise, modal, metalModes, woodModes, distant } from './synth-blocks.js';
import { voice } from './synth-voice.js';
import { birdPhrase } from './synth-events.js';
import { metalHit } from './synth-world.js';

// detuned saw pad with a time-varying low-pass. freqs: Hz list. lp: [[u, hz]]
function padChord(sr, rng, freqs, dur, o = {}) {
  const n = Math.floor(dur * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const det = o.detune ?? 8;
  const voices = [];
  freqs.forEach((f, j) => {
    for (let v = 0; v < 2; v++) {
      const cents = (v ? 1 : -1) * det * rrange(rng, 0.6, 1.2);
      const pan = clamp(0.5 + (j % 2 ? 0.3 : -0.3) * rrange(rng, 0.3, 1) + (v ? 0.1 : -0.1), 0, 1);
      voices.push({ inc: (f * semis(cents / 100)) / sr, ph: rng(), gl: Math.sqrt(1 - pan), gr: Math.sqrt(pan), a: o.amps ? o.amps[j] : 1 });
    }
  });
  for (let i = 0; i < n; i++) {
    let l = 0;
    let r = 0;
    for (let k = 0; k < voices.length; k++) {
      const vo = voices[k];
      vo.ph += vo.inc;
      if (vo.ph >= 1) vo.ph -= 1;
      const s = (2 * vo.ph - 1 - polyblep(vo.ph, vo.inc)) * vo.a;
      l += s * vo.gl;
      r += s * vo.gr;
    }
    L[i] = l;
    R[i] = r;
  }
  const lpc = new Curve(o.lp ?? [[0, 900], [1, 900]]);
  const att = o.attack ?? 1;
  const rel = o.release ?? 1.5;
  const f = [new Biquad(), new Biquad(), new Biquad(), new Biquad()];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 63) === 0) {
      const fc = lpc.at(i / n);
      f[0].lp(sr, fc, 0.8);
      f[1].lp(sr, fc, 0.6);
      f[2].lp(sr, fc, 0.8);
      f[3].lp(sr, fc, 0.6);
    }
    const e = Math.min(1, Math.pow(t / att, 1.5)) * (t > dur - rel ? Math.max(0, (dur - t) / rel) : 1);
    L[i] = f[1].run(f[0].run(L[i])) * e;
    R[i] = f[3].run(f[2].run(R[i])) * e;
  }
  return [L, R];
}

// ------------------------------------------------------------------ music instruments
function pianoNote(sr, rng, f0, dur) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const B = 0.0003;
  const tauBase = 2.8 * Math.pow(220 / f0, 0.45);
  const fmax = Math.min(sr * 0.45, 7000);
  for (let k = 1; k <= 18; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > fmax) break;
    const bright = Math.exp(-((k - 1) * f0) / 2200);
    const hammer = Math.abs(Math.sin((Math.PI * k) / 7.3)) * 0.7 + 0.3;
    const ak = (1 / Math.pow(k, 0.9)) * (0.25 + 0.75 * bright) * hammer;
    const tau = tauBase / (1 + 0.35 * (k - 1));
    const detC = 0.6 + rng() * 0.9;
    const strings = k <= 6 ? 2 : 1;
    for (let s = 0; s < strings; s++) {
      const fr = fk * (strings === 2 ? semis(((s ? 1 : -1) * detC) / 100) : 1);
      const w = (TAU * fr) / sr;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      let x = 1;
      let y = 0;
      let e1 = 0.6 * ak / strings;
      let e2 = 0.4 * ak / strings;
      const r1 = Math.exp(-1 / (tau * 0.22 * sr));
      const r2 = Math.exp(-1 / (tau * sr));
      for (let i = 0; i < n; i++) {
        out[i] += y * (e1 + e2);
        const nx = x * cw - y * sw;
        y = x * sw + y * cw;
        x = nx;
        e1 *= r1;
        e2 *= r2;
        if ((i & 1023) === 0 && e1 + e2 < 1e-5) break;
      }
    }
  }
  addNorm(out, noise(sr, rng, 0.03, { lp: 1200, a: 0.0005, d: 0.006 }), sr, 0, 0.04);
  const a = Math.floor(0.002 * sr);
  for (let i = 0; i < a; i++) out[i] *= i / a;
  return finish(out, sr, 0.9, 0.001, Math.min(0.4, dur * 0.1));
}
function musicBox(sr, rng, f0) {
  const out = modal(sr, rng, [
    { f: f0, d: 1.5, a: 1 },
    { f: f0 * 2.01, d: 0.5, a: 0.1 },
    { f: f0 * 5.4, d: 0.32, a: 0.35 },
    { f: f0 * 8.93, d: 0.18, a: 0.16 },
    { f: f0 * 12.1, d: 0.09, a: 0.08 },
  ], 3.2, 0.3, 0);
  addNorm(out, noise(sr, rng, 0.004, { hp: 4000, a: 0.0001, d: 0.001 }), sr, 0, 0.05);
  return finish(out, sr, 0.9, 0.0005, 0.3);
}
// kind 0 big drum, 1 mid drum, 2 rim / ka
export function taiko(sr, rng, kind) {
  if (kind === 2) {
    const out = alloc(sr, 0.35);
    addNorm(out, modal(sr, rng, woodModes(rng, 2.6, 0.7), 0.3, 0.8, 5000), sr, 0, 1);
    addNorm(out, noise(sr, rng, 0.02, { bp: [3000, 1], a: 0.0002, d: 0.004 }), sr, 0, 0.5);
    return finish(out, sr);
  }
  const dur = kind ? 1.2 : 1.9;
  const f0 = kind ? rrange(rng, 88, 96) : rrange(rng, 54, 60);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const r = [1, 1.59, 2.14, 2.3, 2.65, 2.92];
  const am = [1, 0.5, 0.35, 0.25, 0.18, 0.12];
  const dd = [0.7, 0.35, 0.25, 0.2, 0.15, 0.1];
  const dm = kind ? 0.55 : 1;
  for (let k = 0; k < r.length; k++) {
    let ph = rng();
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (f0 * r[k] * (1 + 0.22 * Math.exp(-t / 0.035))) / sr;
      out[i] += Math.sin(TAU * ph) * am[k] * Math.exp(-t / (dd[k] * dm)) * (1 - Math.exp(-t / 0.0015));
    }
  }
  addNorm(out, noise(sr, rng, 0.05, { bp: [1500, 0.8], a: 0.0003, d: 0.01 }), sr, 0, 0.35);
  addNorm(out, noise(sr, rng, 0.2, { lp: 450, a: 0.001, d: 0.05 }), sr, 0, 0.5);
  softclip(out, 1.6);
  return finish(out, sr, 0.92, 0.0003, 0.2);
}
function subPulse(sr, rng) {
  const out = alloc(sr, 0.8);
  addNorm(out, thump(sr, 58, 44, 0.05, 0.12), sr, 0, 1);
  addNorm(out, thump(sr, 52, 40, 0.05, 0.1), sr, 0.22, 0.7);
  addNorm(out, noise(sr, rng, 0.1, { lp: 200, env: hann }), sr, 0, 0.25);
  return finish(out, sr);
}
function bassNote(sr, rng) {
  const dur = 0.75;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const lp = new Biquad();
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) lp.lp(sr, 250 + 1300 * Math.exp(-t / 0.09), 3);
    const d1 = 55 / sr;
    const d2 = 55.3 / sr;
    p1 += d1;
    if (p1 >= 1) p1 -= 1;
    p2 += d2;
    if (p2 >= 1) p2 -= 1;
    p3 += 27.5 / sr;
    const saw = 2 * p1 - 1 - polyblep(p1, d1);
    const sq = (p2 < 0.5 ? 1 : -1) + polyblep(p2, d2) - polyblep((p2 + 0.5) % 1, d2);
    const e = Math.min(1, t / 0.004) * (0.55 * Math.exp(-t / 0.12) + 0.45) * (t > dur - 0.12 ? (dur - t) / 0.12 : 1);
    out[i] = Math.tanh((lp.run(saw * 0.6 + sq * 0.4) + Math.sin(TAU * p3) * 0.4) * 3) * e;
  }
  return finish(out, sr, 0.9, 0.001, 0.02);
}
function brassStab(sr, rng) {
  const dur = 2.6;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const vo = [55, 55 * 1.004, 55 * 0.996, 110, 110 * 1.003, 110 * 0.997, 82.4].map((f) => ({ inc: f / sr, ph: rng() }));
  const lp = new Biquad();
  const lp2 = new Biquad();
  const w = new Wander(rng, sr, 30);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < 0.12 ? t / 0.12 : t < 2 ? lerp(1, 0.55, (t - 0.12) / 1.88) : 0.55 * Math.max(0, 1 - (t - 2) / 0.6);
    if ((i & 15) === 0) {
      lp.lp(sr, 180 + 2400 * env * env, 1.5);
      lp2.lp(sr, 200 + 2600 * env * env, 0.7);
    }
    let s = 0;
    for (const v of vo) {
      v.ph += v.inc;
      if (v.ph >= 1) v.ph -= 1;
      s += 2 * v.ph - 1 - polyblep(v.ph, v.inc);
    }
    out[i] = Math.tanh(lp2.run(lp.run(s * 0.3)) * 2.5 * (1 + 0.1 * w.next())) * Math.min(1, t / 0.06) * (t > 2 ? Math.max(0, 1 - (t - 2) / 0.6) : 1);
  }
  return finish(out, sr, 0.9, 0.002, 0.1);
}
function revSwell(sr, rng, i) {
  const dur = 4.2;
  const n = Math.floor(dur * sr);
  let fwd;
  if (i === 0) {
    fwd = new Float32Array(n);
    for (const f of [110, 116.54, 155.56]) addNorm(fwd, pianoNote(sr, rng, f, dur), sr, 0, 0.5);
    addNorm(fwd, noise(sr, rng, dur, { lp: 2500, env: (u) => Math.exp(-u * 4) }), sr, 0, 0.35);
  } else {
    fwd = noise(sr, rng, dur, { hp: 2500, env: (u) => Math.exp(-u * 3.5) });
    normalize(fwd, 0.6);
    addNorm(fwd, thump(sr, 60, 50, 1, 1.6, dur), sr, 0, 0.5);
  }
  const rv = reverse(fwd);
  for (let k = 0; k < n; k++) rv[k] *= Math.pow(k / n, 1.2);
  const st = widen(rv, sr, 11, 0.4);
  return finish(st, sr, 0.85, 0.05, 0.004);
}
export function scrape(sr, rng) {
  const dur = 2.3;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const w = new Wander(rng, sr, 12);
  const rw = new Wander(rng, sr, 70);
  const bp = new Biquad().bp(sr, 2500, 2);
  const hp = new Biquad().hp(sr, 2000, 0.7);
  const f0 = rrange(rng, 1100, 1400);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const inc = (f0 * (1 + 0.03 * w.next())) / sr;
    ph += inc;
    if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - polyblep(ph, inc);
    const bow = hp.run(rng() * 2 - 1) * (0.5 + 0.5 * Math.abs(rw.next()));
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, u / 0.7) * 0.5), 2) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
    out[i] = Math.tanh((bp.run(saw) * 1.2 + bow * 0.5 + saw * 0.15) * 2) * env;
  }
  return finish(out, sr, 0.85);
}

// ------------------------------------------------------------------ stingers (stereo)
function st2(sr, dur) {
  const n = Math.floor(dur * sr);
  return [new Float32Array(n), new Float32Array(n)];
}
function addSt(dst, src, sr, t, peak, pan = 0.5) {
  if (Array.isArray(src)) {
    const m = Math.max(1e-9, peakOf(src));
    mixInto(dst[0], src[0], Math.floor(t * sr), peak / m);
    mixInto(dst[1], src[1], Math.floor(t * sr), peak / m);
  } else {
    addNorm(dst[0], src, sr, t, peak * Math.sqrt(1 - pan) * 1.41);
    addNorm(dst[1], src, sr, t, peak * Math.sqrt(pan) * 1.41);
  }
}

function stgNight(sr, rng) {
  const out = st2(sr, 8);
  addSt(out, thump(sr, 55, 30, 0.3, 1.3, 4), sr, 0, 0.7);
  addSt(out, padChord(sr, rng, [36.71, 73.42, 77.78, 103.83, 146.83], 7.8, { attack: 3.2, release: 3, detune: 12, lp: [[0, 150], [0.45, 1400], [1, 250]] }), sr, 0, 0.8);
  // distant horn
  const hd = 3;
  const hn = Math.floor(hd * sr);
  const horn = new Float32Array(hn);
  const b1 = new Biquad().bp(sr, 700, 2);
  const lp = new Biquad().lp(sr, 1200, 0.7);
  let ph = 0;
  for (let i = 0; i < hn; i++) {
    const t = i / sr;
    const inc = lerp(146.83, 139, t / hd) / sr;
    ph += inc;
    if (ph >= 1) ph -= 1;
    const s = 2 * ph - 1 - polyblep(ph, inc);
    horn[i] = lp.run(b1.run(s) * 2 + s * 0.3) * Math.min(1, t / 0.5) * (t > hd - 1.2 ? (hd - t) / 1.2 : 1);
  }
  distant(horn, sr, 1300, [[0.45, 0.4], [0.97, 0.22], [1.6, 0.1]]);
  addSt(out, horn, sr, 1.8, 0.45, 0.35);
  const wh = new Float32Array(Math.floor(6 * sr));
  for (let i = 0; i < wh.length; i++) {
    const t = i / sr;
    wh[i] = (Math.sin(TAU * 1760 * t) + Math.sin(TAU * 1767 * t)) * hann(i / wh.length);
  }
  addSt(out, wh, sr, 1.5, 0.04, 0.6);
  return finish(out, sr, 0.9, 0.01, 0.5);
}
function stgDawn(sr, rng) {
  const out = st2(sr, 7.5);
  addSt(out, padChord(sr, rng, [73.42, 110, 146.83, 185, 220, 329.63, 369.99], 7.4, { attack: 2, release: 3.2, detune: 6, lp: [[0, 400], [0.4, 1300], [1, 600]] }), sr, 0, 0.6);
  const notes = [[440, 1.0], [587.33, 1.6], [659.25, 2.2], [739.99, 3.0]];
  for (const [f, t] of notes) addSt(out, musicBox(sr, rng, f), sr, t, 0.22, rng());
  for (let k = 0; k < 5; k++) addSt(out, birdPhrase(sr, rng, k % 3), sr, 2 + rng() * 4, rrange(rng, 0.1, 0.2), rng());
  return finish(out, sr, 0.85, 0.05, 0.6);
}
function stgDeath(sr, rng) {
  const out = st2(sr, 5.8);
  addSt(out, thump(sr, 72, 26, 0.15, 0.9, 3), sr, 0, 1);
  addSt(out, noise(sr, rng, 0.8, { lp: 800, a: 0.002, d: 0.25 }), sr, 0, 0.6);
  addSt(out, modal(sr, rng, metalModes(rng, 70, 2.5), 4, 2, 1500), sr, 0, 0.4);
  const n = Math.floor(5.5 * sr);
  const tin = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    tin[i] = (Math.sin(TAU * 3800 * t) + 0.7 * Math.sin(TAU * 3806 * t)) * Math.min(1, t / 0.05) * Math.exp(-t / 2.2);
  }
  addSt(out, tin, sr, 0.05, 0.18);
  addSt(out, padChord(sr, rng, [36.71, 55, 38.89], 5.5, { attack: 0.8, release: 3.5, detune: 10, lp: [[0, 300], [1, 120]] }), sr, 0.1, 0.4);
  return finish(out, sr, 0.9, 0.0005, 0.6);
}
function stgBoss(sr, rng) {
  const out = st2(sr, 5);
  addSt(out, padChord(sr, rng, [36.71, 55, 73.42, 77.78, 110], 4.6, { attack: 0.12, release: 2, detune: 14, lp: [[0, 150], [0.05, 2800], [0.45, 900], [1, 300]] }), sr, 0, 1);
  const roar = voice(sr, rng, {
    dur: 2.6, pitch: [[0, 40], [0.15, 55], [0.6, 50], [1, 32]], vowels: [[0, 'o'], [0.3, 'a'], [1, 'u']], fscale: 0.5, bw: 2.2,
    jitter: 0.08, shimmer: 0.5, sub: 0.6, gurgle: 0.45, rasp: 0.8, raspHz: 80, breath: 0.5, drive: 6, chest: 1.2,
    env: [[0, 0], [0.08, 1], [0.6, 0.9], [1, 0]],
  });
  addSt(out, roar, sr, 0.3, 0.7);
  addSt(out, thump(sr, 60, 28, 0.3, 1, 3), sr, 0, 0.8);
  softclip(out, 1.6);
  return finish(out, sr, 0.95, 0.001, 0.5);
}
function stgVictory(sr, rng) {
  const out = st2(sr, 8);
  addSt(out, padChord(sr, rng, [58.27, 116.54, 146.83, 174.61, 220], 3.4, { attack: 1.2, release: 1.2, detune: 7, lp: [[0, 500], [1, 1400]] }), sr, 0, 0.55);
  addSt(out, padChord(sr, rng, [73.42, 146.83, 185, 220, 293.66, 369.99], 5, { attack: 1.0, release: 2.8, detune: 7, lp: [[0, 900], [0.3, 1800], [1, 700]] }), sr, 2.8, 0.6);
  const arp = [587.33, 739.99, 880, 1174.66];
  arp.forEach((f, k) => addSt(out, musicBox(sr, rng, f), sr, 3.1 + k * 0.42, 0.22, 0.3 + k * 0.15));
  addSt(out, pianoNote(sr, rng, 73.42, 4.5), sr, 2.8, 0.35);
  return finish(out, sr, 0.85, 0.05, 0.6);
}
function stgGameOver(sr, rng) {
  const out = st2(sr, 8);
  const seq = [[146.83, 0], [130.81, 0.7], [116.54, 1.4], [103.83, 2.1]];
  for (const [f, t] of seq) addSt(out, pianoNote(sr, rng, f, 3.5), sr, t, 0.4, 0.4 + rng() * 0.2);
  addSt(out, pianoNote(sr, rng, 36.71, 5), sr, 3.2, 0.6);
  addSt(out, pianoNote(sr, rng, 51.91, 5), sr, 3.2, 0.4);
  addSt(out, thump(sr, 50, 28, 0.3, 1.2, 3), sr, 3.2, 0.6);
  addSt(out, padChord(sr, rng, [36.71, 38.89, 51.91], 7.5, { attack: 2, release: 3.5, detune: 12, lp: [[0, 200], [0.5, 500], [1, 120]] }), sr, 0.3, 0.45);
  return finish(out, sr, 0.85, 0.01, 0.8);
}
function stgJumpscare(sr, rng) {
  const dur = 2;
  const out = st2(sr, dur);
  const n = Math.floor(1.8 * sr);
  const set = [0, 1, 6, 7, 11, 13, 18, 19, 23, 25];
  for (let ch = 0; ch < 2; ch++) {
    const c = new Float32Array(n);
    const vo = set.map((s) => ({ inc: (523.25 * semis(s + (rng() - 0.5) * 0.3)) / sr, ph: rng() }));
    const lp = new Biquad().lp(sr, 6000, 0.7);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const v of vo) {
        v.ph += v.inc;
        if (v.ph >= 1) v.ph -= 1;
        s += 2 * v.ph - 1 - polyblep(v.ph, v.inc);
      }
      const trem = 0.75 + 0.25 * Math.sin(TAU * 14 * t + ch);
      c[i] = lp.run(s * 0.2) * Math.min(1, t / 0.004) * Math.exp(-t / 0.55) * trem;
    }
    mixInto(out[ch], c, 0, 1);
  }
  normalize(out, 0.8);
  addSt(out, noise(sr, rng, 0.25, { hp: 2000, a: 0.001, d: 0.06 }), sr, 0, 0.5);
  addSt(out, thump(sr, 65, 30, 0.08, 0.3), sr, 0, 0.8);
  softclip(out, 2);
  return finish(out, sr, 0.95, 0.0005, 0.2);
}
function stgJoin(sr, rng) {
  const out = st2(sr, 3.2);
  addSt(out, padChord(sr, rng, [73.42, 110, 146.83], 3.1, { attack: 0.9, release: 1.6, detune: 6, lp: [[0, 300], [0.5, 700], [1, 300]] }), sr, 0, 0.5);
  addSt(out, musicBox(sr, rng, 587.33), sr, 0.45, 0.25, 0.6);
  return finish(out, sr, 0.7, 0.05, 0.5);
}
function stgCarPart(sr, rng) {
  const out = st2(sr, 2.8);
  addSt(out, metalHit(sr, rng, 185), sr, 0, 0.6, 0.45);
  const arp = [587.33, 739.99, 880, 1174.66];
  arp.forEach((f, k) => addSt(out, musicBox(sr, rng, f), sr, 0.3 + k * 0.16, 0.3, 0.3 + k * 0.13));
  addSt(out, padChord(sr, rng, [146.83, 220, 293.66, 369.99], 2.4, { attack: 0.3, release: 1.4, detune: 6, lp: [[0, 600], [1, 1200]] }), sr, 0.3, 0.3);
  return finish(out, sr, 0.85, 0.001, 0.4);
}

// The notes (MIDI) the instrument banks are rendered at, one per variant: mus_piano i is A(1+i), mus_box i is A(4+i)
// (music.js plays each note from the nearest of them); mus_taiko i is the drum kind.
export const PIANO_NOTES = [33, 45, 57, 69, 81];
export const BOX_NOTES = [69, 81];
export const MUSIC_DEFS = [
  { bank: 'mus_piano', n: 5, sr: MID, gen: (sr, r, i) => pianoNote(sr, r, mtof(PIANO_NOTES[i]), [7, 6, 5, 4, 3][i]) },
  { bank: 'mus_box', n: 2, sr: HI, gen: (sr, r, i) => musicBox(sr, r, mtof(BOX_NOTES[i])) },
  { bank: 'mus_taiko', n: 3, sr: MID, gen: taiko },
  { bank: 'mus_pulse', n: 1, sr: LO, gen: subPulse },
  { bank: 'mus_swell', n: 2, sr: MID, gen: revSwell },
  { bank: 'mus_bass', n: 1, sr: MID, group: 'late', gen: bassNote },
  { bank: 'mus_brass', n: 1, sr: MID, group: 'late', gen: brassStab },
  { bank: 'mus_scrape', n: 1, sr: MID, group: 'late', gen: scrape },
];

export const STINGER_DEFS = [
  { bank: 'stg_night', n: 1, sr: MID, group: 'late', gen: stgNight },
  { bank: 'stg_dawn', n: 1, sr: MID, group: 'late', gen: stgDawn },
  { bank: 'stg_death', n: 1, sr: MID, group: 'late', gen: stgDeath },
  { bank: 'stg_boss', n: 1, sr: MID, group: 'late', gen: stgBoss },
  { bank: 'stg_victory', n: 1, sr: MID, group: 'late', gen: stgVictory },
  { bank: 'stg_gameover', n: 1, sr: MID, group: 'late', gen: stgGameOver },
  { bank: 'stg_jumpscare', n: 1, sr: HI, group: 'late', gen: stgJumpscare },
  { bank: 'stg_join', n: 1, sr: MID, gen: stgJoin },
  { bank: 'stg_car_part', n: 1, sr: HI, group: 'late', gen: stgCarPart },
];
