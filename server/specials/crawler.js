// The crawler (ZTYPE.CRAWLER): a flying squirrel of the dead. It waits up a tree near the survivors, drops on whoever
// comes near and clamps on their face; off a face, it runs for a tree away from them. Its spring is the leaper's
// pounce (leaper.js: fireSpecial act 2, special states 2 and 3), shaped by the numbers here.
import { ZTYPE, ZANIM, SOUND } from '../../shared/defs.js';
import { groundAt, COL } from '../../shared/collision.js';
import { turn } from './util.js';

// The crawler (ZTYPE.CRAWLER) springs with the leaper's pounce, aimed LATCH_AIM m above its prey's feet (their face, not
// their chest), and clamps on there: LATCH_DROP m under their eyes (the middle of its body over them), LATCH_NEAR m in
// front of them (+ PIN_SHOVED as they shove)
export const LATCH_AIM = 1.45;
export const LATCH_DROP = 0.1;
export const LATCH_NEAR = 0.12;
// ...and it is a flying squirrel: it does not run its prey down, it waits for it up a tree (perch). On the ground it
// makes for a standing tree PERCH_FIND m or less from its prey, best one PERCH_AT m off it and never nearer than
// PERCH_NEAR, that no other crawler has; it runs up the trunk at CLIMB_SPEED m/s and clings there PERCH_UP of the tree's
// height up (PERCH_LOW-PERCH_HIGH m), working round the trunk to face whoever is nearest, its eyes glowing (the
// client's) and chittering every PERCH_CALL s, so it can be seen and heard, and its tree given a wide berth. A
// survivor coming within PERCH_DROP m of the trunk, in its sight, and it chitters once more and drops (PERCH_WIND s
// later), gliding down on to their face: the leaper's pounce at GLIDE_G of the fall, so slower and flatter, over
// GLIDE_T0 + GLIDE_TK s a metre (to GLIDE_TMAX). Nobody near for PERCH_BORED s, it comes down and finds another tree.
// With no tree near its prey it runs at them and springs from the ground as a leaper does
const PERCH_FIND = 96; // (x3 the reach: every perch distance below is x3)
const PERCH_AT = 36;
const PERCH_NEAR = 18;
const PERCH_UP = 0.4;
const PERCH_LOW = 3.5;
const PERCH_HIGH = 6.5;
const PERCH_DROP = 21; // (was 7: x3 the glide's reach)
const PERCH_WIND = 0.4;
const PERCH_CALL = [2.5, 6];
const PERCH_BORED = 45;
const PERCH_STRAY = 90; // (m: nobody nearer than this counts as near, for PERCH_BORED)
// Off a face (shaken, struck or let go: releaseLink) it does not come straight back: for FLEE_T s it runs for a tree
// FLEE_FAR m or more from whoever it had, and straight away from them while it has none, and it drops on nobody till
// FLEE_T + FLEE_REST s have passed
const FLEE_T = 8;
const FLEE_FAR = 14;
const FLEE_REST = 3;
const CLIMB_SPEED = 4;
export const GLIDE_G = 0.3;
export const GLIDE_T0 = 0.55;
export const GLIDE_TK = 0.07;
export const GLIDE_TMAX = 1.6;
export const CRAWLER_FLIGHT = 1.5; // x how fast a crawler flies through the air: its pounce and its glide take 1/this as long
const _trees = [];

export const methods = {
  // A crawler's trees (PERCH_*): up one, it clings there and waits, and drops on whoever comes near; on the ground, it
  // makes for one near its prey and climbs it. False when it has no tree to go to (it hunts on the ground then), or
  // its prey is on top of it (it springs from where it is)
  perch(z, dt, target, dist) {
    const g = this.g;
    const c = z.tree;
    // (a tree cut down or broken off under it: it lets go and falls)
    if (c && (!c.cells || c.y1 < (z.perched ? z.y : c.y0 + 1 + PERCH_LOW) + 0.5)) {
      z.tree = null;
      z.perched = z.climb = false;
      z.treeT = 1.5;
    }
    if (z.perched) return this.perchedOn(z, dt);
    if (z.dazedT > 0) return false;
    z.treeT -= dt;
    // off a face: away from whoever it had (FLEE_*), whether it has prey or not
    const fleeing = z.fleeT > 0;
    let from = null;
    if (fleeing) {
      z.fleeT -= dt;
      const fp = g.players.get(z.fleeFrom);
      from = fp && fp.alive ? fp.state : target ? target.state : null;
    }
    if (!target && !from) return false;
    if (!z.tree && z.treeT <= 0) {
      z.treeT = 1.5 + g.rng();
      z.tree = from ? this.pickFleeTree(z, from) : this.pickTree(z, target.state);
    }
    if (!z.tree && from) {
      // no tree far enough off yet: straight away from them, at a run
      const ax = z.x - from.x;
      const az = z.z - from.z;
      const l = Math.hypot(ax, az) || 1;
      const sp = z.def.speed * g.diff.speed;
      this.integrate(z, dt, (ax / l) * sp, (az / l) * sp, this.humansCache);
      if (Math.hypot(z.vx, z.vz) > 0.2) z.yaw = turn(z.yaw, Math.atan2(-z.vx, -z.vz), dt * 8);
      z.anim = ZANIM.RUN;
      return true;
    }
    if (!z.tree || (!fleeing && dist < 3 && z.los)) return false;
    const t = z.tree;
    const dx = t.x - z.x;
    const dz = t.z - z.z;
    const d = Math.hypot(dx, dz) || 1;
    const foot = t.y0 + 1;
    if (z.perchY <= 0) z.perchY = Math.max(PERCH_LOW, Math.min(PERCH_HIGH, (t.y1 - foot) * PERCH_UP));
    // (it starts up from the ground, not from the air: falling past another trunk it does not catch hold of it)
    if (d >= t.r + 0.9) z.climb = false;
    else if (!z.climb && z.y < groundAt(g.world, z.x, z.z, z.y + 0.5, 0.2, false) + 0.3) z.climb = true;
    const climbing = z.climb && z.y < z.perchY + foot;
    if (!climbing) {
      // on its way to it, at a run
      const sp = z.def.speed * g.diff.speed;
      this.integrate(z, dt, (dx / d) * sp, (dz / d) * sp, this.humansCache);
      if (Math.hypot(z.vx, z.vz) > 0.2) z.yaw = turn(z.yaw, Math.atan2(-z.vx, -z.vz), dt * 8);
      z.anim = ZANIM.RUN;
      return true;
    }
    // at its foot: up the trunk, on the side towards its prey (or whoever it fled)
    const toward = from || target?.state;
    if (toward) z.perchA = Math.atan2(toward.x - t.x, toward.z - t.z);
    this.cling(z, t);
    z.y = Math.min(foot + z.perchY, Math.max(z.y, foot) + CLIMB_SPEED * dt);
    z.vx = z.vy = z.vz = 0;
    z.anim = ZANIM.RUN;
    if (z.y >= foot + z.perchY) {
      z.perched = true;
      z.climb = false;
      z.perchT = 0;
      z.callT = 0.5 + g.rng();
    }
    return true;
  },

  // where on the trunk a crawler clings: perchA round it, its belly to the bark, facing out
  cling(z, t) {
    const r = t.r + 0.16;
    z.x = t.x + Math.sin(z.perchA) * r;
    z.z = t.z + Math.cos(z.perchA) * r;
    z.yaw = Math.atan2(-Math.sin(z.perchA), -Math.cos(z.perchA));
  },

  // up its tree (perch): it works round the trunk towards whoever is nearest, chitters now and then, and drops on
  // anyone who comes within PERCH_DROP m of the trunk in its sight
  perchedOn(z, dt) {
    const g = this.g;
    const t = z.tree;
    z.vx = z.vy = z.vz = 0;
    z.anim = z.windT > 0 ? ZANIM.SPECIAL : ZANIM.IDLE;
    let near = null;
    let nd = Infinity;
    for (const h of this.humansCache) {
      if (!h.alive || h.zombie || g.safe(h)) continue;
      const d = Math.hypot(h.state.x - t.x, h.state.z - t.z);
      if (d < nd) {
        nd = d;
        near = h;
      }
    }
    if (near) z.perchA = turn(z.perchA, Math.atan2(near.state.x - t.x, near.state.z - t.z), dt * 1.5);
    this.cling(z, t);
    if (z.windT > 0) {
      z.windT -= dt;
      if (z.windT > 0) return true;
      // off the tree and down on to them
      const h = g.players.get(z.windOn);
      if (h && h.alive && !h.zombie && !h.state.pinned && !h.state.pulled) {
        const s = h.state;
        z.perched = z.climb = false;
        z.tree = null;
        z.treeT = 4;
        z.glide = true;
        z.target = h.id;
        z.stateAct = 2;
        this.fireSpecial(z, h, s.x, s.y, s.z, Math.hypot(s.x - z.x, s.z - z.z));
        if (z.state !== 2) z.glide = false;
      }
      return true;
    }
    z.callT -= dt;
    if (z.callT <= 0) {
      z.callT = PERCH_CALL[0] + g.rng() * (PERCH_CALL[1] - PERCH_CALL[0]);
      g.sound(SOUND.CRAWLER_CHITTER, z.x, z.y, z.z, 40);
    }
    z.perchT = nd < PERCH_STRAY ? 0 : z.perchT + dt;
    if (z.perchT > PERCH_BORED) {
      // nobody comes: down, to find a tree nearer them (it lets go; it falls)
      z.perched = z.climb = false;
      z.tree = null;
      z.treeT = 1.5;
      return true;
    }
    if (near && nd < PERCH_DROP && z.specialCd <= 0 && !near.state.pinned && !near.state.pulled && this.clearLine(z.x, z.y + 0.2, z.z, near.state.x, near.state.y + 1.4, near.state.z)) {
      z.windT = PERCH_WIND;
      z.windOn = near.id;
      g.sound(SOUND.CRAWLER_CHITTER, z.x, z.y, z.z, 40);
    }
    return true;
  },

  // the tree a crawler off a face makes for: FLEE_FAR m or more from whoever it had (at s), on its own side of them, as
  // near to it as may be, and no other crawler's
  pickFleeTree(z, s) {
    let best = null;
    let bs = Infinity;
    const ox = z.x - s.x;
    const oz = z.z - s.z;
    for (const c of this.g.world.staticGrid.query(z.x, z.z, PERCH_FIND, _trees)) {
      if (!(c.flags & COL.TREE) || c.y1 - c.y0 - 1 < PERCH_LOW + 2) continue;
      if (Math.hypot(c.x - s.x, c.z - s.z) < FLEE_FAR) continue;
      if ((c.x - s.x) * ox + (c.z - s.z) * oz < 0) continue; // (not back past them)
      const sc = Math.hypot(c.x - z.x, c.z - z.z);
      if (sc >= bs) continue;
      let taken = false;
      for (const o of this.g.zombies) if (o !== z && o.tree === c && !o.dead) taken = true;
      if (taken) continue;
      best = c;
      bs = sc;
    }
    z.perchY = 0;
    return best;
  },

  // the tree a crawler after a survivor at s makes for: one that stands, near them but not over them, PERCH_AT m off
  // them as near as may be, not far out of its own way, and no other crawler's
  pickTree(z, s) {
    let best = null;
    let bs = Infinity;
    for (const c of this.g.world.staticGrid.query(s.x, s.z, PERCH_FIND, _trees)) {
      if (!(c.flags & COL.TREE) || c.y1 - c.y0 - 1 < PERCH_LOW + 2) continue;
      const dh = Math.hypot(c.x - s.x, c.z - s.z);
      if (dh < PERCH_NEAR || dh > PERCH_FIND) continue;
      const sc = Math.abs(dh - PERCH_AT) + 0.35 * Math.hypot(c.x - z.x, c.z - z.z);
      if (sc >= bs) continue;
      let taken = false;
      for (const o of this.g.zombies) if (o !== z && o.tree === c && !o.dead) taken = true;
      if (taken) continue;
      best = c;
      bs = sc;
    }
    z.perchY = 0;
    return best;
  },

  // off a face (releaseLink) it makes off for a tree away from whoever it had (p), and drops on nobody for a while (FLEE_*)
  fleeFace(z, p) {
    z.fleeT = FLEE_T;
    z.fleeFrom = p ? p.id : 0;
    z.tree = null;
    z.perched = z.climb = false;
    z.treeT = 0;
    z.specialCd = Math.max(z.specialCd, FLEE_T + FLEE_REST);
  },
};

export const moves = {
  // up a tree, or on its way to one (perch)
  [ZTYPE.CRAWLER](z, dt, target, tx, ty, tz, dist) {
    return this.perch(z, dt, target, dist);
  },
};

export const releases = {
  // off a face it makes off for a tree away from them (FLEE_*)
  [ZTYPE.CRAWLER](z, p) {
    if (!z.dead) this.fleeFace(z, p);
  },
};

export const triggers = {
  [ZTYPE.CRAWLER](z, target, tx, ty, tz, dist) {
    const def = z.def;
    // (not at whoever already has something on them: it goes for a face that is free)
    if (z.specialCd <= 0 && z.los && dist < def.latchRange && z.vy === 0 && (!z.tree || dist < 3) && !target.state.pinned && !target.state.pulled) {
      this.windup(z, 0.35, 2, SOUND.CRAWLER_CHITTER);
      return true;
    }
    return false;
  },
};
