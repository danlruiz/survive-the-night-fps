// /veh, the admin chat command for the vehicles (laid onto Vehicles, server/vehicles.js: called on it as
// this.debug(...) from Game.debugCommand).
import { VEH, VSTATE, VEHICLES, VEH_NAMES, fixMask, STARTERS, starterSpots } from '../../shared/vehicles.js';
import { groundAt } from '../../shared/collision.js';

export const debugMethods = {
  // /veh [list | moped | car | bike | fix | fuel | break | wreck | hp <n> | tp <n> | in <n> | out | starters]
  debug(p, args) {
    const g = this.g;
    const s = p.state;
    const say = (t) => g.sendChat(p, 0, 1, t);
    const near = () => {
      let best = this.of(p);
      let bd = 30;
      if (!best) {
        for (const e of this.list) {
          const d = Math.hypot(e.x - s.x, e.z - s.z);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
      }
      return best;
    };
    const what = args[1] || 'list';
    const kind = { moped: VEH.MOPED, car: VEH.CAR, bike: VEH.BIKE, bicycle: VEH.BIKE }[what];
    if (kind) {
      const fx = -Math.sin(s.yaw);
      const fz = -Math.cos(s.yaw);
      const P = VEHICLES[kind];
      // (/veh car at <x> <z> <yaw in degrees> [broken] [tint]: exactly there)
      const at = args[2] === 'at';
      const broken = args[at ? 6 : 2] === 'broken';
      const [x, z, yaw] = at ? [+args[3], +args[4], ((+args[5] || 0) * Math.PI) / 180] : [s.x + fx * (P.half + 1.6), s.z + fz * (P.half + 1.6), s.yaw + Math.PI / 2];
      const e = this.make(kind, x, z, yaw, { state: broken ? VSTATE.BROKEN : VSTATE.OK, need: broken ? fixMask(kind) : 0, fuel: P.tank, hp: P.hp, tint: +args[at ? 7 : 3] || 0 });
      return say(e ? `a ${VEH_NAMES[kind]} (${e.id})` : 'no entity id left for it');
    }
    if (what === 'list') return say(this.list.map((e, i) => `${i}:${VEH_NAMES[e.vk]}${e.quest ? '*' : e.starter ? '+' : ''}@${Math.round(e.x)},${Math.round(e.z)} ${['broken', 'ok', 'dead', 'wreck'][e.state]}`).join('  ') || 'this map has no vehicles (only the mainland has)');
    if (what === 'starters') {
      const n = Math.max(1, +args[2] || STARTERS.length);
      const spots = starterSpots(g.world);
      for (let team = g.players.size; this.starters < Math.min(n, spots.length) && team < 64; team++) this.provide(team); // (as for a bigger team)
      return say(`${this.starters} of the bridgehead's vehicles are out`);
    }
    if (what === 'tp' || what === 'in') {
      const e = this.list[+args[2] || 0];
      if (!e) return say('no such vehicle (/veh list)');
      if (this.of(p)) this.exit(p);
      if (what === 'in') {
        if (e.state !== VSTATE.OK) {
          e.state = VSTATE.OK;
          e.need = 0;
        }
        const k = this.freeSeat(e, args[3] ? +args[3] : 0);
        if (k < 0) return say('no seat free');
        s.ride = s.cart = 0;
        s.pinned = s.pulled = 0;
        this.sit(p, e, k);
        return;
      }
      const P = VEHICLES[e.vk];
      s.x = e.x + Math.cos(e.yaw) * -(P.halfW + 1.2);
      s.z = e.z - Math.sin(e.yaw) * -(P.halfW + 1.2);
      s.y = groundAt(g.world, s.x, s.z, e.y + 1, 0.3);
      s.vx = s.vy = s.vz = 0;
      s.yaw = Math.atan2(-(e.x - s.x), -(e.z - s.z));
      p.selfSync = true;
      g.fillHistory(p);
      return;
    }
    if (what === 'out') return this.exit(p);
    const e = near();
    if (!e) return say('no vehicle within 30 m');
    const P = VEHICLES[e.vk];
    const d = this.driver(e);
    if (what === 'fix') {
      e.state = VSTATE.OK;
      e.need = 0;
      e.hp = P.hp;
      if (d) d.state.ddead = 0;
    } else if (what === 'fuel') {
      e.fuel = args[2] !== undefined ? Math.max(0, Math.min(P.tank, +args[2] || 0)) : P.tank;
      if (d) d.state.dfuel = e.fuel;
    } else if (what === 'hp') {
      e.hp = Math.max(1, Math.min(P.hp, (+args[2] || 100) * 0.01 * P.hp));
    } else if (what === 'break' || what === 'wreck') {
      // (a blow does nothing to one that is broken down already: it runs first. Wrecked: broken down, then burnt out)
      if (e.state === VSTATE.BROKEN) e.state = VSTATE.OK;
      this.damage(e, e.hp + 1);
      if (what === 'wreck') this.damage(e, P.hp);
    } else if (what === 'remove') {
      for (const id of e.seats) if (id && g.players.get(id)) this.exit(g.players.get(id));
      this.unpark(e);
      g.removeEntity(e);
      return;
    } else if (what === 'lights') {
      e.lights = e.lights ? 0 : 1;
    } else return say('Usage: /veh [list | moped | car | bike [broken] | fix | fuel [n] | hp <percent> | break | wreck | lights | remove | tp <n> | in <n> [seat] | out | starters [n]]');
    this.wire(e);
  },
};
