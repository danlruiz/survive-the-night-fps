// Procedural first-person and interface sounds: picking up, crafting, healing, eating; the ui's clicks and chimes,
// Dead Hand's cards, and footsteps on every surface. Pure like synth.js: (sampleRate, rng) => Float32Array.
import { TAU, rrange, Biquad, Pink, Wander, hann, alloc, normalize, finish, softclip } from './dsp.js';
import { addNorm, thump, noise, modal, metalClick, woodModes, metalModes, whoosh, crackles, bubbles, creak, rustle } from './synth-blocks.js';
import { voice } from './synth-voice.js';
import { zPain, humanDeath } from './synth-creatures.js';
import { woodHit, metalHit } from './synth-world.js';

// ------------------------------------------------------------------ first-person / UI foley
// noise torn into a ragged rip: its level wandering `hz` times a second between floor and floor + depth (in place)
function ragged(x, rng, sr, hz, floor, depth) {
  const w = new Wander(rng, sr, hz);
  for (let i = 0; i < x.length; i++) x[i] *= floor + depth * Math.abs(w.next());
  return x;
}

export function throwSnd(sr, rng) {
  const out = alloc(sr, 0.35);
  addNorm(out, whoosh(sr, rng, 0.26, 700, 2000, 900, 1.5, 0.35), sr, 0.02, 1);
  addNorm(out, rustle(sr, rng, 0.1, 2200), sr, 0, 0.35);
  return finish(out, sr);
}
export function leapSnd(sr, rng) {
  const out = alloc(sr, 0.6);
  addNorm(out, whoosh(sr, rng, 0.5, 250, 1200, 400, 1.3, 0.4), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.4, { lp: 250, env: hann }), sr, 0.03, 0.5);
  return finish(out, sr);
}
export function pickupSnd(sr, rng) {
  const out = alloc(sr, 0.3);
  addNorm(out, rustle(sr, rng, 0.12, 2600), sr, 0, 0.7);
  addNorm(out, metalClick(sr, rng, rrange(rng, 2600, 3200), 0.01), sr, 0.06, 0.35);
  addNorm(out, thump(sr, 200, 140, 0.01, 0.02), sr, 0.05, 0.3);
  return finish(out, sr);
}
export function craftSnd(sr, rng) {
  const out = alloc(sr, 1.2);
  for (let k = 0; k < 3; k++) addNorm(out, rustle(sr, rng, rrange(rng, 0.1, 0.16), rrange(rng, 1800, 2800)), sr, k * 0.24, 0.55);
  addNorm(out, metalClick(sr, rng, 2200, 0.02), sr, 0.15, 0.4);
  addNorm(out, metalClick(sr, rng, 3100, 0.02), sr, 0.44, 0.35);
  const rip = ragged(noise(sr, rng, 0.32, { hp: 1500, env: (u) => Math.min(1, u * 10) * (1 - u) }), rng, sr, 90, 0.4, 0.6);
  addNorm(out, rip, sr, 0.72, 0.6);
  return finish(out, sr);
}
export function bandageSnd(sr, rng) {
  const out = alloc(sr, 1.4);
  for (let k = 0; k < 4; k++) addNorm(out, rustle(sr, rng, 0.2, 1600 + k * 350), sr, k * 0.24, 0.6);
  const rip = ragged(noise(sr, rng, 0.25, { hp: 1800, env: (u) => Math.min(1, u * 10) * (1 - u) }), rng, sr, 110, 0.3, 0.7);
  addNorm(out, rip, sr, 1.05, 0.5);
  return finish(out, sr);
}
export function healChime(sr, rng) {
  const out = alloc(sr, 1.3);
  const freqs = [293.66, 440, 587.33, 739.99];
  for (let k = 0; k < freqs.length; k++) {
    const c = new Float32Array(Math.floor(1.2 * sr));
    const f = freqs[k];
    for (let i = 0; i < c.length; i++) {
      const u = i / c.length;
      c[i] = (Math.sin((TAU * f * i) / sr) + 0.2 * Math.sin((TAU * f * 2 * i) / sr)) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.3)), 2) * (1 - u);
    }
    addNorm(out, c, sr, k * 0.05, 0.4 - k * 0.06);
  }
  addNorm(out, rustle(sr, rng, 0.2, 2000), sr, 0, 0.25);
  return finish(out, sr, 0.8);
}
// an achievement unlocked: a rising arpeggio of bell partials (rare: an octave more on top, and a shimmer of noise)
export function achieveChime(sr, rng, rare = false) {
  const len = rare ? 2.2 : 1.5;
  const out = alloc(sr, len);
  const notes = rare ? [293.66, 369.99, 440, 587.33, 739.99] : [293.66, 440, 587.33];
  for (let k = 0; k < notes.length; k++) {
    const f = notes[k];
    const c = new Float32Array(Math.floor((len - k * 0.09) * sr));
    for (let i = 0; i < c.length; i++) {
      const t = i / sr;
      const bell = Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t / 0.25) + 0.15 * Math.sin(TAU * f * 3.02 * t) * Math.exp(-t / 0.12);
      c[i] = bell * Math.min(1, t / 0.004) * Math.exp(-t / (rare ? 0.7 : 0.5));
    }
    addNorm(out, c, sr, k * 0.09, 0.42 - k * 0.04);
  }
  if (rare) addNorm(out, noise(sr, rng, 1.2, { hp: 5000, a: 0.3, d: 0.7 }), sr, 0.25, 0.1);
  return finish(out, sr, 0.8);
}
export function uiClick(sr, rng) {
  const out = alloc(sr, 0.05);
  const c = new Float32Array(Math.floor(0.04 * sr));
  let ph = 0;
  for (let i = 0; i < c.length; i++) {
    const t = i / sr;
    ph += (1200 + 700 * Math.exp(-t / 0.004)) / sr;
    c[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.008);
  }
  addNorm(out, c, sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.004, { hp: 3000, a: 0.0001, d: 0.001 }), sr, 0, 0.4);
  return finish(out, sr, 0.9, 0.0001, 0.005);
}
export function uiHover(sr) {
  const out = alloc(sr, 0.03);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] = Math.sin(TAU * 2400 * t) * Math.exp(-t / 0.005) * Math.min(1, t / 0.001);
  }
  return finish(out, sr, 0.9, 0.0005, 0.005);
}
// A hold-to-act key went down (game/holdring.js): a soft, low latch click with a short rising tick on it, so the
// press is heard on the frame it is made, under whatever the hold itself will sound like
export function holdPress(sr, rng) {
  const out = alloc(sr, 0.09);
  const c = new Float32Array(Math.floor(0.06 * sr));
  let ph = 0;
  for (let i = 0; i < c.length; i++) {
    const t = i / sr;
    ph += (520 + 380 * Math.min(1, t / 0.03)) / sr;
    c[i] = Math.sin(TAU * ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.018);
  }
  addNorm(out, c, sr, 0, 0.8);
  addNorm(out, noise(sr, rng, 0.006, { bp: [2400, 1.2], a: 0.0002, d: 0.002 }), sr, 0, 0.35);
  return finish(out, sr, 0.8, 0.0001, 0.01);
}
// ...and the hold was broken off short of done: two dull falling notes, the press's tick run backwards
export function holdCancel(sr, rng) {
  const out = alloc(sr, 0.2);
  const note = (f0, f1, len) => {
    const c = new Float32Array(Math.floor(len * sr));
    const lp = new Biquad().lp(sr, 1400, 0.8);
    let ph = 0;
    for (let i = 0; i < c.length; i++) {
      const t = i / sr;
      ph += (f0 + (f1 - f0) * (t / len)) / sr;
      c[i] = lp.run((ph % 1) < 0.5 ? 1 : -1) * Math.min(1, t / 0.003) * Math.exp(-t / (len * 0.45));
    }
    return c;
  };
  addNorm(out, note(420, 360, 0.07), sr, 0, 0.6);
  addNorm(out, note(300, 240, 0.1), sr, 0.075, 0.6);
  addNorm(out, noise(sr, rng, 0.01, { lp: 1800, a: 0.0005, d: 0.004 }), sr, 0, 0.2);
  return finish(out, sr, 0.75, 0.0002, 0.02);
}
// ------------------------------------------------------------------ Dead Hand, the card game (ui/cards.js)
// a card put down on the table: the slap of its face on the felt and the snap of the card itself
export function cardPlay(sr, rng) {
  const out = alloc(sr, 0.22);
  addNorm(out, noise(sr, rng, 0.05, { lp: 900, a: 0.0006, d: 0.012 }), sr, 0, 1);
  addNorm(out, thump(sr, 170, 110, 0.008, 0.018, 0.08), sr, 0, 0.55);
  addNorm(out, noise(sr, rng, 0.02, { bp: [4200, 1.1], a: 0.0003, d: 0.004 }), sr, 0.002, 0.45);
  return finish(out, sr, 0.9, 0.0002, 0.02);
}
// one drawn off the deck: a short slide of card on card
export function cardDraw(sr, rng) {
  const out = alloc(sr, 0.18);
  addNorm(out, whoosh(sr, rng, 0.14, 1500, 3800, 2600, 1.4, 0.35), sr, 0, 0.8);
  addNorm(out, noise(sr, rng, 0.012, { bp: [3600, 1.4], a: 0.0003, d: 0.003 }), sr, 0.12, 0.35);
  return finish(out, sr, 0.85, 0.001, 0.02);
}
// one turned over: a flick of the edge and the air it moves
export function cardFlip(sr, rng) {
  const out = alloc(sr, 0.14);
  addNorm(out, noise(sr, rng, 0.008, { bp: [3000, 1.6], a: 0.0002, d: 0.002 }), sr, 0, 0.9);
  addNorm(out, whoosh(sr, rng, 0.08, 900, 2400, 1400, 1.2, 0.5), sr, 0.006, 0.45);
  addNorm(out, noise(sr, rng, 0.01, { bp: [2400, 1.4], a: 0.0002, d: 0.003 }), sr, 0.07, 0.5);
  return finish(out, sr, 0.85, 0.0002, 0.02);
}
// the deck riffled: two halves let go of card by card, faster and faster, then knocked square
export function cardShuffle(sr, rng) {
  const out = alloc(sr, 0.75);
  for (let k = 0; k < 2; k++) addNorm(out, crackles(sr, rng, 0.42, 150, { hp: 1800, bp: 3400 + k * 500, len: 0.0009, pow: 1.4, skew: 0.8, env: (u) => 0.4 + 0.6 * u }), sr, 0.02 + k * 0.012, 0.7);
  addNorm(out, rustle(sr, rng, 0.42, 2800), sr, 0.02, 0.35);
  addNorm(out, noise(sr, rng, 0.04, { lp: 1100, a: 0.0005, d: 0.01 }), sr, 0.52, 0.6);
  addNorm(out, noise(sr, rng, 0.03, { lp: 1300, a: 0.0005, d: 0.008 }), sr, 0.6, 0.4);
  return finish(out, sr, 0.85);
}
// cards burnt off the table (a Molotov, a scorch): a catch of flame and the paper crackling away
export function cardBurn(sr, rng) {
  const out = alloc(sr, 0.9);
  const n = Math.floor(0.8 * sr);
  const w = new Float32Array(n);
  const lp = new Biquad();
  const pk = new Pink(rng);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) lp.lp(sr, 300 + 2600 * (1 - Math.exp(-t / 0.05)) * Math.exp(-t / 0.4), 0.8);
    w[i] = lp.run(pk.next()) * Math.min(1, t / 0.04) * Math.exp(-t / 0.3);
  }
  addNorm(out, w, sr, 0, 1);
  addNorm(out, crackles(sr, rng, 0.7, 70, { hp: 1500, bp: 3000, env: (u) => 1 - u }), sr, 0.05, 0.6);
  return finish(out, sr, 0.85);
}
// a round of Dead Hand won: two bell notes up a fifth; lost: a low fall of two, muffled, over a dull knock
function cardBells(sr, notes, len, decay, step) {
  const out = alloc(sr, len);
  for (let k = 0; k < notes.length; k++) {
    const f = notes[k];
    const c = new Float32Array(Math.floor((len - k * step) * sr));
    for (let i = 0; i < c.length; i++) {
      const t = i / sr;
      c[i] = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t / 0.2)) * Math.min(1, t / 0.004) * Math.exp(-t / decay);
    }
    addNorm(out, c, sr, k * step, 0.5 - k * 0.05);
  }
  return out;
}
export function cardRoundWin(sr) {
  return finish(cardBells(sr, [392, 587.33], 1.1, 0.42, 0.12), sr, 0.8);
}
export function cardRoundLose(sr, rng) {
  const out = cardBells(sr, [220, 174.61], 1.2, 0.45, 0.2);
  const lp = new Biquad().lp(sr, 900, 0.7);
  for (let i = 0; i < out.length; i++) out[i] = lp.run(out[i]);
  addNorm(out, thump(sr, 90, 55, 0.03, 0.08), sr, 0, 0.5);
  addNorm(out, noise(sr, rng, 0.06, { lp: 400, a: 0.001, d: 0.02 }), sr, 0, 0.3);
  return finish(out, sr, 0.8);
}
export function heartbeat(sr, rng) {
  const out = alloc(sr, 0.65);
  addNorm(out, thump(sr, 62, 42, 0.04, 0.07), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.08, { lp: 160, env: hann }), sr, 0, 0.4);
  addNorm(out, thump(sr, 56, 40, 0.04, 0.06), sr, 0.27, 0.72);
  addNorm(out, noise(sr, rng, 0.07, { lp: 150, env: hann }), sr, 0.27, 0.3);
  return finish(out, sr);
}
export function jumpSnd(sr, rng) {
  const out = alloc(sr, 0.32);
  addNorm(out, rustle(sr, rng, 0.12, 2200), sr, 0, 0.6);
  const ex = voice(sr, rng, { dur: 0.18, pitch: [[0, 130], [1, 110]], vowels: [[0, 'uh'], [1, 'a']], voiced: 0.15, breath: 1, drive: 1.2, hp: 300, env: [[0, 0], [0.2, 1], [1, 0]] });
  addNorm(out, ex, sr, 0.03, 0.45);
  return finish(out, sr);
}
export function landSnd(sr, rng) {
  const out = alloc(sr, 0.32);
  addNorm(out, thump(sr, 95, 48, 0.02, 0.05), sr, 0, 1);
  addNorm(out, noise(sr, rng, 0.12, { lp: 700, a: 0.001, d: 0.03 }), sr, 0, 0.7);
  addNorm(out, crackles(sr, rng, 0.08, 150, { hp: 2000, bp: 3500 }), sr, 0.004, 0.25);
  for (let k = 0; k < 2; k++) addNorm(out, metalClick(sr, rng, rrange(rng, 1800, 2600), 0.01), sr, 0.03 + k * 0.05, 0.12);
  return finish(out, sr);
}
export function flashlightClick(sr, rng) {
  const out = alloc(sr, 0.1);
  addNorm(out, modal(sr, rng, [{ f: 3400, d: 0.004 }, { f: 5200, d: 0.003, a: 0.6 }, { f: 1500, d: 0.006, a: 0.5 }], 0.03, 0.2), sr, 0, 1);
  addNorm(out, modal(sr, rng, [{ f: 2800, d: 0.004 }, { f: 4600, d: 0.003, a: 0.6 }, { f: 1300, d: 0.006, a: 0.5 }], 0.03, 0.2), sr, 0.035, 0.7);
  return finish(out, sr, 0.9, 0.0001, 0.005);
}
export function clawSnd(sr, rng) {
  const out = alloc(sr, 0.45);
  addNorm(out, whoosh(sr, rng, 0.14, 800, 2600, 1200, 1.6, 0.6), sr, 0, 0.8);
  const tear = ragged(noise(sr, rng, 0.12, { hp: 1500, a: 0.001, d: 0.04 }), rng, sr, 160, 0.3, 0.7);
  addNorm(out, tear, sr, 0.09, 0.8);
  addNorm(out, zPain(sr, rng, 1), sr, 0.02, 0.3);
  return finish(out, sr);
}
export function notifySnd(sr, rng) {
  const out = alloc(sr, 0.6);
  addNorm(out, whoosh(sr, rng, 0.5, 350, 1700, 1300, 1.2, 0.7), sr, 0, 0.8);
  const c = new Float32Array(Math.floor(0.4 * sr));
  for (let i = 0; i < c.length; i++) c[i] = Math.sin((TAU * 587.33 * i) / sr) * hann(i / c.length) * 0.5;
  addNorm(out, c, sr, 0.15, 0.2);
  return finish(out, sr, 0.8);
}
export function chatBlip(sr) {
  const out = alloc(sr, 0.06);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    ph += (1250 + 250 * Math.min(1, t / 0.03)) / sr;
    out[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.018) * Math.min(1, t / 0.002);
  }
  return finish(out, sr, 0.9, 0.001, 0.01);
}
// walkie-talkie squelch: the click of the key and a short tail of static
export function radioSquelch(sr, rng) {
  const out = alloc(sr, 0.16);
  addNorm(out, noise(sr, rng, 0.012, { bp: [2400, 1.2], a: 0.0005, d: 0.004 }), sr, 0, 0.9);
  addNorm(out, noise(sr, rng, 0.13, { bp: [1700, 0.8], a: 0.004, d: 0.045 }), sr, 0.008, 0.5);
  return finish(out, sr, 0.9, 0.0005, 0.02);
}
export function installPart(sr, rng) {
  const out = alloc(sr, 1.0);
  for (let k = 0; k < 6; k++) addNorm(out, metalClick(sr, rng, 2200 + (k % 2) * 200, 0.01), sr, k * 0.062, 0.45);
  addNorm(out, metalHit(sr, rng, 160), sr, 0.45, 0.8);
  return finish(out, sr);
}
export function eatSnd(sr, rng) {
  const out = alloc(sr, 1.15);
  for (let k = 0; k < 3; k++) {
    const t = k * 0.34 + rng() * 0.04;
    addNorm(out, crackles(sr, rng, 0.08, 220, { hp: 1500, bp: 2500, pow: 1.5 }), sr, t, 0.7);
    addNorm(out, noise(sr, rng, 0.08, { bp: [800, 2], env: hann }), sr, t + 0.02, 0.4);
    addNorm(out, thump(sr, 120, 80, 0.01, 0.02), sr, t, 0.3);
  }
  return finish(out, sr);
}
// ring-pull tin: tab snaps up, the lid peels back, the lid springs free
export function canOpenSnd(sr, rng) {
  const out = alloc(sr, 0.75);
  addNorm(out, metalClick(sr, rng, rrange(rng, 3200, 3600), 0.012), sr, 0.02, 0.6);
  const peel = ragged(noise(sr, rng, 0.36, { hp: 1400, bp: [2400, 1.2], sweep: [2400, 4200], env: (u) => Math.min(1, u * 8) * (1 - u * 0.6) }), rng, sr, 70, 0.35, 0.65);
  addNorm(out, peel, sr, 0.12, 0.55);
  addNorm(out, metalClick(sr, rng, rrange(rng, 1700, 2000), 0.03), sr, 0.5, 0.5);
  return finish(out, sr);
}
// a can of something fizzy: the tab cracks it, the gas hisses out, it fizzes, and two gulps go down (timed to the
// can at the mouth in the first-person drink: ViewModel._animUse)
export function drinkSnd(sr, rng) {
  const out = alloc(sr, 1.0);
  addNorm(out, metalClick(sr, rng, rrange(rng, 2600, 3000), 0.01), sr, 0, 0.55);
  addNorm(out, noise(sr, rng, 0.22, { hp: 2500, bp: [5200, 0.8], env: (u) => Math.min(1, u * 30) * (1 - u) ** 2 }), sr, 0.008, 0.6);
  addNorm(out, bubbles(sr, rng, 0.5, 90, 1800, 4200, { env: (u) => 1 - u }), sr, 0.06, 0.16);
  for (const t of [0.45, 0.7]) {
    const at = t + rng() * 0.03;
    addNorm(out, thump(sr, 210, 95, 0.025, 0.045), sr, at, 0.55);
    addNorm(out, noise(sr, rng, 0.07, { lp: 900, env: hann }), sr, at + 0.01, 0.25);
  }
  return finish(out, sr);
}
export function buildFail(sr, rng) {
  const out = alloc(sr, 0.45);
  addNorm(out, woodHit(sr, rng, 0.7), sr, 0, 0.6);
  const c = new Float32Array(Math.floor(0.3 * sr));
  const lp = new Biquad().lp(sr, 700, 0.9);
  let ph = 0;
  for (let i = 0; i < c.length; i++) {
    ph += 98 / sr;
    c[i] = lp.run((ph % 1) < 0.5 ? 1 : -1) * Math.min(1, i / (0.01 * sr)) * (1 - i / c.length);
  }
  addNorm(out, c, sr, 0.03, 0.5);
  return finish(out, sr);
}
// a teammate is down (game/matedown.js): a falling two-note alarm, twice, over a burst of radio hiss. Unlike the soft
// notify chime it has to cut through a full horde, so it is bright (a square through a lowpass, high and low notes a
// fifth apart) and repeats once, the way a car alarm does
export function mateDownAlarm(sr, rng) {
  const out = alloc(sr, 0.8);
  addNorm(out, noise(sr, rng, 0.09, { bp: [1800, 0.9], a: 0.002, d: 0.03 }), sr, 0, 0.35);
  const note = (hz, len) => {
    const c = new Float32Array(Math.floor(len * sr));
    const lp = new Biquad().lp(sr, 3200, 0.8);
    let ph = 0;
    for (let i = 0; i < c.length; i++) {
      ph += hz / sr;
      c[i] = lp.run((ph % 1) < 0.5 ? 1 : -1) * Math.min(1, i / (0.004 * sr)) * Math.min(1, (c.length - i) / (0.02 * sr));
    }
    return c;
  };
  for (let k = 0; k < 2; k++) {
    addNorm(out, note(988, 0.15), sr, 0.03 + k * 0.36, 0.8);
    addNorm(out, note(659, 0.17), sr, 0.2 + k * 0.36, 0.8);
  }
  return finish(out, sr);
}
export function playerDeathLocal(sr, rng) {
  const out = alloc(sr, 2.2);
  addNorm(out, humanDeath(sr, rng), sr, 0, 0.85);
  addNorm(out, thump(sr, 80, 40, 0.03, 0.09), sr, 1.1, 0.7);
  addNorm(out, noise(sr, rng, 0.2, { lp: 600, a: 0.002, d: 0.05 }), sr, 1.1, 0.5);
  return finish(out, sr);
}

// ------------------------------------------------------------------ footsteps
export function footstep(sr, rng, surface) {
  const out = alloc(sr, 0.36);
  switch (surface) {
    case 'wood':
      addNorm(out, modal(sr, rng, woodModes(rng, rrange(rng, 0.75, 0.9), 1.3), 0.3, 2, 1800), sr, 0, 0.9);
      addNorm(out, thump(sr, 100, 60, 0.015, 0.03), sr, 0, 0.5);
      if (rng() < 0.35) addNorm(out, creak(sr, rng, 0.14, 40, 90, 1.3), sr, 0.03, 0.15);
      break;
    case 'grass':
      addNorm(out, thump(sr, 90, 55, 0.015, 0.025), sr, 0, 0.3);
      addNorm(out, noise(sr, rng, 0.16, { hp: 2200, lp: 7000, env: (u) => Math.min(1, u * 8) * (1 - u) ** 2 }), sr, 0, 0.8);
      addNorm(out, crackles(sr, rng, 0.12, 120, { hp: 2500, bp: 4200, env: (u) => 1 - u }), sr, 0.01, 0.3);
      break;
    case 'water': {
      addNorm(out, noise(sr, rng, 0.22, { bp: [800, 1.1], sweep: [600, 2600, 0.6], env: (u) => Math.min(1, u * 12) * (1 - u) ** 1.5 }), sr, 0, 0.9);
      addNorm(out, bubbles(sr, rng, 0.25, 40, 400, 1500, { env: (u) => 1 - u }), sr, 0.02, 0.5);
      addNorm(out, noise(sr, rng, 0.2, { lp: 400, env: hann }), sr, 0, 0.4);
      break;
    }
    case 'metal':
      addNorm(out, modal(sr, rng, metalModes(rng, rrange(rng, 210, 300), 0.18), 0.35, 1, 3000), sr, 0, 0.7);
      addNorm(out, thump(sr, 110, 60, 0.015, 0.03), sr, 0, 0.6);
      addNorm(out, noise(sr, rng, 0.05, { lp: 1500, a: 0.001, d: 0.01 }), sr, 0, 0.4);
      break;
    default: // dirt
      addNorm(out, thump(sr, rrange(rng, 100, 125), 58, 0.015, 0.028), sr, 0, 0.7);
      addNorm(out, noise(sr, rng, 0.12, { lp: 1100, a: 0.001, d: 0.028 }), sr, 0, 0.8);
      addNorm(out, crackles(sr, rng, 0.08, 220, { hp: 2200, bp: 3600, env: (u) => 1 - u }), sr, 0.004, 0.35);
      addNorm(out, noise(sr, rng, 0.06, { lp: 900, a: 0.004, d: 0.015 }), sr, rrange(rng, 0.035, 0.06), 0.35);
  }
  return finish(out, sr, 0.9, 0.0005, 0.03);
}
// a very heavy body putting a foot down (tank, bosses): a sub thump under a knock that small speakers still carry,
// the dull thud of packed earth, a little grit
export function heavyStep(sr, rng) {
  const out = alloc(sr, 0.7);
  addNorm(out, thump(sr, rrange(rng, 130, 150), 44, 0.05, 0.12, 0.7), sr, 0, 1);
  addNorm(out, thump(sr, rrange(rng, 210, 240), 95, 0.02, 0.05), sr, 0, 0.7);
  addNorm(out, noise(sr, rng, 0.3, { lp: 520, a: 0.002, d: 0.06 }), sr, 0, 0.85);
  addNorm(out, noise(sr, rng, 0.14, { lp: 1600, a: 0.001, d: 0.03 }), sr, 0, 0.45);
  addNorm(out, crackles(sr, rng, 0.25, 90, { hp: 900, bp: 2200, env: (u) => (1 - u) ** 2 }), sr, 0.02, 0.18);
  normalize(out, 1);
  softclip(out, 1.8);
  return finish(out, sr, 0.95, 0.0005, 0.05);
}
