// Procedural seamless loops (fire, acid, radio static, a zombie's breathing, the generator, the supply plane, the
// fair's calliope, a rocket in flight): each rendered loop + crossfade long and closed with finishLoop.
import { TAU, rrange, rpick, Biquad, ModeBank, Pink, Brown, Wander, alloc, normalize, softclip, mtof } from './dsp.js';
import { addNorm, thump, crackles, bubbles, finishLoop, pulseTrain } from './synth-blocks.js';
import { voice, vowelPath } from './synth-voice.js';
import { GROWL_V } from './synth-creatures.js';
import { rocketMotor } from './synth-weapons.js';

// ------------------------------------------------------------------ seamless loops

// fire loops: size 0 torch, 1 campfire, 2 big molotov fire
export function loopFire(sr, rng, size = 1) {
  const L = [4, 6, 6][size];
  const X = 0.5;
  const n = Math.ceil((L + X) * sr);
  const out = new Float32Array(n);
  const br = new Brown(rng);
  const rlp = new Biquad().lp(sr, [260, 320, 480][size], 0.7);
  const am = new Wander(rng, sr, 1.1);
  const pk = new Pink(rng);
  const bp = new Biquad().bp(sr, [650, 620, 520][size], 0.6);
  const am2 = new Wander(rng, sr, 7);
  const hs = new Biquad().hp(sr, 3500, 0.7);
  const am3 = new Wander(rng, sr, 3);
  const rA = [0.35, 0.8, 1.4][size];
  const fA = [0.9, 0.55, 0.8][size];
  for (let i = 0; i < n; i++) {
    const roar = rlp.run(br.next()) * (0.7 + 0.3 * am.next());
    const fl = bp.run(pk.next()) * (0.55 + 0.45 * am2.next());
    const hiss = hs.run(rng() * 2 - 1) * 0.05 * (0.5 + 0.5 * am3.next());
    out[i] = roar * rA * 3 + fl * fA * 2.5 + hiss;
  }
  normalize(out, 0.6);
  addNorm(out, crackles(sr, rng, L + X, [6, 14, 26][size], { hp: 1400, bp: 2800, pow: 3.5, len: 0.0015 }), sr, 0, 0.9);
  addNorm(out, crackles(sr, rng, L + X, [1, 2, 4][size], { hp: 500, bp: 1300, pow: 1.5, len: 0.003 }), sr, 0, 0.6);
  return finishLoop(out, sr, X);
}
// walkie-talkie static, as a seamless loop: band-limited hiss through a small speaker, a slow flutter of
// fading signal on it, a faster grain, and the odd crackle
export function loopRadioStatic(sr, rng) {
  const L = 3;
  const X = 0.3;
  const n = Math.ceil((L + X) * sr);
  const out = new Float32Array(n);
  const hp = new Biquad().hp(sr, 650, 0.8);
  const lp = new Biquad().lp(sr, 3600, 0.9);
  const pres = new Biquad().bp(sr, 1900, 0.9);
  const fade = new Wander(rng, sr, 0.9);
  const grain = new Wander(rng, sr, 23);
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    const band = lp.run(hp.run(w));
    out[i] = (band + pres.run(w) * 0.6) * (0.72 + 0.18 * fade.next() + 0.1 * grain.next());
  }
  normalize(out, 0.5);
  addNorm(out, crackles(sr, rng, L + X, 9, { hp: 1100, bp: 2400, pow: 3, len: 0.002 }), sr, 0, 0.55);
  return finishLoop(out, sr, X, 0.7);
}
export function loopAcid(sr, rng) {
  const L = 4;
  const X = 0.4;
  const n = Math.ceil((L + X) * sr);
  const out = new Float32Array(n);
  const hp = new Biquad().hp(sr, 2800, 0.7);
  const bp = new Biquad().bp(sr, 5500, 0.7);
  const w = new Wander(rng, sr, 5);
  for (let i = 0; i < n; i++) out[i] = bp.run(hp.run(rng() * 2 - 1)) * (0.6 + 0.4 * w.next());
  normalize(out, 0.35);
  addNorm(out, crackles(sr, rng, L + X, 90, { hp: 2200, bp: 4800, pow: 2.5 }), sr, 0, 0.7);
  addNorm(out, bubbles(sr, rng, L + X, 14, 300, 900), sr, 0, 0.5);
  return finishLoop(out, sr, X);
}
export function loopZombieIdle(sr, rng) {
  const L = 5;
  const X = 0.3;
  const out = alloc(sr, L + X);
  let t = rng() * 0.2;
  while (t < L + X - 0.3) {
    const exLen = rrange(rng, 1.1, 1.6);
    const b = rrange(rng, 65, 88);
    const v = voice(sr, rng, {
      dur: exLen, pitch: [[0, b], [0.4, b * rrange(rng, 1.05, 1.25)], [1, b * 0.8]], vowels: vowelPath(rpick(rng, GROWL_V), rng),
      fscale: 0.82, bw: 1.8, jitter: 0.06, shimmer: 0.5, sub: 0.55, gurgle: 0.6, rasp: 0.5, breath: 0.7, voiced: 0.7,
      drive: 2.2, chest: 0.6, bubbles: 5, env: [[0, 0], [0.25, 1], [0.7, 0.7], [1, 0]],
    });
    addNorm(out, v, sr, t, rrange(rng, 0.6, 1));
    t += exLen + rrange(rng, 0.05, 0.2);
    const inLen = rrange(rng, 0.6, 0.9);
    const inh = voice(sr, rng, {
      dur: inLen, pitch: [[0, 90], [1, 100]], vowels: [[0, 'er'], [1, 'i']], voiced: 0.1, breath: 1.2, rasp: 0.9, raspHz: 45,
      drive: 1.5, env: [[0, 0], [0.6, 1], [1, 0]],
    });
    addNorm(out, inh, sr, t, 0.3);
    t += inLen + rrange(rng, 0.05, 0.2);
  }
  return finishLoop(out, sr, X, 0.8);
}
export function loopBossBreath(sr, rng) {
  const L = 6;
  const X = 0.4;
  const out = alloc(sr, L + X);
  const inh = voice(sr, rng, {
    dur: 2.3, pitch: [[0, 50], [1, 60]], vowels: [[0, 'o'], [1, 'er']], fscale: 0.55, voiced: 0.15, breath: 1.3, rasp: 0.9, raspHz: 35,
    drive: 2, bw: 2, env: [[0, 0], [0.7, 1], [1, 0]],
  });
  addNorm(out, inh, sr, 0.1, 0.5);
  const ex = voice(sr, rng, {
    dur: 3.3, pitch: [[0, 42], [0.3, 46], [1, 34]], vowels: [[0, 'a'], [0.5, 'o'], [1, 'u']], fscale: 0.5, voiced: 0.8, breath: 0.8,
    sub: 0.6, gurgle: 0.6, gurgleHz: 11, rasp: 0.8, raspHz: 60, drive: 4, bw: 2.2, chest: 1.3, bubbles: 6,
    env: [[0, 0], [0.12, 1], [0.6, 0.7], [1, 0]],
  });
  addNorm(out, ex, sr, 2.5, 1);
  addNorm(out, thump(sr, 45, 30, 0.5, 1.2, 3), sr, 2.5, 0.3);
  return finishLoop(out, sr, X, 0.85);
}
export function loopGenerator(sr, rng) {
  const L = 2;
  const X = 0.2;
  const n = Math.ceil((L + X) * sr);
  const ex = pulseTrain(sr, rng, n, Math.floor(0.0015 * sr), 0, () => 30 * (1 + (rng() - 0.5) * 0.04), () => 1);
  const bank = new ModeBank(sr, [{ f: 95, d: 0.025 }, { f: 190, d: 0.015, a: 0.6 }, { f: 420, d: 0.008, a: 0.4 }, { f: 1300, d: 0.004, a: 0.3 }]);
  const hum = new Float32Array(n);
  const rat = new Biquad().bp(sr, 2400, 1.5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    hum[i] = bank.run(ex[i]) + 0.15 * Math.sin(TAU * 60 * t) + 0.08 * Math.sin(TAU * 120 * t) + rat.run(rng() * 2 - 1) * 0.08 * (0.5 + 0.5 * Math.sin(TAU * 30 * t));
  }
  softclip(hum, 1.4);
  return finishLoop(hum, sr, X, 0.8);
}
// four-engine turboprop in level flight: each prop's blade-pass drone (~68 Hz) is slightly detuned from the
// others so they beat into the familiar throb, over the airframe's broadband roar and a faint turbine whine
export function loopPlane(sr, rng) {
  const L = 6;
  const X = 0.6;
  const n = Math.ceil((L + X) * sr);
  const out = new Float32Array(n);
  const props = [67.6, 68.05, 68.5, 68.95];
  const ph = props.map(() => rng());
  const dlp = new Biquad().lp(sr, 760, 0.8);
  const body = new Biquad().bp(sr, 210, 0.9);
  const rlp = new Biquad().lp(sr, 1300, 0.6);
  const rhp = new Biquad().hp(sr, 70, 0.7);
  const pk = new Pink(rng);
  const br = new Brown(rng);
  const gust = new Wander(rng, sr, 0.7);
  const whineW = new Wander(rng, sr, 0.3);
  let wph = 0;
  for (let i = 0; i < n; i++) {
    let prop = 0;
    for (let k = 0; k < 4; k++) {
      ph[k] += props[k] / sr;
      if (ph[k] >= 1) ph[k] -= 1;
      prop += Math.exp(-ph[k] * 7) - 0.14; // sharp pressure pulse per blade pass
    }
    const drone = dlp.run(prop);
    const roar = rlp.run(rhp.run(pk.next())) * (0.85 + 0.15 * gust.next());
    wph += (1850 * (1 + 0.004 * whineW.next())) / sr;
    out[i] = drone * 0.55 + body.run(prop) * 0.25 + roar * 1.3 + br.next() * 0.12 + Math.sin(TAU * wph) * 0.012;
  }
  softclip(out, 1.3);
  return finishLoop(out, sr, X, 0.8);
}

// The calliope of the Tri-County Fair: a steam organ wheezing through a waltz that never ends. Pipes are sines
// with a few harmonics, breath in them and a chiff as each one speaks; every pipe is a little out of tune in its
// own way and the whole machine drifts in pitch, which is what makes it sound abandoned. Sixteen bars of
// oom-pah-pah, the tail of the buffer playing the first bar again so that the loop's crossfade is the tune over
// itself.
export function loopCalliope(sr, rng) {
  const BEAT = 0.34;
  const L = 16 * 3 * BEAT;
  const X = 0.5;
  const out = alloc(sr, L + X);
  const pipe = (m) => mtof(m) * (1 + ((((m * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.02);
  const note = (m, t0, dur, amp) => {
    const f = pipe(m);
    const i0 = Math.floor(t0 * sr);
    const n = Math.floor((dur + 0.08) * sr);
    const bp = new Biquad().bp(sr, Math.min(f * 2, sr * 0.4), 2);
    let ph = rng();
    for (let i = 0; i < n && i0 + i < out.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.03) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.08));
      // (the wow turns a whole number of times in the loop; a pipe speaks a shade flat until it has filled)
      ph += (f * (1 + 0.005 * Math.sin((TAU * 5 * (t0 + t)) / L) - (t < 0.05 ? 0.012 * (1 - t / 0.05) : 0))) / sr;
      const a = TAU * ph;
      const tone = Math.sin(a) + 0.28 * Math.sin(2 * a) + 0.2 * Math.sin(3 * a) + 0.07 * Math.sin(4 * a);
      out[i0 + i] += (tone + bp.run(rng() * 2 - 1) * (t < 0.06 ? 1.1 : 0.22)) * env * amp;
    }
  };
  // the tune, a bar to a row: [melody (MIDI, 0 = hold the last note), the bar's chord as root, third, fifth]
  const BARS = [
    [[79, 76, 79], [48, 64, 67]], [[84, 0, 0], [48, 64, 67]], [[83, 81, 83], [43, 62, 65]], [[79, 0, 0], [43, 62, 67]],
    [[81, 77, 81], [41, 60, 65]], [[86, 0, 84], [43, 62, 65]], [[83, 79, 81], [43, 59, 62]], [[79, 0, 0], [48, 64, 67]],
    [[88, 86, 84], [48, 64, 67]], [[81, 0, 0], [41, 60, 65]], [[86, 84, 83], [43, 62, 65]], [[79, 0, 0], [43, 59, 62]],
    [[84, 83, 81], [41, 60, 65]], [[79, 76, 79], [48, 64, 67]], [[81, 83, 86], [43, 62, 65]], [[84, 0, 0], [48, 64, 67]],
  ];
  const play = (off) => {
    BARS.forEach(([tune, [root, third, fifth]], b) => {
      const t = off + b * 3 * BEAT;
      if (t >= L + X) return;
      for (let k = 0; k < 3; k++) {
        if (!tune[k]) continue;
        let len = 1;
        while (k + len < 3 && !tune[k + len]) len++;
        note(tune[k], t + k * BEAT, len * BEAT * 0.92, 0.5);
      }
      note(root, t, BEAT * 0.7, 0.42);
      for (const k of [1, 2]) {
        note(third, t + k * BEAT, BEAT * 0.42, 0.2);
        note(fifth, t + k * BEAT, BEAT * 0.42, 0.2);
      }
    });
  };
  play(0);
  play(L);
  softclip(out, 0.9);
  return finishLoop(out, sr, X, 0.85);
}

// an RPG grenade in flight: its motor, steady (the engine places it, turns it down with distance and shifts its pitch)
export function loopRocket(sr, rng) {
  const L = 3;
  const X = 0.3;
  return finishLoop(rocketMotor(sr, rng, L + X), sr, X, 0.8);
}
