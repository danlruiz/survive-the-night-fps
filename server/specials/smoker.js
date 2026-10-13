// The smoker (ZTYPE.SMOKER): it breathes out a cloud that hides the dead coming on through it
import { ZTYPE, SOUND, AREA } from '../../shared/defs.js';

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
