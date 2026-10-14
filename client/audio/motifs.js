// Approach motifs (issue #298): a short phrase in the score for each kind of special, heard when one comes into the
// client's view (spawning, or walking into the 115 m the server sends) and again when it first gets within MOTIF_NEAR m
// of any survivor - a warning while there is still time to act on it, well before the wind-up of its attack.
// Far off it is played on strings, soft and wet; close, on the piano. The same notes either way, so the shape is
// what is learnt. Worked out on the client from the snapshot: nothing crosses the wire. Played by music.js motif().
// Settings: 'motifs' (on by default; Audio & voice).
import { ZTYPE } from '../../shared/defs.js';

export const MOTIF_NEAR = 30; // m from a survivor: the second, closer cue
export const MOTIF_EVERY = 8; // s: no kind heard twice inside this
export const MOTIF_GAP = 1.2; // s between any two motifs, so a crowd coming into view does not play over itself
export const MOTIF_STALE = 4; // s: a far cue held back by the gap for longer than this is dropped
const MOTIF_GROUP = 20; // m: the others of its kind this close to the one heard count as heard with it (a pack)
export const MOTIF_PROBE = 0.25; // s between looks at the entities
export const MOTIF_BEAT = 0.2; // s per beat on the piano (the strings take MOTIF_FAR_SLOW x as long)
export const MOTIF_FAR_SLOW = 1.35;

// Each kind's phrase: [semitones above D4, beats] per note. Kept to 2-4 notes, in or near the score's D phrygian,
// each with a contour and rhythm of its own (scripts/test-motifs.js holds them apart). None is heard for anything else.
export const MOTIFS = {
  [ZTYPE.SPITTER]: [[7, 1], [6, 1], [0, 2]], // a drip down: A, A flat, D
  [ZTYPE.BOOMER]: [[-12, 2], [-11, 3]], // swollen and low: a slow half step that will not settle
  [ZTYPE.LEAPER]: [[0, 0.5], [12, 0.5], [13, 2]], // a spring: up the octave and past it
  [ZTYPE.ROPER]: [[5, 1], [5, 1], [5, 1], [-2, 2]], // pulled taut three times, then let go
  [ZTYPE.SHADE]: [[12, 2.5], [18, 3]], // high and hollow: the tritone, slow
  [ZTYPE.TANK]: [[-12, 2], [-5, 1], [-11, 2]], // heavy steps
  [ZTYPE.DOG]: [[3, 0.5], [3, 0.5], [10, 1.5]], // two yaps and a howl
  [ZTYPE.SMOKER]: [[3, 1.5], [1, 1.5], [0, 2.5]], // curling down, slow
  [ZTYPE.SCREECHER]: [[13, 0.5], [12, 0.5], [13, 0.5], [12, 2]], // a shrill trill
  [ZTYPE.CRAWLER]: [[10, 0.5], [8, 0.5], [10, 0.5], [3, 2]], // skittering, then a drop from above
  [ZTYPE.FLAMMER]: [[0, 1], [7, 1], [14, 2]], // catching: fifths stacking up
  [ZTYPE.MOTHER]: [[8, 1.5], [7, 0.5], [3, 1], [2, 2]], // a lullaby gone wrong
};

// Which kinds the motifs track, and how each is heard. ents: the entity records (entities.js) with { id, kind,
// ztype, rx, rz, dead }; survivors: [{ x, z }] of everyone alive and not one of the dead. cue(ztype, near, x, z) plays
// one. The per-entity state lives here (keyed by id) so the entity records are left alone.
export class MotifWatch {
  constructor() {
    this.last = new Map(); // ztype -> time its motif last played
    this.lastAny = -Infinity;
    this.seen = new Map(); // entity id -> { t: when first seen, far: done, near: done, ztype }
    this.probeT = 0;
  }

  reset() {
    this.last.clear();
    this.seen.clear();
    this.lastAny = -Infinity;
  }

  // a probe is due (so the caller can leave gathering what update() needs until then)
  due(now) {
    return now >= this.probeT;
  }

  // now: s (any steady clock). Returns the cues played this probe as [{ ztype, near }] (for the test).
  update(now, ents, survivors, cue) {
    if (now < this.probeT) return null;
    this.probeT = now + MOTIF_PROBE;
    const played = [];
    const live = new Set();
    for (const e of ents) {
      if (e.dead || !MOTIFS[e.ztype]) continue;
      live.add(e.id);
      let s = this.seen.get(e.id);
      if (!s || s.ztype !== e.ztype) this.seen.set(e.id, (s = { t: now, far: false, near: false, ztype: e.ztype }));
      if (s.near) continue;
      let d2 = Infinity;
      for (const p of survivors) d2 = Math.min(d2, (p.x - e.rx) ** 2 + (p.z - e.rz) ** 2);
      const near = d2 < MOTIF_NEAR * MOTIF_NEAR;
      if (!near && s.far) continue;
      // a far cue that has waited too long is let go; a near one waits as long as the special stays near
      if (!near && now - s.t > MOTIF_STALE) {
        s.far = true;
        continue;
      }
      if (now - this.lastAny < MOTIF_GAP || now - (this.last.get(e.ztype) ?? -Infinity) < MOTIF_EVERY) continue;
      s.far = true;
      if (near) s.near = true;
      this.last.set(e.ztype, now);
      this.lastAny = now;
      cue(e.ztype, near, e.rx, e.rz);
      played.push({ ztype: e.ztype, near });
      // the rest of its pack, or a pair coming in together, were announced by that one
      for (const o of ents) {
        if (o === e || o.dead || o.ztype !== e.ztype || (o.rx - e.rx) ** 2 + (o.rz - e.rz) ** 2 > MOTIF_GROUP * MOTIF_GROUP) continue;
        let so = this.seen.get(o.id);
        if (!so || so.ztype !== o.ztype) this.seen.set(o.id, (so = { t: now, far: false, near: false, ztype: o.ztype }));
        so.far = true;
        if (near) so.near = true;
      }
    }
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
    return played;
  }
}
