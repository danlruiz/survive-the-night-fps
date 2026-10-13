// The spitter (ZTYPE.SPITTER): it keeps its distance and lobs acid, which eats through barricades
import { ZTYPE, SOUND, PROJ } from '../../shared/defs.js';

export const triggers = {
  [ZTYPE.SPITTER](z, target, tx, ty, tz, dist) {
    const def = z.def;
    if (z.specialCd <= 0 && z.los && dist < def.spitRange && dist > 4) {
      this.windup(z, 0.6, 1, SOUND.SPITTER_SPIT);
      return true;
    }
    return false;
  },
};

export const acts = {
  1(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const c = g.combat;
    // spit acid
    if (!target) return;
    const s = target.state;
    const T = Math.max(0.6, dist / 15);
    c.lob(PROJ.ACID, z, z.x, z.y + def.headY, z.z, s.x + s.vx * T * 0.5, s.y + 0.3, s.z + s.vz * T * 0.5, T, 12);
    z.specialCd = def.spitRate + g.rng() * 2;
  },
};
