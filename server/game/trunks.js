// A car's boot (shared/trunk.js) and its alarm. The boot is forced open, not just searched: a longer hold, levered
// by what is in the hand, in heaves the others see and hear (pryOf, pryHeave). One car in ten is armed when it is
// set (armTrunk, at the start and when its boot is refilled at dawn): it blinks and chirps at a survivor who comes
// near (tellArmedTrunks), and forcing it calls a group of the dead in from behind them (triggerCarAlarm).
import { NOISE } from '../../shared/constants.js';
import { ZTYPE, CONT, SOUND, NOTIFY, HEARD } from '../../shared/defs.js';
import { ALARM_SAY, wreckOf } from '../../shared/wrecks.js';
import { PRY, pryWeapon, trunkCar, hasBootLid } from '../../shared/trunk.js';
import { currentWeapon } from '../../shared/playersim.js';
import { hash2 } from '../../shared/rng.js';
import { MAX_ZOMBIES_ALIVE } from './phases.js';

// A trunk's alarm is set when the car is (at the start, and again when the boot is refilled at dawn), not rolled when
// it comes open: an armed car blinks and chirps at a survivor who comes near (Game.tellArmedTrunks), so forcing its
// boot is a choice - or a lure. Only a trunk behind a wreck the clients draw can be armed (it has lamps to blink).
const CAR_ALARM_CHANCE = 0.1; // of the trunks with a car, the share that are armed
const CAR_ALARM_TELL_RANGE = 12; // m: a survivor this near an armed car sees it blink and hears it chirp
const CAR_ALARM_TELL_EVERY = 2; // s between its chirps while someone is that near
const CAR_ALARM_MIN_ZOMBIES = 6;
const CAR_ALARM_MAX_ZOMBIES = 7;
const CAR_ALARM_SPAWN_MIN = 62;
const CAR_ALARM_SPAWN_MAX = 86;

export const methods = {
  // Forcing a car's boot (shared/trunk.js). What the hold is to be, when this container is the boot of a car with a
  // lid on it: the weapon that levers it (0: bare hands) and where. null: searched as any container - not a boot,
  // its lid up already, or the wreck picked clean (every part of it is off then, the lid too: Wreck.pickClean).
  pryOf(p, c) {
    if (c.ctype !== CONT.TRUNK) return null;
    if (c.car === undefined) c.car = trunkCar(this.world, c);
    const car = c.car;
    if (!hasBootLid(car)) return null;
    for (const col of this.world.staticGrid.query(car.x, car.z, 1, [])) if (col.tag === car && this.gather.get(col)?.left <= 0) return null;
    // the lid's edge, over the bumper; the lever goes in and down
    const ax = Math.sin(car.ry), az = Math.cos(car.ry);
    return { weapon: pryWeapon(currentWeapon(p.state)), next: PRY.lever, x: car.x + ax * 2.12, y: car.y + 0.84, z: car.z + az * 2.12, dx: -ax * 0.8, dy: -0.6, dz: -az * 0.8 };
  },
  // one heave on the lever: a blow on the lid's edge that those near see and hear (as a swing that lands on a wreck
  // does: nothing is put on the wreck's record, and it gives nothing), and a little noise for the dead
  pryHeave(p, c, pry) {
    if (pry.weapon) this.strike(p, pry.weapon, false, pry.x, pry.y, pry.z, pry.dx, pry.dy, pry.dz);
    else this.sound(SOUND.SEARCH, c.x, c.y, c.z, 18);
    this.zm.noise(c.x, c.z, PRY.noise, undefined, p, HEARD.PRY);
  },

  // Whether a trunk's car is armed, until its boot is next refilled: a hash of where it is, the day and the world's
  // seed (no draw on the game's dice, so nothing else in the valley comes out differently).
  armTrunk(c) {
    c.alarm = false;
    if (c.ctype !== CONT.TRUNK || !this.trunkCol(c)) return;
    c.alarm = hash2(Math.round(c.x * 4), Math.round(c.z * 4) + Math.imul(this.day, 7919), this.seed) < CAR_ALARM_CHANCE;
  },
  // the collider of the car a trunk is the boot of (what EVT.WRECK_ALARM names), or null
  // (kept here, not on the container: a container's fields go with it in a handoff, a collider cannot)
  trunkCol(c) {
    if (this.trunkCols.has(c)) return this.trunkCols.get(c);
    const car = trunkCar(this.world, c);
    const col = (car && this.world.staticGrid.query(car.x, car.z, 1, []).find((q) => q.tag === car && wreckOf(q))) || null;
    this.trunkCols.set(c, col);
    return col;
  },
  // Every CAR_ALARM_TELL_EVERY s, each armed car with a survivor near it blinks its lamps and chirps (ALARM_SAY.ARMED)
  tellArmedTrunks(dt) {
    if ((this.armedT -= dt) > 0) return;
    this.armedT = CAR_ALARM_TELL_EVERY;
    const humans = this.humans();
    if (!humans.length) return;
    for (const c of this.caches) {
      if (!c.alarm || c.state !== 0) continue;
      if (!humans.some((p) => Math.hypot(p.state.x - c.x, p.state.z - c.z) < CAR_ALARM_TELL_RANGE)) continue;
      const col = this.trunkCol(c);
      if (col) this.tellAlarm(col, ALARM_SAY.ARMED, this.gather.get(col) || {});
    }
  },

  triggerCarAlarm(p, c) {
    const humans = this.humans();
    if (!p.alive || p.zombie || !humans.length) return;
    const count = Math.max(2, Math.round((CAR_ALARM_MIN_ZOMBIES + Math.floor(this.rng() * (CAR_ALARM_MAX_ZOMBIES - CAR_ALARM_MIN_ZOMBIES + 1))) * this.diff.zombies));
    this.makeZombieRoom(count, humans);
    if (this.zombies.length >= MAX_ZOMBIES_ALIVE) return;
    this.notify(NOTIFY.CAR_ALARM, 0);
    this.sound(SOUND.HORDE_HORN, c.x, c.y, c.z, 140);
    this.zm.noise(c.x, c.z, NOISE.CAR_ALARM, undefined, p, HEARD.CAR_ALARM);
    let spawned = 0;
    for (let i = 0; i < count && this.zombies.length < MAX_ZOMBIES_ALIVE; i++) {
      const sp = this.pickCarAlarmSpawn(p, c, humans);
      if (!sp) break;
      const r = this.rng();
      const type = r < 0.65 ? ZTYPE.WALKER : r < 0.9 ? ZTYPE.RUNNER : this.joined(ZTYPE.SPITTER) ? ZTYPE.SPITTER : ZTYPE.RUNNER;
      const z = this.zm.spawn(type, sp.x + (this.rng() - 0.5) * 6, sp.z + (this.rng() - 0.5) * 6, { horde: true, hpMul: 1 + 0.04 * this.day });
      if (!z) continue;
      z.target = p.id;
      z.targetT = 0.8;
      z.aggroId = p.id;
      z.aggroT = 30;
      z.alertX = p.state.x;
      z.alertZ = p.state.z;
      z.alertT = 20;
      z.alertRush = 1;
      spawned++;
    }
    this.track.carAlarm(p, spawned);
    this.ach.carAlarm(p);
    if (spawned) this.globalDirty = true;
  },

  // the day's wanderers fill most of the zombie cap: idle ones far out of everyone's sight drift off so n more fit
  // (not the dog packs or the wandering herd: the day's upkeep would only spawn them again)
  makeZombieRoom(n, humans) {
    let over = this.zombies.length + n - MAX_ZOMBIES_ALIVE;
    if (over <= 0) return;
    const far = [];
    for (const z of this.zombies) {
      if (z.dead || z.horde || z.boss || z.pack || z.herd || z.target) continue;
      let md = Infinity;
      for (const h of humans) md = Math.min(md, Math.hypot(h.state.x - z.x, h.state.z - z.z));
      if (md > 150) far.push({ z, md });
    }
    far.sort((a, b) => b.md - a.md);
    for (const { z } of far) {
      if (over-- <= 0) break;
      this._listRemove(this.zombies, z);
      this.removeEntity(z);
    }
  },

  pickCarAlarmSpawn(p, c, humans) {
    const s = p.state;
    const lim = this.world.half - 14;
    const behind = s.yaw + Math.PI;
    for (let tries = 0; tries < 20; tries++) {
      const a = behind + (this.rng() - 0.5) * Math.PI;
      const d = CAR_ALARM_SPAWN_MIN + this.rng() * (CAR_ALARM_SPAWN_MAX - CAR_ALARM_SPAWN_MIN);
      const x = s.x - Math.sin(a) * d;
      const z = s.z - Math.cos(a) * d;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (this.world.isDeepWater(x, z) || this.nav.isBlocked(x, z)) continue;
      let ok = true;
      for (const h of humans) {
        const hs = h.state;
        if (Math.hypot(hs.x - x, hs.z - z) < CAR_ALARM_SPAWN_MIN * 0.75) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, z };
    }
    return this.zm.pickSpawnAround(c.x, c.z, humans, CAR_ALARM_SPAWN_MIN, CAR_ALARM_SPAWN_MAX);
  },
};
