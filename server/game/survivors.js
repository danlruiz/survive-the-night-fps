// A survivor's body: put into the world with a kit (spawnHuman: the starting kit, what a returning player left
// with, or what a death gives back at dawn), beside the team when the run is under way (pickJoinSpawn), turned into
// one of the dead (spawnPlayerZombie) and back again at sunrise (returnFallen), and what each tick does to them
// (updatePlayers: rising after a death, drowning, burning, bleeding out, healing, the flashlight, an item in use).
import { HISTORY_TICKS, PHASE, PLAYER_MAX_HP, ZOMBIE_PLAYER_MAX_HP, HEAL_DELAY, HEAL_RATE, HEAL_RATE_CAMPFIRE, FLASHLIGHT_MAX, FLASHLIGHT_DRAIN, FLASHLIGHT_RECHARGE, PLAYER_RADIUS, PLAYER_HEIGHT, WATER_LEVEL, TALK_CLEAR, TALK_RANGE } from '../../shared/constants.js';
import { ITEM, WEAPONS, AMMO, AMMO_MAX, AMMO_ITEMS, SOUND, NOTIFY, KILLER } from '../../shared/defs.js';
import { createPlayerState } from '../../shared/playersim.js';
import { groundAt, resolveBody } from '../../shared/collision.js';
import { swimming, inRiver, DROWN_DPS, RIVER_DPS } from '../../shared/swim.js';
import { createInventory, addItem } from '../inventory.js';
import { playerMods } from '../loadouts.js';

// Someone who joins a run in progress is put down beside the team (pickJoinSpawn): JOIN_NEAR_MIN..MAX metres from a
// teammate, at whichever of JOIN_TRIES spots around them is furthest from the dead (nothing within JOIN_CLEAR is
// as good as it gets). If even that one has a zombie within JOIN_LAP, the ring out to JOIN_FAR_MAX is tried too.
const JOIN_NEAR_MIN = 2.5;
const JOIN_NEAR_MAX = 9;
const JOIN_FAR_MAX = 22;
const JOIN_TRIES = 48;
const JOIN_CLEAR = 15;
const JOIN_LAP = 6;
// What a survivor starts with. Day 1's kit is the opening hand; someone who joins on a later day gets a little more
// 9mm, bandages and light for each day gone by (first-pass numbers): enough to be of use that night, well short of
// what those days of scavenging turn up - no primary, no armour, no medkit, nothing to throw.
export const STARTER_TOOLS = [0, ITEM.PISTOL, ITEM.KNIFE, 0, ITEM.HAMMER]; // by weapon slot
export function starterKit(day = 1, diff = null) {
  const d = Math.max(0, day - 1);
  const ammo = diff?.ammo ?? 1;
  const bandages = diff?.bandages ?? 1;
  return {
    mag: WEAPONS[ITEM.PISTOL].mag,
    ammo: Math.min(AMMO_MAX[AMMO.P9], Math.max(0, Math.round((36 + 24 * d) * ammo))), // 9mm in reserve
    items: [
      [ITEM.BANDAGE, Math.max(1, Math.round((2 + Math.min(3, d)) * bandages))],
      [ITEM.TORCH, d ? 2 : 1],
      [ITEM.WOOD, 6],
      [ITEM.NAILS, 8],
      [ITEM.STICK, 4],
      [ITEM.CLOTH, 1],
    ],
  };
}
// What a player who died comes back with at dawn (returnFallen), next to the tools every survivor has (pistol,
// knife, hammer): the magazine in the pistol and one bandage. Enough for a daytime walk back to where they fell;
// nothing to hold a night with. Against the starting kit that is 36 rounds, a bandage, the torch and two
// barricades' worth of wood and nails short - and everything they had found lies where they died (dropAll), for
// 240 s: still there at sunrise after a death in the night, gone after one earlier in the day unless a teammate
// picked it up. First-pass numbers. The shape is a starting kit's: rounds in the pistol, 9mm in reserve, pack items.
// They are put down beside the team, where a late joiner would be (pickJoinSpawn).
const RETURN_KIT = { mag: WEAPONS[ITEM.PISTOL].mag, ammo: 0, items: [[ITEM.BANDAGE, 1]] };

export const methods = {
  // Where someone who joins a run in progress is put down: beside the team instead of alone at the car, which by
  // then can be 250 m and a horde away from anyone. null = the car will do: nobody alive to join, or the team is
  // within clear earshot of it anyway (day 1 before anyone has set off).
  pickJoinSpawn(p) {
    // the team: the survivor with the most others within earshot (one on their feet before one who is down)
    let a = null;
    let most = -1;
    for (const q of this.players.values()) {
      if (q === p || !q.alive || q.zombie) continue;
      let n = q.downed ? 0 : 0.5;
      for (const o of this.players.values()) if (o !== q && o !== p && o.alive && !o.zombie && Math.hypot(o.state.x - q.state.x, o.state.z - q.state.z) < TALK_RANGE) n++;
      if (n > most) {
        most = n;
        a = q.state;
      }
    }
    const w = this.world;
    if (!a || Math.hypot(a.x - w.start.x, a.z - w.start.z) < TALK_CLEAR) return null;
    const ay = groundAt(w, a.x, a.z, a.y, PLAYER_RADIUS * 0.7);
    const dead = []; // zombies and player-zombies that could be near a spot
    for (const z of this.zombies) if (!z.dead && Math.hypot(z.x - a.x, z.z - a.z) < JOIN_FAR_MAX + JOIN_CLEAR) dead.push(z);
    for (const q of this.players.values()) if (q.zombie && q.alive) dead.push(q.state);
    const lim = this.world.half - 3;
    const body = { x: 0, y: 0, z: 0 };
    const a0 = this.rng() * Math.PI * 2;
    let spot = null;
    let far = -1;
    // right beside them; only if the dead are all over that ground, a little further out
    for (const [r0, r1] of [[JOIN_NEAR_MIN, JOIN_NEAR_MAX], [JOIN_NEAR_MAX, JOIN_FAR_MAX]]) {
      for (let k = 0; k < JOIN_TRIES; k++) {
        const ang = a0 + ((k + this.rng()) / JOIN_TRIES) * Math.PI * 2;
        const d = r0 + this.rng() * (r1 - r0);
        const x = a.x + Math.sin(ang) * d;
        const z = a.z + Math.cos(ang) * d;
        if (Math.abs(x) > lim || Math.abs(z) > lim || this.nav.isBlocked(x, z)) continue;
        // somewhere to stand: on the teammate's level (not down a bank, not up on a counter), dry, with room for a
        // body clear of every wall, prop, tree and built structure...
        const y = groundAt(w, x, z, ay, PLAYER_RADIUS * 0.7);
        if (Math.abs(y - ay) > 1 || y < WATER_LEVEL) continue;
        body.x = x;
        body.y = y;
        body.z = z;
        if (resolveBody(w, body, PLAYER_RADIUS, PLAYER_HEIGHT)) continue;
        // ...and a straight walk to the teammate: no wall, barricade or door boards in between
        if (!this.zm.clearLine(x, y + 0.6, z, a.x, ay + 0.6, a.z)) continue;
        // out of the fight if there is such a spot: the one furthest from the nearest of the dead
        let near = JOIN_CLEAR;
        for (const e of dead) near = Math.min(near, Math.hypot(e.x - x, e.z - z));
        if (near > far) {
          far = near;
          spot = { x, y, z, yaw: Math.atan2(-(a.x - x), -(a.z - z)) }; // facing the teammate
        }
      }
      if (far >= JOIN_LAP) break;
    }
    // nowhere around them (a closet, a ledge): the teammate's own spot is good by construction - players do not
    // collide with each other
    return spot || { x: a.x, y: a.y, z: a.z, yaw: a.yaw };
  },

  // kit: what they start with (starterKit, or what a returning player left with); beside: put them with the team
  // if there is one to join. A respawn into a run in progress would pass both, as handleJoin does.
  spawnHuman(p, kit = starterKit(this.day, this.diff), beside = false) {
    const s = p.state;
    const fresh = createPlayerState();
    Object.assign(s, fresh);
    s.weapons = kit.tools ? STARTER_TOOLS.map((t, slot) => (kit.tools.includes(slot) ? t : 0)) : STARTER_TOOLS.slice(); // (tools: parkKit)
    s.mags = [0, kit.mag];
    this.putAtStart(s);
    if (beside) Object.assign(s, this.pickJoinSpawn(p)); // (x, y, z, yaw - or nothing: the car it is)
    s.perks = p.perks;
    p.maxHp = PLAYER_MAX_HP + playerMods(p).hp;
    p.hp = p.maxHp;
    p.armor = 0;
    p.armorMax = 0;
    p.armorItem = 0;
    p.backpackItem = 0;
    p.alive = true;
    p.zombie = false;
    p.downed = false;
    p.bleed = 0;
    p.revivedBy = 0;
    p.respawnT = 0;
    p.becomeZombie = false;
    p.flashlight = false;
    p.battery = FLASHLIGHT_MAX;
    this.endUse(p);
    p.hold = null;
    p.inv = createInventory();
    p.splitKeep.clear();
    p.loadoutWeapons = [null, null, null, null, null];
    p.loadoutWeaponEffects = {};
    p.loadoutEffects = null;
    p.loadoutNight = {};
    p.loadoutArmor = null;
    p.loadoutBackpack = null;
    for (const [item, n] of kit.items) addItem(p.inv, item, n);
    s.ammo = AMMO_ITEMS.map((_, i) => (i === AMMO.P9 ? kit.ammo : 0));
    p.kit = kit; // what they were handed: it goes with them if they leave the game (parkKit)
    this.loadouts.apply(p);
    p.invDirty = true;
    this.fillHistory(p);
    this.playersDirty = true;
  },

  spawnPlayerZombie(p) {
    const s = p.state;
    Object.assign(s, createPlayerState());
    s.zombie = 1;
    s.perks = p.perks; // (the simulation leaves them out while turned: perkMods(0))
    s.weapons = [0, 0, 0, 0, 0];
    s.slot = 2;
    const humans = this.humans();
    const sp = this.zm.pickHordeSpawn(humans) || { x: 200, z: 0 };
    s.x = sp.x;
    s.z = sp.z;
    s.y = groundAt(this.world, s.x, s.z, 80, 0.3, false);
    p.zombie = true;
    p.alive = true;
    p.downed = false;
    p.hp = ZOMBIE_PLAYER_MAX_HP;
    p.maxHp = ZOMBIE_PLAYER_MAX_HP;
    p.armor = 0;
    p.armorMax = 0;
    p.flashlight = false;
    this.endUse(p);
    p.hold = null;
    this.fillHistory(p);
    this.playersDirty = true;
    this.track.turned(p);
  },

  // Sunrise, with DAWN_RETURN on: every player who died since the last one - risen as a zombie, or still lying
  // where they fell - is a survivor again, beside the team, with RETURN_KIT in place of the starting kit. The night
  // they died is still the night they hunted. The final stand stops the clock, so there is no dawn in it: a death
  // there lasts to the end of the run.
  returnFallen() {
    // Whoever left dead has sat the night out. If they come back into this run now, they are a survivor, with what
    // the dead who stayed wake with: handleJoin hands back the kit parked for them (parkKit left it empty),
    // so waiting out a death offline is neither better nor worse than waiting it out as a zombie.
    for (const who of this.fallen) if (this.leftKits.has(who)) this.leftKits.set(who, RETURN_KIT);
    this.fallen.clear();
    // Nobody alive to come back to: a wipe is a loss, never a second chance. checkAllDead ends the run on the death
    // that leaves nobody standing, in the tick it happens, so the clock does not reach dawn in that state - this
    // is that rule, stated again where the dead come back.
    if (!this.humans().length) return;
    for (const p of this.players.values()) {
      if (p.alive && !p.zombie) continue;
      this.spawnHuman(p, this.dawnKit(), true); // beside the team, as a late joiner is (pickJoinSpawn)
      this.track.returned(p);
      const s = p.state;
      this.notify(NOTIFY.RETURNED, p.id);
      this.sound(SOUND.REVIVE, s.x, s.y + 1, s.z, 30);
    }
  },

  fillHistory(e) {
    for (let i = 0; i < HISTORY_TICKS; i++) {
      e.hx[i] = e.x;
      e.hy[i] = e.y;
      e.hz[i] = e.z;
    }
  },

  // What a death gives back at sunrise. Ember sends you back with a second bandage; the pistol is still one magazine.
  dawnKit() {
    if (this.diff.bandages <= 1) return RETURN_KIT;
    return { mag: RETURN_KIT.mag, ammo: 0, items: [[ITEM.BANDAGE, 2]] };
  },

  updatePlayers(dt) {
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (p.respawnT > 0) {
          p.respawnT -= dt;
          if (p.respawnT <= 0 && (this.phase === PHASE.DAY || this.phase === PHASE.NIGHT)) {
            this.spawnPlayerZombie(p);
            this.checkAllDead();
          }
        }
        continue;
      }
      const s = p.state;
      if (p.zombie) {
        if (this.time - p.lastDamageT > 4) p.hp = Math.min(p.maxHp, p.hp + 4 * dt);
        continue;
      }
      // afloat with no stamina left (shared/swim.js): drowning, in gulps, until the feet find the bottom
      // ...and in the mainland's river at once, and fast: the current has them (shared/swim.js)
      const rapids = inRiver(this.world, s);
      if (rapids || (s.stamina <= 0 && swimming(this.world, s))) {
        if ((p.drownT = (p.drownT || 0) + dt) >= 0.5) {
          p.drownT -= 0.5;
          this.damagePlayer(p, (rapids ? RIVER_DPS : DROWN_DPS) * 0.5, { kind: KILLER.WORLD, drown: true });
          if (!p.alive) continue;
          this.ach.drowning(p);
        }
      } else p.drownT = 0;
      if (p.burning && this.updateFire(p, dt)) continue;
      if (p.downed) {
        if (!p.revivedBy && !this.safe(p) && !this.roles.guarded(p)) p.bleed -= dt * playerMods(p).bleed; // (a held player's clock stops, and a guarded one's)
        if (p.bleed <= 0) this.killPlayer(p, p.lastSrc || { kind: KILLER.WORLD });
        if (p.revivedBy) {
          const rv = this.players.get(p.revivedBy);
          if (!rv || !rv.hold || rv.hold.target !== p.id) p.revivedBy = 0;
        }
        continue;
      }
      // healing
      if (this.time - p.lastDamageT > HEAL_DELAY * this.diff.healDelay && p.hp < p.maxHp) {
        const nearFire = this.nearLitFire(s.x, s.z);
        // a campfire heals what it always healed: building one is the same decision on every difficulty
        p.hp = Math.min(p.maxHp, p.hp + (nearFire ? HEAL_RATE_CAMPFIRE : HEAL_RATE * this.diff.heal) * dt);
      }
      // flashlight battery
      if (p.flashlight) {
        p.battery -= FLASHLIGHT_DRAIN * this.diff.light * dt;
        if (p.battery <= 0) {
          p.battery = 0;
          p.flashlight = false;
        }
      } else p.battery = Math.min(FLASHLIGHT_MAX, p.battery + FLASHLIGHT_RECHARGE * dt);
      // item use
      if (p.useItem && s.using) {
        p.useItem.t += dt;
        if (p.useItem.t >= p.useItem.total) this.finishUse(p);
      }
      this.updateHold(p, dt);
      if (p.invDirty) this.syncThrow(p);
    }
  },
};
