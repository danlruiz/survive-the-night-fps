// The voice: a glottal pulse through formant filters, the source of every zombie, creature and survivor sound
// (synth-creatures.js) and of the ambience's voices (synth-amb.js). Pure, like dsp.js.
import { TAU, clamp, rrange, Biquad, OnePole, Wander, Curve, polyblep, normalize, finish } from './dsp.js';
import { addNorm, bubbles } from './synth-blocks.js';

const VOWELS = {
  a: [730, 1090, 2440], o: [570, 840, 2410], u: [300, 870, 2240], uh: [520, 1190, 2390],
  e: [530, 1840, 2480], i: [270, 2290, 3010], ae: [660, 1720, 2410], er: [490, 1350, 1690], oo: [350, 700, 2300],
};

// Glottal-pulse source -> parallel formant band-passes -> gurgle / rasp AM -> waveshaper.
// p.pitch: [[u,hz]], p.vowels: [[u,'a']], p.env: [[u,amp]] (u = normalised time)
export function voice(sr, rng, p) {
  const dur = p.dur;
  const n = Math.ceil(dur * sr);
  const out = new Float32Array(n);
  const pitch = new Curve(p.pitch);
  const fs = p.fscale ?? 1;
  const F = [0, 1, 2].map((k) => new Curve(p.vowels.map(([u, v]) => [u, VOWELS[v][k] * fs])));
  const env = new Curve(p.env);
  const bwm = p.bw ?? 1;
  const bw = [90 * bwm, 120 * bwm, 180 * bwm];
  const fa = [1, p.a2 ?? 0.65, p.a3 ?? 0.4];
  const fl = [new Biquad(), new Biquad(), new Biquad()];
  const f4 = new Biquad().bp(sr, 3300 * fs, 3);
  const body = new OnePole().lp(sr, 380 * fs);
  const jit = new Wander(rng, sr, p.jitterHz ?? 28);
  const gur = new Wander(rng, sr, p.gurgleHz ?? 22);
  const rasp = new Wander(rng, sr, p.raspHz ?? 110);
  const bhp = new OnePole().lp(sr, 900);
  const jitter = p.jitter ?? 0.03;
  const shimmer = p.shimmer ?? 0.2;
  const sub = p.sub ?? 0;
  const breath = p.breath ?? 0.1;
  const voiced = p.voiced ?? 1;
  const gurgle = p.gurgle ?? 0;
  const raspA = p.rasp ?? 0;
  const vib = p.vib ?? 0;
  const vibHz = p.vibHz ?? 5.5;
  const chest = p.chest ?? 0.3;
  const a4 = p.a4 ?? 0.15;
  let ph = 0;
  let pulse = 0;
  let pAmp = 1;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if ((i & 31) === 0) {
      for (let k = 0; k < 3; k++) {
        const f = F[k].at(u);
        fl[k].bp(sr, f, f / bw[k]);
      }
    }
    const f = pitch.at(u) * (1 + jit.next() * jitter + (vib ? vib * Math.sin((TAU * vibHz * i) / sr) : 0));
    const dt = f / sr;
    ph += dt;
    if (ph >= 1) {
      ph -= 1;
      pulse++;
      pAmp = (1 - shimmer * rng()) * (pulse & 1 ? 1 - sub : 1);
    }
    let saw = 2 * ph - 1;
    saw -= polyblep(ph, dt);
    let src = -saw * pAmp * voiced;
    src += bhp.hp(rng() * 2 - 1) * breath * (ph < 0.5 ? 1.3 : 0.6);
    let y = fl[0].run(src) * fa[0] + fl[1].run(src) * fa[1] + fl[2].run(src) * fa[2] + f4.run(src) * a4;
    y += body.run(src) * chest;
    if (gurgle) y *= 1 - gurgle * (0.5 + 0.5 * gur.next());
    if (raspA) y *= 1 + raspA * rasp.next();
    out[i] = y * env.at(u);
  }
  normalize(out, 1);
  if (p.bubbles) {
    const b = bubbles(sr, rng, dur, p.bubbles, 250, 900, { env: (u) => env.at(u) });
    addNorm(out, b, sr, 0, 0.35 * (p.bubbleAmp ?? 1));
  }
  const drive = p.drive ?? 1.5;
  const nd = Math.tanh(drive);
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * drive) / nd;
  if (p.hp) {
    const h = new Biquad().hp(sr, p.hp, 0.7);
    for (let i = 0; i < n; i++) out[i] = h.run(out[i]);
  }
  return finish(out, sr, 0.9, 0.004, 0.04);
}

export function contour(rng, base, k, lo, hi, endMul = 1) {
  const pts = [];
  for (let j = 0; j <= k; j++) pts.push([j / k, base * rrange(rng, lo, hi) * (j === k ? endMul : 1)]);
  return pts;
}
export function vowelPath(list, rng) {
  const n = list.length;
  return list.map((v, j) => [n === 1 ? 0 : clamp(j / (n - 1) + (j > 0 && j < n - 1 ? (rng() - 0.5) * 0.1 : 0), 0, 1), v]);
}
