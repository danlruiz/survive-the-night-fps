// The roper (ZTYPE.ROPER): it shoots its rope at a survivor and hauls them in
import { ZTYPE, ZANIM, SOUND, KILLER } from '../../shared/defs.js';

export const triggers = {
  [ZTYPE.ROPER](z, target, tx, ty, tz, dist) {
    const def = z.def;
    if (z.specialCd <= 0 && z.los && dist < def.ropeRange && dist > 5 && !target.state.pulled && !target.state.pinned) {
      this.windup(z, 0.7, 3, SOUND.ROPER_SHOOT);
      return true;
    }
    return false;
  },
};

export const acts = {
  3(z, target, tx, ty, tz, dist) {
    const c = this.g.combat;
    // rope
    if (!target) return;
    const s = target.state;
    c.rope(z, s.x, s.y + 1.2, s.z, target.id);
    z.state = 4;
    z.stateT = (dist + 3) / 30 + 0.2;
    z.specialCd = 4;
  },
};

export const states = {
  4(z, dt, target, tx, ty, tz, dist) {
    // rope in flight - stand and wait
    z.anim = ZANIM.SPECIAL;
    this.faceTarget(z, dt, target, tx, tz);
    this.holdStill(z, dt);
    z.stateT -= dt;
    if (z.stateT <= 0) z.state = 0;
    return true;
  },
  5(z, dt, target, tx, ty, tz, dist) {
    const g = this.g;
    const t = z.ztype;
    // pulling a victim
    const p = g.players.get(z.link);
    if (!p || !p.alive || p.zombie) {
      this.releaseLink(z);
      return true;
    }
    const s = p.state;
    z.linkT += dt;
    z.anim = ZANIM.SPECIAL;
    this.faceTarget(z, dt, target, tx, tz);
    this.holdStill(z, dt);
    s.pulled = 1;
    s.pullX = z.x;
    s.pullY = z.y;
    s.pullZ = z.z;
    const d = Math.hypot(s.x - z.x, s.z - z.z);
    if (d < 2 && z.attackCd <= 0 && this.canReach(z, p)) {
      z.attackCd = 0.5;
      g.damagePlayer(p, 6 * (1 + 0.05 * g.day), { kind: KILLER.ZOMBIE, ztype: t, x: z.x, z: z.z });
    }
    if (z.losT <= 0) {
      z.losT = 0.3;
      z.los = this.hasLOS(z, s.x, s.y + 1.2, s.z, d);
      if (!z.los) z.linkT += 3;
    }
    if (z.linkT > 9 || z.linkDmg > 55) this.releaseLink(z);
    return true;
  },
};
