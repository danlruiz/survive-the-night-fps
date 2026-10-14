// The pool of positional one-shot voices (filter -> gain -> panner, with a reverb send) that AudioEngine._playPos
// plays every placed sound on: a fixed set of channels, each category capped, the weakest voice stolen when full.

// ------------------------------------------------------------------ pooled positional voice
class Chan {
  constructor(e, dest, send) {
    const c = e._ctx;
    this.e = e;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.5;
    this.gain = c.createGain();
    this.panner = c.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.maxDistance = 10000;
    this.send = c.createGain();
    this.send.gain.value = 0;
    this.filter.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(dest);
    this.gain.connect(this.send);
    this.send.connect(send);
    this.src = null;
    this.start = 0;
    this.end = 0;
    this.prio = 0;
    this.cat = '';
    this.hrtf = false; // counted against MAX_HRTF while playing
    this.model = 'equalpower'; // actual panner model
    this.onEnded = () => this.release();
  }
  effPrio(now) {
    const len = this.end - this.start;
    return this.prio * Math.max(0.1, (this.end - now) / (len > 0 ? len : 1));
  }
  release() {
    const s = this.src;
    if (!s) return;
    s.onended = null;
    try {
      s.disconnect();
    } catch {}
    this.src = null;
    if (this.hrtf) this.e._hrtfCount--;
    this.hrtf = false;
  }
  kill() {
    const s = this.src;
    if (!s) return;
    try {
      s.stop();
    } catch {}
    this.release();
  }
}

export class VoicePool {
  constructor(e, size, dest, send) {
    this.chans = [];
    for (let i = 0; i < size; i++) this.chans.push(new Chan(e, dest, send));
  }
  // voices of a category sounding right now
  count(cat, now) {
    let n = 0;
    const ch = this.chans;
    for (let i = 0; i < ch.length; i++) if (ch[i].src && ch[i].cat === cat && ch[i].end > now && ch[i].start <= now + 0.05) n++;
    return n;
  }
  acquire(prio, cat, cap, now) {
    let free = null;
    let weakest = null;
    let wp = Infinity;
    let catN = 0;
    let catWeak = null;
    let cwp = Infinity;
    const ch = this.chans;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (!c.src || c.end + 0.5 < now) {
        if (c.src) c.kill();
        if (!free) free = c;
        continue;
      }
      const p = c.effPrio(now);
      if (c.cat === cat) {
        catN++;
        if (p < cwp) {
          cwp = p;
          catWeak = c;
        }
      }
      if (p < wp) {
        wp = p;
        weakest = c;
      }
    }
    if (catN >= cap) {
      if (catWeak && cwp < prio) {
        catWeak.kill();
        return catWeak;
      }
      return null;
    }
    if (free) return free;
    if (weakest && wp < prio) {
      weakest.kill();
      return weakest;
    }
    return null;
  }
}
