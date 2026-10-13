// The Tank (ZTYPE.TANK): it charges in a straight line, through whatever the survivors built that breaks
import { ZTYPE, ZANIM, SOUND, KILLER, IMPACT } from '../../shared/defs.js';
import { resolveBody, groundAt, deepWaterAt, COL } from '../../shared/collision.js';

const _pos = { x: 0, y: 0, z: 0 };

export const triggers = {
  [ZTYPE.TANK](z, target, tx, ty, tz, dist) {
    if (z.specialCd <= 0 && z.los && dist > 7 && dist < 24) {
      this.windup(z, 0.9, 4, SOUND.TANK_ROAR);
      return true;
    }
    return false;
  },
};

export const acts = {
  4(z, target, tx, ty, tz, dist) {
    // tank charge
    if (!target) return;
    const l = Math.hypot(tx - z.x, tz - z.z) || 1;
    z.chargeX = (tx - z.x) / l;
    z.chargeZ = (tz - z.z) / l;
    z.chargeOn = target.id; // (who it was after, and whether it got anyone: an achievement for a miss)
    z.chargeHit = false;
    z.state = 6;
    z.stateT = 1.7;
  },
};

export const states = {
  6(z, dt, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const t = z.ztype;
    // tank charge
    z.stateT -= dt;
    z.anim = ZANIM.RUN;
    // the lake ahead and no deck over it: the charge pulls up at the edge instead of carrying it in
    if (deepWaterAt(g.world, z.x + z.chargeX * 10 * dt, z.z + z.chargeZ * 10 * dt, z.y, 0.2, false)) {
      z.chargeX = z.chargeZ = 0;
      z.stateT = 0;
    }
    _pos.x = z.x + z.chargeX * 10 * dt;
    _pos.y = z.y;
    _pos.z = z.z + z.chargeZ * 10 * dt;
    // the body it walks with (moveR / moveH): a charge at an open doorway carries on inside
    const hit = resolveBody(g.world, _pos, def.moveR ?? 0.65, def.moveH ?? 2.5, false);
    z.x = _pos.x;
    z.z = _pos.z;
    z.y = groundAt(g.world, z.x, z.z, z.y, 0.2, false);
    z.vx = z.chargeX * 10;
    z.vz = z.chargeZ * 10;
    let end = z.stateT <= 0;
    if (hit && hit.flags & COL.STRUCT) {
      const s = g.ents[hit.id];
      if (s) g.damageStructure(s, 700 * g.diff.hurt);
      g.sound(SOUND.SLAM, z.x, z.y, z.z, 60);
      // what the blow breaks (a barricade, door boards) it ploughs straight through; anything that holds stops it
      if (s && !s.removed) end = true;
    } else if (hit) end = true;
    for (const h of this.humansCache) {
      const s = h.state;
      if (Math.hypot(s.x - z.x, s.z - z.z) < 1.8 && Math.abs(s.y - z.y) < 2 && this.canReach(z, h)) {
        g.damagePlayer(h, 32, { kind: KILLER.ZOMBIE, ztype: t, x: z.x, z: z.z });
        g.impact(IMPACT.BLOOD, s.x, s.y + 1.2, s.z);
        g.sound(SOUND.MELEE_HIT, s.x, s.y + 1.2, s.z, 40);
        this.knock(h, z.x, z.z, 15, 6, 0.8);
        z.chargeHit = true;
        end = true;
      }
    }
    if (end) {
      if (!z.chargeHit && z.chargeOn) g.ach?.dodged(z, z.chargeOn);
      z.chargeOn = 0;
      z.state = 0;
      z.vx = z.vz = 0;
      z.specialCd = 8 + g.rng() * 4;
      // a charge that got nobody leaves it reeling (its weak window): sidestep it, then shoot
      if (!z.chargeHit) this.reel(z, def.chargeReel);
    }
    return true;
  },
};
