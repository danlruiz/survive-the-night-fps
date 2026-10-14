// The boomer (ZTYPE.BOOMER): it swells up and bursts beside a survivor, or against what holds it up
import { ZTYPE, SOUND, ZANIM } from '../../shared/defs.js';
import { ENT } from '../../shared/protocol.js';

// what its blast does to the dead near it and to what the survivors built (its blastDmg is what it does to them)
const BLAST_ZOMBIES = 80;
const BLAST_STRUCTURES = 260;

export const methods = {
  // it detonates near a survivor
  boomerNear(z, target, dist) {
    const g = this.g;
    if (z.ztype === ZTYPE.BOOMER && target && dist < 2.4 && z.state === 0) {
      z.state = 1;
      z.stateT = 0.55;
      z.stateAct = 99;
      z.anim = ZANIM.SPECIAL;
      g.sound(SOUND.BOOMER_GURGLE, z.x, z.y + 1.4, z.z, 30);
    }
  },

  // boomer: it also detonates against what the survivors built. It cannot claw through a structure (structDmg 0),
  // so brought to a stop by one with a survivor close behind it, it swells up and bursts there. blockStruct is only
  // ever a player-built piece, never the static world; the range keeps a fence across the map from spending it;
  // sliding along a fence toward its end is not being stopped. The longer windup is the survivors' cue to shoot
  // it (then the piece only takes the blast) or step back.
  boomerBreach(z, dt, dist, moveSpeed) {
    const g = this.g;
    const def = z.def;
    if (def.breachHold && z.state === 0) {
      const held = z.blockStruct && moveSpeed > 0 && dist < def.breachRange && Math.hypot(z.x - z.lastX, z.z - z.lastZ) < moveSpeed * dt * 0.5;
      if (held) z.breachT += dt;
      else z.breachT = Math.max(0, z.breachT - dt * 0.5);
      if (z.breachT >= def.breachHold) {
        z.breachT = 0;
        z.breachId = z.blockStruct;
        z.state = 1;
        z.stateT = def.breachWindup;
        z.stateAct = 99;
        z.anim = ZANIM.SPECIAL;
        g.sound(SOUND.BOOMER_GURGLE, z.x, z.y + 1.4, z.z, 30);
      }
    }
  },
};

export const acts = {
  99(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    // boomer detonation. Bursting against a structure, that piece takes the brunt: the blast alone falls off so
    // gently that a number big enough to open a wall would level its neighbours too
    const s = z.breachId ? g.ents[z.breachId] : null;
    if (s && s.kind === ENT.STRUCTURE && Math.hypot(s.x - z.x, s.z - z.z) < def.blastRadius) g.damageStructure(s, def.breachDmg * g.diff.hurt);
    g.combat.killZombie(z, null, { explode: true });
  },
};

// it bursts as it dies, however it dies: shot, or swollen up beside a survivor or against what they built (act 99)
export const bursts = [ZTYPE.BOOMER];

export const deaths = {
  // ...and the blast takes the survivors near it, the dead and what was built
  [ZTYPE.BOOMER](z) {
    const def = z.def;
    this.g.combat.explode(z.x, z.y + 1, z.z, def.blastRadius, { humans: def.blastDmg, zombies: BLAST_ZOMBIES, structures: BLAST_STRUCTURES, kind: 2, source: z });
  },
};
