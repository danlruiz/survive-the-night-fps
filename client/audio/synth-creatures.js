// Procedural voices: the dead (one generator per kind), the animals (cat, dogs, deer, bats) and the survivors.
// Almost all of them are the voice() of synth-voice.js with a pitch contour, a vowel path and a throat of their own.
import { TAU, smoothstep, rrange, Biquad, Brown, Wander, hann, alloc, normalize, finish, softclip } from './dsp.js';
import { addNorm, thump, noise, modal, whoosh, crackles, bubbles } from './synth-blocks.js';
import { voice, contour, vowelPath } from './synth-voice.js';

export const GROWL_V = [['uh', 'a', 'o', 'u'], ['o', 'a', 'uh', 'er'], ['u', 'uh', 'a', 'o'], ['a', 'o', 'u', 'uh'], ['er', 'a', 'uh', 'u'], ['o', 'u', 'a', 'uh']];

export function zGrowl(sr, rng, i) {
  const dur = rrange(rng, 1.1, 1.9);
  return voice(sr, rng, {
    dur, pitch: contour(rng, rrange(rng, 72, 105), 5, 0.8, 1.25, 0.8), vowels: vowelPath(GROWL_V[i % GROWL_V.length], rng),
    fscale: rrange(rng, 0.78, 0.92), bw: 1.7, jitter: 0.07, shimmer: 0.45, sub: rrange(rng, 0.35, 0.7),
    gurgle: rrange(rng, 0.4, 0.75), gurgleHz: rrange(rng, 14, 30), rasp: 0.5, breath: 0.3, drive: rrange(rng, 2.5, 4),
    chest: 0.6, bubbles: rrange(rng, 3, 9), env: [[0, 0], [0.12, 1], [0.35, 0.72], [0.55, 0.95], [0.85, 0.55], [1, 0]],
  });
}
export function zAttack(sr, rng, i) {
  const b = rrange(rng, 105, 130);
  return voice(sr, rng, {
    dur: rrange(rng, 0.55, 0.85), pitch: [[0, b], [0.15, b * 1.5], [0.5, b * 1.3], [1, b * 0.75]],
    vowels: vowelPath([['a', 'ae', 'a', 'uh'], ['ae', 'a', 'o'], ['a', 'a', 'er', 'uh']][i % 3], rng),
    fscale: rrange(rng, 0.85, 0.95), bw: 1.8, jitter: 0.09, shimmer: 0.4, sub: 0.3, gurgle: 0.3, rasp: 0.75, raspHz: 140,
    breath: 0.4, drive: rrange(rng, 4, 5.5), chest: 0.5, bubbles: 4, env: [[0, 0], [0.05, 1], [0.5, 0.9], [0.8, 0.5], [1, 0]],
  });
}
export function zDeath(sr, rng, i) {
  const b = rrange(rng, 120, 145);
  return voice(sr, rng, {
    dur: rrange(rng, 1.7, 2.4), pitch: [[0, b], [0.1, b * 1.1], [0.35, b * 0.85], [0.7, b * 0.55], [1, b * 0.4]],
    vowels: vowelPath([['a', 'o', 'u', 'uh'], ['ae', 'a', 'o', 'u'], ['a', 'er', 'o', 'uh']][i % 3], rng),
    fscale: rrange(rng, 0.8, 0.92), bw: 1.6, jitter: 0.08, shimmer: 0.5, sub: rrange(rng, 0.4, 0.7), gurgle: 0.65, gurgleHz: 12,
    rasp: 0.5, breath: 0.35, drive: 3, chest: 0.6, bubbles: 14, bubbleAmp: 1.4,
    env: [[0, 0], [0.05, 1], [0.3, 0.85], [0.65, 0.5], [0.9, 0.22], [1, 0]],
  });
}
export function zPain(sr, rng, i) {
  const b = rrange(rng, 140, 175);
  return voice(sr, rng, {
    dur: rrange(rng, 0.35, 0.55), pitch: [[0, b], [0.2, b * 1.3], [1, b * 0.7]],
    vowels: vowelPath([['ae', 'a', 'uh'], ['a', 'uh'], ['e', 'a', 'er']][i % 3], rng),
    fscale: 0.9, bw: 1.6, jitter: 0.08, shimmer: 0.4, sub: 0.3, gurgle: 0.35, rasp: 0.6, breath: 0.35, drive: 3.5, chest: 0.4,
    env: [[0, 0], [0.06, 1], [0.4, 0.8], [1, 0]],
  });
}
export function zRunner(sr, rng) {
  const b = rrange(rng, 360, 420);
  return voice(sr, rng, {
    dur: rrange(rng, 1.0, 1.4), pitch: [[0, b * 0.7], [0.12, b * 1.5], [0.4, b * 1.35], [0.7, b * 1.2], [1, b * 0.7]],
    vowels: vowelPath(['ae', 'a', 'ae', 'a', 'er'], rng), fscale: 1.05, bw: 2.2, jitter: 0.1, jitterHz: 40, shimmer: 0.5,
    sub: 0.2, gurgle: 0.15, rasp: 0.85, raspHz: 180, breath: 0.5, drive: 5, chest: 0.2, a3: 0.6, a4: 0.4,
    env: [[0, 0], [0.08, 1], [0.6, 0.9], [0.85, 0.5], [1, 0]],
  });
}
export function zTank(sr, rng) {
  const b = rrange(rng, 48, 56);
  const main = voice(sr, rng, {
    dur: rrange(rng, 2.0, 2.5), pitch: [[0, b * 0.85], [0.15, b * 1.3], [0.5, b * 1.15], [0.8, b], [1, b * 0.7]],
    vowels: vowelPath(['o', 'a', 'a', 'o', 'u'], rng), fscale: 0.62, bw: 2, jitter: 0.07, shimmer: 0.5, sub: 0.6,
    gurgle: 0.5, gurgleHz: 16, rasp: 0.7, raspHz: 90, breath: 0.45, drive: 5, chest: 1.2, bubbles: 5,
    env: [[0, 0], [0.1, 1], [0.6, 0.9], [0.85, 0.5], [1, 0]],
  });
  const sub = thump(sr, 70, 38, 0.4, 0.7, main.length / sr);
  addNorm(main, sub, sr, 0.05, 0.4);
  return normalize(main, 0.92);
}
export function zSpit(sr, rng) {
  const out = alloc(sr, 1.0);
  const hock = voice(sr, rng, {
    dur: 0.45, pitch: [[0, 90], [1, 120]], vowels: [[0, 'er'], [0.6, 'i'], [1, 'i']], voiced: 0.3, breath: 1.2,
    rasp: 1, raspHz: 60, gurgle: 0.6, gurgleHz: 25, drive: 3, env: [[0, 0], [0.3, 0.6], [0.85, 1], [1, 0]],
  });
  addNorm(out, hock, sr, 0, 0.6);
  addNorm(out, noise(sr, rng, 0.12, { bp: [1600, 0.8], a: 0.002, d: 0.03 }), sr, 0.47, 0.9);
  addNorm(out, bubbles(sr, rng, 0.25, 60, 400, 1500, { env: (u) => 1 - u }), sr, 0.48, 0.5);
  addNorm(out, thump(sr, 140, 70, 0.02, 0.03), sr, 0.47, 0.45);
  return finish(out, sr);
}
export function zLeaper(sr, rng) {
  const b = rrange(rng, 420, 480);
  return voice(sr, rng, {
    dur: rrange(rng, 0.8, 1.0), pitch: [[0, b], [0.5, b * 2.0], [0.8, b * 1.8], [1, b * 1.3]],
    vowels: vowelPath(['i', 'ae', 'i', 'e'], rng), fscale: 1.12, bw: 2.4, jitter: 0.12, jitterHz: 50, shimmer: 0.6, sub: 0.25,
    rasp: 0.9, raspHz: 220, breath: 0.55, drive: 5, chest: 0.1, a3: 0.7, a4: 0.5,
    env: [[0, 0], [0.1, 0.7], [0.6, 1], [0.85, 0.6], [1, 0]],
  });
}
export function zRoper(sr, rng) {
  const out = alloc(sr, 0.85);
  addNorm(out, whoosh(sr, rng, 0.16, 500, 3500, 2500, 1.4, 0.7), sr, 0, 0.7);
  // elastic twang
  const tw = new Float32Array(Math.floor(0.4 * sr));
  let ph = 0;
  for (let i = 0; i < tw.length; i++) {
    const t = i / sr;
    ph += (140 + 560 * Math.exp(-t / 0.08)) / sr;
    tw[i] = Math.tanh(Math.sin(TAU * ph) * 2) * Math.exp(-t / 0.12) * (1 + 0.3 * Math.sin(TAU * 38 * t));
  }
  addNorm(out, tw, sr, 0.12, 0.45);
  addNorm(out, thump(sr, 120, 60, 0.02, 0.05), sr, 0.15, 0.8);
  addNorm(out, noise(sr, rng, 0.2, { bp: [900, 2], sweep: [1400, 500], a: 0.002, d: 0.05 }), sr, 0.15, 0.7);
  addNorm(out, bubbles(sr, rng, 0.3, 45, 350, 1400, { env: (u) => 1 - u }), sr, 0.16, 0.4);
  return finish(out, sr);
}
export function zBoomer(sr, rng) {
  const b = rrange(rng, 60, 72);
  return voice(sr, rng, {
    dur: rrange(rng, 1.4, 1.9), pitch: [[0, b], [0.3, b * 1.2], [0.7, b * 0.95], [1, b * 0.8]],
    vowels: vowelPath(['o', 'u', 'o', 'uh'], rng), fscale: 0.74, bw: 1.8, jitter: 0.08, shimmer: 0.6, sub: 0.5,
    gurgle: 0.85, gurgleHz: 9, rasp: 0.4, breath: 0.3, drive: 2.6, chest: 1, bubbles: 28, bubbleAmp: 1.8,
    env: [[0, 0], [0.1, 0.8], [0.4, 1], [0.8, 0.6], [1, 0]],
  });
}
// a bat's call: dry and scratchy, claws dragged over bark and a rasp in the throat, nothing a bird would make. A run of
// short scrapes (band-passed noise crackling with grit), a low buzzing rasp under some of them
export function zBat(sr, rng) {
  const out = alloc(sr, 0.75);
  const count = 3 + Math.floor(rng() * 3);
  const grain = Math.exp(-1 / (0.004 * sr)); // each grit crackle dies in a few ms
  let t = 0.01;
  for (let k = 0; k < count && t < 0.6; k++) {
    const len = rrange(rng, 0.06, 0.14);
    const c = new Float32Array(Math.floor(len * sr));
    const hp = new Biquad().hp(sr, 500, 0.7);
    const bp = new Biquad().bp(sr, rrange(rng, 1400, 2600), 1.6);
    const grit = rrange(rng, 90, 160); // crackles a second
    const rf = rrange(rng, 140, 220); // the rasp's buzz
    const rasp = rng() < 0.5 ? rrange(rng, 0.3, 0.5) : 0;
    let g = 0;
    let rp = 0;
    for (let i = 0; i < c.length; i++) {
      const u = i / c.length;
      if (rng() < grit / sr) g = 0.5 + rng() * 0.5;
      g *= grain;
      rp = (rp + rf / sr) % 1;
      const x = bp.run(hp.run(rng() * 2 - 1)) * (0.3 + g);
      const r = (2 * rp - 1) * (0.5 + 0.5 * (rng() * 2 - 1)) * rasp;
      c[i] = (x + r) * Math.min(1, u / 0.12) * Math.pow(1 - u, 1.2);
    }
    addNorm(out, c, sr, t, rrange(rng, 0.6, 1));
    t += len + rrange(rng, 0.02, 0.07);
  }
  return finish(out, sr);
}
// a bat's wings, leather beating the air: a few quick beats, each a soft low whump with a papery flutter on its edge,
// so the ones coming in can be heard before they are seen (entities/zombies.js plays it over and over while one flies near)
export function batFlap(sr, rng) {
  const beats = 3 + Math.floor(rng() * 2);
  const gap = rrange(rng, 0.085, 0.11);
  const out = alloc(sr, beats * gap + 0.15);
  let t = 0.005;
  for (let k = 0; k < beats; k++) {
    const len = rrange(rng, 0.06, 0.08);
    const body = noise(sr, rng, len, { lp: rrange(rng, 500, 800), env: (u) => (u < 0.3 ? u / 0.3 : (1 - u) / 0.7) ** 2 });
    const flutter = noise(sr, rng, len * 0.6, { bp: [rrange(rng, 1800, 2600), 1.2], a: 0.002, d: 0.012 });
    addNorm(out, body, sr, t, rrange(rng, 0.75, 1));
    addNorm(out, flutter, sr, t + len * 0.35, 0.22);
    t += gap * rrange(rng, 0.92, 1.08);
  }
  return finish(out, sr);
}
export function zBoss(sr, rng) {
  const dur = rrange(rng, 2.8, 3.2);
  const out = alloc(sr, dur + 0.2);
  const lay = [[38, 0.5, 1], [57, 0.6, 0.8], [86, 0.72, 0.55]];
  for (const [b, fsc, a] of lay) {
    const v = voice(sr, rng, {
      dur, pitch: [[0, b * 0.8], [0.12, b * 1.25], [0.5, b * 1.1], [0.8, b * 0.95], [1, b * 0.6]],
      vowels: vowelPath(['o', 'a', 'a', 'o', 'u'], rng), fscale: fsc, bw: 2.2, jitter: 0.08, shimmer: 0.5, sub: 0.6,
      gurgle: 0.45, gurgleHz: 14, rasp: 0.8, raspHz: 80, breath: 0.5, drive: 6, chest: 1.2, bubbles: 4,
      env: [[0, 0], [0.08, 1], [0.6, 0.9], [0.85, 0.5], [1, 0]],
    });
    addNorm(out, v, sr, rng() * 0.05, a);
  }
  addNorm(out, thump(sr, 55, 28, 0.6, 1.1, dur), sr, 0.05, 0.6);
  const br = new Brown(rng);
  const lp = new Biquad().lp(sr, 500, 0.8);
  const w = new Wander(rng, sr, 9);
  const nr = new Float32Array(Math.floor(dur * sr));
  for (let i = 0; i < nr.length; i++) nr[i] = lp.run(br.next()) * (0.6 + 0.4 * w.next()) * hann(i / nr.length * 0.5 + 0.1);
  addNorm(out, nr, sr, 0.1, 0.35);
  softclip(out, 1.5);
  return finish(out, sr, 0.95);
}
// the shade stalking in the dark: several breathy, almost voiceless whispers on top of each other, no words
export function shadeWhisper(sr, rng, i) {
  const dur = rrange(rng, 1.3, 1.9);
  const out = alloc(sr, dur + 0.25);
  const paths = [['i', 'e', 'u', 'i'], ['u', 'ae', 'i', 'e'], ['e', 'i', 'a', 'u']];
  for (let k = 0; k < 3; k++) {
    const b = rrange(rng, 150, 210);
    const w = voice(sr, rng, {
      dur: dur * rrange(rng, 0.7, 1), pitch: contour(rng, b, 4, 0.85, 1.2, 0.8), vowels: vowelPath(paths[(i + k) % 3], rng),
      fscale: rrange(rng, 1.0, 1.25), bw: 2.6, voiced: 0.05, breath: 1.5, rasp: 0.6, raspHz: rrange(rng, 6, 11), jitter: 0.1, shimmer: 0.6,
      drive: 1.2, chest: 0, a3: 0.8, a4: 0.6, hp: 500, env: [[0, 0], [0.2, 0.7], [0.45, 1], [0.7, 0.55], [1, 0]],
    });
    addNorm(out, w, sr, k * rrange(rng, 0.05, 0.12), 0.7 - k * 0.15);
  }
  return finish(out, sr, 0.8, 0.02, 0.12);
}
// light catches it: a sharp indrawn hiss, then it sets hard like cooling stone
export function shadeFreeze(sr, rng) {
  const out = alloc(sr, 0.75);
  addNorm(out, noise(sr, rng, 0.2, { bp: [1500, 1.6], sweep: [900, 5200], env: (u) => u * u * (1 - smoothstep((u - 0.9) / 0.1)) }), sr, 0, 0.8);
  addNorm(out, modal(sr, rng, [
    { f: rrange(rng, 610, 680), d: 0.05, a: 1 }, { f: rrange(rng, 1380, 1520), d: 0.035, a: 0.8 },
    { f: rrange(rng, 2500, 2800), d: 0.02, a: 0.6 }, { f: rrange(rng, 4300, 4700), d: 0.012, a: 0.4 },
  ], 0.3, 1.2), sr, 0.19, 0.9);
  addNorm(out, crackles(sr, rng, 0.45, 70, { skew: 2.2, pow: 2, hp: 1800, bp: 3600 }), sr, 0.2, 0.55);
  addNorm(out, thump(sr, 95, 50, 0.03, 0.06), sr, 0.19, 0.5);
  return finish(out, sr, 0.9);
}
// the light is gone: a thin doubled shriek that climbs as it comes for you
export function shadeShriek(sr, rng) {
  const dur = rrange(rng, 0.9, 1.1);
  const out = alloc(sr, dur + 0.1);
  const b = rrange(rng, 520, 600);
  for (const det of [1, 1.07]) {
    const v = voice(sr, rng, {
      dur, pitch: [[0, b * det * 0.7], [0.25, b * det * 1.2], [0.7, b * det * 1.7], [1, b * det * 1.9]],
      vowels: vowelPath(['u', 'i', 'ae', 'i'], rng), fscale: 1.2, bw: 2.6, jitter: 0.14, jitterHz: 60, shimmer: 0.6, sub: 0.2,
      rasp: 0.8, raspHz: 260, breath: 0.9, drive: 4, chest: 0, a3: 0.8, a4: 0.6, hp: 350,
      env: [[0, 0], [0.08, 0.5], [0.6, 1], [0.9, 0.7], [1, 0]],
    });
    addNorm(out, v, sr, det > 1 ? 0.02 : 0, det > 1 ? 0.6 : 1);
  }
  addNorm(out, whoosh(sr, rng, dur * 0.8, 500, 3000, 1400, 1.2, 0.6), sr, 0, 0.35);
  softclip(out, 2.5);
  return finish(out, sr, 0.9);
}

// the screecher: a sharp indrawn gasp, then one long scream torn out of a ruined throat - two voices a little apart,
// climbing and cracking, with the rasp of the wound under it. Long enough to cover its windup (screamWindup) and more
export function screecherScream(sr, rng) {
  const inhale = 0.4;
  const dur = rrange(rng, 3.5, 3.9);
  const out = alloc(sr, inhale + dur + 0.2);
  addNorm(out, noise(sr, rng, inhale, { bp: [1800, 1.2], sweep: [700, 2600], env: (u) => u * u * (1 - smoothstep((u - 0.85) / 0.15)) }), sr, 0, 0.35);
  const b = rrange(rng, 610, 700);
  for (const det of [1, 1.045, 0.5]) {
    const v = voice(sr, rng, {
      dur, pitch: [[0, b * det * 0.75], [0.08, b * det * 1.25], [0.3, b * det * 1.4], [0.42, b * det * 1.3], [0.55, b * det * 1.6], [0.75, b * det * 1.7], [0.9, b * det * 1.45], [1, b * det * 0.9]],
      vowels: vowelPath(['a', 'ae', 'i', 'ae', 'i', 'ae', 'a'], rng), fscale: det < 1 ? 1.05 : 1.25, bw: 2.4, jitter: 0.12, jitterHz: 45, shimmer: 0.55, sub: 0.15,
      rasp: det < 1 ? 1.2 : 0.7, raspHz: det < 1 ? 70 : 220, breath: 0.8, vib: 0.03, vibHz: 7, drive: 5, chest: det < 1 ? 0.4 : 0, a3: 0.9, a4: 0.7, hp: 300,
      env: [[0, 0], [0.04, 0.85], [0.3, 1], [0.42, 0.9], [0.6, 1], [0.88, 0.9], [1, 0]],
    });
    addNorm(out, v, sr, inhale + (det > 1 ? 0.03 : 0), det > 1 ? 0.6 : det < 1 ? 0.45 : 1);
  }
  addNorm(out, whoosh(sr, rng, dur * 0.9, 900, 4200, 2200, 1.4, 0.5), sr, inhale, 0.3);
  softclip(out, 3.6); // (driven harder than the other voices: it is meant to carry across the valley)
  return finish(out, sr, 0.95);
}

// a Mother's baby: a newborn's wail out of a dead throat - two or three sobs, each a breath drawn in with a catch and
// pushed out as a cracked, rising "waah", a rasp under it where no living baby has one. Short enough to come again
// and again as it crawls (client: entities.js, every 1.6-2.8 s)
export function babyCry(sr, rng) {
  const sobs = rng() < 0.5 ? 2 : 3;
  const lens = Array.from({ length: sobs }, (_, i) => (i === sobs - 1 ? rrange(rng, 0.65, 0.85) : rrange(rng, 0.38, 0.5)));
  const gaps = lens.map(() => rrange(rng, 0.12, 0.2));
  const out = alloc(sr, lens.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0) + 0.2);
  let t = 0.02;
  for (let i = 0; i < sobs; i++) {
    const dur = lens[i];
    const b = rrange(rng, 420, 520) * (i === sobs - 1 ? 1.08 : 1);
    // the catch of breath before it
    addNorm(out, noise(sr, rng, gaps[i] * 0.8, { bp: [2400, 1.5], sweep: [1600, 3200], env: (u) => u * (1 - u) * 4 }), sr, t, 0.12);
    t += gaps[i];
    const v = voice(sr, rng, {
      dur, pitch: [[0, b * 0.8], [0.15, b * 1.15], [0.45, b * 1.25], [0.75, b * 1.1], [1, b * 0.7]],
      vowels: vowelPath(['ae', 'a', 'a', 'uh'], rng), fscale: 1.35, bw: 1.8, jitter: 0.09, jitterHz: 38, shimmer: 0.45,
      rasp: 0.55, raspHz: 160, breath: 0.4, vib: 0.04, vibHz: 9, drive: 3, chest: 0, a3: 0.6, a4: 0.4, hp: 250,
      env: [[0, 0], [0.08, 0.9], [0.5, 1], [0.85, 0.7], [1, 0]],
    });
    addNorm(out, v, sr, t, i === sobs - 1 ? 1 : 0.85);
    t += dur;
  }
  softclip(out, 2.2);
  return finish(out, sr, 0.9);
}

export function zpGrowl(sr, rng, i) {
  const b = rrange(rng, 90, 118);
  return voice(sr, rng, {
    dur: rrange(rng, 0.9, 1.3), pitch: contour(rng, b, 4, 0.85, 1.25, 0.8),
    vowels: vowelPath([['uh', 'a', 'er'], ['a', 'o', 'uh'], ['er', 'a', 'u']][i % 3], rng),
    fscale: 0.92, bw: 1.5, jitter: 0.06, shimmer: 0.35, sub: 0.4, gurgle: 0.5, rasp: 0.55, breath: 0.35, drive: 3.2,
    chest: 0.5, bubbles: 4, env: [[0, 0], [0.1, 1], [0.6, 0.85], [1, 0]],
  });
}

// the stray cat: "mi-a-ow" - small vocal tract (high formants), bright rising-falling pitch, no gurgle
const MEOW_V = [['u', 'i', 'ae', 'a', 'o', 'u'], ['u', 'e', 'a', 'o', 'oo'], ['i', 'ae', 'a', 'u']];
export function catMeow(sr, rng, i) {
  const b = rrange(rng, 540, 720);
  const short = i % 3 === 2; // a quick chirpy "mrrp"
  return voice(sr, rng, {
    dur: short ? rrange(rng, 0.28, 0.36) : rrange(rng, 0.55, 0.85),
    pitch: short ? [[0, b * 0.8], [0.4, b * 1.2], [1, b * 1.1]] : [[0, b * 0.78], [0.25, b * 1.12], [0.55, b * 1.05], [0.85, b * 0.82], [1, b * 0.66]],
    vowels: vowelPath(MEOW_V[i % MEOW_V.length], rng), fscale: rrange(rng, 1.45, 1.6), bw: 1.25, jitter: 0.015, jitterHz: 18,
    shimmer: 0.08, breath: 0.12, rasp: short ? 0.35 : 0.08, raspHz: 38, vib: 0.012, vibHz: 6, drive: 1.3, chest: 0.04, a3: 0.55, a4: 0.3, hp: 320,
    env: short ? [[0, 0], [0.12, 1], [0.6, 0.8], [1, 0]] : [[0, 0], [0.1, 0.45], [0.3, 1], [0.7, 0.8], [0.9, 0.35], [1, 0]],
  });
}

// the stray cat purring while it is stroked: one breath out and in (~2 s; played again for as long as it is stroked).
// A purr is the larynx snapping shut ~25 times a second on the way out and on the way in: each snap a short buzz of
// noise rung through the throat (a low body and a nasal ring), the way in quieter and breathier
export function catPurr(sr, rng, i) {
  const out = rrange(rng, 1.0, 1.2);
  const gap = rrange(rng, 0.08, 0.14);
  const inn = rrange(rng, 0.7, 0.85);
  const n = Math.floor((out + gap + inn + 0.05) * sr);
  const x = new Float32Array(n);
  const body = new Biquad().bp(sr, rrange(rng, 150, 190), 1.2);
  const ring = new Biquad().bp(sr, rrange(rng, 650, 820), 2.2);
  const lp = new Biquad().lp(sr, 2400, 0.7);
  const hp = new Biquad().hp(sr, 45, 0.7);
  const snap = Math.exp(-1 / (0.006 * sr)); // (each snap dies away in ~6 ms)
  let ph = 0;
  let exc = 0;
  for (let k = 0; k < n; k++) {
    const t = k / sr;
    const exhale = t < out;
    const inhale = t > out + gap && t < out + gap + inn;
    const u = exhale ? t / out : inhale ? (t - out - gap) / inn : 0;
    const env = exhale ? Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.6) : inhale ? 0.6 * Math.pow(Math.sin(Math.PI * u), 0.7) : 0;
    ph += ((exhale ? 26 : 23.5) * (1 + 0.04 * Math.sin(TAU * t * 0.7 + i))) / sr;
    if (ph >= 1) {
      ph -= 1 + (rng() - 0.5) * 0.06;
      exc = 1;
    }
    exc *= snap;
    const v = (rng() * 2 - 1) * (exc * 0.9 + (inhale ? 0.13 : 0.08));
    x[k] = hp.run(lp.run(body.run(v) * 1.6 + ring.run(v) * 0.5)) * env;
  }
  return finish(x, sr);
}

// zombie dogs: a dog-sized vocal tract (formants ~15% up on a human's) run ragged - rasp, gurgle, overdrive
// "rrowf!" x2-3: short harsh barks, pitch jumping up then dropping
export function dogBark(sr, rng, i) {
  const n = 2 + (i % 2);
  const out = alloc(sr, 0.2 + n * 0.26);
  let t = 0.01;
  for (let k = 0; k < n; k++) {
    const b = rrange(rng, 230, 320) * (k === n - 1 ? 0.9 : 1);
    const v = voice(sr, rng, {
      dur: rrange(rng, 0.13, 0.19), pitch: [[0, b * 0.8], [0.18, b * 1.3], [0.55, b * 1.05], [1, b * 0.6]],
      vowels: vowelPath([['uh', 'a', 'o'], ['er', 'ae', 'uh'], ['o', 'a', 'u']][(i + k) % 3], rng), fscale: rrange(rng, 1.1, 1.2), bw: 2,
      jitter: 0.08, jitterHz: 45, shimmer: 0.45, sub: 0.35, gurgle: 0.25, rasp: 0.9, raspHz: 130, breath: 0.55, drive: 5.5, chest: 0.4,
      env: [[0, 0], [0.05, 1], [0.45, 0.75], [1, 0]],
    });
    addNorm(out, v, sr, t, rrange(rng, 0.75, 1));
    t += rrange(rng, 0.2, 0.28);
  }
  return finish(out, sr);
}
// a long, breaking howl - the pack has your scent
export function dogHowl(sr, rng, i) {
  const b = rrange(rng, 290, 340);
  const dur = rrange(rng, 2.3, 2.8);
  const main = voice(sr, rng, {
    dur, pitch: [[0, b * 0.7], [0.15, b * 1.5], [0.45, b * 1.62], [0.7, b * 1.4], [0.88, b * 1.05], [1, b * 0.7]],
    vowels: vowelPath(i % 2 ? ['u', 'oo', 'o', 'u', 'uh'] : ['o', 'u', 'oo', 'o', 'u'], rng), fscale: 1.12, bw: 1.4,
    jitter: 0.03, jitterHz: 12, shimmer: 0.2, sub: 0.2, gurgle: 0.35, gurgleHz: 7, rasp: 0.35, raspHz: 60, vib: 0.018, vibHz: 5,
    breath: 0.3, drive: 2.4, chest: 0.2, env: [[0, 0], [0.12, 0.8], [0.3, 1], [0.75, 0.85], [0.92, 0.35], [1, 0]],
  });
  const out = alloc(sr, dur + 0.8);
  addNorm(out, main, sr, 0, 0.9);
  addNorm(out, main, sr, 0.45 + rng() * 0.2, 0.18); // off the hillside
  return finish(out, sr);
}
// wet, rattling growl-snarl through bared teeth, sometimes ending in a jaw snap
export function dogSnarl(sr, rng, i) {
  const b = rrange(rng, 85, 115);
  const dur = rrange(rng, 0.7, 1.1);
  const out = alloc(sr, dur + 0.15);
  const g = voice(sr, rng, {
    dur, pitch: contour(rng, b, 4, 0.85, 1.3, 1.1), vowels: vowelPath([['er', 'uh', 'er'], ['uh', 'ae', 'er'], ['er', 'a', 'uh']][i % 3], rng),
    fscale: 1.08, bw: 2.2, jitter: 0.1, jitterHz: 35, shimmer: 0.6, sub: 0.55, gurgle: 0.6, gurgleHz: 26, rasp: 1, raspHz: 70,
    breath: 0.6, drive: 4.5, chest: 0.5, bubbles: 6, env: [[0, 0], [0.1, 0.8], [0.5, 1], [0.85, 0.8], [1, 0]],
  });
  addNorm(out, g, sr, 0, 0.9);
  if (i % 3 !== 1) addNorm(out, noise(sr, rng, 0.03, { bp: [2600, 1.2], a: 0.0005, d: 0.012 }), sr, dur * 0.92, 0.7); // teeth clack
  return finish(out, sr);
}
// the crawler (a flying squirrel, grown huge): a run of shrill, rasping chitters over a hiss through its teeth
export function zCrawler(sr, rng, i) {
  const out = alloc(sr, 0.9);
  addNorm(out, noise(sr, rng, 0.55, { bp: [3800, 0.9], sweep: [4400, 2600], a: 0.03, d: 0.3 }), sr, 0, 0.35);
  const count = 5 + Math.floor(rng() * 4);
  let t = 0.02;
  for (let k = 0; k < count && t < 0.75; k++) {
    const b = rrange(rng, 900, 1300) * (i % 2 ? 1.1 : 1);
    const len = rrange(rng, 0.045, 0.085);
    const c = voice(sr, rng, {
      dur: len, pitch: [[0, b * 0.85], [0.4, b * 1.25], [1, b * 0.9]], vowels: vowelPath(['i', 'e', 'i'], rng), fscale: 1.45, bw: 2.2,
      jitter: 0.12, jitterHz: 60, shimmer: 0.5, rasp: 0.9, raspHz: 260, breath: 0.4, drive: 4, chest: 0, a3: 0.6, hp: 600,
      env: [[0, 0], [0.15, 1], [0.6, 0.8], [1, 0]],
    });
    addNorm(out, c, sr, t, rrange(rng, 0.55, 0.9));
    t += len + rrange(rng, 0.015, 0.05);
  }
  return finish(out, sr);
}
// yelps when hit; the last variant is a dying whine
export function dogYelp(sr, rng, i) {
  const dying = i === 2;
  const b = rrange(rng, 620, 820) * (dying ? 0.85 : 1);
  return voice(sr, rng, {
    dur: dying ? rrange(rng, 0.8, 1.0) : rrange(rng, 0.2, 0.28),
    pitch: dying ? [[0, b], [0.1, b * 1.2], [0.5, b * 0.9], [1, b * 0.45]] : [[0, b * 0.9], [0.2, b * 1.25], [1, b * 0.6]],
    vowels: vowelPath(dying ? ['i', 'e', 'a', 'uh'] : ['i', 'ae', 'a'], rng), fscale: 1.25, bw: 1.6, jitter: 0.06, jitterHz: 40,
    shimmer: 0.35, sub: 0.15, gurgle: dying ? 0.5 : 0.2, rasp: 0.55, raspHz: 150, breath: 0.4, drive: 3.5, chest: 0.1, a3: 0.6, hp: 250,
    env: dying ? [[0, 0], [0.06, 1], [0.4, 0.7], [0.8, 0.3], [1, 0]] : [[0, 0], [0.08, 1], [0.5, 0.8], [1, 0]],
  });
}

// deer. The snort: a blast of breath down the nose, hard-edged and hissing, sometimes twice - what a whitetail does
// when something is wrong, the moment before the flag goes up and the group is gone
export function deerSnort(sr, rng, i) {
  const n = i % 3 === 2 ? 2 : 1;
  const out = alloc(sr, 0.5 + n * 0.32);
  let t = 0.01;
  for (let k = 0; k < n; k++) {
    const dur = rrange(rng, 0.22, 0.32);
    const f = rrange(rng, 1700, 2300);
    addNorm(out, noise(sr, rng, dur, { bp: [f, 1.4], sweep: [f * 1.25, f * 0.7, 0.6], env: (u) => Math.min(1, u * 30) * (1 - u) ** 1.6 }), sr, t, 0.9);
    addNorm(out, noise(sr, rng, dur * 0.8, { hp: 3500, lp: 9000, env: (u) => Math.min(1, u * 40) * (1 - u) ** 2.5 }), sr, t, 0.4);
    addNorm(out, noise(sr, rng, dur * 0.6, { bp: [520, 2], env: (u) => Math.min(1, u * 25) * (1 - u) ** 2 }), sr, t, 0.3); // the chest behind it
    t += dur + rrange(rng, 0.08, 0.16);
  }
  return finish(out, sr);
}
// a bleat when it is hit: short, nasal, high; the last variant is the one it dies with
export function deerBleat(sr, rng, i) {
  const dying = i === 2;
  const b = rrange(rng, 420, 520) * (dying ? 0.9 : 1);
  return voice(sr, rng, {
    dur: dying ? rrange(rng, 0.7, 0.9) : rrange(rng, 0.3, 0.42),
    pitch: dying ? [[0, b], [0.12, b * 1.15], [0.5, b * 0.95], [1, b * 0.6]] : [[0, b * 0.9], [0.25, b * 1.15], [1, b * 0.8]],
    vowels: vowelPath(dying ? ['ae', 'e', 'a', 'uh'] : ['ae', 'e', 'ae'], rng), fscale: 1.3, bw: 1.3, jitter: 0.03, jitterHz: 30,
    shimmer: 0.25, sub: 0.1, rasp: 0.5, raspHz: 55, vib: 0.03, vibHz: 11, breath: 0.25, drive: 2.2, chest: 0.1, a3: 0.6, hp: 280,
    env: dying ? [[0, 0], [0.06, 1], [0.45, 0.75], [0.8, 0.3], [1, 0]] : [[0, 0], [0.08, 1], [0.6, 0.8], [1, 0]],
  });
}
// an undead deer (the mainland's): the bleat dragged down through a throat that has rotted - lower, longer, rattling
// and overdriven, rising to a strangled shriek as it lowers its antlers; the last variant is the gurgle it dies with
export function deerScream(sr, rng, i) {
  const dying = i === 2;
  const b = rrange(rng, 240, 300) * (dying ? 0.8 : 1);
  const dur = dying ? rrange(rng, 1.0, 1.2) : rrange(rng, 0.75, 0.95);
  const out = alloc(sr, dur + 0.5);
  const v = voice(sr, rng, {
    dur,
    pitch: dying ? [[0, b * 1.1], [0.2, b * 1.25], [0.6, b * 0.8], [1, b * 0.45]] : [[0, b * 0.75], [0.3, b * 1.35], [0.65, b * 1.55], [0.85, b * 1.2], [1, b * 0.7]],
    vowels: vowelPath(dying ? ['ae', 'a', 'uh', 'er'] : i ? ['er', 'ae', 'a', 'e'] : ['uh', 'a', 'ae', 'a'], rng), fscale: 1.2, bw: 2,
    jitter: 0.09, jitterHz: 38, shimmer: 0.5, sub: 0.45, gurgle: dying ? 0.8 : 0.5, gurgleHz: 22, rasp: 0.95, raspHz: 85, vib: 0.03, vibHz: 7,
    breath: 0.5, drive: 4.5, chest: 0.35, bubbles: dying ? 6 : 3, hp: 140,
    env: dying ? [[0, 0], [0.06, 1], [0.45, 0.7], [0.8, 0.3], [1, 0]] : [[0, 0], [0.12, 0.6], [0.45, 0.9], [0.75, 1], [0.92, 0.5], [1, 0]],
  });
  addNorm(out, v, sr, 0, 0.9);
  addNorm(out, v, sr, 0.3 + rng() * 0.15, 0.15); // (off the trees)
  return finish(out, sr);
}
// a hoof coming down on the forest floor at a run: a hard little knock on packed earth, leaf litter thrown up
export function hoofbeat(sr, rng) {
  const out = alloc(sr, 0.3);
  addNorm(out, thump(sr, rrange(rng, 150, 185), 70, 0.012, 0.03), sr, 0, 0.9);
  addNorm(out, noise(sr, rng, 0.07, { lp: 900, a: 0.001, d: 0.018 }), sr, 0, 0.6);
  addNorm(out, noise(sr, rng, 0.14, { hp: 2000, lp: 6500, env: (u) => Math.min(1, u * 10) * (1 - u) ** 2 }), sr, 0.006, 0.35);
  addNorm(out, crackles(sr, rng, 0.1, 160, { hp: 2400, bp: 3800, env: (u) => 1 - u }), sr, 0.008, 0.25);
  return finish(out, sr, 0.9, 0.0005, 0.03);
}

// human (player) sounds
export function humanHurt(sr, rng, i) {
  const b = rrange(rng, 125, 150);
  return voice(sr, rng, {
    dur: rrange(rng, 0.26, 0.42), pitch: [[0, b], [0.2, b * 1.18], [1, b * 0.82]],
    vowels: vowelPath([['uh', 'uh'], ['a', 'uh'], ['uh', 'a', 'uh'], ['e', 'uh']][i % 4], rng),
    fscale: rrange(rng, 0.98, 1.05), bw: 1.05, jitter: 0.02, shimmer: 0.12, rasp: 0.2, breath: 0.35, drive: 1.8, chest: 0.35,
    env: [[0, 0], [0.08, 1], [0.45, 0.75], [1, 0]],
  });
}
export function humanDeath(sr, rng) {
  const b = rrange(rng, 150, 170);
  const out = alloc(sr, 1.9);
  const v = voice(sr, rng, {
    dur: 1.4, pitch: [[0, b], [0.15, b * 1.12], [0.5, b * 0.9], [1, b * 0.6]], vowels: vowelPath(['a', 'a', 'o', 'uh'], rng),
    fscale: 1, bw: 1.1, jitter: 0.04, shimmer: 0.2, rasp: 0.35, breath: 0.4, drive: 2, chest: 0.4,
    env: [[0, 0], [0.06, 1], [0.4, 0.8], [0.8, 0.35], [1, 0]],
  });
  addNorm(out, v, sr, 0, 0.9);
  const ex = voice(sr, rng, {
    dur: 0.5, pitch: [[0, 100], [1, 80]], vowels: [[0, 'uh'], [1, 'u']], voiced: 0.15, breath: 1, drive: 1.2,
    env: [[0, 0], [0.2, 1], [1, 0]],
  });
  addNorm(out, ex, sr, 1.35, 0.35);
  return finish(out, sr);
}
export function breath(sr, rng) {
  const out = alloc(sr, 2.1);
  let t = 0.02;
  let k = 0;
  while (t < 1.85) {
    const ex = k % 2 === 0;
    const len = ex ? rrange(rng, 0.2, 0.26) : rrange(rng, 0.16, 0.2);
    const v = voice(sr, rng, {
      dur: len, pitch: [[0, 120], [1, 105]], vowels: ex ? [[0, 'a'], [1, 'uh']] : [[0, 'e'], [1, 'i']],
      voiced: ex ? 0.12 : 0.03, breath: 1, bw: 1.6, drive: 1.3, hp: ex ? 200 : 600,
      env: ex ? [[0, 0], [0.15, 1], [0.6, 0.6], [1, 0]] : [[0, 0], [0.5, 1], [1, 0]],
    });
    addNorm(out, v, sr, t, ex ? 0.85 : 0.45);
    t += len + rrange(rng, 0.03, 0.07);
    k++;
  }
  return finish(out, sr);
}
