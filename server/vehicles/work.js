// The work done on a vehicle with [E] held, server side (laid onto Vehicles, server/vehicles.js: called on it as
// this.name(...)): fitting the parts a broken one wants, pouring fuel in, patching it up - and siphoning the fuel out of
// a wreck's tank (ACT.SIPHON, HOLD.SIPHON).
import { INTERACT_REACH, INTERACT_SLACK } from '../../shared/constants.js';
import { SOUND, NOTIFY, ITEM, AMMO, AMMO_MAX, VEH_NO } from '../../shared/defs.js';
import { ENT, HOLD, SIPHON_ID, qpos } from '../../shared/protocol.js';
import { WORLD } from '../../shared/acts.js';
import { VSTATE, VEHICLES, VEH_NAMES, FIX, REPAIR, REPAIR_HP, FIX_TIME, STARTER_TIME, FIX_FREE, REPAIR_TIME, FUEL_TIME, FUEL_POUR, SIPHON_TIME, siphonOf } from '../../shared/vehicles.js';
import { countItem, removeItem } from '../inventory.js';

export const workMethods = {
  // ---------------------------------------------------------------- fixing, fuelling, patching ([E] held)
  // What holding [E] on e would do for p now: { kind, slot } or a VEH_NO reason.
  job(p, e) {
    const P = VEHICLES[e.vk];
    const s = p.state;
    if (e.state === VSTATE.WRECK) return VEH_NO.WRECK;
    if (e.state === VSTATE.BROKEN) {
      const fix = FIX[e.vk];
      if (!e.need) return { kind: HOLD.VEH_FIX, slot: FIX_FREE, need: STARTER_TIME }; // (one of the bridgehead's: it wants only the work)
      for (let i = 0; i < fix.length; i++) if (e.need & (1 << i) && countItem(p.inv, fix[i][0]) >= fix[i][1]) return { kind: HOLD.VEH_FIX, slot: i, need: FIX_TIME };
      return VEH_NO.NO_PARTS;
    }
    const canPatch = Object.keys(REPAIR).every((k) => countItem(p.inv, +k) >= REPAIR[k]);
    const hurt = e.hp < P.hp - 1;
    const low = P.tank > 0 && e.fuel < P.tank - 1;
    if (e.state === VSTATE.DEAD) return canPatch ? { kind: HOLD.VEH_REPAIR, need: REPAIR_TIME } : VEH_NO.NO_PARTS;
    if (low && s.ammo[AMMO.FUEL] > 0) return { kind: HOLD.VEH_FUEL, need: FUEL_TIME };
    if (hurt && canPatch) return { kind: HOLD.VEH_REPAIR, need: REPAIR_TIME };
    if (low) return VEH_NO.NO_FUEL;
    if (hurt) return VEH_NO.NO_PARTS;
    return P.tank ? VEH_NO.FULL : VEH_NO.FINE;
  },

  // ACT.HOLD_BEGIN on a vehicle
  holdBegin(p, e) {
    const g = this.g;
    if (this.of(p) || !this.near(p, e)) return;
    const j = this.job(p, e);
    if (typeof j === 'number') return g.notify(NOTIFY.VEH_NEED, j, p.id);
    p.hold = { kind: j.kind, target: e.id, t: 0, need: j.need, slot: j.slot ?? 0 };
  },

  holdOk(p, h) {
    const e = this.g.ents[h.target];
    if (!e || e.kind !== ENT.VEHICLE || e.removed || this.of(p) || !this.near(p, e, 0.4)) return false;
    const j = this.job(p, e);
    return typeof j !== 'number' && j.kind === h.kind && (j.slot ?? 0) === h.slot;
  },

  holdDone(p, h) {
    const g = this.g;
    const e = g.ents[h.target];
    if (!e) return;
    const P = VEHICLES[e.vk];
    const s = p.state;
    const d = this.driver(e);
    if (h.kind === HOLD.VEH_FIX) {
      if (h.slot !== FIX_FREE) {
        const [item, n] = FIX[e.vk][h.slot];
        if (countItem(p.inv, item) < n) return;
        removeItem(p.inv, item, n);
        p.invDirty = true;
        e.need &= ~(1 << h.slot);
      }
      g.sound(SOUND.VEH_FIX, e.x, e.y + 0.7, e.z, 30);
      if (!e.need) {
        e.state = VSTATE.OK;
        g.notify(NOTIFY.VEH_FIXED, p.id);
        g.track.event?.('vehicle_fixed', p, { kind: VEH_NAMES[e.vk], starter: e.starter });
      }
    } else if (h.kind === HOLD.VEH_FUEL) {
      const n = Math.min(FUEL_POUR, s.ammo[AMMO.FUEL], Math.ceil(P.tank - e.fuel));
      if (n <= 0) return;
      s.ammo[AMMO.FUEL] -= n;
      e.fuel = Math.min(P.tank, e.fuel + n);
      if (d) d.state.dfuel = e.fuel;
      g.sound(SOUND.VEH_FUEL, e.x, e.y + 0.7, e.z, 25);
    } else if (h.kind === HOLD.VEH_REPAIR) {
      for (const k in REPAIR) if (countItem(p.inv, +k) < REPAIR[k]) return;
      for (const k in REPAIR) removeItem(p.inv, +k, REPAIR[k]);
      p.invDirty = true;
      e.hp = Math.min(P.hp, Math.max(0, e.hp) + P.hp * REPAIR_HP);
      if (e.state === VSTATE.DEAD) {
        e.state = VSTATE.OK;
        if (d) d.state.ddead = 0;
      }
      g.sound(SOUND.VEH_FIX, e.x, e.y + 0.7, e.z, 30);
    }
    this.wire(e);
    // [E] still held: on with the next thing it wants, if there is one this survivor can do
    const j = this.job(p, e);
    if (typeof j !== 'number') p.hold = { kind: j.kind, target: e.id, t: 0, need: j.need, slot: j.slot ?? 0 };
  },

  // ---------------------------------------------------------------- siphoning a wreck (ACT.SIPHON, HOLD.SIPHON)
  wrecks() {
    const w = this.g.world;
    if (this.propsOf !== w) {
      this.propsOf = w;
      this.props = new Map();
      if (w.kind === WORLD.MAINLAND) for (const pr of w.props) if (siphonOf(pr) > 0) this.props.set(`${qpos(pr.x)},${qpos(pr.z)}`, pr);
    }
    return this.props;
  },

  siphonBegin(p, qx, qz) {
    const g = this.g;
    const key = `${qx},${qz}`;
    const pr = this.wrecks().get(key);
    if (!pr || this.of(p) || p.useItem) return;
    if (Math.hypot(pr.x - p.state.x, pr.z - p.state.z) > INTERACT_REACH + INTERACT_SLACK + 3.2) return;
    if (this.siphoned.has(key)) return g.notify(NOTIFY.SIPHONED, 0, p.id);
    p.hold = { kind: HOLD.SIPHON, target: SIPHON_ID, t: 0, need: SIPHON_TIME, key };
    g.sound(SOUND.SIPHON, pr.x, pr.y + 0.6, pr.z, 20);
  },

  siphonOk(p, h) {
    const pr = this.wrecks().get(h.key);
    return !!pr && !this.siphoned.has(h.key) && Math.hypot(pr.x - p.state.x, pr.z - p.state.z) <= INTERACT_REACH + INTERACT_SLACK + 3.6;
  },

  siphonDone(p, h) {
    const g = this.g;
    const pr = this.wrecks().get(h.key);
    if (!pr || this.siphoned.has(h.key)) return;
    this.siphoned.add(h.key);
    const n = siphonOf(pr);
    const s = p.state;
    const fit = Math.min(n, AMMO_MAX[AMMO.FUEL] - s.ammo[AMMO.FUEL]);
    s.ammo[AMMO.FUEL] += fit;
    if (n > fit) g.dropItem(ITEM.AMMO_FUEL, n - fit, s.x, s.y, s.z, { spread: 0.6 });
    g.notify(NOTIFY.SIPHONED, n, p.id);
    g.pickupEvent(p, ITEM.AMMO_FUEL, fit);
  },
};
