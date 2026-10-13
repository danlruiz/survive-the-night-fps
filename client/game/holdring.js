// The ring every hold-to-act input shows (issue #278): [E] on a container, a downed teammate, the car, the bell or
// the radio, the mounted gun, the fair's generator, a vehicle's work and a wreck's tank, a base generator's switch,
// and the drop key. A hold whose first frames show nothing reads as "the key didn't work", and most of these are the
// server's to run: it hears of the press a trip later and says how far the hold is a trip after that. So the ring is
// up and filling on the frame the key goes down, by our own clock, and goes over to the server's word once it comes
// (pushed on by the time that word took to get here, half a round trip, so the two run together). A hold that ends
// short of done - let go too soon, walked or looked away, broken off by the server, never taken up by it - says so:
// the ring turns red with what happened under it for a moment (CANCEL_SHOWN), and Game plays the cancel sound.
//
// Two kinds of hold:
// - the server's (start with server: true): Game feeds `update` the server's hold kind and progress every frame.
// - our own (the drop key, a base generator's switch): Game feeds `local` the hold's own clock, and ends it.
// lead: seconds of the hold before anything is asked of the server, on a key that does something else when tapped
// (a vehicle: a tap gets in; the mounted gun: a tap mans it). Let go inside it, the hold just goes, as the tap does
// its own thing. The ring's fill counts it in, so it fills from the press without a jump.
import { SERVER_DT, SEARCH_TIME, REVIVE_TIME, ENGINE_START_TIME, ESCAPE_DRIVE_TIME } from '../../shared/constants.js';
import { HOLD } from '../../shared/protocol.js';
import { BELL_HOLD_TIME, RADIO_HOLD_TIME } from '../../shared/fixtures.js';
import { GUN } from '../../shared/mountedgun.js';
import { GEN } from '../../shared/fair.js';
import { FIX_TIME, FUEL_TIME, REPAIR_TIME, SIPHON_TIME } from '../../shared/vehicles.js';

export const CANCEL_SHOWN = 0.7; // s a broken-off hold's red ring stays up
export const REFUSED_AFTER = 0.25; // s past a round trip with no word of the hold from the server: it was turned down
const PENDING_MAX = 0.92; // our own clock fills this far at most before the server has said a word
const AHEAD = 3 * SERVER_DT; // the server's progress is pushed on by its age, by this much at most (it may have stalled)

// How long a server hold of `kind` takes, as the server will set it (its `need`), for the ring to fill by until the
// server's own word comes. search / revive: those two holds' own times (a perk, the difficulty, a lever on a boot),
// worked out by Game. A guess is no harm: the server's progress takes over a round trip in.
export function holdNeed(kind, { search = SEARCH_TIME, revive = REVIVE_TIME } = {}) {
  switch (kind) {
    case HOLD.SEARCH:
      return search;
    case HOLD.REVIVE:
      return revive;
    case HOLD.ENGINE:
      return ENGINE_START_TIME;
    case HOLD.DRIVE:
      return ESCAPE_DRIVE_TIME;
    case HOLD.BELL:
      return BELL_HOLD_TIME;
    case HOLD.RADIO:
      return RADIO_HOLD_TIME;
    case HOLD.GUN_LIFT:
      return GUN.lift;
    case HOLD.FAIR_START:
    case HOLD.FAIR_STOP:
      return GEN.hold;
    case HOLD.VEH_FIX:
      return FIX_TIME;
    case HOLD.VEH_FUEL:
      return FUEL_TIME;
    case HOLD.VEH_REPAIR:
      return REPAIR_TIME;
    case HOLD.SIPHON:
      return SIPHON_TIME;
  }
  return 1;
}

export class HoldRing {
  // describe(kind): { need, label } of a server hold kind (protocol HOLD), for a hold the server turns out to run
  // differently from what was guessed at the press, or the next one it goes on to with the key still held
  constructor(describe = () => null) {
    this.describe = describe;
    this.key = null; // what the hold is of (a target id, 'drop', 'gen'...): null, no hold
    this.cancelT = 0; // s the red ring is still up for
    this.cancelText = '';
    this.cancelP = 0;
    this.cancelFor = 0;
  }

  get active() {
    return this.key !== null;
  }

  // A hold starts. -> true (Game plays the press sound)
  start(key, label, { need = 1, lead = 0, server = false, kind = 0 } = {}) {
    this.key = key;
    this.label = label;
    this.need = Math.max(0.05, need);
    this.lead = lead;
    this.server = server;
    this.kind = kind; // the server hold kind expected (0: not known)
    this.t = 0; // s since the press
    this.shown = 0; // the ring's fill, 0..1: it only ever goes up
    this.seen = false; // the server has said it is running
    this.srvP = 0; // ...how far, as it last said
    this.srvAt = 0; // ...and when that came (this.t)
    this.srvStep = 0; // ...and the most it went on by from one word to the next
    this.cancelT = 0;
    return true;
  }

  // Our own hold's progress, 0..1 of the whole of it (lead included)
  local(p) {
    if (this.key !== null && !this.server) this.shown = Math.max(this.shown, Math.min(1, p));
  }

  // Once a frame. srvKind, srvP: the server's word on our hold (0: none), rtt: s. -> 'done' when a server hold went
  // through, 'cancel' when it was broken off or never taken up, null otherwise
  update(dt, srvKind = 0, srvP = 0, rtt = 0) {
    if (this.cancelT > 0) this.cancelT = Math.max(0, this.cancelT - dt);
    if (this.key === null) return null;
    this.t += dt;
    if (!this.server) return null;
    const work = this.t - this.lead; // s since the server was asked
    if (srvKind) {
      // the next job on the same thing, the key still held (a vehicle's: holdDone goes on), or another than guessed
      const next = this.seen && (srvKind !== this.kind || srvP + 0.2 < this.srvP);
      if (!this.seen || next || srvP !== this.srvP) this.srvAt = this.t;
      // (the most it has gone on by in one word: a tick's worth, or two when a snapshot was missed)
      if (this.seen && !next && srvP > this.srvP) this.srvStep = Math.max(this.srvStep, srvP - this.srvP);
      if (next) {
        this.srvStep = 0;
        this.shown = 0;
        this.lead = 0;
        this.t = this.srvAt = 0;
      }
      // (the time the press was started with stands for the kind it guessed: it knew the target)
      if (next || srvKind !== this.kind) {
        const d = this.describe(srvKind);
        if (d) {
          this.need = Math.max(0.05, d.need);
          if (d.label) this.label = d.label;
        }
      }
      this.seen = true;
      this.kind = srvKind;
      this.srvP = srvP;
    } else if (this.seen) {
      // the server let it go: done when it was all but there (it says so a tick at a time, and its last word before
      // done is a tick or two short of it), broken off otherwise
      const done = this.srvP >= 1 - Math.max((2 * SERVER_DT) / this.need, 2 * this.srvStep);
      if (done) return this.end(), 'done';
      return this.cancel('Interrupted');
    } else if (work > rtt + REFUSED_AFTER) return this.cancel();
    let did; // s of the hold's own work done
    if (this.seen) did = Math.min(this.need, this.srvP * this.need + Math.min(AHEAD, this.t - this.srvAt + rtt / 2));
    else did = Math.min(this.need * PENDING_MAX, Math.max(0, work));
    this.shown = Math.max(this.shown, Math.min(1, (Math.min(this.t, this.lead) + did) / (this.lead + this.need)));
    return null;
  }

  // The key came up. -> 'cancel' when that broke the hold off, null when it was a tap inside the lead (the key's tap
  // does its own thing) or the hold was as good as done
  release() {
    if (this.key === null) return null;
    if (this.t < this.lead || this.shown >= 1 - SERVER_DT / (this.lead + this.need)) return this.end(), null;
    return this.cancel('Let go too soon');
  }

  // the hold went through or just goes, quietly
  end() {
    this.key = null;
  }

  // the hold was broken off: the ring goes red with `text` for `t` seconds. -> 'cancel'
  cancel(text = 'Cancelled', t = CANCEL_SHOWN) {
    this.cancelP = this.key !== null ? this.shown : 0;
    this.key = null;
    this.cancelText = text;
    this.cancelT = this.cancelFor = t;
    return 'cancel';
  }

  // What the HUD shows: { progress (0..1, -1 none), label, cancelled, cancelFor (s the red ring is up in all) }
  hud(out) {
    if (this.key !== null) {
      out.progress = this.shown;
      out.label = this.label;
      out.cancelled = false;
    } else if (this.cancelT > 0) {
      out.progress = this.cancelP;
      out.label = this.cancelText;
      out.cancelled = true;
      out.cancelFor = this.cancelFor;
    } else {
      out.progress = -1;
      out.label = '';
      out.cancelled = false;
    }
    return out;
  }
}
