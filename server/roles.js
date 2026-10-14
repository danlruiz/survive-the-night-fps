// Co-op roles, server side (who holds which, and the numbers: shared/roles.js). Each role is a few rules the game
// asks of here:
//   Guardian  guarded(p): a downed survivor's bleed-out clock stops while one stands by them (Game's player update)
//   Medic     reviveMul(p): a revive begun near one takes MEDIC.revive the time (Game.holdBegin)
//   Spotter   mark(p, ...): their danger ping (ACT.PING) marks the one of the dead it lands on; hurtMul(z, by) is
//             what that mark adds to everyone else's blows (Combat.damageZombie). ZSTATUS.MARKED shows it to all
//   Scout     update: a car supply in its hiding place within SCOUT.range of one is pinned on everyone's compass
//             (Game.scouted, a bit per hint in the global state; NOTIFY.SCOUTED)
//   Runner    drag(p, e): crouched, [E] on a downed teammate takes them by the collar (s.drag on the Runner, slowing
//             them; the one dragged is pulled after them by playersim's pull, s.pulled toward the Runner), until [E]
//             again, either goes off their feet or out of the game, or the grip slips (DRAG.slip)
// "On their feet": alive, not turned, not downed, not away. A held player (away) counts for nothing.
import { ENT } from '../shared/protocol.js';
import { NOTIFY } from '../shared/defs.js';
import { ROLE, hasRole, GUARD, MEDIC, MARK, SCOUT, DRAG } from '../shared/roles.js';

const up = (p) => p.alive && !p.zombie && !p.downed && !p.away;
// e is dragged by nobody now: no longer pulled along (and their client told)
function released(e) {
  e.draggedBy = 0;
  e.state.pulled = 0;
  e.selfSync = true;
}

export class Roles {
  constructor(game) {
    this.g = game;
    this.scoutT = 0;
  }

  // the survivors on their feet who hold role r
  *holders(r) {
    for (const p of this.g.players.values()) if (up(p) && hasRole(p.perks, r)) yield p;
  }

  // ---------------------------------------------------------------- Guardian
  // the Guardian keeping this downed survivor from bleeding out, or null
  guarded(p) {
    const s = p.state;
    for (const q of this.holders(ROLE.GUARDIAN)) {
      if (q !== p && (q.state.x - s.x) ** 2 + (q.state.z - s.z) ** 2 <= GUARD.range ** 2 && Math.abs(q.state.y - s.y) < 2) return q;
    }
    return null;
  }

  // ---------------------------------------------------------------- Medic
  // what a revive by p takes, as a share of its time: less with a Medic within reach (p themselves included)
  reviveMul(p) {
    const s = p.state;
    for (const q of this.holders(ROLE.MEDIC)) {
      if ((q.state.x - s.x) ** 2 + (q.state.z - s.z) ** 2 <= MEDIC.range ** 2) return MEDIC.revive;
    }
    return 1;
  }

  // ---------------------------------------------------------------- Spotter
  // A danger ping by p at (x, y, z): from a Spotter, it marks the one of the dead nearest the spot (within
  // MARK.range of its body), taking any mark of theirs off whatever had it. Returns the one marked, or null.
  mark(p, x, y, z) {
    if (!up(p) || !hasRole(p.perks, ROLE.SPOTTER)) return null;
    let best = null;
    let bestD = MARK.range ** 2;
    for (const zz of this.g.zombies) {
      if (zz.dead) continue;
      const dy = Math.max(0, Math.abs(y - (zz.y + 1)) - 1); // (anywhere from its feet to its head)
      const d = (zz.x - x) ** 2 + dy * dy + (zz.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = zz;
      }
    }
    if (!best) return null;
    for (const zz of this.g.zombies) if (zz.markBy === p.id) zz.markT = zz.markBy = 0;
    best.markT = MARK.time;
    best.markBy = p.id;
    return best;
  }

  // what a mark adds to a blow on z by `by`: MARK.hurt from anyone but the Spotter who put it there
  hurtMul(z, by) {
    return z.markT > 0 && by && by.kind === ENT.PLAYER && !by.zombie && by.id !== z.markBy ? MARK.hurt : 1;
  }

  // ---------------------------------------------------------------- Runner
  // [E] on downed teammate e: a crouched Runner takes them by the collar, and [E] on the one they drag lets go.
  // Returns true when it was a drag's (nothing else is to come of the [E]: no revive).
  drag(p, e) {
    if (p.dragging === e.id) {
      this.letGo(p);
      return true;
    }
    const s = p.state;
    if (!up(p) || !hasRole(p.perks, ROLE.RUNNER) || !s.crouch || p.dragging || e.draggedBy) return false;
    if (s.hmg || s.pet || s.ride || s.cart || s.drive || s.pass || s.pinned || s.pulled || e.state.pinned || e.state.pulled) return false;
    p.dragging = e.id;
    e.draggedBy = p.id;
    s.drag = 1;
    p.selfSync = true;
    this.pull(e, p);
    return true;
  }

  // p lets go of whoever they drag (and nothing happens if they drag nobody)
  letGo(p) {
    if (!p.dragging) return;
    const e = this.g.players.get(p.dragging);
    p.dragging = 0;
    p.state.drag = 0;
    p.selfSync = true;
    if (e && e.draggedBy === p.id) released(e);
  }

  // the one dragged is pulled to where the Runner is (playersim: at 4.4 m/s, stopping 1.3 m short)
  pull(e, p) {
    const s = e.state;
    s.pulled = 1;
    s.pullX = p.state.x;
    s.pullY = p.state.y;
    s.pullZ = p.state.z;
  }

  // ---------------------------------------------------------------- every tick
  update(dt) {
    const g = this.g;
    // marks wear off
    for (const z of g.zombies) {
      if (!(z.markT > 0)) continue;
      z.markT = Math.max(0, z.markT - dt);
      if (z.markT <= 0) z.markBy = 0;
    }
    // drags: held on to while both are where they should be
    for (const p of g.players.values()) {
      if (!p.dragging) continue;
      const e = g.players.get(p.dragging);
      const ok = e && up(p) && e.alive && e.downed && !e.zombie && !e.away && e.draggedBy === p.id && p.state.drag && !p.state.pinned && !p.state.pulled;
      if (!ok || Math.hypot(e.state.x - p.state.x, e.state.z - p.state.z) > DRAG.slip) this.letGo(p);
      else this.pull(e, p);
    }
    // anyone still marked as dragged by somebody who is not dragging them is let go
    for (const e of g.players.values()) {
      if (!e.draggedBy) continue;
      const p = g.players.get(e.draggedBy);
      if (!p || p.dragging !== e.id) released(e);
    }
    // scouts look about them
    this.scoutT -= dt;
    if (this.scoutT <= 0) {
      this.scoutT = SCOUT.every;
      this.scout();
    }
  }

  // A car supply still in its hiding place within SCOUT.range of a Scout on their feet is pinned for the team
  scout() {
    const g = this.g;
    const spots = g.supplyHintSpots;
    if (!spots?.length) return;
    for (const p of this.holders(ROLE.SCOUT)) {
      const s = p.state;
      spots.forEach((si, k) => {
        const bit = 1 << k;
        if (si < 0 || g.supplyFound & bit || g.scouted & bit) return;
        const sp = g.world.partSpots[si];
        if (!sp || (sp.x - s.x) ** 2 + (sp.z - s.z) ** 2 > SCOUT.range ** 2) return;
        g.scouted |= bit;
        g.globalDirty = true;
        g.notify(NOTIFY.SCOUTED, k);
      });
    }
  }
}
