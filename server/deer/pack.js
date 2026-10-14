// The mainland's undead deer, as a pack on the hunt (server/deer.js keeps the deer themselves; this is laid onto its
// class, so these are called on it as this.name(...) like any of its own). A pack turns on a survivor who comes near,
// shoots one of them or fires close by: it closes in, each of it waits its turn round its prey, stands with its antlers
// down (the telegraph), charges along a line it can only bend a little, rams whoever it gets home on, and carries on
// past before it wheels and comes again. It keeps after its prey while they are huntable, within the leash and it can
// get at them; then it turns on whoever else is near, or stands and watches and roams again.
import { SOUND, KILLER, IMPACT } from '../../shared/defs.js';
import { DANIM, UNDEAD } from '../../shared/deer.js';
import { turnToward } from '../entkit.js';
import { MODE, HS, SNORT_EVERY } from './states.js';

const RAM_SHOW = 0.45; // s an undead deer that got home shows the ram (DANIM.ATTACK)
const REACH_Y = 1.6; // m up or down a survivor may be from it and still be charged
const _dir = { x: 0, z: 0, cost: 0 };
const _go = { dx: 0, dz: 0, speed: 0, face: null, anim: -1 }; // (hunting: what one of a pack does this tick)

export const packMethods = {
  // may a pack hunt p? A survivor on their feet, here and playing (not dropped and held, nor back with their page
  // still loading: Game.safe), not down the mine
  huntable(p) {
    return !!p && p.alive && !p.zombie && !p.downed && !this.g.safe(p) && !p.under;
  },

  // how near p is to the nearest of the pack (m)
  reach(gr, p) {
    let best = Infinity;
    for (const m of gr.members) best = Math.min(best, Math.hypot(p.state.x - m.x, p.state.z - m.z));
    return best;
  },

  // The pack's look round, four times a second. Hunting: it keeps after its prey while they are huntable, within the
  // leash and it can get at them; else it turns on whoever else is near enough, or calms down. Not hunting: the nearest
  // survivor within notice (further if they sprint, nearer if they crouch) sets it off.
  watch(gr, humans) {
    if (gr.mode === MODE.HUNT) {
      const p = this.g.players.get(gr.prey);
      if (this.huntable(p) && this.reach(gr, p) < UNDEAD.leash && gr.lostT < UNDEAD.lose) return;
      const q = this.preyNear(gr, humans, (h) => h !== p && this.reach(gr, h) < UNDEAD.notice * 1.5);
      if (q) this.hunt(gr, q);
      else this.giveUp(gr, p);
      return;
    }
    if (gr.calm > 0) return;
    const q = this.preyNear(gr, humans, (h) => {
      const s = h.state;
      let r = UNDEAD.notice;
      if (s.crouch) r *= UNDEAD.crouch;
      if (s.sprinting) r *= UNDEAD.sprint;
      return this.reach(gr, h) < r;
    });
    if (q) this.hunt(gr, q);
  },

  // the huntable survivor nearest the pack that `ok` passes, or null
  preyNear(gr, humans, ok) {
    let best = null;
    let bd = Infinity;
    for (const h of humans) {
      if (!this.huntable(h) || !ok(h)) continue;
      const d = this.reach(gr, h);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  },

  // the pack turns on p (or, already hunting, on to p: none of it breaks off what it is in the middle of)
  hunt(gr, p) {
    const g = this.g;
    const first = gr.mode !== MODE.HUNT;
    gr.prey = p.id;
    gr.lostT = 0;
    if (!first) return;
    gr.mode = MODE.HUNT;
    gr.t = 0;
    g.nav.removeField(gr.key); // (they go by the survivor's own field, which the dead keep for every survivor)
    for (const m of gr.members) {
      m.hs = HS.CLOSE;
      m.cd = this.rng() * 0.8; // (not all at once)
      this.newCourse(m);
      m.direct = false;
    }
    this.scream(gr, p.state.x, p.state.z);
  },

  // nobody left to hunt: they stand and watch where their prey went, then roam again
  giveUp(gr, p) {
    this.stand(gr, 3 + this.rng() * 3);
    gr.prey = 0;
    if (p) {
      gr.fromX = p.state.x;
      gr.fromZ = p.state.z;
    }
    gr.x = gr.cx;
    gr.z = gr.cz;
    for (const m of gr.members) {
      m.hs = HS.CLOSE;
      m.ramT = 0;
    }
  },

  // the bellow of the one nearest (x,z), now and then
  scream(gr, x, z) {
    if (gr.snortCd > 0 || !gr.members.length) return;
    gr.snortCd = SNORT_EVERY * 0.6;
    let m = gr.members[0];
    for (const o of gr.members) if (Math.hypot(o.x - x, o.z - z) < Math.hypot(m.x - x, m.z - z)) m = o;
    this.g.sound(SOUND.DEER_SCREAM, m.x, m.y + 1.1, m.z, 80);
  },

  // A noise reaches a pack: whoever made it (a survivor standing where it was made, a shot, a blow, a hammer), if
  // the pack is near enough to get at them, is hunted; anything else it only turns to look at.
  heard(gr, x, z, loud) {
    if (gr.mode === MODE.HUNT || !gr.members.some((m) => Math.hypot(m.x - x, m.z - z) < loud)) return;
    const who = gr.calm > 0 ? null : this.preyNear(gr, this.g.humans(), (h) => Math.hypot(h.state.x - x, h.state.z - z) < 3 && this.reach(gr, h) < UNDEAD.leash);
    if (who) return this.hunt(gr, who);
    if (gr.mode !== MODE.GRAZE) return;
    this.stand(gr, 2 + this.rng() * 3);
    gr.fromX = x;
    gr.fromZ = z;
  },

  // One of a hunting pack, this tick (into _go): in on its prey, or round it at a charge's distance while it waits its
  // turn; then it stands with its antlers down (the telegraph), charges along a line it can only bend a little, rams
  // whoever it gets home on, and carries on past before it wheels and comes again.
  hunting(m, gr, dt, humans) {
    const g = this.g;
    const go = _go;
    go.dx = go.dz = go.speed = 0;
    go.face = null;
    go.anim = -1;
    m.cd -= dt;
    m.hT -= dt;
    m.ramT -= dt;
    m.losT -= dt;
    const p = g.players.get(gr.prey);
    if (!p || !p.alive) return go; // (gone since the last look: watch sees to it)
    const s = p.state;
    let dx = s.x - m.x;
    let dz = s.z - m.z;
    const d = Math.hypot(dx, dz) || 0.01;
    const level = Math.abs(s.y - m.y) < REACH_Y;
    dx /= d;
    dz /= d;
    if (m.losT <= 0) {
      m.losT = 0.3;
      m.direct = d < 30 && this.clearWay(m.x, m.z, s.x, s.z, d);
    }
    if (m.hs === HS.CLOSE) this.closeIn(m, gr, p, d, dx, dz, level);
    if (m.hs === HS.WINDUP) this.windUp(m, gr, s, d, dx, dz, level);
    if (m.hs === HS.CHARGE) this.charge(m, gr, dx, dz, dt, humans);
    if (m.hs === HS.PAST) this.runPast(m, dt);
    if (m.ramT > 0) go.anim = DANIM.ATTACK;
    return go;
  },

  // (CLOSE) in on prey p, d m off along (dx, dz) (level: near enough its height to reach), or round it while it waits
  // its turn; its turn come, the windup
  closeIn(m, gr, p, d, dx, dz, level) {
    const g = this.g;
    const U = UNDEAD;
    const go = _go;
    const s = p.state;
    if (d < U.chargeFrom + 3 && m.direct && level) gr.near = true;
    // its turn: near enough, a clear run at them, and none of the pack set off a moment ago
    if (m.cd <= 0 && d < U.chargeFrom && d > 2.5 && m.direct && level && g.time - gr.goT > U.gap) {
      gr.goT = g.time + U.windup;
      m.hs = HS.WINDUP;
      m.hT = U.windup;
      this.scream(gr, s.x, s.z);
    } else if (!m.direct) {
      // round whatever is in the way, by the survivor's own field (straight at them where it has no answer)
      if (g.nav.flowDir(p.id, m.x, m.z, _dir, m.y)) {
        go.dx = _dir.x;
        go.dz = _dir.z;
      } else {
        go.dx = dx;
        go.dz = dz;
      }
      go.speed = U.run;
    } else if (m.cd > 0 || d < U.chargeFrom - 3) {
      // waiting its turn: round them at about a charge's distance, closing or opening the gap as it goes
      const out = Math.max(-1, Math.min(1, (U.chargeFrom - 1 - d) / 3));
      go.dx = -dz * m.side * 0.8 - dx * out;
      go.dz = dx * m.side * 0.8 - dz * out;
      go.speed = U.run * 0.5;
    } else {
      go.dx = dx;
      go.dz = dz;
      go.speed = d > U.chargeFrom ? U.run : U.run * 0.5; // (in range, and one of the pack has only just gone)
    }
  },

  // (WINDUP) standing with its antlers down at prey s, then the charge, along a line at them and a little ahead
  windUp(m, gr, s, d, dx, dz, level) {
    const U = UNDEAD;
    const go = _go;
    gr.near = true;
    go.face = Math.atan2(-dx, -dz);
    go.anim = DANIM.CHARGE;
    if (d > U.chargeFrom * 1.6 || !level) {
      m.hs = HS.CLOSE; // (they got away while it stood there)
      m.cd = 0.5;
    } else if (m.hT <= 0) {
      // the line it goes along: at them, and a little ahead of where they are going
      let lx = s.x + s.vx * 0.2 - m.x;
      let lz = s.z + s.vz * 0.2 - m.z;
      const l = Math.hypot(lx, lz) || 1;
      m.chx = lx / l;
      m.chz = lz / l;
      m.hs = HS.CHARGE;
      m.hT = U.chargeT;
    }
  },

  // (CHARGE) along its line, bent a little towards its prey (along dx, dz), into whoever it gets home on
  charge(m, gr, dx, dz, dt, humans) {
    const U = UNDEAD;
    const go = _go;
    gr.near = true;
    // it bends its line towards them, a little
    const want = Math.atan2(dx, dz);
    const now = Math.atan2(m.chx, m.chz);
    const a = turnToward(now, want, U.steer * dt);
    m.chx = Math.sin(a);
    m.chz = Math.cos(a);
    go.dx = m.chx;
    go.dz = m.chz;
    go.speed = U.charge;
    go.anim = DANIM.CHARGE;
    const hit = this.inLine(m, humans);
    if (hit) this.ram(m, gr, hit);
    else if (m.hT <= 0) this.pass(m, 0);
  },

  // whoever of humans stands in the line of m's charge when it gets there: its prey, or anyone else of the team
  inLine(m, humans) {
    const U = UNDEAD;
    for (const h of humans) {
      if (!this.huntable(h)) continue;
      const rx = h.state.x - m.x;
      const rz = h.state.z - m.z;
      const ahead = rx * m.chx + rz * m.chz;
      if (ahead > -0.3 && ahead < U.hitAhead && Math.abs(rx * m.chz - rz * m.chx) < U.hitSide && Math.abs(h.state.y - m.y) < REACH_Y) return h;
    }
    return null;
  },

  // (PAST) on past, slowing, then round again
  runPast(m, dt) {
    const U = UNDEAD;
    const go = _go;
    go.dx = m.chx;
    go.dz = m.chz;
    go.speed = Math.min(U.charge, 2 + m.past * 1.4);
    m.past -= Math.hypot(m.vx, m.vz) * dt;
    if (m.past <= 0 || m.hT <= 0) {
      m.hs = HS.CLOSE;
      m.cd = U.cd[0] + this.rng() * (U.cd[1] - U.cd[0]);
    }
  },

  // a charge over (hit or miss): it carries on past by `extra` m and more
  pass(m, extra) {
    const U = UNDEAD;
    m.hs = HS.PAST;
    m.past = U.overrun[0] + this.rng() * (U.overrun[1] - U.overrun[0]) + extra;
    m.hT = 2.5; // (however it goes, it is round again by then)
  },

  // the antlers get home on survivor p: hurt (the dead's claw multiplier for the day, and the difficulty's), thrown back -
  // unless they are still off their feet from the last one (a pack's shoves would add up, and bat them about the plain)
  ram(m, gr, p) {
    const g = this.g;
    const U = UNDEAD;
    const s = p.state;
    g.damagePlayer(p, U.dmg * (1 + 0.07 * (g.day - 1)), { kind: KILLER.WORLD, deer: true, x: m.x, z: m.z });
    g.impact(IMPACT.BLOOD, s.x, s.y + 1.1, s.z);
    g.sound(SOUND.MELEE_HIT, s.x, s.y + 1, s.z, 30);
    if (s.onGround && s.stunT <= 0) g.zm.knock(p, m.x, m.z, U.knock, U.up, U.stun);
    gr.lostT = 0;
    m.ramT = RAM_SHOW;
    this.pass(m, 0);
  },
};
