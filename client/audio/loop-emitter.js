// A looping positional sound (AudioEngine.createLoop): a fire, a generator, a zombie's breathing, a vehicle. The engine
// activates the nearest few each tick (by distance and the caps in LOOPS) and lets the rest go silent.
import { LOOPS } from './sound-defs.js';
import { clamp01 } from './curves.js';
import { setPannerPos, gainNode, biquad } from './nodes.js';

// ------------------------------------------------------------------ looping positional emitter
export class LoopEmitter {
  constructor(e, name, x, y, z) {
    this.e = e;
    this.name = name;
    this.def = LOOPS[name] || null;
    this.x = +x || 0;
    this.y = +y || 0;
    this.z = +z || 0;
    this.vol = 1;
    this.d = Infinity;
    this.active = false;
    this.stopped = false;
    this.rate = 1 + (Math.random() - 0.5) * 2 * (this.def?.jit ?? 0.04);
    this.pitch = 1; // setRate (doppler)
    this.variant = Math.floor(Math.random() * 8);
    this.srcs = [];
    this.extra = []; // per-layer gain / filter nodes of a recorded loop
    this.proc = false; // playing the procedural bank (upgraded to the recording once it loads)
    this.gain = null;
    this.fade = null;
    this.panner = null;
    this.sendG = null;
    this.air = null;
  }
  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    if (this.active) setPannerPos(this.panner, x, y, z);
  }
  setVolume(v) {
    this.vol = v < 0 ? 0 : v;
    if (this.active) this.gain.gain.setTargetAtTime(this.vol * this.def.vol, this.e._ctx.currentTime, 0.05);
  }
  // playback-rate multiplier (doppler shift of a moving source)
  setRate(r) {
    this.pitch = r;
    if (!this.active) return;
    const now = this.e._ctx.currentTime;
    const recs = this.proc ? null : this.def.rec;
    for (let i = 0; i < this.srcs.length; i++) this.srcs[i].playbackRate.setTargetAtTime(this.rate * (recs?.[i]?.rate || 1) * r, now, 0.08);
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this._deactivate();
    this.e._loops.delete(this);
  }
  // recorded layers all decoded -> true; still decoding -> null (worth waiting for); unavailable -> false
  _recReady() {
    const r = this.def.rec;
    const rec = this.e._rec;
    if (!r || !rec) return false;
    let wait = false;
    for (const L of r) {
      if (rec.has(L.key)) continue;
      if (!rec.pending(L.key)) return false;
      rec.want(L.key);
      wait = true;
    }
    return wait ? null : true;
  }
  _activate(now) {
    const e = this.e;
    const c = e._ctx;
    const recReady = this._recReady();
    if (recReady === null) return true; // recording is decoding: stay silent a moment instead of flipping sources
    const pool = recReady ? null : e._pools.get(this.def.bank);
    if (!recReady && (!pool || !pool.length)) return false;
    this.gain = gainNode(c, this.vol * this.def.vol);
    if (recReady) {
      for (const L of this.def.rec) {
        const buf = e._rec.get(L.key);
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = this.rate * (L.rate || 1) * this.pitch;
        const lg = gainNode(c, L.vol);
        let head = lg;
        if (L.lp) {
          const f = biquad(c, 'lowpass', L.lp, 0.5);
          lg.connect(f);
          head = f;
          this.extra.push(f);
        }
        src.connect(lg);
        head.connect(this.gain);
        this.extra.push(lg);
        src.start(now, Math.random() * buf.duration);
        this.srcs.push(src);
      }
      this.proc = false;
    } else {
      const buf = pool[this.variant % pool.length];
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = this.rate * this.pitch;
      src.connect(this.gain);
      src.start(now, Math.random() * buf.duration);
      this.srcs.push(src);
      this.proc = true;
    }
    this.fade = gainNode(c, 0);
    this.panner = c.createPanner();
    this.panner.panningModel = this.name === 'boss_breath' ? 'HRTF' : 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = this.def.ref;
    this.panner.rolloffFactor = this.def.roll;
    this.panner.maxDistance = 10000;
    setPannerPos(this.panner, this.x, this.y, this.z);
    this.sendG = gainNode(c, this.def.wet);
    if (this.def.air) {
      this.air = biquad(c, 'lowpass', this._airHz(), 0.5);
      this.gain.connect(this.air);
      this.air.connect(this.fade);
    } else this.gain.connect(this.fade);
    this.fade.connect(this.panner);
    this.panner.connect(e._sfxIn);
    this.fade.connect(this.sendG);
    this.sendG.connect(e._sfxSend);
    this.active = true;
    this._fadeTarget = -1;
    return true;
  }
  _deactivate() {
    if (!this.active) return;
    this.active = false;
    const now = this.e._ctx.currentTime;
    const nodes = [...this.srcs, ...this.extra, this.gain, this.fade, this.panner, this.sendG];
    if (this.air) nodes.push(this.air);
    this.fade.gain.setTargetAtTime(0, now, 0.06);
    for (const s of this.srcs) {
      try {
        s.stop(now + 0.35);
      } catch {}
    }
    this.srcs[0].onended = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {}
      }
    };
    this.srcs = [];
    this.extra = [];
    this.gain = this.fade = this.panner = this.sendG = this.air = null;
  }
  // air absorption: distant sources lose their highs
  _airHz() {
    return Math.max(450, 16000 / (1 + this.d / 55));
  }
  _updateFade(now) {
    const m = this.def.max;
    const f = clamp01((m - this.d) / (m * 0.25));
    if (Math.abs(f - this._fadeTarget) > 0.02) {
      this._fadeTarget = f;
      this.fade.gain.setTargetAtTime(f, now, 0.15);
    }
    if (this.air) this.air.frequency.setTargetAtTime(this._airHz(), now, 0.2);
  }
}
