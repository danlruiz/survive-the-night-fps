// The leaper's pounce and pin (ZTYPE.LEAPER): it springs on the survivor who has strayed from the rest, and pins
// them to the ground until they shove it off. The crawler (crawler.js) springs with the same pounce, aimed at the face.
// The flight itself is special state 2 (Zombies.special), which a dog's lunge flies too.
import { EYE_HEIGHT, EYE_HEIGHT_CROUCH, PIN_FACE } from '../../shared/constants.js';
import { ZTYPE, ZANIM, SOUND, KILLER, IMPACT } from '../../shared/defs.js';
import { resolveBody, groundAt } from '../../shared/collision.js';
import { GRAV } from './util.js';
import { LATCH_AIM, LATCH_DROP, LATCH_NEAR, GLIDE_G, GLIDE_T0, GLIDE_TK, GLIDE_TMAX, CRAWLER_FLIGHT } from './crawler.js';

// The leaper's pounce (act 2; it flies as special state 2). It flies for T = LEAP_T0 + LEAP_TK s per metre (within
// LEAP_TMIN-LEAP_TMAX), at where its prey will be after LEAP_LEAD of that flight on their present run (at most
// LEAP_LEAD_MAX m ahead). The arc is raised, LEAP_RAISE s of flight at a time, until it clears what stands in between
// with its feet LEAP_OVER m above it: a barricade in front of a survivor is what a leaper is for. In the air it twists towards its prey, LEAP_STEER m/s of
// sideways speed per second at most, so a survivor who keeps running is caught and one who sidesteps late is not. It
// pins whoever it passes over within LEAP_PIN m on the way down, or lands within LEAP_LAND m of. A miss is ready to
// go again in LEAP_MISS_CD s (plus up to half as much again)
const LEAP_T0 = 0.42;
const LEAP_TK = 0.04;
const LEAP_TMIN = 0.55;
const LEAP_TMAX = 0.95;
const LEAP_LEAD = 0.85;
const LEAP_LEAD_MAX = 4.5;
const LEAP_RAISE = 0.15;
const LEAP_OVER = 0.25;
const LEAP_STEER = 5;
export const LEAP_PIN = 1.5;
export const LEAP_LAND = 1.7;
export const LEAP_MISS_CD = 2.5;
const THROW_OFF_DAZE = 1; // s a leaper reels for once the survivor it pinned throws it off (throwOff)
// A leaper hunts whoever has strayed (#299): a survivor with no teammate standing within LONE_NEAR m of them looks
// LONE_WEIGHT times nearer to it than they are when it picks its prey (chooseTarget), so straying is a real risk and
// keeping together is what covers you. How far off it notices them at all is unchanged.
export const LONE_NEAR = 12;
export const LONE_WEIGHT = 3;
const PIN_NEAR = 0.55; // m in front of the survivor it has pinned...
const PIN_SHOVED = 0.3; // ...and this much further at the end of their shove (s.shove: SHOVE_* in constants.js)
const LEAP_AIM = 0.6; // (the leaper's: at the chest, to bear them down)
// the fall it makes in the air: a crawler gliding down from a tree falls at a fraction of it
export const leapG = (z) => (z.glide ? GRAV * GLIDE_G : GRAV);
const _leap = { x: 0, y: 0, z: 0 };

// a kind that pins its prey down (special state 3, s.pinned: the leaper, and the crawler on the face), not one that
// hauls them in (the roper's rope, s.pulled)
export const pinsDown = (z) => z.ztype === ZTYPE.LEAPER || z.ztype === ZTYPE.CRAWLER;

// how far above its prey's feet a pounce comes down: a crawler goes for the face, a leaper for the chest
export function leapAim(z) {
  return z.ztype === ZTYPE.CRAWLER ? LATCH_AIM : LEAP_AIM;
}

export const methods = {
  // nobody else up and about within LONE_NEAR m of this survivor, on their level (the downed cover nobody)
  alone(h, humans) {
    const g = this.g;
    const s = h.state;
    for (const o of humans) {
      if (o === h || o.downed || g.safe(o) || !!o.under !== !!h.under) continue;
      if (Math.hypot(o.state.x - s.x, o.state.z - s.z) < LONE_NEAR) return false;
    }
    return true;
  },

  // A pinned survivor who has shoved the leaper (or clawed the crawler) all the way off (the simulation's s.shove,
  // Game.processInputs) throws it: it is flung back the way it faces, away from them, and is dazed for THROW_OFF_DAZE s
  // once it lands, long enough to get away. Returns the one thrown off (null: nothing was on them)
  throwOff(p) {
    const z = this.g.zombies.find((o) => o.id === p.pinnedBy && !o.dead);
    if (!z || z.state !== 3 || z.link !== p.id) return null;
    this.releaseLink(z);
    const s = p.state;
    const ax = z.x - s.x;
    const az = z.z - s.z;
    const l = Math.hypot(ax, az) || 1;
    z.vx = (ax / l) * 6;
    z.vz = (az / l) * 6;
    z.vy = 3.5;
    z.pounce = false;
    z.dazedT = THROW_OFF_DAZE;
    z.attackCd = Math.max(z.attackCd, THROW_OFF_DAZE);
    z.specialCd = Math.max(z.specialCd, 4);
    this.g.sound(SOUND.ZOMBIE_PAIN, z.x, z.y + 1, z.z, 30);
    return z;
  },

  // the leaper's arc from where it stands to (ax, ay, az) in T s, flown as special state 2 flies it (the same body,
  // resolveBody, and groundAt, which sets it down on whatever its feet come to): does anything stop it on the way?
  leapClear(z, ax, ay, az, T) {
    const w = this.g.world;
    const vx = (ax - z.x) / T;
    const vz = (az - z.z) / T;
    const G = leapG(z);
    const vy = (ay - z.y + 0.5 * G * T * T) / T;
    const n = Math.max(4, Math.ceil(T / 0.05));
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * T;
      _leap.x = z.x + vx * t;
      _leap.y = z.y + vy * t - 0.5 * G * t * t;
      _leap.z = z.z + vz * t;
      const px = _leap.x;
      const pz = _leap.z;
      const y = _leap.y;
      if (resolveBody(w, _leap, 0.35, 1.2, false) && Math.hypot(_leap.x - px, _leap.z - pz) > 0.01) return false;
      // ...or brings it down early, on the ground or on top of something (a barricade): it has to pass LEAP_OVER above
      // them, away from the first and last tenth of a second (the ground it leaves and the ground it lands on)
      if (t > 0.1 && t < T - 0.1 && groundAt(w, px, pz, y, 0.2, false) > y - LEAP_OVER) return false;
    }
    return true;
  },

  // a leaper in the air on a pounce twists towards its prey (LEAP_STEER): at the speed that would bring it down on
  // them, as far as that much twisting gets it
  leapSteer(z, s, dt) {
    const G = leapG(z);
    const disc = z.vy * z.vy + 2 * G * (z.y - (s.y + leapAim(z)));
    if (disc < 0) return;
    const left = (z.vy + Math.sqrt(disc)) / G;
    if (left < 0.05) return;
    let dvx = (s.x - z.x) / left - z.vx;
    let dvz = (s.z - z.z) / left - z.vz;
    const l = Math.hypot(dvx, dvz);
    const m = LEAP_STEER * dt;
    if (l > m) {
      dvx *= m / l;
      dvz *= m / l;
    }
    z.vx += dvx;
    z.vz += dvz;
    z.yaw = Math.atan2(-z.vx, -z.vz);
  },

  // a leaper coming down takes whoever is within reach of it (LEAP_PIN on the way down, LEAP_LAND as it lands)
  leapPin(z, reach) {
    const g = this.g;
    for (const h of this.humansCache) {
      const s = h.state;
      if (Math.hypot(s.x - z.x, s.z - z.z) < reach && Math.abs(s.y + 0.8 - z.y) < 1.6 && !s.pinned && !s.pulled && this.canReach(z, h)) {
        z.state = 3;
        z.pounce = false;
        z.glide = false;
        z.link = h.id;
        z.linkDmg = 0;
        z.linkT = 0;
        s.pinned = z.ztype === ZTYPE.CRAWLER ? PIN_FACE : 1; // (on the face: blind, but still on their feet)
        s.vx = s.vz = 0;
        h.pinnedBy = z.id;
        g.track?.grabbed(h, 'pinned');
        g.director?.grabbed(g, h);
        // (a crawler lands on the face and does no harm: being blind is the harm)
        if (z.ztype === ZTYPE.CRAWLER) {
          z.attackCd = z.def.latchRate;
          g.sound(SOUND.CRAWLER_CHITTER, z.x, z.y + 1, z.z, 40);
        } else {
          g.sound(SOUND.LEAPER_SCREECH, z.x, z.y + 1, z.z, 40);
          g.damagePlayer(h, 10, { kind: KILLER.ZOMBIE, ztype: z.ztype, x: z.x, z: z.z });
        }
        return true;
      }
    }
    return false;
  },
};

export const triggers = {
  [ZTYPE.LEAPER](z, target, tx, ty, tz, dist) {
    const def = z.def;
    if (z.specialCd <= 0 && z.los && dist < def.leapRange && dist > 3.5 && z.vy === 0) {
      this.windup(z, 0.5, 2, SOUND.LEAPER_SCREECH);
      return true;
    }
    return false;
  },
};

export const acts = {
  2(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    // leap: at where its prey will be when it comes down, on an arc raised until it clears whatever stands in
    // between (LEAP_*); with no arc that clears it, the lowest one, which runs into it
    if (!target) return;
    const s = target.state;
    const up = leapAim(z);
    const flight = z.ztype === ZTYPE.CRAWLER ? CRAWLER_FLIGHT : 1;
    const T0 = (z.glide ? Math.min(GLIDE_TMAX, GLIDE_T0 + GLIDE_TK * Math.hypot(dist, z.y - s.y)) : Math.max(LEAP_TMIN, Math.min(LEAP_TMAX, LEAP_T0 + LEAP_TK * dist))) / flight;
    const aim = (T) => {
      const k = LEAP_LEAD * T * Math.min(1, LEAP_LEAD_MAX / (Math.hypot(s.vx, s.vz) * LEAP_LEAD * T || 1));
      _leap.x = s.x + s.vx * k;
      _leap.z = s.z + s.vz * k;
    };
    let T = T0;
    for (let k = 0; k < 4; k++) {
      aim(T0 + k * LEAP_RAISE / flight);
      if (this.leapClear(z, _leap.x, s.y + up, _leap.z, T0 + k * LEAP_RAISE / flight)) {
        T = T0 + k * LEAP_RAISE / flight;
        break;
      }
    }
    aim(T);
    z.vx = (_leap.x - z.x) / T;
    z.vz = (_leap.z - z.z) / T;
    z.vy = (s.y + up - z.y + 0.5 * leapG(z) * T * T) / T;
    z.state = 2;
    z.pounce = true;
    z.anim = ZANIM.AIRBORNE;
    z.specialCd = 5 + g.rng() * 3;
    g.sound(SOUND.LEAP, z.x, z.y + def.headY, z.z, z.ztype === ZTYPE.CRAWLER ? 18 : 30);
  },
};

export const states = {
  // on them, pinning them down (a crawler: on their face)
  3(z, dt, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const t = z.ztype;
    // pinning
    const p = g.players.get(z.link);
    if (!p || !p.alive || p.zombie) {
      this.releaseLink(z);
      return true;
    }
    const s = p.state;
    z.linkT += dt;
    // on them, face to face: further off the further they have shoved it (s.shove, the simulation's). A crawler is
    // on their face itself, wrapped round their head (the client stands it up against it: entities.js)
    const latch = t === ZTYPE.CRAWLER;
    const off = (latch ? LATCH_NEAR : PIN_NEAR) + PIN_SHOVED * s.shove;
    z.x = s.x - Math.sin(s.yaw) * off;
    z.z = s.z - Math.cos(s.yaw) * off;
    z.y = s.y + (latch ? (s.crouch ? EYE_HEIGHT_CROUCH : EYE_HEIGHT) - LATCH_DROP : 0);
    z.yaw = s.yaw + Math.PI;
    z.anim = ZANIM.ATTACK;
    z.animT = 0.2;
    s.pinned = latch ? PIN_FACE : 1;
    if (z.attackCd <= 0) {
      // (a crawler only nibbles: latchDmg every latchRate s, a little at a time while the rest of the dead come for them)
      z.attackCd = latch ? def.latchRate : 0.45;
      if (latch) {
        g.damagePlayer(p, def.latchDmg * (1 + 0.05 * g.day), { kind: KILLER.ZOMBIE, ztype: t, x: z.x, z: z.z });
        if (g.rng() < 0.3) g.sound(SOUND.CRAWLER_CHITTER, z.x, z.y, z.z, 25);
      } else {
        g.damagePlayer(p, 5.5 * (1 + 0.05 * g.day), { kind: KILLER.ZOMBIE, ztype: t, x: z.x, z: z.z });
        g.impact(IMPACT.BLOOD, s.x, s.y + 1, s.z);
      }
    }
    if (z.linkT > (latch ? def.latchMax : 5) || z.linkDmg > z.maxHp * 0.45) this.releaseLink(z);
    return true;
  },
};
