// Zombie AI: targeting, flow-field navigation, melee and structure breaking, and what every special shares (the
// windup, the flight). Each special kind has its own module in server/specials/ (the spitter, leaper, crawler, roper,
// smoker, screecher, boomer, Tank, dog packs, bats, the shade, the flammer and the bosses), with its own numbers;
// what the dead are made of, by day and by night, is in spawns.js.
// The herd that wanders the roads by day is in herd.js.
import { MAP_SIZE, STEP_HEIGHT, PHASE, PLAYER_RADIUS, MAX_ENTITIES, HORDE_SPAWN_MIN, HORDE_SPAWN_MAX, NOISE_RUSH, NOISE_SPEED_MIN, NOISE_MEMORY, NOISE_MEMORY_MAX } from '../shared/constants.js';
import { HISTORY_TICKS, LEG_HP, STUMBLE_SPEED, HOBBLE_SPEED, CRAWL_SPEED, CRAWL_SPEED_MIN, CRAWL_SPEED_MAX, CRAWL_SLOW, CRAWL_HEAD_Y } from '../shared/constants.js';
import { ZTYPE, ZOMBIE_DEFS, ZANIM, SOUND, KILLER, EVT, IMPACT, ZONE, BURN, HEARD_MIN, HEARD_IDS } from '../shared/defs.js';
import { ENT } from '../shared/protocol.js';
import { resolveBody, groundAt, deepWaterAt, raycastWorld, footprintContains, COL } from '../shared/collision.js';
import { eyeHeight } from '../shared/playersim.js';
import { playerMods } from './loadouts.js';
import { Herds, HERD_RUSH } from './herd.js';
import { Wards, WARD_DARK } from './clinic.js';
import { TRIGGERS, ACTS, STATES, MOVES, AIMS, CHASES, NEARS, STEPS, RELEASES, SPOTS, DEATHS, BURSTS, installSpecials } from './specials/index.js';
import { GRAV, turn, bodyHeight, nearestHuman, humanWithin, strikeHeight, strikeOpen, passesTo } from './specials/util.js';
import { leapG, pinsDown, LEAP_PIN, LEAP_LAND, LEAP_MISS_CD, LONE_WEIGHT } from './specials/leaper.js';
import { _shDir } from './specials/shade.js';
import { motherStream } from './specials/mother.js';
import { daySpecial, SPAWN_SPREAD } from './spawns.js';

const MAP_SPREAD_MAX = 4; // (spread(): the most a map's dead come over, against the island's)
const CELL = 4;
// forest: trees are counted per FCELL m cell; a spot's density is the tree count of the 3x3 cells around it
const FCELL = 8;
const FOREST_DENS = 13; // ~ the densest 20% of the woods (median 9 trees per 24 m square)
const _pos = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, z: 0, cost: 0 };
const _ray = { t: -1, col: null, terrain: false };
const _wq = []; // (wedgedOn)
const _lq = []; // (nearStruct)
const WEDGE_MOVE = 1.5; // m a zombie after a survivor has to get from where it was to count as getting anywhere (z.wedgeT)
// the client's distance haze: fog density by sun height (KEYS s / fogD in client/render/environment.js), see sightRange()
const HAZE_SUN = [-1, -0.12, 0.02, 0.18, 0.55, 1];
const HAZE_DENSITY = [0.025, 0.025, 0.0195, 0.0108, 0.0074, 0.0072];
// a zombie is lost in the haze once it has swallowed this much of it: what the dark of the night does at
// HORDE_SPAWN_MIN, the nearest the horde has always appeared (so in full darkness the whole spawn band stays hidden)
const HAZE_HIDES = 0.88;
// The dead in a city's streets (the mainland's Port Calder), on top of the guards every place gets: a place's guards
// go by how far across it is, and a city is a place a few hundred metres across, so they alone leave it near empty
const CITY_STREET_DEAD = 64;
const CITY_STREET_SHARE = 0.2; // of the roaming dead that turn up by day, the share that comes back into the city
const ROAM_CLEAR = 75; // none of the roaming dead turns up within this many m of a survivor (spawnRoamer, spawnStreet)
const GUARDS_CLEAR = 60; // ...nor fills a place back up with a survivor within this many m past its edge
// Where a run on the map begins (world.start: the car on the island, the bridgehead on the mainland) is left clear: none
// of the dead the day puts about - a place's guards, the roaming dead, the city's, a dog pack, a herd - turn up within
// START_CLEAR m of it, so a team that has just come off the bridge is not in a fight before it has found its feet
// (nearStart). By day the dead notice a survivor ~26 m off, so the ones beyond it leave them be.
export const START_CLEAR = 60;
// The one exception (#270): a run's first minute shows the threat. OPENER_AT s into day 1, if none of the dead is yet
// within OPENER_NEAR m of a survivor, one walker turns up OPENER_DIST m off ahead of one of them and shambles over
// (spawnOpener). Until OPENER_UNTIL: a team that is not in the game by then has missed it, and that is fine.
export const OPENER_AT = 20;
export const OPENER_UNTIL = 50;
export const OPENER_DIST = 38;
const OPENER_NEAR = 45;
const SPAWN_TRIES = 18; // candidates a horde spawn pick looks at before settling for the least exposed one
const SPAWN_HEAD = 1.7; // a zombie at a spot is in view when a survivor's eyes have a clear line to this far above its ground (m)
const SPAWN_VIEW_COS = Math.cos(1.13); // a survivor is looking at what lies within ~65 deg of dead ahead (the default FOV on a wide screen, and a margin)
// A crowd after a survivor fans out instead of trailing in after the one at the front (spreadOut). One of the dead
// within SPREAD_START m of its prey with others in its lane ahead (SPREAD_LANE m either side of the way it is moving,
// SPREAD_AHEAD m on at most) picks a line of its own to come in on: SPREAD_MIN-SPREAD_MAX rad round its prey from
// where it stands, to the side the others are not on (either, when they are within SPREAD_SIDE m of dead ahead on
// average). It heads for the point of that line SPREAD_K of the way out to itself (SPREAD_R m at most), which slides
// in as it closes, so it comes in along it. It keeps the line until it is within SPREAD_NEAR m, its prey changes, or
// it falls back past SPREAD_DROP m. Only where its way in runs within ~SPREAD_OPEN of straight at its prey (not where
// a field leads it round to a way in), and never into a wall or the lake SPREAD_PROBE m on, nor where that step gets it
// less than SPREAD_GAIN (x10 units of the flow field) nearer by the way round (off the side of a pier)
const SPREAD_START = 35;
const SPREAD_GAIN = 4;
const SPREAD_DROP = 45;
const SPREAD_LANE = 1.1;
const SPREAD_AHEAD = 5;
const SPREAD_SIDE = 0.3;
const SPREAD_MIN = 0.45;
const SPREAD_MAX = 1.2;
const SPREAD_K = 0.75;
const SPREAD_R = 14;
const SPREAD_NEAR = 2.5;
const SPREAD_OPEN = Math.cos(1.2);
const SPREAD_PROBE = 1.6;
const _spr = { x: 0, z: 0 };

export class Zombies {
  constructor(game) {
    this.g = game;
    this.setWorld();
    this.next = new Int32Array(MAX_ENTITIES).fill(-1);
    this.fieldRR = 0;
    this.maintainT = 0;
    this.opener = false; // this run's opening walker has been seen to (spawnOpener)
    this.humansCache = [];
    this.crowdList = []; // the dead after someone, counted for the flow fields (nav.js setCrowd)
    this.lights = []; // this tick's burning point lights, flat [x, y, z, radius, ...]
    this.lightTick = -1;
    this.packSeq = 0;
    this.packGo = new Map(); // dog pack id -> game time the latest bite one of them went in for gets home (packFree)
    this.spawnPicks = 0; // horde spawn positions picked around the survivors (pickSpawnAround)...
    this.spawnsScreened = 0; // ...how many of them found nowhere wholly out of sight and took a spot with only its middle hidden...
    this.spawnsInView = 0; // ...and how many found nothing but spots in plain view
    this.treeGrid = null;
    this.dens = null;
    this.herds = new Herds(game, this);
    this.wards = new Wards(game, this); // the dead of Mercy Clinic's wards (clinic.js)
  }

  // ---------------------------------------------------------------- spawning
  spawn(type, x, z, opts = {}) {
    const g = this.g;
    type = this.rollMother(type, opts); // (one walker in twenty is a Mother: specials/mother.js)
    const def = ZOMBIE_DEFS[type];
    if (!def) return null;
    const w = g.world;
    const lim = this.g.world.half - 6;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    const down = opts.y !== undefined; // a spot down in the mine: given with its floor, and the valley's grid is not asked
    if (!down && (w.isDeepWater(x, z) || g.nav.isBlocked(x, z))) {
      // nudge to a free spot
      let ok = false;
      for (let i = 0; i < 12 && !ok; i++) {
        const nx = x + (g.rng() - 0.5) * 10;
        const nz = z + (g.rng() - 0.5) * 10;
        if (!w.isDeepWater(nx, nz) && !g.nav.isBlocked(nx, nz)) {
          x = nx;
          z = nz;
          ok = true;
        }
      }
      if (!ok) return null;
    }
    let y = down ? opts.y : groundAt(w, x, z, 200, 0.2, false);
    // a shade never comes out into the day: by day there is one only where the daylight does not reach (the mine, a
    // boarded-up ward). opts.force puts one anywhere (an admin's /spawn)
    if (def.shade && !opts.force && g.phase !== PHASE.NIGHT && !this.darkSpot(x, y, z)) return null;
    if (def.flying) y += 3 + g.rng() * 2;
    const e = this.make(type, x, y, z, opts);
    if (!g.spawnEntity(e)) return null;
    g.fillHistory(e);
    g.zombies.push(e);
    return e;
  }

  // A zombie of that type standing at x, y, z, not yet in the world (spawn puts it there; gamestate.js copies a saved
  // one over it). opts: as for spawn.
  make(type, x, y, z, opts = {}) {
    const g = this.g;
    const def = ZOMBIE_DEFS[type];
    const down = opts.y !== undefined;
    const hp = def.hp * (opts.hpMul || 1) * g.diff.zombieHp;
    return {
      kind: ENT.ZOMBIE,
      ztype: type,
      def,
      variant: Math.floor(g.rng() * 256),
      x,
      y,
      z,
      yaw: g.rng() * Math.PI * 2,
      vx: 0,
      vy: 0,
      vz: 0,
      kx: 0,
      kz: 0,
      hp,
      maxHp: hp,
      anim: ZANIM.IDLE,
      animT: 0,
      horde: !!opts.horde,
      boss: !!opts.boss || !!def.boss,
      target: 0,
      targetT: 0,
      aggroId: 0,
      aggroT: 0,
      alertX: 0,
      alertZ: 0,
      alertT: 0,
      alertLvl: 0, // how loud the noise it is heading for was where it stood (m of carry left)
      alertRush: 1, // 0 ambling over .. 1 at a full run
      alertU: false, // ...and it came from down in the mine
      under: down, // down in the mine (updateOne keeps it)
      den: !!opts.den, // it lives down there: it keeps to the workings, and goes back when it has been led out
      spared: false, // one of the horde that was down there at sunrise: it burns when it comes up into the day
      lureX: 0,
      lureZ: 0,
      lureT: 0,
      attackCd: 0.5 + g.rng(),
      specialCd: 2 + g.rng() * 3,
      pounce: false, // a leaper in the air on a pounce (not hopping off whoever it had pinned): it steers, and pins on landing
      glide: false, // a crawler's pounce is a glide down from a tree (leapG)
      tree: null, // a crawler: the tree it is making for (a collider of the world's), or clinging to (perched)
      perched: false,
      climb: false, // going up its tree's trunk
      perchA: 0, // where round the trunk it clings (rad, from the trunk's centre), and how high
      perchY: 0,
      perchT: 0, // how long it has had nobody near (PERCH_BORED)
      callT: 0, // to its next chitter
      windT: 0, // dropping on to windOn (PERCH_WIND)
      windOn: 0,
      treeT: 0, // to its next look for a tree
      fleeT: 0, // a crawler off a face: running for a tree away from fleeFrom (FLEE_*)
      fleeFrom: 0,
      rockCd: 3,
      summonCd: 8,
      howlN: 0, // dogs The Alpha's howl brings
      enraged: false, // The Brute, badly hurt (def.enrage): it comes on at def.enrageSpeed x its pace
      pendingHit: 0,
      pendingKind: 0,
      pendingTarget: 0,
      state: 0, // 0 move, 1 windup, 2 air, 3 pin, 4 rope-flying, 5 pulling, 6 charge, 7 retreat, 8 dog backing off to ram, 9 dog ram
      stateT: 0,
      stateAct: 0,
      chargeX: 0,
      chargeZ: 0,
      link: 0,
      linkDmg: 0,
      linkT: 0,
      dazedT: 0, // thrown off whoever it had pinned (throwOff): it reels, and does nothing else, until this runs out
      losT: 0,
      los: false,
      direct: false,
      blockStruct: 0,
      breachT: 0, // boomers: how long a structure has been holding it up
      breachId: 0, // boomers: the structure it is winding up to burst against
      stuckT: 0,
      lastX: x,
      lastZ: z,
      wedgeT: 0, // how long it has been after a survivor without getting anywhere or striking anything (killed, it earns no XP)
      wedgeX: x,
      wedgeZ: z,
      detourT: 0,
      detourX: 0,
      detourZ: 0,
      sunk: false, // in the lake with nothing underfoot: wading back up the bed (wadeOut)
      wanderX: x,
      wanderZ: z,
      wanderT: 0,
      idleEat: g.rng() < (def.pack ? 0.5 : 0.25),
      pack: def.pack ? opts.pack || this.newPack() : 0, // dogs: pack id (packmates share a target)
      homeX: x, // dogs: the den they roam around by day
      homeZ: z,
      flank: def.pack ? (g.rng() - 0.5) * 1.5 : 0, // dogs: approach angle offset (rad) so a pack fans out
      howlT: 0,
      bit: false, // dogs: this lunge already bit someone
      runD: 0, // dogs: how far it breaks off after a bite (state 7), or backs off to ram (state 8)
      runSide: 1, // dogs: which way round its prey it circles
      spreadFor: 0, // fanning out of a crowd (spreadOut): the survivor it picked a line of its own to come in on for
      spreadB: 0, // ...that line's bearing round them (rad, as atan2(x, z))
      ramId: 0, // dogs: the structure it is backing off from to ram (state 8, then the windup)
      ramX: 0, // ...the way out from that piece on the dog's side
      ramZ: 0,
      ramCd: 0,
      herd: 0, // wandering herd it walks with (herd.js)
      herdX: 0, // its place in the crowd, relative to the herd's waypoint
      herdZ: 0,
      herdNav: 0,
      farT: 0,
      dead: false,
      deadT: 0,
      burning: 0,
      onFire: false,
      burnT: 0, // set alight (Combat.ignite): seconds of burning left
      burnBy: 0, // player who lit it (gets the kill)
      burnWeapon: 0,
      igniteT: def.igniteRate || 0, // flammer: s until it may set the next piece of what was built alight (igniteNear)
      lit: false, // shade: frozen by light
      darkT: 1,
      trapSlow: 1,
      burst: false, // a Mother whose belly has been torn open (Combat.burstBelly): her babies are out
      legs: 0, // legs shot off (Combat.hitLeg): bit 0 the left, bit 1 the right. One gone it hobbles, both gone it crawls
      legHp: def.legs ? [hp * LEG_HP, hp * LEG_HP] : null, // what each leg still takes (left, right)
      stumbleT: 0, // tripped by a shot in the leg: seconds until it has caught itself
      hx: new Float32Array(HISTORY_TICKS),
      hy: new Float32Array(HISTORY_TICKS),
      hz: new Float32Array(HISTORY_TICKS),
      hitStruct: null,
    };
  }

  // ---------------------------------------------------------------- handoff (gamestate.js: the zombies themselves are saved there)
  save() {
    return { packSeq: this.packSeq, maintainT: this.maintainT, opener: this.opener, herds: this.herds.save() };
  }
  load(s) {
    this.packSeq = s.packSeq;
    this.maintainT = s.maintainT;
    this.opener = s.opener ?? true; // (a save from before it: a run under way has had its first minute)
    this.herds.load(s.herds);
  }

  // The ground this map covers against the island's: 1 there, MAP_SPREAD_MAX at the most. What is scattered over the
  // whole map - the roaming dead, the dog packs, the herds - comes that many times over, or a bigger map is only a
  // thinner one. (Layout 12's mainland is 2048 m across, ten islands of ground, a third of it mountain, sea or lake:
  // it keeps the four of the 1280 m mainland it replaced, so a tick costs what it did - issue #232)
  spread() {
    return Math.min(MAP_SPREAD_MAX, (this.g.world.size / MAP_SIZE) ** 2);
  }

  // inside the clearing round where a run on this map begins (START_CLEAR), which the day spawns nothing in
  nearStart(x, z, pad = 0) {
    const st = this.g.world.start;
    return Math.hypot(x - st.x, z - st.z) < START_CLEAR + pad;
  }

  spawnInitial() {
    this.opener = false;
    const g = this.g;
    const w = g.world;
    const pop = g.diff.zombies;
    const spread = this.spread();
    // zone guards (bigger places, bigger crowds)
    for (const zn of w.zones) {
      if (zn.id === 0 || this.nearStart(zn.x, zn.z)) continue; // (the place a run begins in has none)
      const n0 = Math.round(zn.flat / 12) + Math.floor(g.rng() * 3) + (zn.id === 6 ? 3 : 0);
      const n = Math.max(n0 > 0 ? 1 : 0, Math.round(n0 * pop));
      for (let i = 0; i < n; i++) {
        const a = g.rng() * Math.PI * 2;
        const r = 4 + g.rng() * (zn.flat * 0.8);
        const x = zn.x + Math.sin(a) * r;
        const z = zn.z + Math.cos(a) * r;
        if (this.nearStart(x, z)) continue;
        const sp = daySpecial(g, x, z);
        this.spawn(sp >= 0 ? sp : g.rng() < 0.75 ? ZTYPE.WALKER : ZTYPE.RUNNER, x, z);
      }
    }
    // the car supplies are guarded
    for (const sp of g.supplySpots || []) {
      const guards = Math.max(1, Math.round(3 * pop));
      for (let i = 0; i < guards; i++) {
        const a = g.rng() * Math.PI * 2;
        const r = 3 + g.rng() * 6;
        const x = sp.x + Math.sin(a) * r;
        const z = sp.z + Math.cos(a) * r;
        const t = i === guards - 1 ? daySpecial(g, x, z) : -1;
        this.spawn(t >= 0 ? t : i === guards - 1 ? ZTYPE.RUNNER : ZTYPE.WALKER, x, z, { hpMul: 1.15 });
      }
    }
    // the dead in a city's streets
    if (w.city) for (let i = 0; i < Math.round(CITY_STREET_DEAD * pop); i++) this.spawnStreet([]);
    // roaming dead in the woods
    for (let i = 0; i < Math.max(1, Math.round(22 * pop * spread)); i++) this.spawnRoamer([]);
    // zombie dog packs in the thick woods
    for (let i = 0; i < Math.max(1, Math.round(3 * pop * spread)); i++) this.spawnForestPack([]);
    // herds wandering the roads
    this.herds.reset();
    for (let i = 0; i < this.herds.want(); i++) this.herds.spawn([]);
    // ...and the ones that never came up out of the mine
    this.stockMine([]);
    // ...nor out of the wards of the clinic
    this.wards.stock([]);
  }

  // The dead that live down in the mine: one to a den (world.mine.dens: the rooms, the drift between them), topped
  // up at every sunrise. They stand about in the dark until somebody comes down; some never got their legs back.
  // Not while a survivor is down there to see them appear.
  stockMine(humans) {
    const g = this.g;
    const mine = g.world.mine;
    if (!mine || humans.some((h) => mine.under(h.state.x, h.state.y + 0.3, h.state.z))) return 0;
    const free = mine.dens.filter((d) => !g.zombies.some((z) => z.den && !z.dead && Math.hypot(z.homeX - d.x, z.homeZ - d.z) < 0.5));
    let n = 0;
    for (const d of free) {
      const r = g.rng();
      const type = r < 0.2 ? ZTYPE.RUNNER : g.joined(ZTYPE.SHADE) && r < 0.3 ? ZTYPE.SHADE : g.joined(ZTYPE.LEAPER) && r < 0.38 ? ZTYPE.LEAPER : ZTYPE.WALKER;
      const z = this.spawn(type, d.x, d.z, { y: d.y, den: true, hpMul: 1.1 + 0.05 * g.day });
      if (!z) continue;
      // (a crawler from the start: both legs gone, as Combat.hitLeg leaves them)
      if (type === ZTYPE.WALKER && z.legHp && g.rng() < 0.25) {
        z.legs = 3;
        z.legHp = [0, 0];
      }
      n++;
    }
    return n;
  }

  // The grids below cover the world the game is played on: made again whenever it gets another (Game.setWorld), since
  // the mainland is twice the island across. hn / fn: cells a side of the spatial hash and of the tree count.
  setWorld() {
    const size = this.g.world.size;
    this.hn = Math.ceil(size / CELL);
    this.fn = Math.ceil(size / FCELL);
    this.head = new Int32Array(this.hn * this.hn).fill(-1);
    this.treeGrid = this.dens = null; // (per-world caches)
    // the Mother's roll (rollMother) has its own stream: nothing else the game draws moves for it
    this.motherRng = motherStream(this.g.seed);
  }

  // ---------------------------------------------------------------- forest
  // trees in the 24 m square around (x,z)
  forestAt(x, z) {
    if (!this.treeGrid) {
      const t = this.g.world.trees;
      this.treeGrid = new Uint16Array(this.fn * this.fn);
      for (let i = 0; i < t.length; i += 6) {
        const ci = Math.max(0, Math.min(this.fn - 1, Math.floor((t[i] + this.g.world.half) / FCELL)));
        const cj = Math.max(0, Math.min(this.fn - 1, Math.floor((t[i + 2] + this.g.world.half) / FCELL)));
        this.treeGrid[cj * this.fn + ci]++;
      }
    }
    const ci = Math.floor((x + this.g.world.half) / FCELL);
    const cj = Math.floor((z + this.g.world.half) / FCELL);
    let n = 0;
    for (let j = Math.max(0, cj - 1); j <= Math.min(this.fn - 1, cj + 1); j++) {
      for (let i = Math.max(0, ci - 1); i <= Math.min(this.fn - 1, ci + 1); i++) n += this.treeGrid[j * this.fn + i];
    }
    return n;
  }

  // walkable spots in dense forest, away from places and roads (built once per world)
  forestDens() {
    if (this.dens) return this.dens;
    const g = this.g;
    const w = g.world;
    const out = [];
    const lim = this.g.world.half - 24;
    for (let z = -lim; z <= lim; z += 12) {
      for (let x = -lim; x <= lim; x += 12) {
        if (this.forestAt(x, z) < FOREST_DENS) continue;
        if (w.zoneAt(x, z) !== ZONE.FOREST || w.roadDistAt(x, z) < 10) continue;
        if (w.isDeepWater(x, z) || g.nav.isBlocked(x, z)) continue;
        out.push({ x, z });
      }
    }
    this.dens = out;
    return out;
  }

  // One of the dead somewhere along a city's streets (world.city: its grid of streets, pitch apart), out of the way of
  // every survivor
  spawnStreet(humans) {
    const g = this.g;
    const c = g.world.city;
    const half = (c.grid * c.pitch) / 2;
    for (let tries = 0; tries < 10; tries++) {
      const o = -half + Math.floor(g.rng() * (c.grid + 1)) * c.pitch;
      const t = (g.rng() * 2 - 1) * half;
      const side = (g.rng() - 0.5) * 8;
      const northSouth = g.rng() < 0.5;
      const x = c.x + (northSouth ? o + side : t);
      const z = c.z + (northSouth ? t : o + side);
      if (this.nearStart(x, z) || humanWithin(humans, x, z, ROAM_CLEAR)) continue;
      const sp = daySpecial(g, x, z);
      return this.spawn(sp >= 0 ? sp : g.rng() < 0.25 ? ZTYPE.RUNNER : ZTYPE.WALKER, x, z, { hpMul: 1 + 0.05 * g.day });
    }
    return null;
  }

  spawnRoamer(humans) {
    const g = this.g;
    if (g.world.city && g.rng() < CITY_STREET_SHARE) {
      const z = this.spawnStreet(humans);
      if (z) return z;
    }
    // 35%: repopulate a named place (guards) if nobody is there
    if (g.rng() < 0.35) {
      const zones = g.world.zones.filter((z) => z.id !== 0);
      const zn = zones[Math.floor(g.rng() * zones.length)];
      if (!humanWithin(humans, zn.x, zn.z, zn.flat + GUARDS_CLEAR)) {
        const a = g.rng() * Math.PI * 2;
        const r = 4 + g.rng() * zn.flat * 0.8;
        const x = zn.x + Math.sin(a) * r;
        const z = zn.z + Math.cos(a) * r;
        if (!this.nearStart(x, z)) {
          const sp = daySpecial(g, x, z);
          return this.spawn(sp >= 0 ? sp : g.rng() < 0.7 ? ZTYPE.WALKER : ZTYPE.RUNNER, x, z, { hpMul: 1 + 0.05 * g.day });
        }
      }
    }
    // wanderers along the roads and in the woods (never right on top of the start, nor of the car)
    const pts = g.rng() < 0.5 ? g.world.sites : g.world.resourceSpawns;
    const car = g.world.car;
    for (let tries = 0; tries < 10; tries++) {
      const p = pts[Math.floor(g.rng() * pts.length)];
      if (!p || Math.hypot(p.x - car.x, p.z - car.z) < 55 || this.nearStart(p.x, p.z, 2)) continue;
      if (humanWithin(humans, p.x, p.z, ROAM_CLEAR)) continue;
      const x = p.x + (g.rng() - 0.5) * 4;
      const z = p.z + (g.rng() - 0.5) * 4;
      const sp = daySpecial(g, x, z);
      return this.spawn(sp >= 0 ? sp : g.rng() < 0.2 ? ZTYPE.RUNNER : ZTYPE.WALKER, x, z, { hpMul: 1 + 0.05 * g.day });
    }
    return null;
  }

  // The run's opening walker (OPENER_*): ahead of a survivor, coming their way at a shamble. None when one of the dead
  // is already close enough to be seen. Returns the walker, or null.
  spawnOpener(humans) {
    const g = this.g;
    this.opener = true;
    for (const z of g.zombies) if (!z.dead && humanWithin(humans, z.x, z.z, OPENER_NEAR)) return null;
    const s = humans[Math.floor(g.rng() * humans.length)].state;
    const lim = g.world.half - 14;
    for (let tries = 0; tries < 12; tries++) {
      const a = s.yaw + (g.rng() - 0.5) * (0.5 + tries * 0.15); // dead ahead first, then wider (forward is (-sin yaw, -cos yaw))
      const x = s.x - Math.sin(a) * OPENER_DIST;
      const z = s.z - Math.cos(a) * OPENER_DIST;
      if (Math.abs(x) > lim || Math.abs(z) > lim || g.world.isDeepWater(x, z) || g.nav.isBlocked(x, z)) continue;
      const e = this.spawn(ZTYPE.WALKER, x, z);
      if (!e) continue;
      e.alertX = s.x;
      e.alertZ = s.z;
      e.alertLvl = 1;
      e.alertRush = 0;
      e.alertU = false;
      e.alertT = NOISE_MEMORY_MAX;
      return e;
    }
    return null;
  }

  pickSpawnPoint(humans, minDist) {
    const g = this.g;
    const pts = g.world.hordeSpawns;
    let best = null;
    let bestD = -1;
    for (let i = 0; i < 24; i++) {
      const p = pts[Math.floor(g.rng() * pts.length)];
      const md = nearestHuman(humans, p.x, p.z);
      if (md >= minDist) return p;
      if (md > bestD) {
        bestD = md;
        best = p;
      }
    }
    return best;
  }

  // How far off a survivor could make out a zombie right now (m): where the client's distance haze (FogExp2,
  // 1 - exp(-(density * d)^2)) has swallowed HAZE_HIDES of it. The haze follows the sun and the sun follows the
  // phase clock (Environment.cycleFor, mirrored here): ~200 m at noon, ~72 m as the night falls, 58 m in the dark.
  // The weather is not known here (clients derive it from the seed); a fog bank or rain only ever shortens this,
  // so leaving it out errs towards calling a spot visible.
  sightRange() {
    const g = this.g;
    const night = g.phase === PHASE.NIGHT;
    const len = night ? g.nightLen : g.dayLen;
    const left = Math.max(0, Math.min(len, g.timeLeft));
    const el = len - left;
    let c; // position in the day/night cycle: the day on [0, 0.5), the night on [0.5, 1)
    if (night) {
      // 30 s of nightfall, the long dark, then 60 s of dawn
      const tin = Math.min(30, len * 0.25);
      const tout = Math.min(60, len * 0.35);
      c = el < tin ? 0.5 + 0.02 * (el / tin) : left < tout ? 1.04 - 0.065 * (left / tout) : 0.52 + 0.455 * ((el - tin) / (len - tin - tout));
    } else {
      // light morning to late afternoon, then 75 s of dusk
      const tout = Math.min(75, len * 0.35);
      c = left < tout ? 0.5 - 0.05 * (left / tout) : 0.04 + 0.41 * (el / (len - tout));
    }
    const s = Math.sin(c * Math.PI * 2);
    let k = 0;
    while (k < HAZE_SUN.length - 2 && HAZE_SUN[k + 1] < s) k++;
    const t = Math.max(0, Math.min(1, (s - HAZE_SUN[k]) / (HAZE_SUN[k + 1] - HAZE_SUN[k])));
    return Math.sqrt(-Math.log(1 - HAZE_HIDES)) / (HAZE_DENSITY[k] + (HAZE_DENSITY[k + 1] - HAZE_DENSITY[k]) * t);
  }

  // Would the survivors watch a group of zombies appear around (x,z)? 2: one of them, within `sight` m, has a clear
  // line to head height at the spot (in plain view). 1: nobody does, but someone has one SPAWN_SPREAD m to either
  // side of it as they look at it - the group is scattered that far, so whatever hides its middle (a tree trunk,
  // the corner of a house) does not hide all of it. 0: neither, the whole group comes up out of sight.
  spawnExposure(x, z, humans, sight) {
    const w = this.g.world;
    const y = groundAt(w, x, z, 200, 0.2, false) + SPAWN_HEAD;
    for (const h of humans) {
      const s = h.state;
      if (Math.hypot(x - s.x, z - s.z) > sight) continue;
      if (this.clearLine(s.x, s.y + eyeHeight(s), s.z, x, y, z)) return 2;
    }
    for (const h of humans) {
      const s = h.state;
      const dx = x - s.x;
      const dz = z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > sight) continue;
      for (let side = -1; side <= 1; side += 2) {
        const px = x - (dz / d) * SPAWN_SPREAD * side;
        const pz = z + (dx / d) * SPAWN_SPREAD * side;
        if (this.clearLine(s.x, s.y + eyeHeight(s), s.z, px, groundAt(w, px, pz, 200, 0.2, false) + SPAWN_HEAD, pz)) return 1;
      }
    }
    return 0;
  }

  // a walkable spot HORDE_SPAWN_MIN..MAX metres from (x,z) that no survivor is standing close to, and that none of
  // them can see (spawnExposure): the first candidate wholly out of sight is taken. Failing that, after SPAWN_TRIES
  // candidates (1-3 rays per survivor each), the first whose middle at least is hidden; and when every one of them
  // is in plain view (open ground, a team looking all ways) the farthest of those nobody is facing, or else the
  // farthest. spawnsScreened / spawnsInView count those two fallbacks.
  // (forest: the most wooded of the candidates - dog packs come out of the trees)
  pickSpawnAround(x, z, humans, minD = HORDE_SPAWN_MIN, maxD = HORDE_SPAWN_MAX, forest = false) {
    const g = this.g;
    const w = g.world;
    const lim = this.g.world.half - 14;
    const sight = this.sightRange();
    let best = null;
    let bestF = -1;
    let part = null;
    let partF = -1;
    let seen = null;
    let seenD = -1;
    this.spawnPicks++;
    for (let tries = 0; tries < SPAWN_TRIES; tries++) {
      const a = g.rng() * Math.PI * 2;
      const d = minD + g.rng() * (maxD - minD);
      const sx = x + Math.sin(a) * d;
      const sz = z + Math.cos(a) * d;
      if (Math.abs(sx) > lim || Math.abs(sz) > lim) continue;
      if (w.isDeepWater(sx, sz) || g.nav.isBlocked(sx, sz)) continue;
      let ok = true;
      let md = Infinity; // distance to the nearest survivor
      let faced = false; // some survivor is looking this way (forward is (-sin yaw, -cos yaw))
      for (const h of humans) {
        const s = h.state;
        const hd = Math.hypot(s.x - sx, s.z - sz);
        if (hd < minD * 0.75) ok = false;
        if (hd < md) md = hd;
        if ((s.x - sx) * Math.sin(s.yaw) + (s.z - sz) * Math.cos(s.yaw) > hd * SPAWN_VIEW_COS) faced = true;
      }
      if (!ok) continue;
      const f = forest ? this.forestAt(sx, sz) : 0;
      if (f <= bestF) continue; // no more wooded than the hidden one in hand: not worth the rays
      const v = this.spawnExposure(sx, sz, humans, sight);
      if (v === 0) {
        if (!forest) return { x: sx, z: sz };
        bestF = f;
        best = { x: sx, z: sz };
        if (f >= FOREST_DENS) break;
      } else if (v === 1) {
        if (f > partF) {
          partF = f;
          part = { x: sx, z: sz };
        }
      } else {
        if (!faced) md += 1000;
        if (md > seenD) {
          seenD = md;
          seen = { x: sx, z: sz };
        }
      }
    }
    if (best) return best;
    if (part) this.spawnsScreened++;
    else if (seen) this.spawnsInView++;
    return part || seen || this.pickSpawnPoint(humans, minD);
  }

  // the night horde comes to wherever the survivors are
  pickHordeSpawn(humans, forest = false) {
    const g = this.g;
    if (!humans.length) return this.pickSpawnPoint(humans, 0);
    const h = humans[Math.floor(g.rng() * humans.length)];
    return this.pickSpawnAround(h.state.x, h.state.z, humans, HORDE_SPAWN_MIN, HORDE_SPAWN_MAX, forest);
  }

  // ---------------------------------------------------------------- spatial hash
  rebuildHash() {
    this.head.fill(-1);
    const zs = this.g.zombies;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      const ci = Math.max(0, Math.min(this.hn - 1, Math.floor((z.x + this.g.world.half) / CELL)));
      const cj = Math.max(0, Math.min(this.hn - 1, Math.floor((z.z + this.g.world.half) / CELL)));
      const c = cj * this.hn + ci;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }
  // iterate zombie indices near (x,z) within r
  forNear(x, z, r, fn) {
    const zs = this.g.zombies;
    const i0 = Math.max(0, Math.floor((x - r + this.g.world.half) / CELL));
    const i1 = Math.min(this.hn - 1, Math.floor((x + r + this.g.world.half) / CELL));
    const j0 = Math.max(0, Math.floor((z - r + this.g.world.half) / CELL));
    const j1 = Math.min(this.hn - 1, Math.floor((z + r + this.g.world.half) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (let k = this.head[j * this.hn + i]; k >= 0; k = this.next[k]) {
          const e = zs[k];
          if (e) fn(e);
        }
      }
    }
  }

  // ---------------------------------------------------------------- noise
  // A noise at (x,z) that carries `loud` metres. Every zombie inside that radius with nobody to chase heads for
  // it, so a louder noise draws a bigger crowd, and the louder it was where a zombie stood the harder it runs.
  // A much fainter noise does not pull a zombie off the one it is already heading for. Returns how many heard it.
  // y (optional): the height it was made at, which tells a noise down in the mine from one on the ground above it.
  // Between the two levels a noise carries by way of the nearer portal, not through the rock.
  // by, what (optional): the survivor who made it and what it was (HEARD). When it wakes HEARD_MIN or more of the
  // dead that were heading for nothing, they are told (EVT.HEARD) which ones, so they learn what carries and how far.
  noise(x, z, loud, y, by, what) {
    const g = this.g;
    const mn = g.mineNav;
    const su = !!mn && y !== undefined && mn.mine.under(x, y + 0.3, z);
    g.dm.hear(x, z, loud, y); // the deer hear it too, and run the other way
    let heard = 0;
    const woke = by && what ? [] : null; // [id, d] of the dead it woke, for EVT.HEARD
    let calls = 0;
    for (const e of g.zombies) {
      if (e.dead || e.target || e.def.flying) continue;
      const d = walkDist(mn, e, x, z, su, Math.hypot(e.x - x, e.z - z));
      const lvl = loud - d; // how much further the noise would have carried past this zombie
      if (lvl <= 0) continue;
      const fresh = e.alertT <= 0;
      if (!fresh && lvl < e.alertLvl * 0.5) continue;
      const rush = Math.min(1, lvl / NOISE_RUSH);
      // it only knows roughly where the noise came from: the crowd spreads out over the spot instead of stacking on it
      const off = Math.min(5, 1 + d * 0.06);
      e.alertX = x + (g.rng() - 0.5) * 2 * off;
      e.alertZ = z + (g.rng() - 0.5) * 2 * off;
      e.alertLvl = lvl;
      e.alertRush = rush;
      e.alertU = su;
      e.alertT = Math.min(NOISE_MEMORY_MAX, NOISE_MEMORY + d / (e.def.speed * (NOISE_SPEED_MIN + (1 - NOISE_SPEED_MIN) * rush)));
      heard++;
      if (fresh && woke) woke.push([e.id, d]);
      // a couple of them answer: the survivors hear what they woke
      if (fresh && calls < 2 && rush > 0.3 && g.rng() < 0.5) {
        calls++;
        g.sound(e.ztype === ZTYPE.RUNNER ? SOUND.RUNNER_SCREAM : e.def.pack ? SOUND.DOG_BARK : e.ztype === ZTYPE.TANK ? SOUND.TANK_ROAR : SOUND.ZOMBIE_GROWL, e.x, e.y + e.def.headY, e.z, 70);
      }
    }
    if (woke && by.kind === ENT.PLAYER && !by.zombie && woke.length >= HEARD_MIN) {
      // (no rate limit: a zombie it woke is on its way and is not woken again until it forgets, so a magazine emptied
      // tells of the dead the first shot woke, then only of any that come into earshot)
      const ids = woke.length > HEARD_IDS ? woke.sort((a, b) => a[1] - b[1]).slice(0, HEARD_IDS) : woke;
      g.emit(
        (w) => {
          w.u8(EVT.HEARD);
          w.u8(what);
          w.u8(Math.min(255, woke.length));
          w.u8(Math.min(255, Math.round(loud)));
          w.u8(ids.length);
          for (const [id] of ids) w.u16(id);
        },
        { to: by.id },
      );
    }
    return heard;
  }

  // ---------------------------------------------------------------- main update
  update(dt) {
    const g = this.g;
    const humans = g.humans();
    this.humansCache = humans;
    // Sweep the corpses before the hash is built: it stores indices into g.zombies, so a splice any later would
    // leave everything that asks forNear this tick (a blast, a fire, a trap, the crowd's own spacing) looking at
    // the wrong zombies, or at none.
    const zs = g.zombies;
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      if (!z.dead) continue;
      z.deadT += dt;
      if (z.deadT > 1.6) {
        zs.splice(i, 1);
        g.removeEntity(z);
      }
    }
    this.rebuildHash();

    // who is down in the mine (the survivors here, each zombie in updateOne)
    const mn = g.mineNav;
    for (const h of humans) h.under = !!mn && mn.under(h.state);
    if (mn) mn.refresh();
    // flow fields: refresh 2 per tick round-robin (to a survivor down in the mine the valley's grid leads nowhere:
    // the way to them is by a portal, steerLevels). The dead after someone are counted twice a second: a field
    // solved with the crowd sends those behind a jam round to the next way in (nav.js setCrowd)
    if (humans.length) {
      if (g.tick % 10 === 0) {
        const chasing = this.crowdList;
        chasing.length = 0;
        for (const z of zs) if (!z.dead && z.target && !z.under && !z.def.flying) chasing.push(z);
        g.nav.setCrowd(chasing);
      }
      for (let k = 0; k < Math.min(2, humans.length); k++) {
        const h = humans[this.fieldRR++ % humans.length];
        if (!h.under) g.nav.computeField(h.id, h.state.x, h.state.z, true);
      }
    }

    if (!this.opener && g.phase === PHASE.DAY && g.day === 1 && humans.length) {
      const t = g.dayLen - g.timeLeft;
      if (t >= OPENER_UNTIL) this.opener = true;
      else if (t >= OPENER_AT) this.spawnOpener(humans);
    }

    // day population maintenance (not during the final stand: its zombies are counted, and need the room under the cap)
    if (g.phase === PHASE.DAY && !g.escape.active) {
      this.maintainT -= dt;
      if (this.maintainT <= 0) {
        this.maintainT = 4;
        let alive = 0;
        let dogs = 0;
        for (const z of g.zombies) {
          if (z.dead || z.horde || z.den || z.ward) continue;
          if (z.pack) dogs++;
          else if (!z.herd) alive++;
        }
        const pop = g.diff.zombies * this.spread();
        const target = Math.min(Math.max(8, Math.round(62 * pop)), Math.round((22 + g.day * 4 + humans.length * 2) * pop));
        if (alive < target) this.spawnRoamer(humans);
        if (dogs < Math.min(Math.max(2, Math.round(18 * pop)), Math.round((4 + g.day * 2) * pop))) this.spawnForestPack(humans);
      }
    }

    // horde stragglers stuck far from every survivor are brought back into the fight
    if ((g.phase === PHASE.NIGHT || g.escape.active) && g.tick % 40 === 0 && humans.length) {
      for (const z of g.zombies) {
        if (z.dead || !z.horde || z.boss) continue;
        if (nearestHuman(humans, z.x, z.z) > 125) z.farT += 2;
        else z.farT = 0;
        if (z.farT > 14) {
          const sp = this.pickHordeSpawn(humans);
          if (sp) {
            z.x = sp.x;
            z.z = sp.z;
            z.y = groundAt(g.world, sp.x, sp.z, 200, 0.2, false) + (z.def.flying ? 4 : 0);
            z.vx = z.vz = z.vy = 0;
            z.state = 0;
            g.fillHistory(z);
          }
          z.farT = 0;
        }
      }
    }

    this.herds.update(dt, humans);

    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      if (!z.dead) this.updateOne(z, dt, humans);
    }
  }

  updateOne(z, dt, humans) {
    const g = this.g;
    const def = z.def;
    const w = g.world;
    // timers
    z.attackCd -= dt;
    z.specialCd -= dt;
    z.rockCd -= dt;
    z.summonCd -= dt;
    z.targetT -= dt;
    z.aggroT -= dt;
    z.alertT -= dt;
    z.lureT -= dt;
    z.losT -= dt;
    z.howlT -= dt;
    z.ramCd -= dt;
    if (z.animT > 0) z.animT -= dt;
    if (z.stumbleT > 0) z.stumbleT -= dt;
    z.trapSlow = Math.min(1, z.trapSlow + dt * 2);
    const mn = g.mineNav;
    const zu = (z.under = !!mn && !def.flying && mn.under(z));
    // the horde that was down in the mine at sunrise did not burn (z.spared, Game.startDay): the sun gets it when
    // it comes up, if that is before the next nightfall (the same for what the sunrise found in the clinic's wards)
    if (z.spared && (!(zu || this.inDark(z)) || g.phase !== PHASE.DAY)) {
      z.spared = false;
      if (g.phase === PHASE.DAY && !z.onFire && z.burning <= 0) z.burning = 0.3 + g.rng() * 1.5;
    }

    // dawn: horde burns
    if (z.burning > 0) {
      z.burning -= dt;
      if (z.burning <= 0) z.onFire = true;
    }
    if (z.onFire) {
      const dmg = z.maxHp * (z.boss ? 0.035 : 0.35) * dt;
      if (g.tick % 6 === 0) g.impact(IMPACT.SPARK, z.x, z.y + 1, z.z);
      g.combat.damageZombie(z, dmg, null, { fire: true });
      if (z.dead) return;
    }
    // set alight (Combat.ignite): it keeps burning for a while after the fire that lit it
    if (z.burnT > 0) {
      z.burnT -= dt;
      g.combat.damageZombie(z, BURN.dps * dt, g.players.get(z.burnBy) || null, { weapon: z.burnWeapon, fire: true, dot: true });
      if (z.dead) return;
    }

    // climbing out of a grave (cemetery.js): it does nothing else until it is out
    if (z.riseT > 0) return g.cemetery.climb(z, dt);

    // thrown off a survivor it had pinned: it tumbles through the air (special state 2), then reels where it lands
    if (z.dazedT > 0 && z.state !== 2) {
      z.dazedT -= dt;
      {
        z.vx *= 0.7;
        z.vz *= 0.7;
        this.integrate(z, dt, 0, 0, this.humansCache);
        z.anim = ZANIM.STAGGER;
        z.animT = 0.2;
        return;
      }
    }

    // the shade only moves in darkness: any light on it and it stands frozen where it was caught
    if (def.shade && this.holdShade(z, dt)) return;

    // pending melee hit resolution
    if (z.pendingHit > 0) {
      z.pendingHit -= dt;
      if (z.pendingHit <= 0) this.resolveHit(z);
    }

    // retarget
    if (z.targetT <= 0) {
      z.targetT = 0.35 + g.rng() * 0.3;
      const had = z.target;
      this.chooseTarget(z, humans);
      if (z.pack && z.target && !had) this.alertPack(z);
    }
    const tp = z.target ? g.players.get(z.target) : null;
    const target = tp && tp.alive && !tp.zombie && !g.safe(tp) ? tp : null;
    if (!target) z.target = 0;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    let dist = Infinity;
    if (target) {
      tx = target.state.x;
      ty = target.state.y;
      tz = target.state.z;
      dist = Math.hypot(tx - z.x, tz - z.z);
      if (z.losT <= 0) {
        z.losT = 0.3;
        z.los = this.hasLOS(z, tx, ty + 1.4, tz, dist);
        // seeing a survivor through a window is not a way in: walk straight only when no wall is in between
        // (down in the mine: no rock, and nothing that stands in the drift)
        if (zu || target.under) z.direct = zu && target.under && z.los && dist < 12 && mn.segClear(z.x, z.z, tx, tz);
        else z.direct = z.los && dist < (z.pack ? 18 : 12) && g.nav.segClear(z.x, z.z, tx, tz);
      }
    }

    // the flammer: what the survivors built catches from it as it comes past
    if (def.igniteRange && (z.igniteT -= dt) <= 0) this.igniteNear(z);

    // type specific behaviour (may take over movement this tick)
    if (def.flying) return this.updateBat(z, dt, target, tx, ty, tz, dist);
    if (this.special(z, dt, target, tx, ty, tz, dist)) return;

    // ------------------------------------------------ desired direction
    let dx = 0;
    let dz = 0;
    let speed = (z.enraged ? def.speed * def.enrageSpeed : def.speed) * g.diff.speed; // (The Brute, badly hurt)
    let chasing = false;
    if (z.state === 7) {
      // dog hit-and-run: peel off to one side after a lunge, then come back in (dog.js)
      const pace = this.breakingOff(z, dt, target, tx, tz, dist, _dir);
      if (pace) {
        dx = _dir.x;
        dz = _dir.z;
        speed *= pace;
        chasing = true;
      }
    } else if (z.lureT > 0 && !def.shade && !(target && dist < 7)) {
      dx = z.lureX - z.x;
      dz = z.lureZ - z.z;
      // (a pipe bomb down in the mine only draws what is down there with it: along the drift)
      if (zu && mn.dir(z.x, z.z, z.lureX, z.lureZ, _dir)) {
        dx = _dir.x;
        dz = _dir.z;
      }
      chasing = true;
    } else if (target) {
      chasing = true;
      if (z.herd) speed = Math.max(speed, HERD_RUSH); // a roused herd comes at a run, walkers and all
      // steer straight at a visible survivor; otherwise follow the flow field (around walls to a way in)
      if (zu || target.under) {
        // one of the two is down in the mine: along the drifts, and by a portal from one level to the other
        if (z.direct || !this.steerLevels(z, tx, tz, target.under)) {
          dx = tx - z.x;
          dz = tz - z.z;
        } else {
          dx = _dir.x;
          dz = _dir.z;
        }
      } else if (z.pack && z.direct && dist < 18) {
        // a pack fans out and closes in from the sides, straightening up for the last few metres
        const a = z.flank * Math.min(1, Math.max(0, (dist - 3) / 8));
        const ex = tx - z.x;
        const ez = tz - z.z;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        dx = ex * c - ez * sn;
        dz = ex * sn + ez * c;
      } else if (z.direct && dist < 12) {
        dx = tx - z.x;
        dz = tz - z.z;
      } else if (g.nav.flowDir(target.id, z.x, z.z, _dir, z.y)) {
        dx = _dir.x;
        dz = _dir.z;
      } else {
        dx = tx - z.x;
        dz = tz - z.z;
      }
      // a crowd fans out and comes in at angles (dogs flank on their own, a crawler drags itself straight on)
      if (!z.pack && z.legs !== 3 && !zu && !target.under && this.spreadOut(z, tx, tz, dist, dx, dz)) {
        dx = _spr.x;
        dz = _spr.z;
      }
      // a kind that comes at its prey its own way (CHASES: a spitter keeps its distance)
      const pace = CHASES[z.ztype]?.call(this, z, tx, tz, dist, _dir);
      if (pace) {
        dx = _dir.x;
        dz = _dir.z;
        speed *= pace;
      }
    } else if (z.herd) {
      // wandering herd: it keeps its place in the crowd, at a shuffle or (the herd roused) at a run
      speed = this.herds.steer(z, dt, _dir);
      dx = _dir.x;
      dz = _dir.z;
      chasing = speed >= HERD_RUSH;
    } else if (z.alertT > 0) {
      dx = z.alertX - z.x;
      dz = z.alertZ - z.z;
      if (Math.hypot(dx, dz) < 3 && zu === z.alertU) z.alertT = 0;
      else if ((zu || z.alertU) && this.steerLevels(z, z.alertX, z.alertZ, z.alertU)) {
        dx = _dir.x;
        dz = _dir.z;
      }
      chasing = true;
      speed *= NOISE_SPEED_MIN + (1 - NOISE_SPEED_MIN) * z.alertRush;
      // whether it gets there or gives up, it mills about where the noise led it instead of trekking back
      z.wanderX = z.x;
      z.wanderZ = z.z;
      z.wanderT = 3;
    } else {
      // wander
      z.wanderT -= dt;
      if (z.wanderT <= 0) {
        z.wanderT = 5 + g.rng() * 9;
        const spot = zu && g.rng() < (z.den ? 0.35 : 0.6) ? mn.randomSpot(z.x, z.z, 14, g.rng) : null;
        if (zu) {
          // down in the mine: about the drifts, or nowhere
          z.wanderX = spot ? spot.x : z.x;
          z.wanderZ = spot ? spot.z : z.z;
        } else if (g.rng() < 0.4) {
          z.wanderX = z.x;
          z.wanderZ = z.z;
        } else if (def.shade) {
          this.shadeWander(z);
        } else if (z.pack && !z.horde) {
          // dogs keep to their patch of woods
          const a = g.rng() * Math.PI * 2;
          const r = g.rng() * 16;
          z.wanderX = z.homeX + Math.sin(a) * r;
          z.wanderZ = z.homeZ + Math.cos(a) * r;
        } else {
          z.wanderX = z.x + (g.rng() - 0.5) * 30;
          z.wanderZ = z.z + (g.rng() - 0.5) * 30;
        }
      }
      dx = z.wanderX - z.x;
      dz = z.wanderZ - z.z;
      if (z.den && !zu) {
        // led up out of the mine and left there: back down to its den
        if (this.steerLevels(z, z.homeX, z.homeZ, true)) {
          dx = _dir.x;
          dz = _dir.z;
        }
      } else if (z.ward && this.wards.steer(z, _dir)) {
        // one of the clinic's: about its wards, and back to them when it was led out
        dx = _dir.x;
        dz = _dir.z;
      } else if (Math.hypot(dx, dz) < 1) {
        dx = 0;
        dz = 0;
      } else if (zu && mn.dir(z.x, z.z, z.wanderX, z.wanderZ, _dir)) {
        dx = _dir.x;
        dz = _dir.z;
      }
      speed = z.pack ? 1.5 : Math.min(speed, 1.1) * 0.8;
    }
    if (!chasing && z.ztype === ZTYPE.RUNNER && !z.herd) speed = 1.2;
    // legs (Combat.hitLeg): on one it hobbles, on none it drags itself along by its arms, and a fresh hit trips it
    if (z.legs === 3) speed = crawlSpeed(def) * g.diff.speed * (chasing ? 1 : CRAWL_SLOW);
    else if (z.legs) speed *= HOBBLE_SPEED;
    if (z.stumbleT > 0) speed *= STUMBLE_SPEED;
    speed *= z.trapSlow;
    if ((g.phase === PHASE.NIGHT || g.escape.active) && z.horde) speed *= 1.06 + Math.min(0.2, 0.015 * g.day);

    // stop to attack
    let attacking = false;
    if (target && z.state !== 7 && !def.noMelee && g.vehicles.reachTo(target, z.x, z.z, dist) <= def.range + PLAYER_RADIUS && ((Math.abs(ty - z.y) < 2.3 && this.canReach(z, target)) || this.canReachUp(z, target))) {
      attacking = true;
      dx = tx - z.x;
      dz = tz - z.z;
      if (z.attackCd <= 0 && z.pendingHit <= 0 && this.packFree(z, 0.32)) {
        this.packMark(z, 0.32);
        z.attackCd = def.rate;
        z.pendingHit = 0.32;
        z.pendingKind = 1;
        z.pendingTarget = target.id;
        z.anim = ZANIM.ATTACK;
        z.animT = 0.6;
        if (g.rng() < 0.5) g.sound(z.ztype === ZTYPE.TANK ? SOUND.TANK_ROAR : def.pack ? SOUND.DOG_SNARL : SOUND.ZOMBIE_ATTACK, z.x, z.y + Math.min(1.6, def.height), z.z, 35);
      }
    }
    // what its kind sets off with its prey this near (NEARS: a boomer swells up beside them)
    NEARS[z.ztype]?.call(this, z, target, dist);

    // detour when stuck
    if (z.detourT > 0) {
      z.detourT -= dt;
      dx = z.detourX;
      dz = z.detourZ;
    }
    // in the lake (see wadeOut): nothing else matters until it has climbed the bed back to the shallows
    if (z.sunk && (z.sunk = deepWaterAt(w, z.x, z.z, z.y, 0.2, false))) {
      dx = w.heightAt(z.x + 1, z.z) - w.heightAt(z.x - 1, z.z);
      dz = w.heightAt(z.x, z.z + 1) - w.heightAt(z.x, z.z - 1);
      attacking = false;
    }
    let len = Math.hypot(dx, dz);
    if (len > 1e-4) {
      dx /= len;
      dz /= len;
    }
    // a shade does not go into a lit base: it waits on the edge of the light, or backs out of it
    if (def.shade && !attacking && !zu && this.shadeAvoid(z, len > 1e-4 ? dx : 0, len > 1e-4 ? dz : 0)) {
      dx = _shDir.x;
      dz = _shDir.z;
      len = Math.hypot(dx, dz);
    }
    const moveSpeed = attacking ? 0 : len > 1e-4 ? speed : 0;

    this.integrate(z, dt, dx * moveSpeed, dz * moveSpeed, humans);

    // what its kind sets off once it has taken its step (STEPS: a boomer held up by what was built bursts against it)
    STEPS[z.ztype]?.call(this, z, dt, dist, moveSpeed);

    // attack blocking structure
    if (!attacking && z.blockStruct && moveSpeed > 0 && def.structDmg > 0) {
      const s = g.ents[z.blockStruct];
      if (def.ramDmg && target && z.ramCd <= 0 && s && s.kind === ENT.STRUCTURE) this.startRam(z, s);
      else if (s && s.kind === ENT.STRUCTURE && z.attackCd <= 0 && z.pendingHit <= 0) {
        z.attackCd = def.rate;
        z.pendingHit = 0.35;
        z.pendingKind = 2;
        z.pendingTarget = s.id;
        z.anim = ZANIM.ATTACK;
        z.animT = 0.6;
      }
    } else if (!attacking && moveSpeed > 0) {
      // stuck detection
      const moved = Math.hypot(z.x - z.lastX, z.z - z.lastZ);
      if (moved < moveSpeed * dt * 0.2 && z.animT <= 0) z.stuckT += dt;
      else z.stuckT = Math.max(0, z.stuckT - dt * 0.5);
      if (z.stuckT > 0.8 && z.detourT <= 0) {
        z.stuckT = 0;
        z.detourT = 0.8 + g.rng() * 0.8;
        const side = g.rng() < 0.5 ? 1 : -1;
        z.detourX = -dz * side + dx * 0.2;
        z.detourZ = dx * side + dz * 0.2;
      }
    }
    if (attacking || z.blockStruct || !target || Math.hypot(z.x - z.wedgeX, z.z - z.wedgeZ) > WEDGE_MOVE) {
      z.wedgeX = z.x;
      z.wedgeZ = z.z;
      z.wedgeT = 0;
    } else z.wedgeT += dt;
    // a dog getting nowhere near its prey, shut in (or out) by what was built: it rams the nearest piece
    if (def.ramDmg && target) this.ramIfPenned(z);
    z.lastX = z.x;
    z.lastZ = z.z;

    // facing & anim (a crawler hauls itself round slowly: its head leads its body, and the hitbox with it)
    const swing = z.legs === 3 ? 0.4 : 1;
    if ((attacking || (target && dist < 4)) && z.state !== 7) z.yaw = turn(z.yaw, Math.atan2(-(tx - z.x), -(tz - z.z)), dt * 8 * swing);
    else if (Math.hypot(z.vx, z.vz) > 0.2) z.yaw = turn(z.yaw, Math.atan2(-z.vx, -z.vz), dt * 5 * swing);
    if (z.animT <= 0) {
      // hysteresis: a speed hovering at a threshold (crowd shoves, easing into an attack) must not flicker the gait
      const sp = Math.hypot(z.vx, z.vz);
      const was = z.anim;
      const run = sp > (was === ZANIM.RUN ? 2.7 : 3.2);
      const walk = sp > (was === ZANIM.WALK || was === ZANIM.RUN ? 0.12 : 0.3);
      z.anim = run ? ZANIM.RUN : walk ? ZANIM.WALK : !chasing && z.idleEat ? ZANIM.EAT : ZANIM.IDLE;
    }
  }

  // z, after a survivor at (tx, tz) dist m off and on its way in along (dx, dz): out of the crowd in its lane and in
  // on a line of its own (SPREAD_*). Writes _spr; false when it goes on as it was.
  spreadOut(z, tx, tz, dist, dx, dz) {
    const g = this.g;
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) return false;
    const fx = dx / l;
    const fz = dz / l;
    if (z.spreadFor && (z.spreadFor !== z.target || dist < SPREAD_NEAR || dist > SPREAD_DROP)) z.spreadFor = 0;
    // the others in its lane ahead (a look every third tick): whether there are any, and to which side of the line to
    // its prey. The lane runs the way it is moving: a field's steps aim at the middles of cells, so they swing about
    if (!z.spreadFor && dist > SPREAD_NEAR * 2 && dist < SPREAD_START && (g.tick + z.id) % 3 === 0) {
      const v = Math.hypot(z.vx, z.vz);
      const lx = v > 0.3 ? z.vx / v : fx;
      const lz = v > 0.3 ? z.vz / v : fz;
      const ux = (tx - z.x) / (dist || 1);
      const uz = (tz - z.z) / (dist || 1);
      let n = 0;
      let lat = 0;
      this.forNear(z.x, z.z, SPREAD_AHEAD, (o) => {
        if (o === z || o.dead || o.def.flying) return;
        const rx = o.x - z.x;
        const rz = o.z - z.z;
        const a = rx * lx + rz * lz;
        if (a <= 0.2 || a > SPREAD_AHEAD) return;
        if (Math.abs(rz * lx - rx * lz) > SPREAD_LANE + o.def.radius) return;
        const k = 1 - (a / SPREAD_AHEAD) * 0.5;
        n += k;
        lat += (rz * ux - rx * uz) * k;
      });
      if (n > 0) {
        // (in single file the ones ahead are all but dead ahead: either side will do, and a column splits both ways)
        const side = lat > SPREAD_SIDE * n ? -1 : lat < -SPREAD_SIDE * n ? 1 : g.rng() < 0.5 ? 1 : -1;
        z.spreadFor = z.target;
        z.spreadB = Math.atan2(z.x - tx, z.z - tz) + side * (SPREAD_MIN + g.rng() * (SPREAD_MAX - SPREAD_MIN));
      }
    }
    if (!z.spreadFor) return false;
    // (a field leading it round to a way in is followed as it is)
    if (fx * (tx - z.x) + fz * (tz - z.z) < SPREAD_OPEN * (dist || 1)) return false;
    const d0 = g.nav.fieldDist(z.target, z.x, z.z);
    if (d0 === Infinity) return false;
    const r = Math.min(SPREAD_R, dist * SPREAD_K);
    let ax = tx + Math.sin(z.spreadB) * r - z.x;
    let az = tz + Math.cos(z.spreadB) * r - z.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    // as far round as is open ground that still gets it nearer by the way round (a step off the side of a pier or a
    // bridge, or past a doorway, does not): straight at that point, halfway there from its way in, or its way in
    for (let i = 0; i < 2; i++) {
      const px = z.x + ax * SPREAD_PROBE;
      const pz = z.z + az * SPREAD_PROBE;
      if (!g.nav.isBlocked(px, pz) && g.nav.fieldDist(z.target, px, pz) <= d0 - SPREAD_GAIN && g.nav.segClear(z.x, z.z, px, pz)) {
        _spr.x = ax;
        _spr.z = az;
        return true;
      }
      ax += fx;
      az += fz;
      const hl = Math.hypot(ax, az) || 1;
      ax /= hl;
      az /= hl;
    }
    return false;
  }

  chooseTarget(z, humans) {
    const g = this.g;
    const night = g.phase === PHASE.NIGHT;
    let best = null;
    let bd = Infinity;
    const lone = z.ztype === ZTYPE.LEAPER && humans.length > 1;
    for (const h of humans) {
      if (g.safe(h)) continue; // (dropped and held, or back and not playing yet: game.js hold, resume)
      const s = h.state;
      const d = walkDist(g.mineNav, z, s.x, s.z, h.under, Math.hypot(s.x - z.x, s.z - z.z));
      let range = z.horde ? 600 : night ? 55 : 26;
      if (h.downed) range *= 0.5;
      else if (s.crouch) range *= 0.6;
      if (night && h.flashlight) range *= 1.5;
      if (s.sprinting) range *= 1.3;
      range *= playerMods(h).notice;
      if (s.drive || s.pass) range *= g.vehicles.notice(h); // (an engine is heard, a headlamp seen)
      if (!z.horde && z.def.sense) range *= z.def.sense; // dogs catch the scent from further off
      if (z.aggroId === h.id && z.aggroT > 0) range = 600;
      if (z.target === h.id) range *= 1.6; // hysteresis
      if (d >= range) continue;
      const w = lone && this.alone(h, humans) ? d / LONE_WEIGHT : d;
      if (w < bd) {
        bd = w;
        best = h;
      }
    }
    z.target = best ? best.id : 0;
  }

  // The way for z to (tx,tz) when either is down in the mine (tu: the spot is). Down there it follows the mine's own
  // fields; between the levels it goes by the portal that makes the shortest trip: to the spot outside its mouth by
  // the valley's flow field, straight through the mouth, and on down the drift. Writes _dir; false when a straight
  // line is all there is (same cell, no field out here, no way).
  steerLevels(z, tx, tz, tu) {
    const g = this.g;
    const mn = g.mineNav;
    if (!mn) return false;
    if (z.under && tu) return mn.dir(z.x, z.z, tx, tz, _dir);
    const p = z.under ? mn.between(z.x, z.z, tx, tz).portal : mn.between(tx, tz, z.x, z.z).portal;
    // the leg it is on: up the drift to the spot inside the mouth and out, or to the spot outside it and in
    const [near, far] = z.under ? [p.in, p.out] : [p.out, p.in];
    let ax = far.x;
    let az = far.z;
    // (between the two spots, in the mouth itself, it walks straight through)
    const q = p.p;
    const s = (z.x - q.x) * q.dx + (z.z - q.z) * q.dz;
    if (s < -3.6 || s > 3.1 || Math.abs((z.z - q.z) * q.dx - (z.x - q.x) * q.dz) > 2.2) {
      if (z.under ? mn.dir(z.x, z.z, near.x, near.z, _dir) : g.nav.flowDir(p.key, z.x, z.z, _dir, z.y)) return true;
      ax = near.x;
      az = near.z;
    }
    const l = Math.hypot(ax - z.x, az - z.z) || 1;
    _dir.x = (ax - z.x) / l;
    _dir.z = (az - z.z) / l;
    return true;
  }

  hasLOS(z, tx, ty, tz, dist) {
    return this.clearLine(z.x, z.y + (z.legs === 3 ? CRAWL_HEAD_Y : z.def.headY), z.z, tx, ty, tz);
  }

  // nothing solid (walls, structures, trees, terrain) on the straight line between two points
  clearLine(ox, oy, oz, tx, ty, tz) {
    let dx = tx - ox;
    let dy = ty - oy;
    let dz = tz - oz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    raycastWorld(this.g.world, ox, oy, oz, dx, dy, dz, l - 0.5, _ray, COL.NOBLOCK | COL.NOBULLET);
    return _ray.t < 0;
  }

  // Does z stand in one of the world's dark interiors (world.darks: the wards of Mercy Clinic), where it is dark at
  // noon? No daylight pins a Shade there, and the sunrise burns nothing in there.
  inDark(z) {
    return this.g.world.darkAt(z.x, z.y + 1, z.z) >= WARD_DARK;
  }

  // Is (x, y, z) somewhere the daylight does not reach: down in the mine, or in one of the world's dark interiors?
  darkSpot(x, y, z) {
    const w = this.g.world;
    return w.darkAt(x, y + 1, z) >= WARD_DARK || !!w.mine?.under(x, y + 0.3, z);
  }

  // melee reach: a clear torso-to-torso line, so the dead can't swipe through walls, boarded doors
  // or waist-high barricades (strikeOpen)
  canReach(z, p) {
    const s = p.state;
    return strikeOpen(this.g.world, z.x, z.y + bodyHeight(z) * 0.55, z.z, s.x, s.y + strikeHeight(s), s.z);
  }

  // melee reach at a survivor standing on something (a car roof, a dumpster), where the torso line above runs
  // into the perch itself: the arms go up beside it and across at the survivor's shins, so what the survivor
  // stands on is not in the way, and a wall or a ceiling between the two still is. Feet up to 2.5 m above the
  // zombie's own are in reach: what a survivor gets onto with one hop off a barricade (1.15 + 0.9 jump + 0.45
  // step), so the roof of a car, a pickup (1.9) or a tractor (2.2), and no camper (3.0), bus or building roof
  // (2.7 and up). A short body stretches 0.75 m above its head at most: a dog gets at a car roof, not a truck's.
  // slack: extra height allowed to a swing already on its way (the survivor jumped).
  canReachUp(z, p, slack = 0) {
    const s = p.state;
    const up = s.y - z.y;
    // feet within a step of the zombie's are on its own footing: the torso line alone decides
    if (up < 0.5 || up > Math.min(2.5, bodyHeight(z) + 0.75) + slack) return false;
    const w = this.g.world;
    const oy = z.y + bodyHeight(z) * 0.55;
    const ty = s.y + 0.35;
    raycastWorld(w, z.x, oy, z.z, 0, ty > oy ? 1 : -1, 0, Math.abs(ty - oy), _ray);
    if (_ray.col) return false;
    const l = Math.hypot(s.x - z.x, s.z - z.z) || 1;
    raycastWorld(w, z.x, ty, z.z, (s.x - z.x) / l, 0, (s.z - z.z) / l, l, _ray);
    return passesTo(_ray.col, s.x, s.z);
  }

  integrate(z, dt, dvx, dvz, humans) {
    const g = this.g;
    const def = z.def;
    const accel = Math.min(1, dt * (def.speed > 4 ? 7 : 5));
    z.vx += (dvx - z.vx) * accel;
    z.vz += (dvz - z.vz) * accel;
    // separation
    const rad = def.radius;
    let sx = 0;
    let sz = 0;
    this.forNear(z.x, z.z, rad + 1.6, (o) => {
      if (o === z || o.dead || o.def.flying) return;
      const ddx = z.x - o.x;
      const ddz = z.z - o.z;
      const d2 = ddx * ddx + ddz * ddz;
      const min = (rad + o.def.radius) * 0.9;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / min;
        sx += (ddx / d) * push;
        sz += (ddz / d) * push;
      }
    });
    const ox = z.x;
    const oz = z.z;
    _pos.x = z.x + (z.vx + sx * 2.2 + z.kx) * dt;
    _pos.y = z.y;
    _pos.z = z.z + (z.vz + sz * 2.2 + z.kz) * dt;
    z.kx *= 0.82;
    z.kz *= 0.82;
    // keep off players (players are not pushed - keeps client prediction exact)
    for (const h of humans) {
      const ddx = _pos.x - h.state.x;
      const ddz = _pos.z - h.state.z;
      const min = rad + PLAYER_RADIUS + 0.28;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < min * min && Math.abs(h.state.y - z.y) < 1.8) {
        const d = Math.sqrt(d2) || 0.01;
        _pos.x = h.state.x + (ddx / d) * min;
        _pos.z = h.state.z + (ddz / d) * min;
      }
    }
    // ...and out of a vehicle that is moving or has somebody in it (one standing empty is a box of the world)
    if (g.vehicles.list.length) g.vehicles.keepOff(_pos, rad, z.y);
    const moveR = def.moveR ?? Math.min(rad, 0.65);
    const moveH = def.moveH ?? def.height;
    const hit = resolveBody(g.world, _pos, moveR, moveH, false);
    // wedged between the static world and a structure (a gate put up beside the end of a fence) the last push may have
    // been the fence's: the structure is still what is in its way, and the one thing there it can claw down
    z.blockStruct = !hit ? 0 : hit.flags & COL.STRUCT ? hit.id : this.wedgedOn(_pos, moveR, moveH);
    if (deepWaterAt(g.world, _pos.x, _pos.z, z.y, 0.2, false) && !this.wadeOut(z, ox, oz)) {
      _pos.x = ox;
      _pos.z = oz;
    }
    const lim = this.g.world.half - 4;
    z.x = Math.max(-lim, Math.min(lim, _pos.x));
    z.z = Math.max(-lim, Math.min(lim, _pos.z));
    const gy = groundAt(g.world, z.x, z.z, z.y, 0.2, false);
    if (z.y > gy + 0.05) {
      z.vy -= GRAV * dt;
      z.y = Math.max(gy, z.y + z.vy * dt);
      if (z.y <= gy) z.vy = 0;
    } else {
      z.y = gy;
      z.vy = 0;
    }
  }

  // the blocking structure a body of radius r and height h at pos is pressed against, if any (its id, or 0)
  wedgedOn(pos, r, h) {
    for (const c of this.g.world.structGrid.query(pos.x, pos.z, r + 0.1, _wq)) {
      if (c.flags & COL.NOBLOCK || c.y1 <= pos.y + STEP_HEIGHT || c.y0 >= pos.y + h) continue;
      if (footprintContains(c, pos.x, pos.z, r + 0.05)) return c.id;
    }
    return 0;
  }

  // integrate is about to refuse a step into the lake. One that is already in it (dropped off a deck by a
  // pounce, shoved off the edge) may take the step if it climbs the lake bed: it wades back to the shallows
  // instead of standing on the bottom all night. updateOne steers it up the bed while z.sunk is set.
  wadeOut(z, ox, oz) {
    const w = this.g.world;
    z.sunk = deepWaterAt(w, ox, oz, z.y, 0.2, false);
    return z.sunk && w.heightAt(_pos.x, _pos.z) > w.heightAt(ox, oz);
  }

  resolveHit(z) {
    const g = this.g;
    const def = z.def;
    const dmgMul = 1 + 0.07 * (g.day - 1);
    if (z.pendingKind === 1) {
      // (a dog's snap, got home or not, is all it stays for)
      if (def.hitRun && z.state === 0) this.breakOff(z);
      const p = g.players.get(z.pendingTarget);
      if (!p || !p.alive || p.zombie) return;
      const s = p.state;
      const d = g.vehicles.reachTo(p, z.x, z.z, Math.hypot(s.x - z.x, s.z - z.z)); // (in a vehicle: to its body)
      if (d > def.range + PLAYER_RADIUS + 0.9 || ((Math.abs(s.y - z.y) > 2.5 || !this.canReach(z, p)) && !this.canReachUp(z, p, 0.9))) {
        if (def.whiffReel) this.reel(z, def.whiffReel); // (The Brute's swing at nobody leaves it stumbling)
        return;
      }
      g.damagePlayer(p, def.dmg * dmgMul, { kind: KILLER.ZOMBIE, ztype: z.ztype, x: z.x, z: z.z });
      g.impact(IMPACT.BLOOD, s.x, s.y + 1.2, s.z);
      if (def.fireproof) g.setAlight(p); // (the flammer's blow sets them burning: PLAYER_FIRE)
      if (def.knock) this.knock(p, z.x, z.z, def.knock, 4, 0.35);
    } else if (z.pendingKind === 2) {
      const s = g.ents[z.pendingTarget];
      if (s && s.kind === ENT.STRUCTURE) g.damageStructure(s, def.structDmg * dmgMul * g.diff.hurt);
    }
  }

  // the nearest piece the survivors built that blocks the dead, within r m of z (its entity), or null
  nearStruct(z, r) {
    const g = this.g;
    let best = null;
    let bd = Infinity;
    for (const c of g.world.structGrid.query(z.x, z.z, r, _lq)) {
      if (c.flags & COL.NOBLOCK) continue;
      const s = g.ents[c.id];
      if (!s || s.kind !== ENT.STRUCTURE || s.removed) continue;
      const d = Math.hypot(c.x - z.x, c.z - z.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  knock(p, fromX, fromZ, power, up, stun) {
    const s = p.state;
    // (in a car the blow shoves the car; on two wheels it has them off first)
    if ((s.drive || s.pass) && this.g.vehicles.onKnock(p, fromX, fromZ, power)) return;
    let dx = s.x - fromX;
    let dz = s.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    s.vx += dx * power;
    s.vz += dz * power;
    s.vy = Math.max(s.vy, up);
    s.onGround = 0;
    s.stunT = Math.max(s.stunT, (stun || 0) * playerMods(p).stun);
  }

  releaseLink(z) {
    const g = this.g;
    if (!z.link) return;
    const p = g.players.get(z.link);
    if (p) {
      if (pinsDown(z)) p.state.pinned = 0;
      else p.state.pulled = 0;
      p.pinnedBy = 0;
      p.ropedBy = 0;
    }
    z.link = 0;
    z.linkDmg = 0;
    if (z.state === 3 && !z.dead) {
      // leaper hops off
      const yaw = z.yaw;
      z.vx = Math.sin(yaw) * 5;
      z.vz = Math.cos(yaw) * 5;
      z.vy = 5;
      z.state = 2;
      z.anim = ZANIM.AIRBORNE;
    } else if (z.state === 5 || z.state === 4) {
      z.state = 0;
      z.anim = ZANIM.IDLE;
      z.animT = 0;
    }
    z.specialCd = 6 + this.g.rng() * 3;
    // what its kind does once it has let go (RELEASES: a crawler off a face runs for a tree)
    RELEASES[z.ztype]?.call(this, z, p);
  }

  // ---------------------------------------------------------------- specials (each kind's own: server/specials/)
  // returns true if the special fully handled this zombie's tick
  special(z, dt, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const t = z.ztype;

    // a way of getting about of its kind's own (MOVES: a crawler up a tree, or on its way to one)
    const move = z.state === 0 && MOVES[t];
    if (move && move.call(this, z, dt, target, tx, ty, tz, dist)) return true;

    // windup common: state 1
    if (z.state === 1) {
      z.stateT -= dt;
      z.anim = ZANIM.SPECIAL;
      // to its prey, unless the act is aimed elsewhere (AIMS: a dog squaring up to the piece it rams)
      const aim = AIMS[z.stateAct];
      if (aim) aim.call(this, z, dt);
      else this.faceTarget(z, dt, target, tx, tz);
      this.holdStill(z, dt);
      if (z.stateT <= 0) {
        z.state = 0;
        this.fireSpecial(z, target, tx, ty, tz, dist);
      }
      return true;
    }
    // in the air: a leaper's pounce (or a crawler's), a dog's lunge, or the hop off whoever it had pinned
    if (z.state === 2) {
      z.anim = ZANIM.AIRBORNE;
      if (z.pounce && target) this.leapSteer(z, target.state, dt);
      z.vy -= leapG(z) * dt;
      _pos.x = z.x + z.vx * dt;
      _pos.y = z.y;
      _pos.z = z.z + z.vz * dt;
      resolveBody(g.world, _pos, 0.35, 1.2, false);
      if (!deepWaterAt(g.world, _pos.x, _pos.z, z.y, 0.2, false)) {
        z.x = _pos.x;
        z.z = _pos.z;
      }
      z.y += z.vy * dt;
      const gy = groundAt(g.world, z.x, z.z, z.y, 0.2, false);
      // pounce on a human (not on the hop off whoever it had pinned: that took them again 0.15 s after it let go)
      if (z.pounce && z.vy < 3 && this.leapPin(z, LEAP_PIN)) return true;
      // dog lunge (and The Alpha's): bite whoever it slams into, once (dog.js)
      if (def.lungeRange && !z.bit) this.lungeBite(z);
      if (z.y <= gy) {
        z.y = gy;
        z.vy = 0;
        z.vx *= 0.3;
        z.vz *= 0.3;
        z.state = 0;
        z.anim = ZANIM.IDLE;
        z.animT = 0.3;
        z.glide = false;
        if (z.pounce) {
          // a leaper comes down beside its prey and has them; or it missed, and is soon ready to go again
          z.pounce = false;
          if (this.leapPin(z, LEAP_LAND)) return true;
          z.specialCd = Math.min(z.specialCd, LEAP_MISS_CD * (1 + 0.5 * g.rng()));
        }
        if (def.lungeRange) this.lungeLand(z);
      }
      return true;
    }
    if (z.state === 7) return false; // dog hit-and-run: normal movement
    // a state of the kind's own: a pin, a rope, a charge, a dog backing off to ram and its ram (STATES)
    const own = STATES[z.state];
    if (own) return own.call(this, z, dt, target, tx, ty, tz, dist);

    // ---- trigger specials (state 0). A crawler has none left: it cannot rear up to spit or to throw its rope
    if (!target || z.legs === 3) return false;
    const trigger = TRIGGERS[t];
    return trigger ? trigger.call(this, z, target, tx, ty, tz, dist) : false;
  }

  // z winds up its special (state 1) for time s: act is what it does when that is over (fireSpecial), snd its cry
  windup(z, time, act, snd) {
    z.state = 1;
    z.stateT = time;
    z.stateAct = act;
    z.anim = ZANIM.SPECIAL;
    if (snd) this.g.sound(snd, z.x, z.y + z.def.headY, z.z, z.def.boss ? 120 : 45);
  }

  // z reels where it stands for time s after its big move (a boss's weak window, docs/bosses.md): it does nothing else
  // until that runs out (the dazedT branch of updateOne), and takes def.stunHurt x damage meanwhile (Combat.damageZombie)
  reel(z, time) {
    z.dazedT = Math.max(z.dazedT, time);
    z.attackCd = Math.max(z.attackCd, time);
    z.pendingHit = 0;
    z.anim = ZANIM.STAGGER;
    z.animT = 0.2;
  }

  // through a windup, a rope's flight or a pull: it turns to its prey, and stands
  faceTarget(z, dt, target, tx, tz) {
    if (target) z.yaw = turn(z.yaw, Math.atan2(-(tx - z.x), -(tz - z.z)), dt * 10);
  }
  holdStill(z, dt) {
    z.vx *= 0.7;
    z.vz *= 0.7;
    this.integrate(z, dt, 0, 0, this.humansCache);
  }

  // what z does once its windup is over (z.stateAct: ACTS)
  fireSpecial(z, target, tx, ty, tz, dist) {
    ACTS[z.stateAct]?.call(this, z, target, tx, ty, tz, dist);
  }

  // Did a bullet that struck z's body (not its head nor a leg) at (x, y, zz), its feet at pos, go into a spot of its
  // kind's own (SPOTS: the Mother's belly)? Combat.fire asks, for one of the dead or a deer
  spotHit(z, pos, x, y, zz) {
    const spot = z.kind === ENT.ZOMBIE ? SPOTS[z.ztype] : null;
    return !!spot && spot.at.call(this, z, pos, x, y, zz);
  }
  // ...and what that does once the bullet's damage is dealt (by: who shot it, along dirX, dirZ)
  spotStruck(z, by, dirX, dirZ) {
    SPOTS[z.ztype].struck.call(this, z, by, dirX, dirZ);
  }

  // what z's kind does as it dies, once its loot is down (DEATHS: a smoker's last breath, a boomer's blast)
  dies(z, attacker, opts, sunKill) {
    DEATHS[z.ztype]?.call(this, z, attacker, opts, sunKill);
  }
  // does z's kind burst as it dies, however it is killed (BURSTS: the boomer)?
  bursts(z) {
    return BURSTS.has(z.ztype);
  }
}
installSpecials(Zombies); // (each special kind's own methods, from server/specials/)

// How far z has to go to (x, zz), d m off in a straight line, when either is down in the mine (mn: the game's
// MineNav, or null; under: the spot is down there): down the same drifts as far as the drifts make it (not the few
// metres of rock between two galleries), and between the two levels the walk round by a portal. d as it is when both
// are up in the valley.
function walkDist(mn, z, x, zz, under, d) {
  if (!mn || !(under || z.under)) return d;
  return under && z.under ? Math.max(d, mn.dist(z.x, z.z, x, zz)) : under ? mn.between(x, zz, z.x, z.z).d : mn.between(z.x, z.z, x, zz).d;
}

// how fast a zombie of this kind drags itself along once both legs are gone (m/s)
export function crawlSpeed(def) {
  return Math.max(CRAWL_SPEED_MIN, Math.min(CRAWL_SPEED_MAX, def.speed * CRAWL_SPEED));
}

export { LONE_NEAR, LONE_WEIGHT, leapAim } from './specials/leaper.js';
