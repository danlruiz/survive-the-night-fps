// The zombie dog (ZTYPE.DOG): packs that den in the thick woods, catch a scent from far off, flank, lunge and break
// off, and ram what the survivors built when it is in their way. The Alpha (bosses.js) hunts as they do.
import { ZTYPE, ZANIM, SOUND, KILLER, IMPACT, STRUCT_DEFS } from '../../shared/defs.js';
import { ENT } from '../../shared/protocol.js';
import { resolveBody, groundAt, deepWaterAt, rayCollider, COL } from '../../shared/collision.js';
import { GRAV, turn } from './util.js';

// The zombie dog's hunt (def.hitRun). It runs in, bites once (a snap or a lunge), and breaks off (special state 7,
// breakOff) to DOG_RUN_MIN-MAX m from its prey, circles there at DOG_CIRCLE of its pace, and comes back in DOG_CD_MIN-MAX s
// after the bite. No dog goes in within DOG_PACK_GAP s of a packmate (packFree), so a pack comes in one at a time. A
// lunge never crosses anything the survivors built (lungeClear): a dog does not jump a barricade.
const DOG_RUN_MIN = 6;
const DOG_RUN_MAX = 10;
export const DOG_CIRCLE = 0.55;
const DOG_CD_MIN = 2;
const DOG_CD_MAX = 4;
const DOG_PACK_GAP = 0.45;
const lungeT = (dist) => Math.max(0.28, Math.min(0.5, dist / 11)); // s a dog's lunge from dist m off is in the air (act 8)
// Its ram (def.ramDmg, startRam). Held up by a piece the survivors built while after one of them, or shut in for
// DOG_PENNED s with one in DOG_PEN_R m, it backs off DOG_BACK_MIN-MAX m square from it (special state 8; as far as it
// gets), snarls for def.ramWindup (or DOG_RAM_WINDUP) s, and sprints at it at DOG_RAM_SPEED m/s (special state 9, DOG_RAM_T s at most).
// The blow deals ramDmg x the night's claw multiplier; a metal piece takes DOG_RAM_METAL of that and deals ramRecoil
// back. Then it reels (z.dazedT) for DOG_RAM_STUN s, or DOG_RAM_STUN_MISS after running into the static world, and
// rams again no sooner than DOG_RAM_CD s
const DOG_PENNED = 2;
const DOG_PEN_R = 3;
const DOG_BACK_MIN = 8;
const DOG_BACK_MAX = 12;
const DOG_RAM_WINDUP = 0.6;
const DOG_RAM_SPEED = 11;
const DOG_RAM_T = 1.6;
const DOG_RAM_METAL = 0.35;
const DOG_RAM_STUN = 1;
const DOG_RAM_STUN_MISS = 0.5;
const DOG_RAM_CD = 0.8;
const _lq = [];
const _pos = { x: 0, y: 0, z: 0 };

export const methods = {
  newPack() {
    this.packSeq = (this.packSeq % 0xffffff) + 1;
    return this.packSeq;
  },

  // n dogs around a den, spread over the pack's flanks
  spawnPack(x, z, n, opts = {}) {
    const g = this.g;
    const pack = this.newPack();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + g.rng();
      const r = 1 + g.rng() * 2.5;
      const d = this.spawn(ZTYPE.DOG, x + Math.sin(a) * r, z + Math.cos(a) * r, { ...opts, pack });
      if (!d) continue;
      d.homeX = x;
      d.homeZ = z;
      if (n > 1) d.flank = (i / (n - 1) - 0.5) * 1.5;
      k++;
    }
    return k;
  },

  // a pack at a forest den out of sight of every survivor (and away from the car and other packs)
  spawnForestPack(humans) {
    const g = this.g;
    if (!g.joined(ZTYPE.DOG)) return 0; // (no dogs until the run has met them)
    const dens = this.forestDens();
    if (!dens.length) return 0;
    const car = g.world.car;
    for (let tries = 0; tries < 12; tries++) {
      const d = dens[Math.floor(g.rng() * dens.length)];
      if (Math.hypot(d.x - car.x, d.z - car.z) < 80 || this.nearStart(d.x, d.z, 20)) continue;
      let ok = true;
      for (const h of humans) if (Math.hypot(h.state.x - d.x, h.state.z - d.z) < 80) ok = false;
      if (!ok) continue;
      for (const o of g.zombies) if (o.pack && !o.dead && Math.hypot(o.homeX - d.x, o.homeZ - d.z) < 40) ok = false;
      if (!ok) continue;
      const n = 2 + Math.floor(g.rng() * (g.day >= 3 ? 3 : g.day >= 2 ? 2 : 1));
      return this.spawnPack(d.x, d.z, n, { hpMul: 1 + 0.05 * g.day });
    }
    return 0;
  },

  // a dog that picks up a scent sets the rest of its pack onto the same survivor (and howls, once)
  alertPack(z) {
    const g = this.g;
    let howl = z.howlT <= 0;
    this.forNear(z.x, z.z, 45, (o) => {
      if (o === z || o.dead || o.pack !== z.pack) return;
      if (o.howlT > 0) howl = false;
      if (!o.target) {
        o.target = z.target;
        o.aggroId = z.target;
        o.aggroT = 12;
      }
    });
    if (howl) {
      z.howlT = 25;
      g.sound(SOUND.DOG_HOWL, z.x, z.y + 0.7, z.z, 110);
    }
  },

  // a dog that has bitten (or snapped and missed) breaks off, circles, and comes back in later
  breakOff(z) {
    const g = this.g;
    z.state = 7;
    z.stateT = DOG_CD_MIN + g.rng() * (DOG_CD_MAX - DOG_CD_MIN);
    z.runD = DOG_RUN_MIN + g.rng() * (DOG_RUN_MAX - DOG_RUN_MIN);
    z.runSide = g.rng() < 0.5 ? 1 : -1;
    z.pendingHit = 0;
  },

  // may this dog go in for a bite that gets home in lead s? Not within DOG_PACK_GAP s of a packmate's
  packFree(z, lead) {
    if (!z.def.hitRun) return true;
    const t = this.packGo.get(z.pack);
    return t === undefined || Math.abs(this.g.time + lead - t) >= DOG_PACK_GAP;
  },
  packMark(z, lead) {
    if (!z.def.hitRun) return;
    const now = this.g.time;
    if (this.packGo.size > 64) for (const [k, t] of this.packGo) if (now - t > DOG_PACK_GAP) this.packGo.delete(k);
    this.packGo.set(z.pack, Math.max(this.packGo.get(z.pack) ?? 0, now + lead));
  },

  // a lunge from where the dog stands to (ax, az) crosses nothing the survivors built, across the width of its body
  lungeClear(z, ax, az) {
    const dx = ax - z.x;
    const dz = az - z.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.05) return true;
    const ux = dx / l;
    const uz = dz / l;
    const r = z.def.radius;
    for (const c of this.g.world.structGrid.query((z.x + ax) / 2, (z.z + az) / 2, l / 2 + r + 0.2, _lq)) {
      if (c.flags & COL.NOBLOCK) continue;
      for (let k = -1; k <= 1; k++) if (rayCollider(c, z.x - uz * r * k, z.y + 0.3, z.z + ux * r * k, ux, 0, uz, l + r) >= 0) return false;
    }
    return true;
  },

  // a dog sets out to ram structure s: it backs off square from it, on its own side (special state 8)
  startRam(z, s) {
    const g = this.g;
    const c = s.collider;
    if (!c) return;
    // (a box's thin side faces (sin yaw, cos yaw), shared/collision.js makeBox)
    const side = (z.x - c.x) * c.s + (z.z - c.z) * c.c >= 0 ? 1 : -1;
    z.ramId = s.id;
    z.ramX = c.s * side;
    z.ramZ = c.c * side;
    z.runD = DOG_BACK_MIN + g.rng() * (DOG_BACK_MAX - DOG_BACK_MIN);
    z.state = 8;
    z.stateT = z.runD / z.def.speed + 0.5;
    z.stuckT = 0;
    z.detourT = 0;
    z.pendingHit = 0;
  },

  // a dog's ram in flight (special state 9): straight on until it hits something, bites someone or runs out
  ram(z, dt) {
    const g = this.g;
    const def = z.def;
    z.stateT -= dt;
    z.anim = ZANIM.RUN;
    z.yaw = Math.atan2(-z.chargeX, -z.chargeZ);
    z.vx = z.chargeX * DOG_RAM_SPEED;
    z.vz = z.chargeZ * DOG_RAM_SPEED;
    // in steps no longer than a wall is thick, so it never comes out on the far side of one
    const step = DOG_RAM_SPEED * dt;
    const n = Math.ceil(step / 0.25);
    let hit = null;
    let wet = false;
    for (let i = 0; i < n && !hit; i++) {
      _pos.x = z.x + (z.chargeX * step) / n;
      _pos.y = z.y;
      _pos.z = z.z + (z.chargeZ * step) / n;
      if (deepWaterAt(g.world, _pos.x, _pos.z, z.y, 0.2, false)) {
        wet = true;
        break;
      }
      hit = resolveBody(g.world, _pos, def.moveR ?? Math.min(def.radius, 0.65), def.moveH ?? def.height, false);
      z.x = _pos.x;
      z.z = _pos.z;
      z.y = groundAt(g.world, z.x, z.z, z.y, 0.2, false);
    }
    const dmgMul = 1 + 0.07 * (g.day - 1);
    // a survivor in the way takes the bite, and the dog breaks off as from any other
    for (const h of this.humansCache) {
      const s = h.state;
      if (Math.hypot(s.x - z.x, s.z - z.z) < 1.2 && Math.abs(s.y - z.y) < 1.3 && this.canReach(z, h)) {
        g.damagePlayer(h, def.dmg * 1.5 * dmgMul, { kind: KILLER.ZOMBIE, ztype: z.ztype, x: z.x, z: z.z });
        g.impact(IMPACT.BLOOD, s.x, s.y + 0.7, s.z);
        g.sound(SOUND.DOG_SNARL, z.x, z.y + 0.6, z.z, 30);
        z.vx = z.vz = 0;
        z.ramCd = DOG_RAM_CD;
        this.breakOff(z);
        return true;
      }
    }
    let stun = 0;
    if (hit && hit.flags & COL.STRUCT) {
      const s = g.ents[hit.id];
      const metal = !!(s && STRUCT_DEFS[s.stype].metal);
      const fx = z.x + z.chargeX * def.radius;
      const fz = z.z + z.chargeZ * def.radius;
      for (let k = 0; k < 3; k++) g.impact(metal ? IMPACT.METAL : IMPACT.WOOD, fx, z.y + 0.3 + k * 0.25, fz, -z.chargeX, 0.4, -z.chargeZ);
      g.impact(IMPACT.DIRT, fx, z.y + 0.1, fz);
      g.sound(SOUND.SLAM, fx, z.y + 0.5, fz, 50);
      if (s && s.kind === ENT.STRUCTURE) g.damageStructure(s, def.ramDmg * dmgMul * g.diff.hurt * (metal ? DOG_RAM_METAL : 1));
      if (metal && g.combat.damageZombie(z, def.ramRecoil, null, {})) return true;
      stun = DOG_RAM_STUN;
    } else if (hit) stun = DOG_RAM_STUN_MISS;
    if (!hit && !wet && z.stateT > 0) return true;
    z.state = 0;
    z.vx = z.vz = 0;
    z.ramCd = DOG_RAM_CD;
    if (stun) {
      z.dazedT = stun;
      z.attackCd = Math.max(z.attackCd, stun);
      z.pendingHit = 0;
    }
    return true;
  },

  // a dog's lunge in the air (special state 2, Zombies.special): it bites whoever it slams into, once
  lungeBite(z) {
    const g = this.g;
    const def = z.def;
    const t = z.ztype;
    for (const h of this.humansCache) {
      const s = h.state;
      if (Math.hypot(s.x - z.x, s.z - z.z) < 1.3 && z.y > s.y - 0.4 && z.y < s.y + 1.3 && this.canReach(z, h)) {
        z.bit = true;
        z.vx *= 0.25;
        z.vz *= 0.25;
        g.damagePlayer(h, def.dmg * 1.5 * (1 + 0.07 * (g.day - 1)), { kind: KILLER.ZOMBIE, ztype: t, x: z.x, z: z.z });
        g.impact(IMPACT.BLOOD, s.x, s.y + 0.7, s.z);
        g.sound(SOUND.DOG_SNARL, z.x, z.y + 0.6, z.z, 30);
        break;
      }
    }
  },

  // ...and down again: it is soon at them again, or off and round after a bite (breakOff)
  lungeLand(z) {
    const def = z.def;
    z.animT = 0.15;
    z.attackCd = Math.max(z.attackCd, 0.35);
    if (z.bit && def.hitRun) this.breakOff(z);
  },

  // a dog getting nowhere near its prey, shut in (or out) by what was built: it rams the nearest piece
  ramIfPenned(z) {
    if (z.ramCd <= 0 && z.wedgeT > DOG_PENNED && (z.state === 0 || z.state === 7)) {
      const s = this.nearStruct(z, DOG_PEN_R);
      if (s) this.startRam(z, s);
    }
  },
};

// a dog goes in for a lunge (and The Alpha, between its howls: bosses.js)
export function lungeTrigger(z, target, tx, ty, tz, dist) {
  const def = z.def;
  if (z.specialCd <= 0 && z.los && dist < def.lungeRange && dist > 2.4 && z.vy > -1 && Math.abs(ty - z.y) < 2.5 && this.packFree(z, 0.3 + lungeT(dist)) && this.lungeClear(z, tx, tz)) {
    this.packMark(z, 0.3 + lungeT(dist));
    this.windup(z, 0.3, 8, SOUND.DOG_BARK);
    return true;
  }
  return false;
}

export const triggers = {
  [ZTYPE.DOG]: lungeTrigger,
};

export const acts = {
  8(z, target, tx, ty, tz, dist) {
    const g = this.g;
    // dog lunge: a low, fast leap that lands at the survivor's feet
    if (!target) return;
    const s = target.state;
    const T = lungeT(dist);
    let ax = s.x + s.vx * T * 0.5 - z.x;
    let az = s.z + s.vz * T * 0.5 - z.z;
    const l = Math.hypot(ax, az) || 1;
    const k = Math.max(0, l - 0.6) / l;
    ax *= k;
    az *= k;
    // (its prey stepped behind a barricade during the windup: no lunge)
    if (!this.lungeClear(z, z.x + ax, z.z + az)) {
      z.specialCd = 0.5;
      return;
    }
    z.vx = ax / T;
    z.vz = az / T;
    z.vy = (s.y - z.y + 0.5 * GRAV * T * T) / T;
    z.yaw = Math.atan2(-ax, -az);
    z.state = 2;
    z.anim = ZANIM.AIRBORNE;
    z.bit = false;
    z.specialCd = 3 + g.rng() * 2.5;
  },
  12(z, target, tx, ty, tz, dist) {
    const g = this.g;
    // a dog's ram: at the nearest stretch of the piece, square on (special state 9, ram)
    const s = g.ents[z.ramId];
    if (!s || s.kind !== ENT.STRUCTURE || s.removed) return;
    const c = s.collider;
    const lim = Math.max(0, c.hx - 0.3);
    const along = Math.max(-lim, Math.min(lim, (z.x - c.x) * c.c - (z.z - c.z) * c.s));
    const ax = c.x + c.c * along - z.x;
    const az = c.z - c.s * along - z.z;
    const l = Math.hypot(ax, az) || 1;
    z.chargeX = ax / l;
    z.chargeZ = az / l;
    z.state = 9;
    z.stateT = DOG_RAM_T;
  },
};

export const states = {
  8(z, dt, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    // a dog backing off from the piece it is about to ram, as far as it gets: then it squares up and snarls
    const s = g.ents[z.ramId];
    if (!s || s.kind !== ENT.STRUCTURE || s.removed) {
      z.state = 0;
      return false;
    }
    z.stateT -= dt;
    const ox = z.x;
    const oz = z.z;
    this.integrate(z, dt, z.ramX * def.speed, z.ramZ * def.speed, this.humansCache);
    if (Math.hypot(z.x - ox, z.z - oz) < def.speed * dt * 0.25) z.stuckT += dt;
    else z.stuckT = 0;
    z.yaw = turn(z.yaw, Math.atan2(-z.vx, -z.vz), dt * 8);
    z.anim = ZANIM.RUN;
    const out = (z.x - s.collider.x) * z.ramX + (z.z - s.collider.z) * z.ramZ;
    if (out >= z.runD || z.stateT <= 0 || z.stuckT > 0.3) {
      z.stuckT = 0;
      z.vx = z.vz = 0;
      z.state = 1;
      z.stateT = def.ramWindup ?? DOG_RAM_WINDUP;
      z.stateAct = 12;
      z.anim = ZANIM.SPECIAL;
      g.sound(SOUND.DOG_SNARL, z.x, z.y + def.headY, z.z, 45);
    }
    return true;
  },
  9(z, dt, target, tx, ty, tz, dist) {
    return this.ram(z, dt);
  },
};
