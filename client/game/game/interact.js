// Game: [E] - what it does to what we look at, and the holds it starts (the ring every held key shows: holdring.js).
import { SEARCH_TIME, REVIVE_TIME } from '../../../shared/constants.js';
import { repairCostOf, CONT_DEFS } from '../../../shared/defs.js';
import { ACT, ENT, HOLD, CAR_ID } from '../../../shared/protocol.js';
import { currentWeapon } from '../../../shared/playersim.js';
import { pryWeapon, pryTime } from '../../../shared/trunk.js';
import { perkMods } from '../../../shared/progress.js';
import { difficultyOf } from '../../../shared/difficulty.js';
import { holdNeed } from '../holdring.js';

export const methods = {
  interact() {
    const t = this.lookTarget;
    const g = this.global;
    if (!t) return;
    if (t === 'gun') return this.gun.use();
    if (t === 'cat') return this.cat.put(); // (the cat in our arms)
    if (t.fair) return this.fair.interact(t);
    if (t.handcar) return this.handcar.interact(t);
    if (t.vehicle !== undefined) return this.vehicles.interact(t);
    if (t === 'car') {
      if (g.suppliesDone && (!g.finale || g.escapeReady)) this.beginHold(CAR_ID, g.finale ? HOLD.DRIVE : HOLD.ENGINE); // start the engine; once it is warm, get in and drive
      else this.conn.action(ACT.INTERACT, CAR_ID);
      return;
    }
    if (t === 'bell' || t === 'radio') return this.fixtures.interact(t);
    if (t.kind === ENT.CACHE || (t.kind === ENT.PLAYER && t.downed)) {
      this.beginHold(t.id, t.kind === ENT.CACHE ? HOLD.SEARCH : HOLD.REVIVE);
      return;
    }
    if (t.kind === ENT.PLAYER) return this.cards.chooser(t.id); // a teammate on their feet: a match or a trade (nothing is sent until one is picked)
    if (t.kind === ENT.STRUCTURE && this.power.press(t)) return; // (a generator: a tap pours fuel, held it is the switch)
    if (t.kind === ENT.STRUCTURE) this.askedCost = repairCostOf(t.stype);
    this.conn.action(ACT.INTERACT, t.id);
  },

  // [E] held on `id`, for a hold of `kind`: what the server will most likely make of it, for the ring's label and
  // time until it says (holdring.js). The ring is up from this frame on, unless the press started it already (a key
  // that is a tap first: startHoldRing with a lead). With the hands on an item the server turns a hold down
  // (holdBegin), so it is asked for the moment they are free again, the key still down (holdWait, updateHoldRing).
  beginHold(id, kind = 0, o = {}) {
    if (this.handsBusy()) {
      if (!this.holdWait && this.holdRing.key !== id) this.audio.playLocal('hold_press');
      if (this.holdRing.key === id) this.holdRing.end();
      this.holdWait = { id, kind, o };
      return;
    }
    this.holding = id;
    // (nothing to guess from - work on a vehicle that wants none: the server says why not, and a ring comes up if it
    // does take it up after all)
    if (this.holdRing.key !== id && kind) this.startHoldRing(id, kind, { ...o, server: true });
    this.conn.action(ACT.HOLD_BEGIN, id);
  },

  endHold() {
    this.holdWait = null;
    if (this.holdRing.server && this.holdRing.release() === 'cancel') this.audio.playLocal('hold_cancel');
    if (!this.holding) return;
    this.holding = 0;
    this.conn.action(ACT.HOLD_END);
  },

  // An item is in the hands, as the server has it or as we have just asked (a hold is turned down meanwhile)
  handsBusy() {
    return !!(this.self.useItem || this.prediction.state.using);
  },

  // A held key went down: its ring is up on this frame, with a click. key: what it is of (a target id, 'drop'...),
  // kind: the server hold it is to be (0: one of ours). o: { label, need, lead, server } over what kind says
  startHoldRing(key, kind, o = {}, quiet = false) {
    const d = kind ? this.holdInfo(kind, typeof key === 'number' ? key : 0) : null;
    this.holdRing.start(key, o.label || d?.label || '', { need: o.need ?? d?.need ?? 1, lead: o.lead || 0, server: o.server ?? !!kind, kind });
    if (!quiet) this.audio.playLocal('hold_press');
  },

  // the held key's hold is broken off: the ring goes red with `text`, and the cancel sound plays
  cancelHoldRing(text, t) {
    if (this.holdRing.cancel(text, t)) this.audio.playLocal('hold_cancel');
  },

  // What a server hold of `kind` on `id` takes and is called on the ring
  holdInfo(kind, id = this.holding) {
    const t = this.entities.ents.get(id);
    const s = this.prediction.state;
    const pm = perkMods(s.perks);
    const boot = kind === HOLD.SEARCH && !!t && !!this.bootOf(t)?.shut; // (a car's boot is forced: shared/trunk.js)
    const lever = boot ? pryWeapon(currentWeapon(s)) : 0;
    let label =
      kind === HOLD.SEARCH
        ? `Searching${t ? ' ' + (CONT_DEFS[t.ctype]?.name || '').toLowerCase() : ''}…`
        : kind === HOLD.REVIVE
          ? `Reviving ${t ? this.name(t.id) : ''}…`
          : kind === HOLD.DRIVE
            ? 'Getting in…'
            : kind === HOLD.FAIR_START
              ? 'Starting the generator…'
              : kind === HOLD.FAIR_STOP
                ? 'Shutting it off…'
                : kind === HOLD.GUN_LIFT
                  ? 'Lifting the gun…'
                  : 'Starting the engine…';
    label = this.fixtures.holdLabel(kind) || this.vehicles.holdLabel(kind) || label;
    if (boot) label = lever ? 'Prying the trunk open…' : 'Forcing the trunk open…';
    const need = holdNeed(kind, { search: (boot ? pryTime(lever) : SEARCH_TIME) * pm.search, revive: REVIVE_TIME * difficultyOf(this.room?.difficulty).revive * pm.revive });
    return { need, label };
  },

  // The ring's frame: the server's word on our hold, and a hold waited for until the hands were free
  updateHoldRing(dt) {
    const self = this.self;
    const r = this.holdRing;
    const w = this.holdWait;
    if (w && !this.handsBusy()) {
      this.holdWait = null;
      this.beginHold(w.id, w.kind, w.o);
    }
    // a hold the server took up after the ring had given up on it (a long trip): back up, quietly
    if (!r.active && r.cancelT <= 0 && this.holding && self.holdKind) this.startHoldRing(this.holding, self.holdKind, {}, true);
    if (r.update(dt, this.holding ? self.holdKind : 0, self.holdProgress, this.conn.rtt / 1000) === 'cancel') this.audio.playLocal('hold_cancel');
  },
};
