// Ground transport, server side (the rules both ends share, the physics and where they stand: shared/vehicles.js).
// Only the mainland has any. Each is one entity, ENT.VEHICLE: where it is and points, how it moves, its tank and its
// health, the parts it still wants, who sits in it. While a survivor drives, the vehicle is in their simulated state
// and goes where their commands take it: the entity only follows (update). Nobody at the wheel, it is stepped here
// until it stands, and standing empty it is a box in the world (vehicleGrid) that everything walks round.
// What a driver's prediction cannot know of is settled here and written into their state, which rebases their
// client: the dead in its way (strike), a blow on it (damage), fuel poured in, a breakdown.
// What it runs into is vehicles/contact.js, the damage it takes vehicles/damage.js, the work done on it with [E] held
// vehicles/work.js, /veh vehicles/debug.js.
import { SERVER_DT, CMD_DT, INTERACT_REACH, INTERACT_SLACK, PLAYER_RADIUS, PLAYER_HEIGHT, NOISE, PHASE, BTN, WATER_LEVEL } from '../shared/constants.js';
import { SOUND, NOTIFY, HEARD, ITEM, KILLER, VEH_NO, VEH_OFFS, SCHEM_BIT } from '../shared/defs.js';
import { ENT, VACT, VFLAG, qpos, dqpos, qangle16, dqangle16 } from '../shared/protocol.js';
import { WORLD } from '../shared/acts.js';
import { VEH, VSTATE, VEHICLES, fixMask, QUEST_FUEL, QUEST_HP, HORN, stepVehicle, seatAt, seatFeet, vehicleSpots, starterSpots, questCar, vehicleGrid, parkedCollider } from '../shared/vehicles.js';
import { COL, resolveBody, groundAt, pushCircle } from '../shared/collision.js';
import { mulberry32 } from '../shared/rng.js';
import { withRng, addMethods } from './entkit.js';
import { contactMethods, THROWN_HURT } from './vehicles/contact.js';
import { workMethods } from './vehicles/work.js';
import { damageMethods } from './vehicles/damage.js';
import { debugMethods } from './vehicles/debug.js';

const SEATS = 4;
const QUEST_SEATS = VEHICLES[VEH.CAR].seats.length;
const NOISE_EVERY = 1.3; // s between the engine's calls on the dead
const START_FUEL = [0.12, 0.3]; // of a tank: what one that has just been fixed has in it
const STARTER_FUEL = 0.4;
const STARTER_CAN = 40; // Fuel left on the ground beside each of the first ones
const JUMP_HURT_FROM = 8; // m/s: getting out of one going faster than this hurts...
const JUMP_HURT = 4; // ...this per m/s over
const _seat = { x: 0, y: 0, z: 0 };
const _pos = { x: 0, y: 0, z: 0 };
const _ev = [];
const _push = { x: 0, z: 0, nx: 0, nz: 0 };

export class Vehicles {
  constructor(game) {
    this.g = game;
    this.list = []; // the ENT.VEHICLE entities
    this.rng = mulberry32(1); // its own stream: nothing here draws from the game's
    this.siphoned = new Set(); // the wrecks whose tanks have been drawn off ("qx,qz" of the prop)
    this.props = null; // "qx,qz" -> the prop, of every wreck with something in its tank (by world)
    this.propsOf = null;
    this.starters = 0; // how many of the bridgehead's are out
  }

  // ---------------------------------------------------------------- the run
  // The world is being cleared (a new game, the crossing): every box out of it.
  clear() {
    for (const e of this.list) this.unpark(e);
    this.list.length = 0;
    this.siphoned.clear();
    this.starters = 0;
  }

  // A map is being stocked (Game.populate, last of all, so that nothing else's ids or random draws move). The island
  // has none. The mainland: the car the team crossed in, running; the broken ones about the map; and near the
  // bridgehead what the team needs beyond that car's seats (provide).
  spawn(team) {
    const g = this.g;
    const w = g.world;
    vehicleGrid(w);
    const q = questCar(w); // (also takes the parked prop's own collider out of the world: the vehicle has its box)
    this.rng = mulberry32((g.seed ^ 0x0ca75) >>> 0);
    if (w.kind !== WORLD.MAINLAND) return;
    if (q) {
      const P = VEHICLES[VEH.CAR];
      this.make(VEH.CAR, q.x, q.z, q.yaw, { state: VSTATE.OK, need: 0, fuel: P.tank * QUEST_FUEL, hp: P.hp * QUEST_HP, tint: 7, quest: true });
    }
    let manuals = 0;
    for (const s of vehicleSpots(w)) {
      const e = this.make(s.kind, s.x, s.z, s.yaw, { tint: s.tint });
      // the workshop manual (a moped and a bicycle built at a bench: defs.js RECIPES) lies by the first two broken
      // mopeds of the map - it is the mainland's, and found where what it is about stands
      if (e && s.kind === VEH.MOPED && manuals < 2 && !(g.unlocked & (1 << SCHEM_BIT[ITEM.SCHEM_VEHICLES]))) {
        manuals++;
        const P = VEHICLES[s.kind];
        // (on its left, or - where that is under a roof or in a wall, a moped left against a building - on its right)
        const side = (k) => [s.x - k * Math.cos(s.yaw) * (P.halfW + 0.6), s.z + k * Math.sin(s.yaw) * (P.halfW + 0.6)];
        const open = ([x, z]) => groundAt(w, x, z, 200, 0.2) - groundAt(w, x, z, s.y + 1, 0.2) < 0.3;
        const [mx, mz] = open(side(1)) || !open(side(-1)) ? side(1) : side(-1);
        withRng(g, this.rng, () => g.spawnItem(ITEM.SCHEM_VEHICLES, 1, mx, groundAt(w, mx, mz, s.y + 1, 0.2), mz, { permanent: true }));
      }
    }
    this.provide(team);
  }

  // A vehicle made at a workbench (Game.craft): stood on the nearest clear ground round whoever made it, running,
  // with a splash of fuel in it. dry: only say whether it can be (0), or why not (a VEH_NO).
  build(p, kind, dry = false) {
    const g = this.g;
    const w = g.world;
    if (w.kind !== WORLD.MAINLAND) return VEH_NO.NOT_HERE;
    const P = VEHICLES[kind];
    const s = p.state;
    const grid = vehicleGrid(w);
    const clear = (x, z, yaw) => {
      const y = groundAt(w, x, z, s.y + 1.2, 0.3, false);
      if (Math.abs(y - s.y) > 1.2 || y < WATER_LEVEL + 0.05) return false;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      for (const c of P.circles) {
        const px = x - fx * c[0], pz = z - fz * c[0];
        for (const gr of [w.staticGrid, w.structGrid, grid.parked]) {
          for (const col of gr.query(px, pz, c[1] + 0.25, [])) {
            if (col.flags & COL.NOBLOCK || col.y1 <= y + P.step || col.y0 >= y + P.h) continue;
            if (pushCircle(col, px, pz, c[1] + 0.15, _push)) return false;
          }
        }
        for (const q of g.players.values()) if (q.alive && Math.hypot(q.state.x - px, q.state.z - pz) < c[1] + 0.45) return false;
      }
      for (const e of this.list) if (!e.removed && Math.hypot(e.x - x, e.z - z) < P.half + VEHICLES[e.vk].half + 0.2) return false;
      return true;
    };
    for (const d of [P.half + 1.3, P.half + 2.4, P.half + 3.6]) {
      for (let k = 0; k < 12; k++) {
        const a = s.yaw + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 6);
        const x = s.x - Math.sin(a) * d, z = s.z - Math.cos(a) * d;
        const yaw = a + Math.PI / 2;
        if (!clear(x, z, yaw)) continue;
        if (dry) return 0;
        const e = this.make(kind, x, z, yaw, { state: VSTATE.OK, need: 0, fuel: P.tank * START_FUEL[0], hp: P.hp, tint: (g.tick + p.id) % 6, built: true });
        if (e) g.notify(NOTIFY.VEH_FIXED, p.id);
        return e ? 0 : VEH_NO.NO_ROOM;
      }
    }
    return VEH_NO.NO_ROOM;
  }

  // Seats for everybody near where the team is put down: the car it came in has four, and for every survivor past
  // that the next of the bridgehead's vehicles is stood out. Those want no parts, only a few seconds' work ([E] held:
  // nothing a passing teammate can walk off with stands between a survivor and a seat), and a can of fuel lies
  // beside each. Always the first of them, as a spare. Called as the map is stocked and again whenever somebody joins.
  provide(team = this.g.players.size) {
    const g = this.g;
    const w = g.world;
    if (w.kind !== WORLD.MAINLAND) return;
    const spots = starterSpots(w);
    let seats = QUEST_SEATS;
    for (let i = 0; i < this.starters; i++) seats += VEHICLES[spots[i].kind].seats.length;
    while (this.starters < spots.length && (this.starters < 1 || seats < team)) {
      const s = spots[this.starters++];
      const P = VEHICLES[s.kind];
      const e = this.make(s.kind, s.x, s.z, s.yaw, { tint: s.tint, need: 0, fuel: P.tank * STARTER_FUEL, hp: P.hp * 0.8, starter: true });
      if (!e) break;
      seats += P.seats.length;
      // fuel beside it
      const sx = s.x + Math.cos(s.yaw) * (P.halfW + 0.7);
      const sz = s.z - Math.sin(s.yaw) * (P.halfW + 0.7);
      if (P.tank) withRng(g, this.rng, () => g.spawnItem(ITEM.AMMO_FUEL, STARTER_CAN, sx, groundAt(w, sx, sz, s.y + 1, 0.2), sz, { life: 1e6 }));
    }
  }

  // one more of them, standing at (x, z). opts: state, need, fuel, hp, tint, starter, quest
  make(vk, x, z, yaw, opts = {}) {
    const g = this.g;
    const P = VEHICLES[vk];
    const e = {
      kind: ENT.VEHICLE,
      vk,
      tint: opts.tint ?? 0,
      x,
      y: groundAt(g.world, x, z, 200, 0.25, false),
      z,
      yaw,
      vx: 0,
      vz: 0,
      vf: 0,
      steer: 0,
      fuel: opts.fuel ?? P.tank * (START_FUEL[0] + this.rng() * (START_FUEL[1] - START_FUEL[0])),
      hp: opts.hp ?? P.hp * (0.55 + this.rng() * 0.3),
      state: opts.state ?? VSTATE.BROKEN,
      need: opts.need ?? fixMask(vk),
      lights: 0,
      horn: 0,
      brake: 0,
      thr: 0,
      skidT: 0,
      wreckHp: 0,
      seats: [0, 0, 0, 0],
      starter: !!opts.starter,
      quest: !!opts.quest,
      built: !!opts.built, // made at a workbench (Game.craft)
      noiseT: 0,
      hornT: 0,
      run: false, // (stepVehicle's: its engine can turn. Rolling on empty it cannot)
      running: false, // somebody at the wheel with an engine that turns
      flags: 0,
      fuelQ: 0,
      hpQ: 0,
      col: null,
    };
    if (!g.spawnEntity(e)) return null;
    this.list.push(e);
    this.rest(e);
    return e;
  }

  // ---------------------------------------------------------------- the handoff (gamestate.js)
  save() {
    return { list: this.list.filter((e) => !e.removed).map((e) => ({ ...e, seats: [...e.seats], col: null, shotCol: null })), siphoned: [...this.siphoned], starters: this.starters };
  }
  load(s) {
    const g = this.g;
    vehicleGrid(g.world);
    questCar(g.world);
    this.rng = mulberry32((g.seed ^ g.tick ^ 0x0ca75) >>> 0);
    this.list = [];
    for (const se of s?.list || []) {
      const e = g.spawnEntityAt({ ...se, seats: [...se.seats], col: null }, se.id);
      if (!e) continue;
      this.list.push(e);
      if (this.empty(e) && e.vx === 0 && e.vz === 0) this.park(e);
      this.wire(e);
    }
    this.siphoned = new Set(s?.siphoned || []);
    this.starters = s?.starters || 0;
  }

  // ---------------------------------------------------------------- who is where
  // the vehicle player p is in (at the wheel or carried), or null
  of(p) {
    const s = p.state;
    const id = s.drive || s.pass;
    const e = id ? this.g.ents[id] : null;
    return e && e.kind === ENT.VEHICLE && !e.removed ? e : null;
  }
  driver(e) {
    const p = e.seats[0] ? this.g.players.get(e.seats[0]) : null;
    return p && p.alive && p.state.drive === e.id ? p : null;
  }
  empty(e) {
    return !e.seats[0] && !e.seats[1] && !e.seats[2] && !e.seats[3];
  }

  // what goes on the wire of it, kept as the snapshot wants it (snapshot.js quant)
  wire(e) {
    const P = VEHICLES[e.vk];
    e.vf = -e.vx * Math.sin(e.yaw) - e.vz * Math.cos(e.yaw);
    e.flags = e.state | (e.need << VFLAG.NEED_SHIFT) | (e.lights ? VFLAG.LIGHTS : 0) | (e.horn ? VFLAG.HORN : 0) | (e.brake ? VFLAG.BRAKE : 0) | (e.thr ? VFLAG.THROTTLE : 0) | (e.skidT > 0 ? VFLAG.SKID : 0) | (e.starter ? VFLAG.STARTER : 0) | (e.quest ? VFLAG.QUEST : 0);
    e.fuelQ = P.tank ? e.fuel / P.tank : 0;
    e.hpQ = e.state === VSTATE.WRECK ? 0 : Math.max(0, e.hp) / P.hp;
  }

  // standing empty: it is put exactly where the wire says it is (so every client's box is ours), and is a box
  rest(e) {
    e.vx = e.vz = 0;
    e.steer = 0;
    e.x = dqpos(qpos(e.x));
    e.z = dqpos(qpos(e.z));
    e.yaw = dqangle16(qangle16(e.yaw));
    if (e.yaw > Math.PI) e.yaw -= Math.PI * 2;
    e.y = groundAt(this.g.world, e.x, e.z, e.y + 0.5, 0.25, false);
    if (this.empty(e)) this.park(e);
    this.wire(e);
  }
  park(e) {
    if (e.col) return;
    const g = this.g;
    e.col = parkedCollider(e.vk, e.id, e.x, e.y, e.z, e.yaw);
    vehicleGrid(g.world).parked.add(e.col);
    g.nav.addStructure(e.col);
  }
  unpark(e) {
    if (!e.col) return;
    const g = this.g;
    vehicleGrid(g.world).parked.remove(e.col);
    g.nav.removeStructure(e.col);
    e.col = null;
  }

  // ---------------------------------------------------------------- the tick
  // Once a tick, after the commands: one with a driver follows them, the rest roll on; who is carried is put in
  // their seat; then what they run into, and what the dead hear.
  update() {
    const g = this.g;
    if (!this.list.length) return;
    this.collide(); // (as they stood after the last tick's commands)
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.removed) {
        this.list.splice(i, 1);
        continue;
      }
      this.checkSeats(e);
      const p = this.driver(e);
      const was = e.running;
      if (p) this.driven(e, p);
      else {
        this.coast(e);
        if (e.removed) continue;
      }
      if (e.running !== was) g.sound(e.running ? SOUND.VEH_START : SOUND.VEH_STOP, e.x, e.y + 0.6, e.z, 45);
      if (e.skidT > 0) e.skidT -= SERVER_DT;
      // the carried, in their seats
      for (let k = 1; k < SEATS; k++) {
        const q = e.seats[k] ? g.players.get(e.seats[k]) : null;
        if (q) this.carry(q, e, k);
      }
      if (!this.empty(e) || e.vx !== 0 || e.vz !== 0) {
        this.strike(e, p);
        if (e.removed) continue;
        this.shove(e, p);
      }
      if (e.running) this.engineNoise(e);
      this.wire(e);
    }
  }

  // e as its driver p's commands have it: where they took it, the pedals, the horn (or a bicycle's bell)
  driven(e, p) {
    const g = this.g;
    const P = VEHICLES[e.vk];
    const s = p.state;
    this.follow(e, s);
    const b = s.lastBtn;
    e.thr = b & BTN.FWD ? 1 : 0;
    e.brake = b & (BTN.BACK | BTN.JUMP) ? 1 : 0;
    const horn = b & HORN ? 1 : 0;
    if (horn && !e.horn) {
      if (P.pedal) g.sound(SOUND.BIKE_BELL, e.x, e.y + 1, e.z, 40);
      this.noise(e, P.pedal ? 25 : NOISE.HORN, p, HEARD.HORN);
      e.hornT = g.time + 1;
    } else if (horn && !P.pedal && g.time >= e.hornT) {
      this.noise(e, NOISE.HORN, p, HEARD.HORN);
      e.hornT = g.time + 1;
    }
    e.horn = horn && !P.pedal ? 1 : 0;
    e.running = !P.pedal && e.state === VSTATE.OK && e.fuel > 0;
  }

  // Nobody at the wheel: it rolls on, the brake on if nobody is in it at all, until it stands (a crash, or the river,
  // may be the end of it: e.removed), and standing empty it is a box.
  coast(e) {
    e.thr = e.horn = 0;
    e.running = false;
    if (e.vx !== 0 || e.vz !== 0) {
      e.run = false;
      e.brake = this.empty(e) ? 1 : 0;
      _ev.length = 0;
      for (let k = 0; k < 3; k++) stepVehicle(e, 0, 0, !!e.brake, false, this.g.world, CMD_DT, _ev);
      for (const ev of _ev) if (ev.type === 'veh_crash') this.crash(e, ev.v, ev.col);
      for (const ev of _ev) if (ev.type === 'veh_river') this.swept(e);
      if (e.removed) return;
      if (Math.hypot(e.vx, e.vz) < 0.15) this.rest(e);
    } else if (!e.col && this.empty(e)) this.rest(e);
  }

  // the engine, to the dead, every NOISE_EVERY s while it runs: louder the harder it is worked
  engineNoise(e) {
    const P = VEHICLES[e.vk];
    e.noiseT -= SERVER_DT;
    if (e.noiseT > 0) return;
    e.noiseT = NOISE_EVERY;
    const k = Math.min(1, Math.hypot(e.vx, e.vz) / P.top) * 0.6 + (e.thr ? 0.4 : 0);
    this.noise(e, P.idle + (P.noise - P.idle) * k);
  }

  // a noise at the vehicle, with the module's own random stream in the game's place for the call (the noise scatters
  // where each of the dead heads for: a vehicle must not shift what the rest of a seeded run rolls)
  noise(e, loud, by, what) {
    const g = this.g;
    withRng(g, this.rng, () => g.zm.noise(e.x, e.z, loud, e.y, by, what));
  }

  // Every seat's holder is still somebody who can sit there: alive, a survivor, on their feet, and in this vehicle
  // by their own state. Who is not is out of it (their body beside it, unless the simulation has thrown it already).
  checkSeats(e) {
    const g = this.g;
    for (let k = 0; k < SEATS; k++) {
      const id = e.seats[k];
      if (!id) continue;
      const p = g.players.get(id);
      const s = p?.state;
      const there = s && (k === 0 ? s.drive === e.id : s.pass === e.id && s.passN === k);
      if (p && there && p.alive && !p.zombie && !p.downed && !(k === 0 && p.away)) continue;
      e.seats[k] = 0;
      if (!p) continue;
      if (there && k === 0 && p.away && p.alive && !p.zombie && !p.downed) {
        // dropped at the wheel: the vehicle keeps what it was doing, and they are carried in another seat if there is
        // one (somebody else can drive), else left beside it
        this.leaveWheel(p, e);
        const free = this.freeSeat(e, 1);
        if (free > 0) {
          this.sit(p, e, free);
          continue;
        }
      }
      // (their state has them elsewhere: nothing of theirs is touched)
      if (!there) continue;
      if (k === 0) this.leaveWheel(p, e);
      s.pass = s.passN = 0;
      this.putOut(p, e);
    }
    // a survivor whose state has them in a vehicle that does not have them (a new game under them) is out of it
    if (e === this.list[0]) {
      for (const p of g.players.values()) {
        const s = p.state;
        if (s.drive && this.g.ents[s.drive]?.seats?.[0] !== p.id) {
          s.drive = s.driveK = 0;
          s.vx = s.vz = 0;
        }
        if (s.pass && this.g.ents[s.pass]?.seats?.[s.passN] !== p.id) s.pass = s.passN = 0;
      }
    }
  }

  // the driver's state gives the vehicle back to itself: where it is, how it moves
  leaveWheel(p, e) {
    const s = p.state;
    if (s.drive !== e.id) return;
    this.follow(e, s);
    s.drive = s.driveK = 0;
    s.vx = s.vz = 0;
  }

  // e as its driver's simulated state s has it (while they drive it is in their state: the entity only follows)
  follow(e, s) {
    e.x = s.x;
    e.y = s.y;
    e.z = s.z;
    e.vx = s.vx;
    e.vz = s.vz;
    e.yaw = s.dyaw;
    e.steer = s.dsteer;
    e.fuel = s.dfuel;
  }

  // 'veh_off' from the simulation (processInputs): the driver left it on their own command - thrown over the bars by
  // a crash, pulled off, gone down. Where it was left is in the event.
  left(p, ev) {
    const g = this.g;
    const e = g.ents[ev.id];
    if (!e || e.kind !== ENT.VEHICLE || e.seats[0] !== p.id) return;
    e.seats[0] = 0;
    e.x = ev.x;
    e.y = ev.y;
    e.z = ev.z;
    e.yaw = ev.yaw;
    e.vx = ev.vx;
    e.vz = ev.vz;
    e.steer = ev.steer;
    e.fuel = ev.fuel;
    if (ev.thrown) {
      g.damagePlayer(p, 6 + Math.max(0, ev.v - VEHICLES[e.vk].throwAt) * THROWN_HURT, { kind: KILLER.WORLD, x: e.x, z: e.z });
      g.notify(NOTIFY.VEH_OFF, VEH_OFFS.THROWN, p.id);
    } else if (!p.state.pinned && !p.state.pulled) this.putOut(p, e); // (a leaper or a rope has them where it has them)
  }

  // p's body carried in seat k of e
  carry(p, e, k) {
    const s = p.state;
    seatAt(e.vk, k, e.x, e.y, e.z, e.yaw, _seat);
    s.x = _seat.x;
    s.y = seatFeet(e.vk, _seat.y);
    s.z = _seat.z;
    s.vx = s.vy = s.vz = 0;
    s.onGround = 1;
    // (where they are is the seat's and not their simulation's: it is no reason to send them their state)
    p.shadow.x = s.x;
    p.shadow.y = s.y;
    p.shadow.z = s.z;
    p.shadow.vx = p.shadow.vy = p.shadow.vz = 0;
    p.shadow.onGround = 1;
  }

  freeSeat(e, from = 0) {
    const n = VEHICLES[e.vk].seats.length;
    for (let k = from; k < n; k++) if (!e.seats[k]) return k;
    return -1;
  }

  // p into seat k of e
  sit(p, e, k) {
    const g = this.g;
    const s = p.state;
    p.hold = null;
    g.endUse(p);
    s.ride = s.cart = 0;
    this.unpark(e);
    e.seats[k] = p.id;
    if (k === 0) {
      s.pass = s.passN = 0;
      s.drive = e.id;
      s.driveK = e.vk;
      s.x = e.x;
      s.y = e.y;
      s.z = e.z;
      s.vx = e.vx;
      s.vz = e.vz;
      s.vy = 0;
      s.dyaw = e.yaw;
      s.dsteer = e.steer;
      s.dfuel = e.fuel;
      s.ddead = e.state === VSTATE.OK ? 0 : 1;
      s.onGround = 1;
      s.crouch = 0;
    } else {
      s.drive = s.driveK = 0;
      s.pass = e.id;
      s.passN = k;
      s.crouch = 0;
      this.carry(p, e, k);
    }
    p.selfSync = true;
    g.fillHistory(p);
  }

  // p's body beside e, where there is room for it: either side of it, behind it, ahead of it
  putOut(p, e) {
    const g = this.g;
    const w = g.world;
    const s = p.state;
    const P = VEHICLES[e.vk];
    const c = Math.cos(e.yaw);
    const sn = Math.sin(e.yaw);
    const side = P.halfW + PLAYER_RADIUS + 0.3;
    const end = P.half + PLAYER_RADIUS + 0.3;
    // (the driver's side first; for whoever sat on the right, the right)
    const first = s.passN === 1 || s.passN === 3 ? 1 : -1;
    // (whoever sat in the back, beside the back door)
    const back = s.passN >= 2 ? 0.9 : P.shell ? -0.3 : 0;
    const tries = [[first * side, back], [-first * side, back], [first * side, back + 1], [-first * side, back + 1], [first * side, back - 1], [-first * side, back - 1], [0, end], [0, -end], [first * (side + 0.8), 0], [-first * (side + 0.8), 0], [first * (side + 0.8), 1.2], [-first * (side + 0.8), 1.2]];
    let best = null;
    for (const [lx, lz] of tries) {
      const x = e.x + lx * c + lz * sn;
      const z = e.z - lx * sn + lz * c;
      const y = groundAt(w, x, z, e.y + 0.6, 0.3);
      if (Math.abs(y - e.y) > 1.3 || (y < WATER_LEVEL - 0.9 && w.isDeepWater(x, z))) continue;
      _pos.x = x;
      _pos.y = y;
      _pos.z = z;
      resolveBody(w, _pos, PLAYER_RADIUS, PLAYER_HEIGHT, true);
      if (Math.hypot(_pos.x - x, _pos.z - z) > 0.05) continue;
      if (!g.zm.clearLine(e.x, e.y + 1.2, e.z, x, y + 1.2, z)) continue;
      // (not where somebody stands already: four out of a car are four places)
      let taken = false;
      for (const q of g.players.values()) if (q !== p && q.alive && !q.state.drive && !q.state.pass && Math.hypot(q.state.x - x, q.state.z - z) < 0.75) taken = true;
      if (taken) continue;
      best = { x, y, z };
      break;
    }
    if (!best) best = { x: e.x, y: e.y + P.tall + 0.05, z: e.z }; // (walled in on every side: onto it)
    s.x = best.x;
    s.y = best.y;
    s.z = best.z;
    s.vx = s.vy = s.vz = 0;
    s.onGround = 1;
    s.drive = s.driveK = 0;
    s.pass = s.passN = 0;
    p.selfSync = true;
    g.fillHistory(p);
  }

  // everyone in e, which is burnt out, told so and put out beside it
  emptyWreck(e) {
    const g = this.g;
    for (let k = 0; k < SEATS; k++) {
      const q = e.seats[k] ? g.players.get(e.seats[k]) : null;
      if (!q) continue;
      g.notify(NOTIFY.VEH_WRECKED, 0, q.id);
      if (k === 0) this.leaveWheel(q, e);
      e.seats[k] = 0;
      this.putOut(q, e);
    }
  }

  // ---------------------------------------------------------------- getting in and out (ACT.VEHICLE)
  act(p, what, id) {
    const g = this.g;
    if (what === VACT.EXIT) return this.exit(p);
    if (what === VACT.LIGHTS) {
      const e = this.of(p);
      if (e && VEHICLES[e.vk].tank) e.lights = e.lights ? 0 : 1;
      return;
    }
    if (what !== VACT.ENTER) return;
    const e = g.ents[id];
    const s = p.state;
    if (!e || e.kind !== ENT.VEHICLE || e.removed) return;
    if (p.zombie || p.downed || s.drive || s.pass || s.ride || s.cart || s.hmg || s.pinned || s.pulled) return;
    if (g.time - p.interactT < 0.15) return;
    p.interactT = g.time;
    if (e.state === VSTATE.BROKEN) return g.notify(NOTIFY.VEH_NEED, VEH_NO.BROKEN, p.id);
    if (e.state === VSTATE.WRECK) return g.notify(NOTIFY.VEH_NEED, VEH_NO.WRECK, p.id);
    if (!this.near(p, e, Math.hypot(e.vx, e.vz) * 0.3)) return;
    const k = this.freeSeat(e);
    if (k < 0) return g.notify(NOTIFY.VEH_NEED, VEH_NO.SEATS, p.id);
    if (g.gun.ent && g.gun.ent.gunner === p.id) g.gun.ent.gunner = 0;
    if (s.pet) g.cm.put(p); // (the stray cat in their arms is set down first: server/cats.js)
    this.sit(p, e, k);
    this.doorSound(e);
  }

  // a door shut (a car), or somebody getting on or off (two wheels)
  doorSound(e) {
    this.g.sound(VEHICLES[e.vk].shell ? SOUND.VEH_DOOR : SOUND.VEH_MOUNT, e.x, e.y + 0.8, e.z, 25);
  }

  // is p close enough to e to lay a hand on it (as the client offers it)?
  near(p, e, slack = 0) {
    const s = p.state;
    return this.gap(e, s.x, s.z) <= INTERACT_REACH + INTERACT_SLACK + slack && Math.abs(s.y - e.y) < 2.6;
  }

  // how far (x, z) is outside e's body, seen from above (0: over it)
  gap(e, x, z) {
    const P = VEHICLES[e.vk];
    const c = Math.cos(e.yaw);
    const sn = Math.sin(e.yaw);
    const dx = x - e.x;
    const dz = z - e.z;
    const ox = Math.max(0, Math.abs(dx * c - dz * sn) - P.halfW);
    const oz = Math.max(0, Math.abs(dx * sn + dz * c) - P.half);
    return Math.hypot(ox, oz);
  }

  exit(p) {
    const g = this.g;
    const e = this.of(p);
    const s = p.state;
    if (!e) {
      s.drive = s.driveK = s.pass = s.passN = 0;
      return;
    }
    const k = e.seats.indexOf(p.id);
    if (k >= 0) e.seats[k] = 0;
    const sp = Math.hypot(e.vx, e.vz);
    if (k === 0) this.leaveWheel(p, e);
    this.putOut(p, e);
    // out of one that is going: they go on with some of its speed, and hit the ground
    if (sp > 2) {
      s.vx = e.vx * 0.6;
      s.vz = e.vz * 0.6;
      if (sp > JUMP_HURT_FROM) g.damagePlayer(p, (sp - JUMP_HURT_FROM) * JUMP_HURT, { kind: KILLER.WORLD, x: e.x, z: e.z });
    }
    this.doorSound(e);
    if (this.empty(e) && e.vx === 0 && e.vz === 0) this.rest(e);
  }

  // p is off or out of whatever they are in, where they are (a death, a new world): nothing is asked of the vehicle
  drop(p) {
    const e = this.of(p);
    const s = p.state;
    if (e) {
      const k = e.seats.indexOf(p.id);
      if (k === 0) this.leaveWheel(p, e);
      if (k >= 0) e.seats[k] = 0;
    }
    s.drive = s.driveK = s.pass = s.passN = 0;
  }

  // how much further (x) the dead notice survivor p for what they are in (Zombies.chooseTarget): a running engine is
  // heard, and its headlamp is seen at night
  notice(p) {
    const s = p.state;
    if (!s.drive && !s.pass) return 1;
    const e = this.of(p);
    if (!e) return 1;
    return (e.running ? 1.35 : 1) * (e.lights && this.g.phase === PHASE.NIGHT ? 1.4 : 1);
  }

  // The headlamps that are on, for the light that pins a Shade (Zombies.isLit): [x, y, z, fx, fz, reach] each
  lamps(out) {
    out.length = 0;
    for (const e of this.list) {
      if (!e.lights || e.state === VSTATE.WRECK || e.state === VSTATE.BROKEN) continue;
      const P = VEHICLES[e.vk];
      const fx = -Math.sin(e.yaw);
      const fz = -Math.cos(e.yaw);
      out.push(e.x + fx * P.half, e.y + 0.75, e.z + fz * P.half, fx, fz, 30);
    }
    return out;
  }
}

// what it runs into (vehicles/contact.js), what it takes and what it spares who is in it (vehicles/damage.js), the work
// done on it with [E] held and siphoning a wreck (vehicles/work.js), and /veh (vehicles/debug.js)
addMethods(Vehicles, contactMethods);
addMethods(Vehicles, damageMethods);
addMethods(Vehicles, workMethods);
addMethods(Vehicles, debugMethods);
