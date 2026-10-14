// The admin chat commands (Game.handleChat hands them a '/' line from a player allowed them: users.is_admin, or
// DEV_ADMIN on a development server). For trying things out and for the tests: give, spawn, skip to night or dawn,
// teleport, set alarms off, cross to the mainland... Each says what it did in the chat.
import { PHASE, GAME_OVER_DELAY } from '../../shared/constants.js';
import { ITEM, ITEM_DEFS, ZTYPE, ZOMBIE_DEFS, SCHEMATICS, CONT, KILLER } from '../../shared/defs.js';
import { ENT, CHATF } from '../../shared/protocol.js';
import { perkMask, perkIds } from '../../shared/progress.js';
import { WORLD } from '../../shared/acts.js';
import { WRECK_SALVAGE, WRECK_ALARM, ALARM, ALARM_SAY, wreckOf, wreckUnit } from '../../shared/wrecks.js';
import { groundAt } from '../../shared/collision.js';
import { SUPPLY_HELP_AT } from '../../shared/supplyhelp.js';

// Debug commands take an item by id or by name: its ITEM key (`ammo_fuel`) or what the inventory calls it
// (`flamethrower fuel`). Case, spaces, underscores and dashes don't matter, and the start of a name will do as long
// as it fits one item only. A zombie type goes the same way: its ZTYPE key (`boss_hivequeen`) or its name
// (`hive queen`).
const ITEM_CAT_LABELS = { res: 'resources', cons: 'consumables', throw: 'throwables', armor: 'armor', pack: 'backpacks', gear: 'gear', weapon: 'weapons', ammo: 'ammo', part: 'car parts', schem: 'schematics', card: 'card packs' };
const itemKey = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
const ITEM_NAMES = Object.entries(ITEM)
  .filter(([, id]) => ITEM_DEFS[id])
  .map(([key, id]) => ({ id, name: key.toLowerCase(), keys: [itemKey(key), itemKey(ITEM_DEFS[id].name)] }));
const ZOMBIE_NAMES = Object.entries(ZTYPE).map(([key, id]) => ({ id, name: key.toLowerCase(), keys: [itemKey(key), itemKey(ZOMBIE_DEFS[id].name)] }));
// every one of `names` (ITEM_NAMES, ZOMBIE_NAMES) `text` could mean: exactly one if it is clear
function findNamed(names, text) {
  if (/^\d+$/.test(text)) return names.filter((it) => it.id === +text);
  const k = itemKey(text);
  if (!k) return [];
  for (const fits of [(key) => key === k, (key) => key.startsWith(k), (key) => key.includes(k)]) {
    const found = names.filter((it) => it.keys.some(fits));
    if (found.length) return found;
  }
  return [];
}

export const methods = {
  debugCommand(p, args) {
    const s = p.state;
    const [x0, z0] = [s.x, s.z];
    switch (args[0]) {
      case 'kill':
        if (p.alive) this.killPlayer(p, { kind: KILLER.WORLD });
        break;
      case 'down':
        if (p.alive && !p.zombie && !p.downed) this.goDown(p);
        break;
      case 'xp': {
        // /xp <n>: that much XP onto their record (progress.js), outside this run's tally: for trying levels and perks
        const n = Math.max(0, Math.min(1e6, Math.floor(+args[1] || 0)));
        if (!n) return this.sendChat(p, 0, CHATF.SYSTEM, 'Usage: /xp <amount>');
        p.xpBase += n;
        this.records.bump(p.rec, 'xp', n);
        p.progDirty = true;
        this.playersDirty = true;
        this.sendChat(p, 0, CHATF.SYSTEM, `+${n} XP: level ${this.levelOf(p)}${p.rec ? '' : ' (not kept: you have no record)'}.`);
        break;
      }
      case 'perks': {
        // /perks <id ...>: these perks in force for this run, whatever the record holds (progress.js ids): for trying
        // perks and the roles they give (shared/roles.js) without the levels. /perks alone: none
        this.applyPerks(p, perkMask(args.slice(1).map(Number)));
        this.sendChat(p, 0, CHATF.SYSTEM, `Perks in force: ${perkIds(p.perks).join(' ') || 'none'}.`);
        break;
      }
      case 'night':
        if (this.phase === PHASE.DAY) this.timeLeft = 0.05;
        break;
      case 'step':
        // /step on | off | <n>: hold this game's clock (room-worker.js runs a tick only when one is asked for), let
        // it go, or run n ticks while it is held. For filming a client frame by frame (scripts/clip/nunchaku-film.js):
        // a frame can take a second to draw and save, and the world must not run on meanwhile. Let go by itself
        // after 20 s with nothing asked (STEP_IDLE), so a game is never left standing
        if (args[1] === 'on') this.stepMode = true;
        else if (args[1] === 'off') this.stepMode = false;
        else if (this.stepMode) this.stepCredit = Math.min(200, this.stepCredit + Math.max(1, Math.floor(+args[1] || 1)));
        this.stepAsked = performance.now();
        break;
      case 'day':
        if (this.phase === PHASE.NIGHT) this.timeLeft = 0.05;
        break;
      case 'dusk':
        // /dusk [s]: to 5 s (or that many) before nightfall. The horn sounds at once; today's supply drops still to
        // come are skipped rather than all landing together
        if (this.phase === PHASE.DAY) {
          this.timeLeft = Math.max(0.05, +args[1] || 5);
          this.supplyAt.length = 0;
          this.globalDirty = true;
        }
        break;
      case 'dawn':
        // /dawn [s]: to 5 s (or that many) before daybreak. Tonight's waves still to come are skipped rather than all
        // starting together
        if (this.phase === PHASE.NIGHT) {
          this.timeLeft = Math.max(0.05, +args[1] || 5);
          for (const wv of this.waves) {
            if (wv.started) continue;
            wv.started = true;
            wv.queue.length = 0;
          }
          this.globalDirty = true;
        }
        break;
      case 'give': {
        // /give <item> [n]: the item by name or id (see findNamed); /items lists the names
        const words = args.slice(1);
        const n = words.length > 1 && /^\d+$/.test(words[words.length - 1]) ? +words.pop() : 1;
        const found = findNamed(ITEM_NAMES, words.join(' '));
        if (found.length !== 1) {
          this.sendChat(p, 0, CHATF.SYSTEM, found.length ? `which one: ${found.map((it) => it.name).join(', ')}?` : `no item called "${words.join(' ')}" (/items lists them)`);
          break;
        }
        const taken = this.giveItem(p, found[0].id, n);
        p.invDirty = true;
        this.sendChat(p, 0, CHATF.SYSTEM, `gave ${taken} x ${ITEM_DEFS[found[0].id].name}`);
        break;
      }
      case 'items': {
        // /items [text]: the names /give takes, by category (only the ones containing `text`)
        const k = itemKey(args.slice(1).join(' '));
        for (const cat in ITEM_CAT_LABELS) {
          const names = ITEM_NAMES.filter((it) => ITEM_DEFS[it.id].cat === cat && (!k || it.keys.some((key) => key.includes(k)))).map((it) => it.name);
          if (names.length) this.sendChat(p, 0, CHATF.SYSTEM, `${ITEM_CAT_LABELS[cat]}: ${names.join(' ')}`);
        }
        break;
      }
      case 'spawn': {
        // /spawn <type> [n]: up to 20 of a zombie type, by name or id (see findNamed), 12 m ahead; /zombies lists the names
        const words = args.slice(1);
        const n = Math.min(20, words.length > 1 && /^\d+$/.test(words[words.length - 1]) ? +words.pop() : 1);
        const found = findNamed(ZOMBIE_NAMES, words.join(' '));
        if (found.length !== 1) {
          this.sendChat(p, 0, CHATF.SYSTEM, found.length ? `which one: ${found.map((it) => it.name).join(', ')}?` : `no zombie called "${words.join(' ')}" (/zombies lists them)`);
          break;
        }
        const t = found[0].id;
        const pack = this.zm.newPack();
        let made = 0;
        for (let i = 0; i < n; i++) if (this.zm.spawn(t, s.x - Math.sin(s.yaw) * 12 + (this.rng() - 0.5) * 4, s.z - Math.cos(s.yaw) * 12 + (this.rng() - 0.5) * 4, { horde: true, boss: ZOMBIE_DEFS[t].boss, pack, force: true })) made++;
        this.sendChat(p, 0, CHATF.SYSTEM, `spawned ${made} x ${ZOMBIE_DEFS[t].name}`);
        break;
      }
      case 'zombies':
        // the names /spawn takes
        this.sendChat(p, 0, CHATF.SYSTEM, `zombies: ${ZOMBIE_NAMES.map((it) => it.name).join(' ')}`);
        break;
      case 'clear': {
        // /clear [m]: every one of the dead within that many metres (default 80) drops where it stands, to nobody's credit
        const r = +args[1] || 80;
        for (const z of [...this.zombies]) if (!z.dead && Math.hypot(z.x - s.x, z.z - s.z) <= r) this.combat.killZombie(z, null);
        for (const d of [...this.deer]) if (!d.dead && d.group?.undead && Math.hypot(d.x - s.x, d.z - s.z) <= r) this.dm.kill(d); // (the mainland's undead deer are the dead too)
        break;
      }
      case 'legs': {
        // /legs [1|2]: shoot that many legs (default both) off every zombie within 30 m that has legs to lose
        const n = args[1] === '1' ? 1 : 2;
        for (const z of this.zombies) {
          if (z.dead || !z.legHp || Math.hypot(z.x - s.x, z.z - s.z) > 30) continue;
          for (let i = 0; i < n && z.legs !== 3; i++) this.combat.hitLeg(z, z.maxHp, 1, z.x - s.x, z.z - s.z);
        }
        break;
      }
      case 'burst': {
        // /burst: tear open the belly of every Mother within 30 m, as a shot in it does: her babies come for you
        for (const z of [...this.zombies]) if (!z.dead && z.ztype === ZTYPE.MOTHER && Math.hypot(z.x - s.x, z.z - s.z) <= 30) this.combat.burstBelly(z, p);
        break;
      }
      case 'den': {
        // teleport 15 m from the nearest zombie dog pack's den (dense forest)
        let best = null;
        for (const z of this.zombies) {
          if (z.dead || !z.pack || z.horde) continue;
          if (!best || Math.hypot(z.homeX - s.x, z.homeZ - s.z) < Math.hypot(best.homeX - s.x, best.homeZ - s.z)) best = z;
        }
        if (best) {
          const a = this.rng() * Math.PI * 2;
          s.x = best.homeX + Math.sin(a) * 15;
          s.z = best.homeZ + Math.cos(a) * 15;
          s.y = groundAt(this.world, s.x, s.z, 200, 0.3);
          s.vx = s.vy = s.vz = 0;
          this.fillHistory(p);
        }
        break;
      }
      case 'herd': {
        // teleport 45 m from the wandering herd (just out of its sight)
        const h = this.zm.herds.first();
        if (h) {
          const a = this.rng() * Math.PI * 2;
          s.x = h.cx + Math.sin(a) * 45;
          s.z = h.cz + Math.cos(a) * 45;
          s.y = groundAt(this.world, s.x, s.z, 200, 0.3);
          s.vx = s.vy = s.vz = 0;
          this.fillHistory(p);
        }
        break;
      }
      case 'supply': {
        // drop a crate a few meters in front of the player from low altitude
        const x = s.x - Math.sin(s.yaw) * 5;
        const z = s.z - Math.cos(s.yaw) * 5;
        const e = { kind: ENT.CRATE, x, y: s.y + 12, z, gy: groundAt(this.world, x, z, 200, 0.6), state: 0, despawnAt: this.time + 600 };
        if (this.spawnEntity(e)) this.crates.push(e);
        break;
      }
      case 'airdrop':
        this.spawnSupplyDrop();
        break;
      case 'stuck':
        // /stuck [1-3]: the clock to that step of the help a team that has found no supply gets (shared/supplyhelp.js)
        this.supplyClock = SUPPLY_HELP_AT[Math.min(SUPPLY_HELP_AT.length, Math.max(1, +args[1] || 1)) - 1];
        break;
      case 'parts':
        this.supplies = this.sup.need.slice();
        this.globalDirty = true;
        break;
      case 'engine':
        this.supplies = this.sup.need.slice();
        this.startEngine(p);
        break;
      case 'unlock':
        for (const it of SCHEMATICS) this.unlockSchematic(it, null);
        break;
      case 'cross':
      case 'cutscene':
        // /cross (or /cutscene) [skip | hold | go]: the car is away, as if the final stand was won and somebody drove
        // - the crossing to the mainland, with its cutscene, or straight there. From the end screen or the mainland
        // a new run on the island is begun first. hold: the cutscene's clock stops (for looking at it) - first on
        // the island, before the worlds change, then after /cross go short of its end, and after another it runs out
        if (args[1] === 'go' && this.crossing) this.crossing.hold = Math.max(0, (this.crossing.hold | 0) - 1);
        else if (this.phase === PHASE.CROSSING) this.sendChat(p, 0, CHATF.SYSTEM, 'the crossing is already on');
        else {
          if (this.act !== WORLD.ISLAND || (this.phase !== PHASE.DAY && this.phase !== PHASE.NIGHT)) this.startGame(WORLD.ISLAND);
          this.cross(p, this.phase === PHASE.NIGHT);
          if (args[1] === 'skip') this.arrive();
          else if (args[1] === 'hold') this.crossing.hold = 2;
          this.sendChat(p, 0, CHATF.SYSTEM, args[1] === 'skip' ? `on the mainland (map 2): day ${this.day}` : 'the crossing to the mainland (map 2) has begun');
        }
        break;
      case 'map2':
      case 'mainland':
        // /map2: straight to the first day on the mainland, from anywhere on the island (the end screen too: a new
        // run is begun first), with no cutscene and no XP for the escape. Mid-crossing, the crossing is cut short
        if (this.act === WORLD.MAINLAND && this.phase !== PHASE.CROSSING) {
          this.sendChat(p, 0, CHATF.SYSTEM, 'already on the mainland (map 2)');
          break;
        }
        if (this.phase !== PHASE.CROSSING) {
          if (this.phase !== PHASE.DAY && this.phase !== PHASE.NIGHT) this.startGame(WORLD.ISLAND);
          this.cross(p, false, false);
        }
        this.arrive();
        this.sendChat(p, 0, CHATF.SYSTEM, `on the mainland (map 2): day ${this.day}`);
        break;
      case 'map1':
      case 'island':
        // /map1 (or /island): back to the island - a new run from its first day, from the mainland, the crossing or
        // the end screen
        if (this.act === WORLD.ISLAND && (this.phase === PHASE.DAY || this.phase === PHASE.NIGHT)) {
          this.sendChat(p, 0, CHATF.SYSTEM, 'already on the island (map 1)');
          break;
        }
        this.takeoffHold = 0; // (a /takeoff hold would otherwise freeze the next run's end screen)
        this.startGame(WORLD.ISLAND);
        this.sendChat(p, 0, CHATF.SYSTEM, `on the island (map 1): day ${this.day}`);
        break;
      case 'takeoff':
        // /takeoff [hold | go]: the plane goes, now (the run's last shot, and the victory). hold: the clock that ends
        // the game stops (for looking at it) - first at the start of the take-off, then after /takeoff go with the end
        // screen up, and after another it runs out
        if (args[1] === 'go' && this.takeoffHold) {
          this.takeoffHold--;
          if (this.takeoffHold) this.restartT = GAME_OVER_DELAY + 6; // (the take-off is over: the end screen)
          this.globalDirty = true;
        } else if (this.act === WORLD.MAINLAND && (this.phase === PHASE.DAY || this.phase === PHASE.NIGHT)) {
          this.supplies = this.sup.need.slice();
          this.victory();
          if (args[1] === 'hold') this.takeoffHold = 2;
        }
        break;
      case 'place': {
        // /place <zone id>: to the middle of that place of this map (the mainland's: 27 the bridgehead .. 34)
        const zn = this.world.zoneById[+args[1]];
        if (zn) {
          s.x = zn.x;
          s.z = zn.z - 3;
          s.y = groundAt(this.world, s.x, s.z, 200, 0.3);
          s.vx = s.vy = s.vz = 0;
          this.fillHistory(p);
        }
        break;
      }
      case 'plane':
        // /plane: to the plane (the car, on the island), with every part of it in the backpack
        s.x = this.world.car.x - 6;
        s.z = this.world.car.z + 2;
        s.y = groundAt(this.world, s.x, s.z, 200, 0.3);
        s.vx = s.vy = s.vz = 0;
        this.fillHistory(p);
        this.sup.items.forEach((it, i) => this.giveItem(p, it, this.sup.need[i] - this.supplies[i]));
        break;
      case 'wipe':
        // /wipe: every survivor dies (on the mainland the team goes back to the bridge: restartFromBridge)
        for (const q of [...this.players.values()]) if (q.alive && !q.zombie) this.killPlayer(q, { kind: KILLER.WORLD }, true);
        this.checkAllDead();
        break;
      case 'tp': {
        // /tp x z [y]: onto whatever is highest there, or with a height onto what is under feet at it (down a drift)
        const x = +args[1];
        const z = +args[2];
        if (Number.isFinite(x) && Number.isFinite(z)) {
          s.x = x;
          s.z = z;
          s.y = groundAt(this.world, x, z, Number.isFinite(+args[3]) && args[3] !== undefined ? +args[3] : 200, 0.3);
          s.vx = s.vy = s.vz = 0;
          this.fillHistory(p);
        }
        break;
      }
      case 'mine': {
        // /mine: to the adit of Blackrock Mine. /mine far: to the far portal. /mine in: down to the junction
        const mine = this.world.mine;
        if (!mine) {
          this.systemChat('this valley has no workings under its mine');
          break;
        }
        const pt = mine.portals[args[1] === 'far' ? 1 : 0];
        const rm = mine.rooms[0];
        [s.x, s.z] = args[1] === 'in' ? [rm.x + 2.5, rm.z] : [pt.x - pt.dx * 4.5, pt.z - pt.dz * 4.5];
        s.y = groundAt(this.world, s.x, s.z, args[1] === 'in' ? rm.y + 0.2 : 200, 0.3);
        s.vx = s.vy = s.vz = 0;
        this.fillHistory(p);
        break;
      }
      case 'clinic': {
        // /clinic: to the front door of Mercy Clinic. /clinic ward: into its dark wards
        const c = this.world.clinic;
        if (!c) {
          this.systemChat('this valley has no Mercy Clinic');
          break;
        }
        const at = args[1] === 'ward' ? c.ward : c.door;
        [s.x, s.z] = [at.x, at.z];
        s.y = groundAt(this.world, s.x, s.z, c.y + 0.3, 0.3); // (from above, the ground in a ward is its roof)
        s.vx = s.vy = s.vz = 0;
        this.fillHistory(p);
        break;
      }
      case 'depot':
      case 'train': {
        // /depot: to the front of the station house at Whitlock Depot. /train: onto the loading bank beside the
        // freight train stalled on the line
        const spot = this.world.rail?.spots[args[0]];
        if (!spot) {
          this.systemChat(`this valley has no ${args[0]}`);
          break;
        }
        [s.x, s.z] = spot;
        s.y = groundAt(this.world, s.x, s.z, 200, 0.3);
        s.vx = s.vy = s.vz = 0;
        this.fillHistory(p);
        break;
      }
      case 'gun':
        // /gun: to the grips of the mounted gun (at the Army Checkpoint, until somebody carries it off)
        if (this.gun.teleport(p)) this.fillHistory(p);
        else this.systemChat('this valley has no Army Checkpoint, so no mounted gun (a new game deals a new valley)');
        break;
      case 'cat': {
        // bring the cat over (2 m in front: one nobody has in their arms)
        const c = this.cats.find((k) => !k.holder);
        if (c) {
          c.x = s.x - Math.sin(s.yaw) * 2;
          c.z = s.z - Math.cos(s.yaw) * 2;
          c.y = groundAt(this.world, c.x, c.z, 200, 0.2);
          c.vx = c.vz = c.vy = 0;
        }
        break;
      }
      case 'deer': {
        // /deer: to 34 m from the nearest group of deer (out of what startles them). /deer spawn [m] [undead | living]:
        // a group 20 m ahead (or that many), which lets you stand there for ten seconds before it notices you; undead
        // or living whatever the map (the mainland's are undead, the island's living)
        if (args[1] === 'spawn') {
          const d = Math.max(4, Math.min(60, +args[2] || 20));
          const kind = args.includes('undead') ? true : args.includes('living') ? false : undefined;
          const gr = this.dm.spawnAhead(s.x, s.z, s.yaw, d, 10, kind);
          this.sendChat(p, 0, CHATF.SYSTEM, gr ? `${gr.members.length} ${gr.undead ? 'undead ' : ''}deer ${d} m ahead` : 'no room for deer there');
          break;
        }
        const gr = this.dm.nearest(s.x, s.z);
        if (!gr) {
          this.sendChat(p, 0, CHATF.SYSTEM, 'no deer in the valley');
          break;
        }
        // from the side you came from, on ground you can stand on
        const a0 = Math.atan2(s.x - gr.cx, s.z - gr.cz);
        for (let k = 0; k < 16; k++) {
          const a = a0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.39;
          const x = gr.cx + Math.sin(a) * 34;
          const z = gr.cz + Math.cos(a) * 34;
          if (!this.dm.open(x, z) && k < 15) continue;
          s.x = x;
          s.z = z;
          break;
        }
        s.y = groundAt(this.world, s.x, s.z, 200, 0.3);
        s.vx = s.vy = s.vz = 0;
        this.fillHistory(p);
        const b = Math.atan2(gr.cx - s.x, -(gr.cz - s.z));
        this.sendChat(p, 0, CHATF.SYSTEM, `${gr.members.length} deer 34 m to the ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / (Math.PI / 4)) & 7]}`);
        break;
      }
      case 'fair':
        // /fair: to the gate of the Tri-County Fair. /fair on | off: its generator. /fair wheel | carousel: onto a ride
        this.fair.debug(p, args[1]);
        break;
      case 'where':
        this.systemChat(`pos ${s.x.toFixed(1)} ${s.y.toFixed(1)} ${s.z.toFixed(1)} zone ${this.world.zoneAt(s.x, s.z)}`);
        break;
      case 'alarm': {
        // /alarm: the nearest wreck that can have one has a live battery (its next hard blow makes it chirp).
        // /alarm ring: it goes off now. /alarm trunk: the nearest boot's car is armed (forcing it sets it off)
        if (args[1] === 'trunk') {
          let near = null;
          for (const c of this.caches) if (c.ctype === CONT.TRUNK && c.state === 0 && this.trunkCol(c) && (!near || Math.hypot(c.x - s.x, c.z - s.z) < Math.hypot(near.x - s.x, near.z - s.z))) near = c;
          if (near) {
            near.alarm = true;
            this.armedT = 0;
          }
          break;
        }
        let best = null;
        for (const col of this.world.staticGrid.query(s.x, s.z, 12, [])) {
          const prop = wreckOf(col);
          if (!prop || !WRECK_ALARM.types.includes(prop.type)) continue;
          if (!best || Math.hypot(col.x - s.x, col.z - s.z) < Math.hypot(best.x - s.x, best.z - s.z)) best = col;
        }
        if (!best) break;
        best = wreckUnit(best);
        let g = this.gather.get(best);
        if (!g) this.gather.set(best, (g = { left: WRECK_SALVAGE }));
        g.alarm = ALARM.LIVE;
        if (args[1] === 'ring') {
          g.alarm = ALARM.RINGING;
          g.ringT = WRECK_ALARM.ring;
          g.pulseT = 0;
          this.ringing.add(best);
          this.tellAlarm(best, ALARM_SAY.RING, g);
        }
        break;
      }
      case 'bell':
      case 'radio':
        // /bell: the chapel bell tolls now, wherever you are. /radio: to the Relay Station's radio, with the batteries
        this.fixtures.debug(p, args);
        break;
      case 'cemetery':
        // /cemetery: to the gate of St. Agnes Cemetery. /cemetery rise [n]: the nearest n graves give up their dead now
        this.cemetery.debug(p, args);
        break;
      case 'floodlight':
        // the materials for one generator and two floodlights, and a full tank of fuel
        this.power.give(p);
        break;
      case 'veh':
      case 'vehicle':
        this.vehicles.debug(p, args);
        break;
      case 'handcar':
        // /handcar [n]: onto handcar n on the railway (1, 2), or the first one nobody is on
        this.handcars.debug(p, args[1]);
        break;
    }
    // a command that took the player somewhere takes them out of a fair ride's seat, or the ride carries them back
    // (and off a handcar, which would too)
    if (s.ride && args[0] !== 'fair' && (s.x !== x0 || s.z !== z0)) s.ride = 0;
    if (s.cart && args[0] !== 'handcar' && (s.x !== x0 || s.z !== z0)) s.cart = 0;
    this.systemChat(`[debug] ${args.join(' ')}`);
  },
};
