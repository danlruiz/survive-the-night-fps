// The bosses' specials: The Brute's temper, The Bloater's bile, The Alpha's howl (it hunts as its dogs do: dog.js),
// The Abomination's slam and boulders, and The Hive Queen's acid and bats
import { ZTYPE, SOUND, PROJ, KILLER, EVT } from '../../shared/defs.js';
import { qpos } from '../../shared/protocol.js';
import { GRAV } from './util.js';
import { lungeTrigger } from './dog.js';

export const triggers = {
  [ZTYPE.BOSS_BRUTE](z, target, tx, ty, tz, dist) {
    const def = z.def;
    // badly hurt, it stops to roar, and comes on at a run from then on
    if (!z.enraged && z.hp <= z.maxHp * def.enrage) {
      this.windup(z, 1.2, 9, SOUND.BOSS_ROAR);
      return true;
    }
    return false;
  },
  [ZTYPE.BOSS_BLOATER](z, target, tx, ty, tz, dist) {
    const def = z.def;
    if (z.specialCd <= 0 && z.los && dist < def.spewRange && Math.abs(ty - z.y) < 3) {
      this.windup(z, 0.8, 11, SOUND.BOOMER_GURGLE);
      return true;
    }
    return false;
  },
  [ZTYPE.BOSS_ALPHA](z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    // it howls up dogs into its pack while it hunts, then hunts as they do
    if (z.summonCd <= 0) {
      z.summonCd = def.summonRate;
      let pack = 0;
      for (const o of g.zombies) if (!o.dead && o !== z && o.pack === z.pack) pack++;
      if (pack < def.summonMax && g.zombies.length < 115) {
        z.howlN = Math.min(def.summon, def.summonMax - pack);
        this.windup(z, 1.0, 10, SOUND.DOG_HOWL);
        return true;
      }
    }
    return lungeTrigger.call(this, z, target, tx, ty, tz, dist);
  },
  [ZTYPE.BOSS_ABOMINATION](z, target, tx, ty, tz, dist) {
    if (z.specialCd <= 0 && dist < 7) {
      this.windup(z, 1.0, 5, SOUND.BOSS_ROAR);
      return true;
    }
    if (z.rockCd <= 0 && z.los && dist > 10 && dist < 48) {
      this.windup(z, 0.9, 6, null);
      return true;
    }
    return false;
  },
  [ZTYPE.BOSS_HIVEQUEEN](z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    if (z.specialCd <= 0 && z.los && dist < def.spitRange) {
      this.windup(z, 0.8, 7, SOUND.BOSS_ROAR);
      return true;
    }
    if (z.summonCd <= 0 && g.zombies.length < 125) {
      z.summonCd = 14;
      for (let i = 0; i < 3; i++) this.spawn(ZTYPE.BAT, z.x + (g.rng() - 0.5) * 3, z.z + (g.rng() - 0.5) * 3, { horde: true });
      g.sound(SOUND.BAT_SCREECH, z.x, z.y + 3, z.z, 60);
    }
    return false;
  },
};

export const acts = {
  5(z, target, tx, ty, tz, dist) {
    const g = this.g;
    // abomination ground slam
    g.sound(SOUND.SLAM, z.x, z.y, z.z, 150);
    g.emit(
      (w) => {
        w.u8(EVT.EXPLOSION);
        w.i16(qpos(z.x));
        w.i16(qpos(z.y));
        w.i16(qpos(z.z));
        w.u8(70);
        w.u8(1); // slam (dust, no fire)
      },
      { x: z.x, z: z.z, r: 200 },
    );
    for (const h of this.humansCache) {
      const s = h.state;
      const d = Math.hypot(s.x - z.x, s.z - z.z);
      if (d < 7.5 && Math.abs(s.y - z.y) < 3) {
        g.damagePlayer(h, 12 + 38 * (1 - d / 7.5), { kind: KILLER.ZOMBIE, ztype: z.ztype, x: z.x, z: z.z });
        this.knock(h, z.x, z.z, 12, 7, 0.6);
      }
    }
    for (const s of [...g.structures]) {
      const d = Math.hypot(s.x - z.x, s.z - z.z);
      if (d < 6.5) g.damageStructure(s, 450 * (1 - d / 8) * g.diff.hurt);
    }
    z.specialCd = 5 + g.rng() * 2;
  },
  6(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const c = g.combat;
    // boulder throw
    if (!target) return;
    const s = target.state;
    const T = Math.max(0.8, dist / 18);
    c.lob(PROJ.ROCK, z, z.x, z.y + 3.8, z.z, s.x + s.vx * T * 0.6, s.y, s.z + s.vz * T * 0.6, T, GRAV);
    z.rockCd = 6 + g.rng() * 2;
  },
  7(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const c = g.combat;
    // hive queen acid barrage
    if (!target) return;
    const s = target.state;
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.14;
      const dx = s.x - z.x;
      const dz = s.z - z.z;
      const rx = dx * Math.cos(a) - dz * Math.sin(a);
      const rz = dx * Math.sin(a) + dz * Math.cos(a);
      const T = Math.max(0.7, dist / 16) * (1 + Math.abs(i) * 0.05);
      c.lob(PROJ.ACID, z, z.x, z.y + def.headY, z.z, z.x + rx, s.y, z.z + rz, T, 12);
    }
    z.specialCd = def.spitRate + 2 + g.rng() * 2;
  },
  9(z, target, tx, ty, tz, dist) {
    // The Brute's temper
    z.enraged = true;
  },
  10(z, target, tx, ty, tz, dist) {
    const g = this.g;
    // The Alpha's howl: dogs come running out of the dark into its pack, from just out of the survivors' sight
    const n = z.howlN;
    const a = g.rng() * Math.PI * 2;
    const r = 9 + g.rng() * 5;
    const x = z.x + Math.sin(a) * r;
    const zz = z.z + Math.cos(a) * r;
    for (let i = 0; i < n; i++) {
      const d = this.spawn(ZTYPE.DOG, x + (g.rng() - 0.5) * 3, zz + (g.rng() - 0.5) * 3, { horde: true, pack: z.pack, hpMul: g.hordeHpMul || 1 });
      if (d) d.flank = (g.rng() - 0.5) * 1.5;
    }
  },
  11(z, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const c = g.combat;
    // The Bloater heaves bile: a wide, low fan of acid at whoever is in front of it
    if (!target) return;
    const s = target.state;
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.2 + (g.rng() - 0.5) * 0.08;
      const dx = s.x - z.x;
      const dz = s.z - z.z;
      const k = 0.8 + g.rng() * 0.45;
      const rx = (dx * Math.cos(a) - dz * Math.sin(a)) * k;
      const rz = (dx * Math.sin(a) + dz * Math.cos(a)) * k;
      c.lob(PROJ.ACID, z, z.x, z.y + def.headY - 0.4, z.z, z.x + rx, s.y, z.z + rz, Math.max(0.5, dist / 14), 12);
    }
    z.specialCd = def.spewRate + g.rng() * 2;
  },
};
