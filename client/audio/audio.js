// WebAudio engine. Every sound, ambience bed and the music is synthesised at runtime; a curated set of CC0 field
// recordings (samples.js: ambience beds, wildlife, footsteps, wood/fire foley, gunshots, zombie voices, bullet impacts)
// is layered on top once it has loaded, with the procedural sounds as the fallback for anything that is missing.
// Public API on the AudioEngine class below.
import { SOUND } from '../../shared/defs.js';
import { jobList, DEF_BY_BANK } from './registry.js';
import { bankMethods } from './banks.js';
import { Music } from './music.js';
import { Ambience } from './ambience.js';
import { Recordings } from './samples.js';
import { CATS, SOUND_MAP, STRIKE_MAP, LOCAL, STINGERS, LOOPS, LOOP_CAP_TOTAL, STEP_BANKS, STEP_REC, STEP_TONE, FAR_NEAR, FAR_FULL } from './sound-defs.js';
import { VoicePool } from './voice-pool.js';
import { LoopEmitter } from './loop-emitter.js';
import { VoiceSource, NULL_VOICE, VOICE_BUS, DUCK_MUSIC, DUCK_WORLD, DUCK_FLOOR, DUCK_FULL, DUCK_HOLD, DUCK_MS } from './voice-chat.js';
import { setPannerPos, gainNode, biquad } from './nodes.js';
import { clamp01 } from './curves.js';

export { STRIKE_NAMES } from './sound-defs.js';

const EMPTY = Object.freeze({});
const MAX_POS_VOICES = 40;
const MAX_HRTF = 14;
const TICK_MS = 200;

const dbJit = (db) => Math.pow(10, ((Math.random() * 2 - 1) * db) / 20);
const rrange = (r) => r[0] + (r[1] - r[0]) * Math.random();

// Output soft clipper: straight up to CLIP_KNEE, then rounded off so it can never pass CLIP_CEIL (the limiter before
// it is a compressor, not a brick wall: fast transients overshoot it).
const CLIP_RANGE = 4; // input range covered by the curve (x full scale)
const CLIP_KNEE = 0.8;
const CLIP_CEIL = 0.98;
let clipCurve = null;
function softClipCurve() {
  if (!clipCurve) {
    const n = 4097;
    clipCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * CLIP_RANGE;
      const a = Math.abs(x);
      clipCurve[i] = Math.sign(x) * (a <= CLIP_KNEE ? a : CLIP_KNEE + (CLIP_CEIL - CLIP_KNEE) * Math.tanh((a - CLIP_KNEE) / (CLIP_CEIL - CLIP_KNEE)));
    }
  }
  return clipCurve;
}

const RING_VOL = 0.085; // a screecher's ringing (ring): plainly there over the fight, not painful
const RING_WORLD = 0.08; // the world and the music under it: all but gone while it rings (ring, _ringDuck)
const RING_VOICE = 0.3; // the other survivors' voices: faint, but there
const RING_FADE = 1.5; // s it takes to fade once it is over
const RING_LP = 900; // Hz: the world through ringing ears
const RADIO_STATIC_VOL = 0.28; // radioStatic(1) about -22 LUFS, a few dB under the forest and well under a voice; held (0.35), -31
const NULL_LOOP = Object.freeze({ setPosition() {}, setVolume() {}, setRate() {}, stop() {} });
const CALM_WIND = Object.freeze({ speed: 4, gust: 0.4, strength: 0.18 });

// ------------------------------------------------------------------ engine
export class AudioEngine {
  // opts.recordings: false = procedural sound only (never fetches the recordings)
  constructor(opts = EMPTY) {
    this._opts = opts || EMPTY;
    this._rec = null;
    this._ctx = null;
    this._ready = false;
    this._initPromise = null;
    this._banks = new Map(); // bank -> sparse array by variant index
    this._pools = new Map(); // bank -> compact array of loaded buffers
    this._lastVariant = new Map();
    this._waiters = new Map(); // bank -> callbacks waiting for the buffer
    this._loops = new Set();
    this._voices = new Set();
    this._static = null; // the walkie-talkie hiss (radioStatic): { src, g }, made the first time it is wanted
    this._staticLvl = 0;
    this._lx = 0;
    this._ly = 0;
    this._lz = 0;
    this._lyaw = NaN;
    this._lpitch = NaN;
    this._state = {
      night: 0, horde: false, boss: false, danger: 0, lowHealth: 0, nearFire: 0, underCover: false, rain: 0, dead: false, menu: false,
      nightPhase: false, cycle: NaN, wind: NaN, gust: NaN, open: 0, indoor: 0, home: false, homeless: false,
    };
    this._vol = { master: 1, music: 1, sfx: 1, ambience: 1, voice: 1 };
    this._duck = { on: true, k: 0, set: 0, at: 0, timer: null, buf: null };
    this._rateMul = 1;
    this._hrtfCount = 0;
    this._hbNext = 0;
    this._lastResume = 0;
    this._timer = null;
    this._loopScratch = [];
    this._mix = { world: -1, sfxLP: -1, ring: 0 };
    this._queue = null;
    this._foot = 1; // alternates the own footsteps a hair left / right
    this._gearT = 2; // steps until the next clothing rustle
    this._evictAt = 0;
  }

  get ready() {
    return this._ready;
  }
  get context() {
    return this._ctx;
  }
  // current ambience wind { speed m/s, gust 0..1, strength 0..1 } (e.g. for foliage sway that matches the sound)
  get wind() {
    return this._ambience ? this._ambience.wind : CALM_WIND;
  }

  init() {
    if (!this._initPromise) this._initPromise = this._init();
    return this._initPromise;
  }

  // the page is about to be loaded again (main.js reloadInto): the sound card and the synth workers are let go now,
  // not whenever the browser gets round to the old page
  close() {
    clearInterval(this._timer);
    clearInterval(this._duck?.timer);
    if (this._queue) {
      this._queue.jobs.length = 0; // (nothing more is rendered, on the main thread either)
      this._queue.late.length = 0;
      this._finishWorkers();
    }
    this._ready = false;
    this._ctx?.close().catch(() => {});
  }

  async _init() {
    // --- synchronous part: must run inside the user gesture
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) {
      console.warn('[audio] WebAudio not supported');
      return;
    }
    let c;
    try {
      c = new AC({ latencyHint: 'interactive' });
    } catch {
      c = new AC();
    }
    this._ctx = c;
    try {
      const p = c.resume();
      if (p && p.catch) p.catch(() => {});
    } catch {}
    const t0 = performance.now();
    this._buildGraph();
    this._applyVolumes(0);
    this._applyListener(true);
    this._rec = new Recordings(c, this._opts.recordings !== false);

    // --- asynchronous rendering (web workers, main-thread fallback)
    const { core, late } = jobList();
    this._queue = { jobs: core.slice(), late: late.slice(), workers: [], inflight: new Map(), seq: 0 };
    await this._renderJobs(true);
    this._music = new Music(this);
    this._ambience = new Ambience(this);
    this._ready = true;
    console.info(`[audio] ready in ${(performance.now() - t0).toFixed(0)}ms (${this._pools.size} banks, ${c.sampleRate}Hz, ${this._queue.workers.filter((r) => !r.dead).length} workers)`);
    // late / rarely needed sounds continue in the background
    this._renderJobs(false).then(() => {
      this._queue.finished = true;
      this._finishWorkers();
    });
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._applyStateNow();
    this._tick();
    // recordings stream in behind the procedural sound (beds crossfade over once decoded)
    const night = this._state.night > 0.5;
    const score = this._state.menu ? 'mus_menu' : this._state.nightPhase ? 'mus_threat' : night ? 'mus_night' : 'mus_day';
    this._rec.start([night ? 'amb_night' : 'amb_day', score, night ? 'amb_crickets' : 'amb_day_wind', 'wind_light', 'wind_mid', 'fs_grass', 'fs_dirt', 'gun_pistol', 'hit_bullet', 'zv_growl', 'zv_attack', 'zv_pain', 'zv_death', 'cloth', 'fs_wood', 'fire_roar', 'fire_loop']);
  }

  _buildGraph() {
    const c = this._ctx;
    const g = (v = 1) => gainNode(c, v);
    // Master dynamics. A gentle 2:1 "glue" compressor, a fast limiter for whatever still gets through, then a soft
    // clipper so nothing leaves above full scale. Deliberately light: a quiet forest stays some 12 dB under automatic
    // fire (measured on the bus) - squeezing harder makes the night as loud as the gunfight and both of them tiring.
    // (WebAudio compressors add their own make-up gain; _makeup / _post trim the chain back to ~+3 dB for quiet sound.)
    this._master = g(1);
    this._comp = c.createDynamicsCompressor();
    this._comp.threshold.value = -12;
    this._comp.knee.value = 8;
    this._comp.ratio.value = 2;
    this._comp.attack.value = 0.006;
    this._comp.release.value = 0.25;
    this._makeup = g(1.1);
    this._limit = c.createDynamicsCompressor();
    this._limit.threshold.value = -3;
    this._limit.knee.value = 2;
    this._limit.ratio.value = 20;
    this._limit.attack.value = 0.001;
    this._limit.release.value = 0.1;
    this._post = g(0.9 / CLIP_RANGE); // (the shaper reads its curve over -1..1: scale -CLIP_RANGE..CLIP_RANGE into that)
    this._clip = c.createWaveShaper();
    this._clip.curve = softClipCurve();
    this._pre = g(1);
    // user master volume sits after the dynamics, so the slider scales the output instead of just easing the compressor
    this._pre.connect(this._comp);
    this._comp.connect(this._makeup);
    this._makeup.connect(this._limit);
    this._limit.connect(this._post);
    this._post.connect(this._clip);
    this._clip.connect(this._master);
    this._master.connect(c.destination);

    // world bus: sfx + ambience + reverb, muffled when dead
    this._worldIn = g(1);
    this._worldLP = biquad(c, 'lowpass', 20000, 0.6);
    this._worldIn.connect(this._worldLP);
    this._worldDuck = g(1); // (voice chat ducking)
    this._worldLP.connect(this._worldDuck);
    this._ringDuck = g(1); // (ringing ears: the world and the music fade under the ring, _tick)
    this._ringDuck.connect(this._pre);
    this._worldDuck.connect(this._ringDuck);

    this._sfxIn = g(1); // user sfx volume
    this._sfxLP = biquad(c, 'lowpass', 20000, 0.5); // low-health muffle
    this._sfxIn.connect(this._sfxLP);
    this._sfxLP.connect(this._worldIn);
    this._ambIn = g(1);
    this._ambIn.connect(this._worldIn);
    this._uiIn = g(1);
    this._uiIn.connect(this._pre);
    this._musicIn = g(1);
    this._musicDuck = g(1);
    this._musicIn.connect(this._musicDuck);
    this._musicDuck.connect(this._ringDuck);
    this._voiceIn = g(1);
    this._voiceRing = g(1);
    this._voiceIn.connect(this._voiceRing);
    this._voiceRing.connect(this._pre);
    this._voiceAn = c.createAnalyser(); // how loud the voices you can hear are right now: drives the ducking
    this._voiceAn.fftSize = 1024;
    this._voiceIn.connect(this._voiceAn);
    this._duck.buf = new Float32Array(this._voiceAn.fftSize);

    // shared reverb: forest by default, crossfading to an open-field or a small-room response (buffers assigned when
    // their IRs are rendered); convolvers that have been silent for a while are disconnected to save CPU
    this._revIn = g(1);
    this._revIn.channelCount = 1;
    this._revIn.channelCountMode = 'explicit';
    this._conv = c.createConvolver();
    this._revOut = g(0.9);
    this._envs = {};
    for (const name of ['forest', 'open', 'room']) {
      const conv = name === 'forest' ? this._conv : c.createConvolver();
      const gain = g(name === 'forest' ? 1 : 0);
      gain.connect(conv);
      conv.connect(this._revOut);
      if (name === 'forest') this._revIn.connect(gain);
      this._envs[name] = { conv, gain, on: name === 'forest', w: name === 'forest' ? 1 : 0, zeroAt: 0 };
    }
    this._revOut.connect(this._worldIn);
    this._sfxSend = g(1);
    this._sfxSend.connect(this._revIn);
    this._ambSend = g(1);
    this._ambSend.connect(this._revIn);

    this._pool = new VoicePool(this, MAX_POS_VOICES, this._sfxIn, this._sfxSend);
    // pre-warm the HRTF database (Chrome loads it asynchronously on first use)
    const warm = this._pool.chans[0];
    warm.panner.panningModel = 'HRTF';
    warm.model = 'HRTF';
  }

  _resume() {
    const c = this._ctx;
    if (c && c.state !== 'running') {
      const t = performance.now();
      if (t - this._lastResume > 1000) {
        this._lastResume = t;
        try {
          const p = c.resume();
          if (p && p.catch) p.catch(() => {});
        } catch {}
      }
    }
  }

  // ---------------------------------------------------------------- listener
  setListener(x, y, z, yaw, pitch) {
    if (x === this._lx && y === this._ly && z === this._lz && yaw === this._lyaw && pitch === this._lpitch) return;
    this._lx = +x || 0;
    this._ly = +y || 0;
    this._lz = +z || 0;
    this._lyaw = +yaw || 0;
    this._lpitch = +pitch || 0;
    if (this._ctx) this._applyListener(false);
  }

  _applyListener() {
    const L = this._ctx.listener;
    const yaw = this._lyaw || 0;
    const pitch = this._lpitch || 0;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const fx = -sy * cp;
    const fy = sp;
    const fz = -cy * cp;
    // up vector orthogonal to forward (stays valid when looking straight up/down)
    const ux = -sy * -sp;
    const uy = cp;
    const uz = -cy * -sp;
    if (L.positionX) {
      L.positionX.value = this._lx;
      L.positionY.value = this._ly;
      L.positionZ.value = this._lz;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(this._lx, this._ly, this._lz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // ---------------------------------------------------------------- one-shots
  play(soundId, opts = EMPTY) {
    this._playDef(SOUND_MAP[soundId], opts);
  }
  // a blow on the world, or a wreck coming apart: by name (STRIKE_MAP; shared/surfaces.js soundFor)
  strike(name, opts = EMPTY) {
    this._playDef(STRIKE_MAP[name], opts);
  }
  _playDef(d, opts) {
    if (!this._ready) return;
    if (!d) return;
    const o = opts || EMPTY;
    const pos = !(d.cat === '2d' || o.x === undefined || o.x === null);
    let bank = d.bank;
    let lv = 1;
    const delay = +o.delay || 0; // opts.delay (s): start a little later (a body takes a moment to hit the ground)
    if (d.rec && this._playRec(d.rec, pos ? d.cat : null, pos ? +o.x : 0, pos ? +(o.y ?? this._ly) : 0, pos ? +(o.z ?? 0) : 0, (o.volume ?? 1) * d.vol, this._sfxIn, d.send, o.rate ?? 1, delay)) {
      if (!d.rec.layer) return;
      if (d.rec.layer !== true) bank = d.rec.layer;
      lv = d.rec.layerVol ?? 1;
    }
    const buf = this._pick(bank, o.variant);
    if (!buf) {
      this._need(bank);
      return;
    }
    this._resume();
    const vol = (o.volume ?? 1) * d.vol * lv * (0.92 + Math.random() * 0.16);
    const rate = (o.rate ?? 1) * (d.rate ?? 1) * (1 + (Math.random() - 0.5) * 2 * d.jit) * this._rateMul;
    if (!pos) {
      this._play2D(buf, vol, rate, this._sfxIn, d.send, delay ? this._ctx.currentTime + delay : 0);
      return;
    }
    this._playPos(buf, d.cat, +o.x, +(o.y ?? this._ly), +(o.z ?? 0), vol, rate, 0, 0, delay);
  }

  /**
   * A one-shot by its bank's name, for sounds that no SOUND id and no LOCAL name stand for: the nunchucks' own, played
   * off their simulated chain at whatever pitch it is going (game/nunchaku.js). opts: { x, y, z: where in the world
   * (none: the listener's own hands, not placed), cat: its positional category ('fx'), volume, rate, variant }.
   */
  playBank(bank, opts = EMPTY) {
    if (!this._ready) return;
    const o = opts || EMPTY;
    const buf = this._pick(bank, o.variant);
    if (!buf) {
      this._need(bank);
      return;
    }
    this._resume();
    const vol = (o.volume ?? 1) * (0.94 + Math.random() * 0.12);
    const rate = (o.rate ?? 1) * this._rateMul;
    if (o.x === undefined || o.x === null) this._play2D(buf, vol, rate, this._sfxIn, 0.06, 0);
    else this._playPos(buf, o.cat || 'fx', +o.x, +(o.y ?? this._ly), +(o.z ?? 0), vol, rate);
  }

  /**
   * A recording by its key (samples.js REC), whole and not placed: a voice everyone hears the same. -> true once it
   * has started; false while it is still being fetched or decoded (asked for now: try again shortly), or if there is
   * none to play.
   */
  playRecording(key, volume = 1) {
    const rec = this._rec;
    if (!this._ready || !rec) return false;
    const buf = rec.get(key);
    if (!buf) return false;
    this._resume();
    this._play2D(buf, volume, 1, this._sfxIn, 0.06, 0);
    return true;
  }

  playLocal(name, opts = EMPTY) {
    if (!this._ready) return;
    const d = LOCAL[name];
    if (!d) return;
    const o = opts || EMPTY;
    const ui = d.bus === 'ui';
    const dest = ui ? this._uiIn : this._sfxIn;
    let bank = d.bank;
    let lv = 1;
    if (d.rec && this._playRec(d.rec, null, 0, 0, 0, (o.volume ?? 1) * d.vol, dest, d.send ?? 0.06, o.rate ?? 1)) {
      if (!d.rec.layer) return;
      if (d.rec.layer !== true) bank = d.rec.layer;
      lv = d.rec.layerVol ?? 1;
    }
    const buf = this._pick(bank, o.variant);
    if (!buf) {
      this._need(bank);
      return;
    }
    this._resume();
    const jit = d.jit ?? 0.04;
    const vol = (o.volume ?? 1) * d.vol * lv * (ui ? 1 : 0.94 + Math.random() * 0.12);
    const rate = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 2 * jit) * (ui ? 1 : this._rateMul);
    this._play2D(buf, vol, rate, dest, d.send ?? 0.06, 0);
  }

  // The hiss of the walkie-talkie (game/radio.js), 0..1: faint while ours is in hand, up under a voice coming over
  // it. One loop on the ui bus (heard the same alive or dying), started the first time it is wanted.
  radioStatic(level) {
    if (!this._ready) return;
    level = this._state.menu ? 0 : Math.max(0, Math.min(1, +level || 0));
    if (level === this._staticLvl) return;
    if (!this._static) {
      if (level <= 0) return;
      const buf = this._pick('radio_static');
      if (!buf) return this._need('radio_static');
      const c = this._ctx;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = gainNode(c, 0);
      src.connect(g);
      g.connect(this._uiIn);
      src.start(c.currentTime, Math.random() * buf.duration);
      this._static = { src, g };
    }
    this._staticLvl = level;
    this._static.g.gain.setTargetAtTime(level * RADIO_STATIC_VOL, this._ctx.currentTime, 0.03);
  }

  // A screecher's scream close by (EVT.SCREECH): the ears ring for secs - a thin, high tone right in the head, two
  // pitches a few hertz apart so it beats, and the world dulled under it (_tick: the sfx low-pass) - or until
  // stopRing() (the screecher is dead, or so is the survivor). It comes in at once and goes slowly; a second scream
  // while it rings only makes it last. The tone is on the ui bus: it is in the head, not out in the world
  ring(secs) {
    if (!this._ready || this._state.menu || !(secs > 0)) return;
    const c = this._ctx;
    const now = c.currentTime;
    if (!this._ring) {
      const g = gainNode(c, 0);
      const osc = [3870, 3911, 7790].map((f, i) => {
        const o = c.createOscillator();
        o.frequency.value = f;
        const k = gainNode(c, i === 2 ? 0.12 : 0.5);
        o.connect(k);
        k.connect(g);
        o.start(now);
        return o;
      });
      g.connect(this._uiIn);
      this._ring = { g, osc, end: now };
    }
    this._ring.end = Math.max(this._ring.end, now + secs);
    this._ring.g.gain.setTargetAtTime(RING_VOL, now, 0.04);
  }
  stopRing() {
    if (this._ring) this._ring.end = Math.min(this._ring.end, this._ctx.currentTime);
  }
  // how hard the ears still ring, 0..1 (fading over the last RING_FADE s), for the muffle in _tick
  _ringing(now) {
    const r = this._ring;
    if (!r) return 0;
    const left = r.end - now;
    if (left > -RING_FADE) {
      const k = Math.max(0, Math.min(1, (left + RING_FADE) / RING_FADE));
      if (left < 0) r.g.gain.setTargetAtTime(RING_VOL * k * k, now, 0.1);
      return left > 0 ? 1 : k;
    }
    for (const o of r.osc) o.stop();
    r.g.disconnect();
    this._ring = null;
    return 0;
  }

  // recorded foley (R_* defs): every layer must be decoded, otherwise false and the caller plays the procedural bank
  // (a recording that is only waiting to be decoded is asked for, so it is there the next time).
  // cat = positional category or null for 2D; pitch = the caller's own rate on top of the take's pitch range.
  _playRec(r, cat, x, y, z, vol, dest, send, pitch = 1, delay = 0) {
    const rec = this._rec;
    if (!rec) return false;
    const layers = r.layers || null;
    let ready = true;
    for (let i = layers ? layers.length - 1 : 0; i >= 0; i--) {
      const key = layers ? layers[i].key : r.key;
      if (rec.has(key)) continue;
      rec.want(key);
      ready = false;
    }
    if (!ready) return false;
    this._resume();
    const now = this._ctx.currentTime;
    // distant perspective: equal-power crossfade from the close recording to the far one with distance
    let near = 1;
    const F = cat && r.far;
    if (F && rec.has(F.key)) {
      const dx = x - this._lx;
      const dy = y - this._ly;
      const dz = z - this._lz;
      const k = clamp01((Math.sqrt(dx * dx + dy * dy + dz * dz) - FAR_NEAR) / (FAR_FULL - FAR_NEAR));
      if (k > 0) {
        const fb = rec.get(F.key);
        const [off, dur] = rec.pick(F.key, fb);
        this._playPos(fb, cat, x, y, z, vol * F.vol * Math.sqrt(k) * dbJit(1.5), rrange(F.pitch) * pitch * this._rateMul, off, dur, delay);
        near = Math.sqrt(1 - k);
        if (near < 0.05) return true;
      }
    }
    const n = layers ? layers.length : 1;
    for (let i = 0; i < n; i++) {
      const L = layers ? layers[i] : r;
      const buf = rec.get(L.key);
      let t = (L.at || 0) + delay;
      const hits = L.hits ? Math.round(rrange(L.hits)) : 1;
      for (let h = 0; h < hits; h++) {
        const [off, dur] = rec.pick(L.key, buf);
        const rate = rrange(L.pitch) * pitch * this._rateMul;
        const v = vol * near * L.vol * dbJit(1.5);
        if (cat) this._playPos(buf, cat, x, y, z, v, rate, off, dur, t, L.lp);
        else this._play2D(buf, v, rate, dest, send, now + t, off, dur, L.lp);
        if (L.gap) t += rrange(L.gap);
      }
    }
    return true;
  }

  // surface: 'dirt' | 'grass' | 'forest' | 'leaves' | 'gravel' | 'road' | 'mud' | 'wood' | 'water' | 'metal'.
  // x undefined = the local player's own feet (2D). opts (optional): { crouch, run, heavy }; for the local player
  // crouch / run are otherwise inferred from the volume the game passes (0.25 crouch, 0.8 sprint).
  footstep(surface, x, y, z, volume = 1, opts = EMPTY) {
    if (!this._ready) return;
    const local = x === undefined || x === null;
    // heavy (tank, bosses): a ground-shaking thump under the surface step, carrying far past where a footstep fades
    if (opts && opts.heavy && !local) {
      const th = this._pick('step_heavy');
      if (th) this._playPos(th, 'thump', +x, +(y ?? this._ly), +(z ?? 0), (volume ?? 1) * dbJit(1.5), (0.92 + Math.random() * 0.16) * this._rateMul);
    }
    const key = STEP_REC[surface];
    const rec = key && this._rec && this._rec.has(key) ? this._rec.get(key) : null;
    if (!rec) {
      const buf = this._pick(STEP_BANKS[surface] || 'step_dirt');
      if (!buf) return;
      const vol = (volume ?? 1) * (0.88 + Math.random() * 0.24);
      const rate = (1 + (Math.random() - 0.5) * 0.14) * this._rateMul;
      if (local) {
        this._resume();
        this._play2D(buf, vol * 0.32, rate, this._sfxIn, 0.03, 0);
        return;
      }
      this._playPos(buf, 'step', +x, +(y ?? this._ly), +(z ?? 0), vol * 0.6, rate);
      return;
    }
    const o = opts || EMPTY;
    const v = volume ?? 1;
    const crouch = o.crouch ?? v <= 0.3;
    const run = o.run ?? (local ? v >= 0.75 : v >= 0.95);
    const tone = STEP_TONE[key];
    const [off, dur] = this._rec.pick(key, rec);
    const rate = (o.heavy ? 0.8 : 1) * (run ? 1.04 : crouch ? 0.96 : 1) * (0.94 + Math.random() * 0.12) * this._rateMul;
    const g = v * tone[0] * dbJit(2);
    const lp = crouch ? tone[1] * 0.7 : run ? 20000 : tone[1];
    if (!local) {
      this._playPos(rec, 'step', +x, +(y ?? this._ly), +(z ?? 0), g * 0.6, rate, off, dur, 0, lp);
      return;
    }
    this._resume();
    const now = this._ctx.currentTime;
    this._foot = -this._foot;
    // x1.41: a mono source through a StereoPanner loses 3 dB per ear at centre
    this._play2D(rec, g * 0.45, rate, this._sfxIn, run ? 0.05 : 0.03, now, off, dur, lp, this._foot * (0.04 + Math.random() * 0.06));
    // clothing / gear rustle every few steps (more often when running)
    if (--this._gearT <= 0 && this._rec.has('cloth')) {
      this._gearT = run ? 1 + Math.random() * 2 : 3 + Math.random() * 4;
      const cb = this._rec.get('cloth');
      const [co, cd] = this._rec.pick('cloth', cb);
      const cv = v * 0.32 * (run ? 0.3 : 0.22) * (crouch ? 0.6 : 1);
      this._play2D(cb, cv * dbJit(2), 0.95 + Math.random() * 0.15, this._sfxIn, 0.02, now + 0.05, co, Math.min(cd, 0.4), 12000, 0, 0.1);
    }
  }

  // one-shot through its own short-lived nodes. Optional: [off, dur] slice, lowpass, stereo pan, fade-out (s).
  _play2D(buf, vol, rate, dest, send, when, off = 0, dur = 0, lp = 0, pan = 0, fade = 0) {
    const c = this._ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let head = src;
    let f = null;
    if (lp && lp < 18000) {
      f = biquad(c, 'lowpass', lp, 0.5);
      src.connect(f);
      head = f;
    }
    const g = gainNode(c, vol);
    head.connect(g);
    let p = null;
    if (pan && c.createStereoPanner) {
      p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(dest);
    } else g.connect(dest);
    let sg = null;
    if (send > 0 && dest !== this._uiIn) {
      sg = gainNode(c, send);
      g.connect(sg);
      sg.connect(dest === this._ambIn ? this._ambSend : this._sfxSend);
    }
    src.onended = () => {
      src.disconnect();
      if (f) f.disconnect();
      g.disconnect();
      if (p) p.disconnect();
      if (sg) sg.disconnect();
    };
    if (dur > 0) {
      const t = Math.max(when || 0, c.currentTime);
      if (fade > 0) {
        const end = t + dur / rate;
        g.gain.setValueAtTime(vol, Math.max(t, end - fade));
        g.gain.linearRampToValueAtTime(0, end);
      }
      src.start(t, off, dur);
    } else src.start(when || 0);
    return src;
  }

  // positional one-shot on a pooled voice. Optional: [off, dur] slice, extra start delay (s), lowpass.
  _playPos(buf, catName, x, y, z, vol, rate, off = 0, dur = 0, when = 0, lp = 0) {
    const cat = CATS[catName];
    const dx = x - this._lx;
    const dy = y - this._ly;
    const dz = z - this._lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(d <= cat.max)) return; // also rejects NaN
    const att = cat.ref / (cat.ref + cat.roll * (Math.max(d, cat.ref) - cat.ref));
    const now = this._ctx.currentTime;
    if (cat.crowd) vol /= Math.sqrt(1 + cat.crowd * this._pool.count(catName, now));
    const prio = vol * att;
    if (prio < 0.002) return;
    const ch = this._pool.acquire(prio, catName, cat.cap, now);
    if (!ch) return;
    const p = ch.panner;
    const wantHrtf = d < cat.hrtf && this._hrtfCount < MAX_HRTF;
    const model = wantHrtf ? 'HRTF' : 'equalpower';
    if (ch.model !== model) {
      p.panningModel = model;
      ch.model = model;
    }
    if (wantHrtf) this._hrtfCount++;
    ch.hrtf = wantHrtf;
    p.refDistance = cat.ref;
    p.rolloffFactor = cat.roll;
    setPannerPos(p, x, y, z);
    let fc = 350 + 19650 * Math.exp(-d / cat.air);
    if (lp && lp < fc) fc = lp;
    ch.filter.frequency.value = fc > 18000 ? 20000 : fc;
    ch.gain.gain.value = vol;
    ch.send.gain.value = cat.wet * Math.pow(cat.ref / Math.max(d, cat.ref), cat.sendExp);
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(ch.filter);
    src.onended = ch.onEnded;
    const delay = cat.delay && d > 20 ? d / 343 : 0;
    const t = now + delay + when;
    if (dur > 0) src.start(t, off, dur);
    else src.start(t);
    ch.src = src;
    ch.start = t;
    ch.end = t + (dur > 0 ? dur : buf.duration) / rate;
    ch.prio = prio;
    ch.cat = catName;
  }

  // ---------------------------------------------------------------- loops
  createLoop(name, x, y, z) {
    if (!LOOPS[name]) return NULL_LOOP;
    const l = new LoopEmitter(this, name, x, y, z);
    this._loops.add(l); // activated (by distance / caps) on the next engine tick
    return l;
  }

  _updateLoops(now) {
    const list = this._loopScratch;
    list.length = 0;
    for (const l of this._loops) {
      const dx = l.x - this._lx;
      const dy = l.y - this._ly;
      const dz = l.z - this._lz;
      l.d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      l._want = l.d < l.def.max * (l.active ? 1.05 : 0.97) && l.vol > 0;
      list.push(l);
    }
    list.sort((a, b) => a.d - b.d);
    const counts = {};
    let total = 0;
    const rec = this._rec;
    for (const l of list) {
      if (l.active && l.def.rec) {
        // a procedural loop hands over to its recording once decoded; a recorded one keeps its buffers in use
        if (l.proc) {
          if (l._recReady()) l._deactivate();
        } else for (const L of l.def.rec) rec.get(L.key);
      }
      if (l._want) {
        const cap = l.def.cap ?? 99;
        const n = counts[l.name] || 0;
        if (!l.def.always && (n >= cap || total >= LOOP_CAP_TOTAL)) l._want = false;
        else {
          counts[l.name] = n + 1;
          total++;
        }
      }
      if (l._want && !l.active) {
        if (!l._activate(now)) this._need(l.def.bank);
      } else if (!l._want && l.active) l._deactivate();
      if (l.active) l._updateFade(now);
    }
  }

  // ---------------------------------------------------------------- ambience / state
  // state: { night 0..1, horde, boss, danger 0..1, lowHealth 0..1, nearFire 0..1, underCover, dead, menu } plus
  // optional extras: cycle (the renderer's day cycle 0..1: day 0.055-0.485, night 0.5-0.99; gives real dawn / dusk
  // windows), wind (the weather's: 0.3 breeze .. ~1.2 gale) and gust 0..1 (to match visible wind; otherwise the engine wanders its own, readable via
  // `audio.wind`), open 0..1 (clearing / road: open-field reverb), indoor 0..1 (inside a building: room reverb and
  // muffled outdoor beds, like underCover), nightPhase (the game's night, nightfall to dawn: the night's theme plays),
  // home (inside the walls the team has built: home.js; at night a warm room tone over the ducked outside beds) and
  // homeless (tonight's theme leaves the home bed out).
  setAmbience(state) {
    if (!state) return;
    const s = this._state;
    const dead = !!state.dead;
    const menu = !!state.menu;
    const changed = dead !== s.dead || menu !== s.menu;
    s.night = clamp01(+state.night || 0);
    s.horde = !!state.horde;
    s.boss = !!state.boss;
    s.danger = clamp01(+state.danger || 0);
    s.lowHealth = clamp01(+state.lowHealth || 0);
    s.nearFire = clamp01(+state.nearFire || 0);
    s.underCover = !!state.underCover;
    s.rain = clamp01(+state.rain || 0);
    s.dead = dead;
    s.menu = menu;
    // optional extras (see the setAmbience doc comment)
    s.nightPhase = !!state.nightPhase;
    const cy = state.cycle == null ? NaN : +state.cycle;
    s.cycle = cy === cy && Number.isFinite(cy) ? cy - Math.floor(cy) : NaN;
    const wv = state.wind == null ? NaN : +state.wind;
    s.wind = wv === wv ? Math.max(0, Math.min(1.3, wv)) : NaN;
    const gv = state.gust == null ? NaN : +state.gust;
    s.gust = gv === gv ? clamp01(gv) : NaN;
    s.open = clamp01(+state.open || 0);
    s.indoor = clamp01(+state.indoor || 0);
    s.home = !!state.home;
    s.homeless = !!state.homeless;
    if (changed && this._ready) this._applyStateNow();
  }

  // thunder for a lightning strike at world (x, z), `dist` m away: it rolls in `delay` s after the flash
  thunder(x, z, dist, delay) {
    if (!this._ready) return;
    this._ambience?.thunder(x, z, dist, delay);
  }

  _applyStateNow() {
    const s = this._state;
    const now = this._ctx.currentTime;
    this._rateMul = s.dead ? 0.92 : 1;
    const wf = s.dead ? 600 : 20000;
    if (wf !== this._mix.world) {
      this._mix.world = wf;
      this._worldLP.frequency.setTargetAtTime(wf, now, s.dead ? 0.25 : 0.7);
    }
    this._music?.stateChanged(now, s);
    this._ambience?.stateChanged(now, s);
  }

  _tick() {
    if (!this._ready) return;
    const c = this._ctx;
    this._resume();
    const now = c.currentTime;
    const s = this._state;
    // low health: sfx muffle + heartbeat
    const lh = s.dead || s.menu ? 0 : s.lowHealth;
    let lpf = lh > 0.02 ? Math.round(20000 * Math.pow(2600 / 20000, lh)) : 20000;
    // ringing ears (ring): the world comes through dull, and clears as the ringing fades
    const rk = this._ringing(now);
    if (s.menu) this.stopRing();
    if (rk > 0) lpf = Math.min(lpf, Math.round(RING_LP * Math.pow(20000 / RING_LP, 1 - rk)));
    // and everything else fades under it, coming back as it fades
    if (Math.abs(rk - this._mix.ring) > 0.01 || (rk === 0) !== (this._mix.ring === 0)) {
      this._mix.ring = rk;
      this._ringDuck.gain.setTargetAtTime(1 - (1 - RING_WORLD) * rk, now, rk > 0.99 ? 0.12 : 0.3);
      this._voiceRing.gain.setTargetAtTime(1 - (1 - RING_VOICE) * rk, now, rk > 0.99 ? 0.12 : 0.3);
    }
    if (Math.abs(lpf - this._mix.sfxLP) > 50) {
      this._mix.sfxLP = lpf;
      this._sfxLP.frequency.setTargetAtTime(lpf, now, 0.4);
    }
    // fear: a faint, slightly quick pulse when zombies are close in the dark (low health overrides it)
    const fear = s.dead || s.menu || !this._ambience ? 0 : this._ambience.fear * (0.3 + 0.7 * s.night);
    if (lh > 0.12 || fear > 0.06) {
      const hurt = lh > 0.12;
      const period = hurt ? 60 / (60 + 70 * lh) : 60 / (74 + 24 * fear);
      if (this._hbNext < now) this._hbNext = now + 0.05;
      const hb = this._pick('heartbeat');
      while (hb && this._hbNext < now + 0.45) {
        this._play2D(hb, hurt ? 0.2 + 0.65 * lh : 0.02 + 0.07 * fear, 1, this._uiIn, 0, this._hbNext);
        this._hbNext += period;
      }
    } else this._hbNext = 0;
    try {
      this._ambience.tick(now, s);
      this._music.tick(now, s);
    } catch (err) {
      console.warn('[audio] tick', err);
    }
    this._updateLoops(now);
    if (this._staticLvl > 0 && s.menu) this.radioStatic(0); // (back to the menu: the radio goes quiet)
    for (const v of this._voices) v.updateFade(now);
    this._updateReverb(now);
    if (now - this._evictAt > 10) {
      this._evictAt = now;
      this._rec.evict(now);
    }
  }

  // reverb environment weights (equal power): room when under cover / indoors, open field when `open`, else forest
  _updateReverb(now) {
    const s = this._state;
    const E = this._envs;
    const room = E.room.conv.buffer ? Math.max(s.underCover ? 1 : 0, s.indoor) : 0;
    const open = E.open.conv.buffer ? s.open * (1 - room) : 0;
    const forest = 1 - room - open;
    for (const name in E) {
      const e = E[name];
      let w = Math.sqrt(Math.max(0, name === 'room' ? room : name === 'open' ? open : forest));
      if (w < 0.03) w = 0;
      if (w > 0 && !e.on) {
        e.gain.gain.cancelScheduledValues(now);
        e.gain.gain.setValueAtTime(0, now);
        this._revIn.connect(e.gain);
        e.on = true;
      }
      if (w === 0) {
        if (!e.zeroAt) e.zeroAt = now;
        if (e.on && now - e.zeroAt > 4) {
          this._revIn.disconnect(e.gain);
          e.on = false;
        }
      } else e.zeroAt = 0;
      if (Math.abs(w - e.w) < 0.01) continue;
      e.w = w;
      e.gain.gain.setTargetAtTime(w, now, 0.4);
    }
  }

  // ---------------------------------------------------------------- stingers / mix
  stinger(name) {
    if (!this._ready) return;
    const d = STINGERS[name];
    if (!d) return;
    this._resume();
    const requested = this._ctx.currentTime;
    const rec = this._rec;
    const go = (recorded) => {
      // skip if it arrives too late to still make sense
      if (this._ctx.currentTime - requested > 2.5) return;
      const buf = recorded || this._pick(d.bank);
      if (!buf) return;
      const dest = d.bus === 'music' ? this._musicIn : d.bus === 'ui' ? this._uiIn : d.bus === 'amb' ? this._ambIn : this._sfxIn;
      this._play2D(buf, recorded ? d.recVol ?? d.vol : d.vol, 1, dest, d.bus === 'amb' ? 0.2 : 0, 0);
      if (d.duck) this._music?.duck(this._ctx.currentTime, d.duck);
      if (d.birds) this._ambience?.burst('amb_bird', 5);
    };
    // the recorded cue when it is there; one still being decoded is worth a short wait, else the procedural one
    if (d.rec && rec && rec.covers(d.rec)) {
      const wait = () => {
        const buf = rec.get(d.rec);
        if (buf) go(buf);
        else if (rec.pending(d.rec) && this._ctx.currentTime - requested < 1) setTimeout(wait, 60);
        else this._need(d.bank, () => go(null));
      };
      wait();
      return;
    }
    this._need(d.bank, () => go(null));
  }

  // a special's approach motif (music.js motif, motifs.js): near on the piano, far on strings; pan -1..1 toward it
  motif(ztype, near, pan = 0) {
    if (!this._ready || !this._music || this._state.menu) return;
    this._resume();
    this._music.motif(ztype, near, pan);
  }

  setVolumes(v = EMPTY) {
    for (const k of ['master', 'music', 'sfx', 'ambience', 'voice']) {
      // (voice runs to 2: the slider can push a quiet friend past the level the mix was balanced at)
      if (v[k] !== undefined && v[k] !== null && Number.isFinite(+v[k])) this._vol[k] = k === 'voice' ? Math.min(2, Math.max(0, +v[k])) : clamp01(+v[k]);
    }
    if (this._ctx) this._applyVolumes(0.04);
  }

  _applyVolumes(tc) {
    const now = this._ctx.currentTime;
    const set = (node, v) => {
      if (tc) node.gain.setTargetAtTime(v, now, tc);
      else node.gain.value = v;
    };
    const v = this._vol;
    set(this._master, v.master);
    set(this._musicIn, v.music * 0.9);
    set(this._sfxIn, v.sfx);
    set(this._sfxSend, v.sfx);
    set(this._uiIn, v.sfx);
    set(this._ambIn, v.ambience);
    set(this._ambSend, v.ambience);
    set(this._voiceIn, v.voice * VOICE_BUS);
  }

  // debug: every bank referenced by the public API that is not (yet) loaded, plus unmapped SOUND ids
  _selfCheck() {
    const missing = [];
    const need = new Set();
    for (const [k, id] of Object.entries(SOUND)) {
      if (id && !SOUND_MAP[id]) missing.push('SOUND.' + k);
    }
    for (const d of SOUND_MAP) if (d) need.add(d.bank);
    for (const t of [LOCAL, STINGERS, LOOPS]) for (const k in t) need.add(t[k].bank);
    for (const k in STEP_BANKS) need.add(STEP_BANKS[k]);
    for (const b of DEF_BY_BANK.keys()) need.add(b);
    for (const b of need) if (!this._pools.get(b)?.length) missing.push(b);
    for (const k in this._envs) if (!this._envs[k].conv.buffer) missing.push('ir_' + k);
    if (!this._hallIR) missing.push('ir_hall');
    return missing;
  }

  // ---------------------------------------------------------------- voice chat
  createVoiceSource(mediaStream) {
    if (!this._ctx || !mediaStream) return NULL_VOICE;
    try {
      const v = new VoiceSource(this, mediaStream);
      this._voices.add(v);
      if (!this._duck.timer) this._duck.timer = setInterval(() => this._duckTick(), DUCK_MS);
      return v.handle;
    } catch (err) {
      console.warn('[audio] voice source failed', err);
      return NULL_VOICE;
    }
  }

  // false: the game's sound stays where it is while people talk
  setVoiceDucking(on) {
    this._duck.on = !!on;
  }

  // Runs while there are voice sources. The level on the voice bus is read after distance, the panner and the "Voice
  // chat" slider, so the mix moves by how well you can actually hear the speaker: down at once, back up slowly.
  _duckTick() {
    const d = this._duck;
    const now = this._ctx.currentTime;
    let k = 0;
    if (d.on && this._voices.size) {
      this._voiceAn.getFloatTimeDomainData(d.buf);
      let sum = 0;
      for (let i = 0; i < d.buf.length; i++) sum += d.buf[i] * d.buf[i];
      const db = 10 * Math.log10(sum / d.buf.length + 1e-12);
      k = clamp01((db - DUCK_FLOOR) / (DUCK_FULL - DUCK_FLOOR));
    }
    if (k >= d.k) {
      d.k = k;
      d.at = now;
    } else if (now - d.at > DUCK_HOLD || !d.on) d.k = Math.max(k, d.k - 0.06);
    if (Math.abs(d.k - d.set) > 0.02 || (d.k === 0) !== (d.set === 0)) {
      const tc = d.k > d.set ? 0.04 : 0.18;
      d.set = d.k;
      this._musicDuck.gain.setTargetAtTime(Math.pow(DUCK_MUSIC, d.k), now, tc);
      this._worldDuck.gain.setTargetAtTime(Math.pow(DUCK_WORLD, d.k), now, tc);
    }
    if (!this._voices.size && d.k === 0) {
      clearInterval(d.timer);
      d.timer = null;
    }
  }
}

export default AudioEngine;

// the bank rendering and store (banks.js), defined on the prototype exactly as class methods are
for (const [name, fn] of Object.entries(bankMethods)) {
  if (name in AudioEngine.prototype) throw new Error(`AudioEngine.${name} is defined twice`);
  Object.defineProperty(AudioEngine.prototype, name, { value: fn, writable: true, configurable: true });
}
