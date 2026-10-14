// The damage a vehicle takes, server side (laid onto Vehicles, server/vehicles.js: called on it as this.name(...)):
// blows, crashes, blasts and rounds; broken down by enough of it, burnt out by more; what of a blow meant for who is
// in it the car takes instead (shield, onKnock); the river taking one away.
import { NOISE } from '../../shared/constants.js';
import { SOUND, NOTIFY, KILLER, VEH_OFFS, IMPACT } from '../../shared/defs.js';
import { ENT } from '../../shared/protocol.js';
import { VEH, VSTATE, VEHICLES, COL_VEHICLE } from '../../shared/vehicles.js';

const CRASH_FROM = 3; // m/s into something solid before it costs anything...
const CRASH_DMG = { [VEH.CAR]: 1.5, [VEH.MOPED]: 1.2, [VEH.BIKE]: 0.8 }; // ...then this x (m/s over it)^2
const CRASH_HURT_FROM = 11; // m/s: who is in a car is hurt by a crash from here...
const CRASH_HURT = 4; // ...by this per m/s over it; a rider thrown: THROWN_HURT (contact.js) per m/s over the throw
const SHELL = 0.5; // a car keeps the dead off who is in it while it has this share of its health; under it they get in
const WRECK_POOL = 0.6; // broken down, it takes this share of its health again before it is burnt out for good

export const damageMethods = {
  // amount of damage to e. Broken down by it, it rolls to a stop; broken down already, enough more burns it out.
  damage(e, amount) {
    const g = this.g;
    if (!(amount > 0) || e.state === VSTATE.WRECK || e.state === VSTATE.BROKEN) return;
    const P = VEHICLES[e.vk];
    if (e.state === VSTATE.DEAD) {
      e.wreckHp -= amount;
      if (e.wreckHp > 0) return;
      e.state = VSTATE.WRECK;
      e.hp = 0;
      e.lights = 0;
      this.emptyWreck(e);
      g.sound(SOUND.VEH_BREAK, e.x, e.y + 0.8, e.z, 90);
      g.impact(IMPACT.SPARK, e.x, e.y + 0.8, e.z);
      this.wire(e);
      return;
    }
    const shell = P.shell && e.hp > P.hp * SHELL;
    e.hp -= amount;
    if (shell && e.hp <= P.hp * SHELL) g.sound(SOUND.VEH_GLASS, e.x, e.y + 1, e.z, 50);
    if (e.hp > 0) return;
    e.hp = 0;
    e.state = VSTATE.DEAD;
    e.wreckHp = P.hp * WRECK_POOL;
    const d = this.driver(e);
    if (d) d.state.ddead = 1;
    for (const id of e.seats) if (id) g.notify(NOTIFY.VEH_BROKE, 0, id);
    g.sound(SOUND.VEH_BREAK, e.x, e.y + 0.8, e.z, 70);
    this.wire(e);
  },

  // 'veh_river': it went into the mainland's river (shared/vehicles.js). The current has it: whoever was in it is
  // thrown out on the bank, and it is gone downstream.
  riverEvent(p, ev) {
    const e = this.g.ents[ev.id];
    if (e && e.kind === ENT.VEHICLE && !e.removed) this.swept(e);
  },
  swept(e) {
    const g = this.g;
    for (const id of e.seats) {
      const q = id ? g.players.get(id) : null;
      if (q) {
        g.notify(NOTIFY.VEH_WRECKED, 0, q.id);
        this.exit(q);
      }
    }
    g.sound(SOUND.VEH_CRASH, e.x, e.y + 0.6, e.z, 80);
    this.unpark(e);
    g.removeEntity(e);
  },

  // 'veh_crash' from a driver's command (or from one rolling on empty): it struck something solid at v m/s
  crashEvent(p, ev) {
    const e = this.g.ents[ev.id];
    if (e && e.kind === ENT.VEHICLE && !e.removed) this.crash(e, ev.v, ev.col);
  },
  crash(e, v, col) {
    const g = this.g;
    if (v > CRASH_FROM) {
      const d = (v - CRASH_FROM) * (v - CRASH_FROM) * CRASH_DMG[e.vk];
      this.damage(e, d);
      // what it struck, if that is one of them standing
      const other = col && col.flags & COL_VEHICLE ? g.ents[col.id] : null;
      if (other && other !== e && other.kind === ENT.VEHICLE) this.damage(other, d * 0.6);
      g.sound(SOUND.VEH_CRASH, e.x, e.y + 0.6, e.z, 80);
      this.noise(e, NOISE.CRASH);
    }
    if (VEHICLES[e.vk].shell && v > CRASH_HURT_FROM) {
      for (const id of e.seats) {
        const q = id ? g.players.get(id) : null;
        if (q) g.damagePlayer(q, (v - CRASH_HURT_FROM) * CRASH_HURT, { kind: KILLER.WORLD, x: e.x, z: e.z });
      }
    }
  },

  // 'veh_skid': the tyres let go (others hear and see it off the flag)
  skid(p) {
    const e = this.of(p);
    if (e) e.skidT = 0.25;
  },

  // Something of the dead's has hurt survivor p (Game.damagePlayer): how much of it gets to them. In a car that still
  // has its glass, none - the car takes it; in one whose windows are in, half. On two wheels all of it, and it drags
  // at the rider: slowed, and at a crawl pulled off.
  shield(p, amount) {
    const e = this.of(p);
    if (!e) return amount;
    const g = this.g;
    const P = VEHICLES[e.vk];
    if (P.shell) {
      if (e.state !== VSTATE.WRECK && e.hp > P.hp * SHELL) {
        this.damage(e, amount * 0.6);
        return 0;
      }
      this.damage(e, amount * 0.4);
      return amount * 0.5;
    }
    if (p.state.drive === e.id) {
      const s = p.state;
      s.vx *= 0.55;
      s.vz *= 0.55;
      if (Math.hypot(s.vx, s.vz) < 3.5) {
        g.notify(NOTIFY.VEH_OFF, VEH_OFFS.PULLED, p.id);
        this.exit(p);
        p.state.stunT = Math.max(p.state.stunT, 0.35);
      }
    }
    return amount;
  },

  // A blow that would knock survivor p off their feet (Zombies.knock). In a car it shoves the car and they keep
  // their seat (true: the knock is not theirs). On two wheels they are off it, and knocked as anyone.
  onKnock(p, fromX, fromZ, power) {
    const e = this.of(p);
    if (!e) return false;
    const g = this.g;
    if (VEHICLES[e.vk].shell) {
      const dx = e.x - fromX;
      const dz = e.z - fromZ;
      const l = Math.hypot(dx, dz) || 1;
      const d = this.driver(e);
      const t = d ? d.state : e;
      t.vx += (dx / l) * power * 0.3;
      t.vz += (dz / l) * power * 0.3;
      if (!d) this.unpark(e);
      this.damage(e, power * 9);
      return true;
    }
    g.notify(NOTIFY.VEH_OFF, VEH_OFFS.KNOCKED, p.id);
    this.exit(p);
    return false;
  },

  // a blast at (x, y, z)
  blast(x, y, z, radius, amount) {
    for (const e of this.list) {
      const d = Math.hypot(e.x - x, e.z - z) - VEHICLES[e.vk].half * 0.6;
      if (d < radius && Math.abs(e.y - y) < radius + 2) this.damage(e, amount * (1 - Math.max(0, d) / radius));
    }
  },

  // a bullet stopped by the box of one standing empty (Combat.fire)
  shot(col, dmg) {
    const e = this.g.ents[col.id];
    if (e && e.kind === ENT.VEHICLE) this.damage(e, dmg * 0.35);
  },
};
