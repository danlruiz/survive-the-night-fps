// What the survivors build: putting a piece up where it fits (build), taking it down for a refund (demolish),
// mending it and keeping torches and campfires going (repair), the dead's blows on it (damageStructure), fire on it
// (STRUCT_FIRE: igniteStructure, burnStructure, extinguish) and its upkeep each tick (updateStructures).
import { PHASE, CAMPFIRE_HEAL_RADIUS, BUILD_REACH, MAX_STRUCTURES, SLOT_BUILD, PLAYER_RADIUS, INTERACT_SLACK, NOISE } from '../../shared/constants.js';
import { ITEM, STRUCT, STRUCT_DEFS, repairCostOf, demolishRefund, SCHEM_BIT, SOUND, EVT, NOTIFY, HEARD, STRUCT_FIRE, structBurns } from '../../shared/defs.js';
import { ENT, qpos } from '../../shared/protocol.js';
import { makeBox, COL, footprintContains, overlapBoxes } from '../../shared/collision.js';
import { removeItem, countItem, payCost } from '../inventory.js';

export const methods = {
  structCollider(type, x, y, z, rot8, id) {
    const def = STRUCT_DEFS[type];
    const yaw = (rot8 / 256) * Math.PI * 2;
    let flags = COL.STRUCT;
    if (!def.block) flags |= COL.NOBLOCK;
    if (def.humanPass) flags |= COL.HUMANPASS;
    if (type === STRUCT.BARBED_WIRE || type === STRUCT.CAMPFIRE) flags |= COL.NOBULLET;
    return makeBox(x, z, y - 0.3, y + def.sy, def.sx, def.sz, yaw, flags, id);
  },

  build(p, type, x, z, rot8) {
    const s = p.state;
    const def = STRUCT_DEFS[type];
    if (!def || s.slot !== SLOT_BUILD) return;
    if (this.time - p.actionT < 0.25) return;
    p.actionT = this.time;
    const fail = (why = NOTIFY.CANT_BUILD_HERE, arg = 0) => {
      this.notify(why, arg, p.id);
    };
    if (def.schem && !(this.unlocked & (1 << SCHEM_BIT[def.schem]))) return fail(NOTIFY.LOCKED, def.schem);
    if (this.structures.length >= MAX_STRUCTURES) return fail(NOTIFY.STRUCT_CAP);
    // on the ground of the level the builder is on: down in the mine the floor of the drift, never the rock beside
    // it, and nothing is put up on one level from the other
    const mine = this.world.mine;
    let y = this.world.floorAt(x, z, s.y + 0.5);
    const down = !!mine && mine.under(x, y + 0.3, z);
    if (mine && (down !== mine.under(s.x, s.y + 0.3, s.z) || (down && mine.sdf(x, z) > -0.3))) return fail();
    let door = null;
    if (def.snap === 'door') {
      door = this.world.openingNear(x, z, 1.4);
      if (!door) return fail(NOTIFY.DOOR_ONLY);
      x = door.x;
      z = door.z;
      y = door.y;
      rot8 = Math.round((((door.ry % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 256) & 255;
    }
    // the client's ghost reaches BUILD_REACH from where that client stands; we see the player a moment earlier
    if (Math.hypot(x - s.x, z - s.z) > BUILD_REACH + INTERACT_SLACK + (door ? 1 : 0)) return fail();
    const car = this.world.car;
    if (Math.hypot(x - car.x, z - car.z) < 3.2) return fail();
    if (this.world.isDeepWater(x, z)) return fail();
    const plan = this.planFor(p, def.cost);
    if (!plan) return fail(NOTIFY.NOT_ENOUGH);
    const col = this.structCollider(type, x, y, z, rot8, 0);
    // overlaps: static world, other blocking structures, players
    const tmp = [];
    if (!door) {
      this.world.staticGrid.query(x, z, col.r + 0.2, tmp);
      for (const o of tmp) {
        if (o.y1 < y + 0.2 || (down && o.y0 > y + def.sy + 0.5)) continue; // (what stands on the ground over a drift is not in the way down there)
        if (overlapBoxes(col, o)) return fail();
      }
    }
    this.world.structGrid.query(x, z, col.r + 0.2, tmp);
    for (const o of tmp) {
      const bothBlock = !(o.flags & COL.NOBLOCK) && def.block;
      const bothTrap = o.flags & COL.NOBLOCK && !def.block;
      if ((bothBlock || bothTrap) && overlapBoxes(col, o, -0.05)) return fail();
    }
    if (def.block) {
      for (const q of this.players.values()) {
        if (!q.alive) continue;
        if (def.humanPass && !q.zombie) continue;
        if (footprintContains(col, q.state.x, q.state.z, PLAYER_RADIUS)) return fail();
      }
      for (const zb of this.zombies) if (!zb.dead && footprintContains(col, zb.x, zb.z, zb.def.radius * 0.8)) return fail();
    }
    const e = {
      kind: ENT.STRUCTURE,
      stype: type,
      rot8,
      x,
      y,
      z,
      hp: def.hp,
      maxHp: def.hp,
      minHealth: 1,
      placedAt: this.time,
      state: 1,
      owner: p.id,
      burnLeft: def.burn || 0,
      fire: 0, // s it has been on fire (STRUCT_FIRE: igniteStructure); 0: not burning
      fireDmg: 0,
      collider: null,
      trapTick: 0,
    };
    if (!this.spawnEntity(e)) return fail(); // (no entity id left: nothing is built, so nothing is paid)
    payCost(p.inv, plan.take);
    this.madeExtra(p, plan);
    p.invDirty = true;
    e.collider = this.structCollider(type, x, y, z, rot8, e.id);
    this.world.structGrid.add(e.collider);
    this.nav.addStructure(e.collider);
    this.structures.push(e);
    this.track.build(p, type);
    if (type === STRUCT.WORKBENCH) this.globalDirty = true;
    this.sound(SOUND.BUILD, x, y + 0.8, z, 35);
    this.zm.noise(x, z, NOISE.BUILD, y, p, HEARD.BUILD);
  },

  demolish(p, id) {
    const e = this.ents[id];
    if (!e || e.kind !== ENT.STRUCTURE) return;
    const s = p.state;
    if (Math.hypot(e.x - s.x, e.z - s.z) > 5) return;
    const back = demolishRefund(e, this.time); // (undo window, then 75% of lowest health/fuel share)
    for (const k in back) {
      const n = back[k];
      const taken = this.giveItem(p, +k, n);
      if (taken > 0) this.pickupEvent(p, +k, taken);
      if (taken < n) this.dropItem(+k, n - taken, e.x, e.y, e.z); // only what did not fit, not the whole refund again
    }
    this.power.demolished(p, e); // (what is left in a generator's tank comes back)
    p.invDirty = true;
    this.destroyStructure(e, false);
  },

  repair(p, id) {
    const e = this.ents[id];
    if (!e || e.kind !== ENT.STRUCTURE) return;
    const s = p.state;
    const hammer = s.weapons[SLOT_BUILD] === ITEM.HAMMER;
    if (Math.hypot(e.x - s.x, e.z - s.z) > 4.5) return;
    if (e.stype === STRUCT.CAMPFIRE) {
      if (hammer) this.feedFire(p, e);
      return;
    }
    if (e.fire > 0) {
      // a piece on fire (STRUCT_FIRE): the swing beats the flames out, and costs nothing. Mending it is the next one's
      if (this.time - p.actionT < 0.6) return;
      if (!hammer || s.slot !== SLOT_BUILD) return this.notify(NOTIFY.NEED_HAMMER, 0, p.id);
      p.actionT = this.time;
      this.extinguish(e);
      return;
    }
    if (e.hp >= e.maxHp && !(e.stype === STRUCT.TORCH && e.burnLeft <= 0)) return;
    if (this.time - p.actionT < 0.6) return;
    if (!hammer || s.slot !== SLOT_BUILD) return this.notify(NOTIFY.NEED_HAMMER, 0, p.id); // (the hammer in hand, not just carried)
    if (e.stype === STRUCT.TORCH) {
      if (countItem(p.inv, ITEM.CLOTH) < 1) return this.notify(NOTIFY.NOT_ENOUGH, ITEM.CLOTH, p.id);
      removeItem(p.inv, ITEM.CLOTH, 1);
      e.burnLeft = STRUCT_DEFS[STRUCT.TORCH].burn;
      e.hp = e.maxHp;
    } else {
      const plan = this.planFor(p, repairCostOf(e.stype));
      if (!plan) return this.notify(NOTIFY.NOT_ENOUGH, 0, p.id);
      payCost(p.inv, plan.take);
      this.madeExtra(p, plan);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.35);
    }
    p.actionT = this.time;
    p.invDirty = true;
    this.sound(SOUND.BUILD, e.x, e.y + 0.8, e.z, 30);
    this.zm.noise(e.x, e.z, NOISE.BUILD, e.y, p, HEARD.BUILD);
  },

  damageStructure(e, amount) {
    if (e.removed) return;
    e.hp -= amount;
    this.noteStructureHealth(e);
    this.sound(STRUCT_DEFS[e.stype].metal ? SOUND.METAL_HIT : SOUND.WOOD_HIT, e.x, e.y + 1, e.z, 40);
    if (e.hp <= 0) this.destroyStructure(e, true);
  },

  noteStructureHealth(e) {
    if (!e || e.maxHp <= 0) return;
    const share = Math.max(0, Math.min(1, e.hp / e.maxHp));
    e.minHealth = Math.min(Number.isFinite(e.minHealth) ? e.minHealth : 1, share);
  },
  // Sets a piece alight (a flammer came near it, or the fire next to it spread). false: it does not burn, or already is
  igniteStructure(e) {
    if (!e || e.removed || e.kind !== ENT.STRUCTURE || e.fire > 0 || !structBurns(e.stype)) return false;
    e.fire = 1e-6;
    e.fireDmg = 0;
    this.sound(SOUND.FIRE_WHOOSH, e.x, e.y + 1, e.z, 40);
    return true;
  },

  extinguish(e) {
    if (!(e.fire > 0)) return;
    e.fire = 0;
    e.fireDmg = 0;
    this.sound(SOUND.ACID_SIZZLE, e.x, e.y + 1, e.z, 30);
  },

  // A burning piece (updateStructures): it takes STRUCT_FIRE.dps (the night's hurt, as the dead's blows are), dealt
  // a couple of times a second so it is not a hit sound every tick, and from spreadAfter s on may set what touches it
  // alight. false: it burned down
  burnStructure(e, dt) {
    e.fire += dt;
    e.fireDmg += STRUCT_FIRE.dps * this.diff.hurt * dt;
    if (e.fireDmg >= 12) {
      const d = e.fireDmg;
      e.fireDmg = 0;
      e.hp -= d;
      this.noteStructureHealth(e);
      if (e.hp <= 0) {
        this.destroyStructure(e, true);
        return false;
      }
    }
    if (e.fire >= STRUCT_FIRE.spreadAfter && this.rng() < STRUCT_FIRE.spread * dt) {
      const near = [];
      this.world.structGrid.query(e.x, e.z, e.collider.r + STRUCT_FIRE.gap + 3.5, near);
      const catches = near.filter((c) => c !== e.collider && overlapBoxes(e.collider, c, STRUCT_FIRE.gap / 2) && this.ents[c.id] && !(this.ents[c.id].fire > 0) && structBurns(this.ents[c.id].stype));
      if (catches.length) this.igniteStructure(this.ents[catches[Math.floor(this.rng() * catches.length)].id]);
    }
    return true;
  },

  destroyStructure(e, broken) {
    if (e.removed) return;
    this.world.structGrid.remove(e.collider);
    this.nav.removeStructure(e.collider);
    this._listRemove(this.structures, e);
    if (e.stype === STRUCT.WORKBENCH) this.globalDirty = true;
    if (broken) {
      if (this.phase === PHASE.NIGHT) this.nightStats.structLost++;
      this.track.structureLost(e);
      this.emit(
        (w) => {
          w.u8(EVT.STRUCT_BREAK);
          w.i16(qpos(e.x));
          w.i16(qpos(e.y));
          w.i16(qpos(e.z));
          w.u8(e.stype);
        },
        { x: e.x, z: e.z, r: 120 },
      );
      this.sound(STRUCT_DEFS[e.stype].metal ? SOUND.METAL_HIT : SOUND.WOOD_BREAK, e.x, e.y + 1, e.z, 70);
    }
    this.removeEntity(e);
  },

  // lit campfire within the heal radius?
  nearLitFire(x, z) {
    for (const e of this.structures) {
      if (e.stype !== STRUCT.CAMPFIRE || e.burnLeft <= 0) continue;
      if (Math.hypot(e.x - x, e.z - z) < CAMPFIRE_HEAL_RADIUS) return true;
    }
    return false;
  },

  updateStructures(dt) {
    this.power.update(dt); // generators burn their fuel, hum and feed the floodlights
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const e = this.structures[i];
      if (e.fire > 0 && !this.burnStructure(e, dt)) continue;
      if (e.stype === STRUCT.TORCH) {
        e.burnLeft -= dt;
        e.state = e.burnLeft > 0 ? 1 : 0;
        if (e.burnLeft < -30) this.destroyStructure(e, false);
      } else if (e.stype === STRUCT.CAMPFIRE) {
        if (e.burnLeft > 0) {
          e.burnLeft -= dt;
          // the dead avoid nothing, but stepping into the flames hurts
          if (this.tick % 5 === 0) {
            this.zm.forNear(e.x, e.z, 1.4, (z) => {
              if (!z.dead && !z.def.flying && Math.hypot(z.x - e.x, z.z - e.z) < 1.1) this.combat.damageZombie(z, 22 * dt * 5, null, { fire: true });
            });
          }
        }
        e.state = e.burnLeft > 0 ? 1 : 0;
      }
    }
  },
};
