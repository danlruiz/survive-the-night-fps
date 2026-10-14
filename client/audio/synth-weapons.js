// Procedural sounds of the weapons: gunshots (one parameter set per gun in GUNS), the RPG's launch and its motor,
// the crossbow, and the handling foley (reloads, bolts, pumps, a dry click, a swing). Pure like synth.js:
// (sampleRate, rng) => Float32Array (mono) | [Float32Array, Float32Array] (stereo), peak-normalised.
import { rrange, Biquad, OnePole, ModeBank, Pink, Brown, Wander, hann, alloc, normalize, finish, softclip, mixInto, peakOf } from './dsp.js';
import { addNorm, thump, noise, modal, metalClick, woodModes, metalModes, whoosh, crackles, creak, rustle } from './synth-blocks.js';

// ------------------------------------------------------------------ gunshots
export const GUNS = {
  pistol: {
    dur: 1.0, crack: 0.8, crackHP: 3000, crackDecay: 0.0011, nwave: 0,
    bodyHP: 450, bodyLP0: 7500, bodyLP1: 900, lpSweep: 0.03, bodyDecay: 0.032, bark: [1400, 1.2, 5],
    thump: 0.75, thumpF0: 180, thumpF1: 52, thumpSweep: 0.02, thumpDecay: 0.05,
    tail: 0.07, tailLP: 1300, tailDecay: 0.16,
    mech: [[0.032, 2600, 0.1], [0.068, 1900, 0.07]], echoes: [[0.2, 0.06], [0.46, 0.03]], drive: 1.8,
  },
  ak47: {
    dur: 1.2, crack: 0.9, crackHP: 2200, crackDecay: 0.0014, nwave: 0.25,
    bodyHP: 260, bodyLP0: 5200, bodyLP1: 700, lpSweep: 0.04, bodyDecay: 0.042, bark: [820, 1.4, 7],
    thump: 0.85, thumpF0: 140, thumpF1: 44, thumpSweep: 0.022, thumpDecay: 0.06,
    tail: 0.09, tailLP: 950, tailDecay: 0.22,
    mech: [[0.042, 1250, 0.1]], echoes: [[0.24, 0.07], [0.53, 0.035], [0.9, 0.018]], drive: 2.2,
  },
  shotgun: {
    dur: 1.7, crack: 0.6, crackHP: 1500, crackDecay: 0.0018, nwave: 0,
    bodyHP: 100, bodyLP0: 3600, bodyLP1: 380, lpSweep: 0.05, bodyDecay: 0.075, bark: [300, 1, 5],
    thump: 1.1, thumpF0: 105, thumpF1: 33, thumpSweep: 0.035, thumpDecay: 0.11,
    tail: 0.14, tailLP: 650, tailDecay: 0.35,
    mech: [], echoes: [[0.27, 0.1], [0.61, 0.05], [1.02, 0.025]], drive: 2,
  },
  rifle: {
    dur: 2.7, crack: 1.0, crackHP: 4000, crackDecay: 0.0009, nwave: 0.8,
    bodyHP: 380, bodyLP0: 9000, bodyLP1: 1100, lpSweep: 0.025, bodyDecay: 0.038, bark: [1100, 1, 4],
    thump: 0.8, thumpF0: 150, thumpF1: 48, thumpSweep: 0.02, thumpDecay: 0.07,
    tail: 0.08, tailLP: 1500, tailDecay: 0.4,
    mech: [], echoes: [[0.33, 0.18], [0.72, 0.11], [1.25, 0.06], [1.86, 0.03]], drive: 1.7,
  },
  // 5.56 carbine: snappier and brighter than the AK, supersonic crack, short buffer spring twang
  m4a1: {
    dur: 1.15, crack: 1.0, crackHP: 3200, crackDecay: 0.001, nwave: 0.45,
    bodyHP: 340, bodyLP0: 7000, bodyLP1: 850, lpSweep: 0.03, bodyDecay: 0.034, bark: [1150, 1.3, 6],
    thump: 0.7, thumpF0: 160, thumpF1: 50, thumpSweep: 0.018, thumpDecay: 0.05,
    tail: 0.08, tailLP: 1100, tailDecay: 0.2,
    mech: [[0.03, 2100, 0.09], [0.05, 3400, 0.04]], echoes: [[0.23, 0.07], [0.51, 0.035], [0.86, 0.016]], drive: 2.1,
  },
  // 9mm SMG: pistol-calibre pop with a busy roller-delayed bolt, little low end
  mp5: {
    dur: 0.85, crack: 0.7, crackHP: 2800, crackDecay: 0.0012, nwave: 0,
    bodyHP: 520, bodyLP0: 6800, bodyLP1: 1000, lpSweep: 0.025, bodyDecay: 0.026, bark: [1600, 1.2, 5],
    thump: 0.55, thumpF0: 200, thumpF1: 60, thumpSweep: 0.016, thumpDecay: 0.04,
    tail: 0.05, tailLP: 1400, tailDecay: 0.13,
    mech: [[0.024, 2900, 0.12], [0.046, 2200, 0.08]], echoes: [[0.19, 0.05], [0.43, 0.025]], drive: 1.7,
  },
  // double-barrel 12 gauge: bigger, rounder boom than the pump, long rolling tail
  dbshotgun: {
    dur: 1.9, crack: 0.65, crackHP: 1300, crackDecay: 0.002, nwave: 0,
    bodyHP: 80, bodyLP0: 3300, bodyLP1: 340, lpSweep: 0.055, bodyDecay: 0.085, bark: [260, 1, 6],
    thump: 1.25, thumpF0: 95, thumpF1: 30, thumpSweep: 0.04, thumpDecay: 0.13,
    tail: 0.16, tailLP: 600, tailDecay: 0.4,
    mech: [], echoes: [[0.28, 0.11], [0.63, 0.055], [1.06, 0.028]], drive: 2.1,
  },
  // the mounted gun: a heavy machine gun. Against the AK the bark sits an octave lower and lasts half as long
  // again, the thump is deeper and longer, and a heavy bolt clunks home behind each round: at the same 600 a minute
  // it is a slow pounding where the rifle rattles
  hmg: {
    dur: 1.5, crack: 1.0, crackHP: 1800, crackDecay: 0.0017, nwave: 0.55,
    bodyHP: 180, bodyLP0: 5000, bodyLP1: 600, lpSweep: 0.05, bodyDecay: 0.058, bark: [480, 1.3, 7],
    thump: 1.0, thumpF0: 110, thumpF1: 36, thumpSweep: 0.03, thumpDecay: 0.09,
    tail: 0.13, tailLP: 720, tailDecay: 0.32,
    mech: [[0.05, 880, 0.15], [0.086, 1450, 0.08]], echoes: [[0.26, 0.09], [0.58, 0.05], [0.98, 0.028]], drive: 2.3,
  },
  // the Desert Eagle: a magnum out of a short barrel. The pistol's crack with a rifle's weight under it: a lower,
  // longer bark, a deep thump, and echoes that carry further than any handgun's
  deagle: {
    dur: 1.8, crack: 0.95, crackHP: 2600, crackDecay: 0.0013, nwave: 0.3,
    bodyHP: 300, bodyLP0: 6400, bodyLP1: 650, lpSweep: 0.04, bodyDecay: 0.05, bark: [900, 1.2, 6],
    thump: 1.05, thumpF0: 130, thumpF1: 40, thumpSweep: 0.028, thumpDecay: 0.08,
    tail: 0.11, tailLP: 950, tailDecay: 0.3,
    mech: [[0.04, 2000, 0.1], [0.08, 1500, 0.07]], echoes: [[0.26, 0.11], [0.6, 0.06], [1.02, 0.03]], drive: 2.1,
  },
  // the anti-tank rifle: a 14.5 mm round out of a muzzle brake. Against the hunting rifle the crack is as hard but
  // the blast under it is an octave down and three times as long (the brake throws it out sideways), the thump is
  // the deepest of any gun, and it rolls round the valley for three seconds
  atrifle: {
    dur: 3.6, crack: 1.0, crackHP: 2600, crackDecay: 0.0014, nwave: 1.0,
    bodyHP: 110, bodyLP0: 6200, bodyLP1: 480, lpSweep: 0.05, bodyDecay: 0.075, bark: [460, 1.1, 7],
    thump: 1.4, thumpF0: 85, thumpF1: 24, thumpSweep: 0.045, thumpDecay: 0.16,
    tail: 0.17, tailLP: 650, tailDecay: 0.7,
    mech: [], echoes: [[0.36, 0.22], [0.8, 0.14], [1.34, 0.085], [2.0, 0.05], [2.7, 0.028]], drive: 2.5,
  },
};

// Layered gunshot: transient crack (+ supersonic N-wave), band-shaped noise body, pitch-dropping thump,
// mechanical clicks, dark rumble tail and delayed tree-line echoes; soft-clipped for punch.
// fp = first person: stereo (decorrelated body/tail/echoes), more low thump.
// sweet = only the thump, rumble tail and echoes: a sub / space layer under a recorded shot (which brings the crack).
export function gunshot(sr, rng, P, fp, sweet = false) {
  const n = Math.ceil(P.dur * sr);
  const v = (a) => a * (1 + (rng() - 0.5) * 0.12);
  const shared = new Float32Array(n);
  // transient crack
  if (!sweet) {
    const cn = Math.min(n, Math.floor(0.01 * sr));
    const crack = new Float32Array(cn);
    const hp = new Biquad().hp(sr, P.crackHP, 0.8);
    for (let i = 0; i < cn; i++) crack[i] = hp.run(rng() * 2 - 1) * Math.exp(-i / sr / P.crackDecay);
    if (P.nwave) {
      const len = Math.max(3, Math.floor(0.0007 * sr));
      normalize(crack, 1);
      for (let i = 0; i < len; i++) crack[i] += P.nwave * (1 - (2 * i) / len);
    }
    addNorm(shared, crack, sr, 0, P.crack);
  }
  // low thump (pitch drop)
  addNorm(shared, thump(sr, v(P.thumpF0), P.thumpF1, P.thumpSweep, v(P.thumpDecay), Math.min(P.dur, P.thumpDecay * 8)), sr, 0, P.thump * (fp ? 1.15 : 0.75));
  // mechanical tail (slide / bolt carrier)
  if (!sweet) for (const [t, f, a] of P.mech) addNorm(shared, metalClick(sr, rng, v(f), 0.012), sr, t + (rng() - 0.5) * 0.006, a);

  const nch = fp ? 2 : 1;
  const outs = [];
  const bd = v(P.bodyDecay);
  const bn = Math.min(n, Math.floor(bd * 14 * sr));
  for (let ch = 0; ch < nch; ch++) {
    const c = new Float32Array(n);
    // noise body: fast attack, band-shaped, closing low-pass
    const body = new Float32Array(bn);
    const bhp = new Biquad().hp(sr, P.bodyHP, 0.7);
    const blp = new Biquad();
    const blp2 = new Biquad();
    const bark = new Biquad().peak(sr, P.bark[0], P.bark[1], P.bark[2]);
    for (let i = 0; i < bn; i++) {
      const t = i / sr;
      if ((i & 15) === 0) {
        const f = P.bodyLP1 + (P.bodyLP0 - P.bodyLP1) * Math.exp(-t / P.lpSweep);
        blp.lp(sr, f, 0.6);
        blp2.lp(sr, f * 1.3, 0.6);
      }
      const e = (1 - Math.exp(-t / 0.0005)) * (Math.exp(-t / bd) * 0.92 + 0.08 * Math.exp(-t / (bd * 2.5)));
      body[i] = bark.run(blp2.run(blp.run(bhp.run(rng() * 2 - 1)))) * e;
    }
    normalize(body, 1);
    if (!sweet) mixInto(c, body, 0, 1);
    // dark rumble tail (the blast rolling through the trees)
    const tail = new Float32Array(n);
    const tl = new Biquad().lp(sr, P.tailLP, 0.7);
    const tl2 = new OnePole().lp(sr, P.tailLP * 0.8);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      tail[i] = tl.run(tl2.run(rng() * 2 - 1)) * (1 - Math.exp(-t / 0.015)) * Math.exp(-t / P.tailDecay);
    }
    addNorm(c, tail, sr, 0, P.tail);
    // echoes off the tree line / hills: darker delayed copies of the blast
    const src = new Float32Array(bn);
    for (let i = 0; i < bn; i++) src[i] = body[i] + shared[i] * 0.4;
    for (const [et, eg] of P.echoes) {
      const d = Math.floor((et + (fp ? (ch ? 0.017 : -0.011) : 0) + (rng() - 0.5) * 0.02) * sr);
      const e1 = new OnePole().lp(sr, 1500);
      const e2 = new OnePole().lp(sr, 1100);
      const echo = new Float32Array(bn);
      for (let i = 0; i < bn; i++) echo[i] = e2.run(e1.run(src[i]));
      addNorm(c, echo, sr, d / sr, eg);
    }
    for (let i = 0; i < n; i++) c[i] += shared[i];
    outs.push(c);
  }
  normalize(fp ? outs : outs[0], 1);
  softclip(fp ? outs : outs[0], P.drive);
  return finish(fp ? outs : outs[0], sr, 0.95, 0.0001, 0.08);
}

// ------------------------------------------------------------------ RPG launcher
// A rocket motor's exhaust: a ragged, tearing roar. Noise round a nozzle band that never holds still (the burn
// flutters tens of times a second), sparse sharp crackle on it (the shocks in the jet), a low rumble under it and a
// thin hiss over it. o: env(u) the level, f(u) a multiplier on every band (a source rushing away drops in pitch and
// dulls), low: the rumble's share.
export function rocketMotor(sr, rng, dur, o = {}) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const bp = new Biquad();
  const bp2 = new Biquad();
  const lp = new Biquad();
  const hs = new Biquad().hp(sr, 5000, 0.7);
  const rum = new Biquad().lp(sr, 240, 0.7);
  const br = new Brown(rng);
  const pk = new Pink(rng);
  const fast = new Wander(rng, sr, 70);
  const mid = new Wander(rng, sr, 13);
  const slow = new Wander(rng, sr, 1.7);
  const low = o.low ?? 1;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const s = slow.next();
    if ((i & 15) === 0) {
      const k = (o.f ? o.f(u) : 1) * (1 + 0.08 * s);
      bp.bp(sr, 900 * k, 0.75);
      bp2.bp(sr, 2400 * k, 1.1);
      lp.lp(sr, Math.min(sr * 0.45, 6500 * k), 0.6);
    }
    const w = rng() * 2 - 1;
    const fl = 0.6 + 0.4 * fast.next() * (0.55 + 0.45 * mid.next());
    const band = bp.run(w) + bp2.run(w) * 0.55 + lp.run(pk.next()) * 0.5;
    out[i] = (band * fl + rum.run(br.next()) * 0.35 * low + hs.run(w) * 0.12) * (o.env ? o.env(u) : 1);
  }
  addNorm(out, crackles(sr, rng, dur, 260, { hp: 1100, bp: 2600, pow: 2.2, len: 0.0007, env: o.env }), sr, 0, peakOf(out) * 0.7);
  return out;
}

// The booster charge going off in the open tube (gunshot() parameters): less crack than a rifle (no bullet breaking
// the sound barrier), a broad deep blast out of both ends, the backblast's thump, a long roll off the tree line
export const RPG_BLAST = {
  dur: 2.6, crack: 0.75, crackHP: 1700, crackDecay: 0.0016, nwave: 0.3,
  bodyHP: 60, bodyLP0: 4200, bodyLP1: 300, lpSweep: 0.05, bodyDecay: 0.1, bark: [210, 1, 6],
  thump: 1.35, thumpF0: 90, thumpF1: 26, thumpSweep: 0.045, thumpDecay: 0.17,
  tail: 0.18, tailLP: 560, tailDecay: 0.5,
  mech: [], echoes: [[0.3, 0.13], [0.68, 0.075], [1.14, 0.04], [1.72, 0.02]], drive: 2.2,
};

// The RPG's launch: the booster's bang (RPG_BLAST) and the rocket motor catching a few metres out and tearing away
// for a second or so, falling in pitch as it goes. fp: stereo, from behind the sights: more low end, the motor
// centred and a little wide, the steel tube ringing by the ear. sweet: only the thump, the roll and the motor, to lay
// under a recorded blast.
export function rpgLaunch(sr, rng, fp, sweet = false) {
  const blast = gunshot(sr, rng, RPG_BLAST, fp, sweet);
  const D = 1.6;
  const env = (u) => {
    const t = u * D;
    return Math.min(1, t / 0.035, (1 - u) * 5) * (0.75 * Math.exp(-t / 0.3) + 0.25 * Math.exp(-t / 0.75));
  };
  const f = (u) => 0.6 + 0.4 * Math.exp(-(u * D) / 0.45);
  const motor = rocketMotor(sr, rng, D, { env, f, low: fp ? 1.2 : 0.8 });
  const side = fp ? rocketMotor(sr, rng, D, { env, f, low: 0 }) : null;
  const ring = fp && !sweet ? modal(sr, rng, metalModes(rng, 410, 0.22), 0.7, 0.5, 2500) : null;
  const outs = fp ? blast : [blast];
  for (let ch = 0; ch < outs.length; ch++) {
    const m = new Float32Array(motor.length);
    for (let i = 0; i < m.length; i++) m[i] = motor[i] + (side ? side[i] * (ch ? -0.35 : 0.35) : 0);
    addNorm(outs[ch], m, sr, 0.04, sweet ? 0.8 : 0.65);
    if (ring) addNorm(outs[ch], ring, sr, 0.002, 0.07);
  }
  const x = fp ? outs : outs[0];
  normalize(x, 1);
  softclip(x, 1.3);
  return finish(x, sr, 0.95, 0.0001, 0.1);
}

// RPG reload, start: a fresh grenade drawn out of a canvas carry bag. The flap thrown back, a hand in among the
// rounds, the warhead scraping up past the canvas, its fins ticking free at the top.
export function rpgDraw(sr, rng) {
  const out = alloc(sr, 1.05);
  addNorm(out, rustle(sr, rng, 0.22, 1300), sr, 0, 0.55);
  addNorm(out, noise(sr, rng, 0.06, { bp: [700, 0.8], a: 0.003, d: 0.018 }), sr, 0.03, 0.4);
  addNorm(out, rustle(sr, rng, 0.2, 2300), sr, 0.16, 0.4);
  addNorm(out, noise(sr, rng, 0.48, { bp: [1100, 0.9], sweep: [800, 1700], env: (u) => hann(u) * (0.65 + 0.35 * Math.sin(u * 47)) }), sr, 0.34, 0.8);
  addNorm(out, crackles(sr, rng, 0.45, 300, { hp: 1500, bp: 3000, pow: 2, env: hann }), sr, 0.36, 0.25);
  addNorm(out, rustle(sr, rng, 0.18, 1700), sr, 0.8, 0.3);
  addNorm(out, metalClick(sr, rng, 3100, 0.006), sr, 0.82, 0.22);
  addNorm(out, metalClick(sr, rng, 2600, 0.007), sr, 0.88, 0.16);
  return finish(out, sr);
}

// ...and its end: the grenade's tail tube slid down into the muzzle, steel on steel and quickening, then the warhead
// seating against the tube with a solid clack and the catch snapping over behind it
export function rpgLoad(sr, rng) {
  const out = alloc(sr, 0.95);
  const sl = 0.3;
  const n = Math.floor(sl * sr);
  const fr = new Float32Array(n);
  const bp = new Biquad();
  const grit = new Wander(rng, sr, 60);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if ((i & 15) === 0) bp.bp(sr, 1900 + 1500 * u, 1.3);
    const g = 0.55 + 0.45 * grit.next();
    fr[i] = bp.run(rng() * 2 - 1) * g * Math.min(1, u * 6, (1 - u) * 60) * (0.5 + 0.5 * u);
  }
  addNorm(out, fr, sr, 0, 0.55);
  // the tube singing faintly under the slide
  const ring = new ModeBank(sr, metalModes(rng, 640, 0.06));
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) rs[i] = ring.run(fr[i]);
  addNorm(out, rs, sr, 0, 0.1);
  addNorm(out, metalClick(sr, rng, 1050, 0.022), sr, sl, 1);
  addNorm(out, thump(sr, 170, 90, 0.01, 0.03), sr, sl, 0.55);
  addNorm(out, modal(sr, rng, metalModes(rng, 470, 0.07), 0.6, 0.5, 3000), sr, sl, 0.4);
  addNorm(out, metalClick(sr, rng, 2700, 0.009), sr, sl + 0.075, 0.45);
  return finish(out, sr);
}

// ------------------------------------------------------------------ weapon handling foley
export function reloadRemote(sr, rng) {
  const out = alloc(sr, 1.1);
  addNorm(out, metalClick(sr, rng, 1800, 0.01), sr, 0.03, 0.6);
  addNorm(out, noise(sr, rng, 0.14, { bp: [2000, 1.2], env: hann }), sr, 0.08, 0.35);
  addNorm(out, metalClick(sr, rng, 1350, 0.014), sr, 0.55, 0.9);
  addNorm(out, thump(sr, 190, 120, 0.01, 0.015), sr, 0.55, 0.4);
  addNorm(out, metalClick(sr, rng, 2300, 0.012), sr, 0.82, 0.8);
  addNorm(out, noise(sr, rng, 0.06, { bp: [3000, 1], env: hann }), sr, 0.79, 0.3);
  return finish(out, sr);
}
export function reloadStart(sr, rng) {
  const out = alloc(sr, 0.4);
  addNorm(out, metalClick(sr, rng, 2100, 0.008), sr, 0.0, 0.7);
  addNorm(out, noise(sr, rng, 0.16, { bp: [1800, 1.1], sweep: [2200, 1200], env: hann }), sr, 0.02, 0.45);
  addNorm(out, metalClick(sr, rng, 1100, 0.012), sr, 0.17, 0.4);
  return finish(out, sr);
}
export function reloadEnd(sr, rng) {
  const out = alloc(sr, 0.55);
  addNorm(out, noise(sr, rng, 0.07, { bp: [1500, 1], env: hann }), sr, 0, 0.3);
  addNorm(out, metalClick(sr, rng, 1300, 0.016), sr, 0.06, 1);
  addNorm(out, thump(sr, 220, 130, 0.01, 0.018), sr, 0.06, 0.5);
  addNorm(out, metalClick(sr, rng, 2500, 0.012), sr, 0.28, 0.9);
  addNorm(out, noise(sr, rng, 0.05, { hp: 2500, a: 0.0005, d: 0.008 }), sr, 0.28, 0.4);
  return finish(out, sr);
}
export function shellInsert(sr, rng) {
  const out = alloc(sr, 0.22);
  addNorm(out, noise(sr, rng, 0.05, { bp: [1600, 1], env: hann }), sr, 0, 0.3);
  addNorm(out, metalClick(sr, rng, rrange(rng, 1700, 2000), 0.012), sr, 0.035, 0.9);
  addNorm(out, thump(sr, 260, 150, 0.008, 0.015), sr, 0.035, 0.5);
  return finish(out, sr);
}
export function boltCycle(sr, rng) {
  const out = alloc(sr, 0.7);
  addNorm(out, metalClick(sr, rng, 2600, 0.009), sr, 0, 0.6);
  addNorm(out, noise(sr, rng, 0.09, { bp: [1800, 1.2], sweep: [2400, 1500], env: hann }), sr, 0.08, 0.45);
  addNorm(out, metalClick(sr, rng, 1500, 0.014), sr, 0.17, 0.9);
  addNorm(out, noise(sr, rng, 0.08, { bp: [1700, 1.2], sweep: [1500, 2300], env: hann }), sr, 0.28, 0.45);
  addNorm(out, metalClick(sr, rng, 1750, 0.014), sr, 0.37, 0.9);
  addNorm(out, metalClick(sr, rng, 2400, 0.01), sr, 0.48, 0.7);
  return finish(out, sr);
}
export function pump(sr, rng) {
  const out = alloc(sr, 0.5);
  addNorm(out, noise(sr, rng, 0.08, { bp: [1300, 1], env: hann }), sr, 0, 0.5);
  addNorm(out, metalClick(sr, rng, 1100, 0.018), sr, 0.07, 1);
  addNorm(out, thump(sr, 170, 100, 0.01, 0.025), sr, 0.07, 0.6);
  addNorm(out, noise(sr, rng, 0.07, { bp: [1500, 1], env: hann }), sr, 0.17, 0.5);
  addNorm(out, metalClick(sr, rng, 1350, 0.016), sr, 0.24, 1);
  addNorm(out, thump(sr, 190, 110, 0.01, 0.02), sr, 0.24, 0.6);
  return finish(out, sr);
}
// crossbow: the limbs slap forward (dull wooden thwack), the string thrums, the bolt hisses away. No blast.
export function crossbowShot(sr, rng, fp) {
  const out = alloc(sr, 0.6);
  addNorm(out, modal(sr, rng, woodModes(rng, 1.5, 0.7), 0.25, 1.2, 3500), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.03, { bp: [2200, 0.9], a: 0.0004, d: 0.006 }), sr, 0, 0.55);
  addNorm(out, thump(sr, 150, 78, 0.012, 0.045), sr, 0.002, fp ? 0.8 : 0.5);
  const f0 = rrange(rng, 172, 190);
  addNorm(out, modal(sr, rng, [{ f: f0, d: 0.09, a: 1 }, { f: f0 * 2.02, d: 0.06, a: 0.5 }, { f: f0 * 3.07, d: 0.035, a: 0.3 }], 0.5, 1.5, 1200), sr, 0.004, 0.55);
  addNorm(out, whoosh(sr, rng, 0.16, 1400, 3600, 1800, 1.4, 0.25), sr, 0.01, 0.3);
  return finish(out, sr, 0.9, 0.0005, 0.05);
}
// cocking: hand to the string, the limbs creak as it is drawn back, the latch catches (timed to the viewmodel)
export function xbowCock(sr, rng) {
  const out = alloc(sr, 1.25);
  addNorm(out, rustle(sr, rng, 0.16, 1900), sr, 0.2, 0.3);
  addNorm(out, creak(sr, rng, 0.6, 22, 85, 1.5), sr, 0.42, 0.75);
  addNorm(out, metalClick(sr, rng, 1500, 0.014), sr, 1.03, 0.9);
  addNorm(out, thump(sr, 210, 120, 0.01, 0.018), sr, 1.03, 0.45);
  return finish(out, sr);
}
// bolt laid in the groove and pushed back against the string
export function xbowLoad(sr, rng) {
  const out = alloc(sr, 0.3);
  addNorm(out, noise(sr, rng, 0.09, { bp: [2600, 1.1], sweep: [1800, 3200], env: hann }), sr, 0, 0.4);
  addNorm(out, modal(sr, rng, woodModes(rng, 2.4, 0.4), 0.12, 0.8, 4000), sr, 0.07, 0.9);
  addNorm(out, metalClick(sr, rng, 2800, 0.008), sr, 0.075, 0.35);
  return finish(out, sr);
}
export function dryClick(sr, rng) {
  const out = alloc(sr, 0.12);
  addNorm(out, metalClick(sr, rng, rrange(rng, 3000, 3400), 0.007), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.01, { hp: 3000, a: 0.0002, d: 0.002 }), sr, 0, 0.4);
  return finish(out, sr);
}
export function weaponSwitch(sr, rng) {
  const out = alloc(sr, 0.36);
  addNorm(out, rustle(sr, rng, 0.14, 2000), sr, 0, 0.6);
  addNorm(out, metalClick(sr, rng, 2000, 0.012), sr, 0.1, 0.8);
  addNorm(out, metalClick(sr, rng, 1600, 0.014), sr, 0.17, 0.7);
  return finish(out, sr);
}
export function swing(sr, rng, heavy) {
  const out = alloc(sr, heavy ? 0.42 : 0.28);
  if (heavy) {
    addNorm(out, whoosh(sr, rng, 0.38, 250, rrange(rng, 800, 1000), 320, 1.3, 0.45), sr, 0, 1);
    addNorm(out, noise(sr, rng, 0.3, { lp: 300, env: hann }), sr, 0.02, 0.4);
  } else {
    addNorm(out, whoosh(sr, rng, 0.24, 500, rrange(rng, 1500, 1900), 700, 1.8, 0.4), sr, 0, 1);
  }
  return finish(out, sr);
}
