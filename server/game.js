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
  CMDS_PER_PACKET,
  NIGHT_LENGTH,
  NIGHT_WAVES,
  MOON,
  ESCAPE_RADIUS,
  PLAYER_MAX_HP,
  FLASHLIGHT_MAX,
  SLOT_PRIMARY,
  SLOT_PISTOL,
  SLOT_MELEE,
  SLOT_BUILD,
  INVENTORY_MAX,
  REVIVE_HP,
  DAWN_RETURN,
  SLOT_RADIO,
  PIN_FACE,
} from '../shared/constants.js';
import {
  ITEM,
  WEAPONS,
  STRUCT,
  LOOT_TABLES,
  suppliesOf,
  CACHE_GAVE,
  SCHEMATICS,
  SCHEM_BIT,
  CONT_DEFS,
  AMMO,
  AMMO_MAX,
  AMMO_ITEMS,
  SOUND,
  EVT,
  NOTIFY,
  ZONE,
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
import { MineNav } from './minenav.js';
import { createPlayerState, copyPlayerState, samePlayerState, snapPlayerState, radioKeyed } from '../shared/playersim.js';
import { groundAt } from '../shared/collision.js';
import { mulberry32 } from '../shared/rng.js';
import * as Director from './director.js';
import { difficultyOf } from '../shared/difficulty.js';
import { Nav } from './nav.js';
import { ClientView, writeEntities, stageEntities } from './snapshot.js';
import { createInventory, invCap, removeItem, tidyStacks, countItem, sortInventory } from './inventory.js';
import { Zombies } from './zombies.js';
import { Cats } from './cats.js';
import { Deer } from './deer.js';
import { Combat } from './combat.js';
import { TickStats, T_INPUTS, T_PHASE, T_PLAYERS, T_ZOMBIES, T_CATS, T_COMBAT, T_UPKEEP, T_SNAPSHOTS } from './tickstats.js';
import { PlayerStats, idKey } from './stats.js';
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
import { PLEDGE } from '../shared/pledge.js';
import { Loadouts, clearLoadoutRun } from './loadouts.js';
import { checkEnvelope, worldPrint, sameWorld, HandoffError } from './handoff.js';
import { saveGame, loadGame } from './gamestate.js';
import { CHARACTER_NONE, characterFor, defaultCharacter } from '../shared/characters.js';
import { readLook, canonicalBytes } from '../shared/appearance.js';
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
import { STARTER_TOOLS, starterKit } from './game/survivors.js';
import { MAX_DROPS, looseSupply } from './game/items.js';

const PARTS = { commands, blows, phases, escape, supplydrops, trunks, items, crafting, equipment, building, harm, interact, input, survivors, experience };

const LEFT_KITS_MAX = 64; // kits remembered for players who left this run (parkKit)
// Coming and going. An address may join twice the lobby in one go, then once every JOIN_EVERY seconds: more than
// a household reloading its browsers gets near (admitJoin). The join / leave chat lines of everybody together
// get two lobbies' worth, then one every GREET_EVERY seconds; past that, players come and go unannounced.
const JOIN_EVERY = 4;
const GREET_EVERY = 10;
// A dropped player (connection lost, browser crashed or closed) keeps their place this long (onClose / hold / resume).
// The client closes with LEFT_CODE when "Leave game" is pressed: that one goes at once. REJOIN_GRACE_SECONDS: tests.
export const REJOIN_GRACE = +(process.env.REJOIN_GRACE_SECONDS || 60);
const DEAD_CONN = { send() {}, close() {}, closed: true, slot: -1, user: null, ip: '' };
// Back is not playing yet. A JOIN gives a held player their body back at once, but their browser then builds the
// valley and its shaders before it draws a frame or sends a command (seconds; after a deploy's reload, up to half a
// minute), and all that time the body stood there for the dead. So a player who is back stays as safe as a held one
// (Game.safe) until their client is plainly running - commands in ARRIVE_TICKS ticks (a quarter of a second of frames:
// a page still building its valley or its shaders sends none, as its frame loop is held; the client finishes its
// shader warm-up before the first command of a game it joins, Game.update), or anything they do - or ARRIVE_MAX seconds
// have passed; after a drop, never longer than what was left of the grace they had anyway, so coming back is no more
// of a shelter than staying away was. ARRIVE_SECONDS: tests (0: none of this).
const ARRIVE_MAX = +(process.env.ARRIVE_SECONDS ?? 45);
const ARRIVE_TICKS = Math.ceil(SERVER_TICK_RATE / 4);
// A game brought over from the last server does not run until one of its players is playing again (or somebody new
// is), or this many seconds of the clock on the wall have passed: the day does not burn down and the dead do not
// close in on a game whose every player is still on their way back. HANDOFF_FREEZE_SECONDS: tests (0: it runs on).
const HANDOFF_FREEZE = +(process.env.HANDOFF_FREEZE_SECONDS ?? 45);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const randomSeed = () => (Math.random() * 0x7fffffff) | 0;

// The valley of a seed and act, with what is derived from it alone: its fingerprints and the dead's ways across it.
// The costly part of making a game (a few hundred ms). A deploy builds it in the next server's worker for a game the
// last server is about to hand over, while that game is still being played there (room-worker.js `prepare`), so its
// players only wait for the save to be loaded into it.
export function prepareWorld(seed, act = WORLD.ISLAND) {
  const t0 = Date.now();
  const world = worldFor(seed, act);
  usePos(world);
  const nav = new Nav(world);
  return { seed, act, world, print: worldPrint(world), nav, mineNav: world.mine ? new MineNav(world, nav) : null, ms: Date.now() - t0 };
}

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

  // ---------------------------------------------------------------- sessions
  onOpen(conn) {
    const session = { conn, player: null, ip: conn.ip || '', msgCount: 0, msgWindow: 0 };
    this.sessions.add(session);
    return session;
  }
  // code: the socket's close code. A player whose connection dropped (or whose browser crashed or closed) is held for
  // REJOIN_GRACE seconds rather than removed: they stay where they were, safe - the dead don't go for them, nothing hurts
  // them, a downed one doesn't bleed - and a JOIN from the same account or browser in that time puts them back in their
  // own body with everything they had (handleJoin -> resume). Only "Leave game" (LEFT_CODE), or a player nobody could
  // know again (no account, no browser id), leaves at once; the held are removed when their time is up (update).
  onClose(session, code = 0) {
    this.sessions.delete(session);
    const p = session.player;
    if (!p) return;
    if (code !== LEFT_CODE && p.rejoinKey && (this.phase === PHASE.DAY || this.phase === PHASE.NIGHT || this.phase === PHASE.CROSSING)) this.hold(p);
    else this.removePlayer(p);
  }

  // grace: seconds they have to come back. handoff: they were brought over from the last server (gamestate.js), and
  // quiet: nobody is told (everybody was moved).
  hold(p, { grace = REJOIN_GRACE, quiet = false, handoff = false } = {}) {
    p.away = { since: this.time, grace, handoff };
    p.session = { conn: DEAD_CONN, player: p, ip: '', msgCount: 0, msgWindow: 0 }; // (whatever the game still sends them goes nowhere)
    p.cmdQueue.length = 0;
    p.hold = null;
    this.endUse(p);
    this.releaseHolds(p); // (a leaper or a roper on them lets go)
    this.cards.hold(p); // (their trade and their asks are called off; a match waits for them, its clock stopped)
    this.playersDirty = true;
    if (!quiet) this.systemChat(`${p.name} lost connection - holding their place for ${grace} seconds.`);
    this.log(`hold ${p.name}: ${handoff ? 'from the last server' : 'dropped'}, ${grace} s to come back`);
  }

  // A player's account or browser has joined again while their old socket is still open here: that socket is let go -
  // closed, as one a newer join replaced, and nothing it still sends counts - and they are held for resume to take over.
  takeOver(p) {
    const old = p.session;
    this.sessions.delete(old);
    old.player = null;
    old.conn.replace?.('You joined this game again from another page.');
    this.hold(p, { quiet: true });
    this.log(`take over ${p.name}: joined again while their old socket was still open`);
  }

  // a held player is back (a JOIN from the same account or browser): this session takes over their body
  resume(session, p) {
    const moved = p.away?.handoff;
    const left = p.away ? Math.max(0, p.away.grace - (this.time - p.away.since)) : 0;
    p.away = null;
    p.arriving = ARRIVE_MAX > 0 ? { until: this.time + (moved ? ARRIVE_MAX : Math.min(ARRIVE_MAX, left)), n: 0, tick: -1 } : null;
    p.session = session;
    session.player = p;
    p.admin = !!session.conn.user?.isAdmin || this.devAdmin;
    // a new client: it knows nothing yet - everything is sent again as to a newcomer, and its commands count from 0
    p.cmdQueue.length = 0;
    p.lastSeq = 0;
    p.hasSeq = false;
    p.recvSeq = 0;
    p.view = new ClientView();
    p.selfSync = true;
    // (what the old client was sent: writeSelf, writeGlobalFor and the player list only send what differs from it, and
    // the new one starts from its defaults - a held zombie would come back to a survivor's HUD)
    p.selfCache = null;
    p.globalCache = null;
    p.listVer = -1;
    p.snapTick = -2;
    p.ackSent = 0;
    p.invDirty = true;
    p.progDirty = true; // (their XP too)
    p.progT = -99;
    const w = new Writer(64);
    w.u8(S2C.WELCOME);
    w.u16(p.id);
    w.u32(this.seed >>> 0);
    w.u32(this.tick);
    w.u8(SERVER_TICK_RATE);
    w.u8(this.maxPlayers);
    w.u8(p.admin ? WELCOMEF.ADMIN : 0);
    w.u8(this.act); // which of the run's two maps that seed is to be built as (shared/acts.js)
    session.conn.send(w.bytes());
    const spent = [];
    for (const [col, g] of this.gather) if (g.left <= 0) spent.push(col);
    this.tellStripped(spent, p.id);
    this.tellCut(p.id);
    this.tellWrecks(p.id);
    this.tellFriendCodes(p);
    this.tellLooks(p);
    this.bestiary.join(p);
    this.cards.join(p); // (their collection, decks, asks and a match or trade of theirs: sent again)
    this.loadouts.join(p);
    this.sendChat(p, 0, CHATF.SYSTEM, moved ? 'The server was updated while you played: you are back where you were, with what you had.' : 'Reconnected: you are back where you were, with what you had.');
    if (!moved) this.systemChat(`${p.name} reconnected.`);
    this.playersDirty = true;
    this.globalDirty = true;
    this.log(`resume ${p.name}`);
  }
  // Held, or back and not playing yet (ARRIVE_MAX): nothing hurts them, the dead do not go for them, a downed one does
  // not bleed.
  safe(p) {
    if (p.away) return true;
    if (!p.arriving) return false;
    if (this.time < p.arriving.until) return true;
    p.arriving = null;
    return false;
  }
  // Everybody here has a new world to build - the mainland, a new run's island - and their page holds for as long as
  // that takes (seconds; more on a slow machine), nothing on their screen, while the game runs on. They are arriving
  // again: as safe as one back from a drop (safe) until their page is running - ARRIVE_TICKS ticks of commands, or
  // anything they do (arrived) - or ARRIVE_MAX at most. A page that builds it quickly is playing a few ticks later.
  // (Only a page that was sending commands - hasSeq: what has none to stop sending, a test's or a bot's that never
  // sends any, is as it was)
  newWorldForAll() {
    if (ARRIVE_MAX <= 0) return;
    for (const p of this.players.values()) if (p.session && !p.away && p.hasSeq) p.arriving = { until: this.time + ARRIVE_MAX, n: 0, tick: -1 };
  }
  // a command packet from one who is back: their client is running. ARRIVE_TICKS ticks with one, and they are playing
  arrived(p) {
    const a = p.arriving;
    if (!a || a.tick === this.tick) return;
    a.tick = this.tick;
    if (++a.n >= ARRIVE_TICKS) p.arriving = null;
  }
  // A game brought over from the last server, with nobody playing in it yet (load, HANDOFF_FREEZE)
  frozen() {
    if (!this.thawAt) return false;
    let playing = false;
    for (const p of this.players.values()) if (!p.away && !p.arriving) playing = true;
    if (!playing && this.players.size && Date.now() < this.thawAt) return true;
    this.thawAt = 0;
    this.log(`${playing ? 'the game runs on: a player is back' : 'the game runs on: nobody came back in time'} (runs again: stood still ${Date.now() - this.frozenAt} ms)`);
    return false;
  }

  onMessage(session, data) {
    usePos(this.world); // (positions in what this message says are in this world's units: protocol.js)
    // basic flood protection
    const now = this.time;
    if (now - session.msgWindow > 1) {
      session.msgWindow = now;
      session.msgCount = 0;
    }
    if (++session.msgCount > 200) return;
    let r;
    try {
      r = new Reader(data);
      const type = r.u8();
      const p = session.player;
      if (type === C2S.JOIN) return this.handleJoin(session, r);
      if (type === C2S.PING) {
        const t = r.f64();
        const w = new Writer(16);
        w.u8(S2C.PONG);
        w.f64(t);
        session.conn.send(w.bytes());
        return;
      }
      if (!p) return;
      switch (type) {
        case C2S.INPUT:
          return this.handleInput(p, r);
        case C2S.ACTION:
          return this.handleAction(p, r);
        case C2S.CHAT:
          return this.handleChat(p, r.str());
        case C2S.BOARD:
          return this.sendBoard(p);
        case C2S.CARDS:
          return this.cards.onMessage(p, r);
        case C2S.PLEDGE: {
          if (r.view.getUint16(r.o, true) > PLEDGE.MSG_MAX) return;
          let data = null;
          try {
            data = JSON.parse(r.str());
          } catch {
            return;
          }
          return this.pledges.onMessage(p, data);
        }
        case C2S.VOICE: {
          const target = r.u16();
          const payload = r.str();
          const tp = this.players.get(target);
          if (tp && payload.length < 20000) {
            const w = new Writer(payload.length * 3 + 16);
            w.u8(S2C.VOICE);
            w.u16(p.id);
            w.str(payload);
            tp.session.conn.send(w.bytes());
          }
          return;
        }
      }
    } catch (err) {
      this.log('bad message', err.message);
    }
  }

  // A rate allowance: a.n is how much of it was used lately, wearing off by one every `every` seconds (a.t: when
  // that was last worked out). Uses one more unless that would take it past `burst`.
  allow(a, burst, every) {
    a.n = Math.max(0, a.n - (this.time - a.t) / every);
    a.t = this.time;
    if (a.n + 1 > burst) return false;
    a.n++;
    return true;
  }
  // May this session's address join now? (JOIN_EVERY; an allowance that has worn off is forgotten in update)
  admitJoin(session) {
    let a = this.joins.get(session.ip);
    if (!a) this.joins.set(session.ip, (a = { n: 0, t: this.time, refused: false }));
    const ok = this.allow(a, 2 * this.maxPlayers, JOIN_EVERY);
    if (!ok && !a.refused) this.log(`join refused: too many in a row from ${session.ip || 'one address'}`);
    a.refused = !ok;
    return ok;
  }

  handleJoin(session, r) {
    if (session.player) return;
    const version = r.u8();
    let name = r.str().replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || 'Survivor';
    // who they are to the leaderboard: for PlayerStats.enter alone, never logged and never sent on. (A client that
    // sends none - the test bots - plays like anyone else, and nothing is kept for it.)
    const pid = r.left > 0 ? r.str() : '';
    // the survivor they chose to be (shared/characters.js): a trailing byte an older client leaves off, which gets the
    // look picked from their id as before; a value out of range is treated the same (characterFor)
    const choice = r.left > 0 ? r.u8() : CHARACTER_NONE;
    // ...and a custom survivor's look after it (the character creator: shared/appearance.js), kept as its canonical
    // bytes, a plain array (it goes into the saved game on a deploy). Anything that is not a look: none, the character
    let look = null;
    if (r.left > 0) {
      try {
        const b = readLook(r);
        look = b ? canonicalBytes(b) : null;
      } catch {
        look = null;
      }
    }
    // signed in to an account (server/auth.js: the network thread knew them by their session cookie, and says so
    // on the socket: room-worker.js), they play under its name whatever the JOIN says
    const account = session.conn.user || null;
    if (account) name = account.name;
    const reject = (reason) => {
      const w = new Writer(4);
      w.u8(S2C.REJECT);
      w.u8(reason);
      session.conn.send(w.bytes());
    };
    if (version !== PROTOCOL_VERSION) return reject(REJECT_REASON.VERSION);
    // back from a drop inside the grace minute, or from a deploy: their own body (onClose / hold). (A guest by the
    // hash of their browser id, never the id: it is the key to their leaderboard record, and a deploy saves this.)
    const key = account ? `a:${account.id}` : UUID_RE.test(pid) ? `g:${idKey(pid)}` : '';
    // ...or back before the game has even seen them go: their old link is dead but its socket has not closed here yet
    // (the page notices a lost connection long before the server does: up to the socket's idle timeout). This one
    // takes the body over, and the old socket is let go (takeOver). That is a page coming back into the game it was
    // playing (conn.back: main.js rejoin), or anyone of theirs at a full game, where the old socket still fills their
    // seat (Room.mayComeBack let it in). Otherwise the same browser in another tab is a player of its own, as ever.
    // (Without conn.back a drop with a seat free made a second, new player with a starting kit beside the old body.)
    if (key) {
      const full = this.players.size >= this.maxPlayers;
      const back = full || session.conn.back === true;
      // (theirs in two tabs: a held one first, else the one heard from longest ago - its socket is the dead one)
      let q = null;
      for (const c of this.players.values()) {
        if (c.rejoinKey !== key || (!c.away && !back)) continue;
        if (!q || (c.away && !q.away) || (!c.away === !q.away && c.session.msgWindow < q.session.msgWindow)) q = c;
      }
      if (q) {
        if (!q.away) this.takeOver(q);
        q.rec ||= this.records.enter(pid, q.name, account); // (one brought over from the last server has none here yet)
        return this.resume(session, q);
      }
    }
    if (this.players.size >= this.maxPlayers) return reject(REJECT_REASON.FULL);
    if (!this.admitJoin(session)) return reject(REJECT_REASON.FULL); // (the one "try again later" the client knows)
    // unique names
    const names = new Set([...this.players.values()].map((p) => p.name));
    let base = name;
    let k = 2;
    while (names.has(name)) name = `${base.slice(0, 13)}#${k++}`;
    // an emptied server rolls its next valley on the tick after (resetToWaiting): a join that beats that tick
    // rolls it here, so the seed in WELCOME is the one this run is played on
    if (this.phase === PHASE.WAITING) this.rollWorld();
    this.buildMainland(true); // (a join during the crossing: the mainland it is put down on has to stand)

    const p = this.createPlayer(session, name);
    // no entity id left for them: turned away like from a full server, to try again once ids have come back
    if (!p) return reject(REJECT_REASON.FULL);
    session.player = p;
    p.admin = !!account?.isAdmin || this.devAdmin;
    p.character = characterFor(choice, p.id);
    p.look = look;
    p.rejoinKey = key; // who can take this body back after a drop ('' : nobody - no account and no browser id)
    p.rec = this.records.enter(pid, base, account);
    p.account = account ? account.id : ''; // their account's id, '' for a guest
    p.guestKey = account ? '' : idKey(pid); // a guest's browser id as stats.js files it ('' without one): never the id itself
    p.friend = account ? account.name : ''; // the account a friend request goes to (S2C.FRIENDS); '' for a guest
    this.loadProgress(p);
    const w = new Writer(64);
    w.u8(S2C.WELCOME);
    w.u16(p.id);
    w.u32(this.seed >>> 0);
    w.u32(this.tick);
    w.u8(SERVER_TICK_RATE);
    w.u8(this.maxPlayers);
    w.u8(p.admin ? WELCOMEF.ADMIN : 0);
    w.u8(this.act); // which of the run's two maps that seed is to be built as (shared/acts.js)
    session.conn.send(w.bytes());
    if (this.phase === PHASE.WAITING) this.startGame();
    else if (this.fallen.delete(this.leaverKey(p)) && (this.phase === PHASE.DAY || this.phase === PHASE.NIGHT)) {
      // died in this run and came back in before sunrise: they are what they were, and wait for dawn with the rest
      // of the dead - a reload is no way round a death, and nor is another name (leaverKey). The kit parked for them
      // stays where it is: the dead carry nothing, and returnFallen replaces it at sunrise.
      this.spawnPlayerZombie(p);
      this.sendChat(p, 0, CHATF.SYSTEM, `You died in this run: you are one of them ${this.escape.active ? 'to the end of it' : 'until dawn'}.`);
    } else {
      // a run in progress: beside the team, with a kit for the day - or, back in the run they left, with what they
      // left with (parkKit)
      const left = this.leftKits.get(this.leaverKey(p));
      this.leftKits.delete(this.leaverKey(p));
      this.spawnHuman(p, left || starterKit(this.day, this.diff), true);
      if (left) this.sendChat(p, 0, CHATF.SYSTEM, 'Back in the same run: you have what you left with.');
    }
    this.vehicles.provide(); // (a seat for them too: the next of the bridgehead's vehicles, if the team has outgrown the rest)
    this.pledges.joined(p); // (a run that has just begun: they are in its pledge window too)
    this.track.join(p);
    this.ach.join(p);
    this.bestiary.join(p);
    this.cards.join(p);
    this.loadouts.join(p);
    // what the team has used up before they came (a run this join started has cleared it: NEW_GAME says so)
    const spent = [];
    for (const [col, g] of this.gather) if (g.left <= 0) spent.push(col);
    this.tellStripped(spent, p.id);
    this.tellCut(p.id);
    this.tellWrecks(p.id);
    this.notify(NOTIFY.PLAYER_JOINED, p.id);
    this.tellFriendCodes(p);
    this.tellLooks(p);
    p.greeted =this.allow(this.greets, 2 * this.maxPlayers, GREET_EVERY);
    if (p.greeted) this.systemChat(p.zombie ? `${p.name} is back among the dead.` : `${p.name} joined the survivors.`);
    this.playersDirty = true;
    this.globalDirty = true;
    this.log(`join ${p.name} (${this.players.size}/${this.maxPlayers})`);
  }

  // id: the one they had on the last server (gamestate.js), else the next free one
  createPlayer(session, name, id = 0) {
    const p = {
      kind: ENT.PLAYER,
      session,
      name,
      state: createPlayerState(),
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      armor: 0,
      armorMax: 0,
      armorItem: 0,
      backpackItem: 0, // the backpack worn (ITEM.BACKPACK), 0: none. Worn, it opens BACKPACK_SLOTS more slots (invCap)
      alive: true,
      zombie: false,
      downed: false,
      bleed: 0,
      lastSrc: null,
      revivedBy: 0,
      respawnT: 0,
      inv: createInventory(),
      invDirty: true,
      invSort: false, // something picked up or dropped: the grid is sorted before it goes out (sendTick)
      splitKeep: new Map(), // item -> its count when last split (ACT.SPLIT_INV): kept apart while it stays that (tidyStacks)
      lastDrop: null, // { e, t }: the item entity they last put down from the inventory, and when (ACT.UNDO_DROP)
      kit: null, // the starting kit they were issued (spawnHuman)
      flashlight: false,
      battery: FLASHLIGHT_MAX,
      lastDamageT: -99,
      intensity: 0, // how hard tonight is landing on them, 0..PACE.MAX (server/director.js)
      useItem: null,
      hold: null,
      kills: 0,
      zkills: 0,
      deaths: 0,
      rec: null, // their record on the leaderboard (stats.js); null for a player who joined without an id
      loadoutEntered: false,
      loadoutApplied: false,
      loadoutItems: [],
      loadoutMods: null,
      loadoutEffects: null,
      loadoutWeaponEffects: {},
      loadoutNight: {},
      loadoutWeapons: [null, null, null, null, null],
      loadoutArmor: null,
      loadoutBackpack: null,
      // experience and perks (shared/progress.js, setProgress). Their XP is xpBase + this run's, by source
      xpBase: 0, // on their record before this run, once the stats have said (xpLoaded)
      xpRun: new Array(XP_SRC.length).fill(0),
      xpLoaded: false,
      best: 0, // the furthest day they have ever seen dawn on (from the record)
      perks: 0, // the perks in force (a bitmask of ids; s.perks carries it into the simulation)
      perksNext: -1, // picked during a night: in force from dawn (-1: nothing waiting)
      nightKills: 0, // kills this night (or day): the first XP.killsFull carry the fresh-night bonus
      nightRevives: 0,
      lastChance: false, // Second Chance spent this night
      progDirty: true, // S2C.PROGRESS is out of date (sendProgress)
      progT: -99,
      admin: false, // may run admin chat commands: set from the signed-in account in handleJoin/resume
      boardT: -99, // when they were last sent the leaderboard
      cmdQueue: [],
      cmdBudget: 6,
      lastSeq: 0,
      hasSeq: false,
      recvSeq: 0, // the newest command that has come in, run or not (useItem)
      renderTick: 0,
      renderFrac: 0,
      view: new ClientView(),
      shadow: createPlayerState(), // the state right after the last command: what the client's prediction holds
      selfSync: true, // the client has to rebase its prediction on our state (see writeSelf)
      snapTick: -2, // tick and acked command of the last snapshot it was sent
      ackSent: 0,
      pingAt: 0, // when its latest IN_PING arrived (0 = none waiting)
      hx: new Float32Array(HISTORY_TICKS),
      hy: new Float32Array(HISTORY_TICKS),
      hz: new Float32Array(HISTORY_TICKS),
      chatT: 0,
      chatCount: 0,
      onAir: false, // keying the walkie-talkie, as last sent in the player list
      interactT: 0,
      actionT: 0,
      pingT: 0,
      waypoint: null, // their field-map waypoint { x, z, zone } (zone 255: none), shown to the team in the player list
      fullT: -99, // when they were last told their backpack had no room for something lying there (updateItems)...
      partFullT: -99, // ...and when that something was a car supply
      pinnedBy: 0,
      ropedBy: 0,
      burning: false, // set alight by a flammer (PLAYER_FIRE, updateFire): until it is put out
      douse: 0, // ...how far it has been put out (0-1)
      firePresses: 0, // presses of [Space] since the last tick (each beats a fire down: theirs or a teammate's)
      ping: 0,
      ts: null, // the stint analytics.js is counting for them (null: none)
      rejoinKey: '', // 'a:<account id>' or 'g:<sha-256 of the browser id>': whose JOIN may take this player back after a drop (resume)
      away: null, // dropped and held: { since, grace, handoff } (hold), until they come back or their grace runs out
      arriving: null, // back, and not playing yet: { until, n, tick } (resume, safe), until their client is running
      get x() {
        return this.state.x;
      },
      get y() {
        return this.state.y;
      },
      get z() {
        return this.state.z;
      },
    };
    // (a player without an id must never get into `players`: it would sit there under the key `undefined`)
    if (!(id ? this.spawnEntityAt(p, id) : this.spawnEntity(p))) return null;
    this.players.set(p.id, p);
    return p;
  }

  // Who a leaver is to this run if they come back (fallen, leftKits): their account or browser (rejoinKey), so coming
  // back under another name gets round neither a death nor a used-up kit. Only a player with neither - the test bots -
  // is known by their name. (A key has a ':' in it and a name never does: the two cannot collide.)
  leaverKey(p) {
    return p.rejoinKey || p.name;
  }

  // A leaver takes what is left of their starting kit with them - never more of anything than they were issued - and
  // gets exactly that back if they rejoin this run (leaverKey). Only what they found on top of it is dropped for the
  // team. Dropping the kit and issuing a fresh one on the way back in would let a reconnect loop pile rounds and
  // bandages up at the team's feet, and refill anyone who had used theirs up (or lost them by dying).
  parkKit(p) {
    const kit = p.kit;
    if (!kit) return;
    const s = p.state;
    const left = { mag: 0, ammo: 0, items: [] };
    const gone = p.zombie || !p.alive; // the dead dropped theirs where they fell
    if (!gone) {
      left.ammo = Math.min(s.ammo[AMMO.P9], kit.ammo);
      s.ammo[AMMO.P9] -= left.ammo;
      if (s.weapons[SLOT_PISTOL] === ITEM.PISTOL) left.mag = Math.min(s.mags[1], kit.mag);
      // The pistol, knife and hammer everyone starts with go along from the slots they are in, and a rejoin brings
      // back those and no others: one dropped for the team or torn down for parts (salvage) stays gone, or a
      // reconnect loop would pile pistols - or the gun parts in them - up at the team's feet
      left.tools = [];
      for (const slot of [SLOT_PISTOL, SLOT_MELEE, SLOT_BUILD]) {
        if (s.weapons[slot] !== STARTER_TOOLS[slot]) continue;
        s.weapons[slot] = 0;
        left.tools.push(slot);
      }
    }
    for (const [item, n] of kit.items) left.items.push([item, gone ? 0 : removeItem(p.inv, item, n)]);
    this.leftKits.delete(this.leaverKey(p));
    this.leftKits.set(this.leaverKey(p), left);
    if (this.leftKits.size > LEFT_KITS_MAX) this.leftKits.delete(this.leftKits.keys().next().value); // (the oldest)
  }

  removePlayer(p) {
    this.track.leave(p); // (before anything of theirs is touched)
    this.ach.leave(p);
    this.releaseHolds(p);
    this.cards.leave(p); // (a match they were playing is lost, asks and a trade being haggled over called off)
    this.loadouts.leave(p);
    this.pledges.leave(p);
    this.parkKit(p); // (they take their starting kit along: only what they found beyond it is dropped)
    this.dropAll(p);
    this.players.delete(p.id);
    this.records.leave(p.rec);
    this.nav.removeField(p.id);
    if (this.dawnReturn && (p.zombie || !p.alive)) this.fallen.add(this.leaverKey(p)); // left dead: dead if they rejoin before sunrise (handleJoin)
    this.removeEntity(p);
    this.notify(NOTIFY.PLAYER_LEFT, 0);
    // (whoever arrived unannounced leaves unannounced; an announced one always gets their line, and it counts)
    if (p.greeted && this.allow(this.greets, Infinity, GREET_EVERY)) this.systemChat(`${p.name} left.`);
    this.playersDirty = true;
    this.log(`leave ${p.name} (${this.players.size}/${this.maxPlayers})`);
    if (this.players.size === 0) this.resetToWaiting();
    else this.checkAllDead();
  }

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

  // ---------------------------------------------------------------- world
  // act: which of the run's two maps to make of the seed (shared/acts.js): the island, or the mainland
  // pre: that valley built already (prepareWorld), when it is the one asked for
  setWorld(seed, act = WORLD.ISLAND, pre = null) {
    const t0 = Date.now();
    const v = pre && pre.seed === seed && pre.act === act ? pre : prepareWorld(seed, act);
    this.seed = seed;
    this.act = act;
    this.world = v.world;
    usePos(this.world);
    this.worldPrint = v.print; // (what a save made on this valley is checked against: handoff.js)
    this.worldHash = this.worldPrint.hash;
    this.worldShape = this.worldPrint.shape;
    this.worldGround = this.worldPrint.ground;
    this.nav = v.nav;
    this.mineNav = v.mineNav; // (a valley without the workings has none)
    this.worldPlayed = false;
    this.gather?.clear(); // (what was used up was of the world before this one)
    this.ringing?.clear();
    this.zm?.setWorld(); // (its grids and per-world caches)
    this.log(`world seed ${seed}${act === WORLD.MAINLAND ? ' (the mainland)' : ''} ${v === pre ? `built ahead (${pre.ms}ms)` : `generated in ${Date.now() - t0}ms`}`);
  }

  // Every playthrough gets a valley of its own: once a game has been played on this one, generate the next
  // and tell the clients its seed. Call with the world cleared (structures live in the old world's grids).
  // A run begins on the game's startAct (the island, unless it was made to start on the mainland): after one that
  // ended on the other map, that map is built again even where the seed is pinned.
  rollWorld(act = this.startAct) {
    if (this.act === act && (!this.worldPlayed || this.fixedSeed)) return;
    this.setWorld(this.fixedSeed ? this.seed : randomSeed(), act);
    this.tellWorld();
  }
  // every client builds the world this game is now on (S2C.WORLD_RESET: its seed and its act)
  tellWorld() {
    const w = new Writer(8);
    w.u8(S2C.WORLD_RESET);
    w.u32(this.seed >>> 0);
    w.u8(this.act);
    this.broadcast(w.bytes());
  }

  // ---------------------------------------------------------------- game flow
  // The last player has left. This runs inside their socket's close callback, so the next valley is not rolled
  // here: generating one blocks the thread for a few hundred ms (seconds on a loaded machine), and the socket
  // would stay open that long. The played world stays, cleared, until the next tick rolls its successor (update),
  // or the next join if that comes first (handleJoin).
  resetToWaiting() {
    this.track.finish('abandoned'); // (a run still on: everybody left it)
    this.cards.runEnded();
    this.pledges.cancel();
    this.clearWorld();
    this.checkpoint = null;
    this.crossing = null;
    this.phase = PHASE.WAITING;
    this.day = 0;
    this.globalDirty = true;
  }

  clearWorld() {
    this.vehicles.clear(); // (their boxes out of the world, and nobody in one)
    for (const p of this.players.values()) p.state.drive = p.state.driveK = p.state.pass = p.state.passN = 0;
    for (const e of [...this.all]) if (e.kind !== ENT.PLAYER) this.removeEntity(e);
    for (const s of this.structures) {
      this.world.structGrid.remove(s.collider);
      this.nav.removeStructure(s.collider);
    }
    this.zombies.length = 0;
    this.items.length = 0;
    this.drops = 0;
    this.structures.length = 0;
    this.projectiles.length = 0;
    this.areas.length = 0;
    this.crates.length = 0;
    this.flyovers.length = 0;
    this.caches.length = 0;
    this.cats.length = 0;
    this.deer.length = 0;
    this.waves = [];
    this.wave = 0;
    this.fallen.clear();
    this.bossPending = null;
    this.bossId = 0;
    this.gather.clear();
    this.ringing.clear();
    regrowTrees(this.world); // (a new game on the same valley: the trees the last one cut stand again)
    this.leftKits.clear();
    this.escape = this.noEscape();
    this.fixtures.reset();
  }
  // the final stand, not begun. stage: of the plane's stand, 0 fuelling, 1 warming up (acts.js RUNWAY); blocked: the
  // dead stand on the runway ahead of the plane
  noEscape() {
    return { active: false, t: 0, ready: false, stalled: false, leaving: false, spawnT: 0, boss: false, sent: 0, tanks: 0, stage: 0, blocked: false };
  }

  // A new run, on act (the game's startAct unless an admin asks for the other: /map1, /cross). On the mainland it
  // begins at the bridgehead on MAINLAND_START.DAY, as if the team had just come off the bridge with a day's starting
  // kit, and the gun crates are there (startCrates).
  startGame(act = this.startAct) {
    this.track.finish('abandoned'); // (a run still being played as a new one begins: debug, tests)
    this.cards.runEnded();
    this.clearWorld();
    this.checkpoint = null;
    this.crossing = null;
    this.rollWorld(act);
    this.worldPlayed = true;
    this.phase = PHASE.DAY;
    const mainland = act === WORLD.MAINLAND;
    this.day = mainland ? Math.max(this.startDayNum, MAINLAND_START.DAY) : this.startDayNum;
    if (mainland) this.checkpoint = { day: this.day, used: 0, unlocked: 0, kits: [] }; // (for dayLen: the long first day)
    this.timeLeft = this.dayLen;
    this.unlocked = 0;
    this.populate();
    for (const p of this.players.values()) {
      p.kills = p.zkills = p.deaths = 0; // the scoreboard counts this run only: whoever stayed on from the last one starts level
      p.xpBase = this.xpOf(p); // ...and so does the end screen's XP: the last run's is on their record now
      p.xpRun.fill(0);
      p.nightKills = p.nightRevives = 0;
      p.lastChance = false;
      if (p.perksNext >= 0) p.perks = p.perksNext; // (spawnHuman puts them in force)
      p.perksNext = -1;
      p.progDirty = true;
      p.waypoint = null; // (it pointed into the old valley; the client drops its own on NEW_GAME)
      clearLoadoutRun(p);
      this.spawnHuman(p);
      if (mainland) this.bridgehead(p, false);
    }
    if (mainland) {
      this.startCrates();
      this.checkpoint.kits = this.kitsNow();
    }
    this.notify(NOTIFY.NEW_GAME, this.day);
    this.newWorldForAll(); // (a new island, or mainland: every page builds it)
    this.globalDirty = true;
    this.playersDirty = true;
    this.track.start();
    this.ach.start();
    this.pledges.begin(); // (after the spawns: everybody here is in the window)
    this.log('new game started');
  }

  // What a map holds as an act begins on it: its loot, its containers and the schematics hidden in them, the act's
  // supplies, and the dead that stand about by day. The world is cleared (clearWorld) and the day set before it.
  populate() {
    this.supplies = [0, 0, 0, 0, 0];
    this.warned = false;
    this.nightStats = { kills: 0, structLost: 0, downs: 0, deaths: 0, revives: 0 };
    this.pace = Director.newPace();
    this.moon = this.lastMoon = MOON.NORMAL;
    this.scheduleSupplyDrops();
    const w = this.world;
    // floor loot
    this.lootPoints = [];
    for (const sp of w.lootSpawns) this.lootPoints.push({ ...sp, ent: null, respawnAt: 0, table: LOOT_TABLES[sp.zone] || LOOT_TABLES[ZONE.FOREST] });
    for (const sp of w.resourceSpawns) this.lootPoints.push({ ...sp, ent: null, respawnAt: 0, table: LOOT_TABLES[ZONE.FOREST] });
    for (const lp of this.lootPoints) if (this.rng() < Math.min(0.98, 0.8 * this.diff.loot)) this.spawnLoot(lp);
    // searchable containers
    for (const c of w.containers) {
      const e = { kind: ENT.CACHE, ctype: c.ctype, x: c.x, y: c.y, z: c.z, zone: c.zone, state: 0, schem: 0 };
      if (this.spawnEntity(e)) this.caches.push(e);
    }
    for (const c of this.caches) this.armTrunk(c);
    this.placeSchematics();
    this.placeSupplies();
    this.cemetery.reset();
    this.gun.spawn();
    this.fair.reset();
    this.handcars.spawn();
    // zone guards + roaming dead
    this.zm.spawnInitial();
    this.cm.spawnInitial();
    this.dm.spawnInitial();
    this.vehicles.spawn(); // (last: the ids and the random draws of everything above are as they were without them)
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

  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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

  // ---------------------------------------------------------------- chat
  handleChat(p, text) {
    text = text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
    if (!text) return;
    // Old clients may still send `/admin <password>`; consume it so a former secret is never broadcast as chat.
    if (/^\/admin(?:\s|$)/i.test(text)) return this.sendChat(p, 0, CHATF.SYSTEM, 'Admin access comes from your signed-in account.');
    if (p.admin && text.startsWith('/')) {
      const args = text.slice(1).split(/\s+/);
      this.track.event('admin', p, { command: args.join(' ').slice(0, 60) }); // (a match with these in it is no ordinary one)
      return this.debugCommand(p, args);
    }
    if (this.time - p.chatT > 5) {
      p.chatT = this.time;
      p.chatCount = 0;
    }
    if (++p.chatCount > 6) return;
    // text chat reaches everyone in the game, wherever they are (the voice still carries only so far: TALK_RANGE)
    if (this.radioInHand(p)) this.ach.onAir(p);
    const w = new Writer(text.length * 3 + 8);
    w.u8(S2C.CHAT);
    w.u16(p.id);
    w.u8(p.zombie ? CHATF.ZOMBIE : 0);
    w.str(text);
    this.broadcast(w.bytes());
  }
  sendChat(to, id, flags, text) {
    const w = new Writer(text.length * 3 + 8);
    w.u8(S2C.CHAT);
    w.u16(id);
    w.u8(flags);
    w.str(text);
    to.session.conn.send(w.bytes());
  }
  // every survivor carries a walkie-talkie (SLOT_RADIO; the dead and the turned have none)...
  hasWalkie(p) {
    return p.alive && !p.zombie;
  }
  // ...chat said with it in hand counts towards its achievement...
  radioInHand(p) {
    return this.hasWalkie(p) && p.state.slot === SLOT_RADIO;
  }
  // ...and while it is keyed, so does the voice (the clients route it, told by the player list: PLF.ON_AIR)
  onAir(p) {
    return this.hasWalkie(p) && radioKeyed(p.state);
  }

  systemChat(text) {
    const w = new Writer(text.length * 3 + 8);
    w.u8(S2C.CHAT);
    w.u16(0);
    w.u8(CHATF.SYSTEM);
    w.str(text);
    this.broadcast(w.bytes());
  }
  broadcast(bytes) {
    for (const p of this.players.values()) p.session.conn.send(bytes);
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

  // ---------------------------------------------------------------- networking out
  writeGlobal(w) {
    w.u8(this.phase);
    w.u8(this.day);
    w.u16(Math.max(0, Math.round(this.timeLeft * 10)));
    let hordeLeft = this.hordeAlive();
    for (const wv of this.waves) hordeLeft += wv.queue.length;
    w.u16(this.phase === PHASE.NIGHT || this.escape.active ? Math.min(0xfffe, hordeLeft) : 0xffff);
    w.u16(this.bossId);
    for (let i = 0; i < 5; i++) w.u8(this.supplies[i]); // (this act's: suppliesOf)
    for (let i = 0; i < 7; i++) w.u8(this.supplyHints[i] ?? 255);
    w.u8(this.supplyFound);
    for (let i = 0; i < 7; i++) w.u16(this.supplyHintSpots[i] >= 0 ? this.supplyHintSpots[i] : 0xffff);
    w.u8(this.supplyHelp);
    w.u8(this.unlocked);
    for (let i = 0; i < SCHEMATICS.length; i++) w.u8(this.schemHints[i] ?? 255);
    w.u8(this.phase === PHASE.NIGHT ? this.wave : 0);
    w.u8(NIGHT_WAVES);
    w.u16(Math.round(Math.max(0, this.escape.t) * 10));
    const esc = this.escape;
    // 8: the warm-up has stalled (nobody on their feet at the car), 16: a survivor is getting in to drive
    // 32: (the plane's stand) the tanks are full and the engines are warming, 64: the dead are on the runway
    w.u8((esc.active ? 1 : 0) | (this.allSuppliesIn() ? 2 : 0) | (esc.ready ? 4 : 0) | (esc.active && esc.stalled ? 8 : 0) | (esc.active && esc.leaving ? 16 : 0) | (esc.active && esc.stage ? 32 : 0) | (esc.active && esc.blocked ? 64 : 0));
    let alive = 0;
    let total = 0;
    for (const p of this.players.values()) {
      total++;
      if (p.alive && !p.zombie) alive++;
    }
    w.u8(alive);
    w.u8(total);
    w.f32(this.restartT);
    w.u16(Math.round(this.phase === PHASE.DAY ? this.dayLen : this.phase === PHASE.CROSSING ? CROSSING.TIME : this.nightLen));
    // the act being played (shared/acts.js), and who has asked to skip the crossing out of who would have to
    w.u8(this.act);
    const [got, need] = this.phase === PHASE.CROSSING ? this.skipVotes() : [0, 0];
    w.u8(Math.min(255, got));
    w.u8(Math.min(255, need));
    w.u8(this.moon); // tonight's moon (MOON), from the dusk horn to dawn
    // workbenches, for the field map: structures themselves only replicate inside AOI_STRUCTURE_RADIUS
    const at = w.reserve8();
    let benches = 0;
    for (const e of this.structures) {
      if (e.stype !== STRUCT.WORKBENCH || benches === 255) continue;
      w.i16(qpos(e.x));
      w.i16(qpos(e.z));
      benches++;
    }
    w.patch8(at, benches);
    // car supplies lying loose (dropped, or where whoever carried one died), for the field map: items only replicate
    // inside AOI_ITEM_RADIUS, and one that never despawns must not be lost for want of knowing where it went down
    const pat = w.reserve8();
    let parts = 0;
    for (const e of this.items) {
      if (!looseSupply(e) || parts === 255) continue;
      w.u8(e.item);
      w.i16(qpos(e.x));
      w.i16(qpos(e.z));
      parts++;
    }
    w.patch8(pat, parts);
    w.u8(this.scouted); // the hiding places a Scout has been near (server/roles.js)
  }

  // Self state. The simulated part only goes out when the client has to rebase its prediction on it (SELF.SYNC):
  // in its first snapshot, while it is dead, when anything but its own commands touched the state (knockback, a
  // pickup, a respawn...) or when its fingerprint of the prediction disagreed with ours (processInputs). Then it is
  // 5 chunks, delta-compressed against what this client last got (byte-compared), and our own state is rounded to
  // what went on the wire so both ends carry on from identical numbers. The status part (hp, armor, battery...)
  // goes out group by group as it changes. A client whose prediction holds costs nothing. Returns false when
  // there was nothing to write.
  writeSelf(w, p) {
    const s = p.state;
    const c = this.cw || (this.cw = new Writer(128));
    if (!p.selfCache) p.selfCache = [];
    // appends the scratch chunk if it differs from the one this client has
    const put = (i) => {
      const prev = p.selfCache[i];
      let same = prev && prev.length === c.o;
      for (let k = 0; same && k < c.o; k++) same = prev[k] === c.u8a[k];
      if (same) return 0;
      p.selfCache[i] = c.u8a.slice(0, c.o);
      w.ensure(c.o);
      w.u8a.set(c.u8a.subarray(0, c.o), w.o);
      w.o += c.o;
      return 1;
    };
    const maskAt = w.reserve8();
    let mask = 0;
    if (p.selfSync || !p.alive || !samePlayerState(s, p.shadow)) {
      mask = SELF.SYNC;
      p.selfSync = false;
      snapPlayerState(s);
      copyPlayerState(p.shadow, s);
      for (let chunk = 0; chunk < 5; chunk++) {
        c.reset();
        switch (chunk) {
          case 0:
            c.f32(s.x);
            c.f32(s.y);
            c.f32(s.z);
            c.f32(s.vx);
            c.f32(s.vy);
            c.f32(s.vz);
            break;
          case 1:
            c.u8((s.onGround ? 1 : 0) | (s.crouch ? 2 : 0) | (s.exhausted ? 4 : 0) | (s.zombie ? 8 : 0) | (s.pulled ? 16 : 0) | (s.pinned ? 32 : 0) | (s.sprinting ? 64 : 0) | (s.downed ? 128 : 0));
            c.f32(s.stamina);
            c.f32(s.staminaDelay);
            break;
          case 2:
            c.u8(s.slot);
            c.f32(s.switchT);
            c.f32(s.cooldown);
            c.f32(s.reloadT);
            c.f32(s.recoil);
            c.u16(s.lastBtn);
            c.u8(s.fireCount);
            break;
          case 3:
            for (let i = 0; i < 5; i++) c.u8(s.weapons[i]);
            c.u8(s.mags[0]);
            c.u8(s.mags[1]);
            for (let i = 0; i < AMMO_ITEMS.length; i++) c.u16(s.ammo[i]);
            c.u8(s.throwCount);
            break;
          case 4:
            c.f32(s.leapCd);
            c.f32(s.stunT);
            c.f32(s.shove);
            c.f32(s.ears);
            c.u8((s.pulled ? 1 : 0) | (s.pinned === PIN_FACE ? 2 : 0)); // (2: what has them is a crawler on the face)
            if (s.pulled) {
              c.f32(s.pullX);
              c.f32(s.pullY);
              c.f32(s.pullZ);
            }
            break;
        }
        if (put(chunk)) mask |= 1 << chunk;
      }
      // (the seat of a ride at the fair: fair.js; the handcar on the railway: handcar.js; the mounted gun or the cat
      // in their arms: mountedgun.js, cats.js; the perks they picked: progress.js)
      c.reset();
      c.u8(s.ride);
      c.u8(s.rideGo);
      c.u32(s.rideT);
      c.u8(s.cart);
      c.f32(s.cartS);
      c.f32(s.cartV);
      c.u8(s.hmg | (s.pet << 1) | (s.drag << 2));
      c.u32(s.perks);
      c.u16(s.drive);
      c.u8(s.driveK | (s.dhold << 4) | (s.ddead ? 128 : 0));
      c.f32(s.dyaw);
      c.f32(s.dsteer);
      c.f32(s.dfuel);
      c.u16(s.pass);
      c.u8(s.passN);
      if (put(12)) mask |= SELF.RIDE;
    }
    // status: 7 field groups behind their own mask
    const subAt = w.reserve8();
    let sub = 0;
    for (let g = 0; g < 7; g++) {
      c.reset();
      switch (g) {
        case 0:
          c.u16(Math.max(0, Math.ceil(p.hp)));
          c.u16(p.maxHp);
          break;
        case 1:
          c.u8(Math.ceil(p.armor));
          c.u8(p.armorMax);
          break;
        case 2:
          c.u8((p.alive ? 1 : 0) | (p.flashlight ? 2 : 0) | (p.revivedBy ? 4 : 0) | (p.burning ? 8 : 0));
          c.u8(Math.round(p.battery));
          {
            // on fire: how far it is put out; beating it out on a teammate: how far theirs is (PLAYER_FIRE)
            const mate = p.burning ? null : this.dousing(p);
            c.u8(Math.round(Math.min(1, p.burning ? p.douse : mate ? mate.douse : 0) * 255));
          }
          break;
        case 3:
          // (only once it is in the hands: this is also what the client has the simulation's `using` from, endUse)
          c.u8(p.useItem && s.using ? p.useItem.item : 0);
          c.u8(p.useItem && s.using ? Math.min(255, Math.round((p.useItem.t / p.useItem.total) * 255)) : 0);
          break;
        case 4:
          c.u8(Math.max(0, Math.min(255, Math.ceil(p.respawnT))));
          break;
        case 5: {
          const h = p.hold;
          c.u8(h ? h.kind : 0);
          c.u8(h ? Math.min(255, Math.round((h.t / h.need) * 255)) : 0);
          break;
        }
        case 6:
          c.u8(p.downed ? Math.max(0, Math.min(255, Math.ceil(p.bleed * 4))) : 0);
          break;
      }
      if (put(5 + g)) sub |= 1 << g;
    }
    if (sub) {
      mask |= SELF.STATUS;
      w.patch8(subAt, sub);
    } else w.o = subAt;
    if (!mask) {
      w.o = maskAt;
      return false;
    }
    w.patch8(maskAt, mask);
    return true;
  }

  sendInventory(p) {
    const w = this.w.reset();
    w.u8(S2C.INVENTORY);
    for (let i = 0; i < INVENTORY_MAX; i++) {
      const it = p.inv[i];
      w.u8(it ? it.item : 0);
      w.u16(it ? it.count : 0);
    }
    w.u8(p.armorItem);
    w.u8(Math.ceil(p.armor));
    w.u8(p.armorMax);
    w.u8(p.backpackItem);
    p.session.conn.send(w.bytes());
    this.stats.bytesOut += w.o;
    this.stats.msgsOut++;
    p.invDirty = false;
  }

  // Who is signed in to an account (S2C.FRIENDS: its name, '' for a guest), for sending each other friend requests: a
  // newcomer is told everyone's, their own among them, and everyone else is told theirs. (An id that comes back to
  // someone else comes with its new account.)
  tellFriendCodes(p) {
    const w = new Writer(16 + 12 * this.players.size);
    w.u8(S2C.FRIENDS);
    w.u8(this.players.size);
    for (const q of this.players.values()) {
      w.u16(q.id);
      w.str(q.friend || '');
    }
    p.session.conn.send(w.bytes());
    const one = new Writer(16);
    one.u8(S2C.FRIENDS);
    one.u8(1);
    one.u16(p.id);
    one.str(p.friend || '');
    const bytes = one.bytes();
    for (const q of this.players.values()) if (q !== p) q.session.conn.send(bytes);
  }

  // Custom survivors' looks (S2C.LOOKS, the character creator): a player joining or coming back is told everyone's
  // (theirs too); the rest are told the newcomer's - or, when the newcomer has none but somebody earlier in this game
  // with the same id had one, that the id's look is gone. A game of roster survivors sends nothing.
  tellLooks(p) {
    const own = (w, q) => {
      w.u16(q.id);
      w.u8(q.look ? q.look.length : 0);
      if (q.look) for (const b of q.look) w.u8(b);
    };
    const withLook = [...this.players.values()].filter((q) => q.look);
    if (withLook.length && p.session) {
      const w = new Writer(8 + 72 * withLook.length);
      w.u8(S2C.LOOKS);
      w.u8(withLook.length);
      for (const q of withLook) own(w, q);
      p.session.conn.send(w.bytes());
    }
    this.lookIds ||= new Set();
    if (!p.look && !this.lookIds.has(p.id)) return;
    if (p.look) this.lookIds.add(p.id);
    const one = new Writer(80);
    one.u8(S2C.LOOKS);
    one.u8(1);
    own(one, p);
    const bytes = one.bytes();
    for (const q of this.players.values()) if (q !== p && q.session) q.session.conn.send(bytes);
  }

  // sends everyone the player list now (it normally rides along with the next snapshot, see sendTick)
  sendPlayers() {
    this.playersList();
    for (const p of this.players.values()) this.sendList(p);
  }
  sendList(p) {
    if (p.listVer === this.listVer) return;
    p.listVer = this.listVer;
    p.session.conn.send(this.listBytes);
    this.stats.bytesOut += this.listBytes.length;
    this.stats.msgsOut++;
  }

  // Rebuilds the player list message; a client is sent it when its copy is out of date (listVer)
  playersList() {
    const w = this.w.reset();
    w.u8(S2C.PLAYERS);
    w.u8(this.players.size);
    for (const p of this.players.values()) {
      w.u16(p.id);
      w.str(p.name);
      w.u8(!p.alive ? 2 : p.zombie ? 1 : p.downed ? 3 : 0);
      p.onAir = this.onAir(p);
      if (p.onAir) this.ach.onAir(p);
      const wp = p.waypoint;
      w.u8((p.onAir ? PLF.ON_AIR : 0) | (wp ? PLF.WAYPOINT : 0));
      w.u16(p.kills + p.zkills);
      w.u16(Math.min(9999, Math.round(p.ping)));
      w.u8(this.levelOf(p));
      if (wp) {
        w.i16(qpos(wp.x));
        w.i16(qpos(wp.z));
        w.u8(wp.zone);
      }
    }
    // each player's character, in the same order, after them all: a client from before the roster stops reading at the
    // end of the list and never sees these
    for (const p of this.players.values()) w.u8(p.character ?? defaultCharacter(p.id));
    // ...then each one's perks in force (progress.js: a mask of ids), for their profile card
    for (const p of this.players.values()) w.u32(p.perks >>> 0);
    this.playersDirty = false;
    const prev = this.listBytes;
    let same = !!prev && prev.length === w.o;
    for (let i = 0; same && i < w.o; i++) same = prev[i] === w.u8a[i];
    if (same) return;
    this.listBytes = w.u8a.slice(0, w.o);
    this.listVer = (this.listVer || 0) + 1;
  }

  // Global state for one client: all of it the first time and whenever anything but the clocks changed, just the
  // clocks (time left, horde left: bytes 2-5) when only they moved, nothing when not even those did.
  // all: this tick's full global state. Returns false if nothing was written.
  writeGlobalFor(w, p, all) {
    const prev = p.globalCache;
    let full = !prev || prev.length !== all.length;
    let clocks = false;
    for (let i = 0; !full && i < all.length; i++) {
      if (prev[i] === all[i]) continue;
      if (i >= 2 && i < 6) clocks = true;
      else full = true;
    }
    if (!full && !clocks) return false;
    w.u8(full ? 1 : 0);
    w.ensure(all.length);
    if (full) {
      w.u8a.set(all, w.o);
      w.o += all.length;
      p.globalCache = all.slice();
    } else {
      for (let i = 2; i < 6; i++) w.u8(all[i]);
      prev.set(all.subarray(2, 6), 2);
    }
    return true;
  }

  // somebody keyed their walkie-talkie or let go of it: everyone has to know at once (their voice, the static)
  checkOnAir() {
    for (const p of this.players.values()) if (this.onAir(p) !== p.onAir) this.playersDirty = true;
  }

  sendSnapshots() {
    if (!this.playersDirty) this.checkOnAir();
    // the list is rebuilt on changes and every 2 s (kills, ping), and only goes out when it came out different
    if (this.playersDirty || this.tick - this.playersListT > 40) {
      this.playersListT = this.tick;
      this.playersList();
    }
    let global = null;
    if (this.globalDirty || this.tick % 20 === 0) {
      const gw = (this.gw || (this.gw = new Writer(256))).reset();
      this.writeGlobal(gw);
      global = gw.bytes();
    }
    this.globalDirty = false;
    if (this.players.size) stageEntities(this.all, this.tick); // once for all clients: each sendTick's writeEntities reads the staged copy
    for (const p of this.players.values()) {
      const conn = p.session.conn;
      if (p.pingAt) {
        const held = Math.min(255, Math.round(performance.now() - p.pingAt));
        p.pingAt = 0;
        this.emit(
          (w) => {
            w.u8(EVT.PONG);
            w.u8(held);
          },
          { to: p.id },
        );
      }
      // A client that isn't draining its socket gets nothing this tick: every baseline stays where it is and the
      // next snapshot that does go out covers the gap (dropping an encoded one would break the delta chain)
      if (conn.congested && conn.congested()) continue;
      // everything this client gets this tick leaves as one packet
      if (conn.cork) conn.cork(() => this.sendTick(p, global));
      else this.sendTick(p, global);
    }
    this.events.length = 0;
  }

  // one client's traffic for this tick: the player list and its inventory when they changed, then the snapshot
  // global: this tick's full global state when it is due (null otherwise)
  sendTick(p, global) {
    const conn = p.session.conn;
    this.sendList(p);
    this.sendProgress(p);
    this.cards.send(p);
    if (p.invDirty) {
      // picked up or dropped this tick: sorted (sortInventory), a split left apart. Else the safety net, for any path
      // that left two part stacks of a thing
      if (p.invSort) sortInventory(p.inv, invCap(p), p.splitKeep);
      else tidyStacks(p.inv, p.splitKeep);
      p.invSort = false;
      this.sendInventory(p);
    }
    const w = this.w.reset();
    w.u8(S2C.SNAPSHOT);
    const flagsAt = w.reserve8();
    let flags = 0;
    const ackStep = (p.lastSeq - p.ackSent) & 0xffff;
    if (this.tick !== p.snapTick + 1) {
      flags |= SNAP.TICK;
      w.u32(this.tick);
      w.u16(p.lastSeq);
    } else if (ackStep !== CMDS_PER_PACKET) {
      flags |= SNAP.ACK;
      w.varu(ackStep);
    }
    p.snapTick = this.tick;
    p.ackSent = p.lastSeq;
    if (global && this.writeGlobalFor(w, p, global)) flags |= SNAP.GLOBAL;
    if (this.writeSelf(w, p)) flags |= SNAP.SELF;
    flags |= writeEntities(w, p.view, p, this.all, this.tick);
    // events
    const at = w.reserve8();
    let n = 0;
    const px = p.state.x;
    const pz = p.state.z;
    for (const ev of this.events) {
      if (ev.to && ev.to !== p.id) continue;
      if (ev.except && ev.except === p.id) continue;
      if (ev.r2) {
        const dx = ev.x - px;
        const dz = ev.z - pz;
        if (dx * dx + dz * dz > ev.r2) continue;
      }
      if (n >= 255) break;
      w.ensure(ev.bytes.length);
      w.u8a.set(ev.bytes, w.o);
      w.o += ev.bytes.length;
      n++;
    }
    if (n) {
      flags |= SNAP.EVENTS;
      w.patch8(at, n);
    } else w.o = at;
    w.patch8(flagsAt, flags);
    conn.send(w.bytes());
    this.stats.bytesOut += w.o;
    this.stats.msgsOut++;
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

export { SLOT_BUILD, SLOT_PISTOL };
