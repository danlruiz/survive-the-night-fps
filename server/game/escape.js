// The final stand: every supply in, the engine started (startEngine), its warm-up held at the car - on the mainland
// the fuel truck and then the plane, with a runway to keep clear - against the groups and bosses it draws
// (updateEscape), and somebody driving off (driveOff), which crosses to the mainland or wins the run.
import { PHASE, ESCAPE_TIME, ESCAPE_RADIUS } from '../../shared/constants.js';
import { ZTYPE, SOUND, NOTIFY } from '../../shared/defs.js';
import { HOLD } from '../../shared/protocol.js';
import { WORLD, RUNWAY } from '../../shared/acts.js';
import { MAX_ZOMBIES_ALIVE } from './phases.js';

// The final stand is sized from the night of the same number (hordeSize), so it follows the team the way the nightly
// waves do. Balance numbers, a first pass:
const FINAL_STAND_SIZE = 1.25; // its zombies, as a multiple of that night's horde (the ones that join at the start count)
const FINAL_STAND_ALIVE = 0.6; // at most this share of them is on its feet at once
const FINAL_STAND_SPREAD = ESCAPE_TIME - 30; // seconds they set out over: a walker needs the last 30 of the warm-up to reach the car
const FINAL_STAND_TANKS = 1; // Tanks among them, per survivor (the boss comes on top)
const FINAL_STAND_JOIN_RANGE = 95; // wanderers this close to a survivor join the stand (the same reach as at nightfall)
// The escape is the team's to make (the radius and the hold are ESCAPE_RADIUS and ESCAPE_DRIVE_TIME in constants.js).
// Also a first pass:
const ESCAPE_LINGER_PACE = 0.5; // once the engine is warm, groups keep coming at this share of the stand's pace until someone drives

export const methods = {
  allSuppliesIn() {
    const { items, need } = this.sup;
    for (let i = 0; i < items.length; i++) if (this.supplies[i] < need[i]) return false;
    return true;
  },

  // How many of the dead the final stand brings in all. It is read whenever a group is due (updateEscape), so it
  // follows the survivors still alive: a death shrinks what is still to come, a late joiner adds to it.
  finalStandSize() {
    return Math.round(FINAL_STAND_SIZE * this.diff.stand * (this.act === WORLD.MAINLAND ? RUNWAY.SIZE : 1) * this.hordeSize(this.day, Math.max(1, this.humanCount())));
  },

  // How many Tanks the final stand may bring (the boss comes on top). At least one: Ember halves it, not to nothing.
  finalStandTanks() {
    return Math.max(1, Math.round(FINAL_STAND_TANKS * this.diff.standTanks * Math.max(1, this.humanCount())));
  },

  startEngine(p) {
    if (this.escape.active || !this.allSuppliesIn()) return;
    if (this.phase !== PHASE.DAY && this.phase !== PHASE.NIGHT) return;
    this.escape = { ...this.noEscape(), active: true, t: this.act === WORLD.MAINLAND ? RUNWAY.FUEL_TIME : ESCAPE_TIME, spawnT: 3 };
    const car = this.world.car;
    this.notify(NOTIFY.ENGINE_START, p ? p.id : 0);
    this.sound(SOUND.ENGINE_CRANK, car.x, car.y + 0.8, car.z, 300);
    this.sound(SOUND.HORDE_HORN, 0, 0, 0, 0);
    this.hordeHpMul = 1 + 0.12 * this.day + 0.12 * (Math.max(1, this.humanCount()) - 1);
    // as at nightfall: the wanderers near the survivors join in, and count towards the stand's size; the rest drift
    // off, which leaves the stand its room under MAX_ZOMBIES_ALIVE (a day's valley can fill most of it)
    const hs = this.humans();
    for (const z of [...this.zombies]) {
      if (z.dead) continue;
      let md = Infinity;
      for (const h of hs) md = Math.min(md, Math.hypot(h.state.x - z.x, h.state.z - z.z));
      if (z.horde || z.boss || md < FINAL_STAND_JOIN_RANGE) {
        z.horde = true;
        if (!z.boss) {
          this.escape.sent++;
          if (z.ztype === ZTYPE.TANK) this.escape.tanks++;
        }
      } else {
        this._listRemove(this.zombies, z);
        this.removeEntity(z);
      }
    }
    this.globalDirty = true;
    this.track.engineStart(p);
    this.log('engine started - final stand');
  },

  // A survivor got in and drove (HOLD.DRIVE at the car, once the engine is warm). That wins the run for the whole
  // team, as victory always has: one phase and one restart for everybody. Whoever is not at the car is left
  // behind, which each client works out for its own end screen from ESCAPE_RADIUS.
  // On the island that is no longer the end: the car makes for the bridge, and the run goes on across it (cross).
  // On the mainland it is the plane, and it does not go while the dead stand on the runway ahead of it.
  driveOff(p) {
    if (!this.escape.active || !this.escape.ready) return;
    if (this.act === WORLD.MAINLAND) {
      const n = this.onRunway();
      if (n > RUNWAY.CLEAR) return this.notify(NOTIFY.RUNWAY_BLOCKED, n, p.id);
      this.log('took off:', p.name);
      this.track.drove(p);
      this.ach.drove(p);
      return this.victory();
    }
    this.log('drove off:', p.name);
    // map 1 is beaten: on the record of everybody in the run (as a win is), which opens map 2 games to them
    this.credit(this.players.values(), 'crossings');
    this.track.drove(p);
    this.ach.drove(p); // (the driver's feat is the car's, as it was)
    this.ach.leftIsland(); // (whoever has the cat in their arms took it with them)
    this.cross(p, this.phase === PHASE.NIGHT);
  },

  // how many of the dead stand on the runway ahead of the plane (acts.js RUNWAY: the strip it needs for its run)
  // (the strip runs from the plane's nose the way it faces: -Z turned by its heading, the runway's)
  onRunway() {
    const car = this.world.car;
    const fx = -Math.sin(car.ry);
    const fz = -Math.cos(car.ry);
    let n = 0;
    for (const z of this.zombies) {
      if (z.dead || z.def.flying) continue;
      const ahead = (z.x - car.x) * fx + (z.z - car.z) * fz;
      const side = (z.x - car.x) * -fz + (z.z - car.z) * fx;
      if (Math.abs(side) < RUNWAY.LANE && ahead > 4 && ahead < RUNWAY.STRIP) n++;
    }
    return n;
  },
  // the point AHEAD metres down the runway from the plane, where the runway stand's groups come from
  runwayAhead() {
    const car = this.world.car;
    return { x: car.x - Math.sin(car.ry) * RUNWAY.AHEAD, z: car.z - Math.cos(car.ry) * RUNWAY.AHEAD };
  },

  // The engine is warming up: the whole valley heard it. It only warms while a survivor on their feet is at the car
  // (it stalls otherwise: the count stops where it is, it does not start over), and once it is warm the run goes on
  // until a survivor gets in and drives (HOLD.DRIVE -> driveOff).
  updateEscape(dt) {
    const e = this.escape;
    const car = this.world.car;
    // The plane's stand (acts.js RUNWAY) has two things to hold, one after the other: the fuel truck while it pumps,
    // then the plane while its engines warm. The car's has the one.
    const plane = this.act === WORLD.MAINLAND;
    const at = plane && e.stage === 0 ? this.world.runway.truck : car;
    const reach = plane && e.stage === 0 ? RUNWAY.HOLD : ESCAPE_RADIUS;
    let held = false; // somebody stands at it
    let leaving = false; // somebody is getting in
    for (const p of this.players.values()) {
      if (!p.alive || p.zombie || p.downed) continue;
      if (Math.hypot(p.state.x - at.x, p.state.z - at.z) <= reach) held = true;
      if (p.hold && p.hold.kind === HOLD.DRIVE) leaving = true;
    }
    // ...and once it is ready, a runway to keep clear: the plane does not go with the dead in its way (driveOff)
    const blocked = plane && e.ready && this.tick % 5 === 0 ? this.onRunway() > RUNWAY.CLEAR : e.blocked;
    if (blocked !== e.blocked) {
      e.blocked = blocked;
      this.globalDirty = true;
    }
    const stalled = !e.ready && !held;
    if (stalled !== e.stalled || leaving !== e.leaving) {
      e.stalled = stalled;
      e.leaving = leaving;
      this.globalDirty = true; // the HUD says both, and the client stops its own countdown on a stall
    }
    if (!e.ready && !stalled) {
      const prev = Math.ceil(e.t);
      e.t -= dt;
      if (Math.ceil(e.t) !== prev) this.globalDirty = true;
    }
    // The stand comes on its own clock, stalled engine or not: the dead hunt the survivors, not the car.
    e.spawnT -= dt;
    // its size, the cap on how many stand at once and the pace all follow the survivors still alive; a group that
    // finds the cap full waits and comes as soon as there is room
    const size = e.spawnT <= 0 ? this.finalStandSize() : 0; // 0: no group is due
    // a warm engine goes on drawing them once the stand is spent, so every second the team lingers at the car costs
    const linger = e.ready && size > 0 && e.sent >= size;
    if ((e.sent < size || linger) && this.hordeAlive() < Math.min(MAX_ZOMBIES_ALIVE, Math.round(size * FINAL_STAND_ALIVE * this.diff.standCrowd))) {
      const spread = plane ? RUNWAY.FUEL_TIME + RUNWAY.WARM_TIME - 30 : FINAL_STAND_SPREAD;
      e.spawnT = ((spread / Math.ceil(size / 3.5)) * (0.7 + this.rng() * 0.6)) / (linger ? ESCAPE_LINGER_PACE : 1); // groups of 3-5, as a wave's
      const tanks = this.finalStandTanks();
      const q = [];
      for (let i = linger ? 5 : Math.min(5, size - e.sent); i > 0; i--) {
        let r = this.rng();
        if (r >= 0.67) r = 0.67 + (r - 0.67) / this.diff.standSpecials; // fewer specials: the share past 0.97 is a runner
        let type = r < 0.45 ? ZTYPE.WALKER : r < 0.67 ? ZTYPE.RUNNER : r < 0.72 ? ZTYPE.DOG : r < 0.8 ? ZTYPE.SPITTER : r < 0.87 ? ZTYPE.BOOMER : r < 0.93 ? ZTYPE.LEAPER : r < 0.97 && e.tanks < tanks ? ZTYPE.TANK : ZTYPE.RUNNER;
        if (!this.joined(type)) type = ZTYPE.RUNNER; // (only the kinds the run has met so far)
        if (type === ZTYPE.TANK) e.tanks++;
        q.push(type);
      }
      // (the plane's comes down the runway: its groups appear round a point well along it)
      e.sent += this.spawnHordeGroup(q, plane ? this.runwayAhead() : car);
      for (const t of q) if (t === ZTYPE.TANK) e.tanks--; // rolled, but the group came out smaller: it was not sent
    }
    if (!e.ready) {
      if (!e.boss && e.t <= (plane ? RUNWAY.FUEL_TIME : ESCAPE_TIME) * 0.5) {
        e.boss = true;
        this.spawnBosses([this.day % 2 ? ZTYPE.BOSS_ABOMINATION : ZTYPE.BOSS_HIVEQUEEN], car);
      }
      if (e.t <= 0 && plane && e.stage === 0) {
        // the tanks are full: the engines start, and the stand moves from the truck to the plane. The other of the
        // two late bosses comes with it
        e.stage = 1;
        e.t = RUNWAY.WARM_TIME;
        this.notify(NOTIFY.STAND_STAGE, 1);
        this.sound(SOUND.ENGINE_CRANK, car.x, car.y + 0.8, car.z, 300);
        this.spawnBosses([this.day % 2 ? ZTYPE.BOSS_HIVEQUEEN : ZTYPE.BOSS_ABOMINATION], this.runwayAhead());
        this.globalDirty = true;
      } else if (e.t <= 0) {
        e.t = 0;
        e.ready = true;
        this.notify(NOTIFY.ESCAPE_READY, 0);
        this.track.engineReady();
        this.sound(SOUND.CAR_START, car.x, car.y + 0.8, car.z, 300);
        this.globalDirty = true;
      }
    }
    this.trackBoss();
  },
};
