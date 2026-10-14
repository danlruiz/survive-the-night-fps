// Day and night: the clock (updatePhase), nightfall with its waves and its boss, dawn with what it burns, returns
// and restocks, and how a run ends (victory, gameOver, checkAllDead). The waves' make-up is server/spawns.js's and
// the pacing server/director.js's; the final stand at the car is server/game/escape.js.
import { PHASE, dayLength, NIGHT_LENGTH, DUSK_WARNING, NIGHT_WAVES, WAVE_TIMES, TANK_BOSS_HP, BOSS_WAVE, BOSS_HP_PER_PLAYER, BOSS_HP_PER_NIGHT, MOON, BLOOD_MOON_HORDE, ESCAPE_RADIUS, GAME_OVER_DELAY, HORDE_SPAWN_MIN, HORDE_SPAWN_MAX } from '../../shared/constants.js';
import { ZTYPE, CONT_DEFS, SOUND, EVT, NOTIFY, KILLER } from '../../shared/defs.js';
import { ENT } from '../../shared/protocol.js';
import { XP, XPS } from '../../shared/progress.js';
import { WORLD, ARRIVAL_DAY, MAINLAND_DAY_MORE, TAKEOFF_TIME } from '../../shared/acts.js';
import { regrowTrees } from '../../shared/felling.js';
import { supplyHelpLevel, SUPPLY_HELP } from '../../shared/supplyhelp.js';
import { nightBoss, hasJoined } from '../../shared/nights.js';
import { nightWaves } from '../spawns.js';
import * as Director from '../director.js';

// the most of the dead a game has at once (game.zombies): what would spawn past it waits, or by day idle wanderers far
// from everyone make room (makeZombieRoom). (server/cemetery.js keeps a copy of it)
export const MAX_ZOMBIES_ALIVE = 120;

export const methods = {
  // how long today is, horn included: the first two days are long, then they shorten (dayLength).
  // A pinned length (DAY_SECONDS, the tests) is not stretched. The horn itself stays a minute either way.
  // (on the mainland every walk is twice as far: the day the team arrives is long, the rest a little longer than
  // the island's - acts.js - and the difficulty stretches those as it does the island's)
  get dayLen() {
    if (this.dayLenOverride) return this.dayLenOverride;
    if (this.act === WORLD.MAINLAND) return Math.round((this.checkpoint && this.day === this.checkpoint.day ? ARRIVAL_DAY : dayLength(this.day) + MAINLAND_DAY_MORE) * this.diff.day);
    return Math.round(dayLength(this.day) * this.diff.day);
  },

  scheduleSupplyDrops() {
    const len = this.dayLen;
    const n = this.day >= 2 ? 2 : 1;
    this.supplyAt = [];
    for (let i = 0; i < n; i++) this.supplyAt.push(len * (0.2 + (i + this.rng()) * (0.6 / n))); // timeLeft thresholds
  },

  // How many of the dead night n brings for this many survivors. The final stand is sized from the same number
  // (finalStandSize), so a change here moves both.
  hordeSize(n, humans) {
    const base = Math.round((10 + 6 * n + 1.3 * n * n) * (0.6 + 0.4 * humans));
    return Math.max(NIGHT_WAVES, Math.round(base * this.diff.zombies));
  },

  // has kind t of the dead joined the run yet (today, and tonight): walkers and runners from the start, then one more
  // special a night in an order drawn from the seed (shared/nights.js joinNight)
  joined(t) {
    return hasJoined(this.seed, t, this.day, this.act);
  },

  // Night N: the horde comes in waves to wherever the survivors are. Bigger and tougher every night, with one new kind
  // of the dead in it (shared/nights.js joinNight: drawn from the seed) and a boss with the second wave.
  startNight() {
    this.phase = PHASE.NIGHT;
    this.timeLeft = this.nightLen;
    // (no horn - a skip to night, the tests - no blood moon either, and no draw on the stream: a struggling team still gets its clear moon)
    if (!this.warned) this.moon = Director.struggling(this) ? MOON.CLEAR : MOON.NORMAL;
    this.warned = false;
    this.nightStats = { kills: 0, structLost: 0, downs: 0, deaths: 0, revives: 0 };
    this.pace = Director.newPace();
    for (const p of this.players.values()) p.intensity = 0;
    this.phaseXp(false);
    const n = this.day;
    const humans = Math.max(1, this.humanCount());
    // a blood moon brings more of them (and the director gives no breathers: Director.paceLimits)
    const total = Math.round(this.hordeSize(n, humans) * (this.moon === MOON.BLOOD ? BLOOD_MOON_HORDE : 1));
    const scale = this.nightLen / NIGHT_LENGTH;
    // what the waves are made of: tonight's theme, the kinds that have joined, the new one (server/spawns.js)
    this.waves = nightWaves(this, n, humans, total);
    this.shadeWarned = false;
    this.wave = 0;
    this.hordeHpMul = 1 + 0.1 * (n - 1) + 0.12 * (humans - 1);
    this.bossPending = null;
    // a boss comes in with the second wave: early enough in the night that the survivors have to deal with it, and
    // can - at dawn the sun takes whatever is left of it, and what it carried (Combat.killZombie)
    const bossT = WAVE_TIMES[BOSS_WAVE] * scale + 8;
    // every night has one: The Brute on the first, then one drawn from the seed (BOSS_POOL)
    this.bossPending = { types: [nightBoss(this.seed, n, this.act)], t: bossT };
    this.notify(NOTIFY.NIGHT_FALLS, n);
    this.track.nightfall();
    this.ach.nightfall();
    this.globalDirty = true;
    // day wanderers near the survivors join the hunt; the rest drift off into the dark
    const hs = this.humans();
    for (const z of [...this.zombies]) {
      if (z.dead) continue;
      let md = Infinity;
      for (const h of hs) md = Math.min(md, Math.hypot(h.state.x - z.x, h.state.z - z.z));
      if (md < 95 || z.boss) z.horde = true;
      else {
        this._listRemove(this.zombies, z);
        this.removeEntity(z);
      }
    }
  },

  startDay() {
    this.phase = PHASE.DAY;
    const night = this.day;
    this.day++;
    this.timeLeft = this.dayLen;
    this.warned = false;
    this.waves = [];
    this.wave = 0;
    this.bossPending = null;
    this.lastMoon = this.moon;
    this.moon = MOON.NORMAL;
    this.scheduleSupplyDrops();
    const st = this.nightStats;
    this.emit((w) => {
      w.u8(EVT.SUMMARY);
      w.u8(night);
      w.u16(Math.min(65535, st.kills));
      w.u8(Math.min(255, st.structLost));
      w.u8(Math.min(255, st.downs));
      w.u8(Math.min(255, st.deaths));
      w.u8(Math.min(255, st.revives));
    });
    this.notify(NOTIFY.DAWN, this.day);
    this.sound(SOUND.DAWN, 0, 0, 0, 0);
    // the night goes on the record of everyone who saw it through (the dead come back below: it was not theirs)
    const survivors = this.humans();
    this.credit(survivors, 'nights');
    for (const p of survivors) this.loadouts.nightReward(p, night);
    this.phaseXp(true, night); // (...and so does its XP)
    this.track.dawn(night);
    this.ach.dawn();
    // horde burns in the sunlight (what is down in the mine burns when it comes up into it: Zombies.updateOne)
    for (const z of this.zombies) {
      if (z.dead || !(z.horde || z.def.flying)) continue;
      if (z.under || this.zm.inDark(z)) z.spared = true; // (nor into the boarded-up wards of the clinic)
      else z.burning = 0.5 + this.rng() * 5;
    }
    // ...and the mine fills up again with the ones that live down there
    this.zm.stockMine(this.humans());
    this.zm.wards.stock(this.humans());
    this.cemetery.dawn();
    // ...and deer walk in from the rim for the ones that were hunted
    this.dm.dawn(this.humans());
    // ...and burns the sickness out of whoever died since the last sunrise
    if (this.dawnReturn) this.returnFallen();
    // the valley restocks a little: some searched containers are refilled, trees & wrecks regrow
    for (const c of this.caches) {
      if (c.state === 1 && !CONT_DEFS[c.ctype].once && this.rng() < 0.4) {
        c.state = 0;
        this.armTrunk(c);
      }
    }
    this.gather.clear(); // (and with it what every wreck took: they are whole again, and quiet)
    this.ringing.clear();
    regrowTrees(this.world);
    this.emit((w) => w.u8(EVT.REGROWN));
    this.globalDirty = true;
  },

  victory() {
    this.track.finish('victory'); // (first: who is where as the car leaves)
    this.ach.victory();
    this.cards.runEnded(); // (the matches being played are void: the bets go back)
    this.phase = PHASE.VICTORY;
    this.restartT = GAME_OVER_DELAY + 6 + (this.act === WORLD.MAINLAND ? TAKEOFF_TIME : 0); // (the take-off is watched first)
    this.checkpoint = null;
    this.escape.active = false;
    this.credit(this.players.values(), 'wins'); // the run is the team's: won by everybody in it, the turned and the left-behind too
    // ...but the XP for the escape is for whoever is in the car (as the end screen tells it: ESCAPE_RADIUS)
    const car = this.world.car;
    for (const p of this.players.values()) {
      const aboard = p.alive && !p.zombie && Math.hypot(p.state.x - car.x, p.state.z - car.z) <= ESCAPE_RADIUS;
      this.award(p, XPS.escape, aboard ? XP.escape : XP.team);
      this.loadouts.escapeReward(p, aboard, `victory:${this.worldPlayed || 0}:${p.id}`);
    }
    this.notify(NOTIFY.VICTORY, this.day);
    this.sound(SOUND.CAR_START, this.world.car.x, 0.5, this.world.car.z, 0);
    this.globalDirty = true;
    this.log('victory!');
  },

  gameOver() {
    this.track.finish('wipe');
    this.cards.runEnded();
    this.phase = PHASE.GAMEOVER;
    this.restartT = GAME_OVER_DELAY;
    this.escape.active = false;
    this.notify(NOTIFY.GAME_OVER, this.day);
    this.globalDirty = true;
    this.log('game over on day', this.day);
  },

  checkAllDead() {
    if (this.phase !== PHASE.DAY && this.phase !== PHASE.NIGHT) return;
    if (this.players.size === 0) return;
    for (const p of this.players.values()) if (p.alive && !p.zombie && !p.downed) return;
    // nobody left standing to revive the fallen
    for (const p of this.players.values()) if (p.alive && !p.zombie && p.downed) this.killPlayer(p, p.lastSrc || { kind: KILLER.WORLD }, true);
    this.gameOver();
  },

  // A team that has found no supply by the times in SUPPLY_HELP_AT gets a little more help at each (shared/supplyhelp.js):
  // the rumour narrowed, then the spot on the compass, then a voice on the radio. Finding one takes it all away.
  updateSupplyHelp(dt) {
    this.supplyClock += dt;
    const lvl = supplyHelpLevel(this.supplyClock, this.supplyFound !== 0 || this.supplies.some((n) => n > 0));
    if (lvl === this.supplyHelp) return;
    if (lvl === SUPPLY_HELP.RADIO) {
      // the one nearest to a survivor
      let best = -1;
      let bestD = Infinity;
      this.supplyHintSpots.forEach((si, k) => {
        const sp = this.world.partSpots[si];
        if (!sp || this.supplyFound & (1 << k)) return;
        for (const p of this.players.values()) {
          if (!p.alive || p.zombie) continue;
          const d = Math.hypot(p.state.x - sp.x, p.state.z - sp.z);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
      });
      if (best >= 0) this.notify(NOTIFY.SUPPLY_HINT, best);
    }
    this.supplyHelp = lvl;
    this.globalDirty = true;
  },

  hordeAlive() {
    let n = 0;
    for (const z of this.zombies) if (z.horde && !z.dead) n++;
    return n;
  },

  spawnHordeGroup(type0Queue, anchor) {
    const humans = this.humans();
    if (!humans.length) return 0;
    const alive = this.zombies.length;
    if (alive >= MAX_ZOMBIES_ALIVE) return 0;
    // a group led by dogs comes out of the woods
    const dogs = type0Queue[type0Queue.length - 1] === ZTYPE.DOG;
    const sp = anchor ? this.zm.pickSpawnAround(anchor.x, anchor.z, humans, HORDE_SPAWN_MIN, HORDE_SPAWN_MAX, dogs) : this.zm.pickHordeSpawn(humans, dogs);
    if (!sp) return 0;
    const group = 3 + Math.floor(this.rng() * 3);
    const pack = this.zm.newPack(); // the group's dogs hunt as one pack
    let n = 0;
    for (let i = 0; i < group && type0Queue.length && alive + i < MAX_ZOMBIES_ALIVE; i++) {
      const type = type0Queue.pop();
      const z = this.zm.spawn(type, sp.x + (this.rng() - 0.5) * 8, sp.z + (this.rng() - 0.5) * 8, { horde: true, hpMul: this.hordeHpMul, pack });
      if (!z) type0Queue.push(type);
      else {
        n++;
        if (type === ZTYPE.SHADE && !this.shadeWarned) {
          this.shadeWarned = true;
          this.notify(NOTIFY.SHADE, 0);
        }
      }
    }
    if (n) this.globalDirty = true;
    return n;
  },

  updatePhase(dt) {
    if (this.phase === PHASE.GAMEOVER || this.phase === PHASE.VICTORY) {
      if (this.takeoffHold) return; // (/takeoff hold: look-dev)
      this.restartT -= dt;
      if (this.restartT <= 0) {
        if (this.phase === PHASE.GAMEOVER && this.atBridge()) this.restartFromBridge();
        else this.startGame();
      }
      return;
    }
    // the final stand at the car pauses the day/night clock
    if (this.escape.active) return this.updateEscape(dt);
    const prevSec = Math.ceil(this.timeLeft);
    this.timeLeft -= dt;
    if (Math.ceil(this.timeLeft) !== prevSec && prevSec % 5 === 0) this.globalDirty = true;
    if (this.phase === PHASE.DAY) {
      if (!this.warned && this.timeLeft <= DUSK_WARNING) {
        this.warned = true;
        // tonight's moon, read off how the team is doing (Director.pickMoon): the clients show it from now to dawn
        this.moon = Director.pickMoon(this, this.day, this.rng);
        this.globalDirty = true;
        this.notify(NOTIFY.HORDE_SOON, this.day);
        this.sound(SOUND.HORDE_HORN, 0, 0, 0, 0);
      }
      for (let i = this.supplyAt.length - 1; i >= 0; i--) {
        if (this.timeLeft <= this.supplyAt[i]) {
          this.supplyAt.splice(i, 1);
          this.spawnSupplyDrop();
        }
      }
      if (this.timeLeft <= 0) this.startNight();
    } else if (this.phase === PHASE.NIGHT) {
      const elapsed = this.nightLen - this.timeLeft;
      const held = Director.tick(this, dt); // (a breather: the queues wait)
      for (let k = 0; k < this.waves.length; k++) {
        const wv = this.waves[k];
        if (!wv.started && elapsed >= wv.start) {
          wv.started = true;
          this.wave = k + 1;
          if (k > 0) this.notify(NOTIFY.WAVE, k + 1);
          this.cemetery.wave(wv); // (with a survivor near St. Agnes Cemetery, part of it comes up out of the graves)
          this.globalDirty = true;
        }
        if (!wv.started || !wv.queue.length || held) continue;
        wv.spawnT -= dt;
        if (wv.spawnT <= 0) {
          wv.spawnT = wv.interval * (0.7 + this.rng() * 0.6);
          this.spawnHordeGroup(wv.queue);
        }
      }
      if (this.bossPending) {
        this.bossPending.t -= dt;
        if (this.bossPending.t <= 0) this.spawnBosses(this.bossPending.types);
      }
      if (this.timeLeft <= 0) this.startDay();
    }
    this.trackBoss();
  },

  spawnBosses(types, anchor) {
    const humans = this.humans();
    const sp = anchor ? this.zm.pickSpawnAround(anchor.x, anchor.z, humans) : this.zm.pickHordeSpawn(humans);
    if (!sp) return;
    for (const type of types) {
      const hpMul = (1 + BOSS_HP_PER_PLAYER * (Math.max(1, this.humanCount()) - 1) + BOSS_HP_PER_NIGHT * (this.day - 1)) * (type === ZTYPE.TANK ? TANK_BOSS_HP : 1);
      const z = this.zm.spawn(type, sp.x, sp.z, { horde: true, hpMul, boss: true });
      if (z) {
        this.bossId = z.id;
        this.track.bossSpawn(z);
        this.notify(NOTIFY.BOSS, type);
        this.sound(type === ZTYPE.TANK ? SOUND.TANK_ROAR : SOUND.BOSS_ROAR, sp.x, 2, sp.z, 0);
      }
    }
    this.bossPending = null;
    this.globalDirty = true;
  },

  trackBoss() {
    if (this.bossId) {
      const b = this.ents[this.bossId];
      if (!b || b.kind !== ENT.ZOMBIE || b.dead) {
        this.bossId = 0;
        for (const z of this.zombies) if (z.boss && !z.dead) this.bossId = z.id;
        this.globalDirty = true;
      }
    }
  },
};
