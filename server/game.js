// Authoritative game simulation.
//
// Iteration 2 loop: by day the team scavenges the valley (containers, wrecks, trees, schematics) and
// hunts for the car supplies hidden around the map; by night the horde comes in waves to wherever the
// survivors are, so they throw up a temporary shelter on the spot. Every night is harder. Once every
// supply is in the car, starting the engine triggers the final stand - survive it and drive away.
import {
  SERVER_TICK_RATE,
  HISTORY_TICKS,
  SERVER_DT,
  MAX_PLAYERS,
  MAX_ENTITIES,
  PHASE,
  NIGHT_LENGTH,
  MOON,
  ESCAPE_RADIUS,
  SLOT_PRIMARY,
  SLOT_PISTOL,
  SLOT_MELEE,
  SLOT_BUILD,
  REVIVE_HP,
  DAWN_RETURN,
} from '../shared/constants.js';
import {
  ITEM,
  WEAPONS,
  suppliesOf,
  CACHE_GAVE,
  SCHEMATICS,
  SCHEM_BIT,
  CONT_DEFS,
  AMMO_MAX,
  AMMO_ITEMS,
  SOUND,
  EVT,
  NOTIFY,
  isFirearm,
} from '../shared/defs.js';
import { C2S, S2C, SNAP, SELF, ACT, SALVAGE_FROM, WORN, WORN_DO, UNDO_NO, ENT, HOLD, CAR_ID, REJECT_REASON, LEFT_CODE, CHATF, PLF, PROGF, WELCOMEF, PROTOCOL_VERSION, Writer, Reader, readInput, writeBoard, qpos, dqpos, usePos, qangle8, qangle16, dqangle16, dqpitch } from '../shared/protocol.js';
import { XP, XPS, XP_SRC, levelOf, perkMask, perkIds } from '../shared/progress.js';
import { worldFor } from '../shared/worlds.js';
import { WORLD, ARRIVAL_DAY, MAINLAND_DAY_MORE, CROSSING, TAKEOFF_TIME, RUNWAY, BRIDGEHEAD, PLANE_REACH, MAINLAND_START } from '../shared/acts.js';
import { fellTree, regrowTrees, cutTree, treeFoot, treeTop } from '../shared/felling.js';
import { hitTree, treeBroken, treeCutMax, TREE_CUT_MIN, TREE_PIECE_MIN } from './trees.js';
import { blowOf, BLOW } from '../shared/surfaces.js';
import { WRECK_SALVAGE, WRECK_HITS_MAX, HITF, WRECKF, WRECK_ALARM, ALARM, ALARM_SAY, alarmStep, wreckOf, wreckLocal, wreckUnit, wreckHalf } from '../shared/wrecks.js';
import { groundAt } from '../shared/collision.js';
import { mulberry32 } from '../shared/rng.js';
import * as Director from './director.js';
import { difficultyOf } from '../shared/difficulty.js';
import { countItem } from './inventory.js';
import { Zombies } from './zombies.js';
import { Cats } from './cats.js';
import { Deer } from './deer.js';
import { Combat } from './combat.js';
import { TickStats, T_INPUTS, T_PHASE, T_PLAYERS, T_ZOMBIES, T_CATS, T_COMBAT, T_UPKEEP, T_SNAPSHOTS } from './tickstats.js';
import { PlayerStats } from './stats.js';
import { Fixtures } from './fixtures.js';
import { Cemetery } from './cemetery.js';
import { MountedGun } from './mountedgun.js';
import { Fair } from './fair.js';
import { Handcars } from './handcar.js';
import { Vehicles } from './vehicles.js';
import { Power } from './power.js';
import { Roles } from './roles.js';
import { MatchTracker } from './analytics.js';
import { AchievementTracker } from './achievements.js';
import { BestiaryTracker } from './bestiary.js';
import { Cards } from './cards.js';
import { Pledges } from './pledge.js';
import { Loadouts } from './loadouts.js';
import { checkEnvelope, sameWorld, HandoffError } from './handoff.js';
import { saveGame, loadGame } from './gamestate.js';

// The parts of what a game does, each in a module of its own (server/game/): their methods are laid onto Game
// (addMethods, at the end of this file), so they are called on it as this.name(...) like the ones written here.
import * as commands from './game/commands.js';
import * as blows from './game/blows.js';
import * as phases from './game/phases.js';
import * as escape from './game/escape.js';
import * as supplydrops from './game/supplydrops.js';
import * as trunks from './game/trunks.js';
import * as items from './game/items.js';
import * as crafting from './game/crafting.js';
import * as equipment from './game/equipment.js';
import * as building from './game/building.js';
import * as harm from './game/harm.js';
import * as interact from './game/interact.js';
import * as input from './game/input.js';
import * as survivors from './game/survivors.js';
import * as experience from './game/experience.js';
import * as sessions from './game/sessions.js';
import * as chat from './game/chat.js';
import * as net from './game/net.js';
import * as run from './game/run.js';
import { randomSeed } from './game/run.js';
import { HANDOFF_FREEZE, JOIN_EVERY } from './game/sessions.js';
import { starterKit } from './game/survivors.js';
import { MAX_DROPS } from './game/items.js';

const PARTS = { commands, blows, phases, escape, supplydrops, trunks, items, crafting, equipment, building, harm, interact, input, survivors, experience, sessions, chat, net, run };

export class Game {
  // opts.restore: a game the last server saved as it went down (handoff.js envelope), to carry on from where it was.
  // One this build cannot read throws a HandoffError, and nothing is made.
  constructor(opts = {}) {
    const restore = opts.restore || null;
    if (restore) checkEnvelope(restore);
    this.fixedSeed = opts.seed !== undefined; // a given seed pins the map: every playthrough is the same valley
    this.maxPlayers = opts.maxPlayers ?? MAX_PLAYERS;
    this.diff = difficultyOf(opts.difficulty); // Ember / Nightfall / Blackout. Nightfall is every multiplier at 1.
    // optional overrides (testing): DAY_SECONDS / NIGHT_SECONDS / START_DAY env vars. A fixed length is that length:
    // the difficulty stretches the schedule, not a test that pinned the clock.
    this.dayLenOverride = opts.dayLength || 0; // every day this long (otherwise they shorten: dayLength)
    this.nightLen = opts.nightLength || Math.round(NIGHT_LENGTH * this.diff.night);
    this.startDayNum = opts.startDay || 1;
    this.godMode = !!opts.godMode; // testing only: survivors take no damage
    // Signed-in accounts with users.is_admin may run the admin chat commands. DEV_ADMIN=1 grants the same access
    // to every player, only on a development or test server (server/devadmin.js): `npm run dev` turns it on.
    this.devAdmin = !!opts.devAdmin;
    this.dawnReturn = opts.dawnReturn ?? DAWN_RETURN; // the dead are survivors again at sunrise (the option: tests)
    this.themes = opts.themes !== false; // night themes (shared/nights.js). false: every night is plain (tests, benchmarks)
    // an emptied game rolls its next valley on the next tick (resetToWaiting). false: on the next join instead - a
    // game in a worker of its own (room-worker.js), which closes if nobody comes, need not build one for nobody
    this.rollWhenEmpty = opts.rollWhenEmpty !== false;
    this.log = opts.log ?? ((...a) => console.log('[game]', ...a));
    this.records = opts.stats ?? new PlayerStats(); // the leaderboard (stats.js): the server's is kept in a file, this one goes with the game
    // (a restored game's valley is the one it was played on: built from its seed, which pins nothing)
    // The run's act (shared/acts.js): 1 on the island, 2 on the mainland. startAct: the one every run of this game
    // begins on - the island, or the mainland for a game made to start there (acts.js MAINLAND_START). checkpoint: the
    // team as it came off the bridge ({ day, unlocked, kits }: checkpointAt): the day is the long one (dayLen),
    // and every wipe on the mainland starts the run again from it (restartFromBridge), as every wipe on the island
    // starts it again on the island: a run that has got to the mainland stays there. (A game made to start there
    // starts a new run there: startGame.) crossing: the cutscene between the two,
    // while it plays ({ pending: the mainland is still to be built, skip: who has asked to skip it }).
    this.startAct = opts.startAct === WORLD.MAINLAND ? WORLD.MAINLAND : WORLD.ISLAND;
    this.act = WORLD.ISLAND;
    this.checkpoint = null;
    this.crossing = null;
    this.thawAt = 0; // a game brought over waits, still, for its players until then (ms on the wall's clock; 0: it runs)
    this.frozenAt = 0; // ...since then (ms on the wall's clock)
    // (opts.prepared: the valley built ahead, while the last server was still playing the game: prepareWorld)
    this.setWorld(restore ? restore.game.seed : opts.seed ?? randomSeed(), restore?.game.act ?? this.startAct, opts.prepared);
    if (restore && !sameWorld(restore, this.worldPrint)) throw new HandoffError(`this build makes another valley of seed ${this.seed}`, { world: true });
    this.rng = mulberry32(this.seed ^ 0xabcdef);

    this.ents = new Array(MAX_ENTITIES).fill(null);
    this.gens = new Uint32Array(MAX_ENTITIES);
    this.freeIds = [];
    this.quarantine = [];
    this.nextId = 1;
    this.all = []; // live entity list (players included)

    this.sessions = new Set();
    this.players = new Map(); // id -> player
    this.joins = new Map(); // address -> its join allowance (see allow)
    this.greets = { n: 0, t: 0 }; // the allowance of join / leave chat lines
    this.zombies = [];
    this.items = [];
    this.maxDrops = opts.maxDrops ?? MAX_DROPS;
    this.drops = 0; // loose drops lying around (items with e.drop)
    this.dropSeq = 0;
    this.structures = [];
    this.projectiles = [];
    this.areas = [];
    this.crates = [];
    this.flyovers = []; // supply planes on their way to a release point
    this.caches = []; // searchable containers
    this.cats = [];
    this.deer = []; // the deer, the dead ones lying about included (deer.js)

    this.tick = 0;
    this.time = 0;
    this.phase = PHASE.WAITING;
    this.day = 0;
    this.timeLeft = 0;
    this.supplies = [0, 0, 0, 0, 0]; // installed per SUPPLIES entry
    this.supplyHints = [255, 255, 255, 255, 255, 255, 255]; // zones: 4 parts + 3 jerry cans
    this.supplyFound = 0; // a bit per hint: that one has been taken from its hiding place (nothing left to search there)
    this.scouted = 0; // a bit per hint: a Scout has been near its hiding place, and it is on everyone's compass (server/roles.js)
    this.supplyHintSpots = []; // per hint: the world.partSpots index it is hidden at (-1: none). The crows circle over it
    this.supplyClock = 0; // s since the act's supplies were hidden...
    this.supplyHelp = 0; // ...and the help a team that has found none of them gets by now (shared/supplyhelp.js)
    this.unlocked = 0; // schematics bitmask
    this.schemHints = [255, 255, 255, 255, 255]; // zones: where each schematic (SCHEMATICS order) is rumoured to be
    this.fallen = new Set(); // who left dead since the last sunrise (leaverKey: removePlayer, handleJoin)
    this.waves = [];
    this.wave = 0;
    this.bossPending = null;
    this.bossId = 0;
    this.warned = false;
    this.shadeWarned = false; // the "a shade is out there" notice went out tonight
    this.escape = this.noEscape();
    this.supplyAt = [];
    this.restartT = 0;
    this.globalDirty = true;
    this.playersDirty = true;
    this.playersListT = 0;
    // collider -> { left, day } and, of a wreck that was hit, { hits, alarm, ringT, pulseT } (shared/wrecks.js)
    this.gather = new Map();
    this.ringing = new Set(); // the wrecks (colliders) whose alarm is going
    this.trunkCols = new WeakMap(); // trunk -> its car's collider (trunkCol)
    this.armedT = 0; // s to the next look for survivors near an armed trunk (tellArmedTrunks)
    this.stepMode = false; // the clock held by the admin /step (room-worker.js): ticks only as they are asked for
    this.stepCredit = 0;
    this.stepAsked = 0;
    this.leftKits = new Map(); // leaverKey -> what is left of the starting kit of a player who left this run (parkKit)
    this.nightStats = { kills: 0, structLost: 0, downs: 0, deaths: 0, revives: 0 };
    this.pace = Director.newPace(); // the pacing director's read of tonight (server/director.js)
    this.moon = MOON.NORMAL; // tonight's moon, from the dusk horn to dawn (Director.pickMoon)
    this.lastMoon = MOON.NORMAL; // last night's
    this.skullAwards = new Set(); // loadout economy ledger ids already emitted by this run

    this.lootPoints = [];
    this.dropper = 0; // the survivor putting a stack down right now (ACT.DROP_SLOT), for spawnItem to note on the item
    this.w = new Writer(1 << 16);
    this.ew = new Writer(1 << 14);
    this.events = [];

    this.zm = new Zombies(this);
    this.cm = new Cats(this);
    this.dm = new Deer(this);
    this.combat = new Combat(this);
    this.fixtures = new Fixtures(this); // the chapel bell and the Relay Station's radio
    this.cemetery = new Cemetery(this); // the dead that come up out of the graves at St. Agnes (cemetery.js)
    this.gun = new MountedGun(this); // the mounted gun at the Army Checkpoint, on the maps that have one
    this.fair = new Fair(this); // the Tri-County Fair: its generator and who is on its rides
    this.handcars = new Handcars(this); // the handcars on the railway: where they are on the line, who rides them
    this.vehicles = new Vehicles(this); // the mopeds, cars and bicycles of the mainland (vehicles.js)
    this.power = new Power(this); // the buildable generator and its floodlights
    this.roles = new Roles(this); // the co-op roles the perk branches give (server/roles.js)
    this.stats = { bytesOut: 0, msgsOut: 0, lastReport: Date.now(), tickMs: 0 };
    this.tickStats = new TickStats(1000 / SERVER_TICK_RATE); // how long ticks take and where a slow one went (update)
    this.track = new MatchTracker(this, opts.analytics); // match analytics (analytics.js): a no-op without opts.analytics
    this.director = Director; // the pacing director (director.js): combat.js and zombies.js tell it of kills and grabs
    this.inviteOnly = !!opts.inviteOnly; // only its link gets anyone in (rooms.js): the Plus One achievement
    // achievements (achievements.js). opts.achieve: where an account's go (the network thread); none: no accounts
    this.ach = new AchievementTracker(this, opts.achieve);
    // the kinds of the dead each player has seen (bestiary.js). opts.bestiary: where an account's go (the network thread)
    this.bestiary = new BestiaryTracker(this, opts.bestiary);
    // Dead Hand, the card game: matches, trades, bets and packs (cards.js). opts.cards: where the collections are kept
    // (the network thread: room-worker.js RemoteCards); none, in this thread (LocalCards)
    this.cards = new Cards(this, opts.cards);
    this.loadouts = new Loadouts(this, opts.loadouts);
    this.pledges = new Pledges(this); // the pledge window as a run begins: Skulls spent on what the group starts with
    if (restore) this.load(restore.game);
  }

  // ---------------------------------------------------------------- handoff (handoff.js, gamestate.js)
  // The game as plain data, for the next server. Only between ticks: some systems swap this.rng inside one.
  save() {
    return saveGame(this);
  }
  // ...and back, into a game just made on the save's valley. The run's match goes on as a new one (analytics.js:
  // the old server ended its own as 'handoff').
  load(s) {
    loadGame(this, s);
    this.thawAt = HANDOFF_FREEZE > 0 && this.players.size ? Date.now() + HANDOFF_FREEZE * 1000 : 0;
    this.frozenAt = Date.now(); // (how long it stood still is said when it runs again: frozen)
    if (this.phase === PHASE.DAY || this.phase === PHASE.NIGHT) this.track.start();
  }

  // ---------------------------------------------------------------- entity registry
  // Returns null when every id is in use (or resting in quarantine): callers have to cope with that.
  spawnEntity(e) {
    let id;
    if (this.freeIds.length) id = this.freeIds.pop();
    else if (this.nextId < MAX_ENTITIES) id = this.nextId++;
    // (the id check is a backstop: an entity whose id is not a slot of the registry mis-frames every snapshot
    // it is written into, for every client)
    if (!Number.isInteger(id) || id <= 0 || id >= MAX_ENTITIES) return null;
    this.gens[id] = (this.gens[id] + 1) >>> 0 || 1;
    e.id = id;
    e.gen = this.gens[id];
    e.removed = false;
    this.ents[id] = e;
    this.all.push(e);
    return e;
  }
  // An entity back under the id it had (gamestate.js: the registry's ids and generations are restored first). null when
  // that id is no slot or is taken.
  spawnEntityAt(e, id) {
    if (!Number.isInteger(id) || id <= 0 || id >= MAX_ENTITIES || this.ents[id]) return null;
    if (!this.gens[id]) this.gens[id] = 1;
    e.id = id;
    e.gen = this.gens[id];
    e.removed = false;
    this.ents[id] = e;
    this.all.push(e);
    if (id >= this.nextId) this.nextId = id + 1;
    return e;
  }
  removeEntity(e) {
    if (e.removed) return;
    e.removed = true;
    // only the holder of a slot gives its id back: an entity that never got one (spawnEntity returned null) would
    // put `undefined` into the free list, and the next thing spawned would take that as its id
    if (this.ents[e.id] !== e) return;
    this.ents[e.id] = null;
    this.quarantine.push(e.id, this.tick + 60);
    const i = this.all.indexOf(e);
    if (i >= 0) {
      this.all[i] = this.all[this.all.length - 1];
      this.all.pop();
    }
  }
  _listRemove(list, e) {
    const i = list.indexOf(e);
    if (i >= 0) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  // ---------------------------------------------------------------- events
  // Pre-encodes an event once; per-client filtering by radius / recipient.
  emit(writeFn, opts = {}) {
    const w = this.ew.reset();
    writeFn(w);
    this.events.push({ bytes: w.u8a.slice(0, w.o), x: opts.x, z: opts.z, r2: opts.r ? opts.r * opts.r : 0, to: opts.to || 0, except: opts.except || 0 });
  }
  sound(snd, x, y, z, r = 60, except = 0) {
    this.emit(
      (w) => {
        w.u8(EVT.SOUND);
        w.u8(snd);
        w.i16(qpos(x));
        w.i16(qpos(y));
        w.i16(qpos(z));
      },
      { x, z, r, except },
    );
  }
  impact(kind, x, y, z, nx = 0, ny = 1, nz = 0) {
    this.emit(
      (w) => {
        w.u8(EVT.IMPACT);
        w.u8(kind);
        w.i16(qpos(x));
        w.i16(qpos(y));
        w.i16(qpos(z));
        w.i8(Math.round(nx * 127));
        w.i8(Math.round(ny * 127));
        w.i8(Math.round(nz * 127));
      },
      { x, z, r: 90 },
    );
  }
  notify(msg, arg = 0, to = 0) {
    this.emit(
      (w) => {
        w.u8(EVT.NOTIFY);
        w.u8(msg);
        w.u16(arg);
      },
      { to },
    );
  }
  killfeed(killerKind, killerId, victimId, weapon, flags) {
    this.emit((w) => {
      w.u8(EVT.KILLFEED);
      w.u8(killerKind);
      w.u16(killerId);
      w.u16(victimId);
      w.u8(weapon);
      w.u8(flags);
    });
  }

  // ---------------------------------------------------------------- who is here
  // living survivors (downed ones included - the dead still hunt them)
  humans() {
    const out = [];
    for (const p of this.players.values()) if (p.alive && !p.zombie) out.push(p);
    return out;
  }
  standing() {
    let n = 0;
    for (const p of this.players.values()) if (p.alive && !p.zombie && !p.downed) n++;
    return n;
  }
  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.zombie) n++;
    return n;
  }

  // ---------------------------------------------------------------- the two acts (shared/acts.js)
  // What this act's escape takes: the car's supplies on the island, the plane's parts on the mainland.
  get sup() {
    return suppliesOf(this.act);
  }

  // The car is away with the team in it: the island is done. The crossing begins - every client plays the cutscene
  // off this phase's clock - and the mainland is built in the next tick (buildMainland), so that what tells the
  // clients has left this thread before a world is generated on it. by: who drove.
  // night: it left in the night. paid: the escape's XP is given (not for an admin's /map2: nobody escaped)
  cross(by, night = false, paid = true) {
    if (this.act !== WORLD.ISLAND || this.phase === PHASE.CROSSING) return;
    this.log('crossing to the mainland');
    this.track.crossed(by, night); // (before the world is cleared: it reads who is alive, and at the car)
    // the escape from the island is paid as it always was: more to whoever was in the car than to those it left
    const car = this.world.car;
    for (const p of paid ? this.players.values() : []) {
      const aboard = p.alive && !p.zombie && Math.hypot(p.state.x - car.x, p.state.z - car.z) <= ESCAPE_RADIUS;
      this.award(p, XPS.escape, aboard ? XP.escape : XP.team);
      this.loadouts.escapeReward(p, aboard, `cross:${this.worldPlayed || 0}:${p.id}`);
    }
    // the stray cat goes too, if somebody has it in their arms (buildMainland sets it down beside them)
    const cat = this.cats.find((c) => c.holder && this.players.get(c.holder)?.state.pet);
    this.cards.crossing(); // (trades being haggled over are called off; a match waits out the cutscene)
    this.clearWorld();
    this.phase = PHASE.CROSSING;
    this.timeLeft = CROSSING.TIME;
    this.crossing = { pending: 2, skip: [], night, back: 0, cat: cat ? { variant: cat.variant, by: cat.holder } : null };
    this.waves = [];
    this.wave = 0;
    for (const p of this.players.values()) {
      p.hold = null;
      this.endUse(p);
      this.releaseHolds(p);
      p.state.pet = 0; // (the cat they had in their arms is in the car with them)
      p.cmdQueue.length = 0;
      p.waypoint = null; // (it pointed into the island)
    }
    this.notify(NOTIFY.CROSSING, by ? by.id : 0);
    this.sound(SOUND.CAR_START, car.x, car.y + 0.8, car.z, 0);
    this.globalDirty = true;
    this.playersDirty = true;
  }

  // The mainland, CROSSING.SWAP seconds into the crossing - the moment the cutscene cuts to black, which is when the
  // clients take the island down. In two ticks: the first tells the clients which world to build (and everything a
  // tick sends leaves the thread when the tick is done), the second builds ours, which holds this thread for a
  // moment: nobody is acting. Then it is populated and the team is put down on it; they stand at the bridgehead
  // from then on, behind the cutscene. now: both steps at once (a join that cannot wait, a skip, a save).
  buildMainland(now = false) {
    const c = this.crossing;
    if (!c?.pending || (!now && CROSSING.TIME - this.timeLeft < CROSSING.SWAP)) return;
    if (c.pending === 2) {
      c.pending = 1;
      this.act = WORLD.MAINLAND;
      this.tellWorld();
      if (!now) return;
    }
    c.pending = 0;
    this.setWorld(this.seed, WORLD.MAINLAND);
    this.worldPlayed = true; // (the run is on it: the next one gets an island of its own)
    // the morning after: whatever the hour was when the car left, the team comes off the bridge at the start of a
    // day - the next one, if it left in the night
    if (c.night) this.day++;
    this.populate();
    c.back = this.checkpointAt();
    // the cat that crossed in somebody's arms, beside them at the bridgehead (whoever is there, if they have gone)
    if (c.cat) {
      const by = this.players.get(c.cat.by) || this.players.values().next().value;
      if (by) this.cm.spawnBeside(by.state, c.cat.variant);
      c.cat = null;
    }
    this.globalDirty = true;
    this.playersDirty = true;
  }

  // The checkpoint at the bridge. Everybody is alive on the mainland - whoever was dead or turned at the end of the
  // island comes back - with what they carried over and, at the least, the bridgehead cache's floor (bridgehead).
  // What each of them has now is kept: every wipe on the mainland starts the run again from it (restartFromBridge).
  // Returns how many it brought back from the dead.
  checkpointAt() {
    let back = 0;
    for (const p of this.players.values()) {
      if (!p.alive || p.zombie) {
        // they dropped what they had where they fell, on the island: they cross with nothing but the floor
        this.spawnHuman(p, { mag: 0, ammo: 0, items: [], tools: [] });
        this.track.returned(p);
        back++;
      } else this.landOn(p);
      this.bridgehead(p);
    }
    this.checkpoint = { day: this.day, unlocked: this.unlocked, kits: this.kitsNow() };
    return back;
  }

  // what each survivor carries right now, as plain data (the checkpoint's kits): [leaverKey, kit]
  kitsNow() {
    const kits = [];
    for (const p of this.players.values()) kits.push([this.leaverKey(p), this.kitOf(p)]);
    return kits;
  }
  kitOf(p) {
    const s = p.state;
    return { weapons: s.weapons.slice(), mags: s.mags.slice(), ammo: s.ammo.slice(), inv: p.inv.map((it) => (it ? { ...it } : null)), armor: p.armor, armorMax: p.armorMax, armorItem: p.armorItem, backpackItem: p.backpackItem, kit: p.kit };
  }
  // ...and back on them
  wear(p, k) {
    const s = p.state;
    s.weapons = k.weapons.slice();
    s.mags = k.mags.slice();
    s.ammo = k.ammo.slice();
    p.inv = k.inv.map((it) => (it ? { ...it } : null));
    p.armor = k.armor;
    p.armorMax = k.armorMax;
    p.armorItem = k.armorItem;
    p.backpackItem = k.backpackItem;
    p.kit = k.kit;
    p.invDirty = true;
    p.selfSync = true;
    this.syncThrow(p);
  }

  // Whether a wipe now starts the run again at the bridge: on the mainland of a run that crossed to it, with a
  // checkpoint to start from. (A game made to start on the mainland starts a new run there instead: startGame.)
  atBridge() {
    return this.act === WORLD.MAINLAND && this.startAct === WORLD.ISLAND && !!this.checkpoint?.kits;
  }

  // A wipe on the mainland of a run that crossed to it: the same mainland again, as the team found it coming off the
  // bridge, on the day they did, each with what they crossed with. Whoever joined since has a late joiner's kit for
  // that day.
  restartFromBridge() {
    const cp = this.checkpoint;
    this.track.finish('abandoned'); // (the wipe's match is over already: gameOver)
    this.clearWorld();
    this.crossing = null;
    this.phase = PHASE.DAY;
    this.day = cp.day;
    this.unlocked = cp.unlocked | 0;
    this.timeLeft = this.dayLen;
    this.populate();
    const kits = new Map(cp.kits);
    for (const p of this.players.values()) {
      p.nightKills = p.nightRevives = 0;
      p.lastChance = false;
      if (p.perksNext >= 0) p.perks = p.perksNext;
      p.perksNext = -1;
      p.progDirty = true;
      p.waypoint = null;
      const k = kits.get(this.leaverKey(p));
      this.spawnHuman(p, k ? k.kit || { mag: 0, ammo: 0, items: [], tools: [] } : starterKit(this.day, this.diff));
      if (k) this.wear(p, k);
      else this.bridgehead(p, false);
    }
    this.notify(NOTIFY.CHECKPOINT, this.day);
    this.newWorldForAll(); // (nobody's prey while the page clears the old run away)
    this.globalDirty = true;
    this.playersDirty = true;
    this.track.start();
    this.log(`wiped on the mainland: back at the bridgehead, day ${this.day}`);
  }

  // The gun crates of a game that starts on the mainland (acts.js MAINLAND_START), on the ground at the bridgehead
  // (world.startCrates), shut: one for each survivor there, CRATES at the least. [E] breaks one open (interact).
  startCrates() {
    const spots = this.world.startCrates || [];
    const n = Math.min(spots.length, MAINLAND_START.CRATES_MAX, Math.max(MAINLAND_START.CRATES, this.humanCount()));
    for (let i = 0; i < n; i++) {
      const sp = spots[i];
      const e = { kind: ENT.CRATE, x: sp.x, y: 0, z: sp.z, gy: 0, state: 1, despawnAt: this.time + 1e9, gun: MAINLAND_START.GUNS[i % MAINLAND_START.GUNS.length] };
      e.y = e.gy = groundAt(this.world, sp.x, sp.z, 200, 0.6);
      if (this.spawnEntity(e)) this.crates.push(e);
    }
  }
  // what a gun crate holds, out on the ground as it breaks open: its gun, loaded, its rounds and the stock
  openGunCrate(e) {
    const def = WEAPONS[e.gun];
    this.dropItem(e.gun, 1, e.x, e.y, e.z, { spread: 0.8, life: 900, mag: def.mag });
    const ammo = AMMO_ITEMS[def.ammo];
    if (ammo) this.dropItem(ammo, Math.min(AMMO_MAX[def.ammo], def.mag * MAINLAND_START.MAGS), e.x, e.y, e.z, { spread: 1.2, life: 900 });
    for (const [item, count] of MAINLAND_START.STOCK) this.dropItem(item, count, e.x, e.y, e.z, { spread: 1.2 + this.rng() * 0.8, life: 900 });
  }

  // a survivor who crossed in the car, put down at the bridgehead as they are: on their feet, off whatever the
  // island had them on, with everything they carried
  landOn(p) {
    const s = p.state;
    if (p.downed) {
      p.downed = false;
      s.downed = 0;
      p.bleed = 0;
      p.revivedBy = 0;
      p.hp = Math.max(p.hp, REVIVE_HP);
    }
    s.ride = s.cart = s.hmg = s.pet = s.drag = 0;
    s.drive = s.driveK = s.pass = s.passN = 0;
    s.pinned = s.pulled = 0;
    s.vx = s.vy = s.vz = 0;
    this.putAtStart(s);
    p.selfSync = true;
    this.fillHistory(p);
  }

  // where a run on this map begins: one of its spawn points, facing away from what was left behind
  putAtStart(s) {
    const w = this.world;
    const sp = w.spawnPoints[Math.floor(this.rng() * w.spawnPoints.length)];
    s.x = sp.x + (this.rng() - 0.5) * 1.5;
    s.z = sp.z + (this.rng() - 0.5) * 1.5;
    s.y = groundAt(w, s.x, s.z, 50, 0.3);
    const car = w.kind === WORLD.MAINLAND ? { x: w.bridge.x1 - 40, z: w.bridge.z } : w.car;
    s.yaw = Math.atan2(-(car.x - s.x), -(car.z - s.z)) + Math.PI; // back to the car (or the bridge), facing the road
  }

  // The bridgehead cache (acts.js BRIDGEHEAD): what a survivor is short of the floor is made up, and nothing else. A
  // team that crossed with empty guns can fight its way to the first building; one that crossed well stocked gets
  // nothing. The difficulty moves the floor's rounds and bandages as it does the starting kit's (starterKit):
  // Nightfall's are the numbers in acts.js. Returns what it gave (CACHE_GAVE), which the survivor is told.
  // tell: say what it gave (NOTIFY.CACHE); not at the start of a game begun on the mainland, which has its own words
  bridgehead(p, tell = true) {
    const s = p.state;
    let gave = 0;
    const gun = (it) => isFirearm(it) && it !== ITEM.FLARE_GUN;
    const guns = [s.weapons[SLOT_PRIMARY], s.weapons[SLOT_PISTOL]];
    if (!guns.some(gun) && this.giveItem(p, BRIDGEHEAD.PISTOL, 1, WEAPONS[BRIDGEHEAD.PISTOL].mag)) {
      gave |= CACHE_GAVE.PISTOL;
      guns.push(BRIDGEHEAD.PISTOL); // (in the pistol's slot, or in the backpack if a flare gun has that)
    }
    for (const it of guns) {
      if (!gun(it)) continue;
      const def = WEAPONS[it];
      const want = Math.min(Math.round(BRIDGEHEAD.ROUNDS * this.diff.ammo), Math.round(def.mag * BRIDGEHEAD.MAGS * this.diff.ammo), AMMO_MAX[def.ammo]);
      if (s.ammo[def.ammo] >= want) continue;
      s.ammo[def.ammo] = want;
      gave |= CACHE_GAVE.AMMO;
    }
    const heals = countItem(p.inv, ITEM.BANDAGE) + countItem(p.inv, ITEM.MEDKIT);
    const bandages = Math.max(1, Math.round(BRIDGEHEAD.BANDAGES * this.diff.bandages));
    if (heals < bandages && this.giveItem(p, ITEM.BANDAGE, bandages - heals)) gave |= CACHE_GAVE.BANDAGE;
    if (!s.weapons[SLOT_MELEE]) {
      s.weapons[SLOT_MELEE] = BRIDGEHEAD.MELEE;
      gave |= CACHE_GAVE.MELEE;
    }
    if (!s.weapons[SLOT_BUILD]) {
      s.weapons[SLOT_BUILD] = BRIDGEHEAD.BUILD;
      gave |= CACHE_GAVE.BUILD;
    }
    if (gave) {
      p.invDirty = true;
      p.selfSync = true;
      if (tell) this.notify(NOTIFY.CACHE, gave, p.id);
    }
    return gave;
  }

  // The crossing is over (its clock ran out, or everybody asked to skip it): the first day on the mainland begins.
  arrive() {
    this.buildMainland(true); // (a crossing cut short before its mainland was up)
    const back = this.crossing?.back || 0;
    this.crossing = null;
    this.phase = PHASE.DAY;
    this.track.arrived(back);
    this.timeLeft = this.dayLen;
    this.notify(NOTIFY.ARRIVED, back);
    this.newWorldForAll(); // (a page still building the mainland - a skip, a slow machine, /map2 - is nobody's prey)
    this.sound(SOUND.DAWN, 0, 0, 0, 0);
    this.globalDirty = true;
    this.playersDirty = true;
    this.log(`arrived on the mainland: day ${this.day}, ${back} back from the dead`);
  }

  // A player asks for the crossing to be skipped (ACT.SKIP). It is, once everybody who is connected has asked, and
  // not before the clients have their mainland up (CROSSING.SKIP_AFTER).
  skipCrossing(p) {
    const c = this.crossing;
    if (this.phase !== PHASE.CROSSING || !c || c.skip.includes(p.id)) return;
    c.skip.push(p.id);
    this.globalDirty = true;
  }
  skipVotes() {
    const c = this.crossing;
    let need = 0;
    let got = 0;
    for (const p of this.players.values()) {
      if (p.away) continue;
      need++;
      if (c && c.skip.includes(p.id)) got++;
    }
    return [got, need];
  }

  // Hide the schematics around the map: each in a locker, ammo crate or toolbox (CONT_DEFS[t].schem) of a random
  // place far from the start, never two in the same place while there is a place left without one. The survivors
  // are told which place each is rumoured to be in, not which container: they have to search that place's.
  placeSchematics() {
    const w = this.world;
    const byPlace = new Map();
    for (const c of this.caches) {
      // (far from where a run on this map begins: the car on the island, the bridgehead on the mainland)
      if (!CONT_DEFS[c.ctype].schem || !w.zoneById[c.zone] || Math.hypot(c.x - w.start.x, c.z - w.start.z) <= 90) continue;
      byPlace.set(c.zone, [...(byPlace.get(c.zone) || []), c]);
    }
    const places = this.shuffle([...byPlace.values()]);
    let turn = 0;
    this.schemHints = SCHEMATICS.map((item) => {
      // (one the team has is hidden nowhere: the mainland hides what the island kept)
      if (this.unlocked & (1 << SCHEM_BIT[item])) return 255;
      for (let tries = 0; tries < places.length; tries++) {
        const free = places[turn++ % places.length].filter((c) => !c.schem);
        if (!free.length) continue;
        const c = free[Math.floor(this.rng() * free.length)];
        c.schem = item;
        return c.zone;
      }
      return 255;
    });
  }

  // Hide the car supplies around the valley: each at a random hiding spot of a random place on this map, and
  // never two in the same place while there is a place left without one. The survivors are told which place
  // each is rumoured to be in.
  placeSupplies() {
    const shuffle = (a) => this.shuffle(a);
    const byPlace = new Map();
    for (const sp of this.world.partSpots) byPlace.set(sp.zone, [...(byPlace.get(sp.zone) || []), sp]);
    const places = this.act === WORLD.MAINLAND ? [] : shuffle([...byPlace.values()].map(shuffle));
    this.supplySpots = [];
    this.supplyFound = 0;
    this.scouted = 0;
    this.supplyHintSpots = [];
    this.supplyClock = 0;
    this.supplyHelp = 0;
    const { items, need } = this.sup;
    // on the mainland a part is at one of its own set places (world.partSpots[k].supply: shared/mainland.js)
    const own = (i) => shuffle(this.world.partSpots.filter((sp) => sp.supply === i));
    const set = items.map((_, i) => own(i));
    // deal them out round the places: a place only gets a second one once every place has had one
    let turn = 0;
    this.supplyHints = items.flatMap((item, i) => new Array(need[i]).fill(i)).map((i, hint) => {
      const item = items[i];
      const hide = (sp) => {
        this.spawnItem(item, 1, sp.x, this.onFloor(sp.x, sp.y, sp.z), sp.z, { permanent: true, hint });
        this.supplySpots.push(sp);
        this.supplyHintSpots[hint] = this.world.partSpots.indexOf(sp);
        return sp.zone;
      };
      this.supplyHintSpots[hint] = -1;
      const at = set[i].pop();
      if (at) return hide(at);
      for (let tries = 0; tries < places.length; tries++) {
        const sp = places[turn++ % places.length].pop();
        if (sp) return hide(sp);
      }
      return 255;
    });
  }

  // ---------------------------------------------------------------- tick
  // (the ts.mark after each group of calls times it as one section of the tick: see tickstats.js)
  update() {
    const ts = this.tickStats;
    ts.begin();
    usePos(this.world); // (positions in everything this tick sends are in this world's units: protocol.js)
    this.tick++;
    // brought over from the last server, and nobody is playing yet: nothing moves and no clock runs. Whoever is back
    // is sent the game as it stands, and their commands are taken and not run
    if (this.frozen()) {
      for (const p of this.players.values()) this.drainInputs(p);
      ts.mark(T_INPUTS);
      this.sendSnapshots();
      ts.mark(T_SNAPSHOTS);
      this.endTick();
      return;
    }
    const dt = SERVER_DT;
    this.time += dt;
    // release quarantined ids
    while (this.quarantine.length && this.quarantine[1] <= this.tick) {
      this.freeIds.push(this.quarantine[0]);
      this.quarantine.splice(0, 2);
    }
    // forget the join allowances that have worn off (see allow)
    if (this.tick % 600 === 0) for (const [ip, a] of this.joins) if (this.time - a.t >= a.n * JOIN_EVERY) this.joins.delete(ip);
    // the held whose minute is up are gone (hold)
    if (this.tick % SERVER_TICK_RATE === 0)
      for (const p of [...this.players.values()])
        if (p.away && this.time - p.away.since >= p.away.grace) {
          this.log(`hold ${p.name}: did not come back`);
          this.removePlayer(p);
        }
    if (this.phase === PHASE.WAITING) {
      if (this.rollWhenEmpty) this.rollWorld(); // (the valley for the next run, once the last one has emptied: see resetToWaiting)
      this.processInputs();
      ts.mark(T_INPUTS);
      this.sendSnapshots();
      ts.mark(T_SNAPSHOTS);
      this.endTick();
      return;
    }
    // the crossing: nobody acts, nothing walks. The mainland is built in its first tick, then the clock runs out
    if (this.phase === PHASE.CROSSING) {
      this.buildMainland();
      for (const p of this.players.values()) this.drainInputs(p);
      ts.mark(T_INPUTS);
      const prev = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      if (this.crossing.hold) this.timeLeft = Math.max(this.timeLeft, this.crossing.hold === 2 ? CROSSING.TIME - 2 : 4); // (/cross hold: look-dev)
      if (Math.ceil(this.timeLeft) !== prev) this.globalDirty = true;
      const [got, need] = this.skipVotes();
      if (this.timeLeft <= 0 || (need > 0 && got >= need && CROSSING.TIME - this.timeLeft >= CROSSING.SKIP_AFTER)) this.arrive();
      this.recordHistory();
      ts.mark(T_PHASE);
      this.sendSnapshots();
      ts.mark(T_SNAPSHOTS);
      this.endTick();
      return;
    }
    this.processInputs();
    this.fair.update();
    this.handcars.update();
    this.vehicles.update();
    ts.mark(T_INPUTS);
    this.updatePhase(dt);
    this.pledges.update(dt);
    this.updateSupplyHelp(dt);
    this.roles.update(dt);
    this.cemetery.update(dt);
    ts.mark(T_PHASE);
    this.updatePlayers(dt);
    for (const p of this.players.values()) p.firePresses = 0; // (each counted this tick: updateFire)
    this.gun.update(dt);
    ts.mark(T_PLAYERS);
    this.zm.update(dt);
    ts.mark(T_ZOMBIES);
    this.cm.update(dt);
    this.dm.update(dt);
    ts.mark(T_CATS);
    this.combat.updateProjectiles(dt);
    this.combat.updateAreas(dt);
    ts.mark(T_COMBAT);
    this.updateStructures(dt);
    this.updateItems(dt);
    this.updateCrates(dt);
    this.fixtures.update(dt);
    if (this.ringing.size) this.updateAlarms(dt);
    this.tellArmedTrunks(dt);
    this.recordHistory();
    this.track.tick();
    this.ach.tick();
    this.bestiary.tick();
    this.cards.tick(SERVER_DT);
    ts.mark(T_UPKEEP);
    this.sendSnapshots();
    ts.mark(T_SNAPSHOTS);
    this.endTick();
  }

  // Closes the tick's timing. One over its budget is logged at once with where the time went and what the server
  // was carrying (TickStats lets a line through every few seconds and counts the rest).
  endTick() {
    const ts = this.tickStats;
    const due = ts.end();
    this.stats.tickMs = this.stats.tickMs * 0.95 + ts.ms * 0.05;
    if (due) this.log(`slow tick ${ts.slowText(`players ${this.players.size} zombies ${this.zombies.length} ents ${this.all.length}`)}`);
  }

  recordHistory() {
    const k = this.tick & (HISTORY_TICKS - 1);
    for (const z of this.zombies) {
      z.hx[k] = z.x;
      z.hy[k] = z.y;
      z.hz[k] = z.z;
    }
    for (const p of this.players.values()) {
      p.hx[k] = p.state.x;
      p.hy[k] = p.state.y;
      p.hz[k] = p.state.z;
    }
    for (const d of this.deer) {
      d.hx[k] = d.x;
      d.hy[k] = d.y;
      d.hz[k] = d.z;
    }
  }
}

// Lays a part's methods onto Game, as if they had been written in its class body (not enumerable, as a class's own are;
// a getter stays a getter). Two parts giving the same name is a mistake, not an override.
function addMethods(cls, part, methods) {
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(methods))) {
    if (k in cls.prototype) throw new Error(`Game.${k} is defined twice (server/game/${part}.js)`);
    Object.defineProperty(cls.prototype, k, { ...d, enumerable: false });
  }
}
for (const [part, mod] of Object.entries(PARTS)) addMethods(Game, part, mod.methods);

export { prepareWorld } from './game/run.js'; // (room-worker.js)
export { REJOIN_GRACE } from './game/sessions.js'; // (scripts/sim-rejoin.js)
export { SLOT_BUILD, SLOT_PISTOL };
