// Voice chat in the mix: each remote microphone as a VoiceSource (AudioEngine.createVoiceSource), and the levels the
// engine's voice bus and ducking work to.
import { TALK_CLEAR, TALK_RANGE } from '../../shared/constants.js';
import { setPannerPos, biquad } from './nodes.js';

// ------------------------------------------------------------------ proximity voice chat source
// Two paths out of one stream: the voice placed in the world (heard out to TALK_RANGE), and the same voice squeezed
// through a walkie-talkie speaker, which takes over as the speaker gets too far away to hear directly.
// A microphone arrives some 9 dB under the game's own sound, and still 8 dB apart from one player to the next after
// the browser's own gain control, so each voice is levelled first (VOICE_LEVEL) and the bus then lifts all of them to where speech sits over the
// music and the forest (VOICE_BUS). While somebody audible is talking, the rest of the mix steps back as well (DUCK_*).
const VOICE_REF = 4; // the placed voice is at full level this close (m)...
const VOICE_ROLLOFF = 0.5; // ...and thins out gently past it: -3.5 dB at 8 m, -7.5 dB at 15 m, -11 dB at TALK_CLEAR
const voiceDistance = (d) => VOICE_REF / (VOICE_REF + VOICE_ROLLOFF * Math.max(0, d - VOICE_REF)); // (what the panner applies)
const VOICE_LEVEL = Object.freeze({ threshold: -30, knee: 10, ratio: 4, attack: 0.004, release: 0.2 });
export const VOICE_BUS = 1.6; // voice bus gain at "Voice chat" 100%: a voice beside you lands near -12 LUFS, level with a pistol shot
export const DUCK_MUSIC = 0.4; // score while somebody talks (-8 dB)...
export const DUCK_WORLD = 0.56; // ...and effects + ambience (-5 dB)
export const DUCK_FLOOR = -38; // voice bus level (dBFS) where the ducking starts...
export const DUCK_FULL = -16; // ...and where it is all the way down: a faint voice at the edge of earshot moves the mix less
export const DUCK_HOLD = 0.7; // s the mix stays down after the last word (the gaps inside a sentence)
export const DUCK_MS = 50;
let radioCurve = null; // handset overdrive
function radioShape() {
  if (!radioCurve) {
    radioCurve = new Float32Array(257);
    for (let i = 0; i < 257; i++) radioCurve[i] = Math.tanh(((i - 128) / 128) * 2.6) * 0.62;
  }
  return radioCurve;
}

export class VoiceSource {
  constructor(e, stream) {
    const c = e._ctx;
    this.e = e;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vol = 1;
    this.dead = false;
    this.present = false; // we know where the speaker is (out of sight = out of earshot)
    this.radio = false; // a walkie-talkie link to the speaker
    // Chrome quirk: a remote WebRTC stream only flows into WebAudio if it is also attached to a media element.
    try {
      this.el = new Audio();
      this.el.muted = true;
      this.el.srcObject = stream;
      const p = this.el.play();
      if (p && p.catch) p.catch(() => {});
    } catch {
      this.el = null;
    }
    this.src = c.createMediaStreamSource(stream);
    this.hp = biquad(c, 'highpass', 110);
    this.lp = biquad(c, 'lowpass', 16000);
    // a little presence: consonants are what gunfire and the score bury first
    this.pres = biquad(c, 'peaking', 2800, 0.9);
    this.pres.gain.value = 3;
    this.gain = c.createGain();
    // leveller: a quiet microphone and a loud one come out within a few dB of each other
    this.level = c.createDynamicsCompressor();
    for (const k in VOICE_LEVEL) this.level[k].value = VOICE_LEVEL[k];
    this.fade = c.createGain();
    this.panner = c.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = VOICE_REF;
    this.panner.rolloffFactor = VOICE_ROLLOFF;
    this.panner.maxDistance = TALK_RANGE;
    this.rhp = biquad(c, 'highpass', 480, 1.1);
    this.rlp = biquad(c, 'lowpass', 2700, 1.4);
    this.rdrive = c.createWaveShaper();
    this.rdrive.curve = radioShape();
    this.rfade = c.createGain();
    this.fade.gain.value = 0;
    this.rfade.gain.value = 0;
    this.src.connect(this.hp);
    this.hp.connect(this.lp);
    this.lp.connect(this.pres);
    this.pres.connect(this.gain);
    this.gain.connect(this.level);
    this.level.connect(this.fade);
    this.fade.connect(this.panner);
    this.panner.connect(e._voiceIn);
    this.level.connect(this.rhp);
    this.rhp.connect(this.rlp);
    this.rlp.connect(this.rdrive);
    this.rdrive.connect(this.rfade);
    this.rfade.connect(e._voiceIn);
    this._fade = 0;
    this._rfade = 0;
    this.handle = {
      setPosition: (x, y, z) => this.setPosition(x, y, z),
      setAbsent: () => this.setAbsent(),
      setRadio: (b) => this.setRadio(b),
      mode: () => this.mode(),
      setVolume: (v) => this.setVolume(v),
      setMuffled: (b) => this.setMuffled(b),
      disconnect: () => this.disconnect(),
    };
  }
  setPosition(x, y, z) {
    if (this.dead) return;
    this.x = x;
    this.y = y;
    this.z = z;
    this.present = true;
    setPannerPos(this.panner, x, y, z);
    this.updateFade(this.e._ctx.currentTime);
  }
  // the speaker is no longer anywhere near (left our area of interest)
  setAbsent() {
    if (this.dead || !this.present) return;
    this.present = false;
    this.updateFade(this.e._ctx.currentTime);
  }
  setRadio(b) {
    if (this.dead || this.radio === !!b) return;
    this.radio = !!b;
    this.updateFade(this.e._ctx.currentTime);
  }
  // how the speaker reaches us right now: 0 not at all, 1 by ear, 2 over the radio
  mode() {
    return this._rfade > 0.5 ? 2 : this._fade > 0 ? 1 : 0;
  }
  updateFade(now) {
    const e = this.e;
    const dx = this.x - e._lx;
    const dy = this.y - e._ly;
    const dz = this.z - e._lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // inaudible beyond TALK_RANGE (the inverse model alone never reaches zero)
    const f = !this.present || d >= TALK_RANGE ? 0 : d <= TALK_CLEAR ? 1 : 1 - (d - TALK_CLEAR) / (TALK_RANGE - TALK_CLEAR);
    if (Math.abs(f - this._fade) > 0.01 || (f === 0) !== (this._fade === 0)) {
      this._fade = f;
      this.fade.gain.setTargetAtTime(f, now, 0.08);
    }
    // the radio makes up whatever distance takes off the voice itself
    const r = this.radio ? 1 - f * voiceDistance(d) : 0;
    if (Math.abs(r - this._rfade) > 0.01 || (r === 0) !== (this._rfade === 0)) {
      this._rfade = r;
      this.rfade.gain.setTargetAtTime(r, now, 0.08);
    }
  }
  setVolume(v) {
    if (this.dead) return;
    this.vol = v;
    this.gain.gain.setTargetAtTime(Math.max(0, v), this.e._ctx.currentTime, 0.05);
  }
  setMuffled(b) {
    if (this.dead) return;
    this.lp.frequency.setTargetAtTime(b ? 700 : 16000, this.e._ctx.currentTime, 0.06);
  }
  disconnect() {
    if (this.dead) return;
    this.dead = true;
    for (const n of [this.src, this.hp, this.lp, this.pres, this.gain, this.level, this.fade, this.panner, this.rhp, this.rlp, this.rdrive, this.rfade]) {
      try {
        n.disconnect();
      } catch {}
    }
    if (this.el) {
      try {
        this.el.pause();
        this.el.srcObject = null;
      } catch {}
      this.el = null;
    }
    this.e._voices.delete(this);
  }
}

// what createVoiceSource hands back when there is no voice to play
export const NULL_VOICE = Object.freeze({ setPosition() {}, setAbsent() {}, setRadio() {}, mode: () => 0, setVolume() {}, setMuffled() {}, disconnect() {} });
