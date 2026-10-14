// The smoker (ZTYPE.SMOKER): it breathes out a cloud that hides the dead coming on through it
import { ZTYPE, ZOMBIE_DEFS, SOUND, AREA } from '../../shared/defs.js';

export const methods = {
  // Is (x, z) in the survivors' base: baseCount or more of the pieces they built within baseRange m (ZOMBIE_DEFS
  // SMOKER)? (Traps count: they are built where the dead come at the base)
  inBase(x, z) {
    const g = this.g;
    const def = ZOMBIE_DEFS[ZTYPE.SMOKER];
    let n = 0;
    for (const s of g.structures) {
      if (!s || s.removed || (s.x - x) ** 2 + (s.z - z) ** 2 > def.baseRange * def.baseRange) continue;
      if (++n >= def.baseCount) return true;
    }
    return false;
  },
};

export const triggers = {
  [ZTYPE.SMOKER](z, target, tx, ty, tz, dist) {
    const def = z.def;
    // it needs no line to them: it smokes out the ground between, and the dead come on through it
    if (z.specialCd <= 0 && dist < def.smokeRange && Math.abs(ty - z.y) < 4) {
      this.windup(z, 0.8, 13, SOUND.SMOKER_HISS);
      return true;
    }
    return false;
  },
};

export const acts = {
  13(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const c = g.combat;
    // a smoker breathes out its cloud, where it stands
    c.spawnArea(AREA.SMOKE, z.x, z.y, z.z, def.smokeRadius, def.smokeLife);
    z.specialCd = def.smokeRate + g.rng() * 4;
  },
};

export const deaths = {
  // its last breath: one more cloud, and among what the survivors built, one that fills the base
  [ZTYPE.SMOKER](z) {
    const d = this.inBase(z.x, z.z) ? z.def.baseSmoke : z.def.deathSmoke;
    this.g.combat.spawnArea(AREA.SMOKE, z.x, z.y, z.z, d.radius, d.life);
  },
};
