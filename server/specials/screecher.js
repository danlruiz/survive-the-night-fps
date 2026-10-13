// The screecher (ZTYPE.SCREECHER): it stops where it sees a survivor and screams, and a horde comes for them
import { ZTYPE, SOUND, EVT } from '../../shared/defs.js';
import { SPAWN_SPREAD } from '../spawns.js';

// The screecher's scream (act 14, screech). It calls def.screamHorde (+ def.screamHordeEach a survivor past
// the first, SCREECH_HORDE_MAX at most) of the dead: SCREECH_RUNNERS of them runners, the rest walkers, coming out of
// the dark in groups of SCREECH_GROUP from SCREECH_SPAWN_MIN-MAX m round whoever it screamed at, and set on them for
// SCREECH_AGGRO s. Never past SCREECH_HORDE_ALIVE of the horde alive at once, nor SCREECH_ALIVE_MAX of the dead in all
// (a day's valley alone can hold more than the 120 of MAX_ZOMBIES_ALIVE in game.js, which only holds back the night's
// waves). The dead within SCREECH_LOUD m that have nobody to chase come too (noise)
const SCREECH_HORDE_MAX = 14;
const SCREECH_RUNNERS = 0.6;
const SCREECH_GROUP = 4;
const SCREECH_SPAWN_MIN = 40;
const SCREECH_SPAWN_MAX = 60;
const SCREECH_AGGRO = 20;
const SCREECH_HORDE_ALIVE = 100;
const SCREECH_ALIVE_MAX = 200;
const SCREECH_LOUD = 90;
// ...and a survivor within EARS_RANGE m of it claps both hands over their ears: no shot, swing or throw for EARS_T s
// (EARS_T_MIN at the edge of that range), though they can still walk (s.ears, shared/playersim.js)
const EARS_RANGE = 10;
const EARS_T = 3;
const EARS_T_MIN = 1.5;

export const methods = {
  // The screecher screams (SCREECH_*): the dead it calls come running at `target` (whoever it screamed at; null: they
  // hunt as the horde does), the dead about that heard it come over, and each survivor within def.ringRange m is told
  // their ears ring (EVT.SCREECH: the nearer, the longer, def.ringT s at most; the client stops it when the screecher
  // dies). Returns how many of the dead it called up.
  screech(z, target) {
    const g = this.g;
    const def = z.def;
    const humans = this.humansCache;
    let n = Math.min(SCREECH_HORDE_MAX, def.screamHorde + def.screamHordeEach * Math.max(0, humans.length - 1));
    n = Math.min(n, SCREECH_HORDE_ALIVE - g.hordeAlive(), SCREECH_ALIVE_MAX - g.zombies.length);
    let called = 0;
    const at = target ? target.state : z;
    while (n > 0 && humans.length) {
      const sp = this.pickSpawnAround(at.x, at.z, humans, SCREECH_SPAWN_MIN, SCREECH_SPAWN_MAX);
      if (!sp) break;
      const k = Math.min(n, SCREECH_GROUP);
      for (let i = 0; i < k; i++) {
        const type = g.rng() < SCREECH_RUNNERS ? ZTYPE.RUNNER : ZTYPE.WALKER;
        const e = this.spawn(type, sp.x + (g.rng() - 0.5) * 2 * SPAWN_SPREAD, sp.z + (g.rng() - 0.5) * 2 * SPAWN_SPREAD, { horde: true, hpMul: g.hordeHpMul || 1 });
        if (!e) continue;
        called++;
        if (target) {
          e.target = target.id;
          e.aggroId = target.id;
          e.aggroT = SCREECH_AGGRO;
        }
      }
      n -= k;
    }
    if (called) g.globalDirty = true;
    this.noise(z.x, z.z, SCREECH_LOUD, z.y);
    for (const h of humans) {
      const s = h.state;
      const d = Math.hypot(s.x - z.x, s.y - z.y, s.z - z.z);
      if (d >= def.ringRange) continue;
      if (d < EARS_RANGE && !h.downed && !(s.drive || s.pass)) s.ears = Math.max(s.ears, EARS_T - (EARS_T - EARS_T_MIN) * (d / EARS_RANGE));
      const secs = def.ringT * (1 - 0.5 * (d / def.ringRange));
      g.emit(
        (w) => {
          w.u8(EVT.SCREECH);
          w.u16(z.id);
          w.u8(Math.round(secs * 10));
        },
        { to: h.id },
      );
    }
    return called;
  },
};

export const triggers = {
  [ZTYPE.SCREECHER](z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    // it stops where it sees a survivor and rears back to scream: the scream is heard well before the horde comes
    if (z.specialCd <= 0 && z.los && dist < def.screamRange && Math.abs(ty - z.y) < 6) {
      this.windup(z, def.screamWindup, 14, null);
      g.sound(SOUND.SCREECHER_SCREAM, z.x, z.y + def.headY, z.z, 300);
      return true;
    }
    return false;
  },
};

export const acts = {
  14(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    // the screecher's scream: a horde, the dead about, and ringing ears (screech)
    this.screech(z, target);
    z.specialCd = def.screamRate * (1 + 0.25 * g.rng());
  },
};
