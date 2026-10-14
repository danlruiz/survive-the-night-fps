// What every looping layer of the mix shares (the ambience's procedural and recorded beds, the score's recorded
// stems): a gain it plays into, the source while it plays, and when to stop it. A layer that is no longer wanted
// keeps playing while its fade-out (time constant tc) dies away - six time constants and a second - and is then
// stopped, so a layer that comes straight back in carries on where it was.
import { gainNode } from './nodes.js';

export class LoopLayer {
  constructor(c, dest) {
    this.ctx = c;
    this.gain = gainNode(c, 0);
    if (dest) this.gain.connect(dest);
    this.head = this.gain; // what the source plays into
    this.src = null;
    this.target = 0;
    this.offAt = 0;
    this.rate = 1;
  }

  // called on every update with whether the layer is wanted; true: it is wanted and nothing plays yet (start it)
  _wanted(want, now, tc) {
    if (want) {
      this.offAt = 0;
      return !this.src;
    }
    if (this.src) {
      if (!this.offAt) this.offAt = now + tc * 6 + 1;
      else if (now > this.offAt) this._stop();
    }
    return false;
  }

  // loop buf into the head from `offset` s at the layer's rate, its gain rising from silence to the target
  _startFadingIn(buf, now, tc, offset) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = this.rate;
    s.connect(this.head);
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.setTargetAtTime(this.target, now, tc);
    s.start(now, offset);
    this.src = s;
  }

  _stop() {
    const s = this.src;
    this.src = null;
    this.offAt = 0;
    try {
      s.stop();
    } catch {}
    s.disconnect();
  }
}
