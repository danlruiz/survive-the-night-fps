// A run, and the valley it is played on: the world built from a seed and an act (prepareWorld, setWorld: the next
// one rolled once a valley has been played, rollWorld), a new run on it (startGame, populate: its loot, containers,
// supplies and the day's dead), and the game emptied back to waiting (resetToWaiting, clearWorld). The schematics'
// and supplies' hiding places (placeSchematics, placeSupplies) and the restart at the bridge are still in game.js.
import { PHASE, MOON } from '../../shared/constants.js';
import { LOOT_TABLES, NOTIFY, ZONE } from '../../shared/defs.js';
import { S2C, ENT, Writer, usePos } from '../../shared/protocol.js';
import { WORLD, MAINLAND_START } from '../../shared/acts.js';
import { regrowTrees } from '../../shared/felling.js';
import { clearLoadoutRun } from '../loadouts.js';
import * as Director from '../director.js';
import { worldFor } from '../../shared/worlds.js';
import { Nav } from '../nav.js';
import { worldPrint } from '../handoff.js';
import { MineNav } from '../minenav.js';

export const randomSeed = () => (Math.random() * 0x7fffffff) | 0;

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

export const methods = {
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
  },

  // Every playthrough gets a valley of its own: once a game has been played on this one, generate the next
  // and tell the clients its seed. Call with the world cleared (structures live in the old world's grids).
  // A run begins on the game's startAct (the island, unless it was made to start on the mainland): after one that
  // ended on the other map, that map is built again even where the seed is pinned.
  rollWorld(act = this.startAct) {
    if (this.act === act && (!this.worldPlayed || this.fixedSeed)) return;
    this.setWorld(this.fixedSeed ? this.seed : randomSeed(), act);
    this.tellWorld();
  },
  // every client builds the world this game is now on (S2C.WORLD_RESET: its seed and its act)
  tellWorld() {
    const w = new Writer(8);
    w.u8(S2C.WORLD_RESET);
    w.u32(this.seed >>> 0);
    w.u8(this.act);
    this.broadcast(w.bytes());
  },
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
  },

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
  },
  // the final stand, not begun. stage: of the plane's stand, 0 fuelling, 1 warming up (acts.js RUNWAY); blocked: the
  // dead stand on the runway ahead of the plane
  noEscape() {
    return { active: false, t: 0, ready: false, stalled: false, leaving: false, spawnT: 0, boss: false, sent: 0, tanks: 0, stage: 0, blocked: false };
  },

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
  },

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
  },

  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
};
