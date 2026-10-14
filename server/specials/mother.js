// The Mother (ZTYPE.MOTHER): one walker in twenty is her. Shot in the belly, it tears open and her brood crawls out of
// it after whoever did it; her head, her legs or her back and nothing comes out
import { LEG_ZONE } from '../../shared/constants.js';
import { ZTYPE, IMPACT } from '../../shared/defs.js';
import { ENT } from '../../shared/protocol.js';
import { mulberry32 } from '../../shared/rng.js';

const MOTHER_ODDS = 0.05; // one walker in twenty spawns as a Mother (rollMother)
const MOTHER_SEED = 0x307e4; // (her roll's own stream, from the game's seed: motherStream)
const BROOD_AT = 0.8; // m in front of her a baby comes out
const BROOD_AGGRO = 30; // s a baby stays set on whoever burst her

// The Mother's roll has its own stream (Zombies.motherRng, made again with each world): nothing else the game draws
// moves for it
export const motherStream = (seed) => mulberry32((seed ^ MOTHER_SEED) >>> 0);

export const methods = {
  // the kind a zombie about to spawn as `type` comes as: one walker in twenty is a Mother. An admin's /spawn (force)
  // is exactly what it asked for
  rollMother(type, opts) {
    return type === ZTYPE.WALKER && !opts.force && this.motherRng() < MOTHER_ODDS ? ZTYPE.MOTHER : type;
  },

  // A shot (or anything else, by) tears a Mother's belly open: it shows torn (ZSTATUS.BURST) for as long as her body
  // lies there, and her brood crawls out of it in front of her and comes for whoever did it. Once only. Returns the
  // babies.
  burstBelly(z, by, dirX = 0, dirZ = 0) {
    const g = this.g;
    if (z.burst || z.ztype !== ZTYPE.MOTHER) return [];
    z.burst = true;
    g.impact(IMPACT.BLOOD, z.x, z.y + z.def.height * 0.55, z.z, -dirX, 0.3, -dirZ);
    const babies = [];
    const def = z.def;
    for (let i = 0; i < def.brood; i++) {
      // out of the front of her, each flung off to its own side (broodSpread rad off the way she faces) and tumbling on
      // out that way (broodKick m/s, gone in a few ticks) before it turns on whoever shot her: they come at you apart
      const a = z.yaw + (def.brood > 1 ? (i / (def.brood - 1) - 0.5) * 2 * def.broodSpread : 0);
      const fx = -Math.sin(a), fz = -Math.cos(a);
      const b = this.spawn(ZTYPE.BABY, z.x + fx * BROOD_AT, z.z + fz * BROOD_AT, { horde: z.horde, y: z.under ? z.y : undefined, den: z.den, hpMul: z.horde ? g.hordeHpMul || 1 : 1 });
      if (!b) continue;
      b.yaw = a;
      b.kx = fx * def.broodKick;
      b.kz = fz * def.broodKick;
      b.under = z.under;
      if (by && by.kind === ENT.PLAYER) {
        b.target = by.id;
        b.aggroId = by.id;
        b.aggroT = BROOD_AGGRO;
      }
      babies.push(b);
    }
    if (babies.length) g.globalDirty = true;
    return babies;
  },
};

export const spots = {
  // her belly: her front, above the legs (LEG_ZONE) and under bellyTop of her height, while it is still whole
  [ZTYPE.MOTHER]: {
    at(z, pos, x, y, zz) {
      if (z.burst || z.legs === 3) return false;
      const h = (y - pos.y) / z.def.height;
      if (h < LEG_ZONE || h > z.def.bellyTop) return false;
      // (her front: the side she faces, -sin / -cos of her yaw)
      return -(x - pos.x) * Math.sin(z.yaw) - (zz - pos.z) * Math.cos(z.yaw) > 0;
    },
    struck(z, by, dirX, dirZ) {
      this.burstBelly(z, by, dirX, dirZ);
    },
  },
};
