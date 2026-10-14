// Client game orchestrator: the Game builds every subsystem of a game in play (constructor) and runs its frame
// (update). Its methods for each responsibility live in game/ (game/index.js lays them onto it).
import * as THREE from 'three';
import {
  PHASE,
  SERVER_TICK_RATE,
  INTERP_DELAY,
  SLOT_PRIMARY,
  SLOT_PISTOL,
  SLOT_MELEE,
  SLOT_THROW,
  SLOT_BUILD,
  INVENTORY_MAX,
  WATER_LEVEL,
  MAX_PLAYERS,
  DUSK_WARNING,
  BTN,
} from '../../shared/constants.js';
import {
  ITEM,
  WEAPONS,
  STRUCT,
  ZTYPE,
  ZONE,
  ZONE_NAMES,
  AMMO_NAMES,
  AMMO_ITEMS,
} from '../../shared/defs.js';
import { ENDED_CODE, ACT, ENT, HOLD, PFLAG, dqpos } from '../../shared/protocol.js';
import { LookWarmer } from './lookwarm.js';
import { HomeSense } from '../audio/home.js';
import { MotifWatch, MOTIFS } from '../audio/motifs.js';
import { shotClimb, aimingWith, currentWeapon, eyeHeight } from '../../shared/playersim.js';
import { stepClimb, punchAt } from './aimview.js';
import { pryWeapon } from '../../shared/trunk.js';
import { perkMods } from '../../shared/progress.js';
import { swimming } from '../../shared/swim.js';
import { Connection } from '../net/connection.js';
import { Prediction } from './prediction.js';
import { InputBuffer } from './inputbuffer.js';
import { Entities } from './entities.js';
import { GunClient } from './mountedgun.js';
import { CatClient } from './catcarry.js';
import { RocketsClient } from './rockets.js';
import { FairClient } from './fair.js';
import { HandcarClient } from './handcar.js';
import { FaceLatch } from './facelatch.js';
import { VehicleClient } from './vehicles.js';
import { Highlight } from './highlight.js';
import { Input } from './input.js';
import { TouchPad } from '../ui/touchpad.js';
import { DropHold } from './drophold.js';
import { HoldRing } from './holdring.js';
import { SkyFlares } from './skyflares.js';
import { Voice } from './voice.js';
import { Environment } from '../render/environment.js';
import { Crowd } from '../render/crowd.js';
import { getCrowdMaterial, crowdBones } from '../render/models/skinning.js';
import { FixtureUI } from './fixtures.js';
import { nkSounds } from './nunchaku.js';
import { RadioClient } from './radio.js';
import { Lights } from '../render/lights.js';
import { Weather } from './weather.js';
import { PowerViews } from './power.js';
import { Onboarding } from './onboarding.js';
import { KeyHints } from '../ui/keyhints.js';
import { KeyGuard } from './keyguard.js';
import { CardsClient } from './cards.js';
import { smokeCover } from '../../shared/smoke.js';
import { installParts } from './game/index.js';
import { CRAFT_BURST } from './game/inventory.js';
import { PING_LIFE } from './game/markers.js';
import { BUILD_ROT_WHEEL } from './game/build.js';

const WEATHER_TOAST = {
  fog: 'Fog is rolling in',
  gale: 'The wind is picking up',
  rain: 'It starts to rain',
  storm: 'A storm is breaking',
};

// the anti-tank rifle's long reload: how far into it the round goes home (its bolt opens at the start, closes at the end)
const AT_ROUND_IN = 0.62;
const LAND_SPRING = 16; // rad/s of the camera's landing dip: lowest ~60 ms after touchdown, level again in ~0.35 s
const BOARD_EVERY = 4000; // ms between two requests for the leaderboard while it is open
// Turning while aimed is slowed by the gun's zoom, tan(aimed fov / 2) / tan(hip fov / 2) (the ratio of the two
// magnifications, the same on any aspect ratio), so what is under the crosshair slides across the screen as far per
// centimetre of mouse as it does from the hip, whatever the zoom. On top of that, AIM_SENS: at 1 aimed and hip would
// match exactly; 0.82 keeps an ordinary gun where the flat 0.6 it replaces had it (0.82 * 0.73 at 75 degrees). The
// "Aim sensitivity" setting multiplies it (1.22 there is the exact match).
const AIM_SENS = 0.82;
const DOWN_WEATHER = { rain: 0, wind: 0.2 }; // the weather as it is well down a drift of the mine
const _nkAcc = new THREE.Vector3();
const _nkQ = new THREE.Quaternion();

export class Game {
  constructor({ renderer, ui, audio, settings }) {
    this.renderer = renderer;
    this.ui = ui;
    this.audio = audio;
    this.settings = settings;
    this.scene = renderer.scene;
    this.camera = renderer.camera;
    this.world = null;
    this.seed = null;
    this.state = 'menu'; // menu | playing
    this.frame = 0;
    this.time = 0;
    this.myId = 0;
    this.perksUp = false; // the Perks panel opened with [P] mid-run (togglePerks)
    this.achUp = false; // the Achievements panel opened with [U] mid-run (toggleAchievements)
    this.pledgeShown = false; // this run's pledge window has opened its panel by itself once (onPledge)
    this.admin = false; // the server lets us run the admin commands (WELCOMEF.ADMIN): the spawn menu [`] is ours
    this.global = { phase: PHASE.WAITING, day: 0, timeLeft: 0, hordeLeft: -1, bossId: 0, supplies: [0, 0, 0, 0, 0], hints: [255, 255, 255, 255, 255, 255, 255], found: 0, spots: [0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff], help: 0, scouted: 0, unlocked: 0, schemHints: [255, 255, 255, 255, 255], wave: 0, waves: 3, escapeT: 0, flags: 0, finale: false, suppliesDone: false, escapeReady: false, humansAlive: 0, playersTotal: 0, restartT: 0, benches: [], parts: [] };
    this.self = { alive: 1, hp: 100, maxHp: 100, armor: 0, armorMax: 0, battery: 100, weapons: [0, 0, 0, 0, 0], mags: [0, 0], ammo: AMMO_ITEMS.map(() => 0) };
    this.inventory = { slots: new Array(INVENTORY_MAX).fill(null), armor: null, backpack: 0 };
    this.craftQueue = []; // recipe ids of bulk crafts waiting to be sent (sendCrafts)
    this.craftBudget = CRAFT_BURST;
    this.craftSoundT = -1; // when a craft was last heard (eventHandler.sound)
    this.players = new Map(); // id -> {name, status, walkie, kills, ping, way: their waypoint {x, z, zone} | null}
    this.looks = new Map(); // id -> a custom survivor's model key (S2C.LOOKS: onLooks; drawn once built: lookOf)
    this.lookWarmer = new LookWarmer();
    this.renderPos = new THREE.Vector3();
    this.clientTick = 0;
    this.clockInit = false;
    this.clockAdj = 0; // pending clock correction, eased in over a few frames
    this.net = { tick: 0, ack: 0 }; // running snapshot header state (tick / acked command of the last one)
    this.latestTick = 0; // newest snapshot received
    this.jitter2 = 0; // mean squared snapshot arrival error (ticks^2)
    this.lateRun = 0; // consecutive snapshots far behind the clock
    this.interpExtra = 0; // extra interpolation delay (ticks) on a jittery connection
    this.renderTick = 0;
    this.damageFx = 0;
    this.hitFx = 0;
    this.viewClimb = 0; // the gun's climb as the view has it (rad): eased onto shotClimb of the predicted state
    this.punch = 0; // the last round's punch (rad at its top), punchT s ago, over punchLen s
    this.punchT = 0;
    this.punchLen = 0.1;
    this.camBob = 0;
    this.landDip = 0; // how far a landing has pushed the view down, a spring (landVel) kicked on touchdown
    this.landVel = 0;
    this.quake = 0; // the ground shaking under something heavy, 0..1: a tank's footfalls each add to it (Entities)
    this.fallV = 0; // downward speed in the last frame in the air
    this.eyeH = 1.62;
    this.fovCur = settings.fov || 75;
    this.aimT = 0; // 0 hip .. 1 aimed, eased with the zoom (look sensitivity)
    this.buildType = STRUCT.BARRICADE;
    this.buildPicked = false; // a structure picked from the ring since the hammer came out: its ghost is up to place
    this.buildMenu = null; // { hover }: the ring of structures is open (the mouse points in it: Input.cursor)
    this.buildRot = 0;
    this.ghosts = {};
    this.lastSlot = SLOT_PISTOL;
    this.dropHold = new DropHold(); // the drop key held, on its way to dropping the weapon in the hands (drophold.js)
    this.localFlash = false;
    this.localFlashT = 0;
    this.openness = 0;
    this.indoor = 0;
    this.motifs = new MotifWatch(); // the specials' approach motifs (audio/motifs.js)
    this.homeSense = new HomeSense(); // inside the team's walls (the night's home bed: audio/home.js)
    this._homeStructs = [];
    this.under = 0; // how far down the mine the eye is (0..1)
    this._envOver = { under: 0, smoke: 0 };
    this.smoke = 0; // how deep in a smoker's cloud the eye is, eased (Environment's smoke override)
    this._wxDown = {};
    this.stepAcc = 0;
    this.swimming = false; // afloat in the lake or a pond (shared/swim.js), as of the last frame
    this.swimK = 0; // ...eased 0..1: the view riding the water
    this.treadT = 0; // till the next paddle treading water
    this.swimTired = false; // told this time in the water that stamina is running low
    this.swimTold = false; // told what swimming is, this page load
    this.deathShown = false;
    this.overlay = null;
    this.runOn = false; // a run is under way, as far as this client has seen (trackRun)
    this.run = null; // ...and we have been in it from the start: { tick, kills0, day }
    this.sawRunEnd = false; // the last run ended under us, so the next one starts under us whatever day it is on
    this.runReport = null; // what the run that just ended did to the personal record, for the end screen
    this.prevPhase = -1;
    this.lastHudInvKey = '';
    this.talkPeers = [];
    this.talkKey = '';
    this.pttHeld = false; // [V] held down (push-to-talk): the microphone is open
    this.lookTarget = null;
    this.menuAngle = 0;
    this.lowHpBeat = 0;
    this.holding = 0; // hold-to-interact target we told the server about
    this.holdWait = null; // { id, kind, o }: [E] held for that while the hands were on an item, asked for once they are free
    this.holdRing = new HoldRing((kind) => this.holdInfo(kind)); // the ring every held key shows from its press (holdring.js)
    this.ringOut = { progress: -1, label: '', cancelled: false };
    this.flames = new Map(); // flamethrowers spraying right now: shooter id (-1 = ours) -> { loop, t, glow, at, light }
    this.flameLights = []; // their fire lights this frame, for the light pool
    this.pings = [];
    // your own waypoint, set on the field map; the server lists it for the team (shareWaypoint):
    // { x, y, z, zone (id of the place it sits on, or -1), r (arrival radius), visited, away }
    this.waypoint = null;
    ui.map.onWaypoint = (at) => this.setWaypoint(at);
    ui.map.onClose = () => this.toggleMap(false);
    ui.board.onClose = () => this.toggleBoard(false);
    ui.bestiary.onClose = () => this.toggleBestiary(false);
    ui.cards.onClose = () => this.toggleCards(false);
    ui.progress.onHide = () => this.togglePerks(false);
    ui.pledge.onSend = (data) => this.conn.pledge(data);
    ui.pledge.onClose = () => this.togglePledge(false);
    ui.pledge.names = () => new Map([...this.players].map(([id, p]) => [id, p.name]));
    // the kit screens' tabs (ui/screentabs.js): in a run they are the game's; outside one, the UI swaps the two it has
    const tabGo = ui.screenGo.bind(ui);
    ui.screenGo = (id) => (this.screenRun() ? this.screenGo(id) : tabGo(id));
    ui.screenRun = () => this.screenRun();
    // (after the click that hid it is done: its Sign in hides it and opens the account panel in the same handler)
    ui.achPanel.onHide = () => queueMicrotask(() => this.toggleAchievements(false));
    ui.fieldNotes.ctx = () => (this.state === 'playing' && this.global && !this.global.finale ? { seed: this.seed, act: this.act, day: this.global.day, phase: this.global.phase } : null);
    ui.spawn.onClose = () => this.toggleSpawn(false);
    ui.spawn.onSpawn = (cmd) => this.conn.chat(cmd);
    ui.roster.onClose = () => this.pinRoster(false);
    ui.sheetGo = (where) => this.sheetGo(where); // (the side sheet's tabs: ui/sheet.js)
    this.boardT = 0; // when the leaderboard is next asked for, while it is open (performance.now)
    this.discovered = new Set([ZONE.CAMP]);
    this.stripped = new Set(); // the trees and wrecks with nothing left to give today (harvest.js strippedKey)
    this.discoverT = 0;
    this.debugCam = null;
    this.selfBody = null; // our own survivor, shown to a debug camera that asks for it (updateSelfBody)
    this.nkVx = this.nkVz = 0; // (nunchucks: the eye's velocity last frame, and what their sounds remember)
    this.nkBtn = 0;
    this.nkSt = {};
    this.nkSt2 = {};
    this.warm = null; // shader warm-up in progress (prewarm)
    this.warmKey = ''; // quality + map the programs were last warmed for

    this.input = new Input(renderer.canvas);
    this.input.sensitivity = settings.sensitivity || 1;
    this.input.invertY = !!settings.invertY;
    this.input.rawInput = settings.rawMouse !== false;
    // Ctrl+W (crouch + forward) must not close the tab: fullscreen with the keys locked, else a "Leave site?" prompt
    // (not between two servers on a deploy: the place is kept there, and a new build reloads the page itself: moveBack)
    this.keyGuard = new KeyGuard(() => this.state === 'playing' && !this.moving);
    this.keyGuard.fullscreen = settings.fullscreen !== false;
    this.joinHold = false; // the mouse and the screen were asked for on the click on Join, and the join is not done (holdForJoin)
    this.input.onRequestLock = () => this.keyGuard.engage(this.joinHold);
    this.keyHints = new KeyHints(this); // names the key on the HUD at the moment it would help
    this.onboarding = new Onboarding(this); // a new player's walkthrough, and the first-time tips (onboarding.js)
    this.conn = new Connection({
      snapshot: (r) => this.onSnapshot(r),
      world: (seed, act) => this.onWorld(seed, act),
      inventory: (r) => this.onInventory(r),
      chat: (id, flags, text) => this.onChat(id, flags, text),
      players: (r) => this.onPlayers(r),
      looks: (ids) => this.onLooks(ids),
      progress: (r) => this.onProgress(r),
      board: (b) => this.ui.setBoard(b),
      cards: (m) => this.cards.onMessage(m), // (Dead Hand: game/cards.js)
      pledge: (m) => this.onPledge(m), // the pledge window as a run begins (server/pledge.js)
      voice: (from, payload) => this.voice.onSignal(from, payload),
      // (ENDED_CODE: an admin closed the game or removed this player - the reason is said, and nothing rejoins)
      close: (code, reason) => this.onDisconnect(code, code === ENDED_CODE ? reason || 'This game was ended by an admin.' : ''),
    });
    this.voice = new Voice(this.conn, audio);
    this.cards = new CardsClient(this); // Dead Hand, the card game: the collection, decks, asks, a match or a trade
    this.voice.onState = (s) => this.ui.setVoiceState({ ...s, speakers: this.speakers() });
    this.env = new Environment(this.scene);
    this.weather = new Weather();
    this.weather.onStrike = (s) => this.onLightning(s);
    this.lights = new Lights(this.scene, this.camera, renderer.q);
    this.vm = null; // built with the first world (ensureViewModel), not here: the splash has to paint first
    this.vmItem = -1;
    // the dead are drawn as a crowd: one draw call for all of a kind, one texture for all their bones (render/crowd.js)
    this.crowd = new Crowd(this.scene, getCrowdMaterial(), crowdBones, () => (this.renderer.q.shadowDist || 60) + 15);
    this.entities = new Entities(this);
    this.fixtures = new FixtureUI(this); // the chapel bell and the Relay Station's radio: prompts and notices
    this.radio = new RadioClient(this); // the walkie-talkie in slot 6: keyed, on the air, its static
    this.gun = new GunClient(this); // the mounted gun at the Army Checkpoint
    this.cat = new CatClient(this); // the stray cat, in somebody's arms
    this.rockets = new RocketsClient(this); // our own RPG grenades in flight
    this.fair = new FairClient(this); // the Tri-County Fair: its rides, its lights, who sits where
    this.handcar = new HandcarClient(this); // the handcars on the railway: where they are drawn, who rides them
    this.vehicles = new VehicleClient(this); // the mopeds, cars and bicycles of the mainland: drawn, ridden, driven
    this.skidT = 0;
    this.highlight = new Highlight(this); // the faint outline on what [E] would act on
    this.power = new PowerViews(this); // the generator and its floodlights: their lights, sound and [E]
    this.skyflares = new SkyFlares(this); // flare gun flares: drawn, flown (our own), and their light on the world
    this.prediction = new Prediction(null);
    this.inputBuffer = new InputBuffer(); // holds a fire / reload / jump pressed a moment early until it can act
    this.setupInputHandlers();
    this.touchpad = new TouchPad(this); // a phone's stick and buttons (touch mode: game/touchmode.js)
    // a click on the canvas takes the pointer back when the lock was lost or refused
    renderer.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.ui.inventoryOpen && !this.ui.isTyping()) this.input.requestLock();
    });
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (this.building) return; // (a world half built: nothing of it is updated, nor drawn - main.js)
    this.frame++;
    this.time += dt;
    const time = this.time;
    this.lookWarmer.tick(dt);
    // a warm-up ends here, ahead of this frame's draw: when its programs are built, or now if play has begun
    if (this.warm && (this.warm.ready || this.state === 'playing')) this.finishPrewarm();
    const menu = this.state === 'menu' || !this.world;
    this.touchpad.update();
    this.renderer.setCenter(menu ? this.ui.splash.sceneX : 0.5); // (beside the splash's menu, the scene is off-centre)
    if (menu) {
      this.endCine();
      return this.updateMenu(dt);
    }
    const cine = this.updateCine();
    const s = this.prediction.state;
    const self = this.self;
    const inp = this.input;

    // wheel: build type or weapon cycling; with a piece picked and the fine-rotate key held, it turns the piece (down
    // clockwise, as a right click does)
    const wheel = inp.consumeWheel();
    if (wheel) {
      if (s.slot === SLOT_BUILD && !s.zombie && this.buildPicked && !this.buildMenu && inp.held('buildFine')) this.buildRot = (this.buildRot - wheel * BUILD_ROT_WHEEL) & 255;
      else if (s.slot === SLOT_BUILD) this.cycleBuild(wheel > 0 ? 1 : -1);
      else if (!s.zombie) {
        const order = [SLOT_PRIMARY, SLOT_PISTOL, SLOT_MELEE, SLOT_THROW];
        let i = order.indexOf(s.slot);
        for (let k = 0; k < 4; k++) {
          i = (i + (wheel > 0 ? 1 : -1) + 4) % 4;
          const sl = order[i];
          if (sl === SLOT_THROW ? s.throwCount > 0 && s.weapons[SLOT_THROW] : s.weapons[sl]) {
            this.prediction.requestSlot(sl);
            break;
          }
        }
      }
    }
    // The pointer held with nothing up is play, and a screen up has the pointer (onLockChange keeps both). Should any
    // path still leave the input off under a held pointer, the trigger would be dead with Esc ignored: not past a frame.
    // (Not on the way to the end screen or between two servers on a deploy: the input is off there on purpose.)
    if (inp.locked && !this.moving && !this.overlay && !this.ui.pauseOpen && !this.ui.isTyping()) {
      if (this.screenUp()) inp.exitLock();
      else if (!inp.enabled) inp.enabled = true;
    }
    inp.buildMode = s.slot === SLOT_BUILD && !s.zombie;
    // prediction
    const buttons = cine ? 0 : this.vehicles.shape(this.gun.shape(self.alive ? inp.sample() | this.fair.press | this.handcar.press : 0)); // (manning the mounted gun: its trigger, not the weapon's. fair.press, handcar.press: [E] getting out of a seat, off a handcar)
    if (!self.alive || !inp.enabled) this.inputBuffer.clear(); // an early press must not outlive a death or a menu
    let attacked = false;
    const onEvents = (evs, st) => {
      for (const ev of evs) if (ev.type === 'fire' || ev.type === 'melee') attacked = true;
      this.onLocalEvents(evs, st);
    };
    const ran = this.prediction.step(dt, buttons, inp.yaw, inp.pitch, onEvents, this.inputBuffer);
    if (ran > 0) inp.clearLatch();
    if (this.gun.commands(ran)) attacked = true; // the mounted gun is fired by the same commands, outside the simulation
    // a packet carries one render time, the one of the frame it leaves in, and the server rewinds its targets to
    // that for every command in the packet: a shot or a swing goes out in its own frame instead of waiting for
    // the batch to fill, or it would be judged against where things stood a frame or two after it was aimed
    this.sendCommands(dt, attacked);
    this.sendCrafts(dt);
    // interpolation clock: corrections are eased in (a step in the clock is a step in every remote entity),
    // and the render delay widens a little when snapshots arrive unevenly so entities don't stall and lurch
    const adj = this.clockAdj * Math.min(1, dt * 6);
    this.clockAdj -= adj;
    this.clientTick += dt * SERVER_TICK_RATE + adj;
    const extra = Math.min(1.5, Math.max(0, 2.5 * Math.sqrt(this.jitter2) - 0.6));
    this.interpExtra += Math.max(-dt * 0.5, Math.min(dt * 0.5, extra - this.interpExtra));
    this.renderTick = this.clientTick - INTERP_DELAY * SERVER_TICK_RATE - this.interpExtra;
    this.fair.update(dt, time); // (the ride clock of this frame: riders, ourselves included, are placed by it)
    this.handcar.update(dt); // (where each handcar is drawn this frame: their riders are placed on them)

    // camera
    this.prediction.renderPos(dt, this.renderPos);
    const rp = this.renderPos;
    this.fair.carry(rp);
    this.vehicles.update(dt, rp); // (each vehicle where it is drawn this frame; in one, the eye is its seat's)
    const inVeh = this.vehicles.eye.on;
    const targetEye = eyeHeight(s);
    this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * (s.downed ? 5 : 12));
    const hspeed = Math.hypot(s.vx, s.vz);
    // afloat (shared/swim.js): the hands are swimming, the view rides the water, the stride is a stroke
    const swim = !!self.alive && swimming(this.world, s);
    this.swimK += ((swim ? 1 : 0) - this.swimK) * Math.min(1, dt * 3);
    if (swim !== this.swimming) this.onSwim(swim);
    if (s.onGround && hspeed > 0.5 && !s.drive) this.camBob += dt * hspeed * (s.downed ? 3.2 : swim ? 1.3 : 1.9);
    // Every landing dips the view, by how hard it was: with the square of the fall speed (so with the height
    // fallen) from 4 cm after a jump up to the 12 cm of a hard landing, the one the simulation calls `land`
    // (9 m/s and up), which is this same dip and not another on top. "Weapon look sway" off is the one way a
    // player has to ask for less motion, so then only that hard landing dips, as it always has.
    if (!self.alive) this.fallV = 0;
    else if (!s.onGround) this.fallV = -s.vy;
    else {
      if (this.fallV > 9 || (this.fallV > 0 && this.settings.weaponSway !== false)) this.landVel += 0.12 * Math.min(1, (this.fallV / 9) ** 2) * LAND_SPRING * Math.E;
      this.fallV = 0;
    }
    // (a critically damped spring, solved exactly: a kick of d * LAND_SPRING * e bottoms out d below, 1 / LAND_SPRING s later)
    const landA = (this.landVel + LAND_SPRING * this.landDip) * dt;
    const landE = Math.exp(-LAND_SPRING * dt);
    this.landDip = Math.min(0.12, (this.landDip + landA) * landE); // two touchdowns in a row (a correction) don't add up
    this.landVel = (this.landVel - LAND_SPRING * landA) * landE;
    // a step up or down reaches the eye over ~100 ms (Prediction.viewLag), with the eye kept 0.3 m clear of the floor
    const stepLag = this.prediction.viewLag(dt, this.eyeH - 0.3);
    // a heavy footfall drops the view and rattles it, then dies away in ~0.4 s however faint it was: far off it is a
    // tremor that lasts as long as the jolt of one landing beside you
    this.quake *= Math.exp(-dt * 6);
    // Settings > Accessibility: camera shake (x the shake and the quake's drop, 0 holds the view still) and view bob
    const shakeK = this.settings.cameraShake ?? 1;
    const bobK = this.settings.viewBob === false ? 0 : 1;
    const bobY = (Math.sin(this.camBob * 2) * (s.downed ? 0.06 : 0.035) * Math.min(1, hspeed / 5) + this.swimK * (Math.sin(time * 1.7) * 0.035 + Math.sin(time * 0.63) * 0.02)) * bobK - this.landDip - stepLag - this.quake * 0.03 * shakeK;
    // the gun's climb and the last round's punch (aimview.js): the view is lifted by both, so the sights or the
    // crosshair are where the next round goes
    const gdef = self.alive && !s.zombie && !this.gun.manning ? WEAPONS[currentWeapon(s)] : null;
    this.viewClimb = stepClimb(this.viewClimb, gdef && !gdef.melee ? shotClimb(s, gdef, aimingWith(s, buttons)) : 0, dt);
    this.punchT += dt;
    const viewKick = this.viewClimb + this.punch * punchAt(this.punchT / this.punchLen);
    this.camShake = Math.max(0, (this.camShake || 0) - dt * 2.5);
    const shake = (this.camShake * 0.02 + this.effects.shake * 0.03 + this.quake * 0.02) * shakeK;
    const cam = this.camera;
    if (cine) {
      cine.update(dt, cam); // (a cutscene: the shot's camera, and its own field of view)
      cam.position.y += (Math.random() - 0.5) * shake;
    } else if (this.debugCam) {
      const d = this.debugCam;
      cam.position.set(d.x, d.y, d.z);
      cam.rotation.set(d.pitch, d.yaw, 0);
    } else if (self.alive) {
      if (inVeh) cam.position.set(this.vehicles.eye.x, this.vehicles.eye.y - this.quake * 0.03 * shakeK, this.vehicles.eye.z); // (carried: the seat's eye)
      else cam.position.set(rp.x, rp.y + this.eyeH + bobY, rp.z);
      const roll = (inVeh ? this.vehicles.eye.roll : 0) + (s.downed ? 0.18 + Math.sin(time * 1.3) * 0.03 : 0) + this.swimK * Math.sin(time * 1.1) * 0.025 * bobK;
      cam.rotation.set(inp.pitch + viewKick + (Math.random() - 0.5) * shake, inp.yaw + (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.5 + roll);
      // nunchucks: the view goes with the strikes - a sprung nod, turn and roll from the moves and from what they hit
      // (ViewModel's rig, as of last frame). "Weapon look sway" off leaves the view still
      const nk = this.vm.itemId === ITEM.NUNCHAKU && this.settings.weaponSway !== false ? this.vm.nk?.core : null;
      if (nk) {
        cam.rotation.x += nk.kick.x;
        cam.rotation.y += nk.kick.y;
        cam.rotation.z += nk.kick.z;
      }
    } else {
      // death cam: slumped on the ground looking up
      cam.position.set(rp.x, rp.y + 0.35, rp.z);
      cam.rotation.set(0.9, inp.yaw, 0.4);
    }
    // ADS zoom
    const wdef = WEAPONS[currentWeapon(s)];
    const aiming = self.alive && !!(buttons & 256) && wdef && !wdef.melee && s.reloadT <= 0 && !this.handcar.handsOn && !this.vehicles.handsOn && !swim && !s.pet; // (hands on a handcar's lever or a vehicle's controls, swimming, or the cat in our arms: no sights)
    const baseFov = (this.debugCam && this.debugCam.fov) || this.settings.fov || 75; // (a debug camera may bring its own lens)
    const targetFov = aiming ? baseFov * (currentWeapon(s) === ITEM.HUNTING_RIFLE ? 0.45 : currentWeapon(s) === ITEM.AT_RIFLE ? 0.6 : 0.78) : s.sprinting ? baseFov * 1.06 : baseFov;
    this.fovCur += (targetFov - this.fovCur) * Math.min(1, dt * 12);
    if (!cine && Math.abs(cam.fov - this.fovCur) > 0.01) {
      cam.fov = this.fovCur;
      cam.updateProjectionMatrix();
    }
    // the anti-tank rifle's round going home, partway through its long reload
    if (currentWeapon(s) === ITEM.AT_RIFLE && s.reloadT > 0) {
      const reload = wdef.reload * perkMods(s.perks).reload;
      if (!this.atRoundIn && reload - s.reloadT >= reload * AT_ROUND_IN) {
        this.atRoundIn = true;
        this.audio.playLocal('at_round');
      }
    } else this.atRoundIn = false;
    // look sensitivity follows the zoom as it eases in and out (see AIM_SENS), so the turn rate never steps mid-turn.
    // The sprint fov is wider than the hip one and must not speed the turn up; settled at the hip it is the setting alone
    this.aimT += ((aiming ? 1 : 0) - this.aimT) * Math.min(1, dt * 12);
    if (!aiming && this.aimT < 0.001) this.aimT = 0;
    const zoom = this.aimT > 0 ? Math.min(1, Math.tan((this.fovCur * Math.PI) / 360) / Math.tan((baseFov * Math.PI) / 360)) : 1;
    inp.sensitivity = (this.settings.sensitivity || 1) * zoom * (1 + (AIM_SENS * (this.settings.aimSensitivity || 1) - 1) * this.aimT);

    // viewmodel
    const weaponNow = s.zombie ? -2 : self.alive ? currentWeapon(s) : 0;
    if (weaponNow !== this.vmItem) {
      this.vmItem = weaponNow;
      this.input.clearToggle('aim'); // (an aim on toggle is let go with the weapon it was on)
      if (weaponNow === -2) this.vm.setItem(0, { claws: true });
      else this.vm.setItem(s.slot === SLOT_BUILD && !weaponNow ? 0 : weaponNow, { tuck: self.alive }); // (tuck: nunchucks are folded away first)
    }
    const stroking = this.cat.holding && !!(buttons & BTN.ATTACK) && !this.ui.inventoryOpen && !this.ui.mapOpen; // (the cat in our arms, the fire button held)
    this.cat.update(dt, stroking);
    const [ldx, ldy] = inp.consumeLook();
    this.vm.setVisible(self.alive && !cine && !this.ui.inventoryOpen && !this.ui.mapOpen && !this.ui.boardOpen && !this.ui.bestiaryOpen && !this.ui.cardsOpen && !this.debugCam && !this.gun.manning && !s.hmg && !this.handcar.handsOn && !this.vehicles.handsOn && !swim);
    const lk = this.settings.weaponSway === false ? 0 : 0.0022 * inp.sensitivity;
    const wallDist = self.alive ? this.weaponClearance(cam) : 99; // (the viewmodel tucks back off a wall in front)
    const vmState = { speed: hspeed, sprint: !!s.sprinting, onGround: !!s.onGround, crouch: !!s.crouch, aiming, lookDX: ldx * lk, lookDY: ldy * lk, time, loaded: s.mags[0] > 0, talk: this.radio.keyed, wallDist, pinned: !!s.pinned && !!self.alive, ears: s.ears > 0 && !!self.alive, shove: s.shove, pet: stroking };
    const vmCam = this.renderer.vmCamera;
    if (Math.abs(vmCam.fov - this.vm.fov) > 0.01) {
      vmCam.fov = this.vm.fov; // (as of last frame: the aimed view of iron sights is narrowed onto them, cfg.adsFov)
      vmCam.updateProjectionMatrix();
    }
    if (this.vm.itemId === ITEM.NUNCHAKU) {
      // (asked of the view itself: for a moment after another weapon is asked for they are still in the hands, being
      // folded away)
      // nunchucks: their chain hangs in the world, not in the view - it needs which way the eye looks and how the
      // eye is being carried (so it swings as the view turns and trails as the body starts and stops); and the
      // heavy attack's wind-up clock, straight from the predicted state
      const k = dt > 0 ? 1 / dt : 0;
      _nkAcc.set((s.vx - this.nkVx) * k, 0, (s.vz - this.nkVz) * k).applyQuaternion(_nkQ.copy(cam.quaternion).invert());
      this.nkVx = s.vx;
      this.nkVz = s.vz;
      vmState.camQ = cam.quaternion;
      vmState.acc = _nkAcc;
      vmState.nkWind = weaponNow === ITEM.NUNCHAKU ? s.reloadT : 0;
      // (the reload key has nothing to reload: it asks for the flourish)
      if (weaponNow === ITEM.NUNCHAKU && buttons & BTN.RELOAD && !(this.nkBtn & BTN.RELOAD) && self.alive) {
        if (this.vm.nkFlourish()) this.selfBody?.nkFlourish();
      }
      this.nkBtn = buttons;
    }
    // (forcing a car's boot: the weapon in the hand is the lever)
    const prying = self.holdKind === HOLD.SEARCH && this.entities.ents.get(this.holding);
    vmState.pry = !!(prying && this.bootOf(prying)?.shut && pryWeapon(weaponNow));
    this.vm.update(dt, vmState);
    // a crawler on our face: the animal itself over our eyes, its belly to them (built the first time one lands)
    const latched = vmState.pinned && !s.zombie && !cine && !this.debugCam && !!this.latchedBy();
    if (latched && !this.faceLatch) this.faceLatch = new FaceLatch(this.renderer.vmScene);
    this.faceLatch?.update(dt, latched, s.shove, time);
    if (this.vm.itemId === ITEM.NUNCHAKU && this.vm.nk) nkSounds(this.audio, this.vm.nk.core, null, this.nkSt, time);
    this.updateSelfBody(dt, s, rp, time, hspeed);
    if (this.vmMuzzleT > 0) {
      this.vmMuzzleT -= dt;
      if (this.vmMuzzleT <= 0) this.renderer.vmMuzzle.intensity = 0;
    }
    // a flamethrower's roar stops a moment after its last puff; its light dies down with the fire it left
    this.flameLights.length = 0;
    for (const [id, f] of this.flames) {
      const L = f.light;
      if (f.t > 0) {
        L.intensity += (f.glow - L.intensity) * Math.min(1, dt * 18);
        if ((f.t -= dt) <= 0) {
          f.loop?.stop();
          f.loop = undefined;
        }
      } else if ((L.intensity -= dt * 3.5) <= 0) {
        this.flames.delete(id);
        continue;
      }
      const m = Math.min(1, dt * 14); // (it follows the aim, not jumping puff to puff)
      L.x += (f.at.x - L.x) * m;
      L.y += (f.at.y - L.y) * m;
      L.z += (f.at.z - L.z) * m;
      this.flameLights.push(L);
    }

    // local footsteps (afloat: strokes, and a slow paddle treading water)
    if (self.alive && s.onGround && hspeed > 1 && !s.drive) {
      this.stepAcc += hspeed * dt;
      const stride = swim ? (s.sprinting ? 2.4 : 1.9) : s.sprinting ? 2.6 : s.crouch ? 1.4 : 2.1;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.audio.footstep(swim ? 'water' : this.surfaceAt(rp.x, rp.y, rp.z), undefined, undefined, undefined, swim ? (s.sprinting ? 0.7 : 0.45) : s.crouch ? 0.25 : s.sprinting ? 0.8 : 0.5, { crouch: !!s.crouch, run: !!s.sprinting });
        if (swim) this.effects.splash(rp.x - Math.sin(inp.yaw) * 0.7, WATER_LEVEL, rp.z - Math.cos(inp.yaw) * 0.7, s.sprinting ? 0.18 : 0.1);
      }
    } else if (swim && (this.treadT -= dt) <= 0) {
      this.treadT = 1.6 + Math.random() * 0.8;
      this.audio.footstep('water', undefined, undefined, undefined, 0.2, { crouch: true });
    }
    if (swim && s.stamina < 30 && !this.swimTired) {
      this.swimTired = true;
      this.ui.notify(s.stamina > 0 ? 'Tiring in the water: get your feet on the bottom before you run out of stamina.' : 'Drowning! Get to shallow water.', 'toast', 5);
    }

    // flashlight: local prediction, server authoritative after a moment
    if (this.localFlashT > 0) this.localFlashT -= dt;
    else this.localFlash = !!self.flashlight;

    // entities
    this.entities.update(dt, this.renderTick, time, cine ? cam.position : rp);
    if (cine) this.entities.hidePlayers(); // (they are in the car, or the plane: the cutscene draws them there)
    this.live?.update(dt, this.global, !!cine);
    this.rockets.update(dt);
    this.skyflares.update(dt, cam); // (after the entities: their fires are gathered; before the environment and the lights)
    this.gun.update(dt, ldx * lk, ldy * lk);

    // interaction target
    this.updateLookTarget();
    this.highlight.update(dt);
    this.updateBuildGhost(s);

    // discovery of places
    this.discoverT -= dt;
    // (a drift of the mine runs under places it does not come up in)
    if (this.discoverT <= 0 && self.alive && !cine && !s.zombie && !this.world.mine?.under(rp.x, rp.y + 0.3, rp.z)) {
      this.discoverT = 0.5;
      for (const z of this.world.zones) {
        if (this.discovered.has(z.id)) continue;
        if (Math.hypot(rp.x - z.x, rp.z - z.z) < z.flat + 6) {
          this.discovered.add(z.id);
          this.ui.notify(`Discovered · ${ZONE_NAMES[z.id]}`, 'toast', 3.5);
        }
      }
    }
    // the waypoint has done its job once you are there
    const wp = this.waypoint;
    if (wp && self.alive && !s.zombie) {
      const d = Math.hypot(rp.x - wp.x, rp.z - wp.z);
      if (d > wp.r + 2) wp.away = true; // (set where you already stand, it waits until you have left and come back)
      else if (wp.away && d < wp.r) {
        this.waypoint = null;
        this.shareWaypoint();
        // a place seen for the first time has just said so itself ("Discovered")
        if (wp.visited) this.ui.notify(wp.zone >= 0 ? `Arrived · ${ZONE_NAMES[wp.zone]}` : 'Waypoint reached', 'toast', 2.5);
      }
    }
    this.pings = this.pings.filter((p) => time - p.t < PING_LIFE);

    // environment
    const g = this.global;
    const cycle = this.debugCycle ?? cine?.cycle ?? Environment.cycleFor(g.phase, g.timeLeft, g.day, g.phaseLen);
    if (!g.finale) this.global.timeLeft = Math.max(0, g.timeLeft - dt);
    else if (!g.escapeStalled) this.global.escapeT = Math.max(0, g.escapeT - dt); // a stalled warm-up stands still
    const weather = this.weather.update(dt, g, time, cam.position);
    if (weather.kind !== this.weatherKind) {
      this.weatherKind = weather.kind;
      const say = WEATHER_TOAST[weather.kind];
      if (say && time - (this.weatherToastT ?? -1e9) > 45 && self.alive) {
        this.weatherToastT = time;
        this.ui.notify(say, 'toast', 3.5);
      }
    }
    // how far down the mine the eye is, 0 in daylight .. 1 a dozen metres down a drift: the sky's light goes out
    // with it (Environment), and so do the rain and the wind (below)
    const mine = this.world.mine;
    const deep = mine && mine.under(rp.x, rp.y + 0.3, rp.z) ? Math.min(1, Math.max(0, (mine.depth(rp.x, rp.z) - 2) / 11)) : 0;
    // (the same in a boarded-up ward of the clinic, as far as it is dark where the eye is: world.darkAt)
    const dark = Math.max(deep, this.world.darkAt(rp.x, rp.y + 1, rp.z));
    this.under += (dark - this.under) * Math.min(1, dt * 4);
    if (this.under < 0.002) this.under = 0;
    // (the mainland's passage was kept lit to the end - its lamps every few metres: down it a little of the light stays,
    // so its timbers, rails and tubs read; the island's mine is as dark as it was)
    this._envOver.under = this.world.size > 1000 && deep > 0 ? this.under * 0.8 : this.under;
    // in a smoker's cloud the haze closes in round the eye (shared/smoke.js): it thickens over a second, and clears a
    // little slower once the cloud is gone or the eye is out of it
    const smoke = cine ? 0 : smokeCover(cam.position.x, cam.position.y, cam.position.z, this.entities.smokes);
    this.smoke += (smoke - this.smoke) * Math.min(1, dt * (smoke > this.smoke ? 2.5 : 1.2));
    if (this.smoke < 0.002) this.smoke = 0;
    this._envOver.smoke = this.smoke;
    this._envOver.moon = this.debugMoon ?? (cine ? 0 : g.moon || 0); // tonight's moon (MOON), from the dusk horn to dawn
    this._envOver.fogMul = this.debugFog ?? (cine ? cine.fogMul : 0); // (a cutscene's long shots see further than the day's haze lets a survivor; debugFog: a look-dev camera's)
    this.env.update(dt, cycle, cam.position, time, weather, this._envOver);
    this.viewDist = Math.max(cine ? cine.far : 0, this.env.fogVisibility + 40); // how far anything is drawn: past it the haze has it
    this.staticWorld.update(cam.position, this.viewDist);
    this.terrain?.userData.update?.(cam.position, this.viewDist);
    this.bridge?.update(cam.position, this.viewDist);
    this.foliage.update(cam.position, this.env.fogVisibility, time, weather, cam);
    if (this.water) {
      const u = this.water.material.uniforms;
      u.uTime.value = time;
      u.uSky.value.copy(this.env.cur.horizon);
      u.uSunDir.value.copy(this.env.sunHeight > -0.05 ? this.env.uniforms.uSunDir.value : this.env.uniforms.uMoonDir.value);
      u.uSunCol.value.copy(this.env.cur.dir);
      u.uCam.value.copy(cam.position);
    }
    const fires = this.entities.fireSources.concat(this.staticFires, this.fair.lights, this.flameLights);
    this.lights.update(dt, time, cam.position, this.localFlash && self.alive && !s.zombie, fires, this.entities.remoteFlash, Math.max(this.env.night, this.under));
    this.power.update(dt, time, cam.position, Math.max(this.env.night, this.under));
    this.entities.structs.update(); // (after everything that moves a structure this frame: a blow's shake, a generator's)
    // nearest big fire warms the viewmodel & the ambience
    let nearFire = 0;
    for (const f of fires) {
      if (!f.big || !(f.intensity > 0)) continue;
      nearFire = Math.max(nearFire, Math.max(0, 1 - Math.hypot(rp.x - f.x, rp.z - f.z) / 14) * f.intensity);
    }
    // viewmodel lighting follows the world
    this.updateViewmodelLight(dt, cam, Math.max(nearFire, this.power.eyeLit), this.flames.get(-1)?.light.intensity || 0); // (in a floodlight's cone the hands are lit too)
    // The flashlight's spill on the hands and the gun. At the hip it comes from beside the head; behind the sights that
    // would shine square on whatever faces the eye (a rear sight lit up like a wall, the front one lost beyond it),
    // so as the gun comes up the spill moves out to the torch's side and ahead of the rear sight: the notch stays a
    // dark edge and the front sight is lit
    const vf = this.renderer.vmFlash;
    vf.intensity = this.localFlash && self.alive ? 0.35 + 0.25 * this.aimT : 0;
    vf.position.set(-0.05 + 0.25 * this.aimT, 0.12 - 0.09 * this.aimT, 0.15 - 0.45 * this.aimT);

    this.effects.setAmbient(Math.max(this.env.night, this.under)); // (down the mine it is night at noon)
    this.effects.update(dt, cam, this.renderer.renderer.domElement.height);
    this.impacts.update(dt);
    this.flyover.update(dt, time, cam, this.env, weather);
    this.crows.update(time, this.crowSpots());
    this.graves.update(dt);
    const flashOn = this.localFlash && self.alive && !s.zombie;
    // (no rain or blown leaves once the eye is well down a drift: what falls in the mouth is kept out by its roof)
    const sky = this.under > 0.5 ? Object.assign(this._wxDown, weather, DOWN_WEATHER) : weather;
    this.atmosphere.update(dt, time, cam, this.env, flashOn, this.world.heightAt, sky);
    this.weatherFx.update(dt, time, cam, sky, this.env, flashOn, this.renderer.renderer.domElement.height);

    // audio
    const a = this.audio;
    if (cine) a.setListener(cam.position.x, cam.position.y, cam.position.z, cam.rotation.y, cam.rotation.x);
    else a.setListener(cam.position.x, cam.position.y, cam.position.z, inp.yaw, inp.pitch);
    let danger = 0;
    for (const e of this.entities.ents.values()) {
      if (e.kind !== ENT.ZOMBIE || e.dead) continue;
      const d = Math.hypot(e.rx - rp.x, e.rz - rp.z);
      if (d < 25) danger = Math.max(danger, 1 - d / 25);
    }
    this.danger = (this.danger || 0) + (danger - (this.danger || 0)) * Math.min(1, dt * 2);
    // each special's motif as it comes into view and again as it closes on any survivor (audio/motifs.js). Not for a
    // survivor who has risen as one of the dead, nor under a cutscene
    if (this.settings?.motifs !== false && !cine && !s.zombie && this.motifs.due(time)) {
      const zs = [];
      const surv = self.alive ? [{ x: rp.x, z: rp.z }] : [];
      for (const e of this.entities.ents.values()) {
        if (e.kind === ENT.ZOMBIE) {
          if (!e.dead && MOTIFS[e.ztype]) zs.push(e);
        } else if (e.kind === ENT.PLAYER && e.id !== this.myId && !(e.q[5] & (PFLAG.DEAD | PFLAG.ZOMBIE))) surv.push({ x: e.rx, z: e.rz });
      }
      const yaw = inp.yaw;
      this.motifs.update(time, zs, surv, (ztype, near, x, z) => {
        // panned toward it: the listener's right is (cos yaw, -sin yaw)
        const dx = x - cam.position.x;
        const dz = z - cam.position.z;
        const d = Math.hypot(dx, dz) || 1;
        a.motif?.(ztype, near, (0.6 * (dx * Math.cos(yaw) - dz * Math.sin(yaw))) / d);
      });
    }
    const hpFrac = self.maxHp ? self.hp / self.maxHp : 1;
    a.setAmbience({
      night: this.env.night,
      horde: (g.phase === PHASE.NIGHT && g.hordeLeft > 0) || g.finale,
      boss: !!g.bossId,
      danger: this.danger,
      lowHealth: self.alive && !self.zombie ? (s.downed ? 1 : Math.max(0, 1 - hpFrac / 0.35)) : 0,
      nearFire,
      rain: weather.rain,
      wind: weather.wind,
      underCover: weather.cover,
      dead: !self.alive,
      menu: false,
      nightPhase: g.phase === PHASE.NIGHT,
      cycle: this.env.cycle,
      open: this.openness,
      indoor: Math.max(this.indoor, this.under),
      home: this.homeSense.home,
      homeless: g.phase === PHASE.NIGHT && this.homeless(g.day),
    });

    // overlays by phase
    this.updateOverlays();
    this.radio.update(s);
    this.cards.update(dt); // (Dead Hand: the practice table's clock and the computer's moves, the screen shut on a fall)
    // the drop key held long enough (and still able to: alive, on their feet, the controls live, the same weapon out),
    // and the ring every held key shows
    const canDrop = !!self.alive && !s.zombie && !s.downed && this.input.enabled;
    const dropped = this.dropHold.update(dt, s.slot, canDrop) === 'drop';
    if (dropped && s.weapons[s.slot] && s.slot !== SLOT_THROW) this.conn.action(ACT.DROP_WEAPON, s.slot);
    if (this.holdRing.key === 'drop') {
      if (dropped) this.holdRing.end();
      else if (!this.dropHold.holding) this.cancelHoldRing();
      else this.holdRing.local(this.dropHold.progress);
    }
    this.updateHoldRing(dt);
    // HUD
    this.updateHud(dt, s, aiming, wdef);
    this.onboarding.update(dt);
    this.keyHints.update(dt);
    if (this.faceCar > 0) this.turnToCar(dt);
    if (this.ui.mapOpen) this.updateMap(s);
    // the leaderboard is asked for while it is up: as it opens, then every few seconds (it moves as people play)
    if (this.ui.boardOpen && performance.now() >= this.boardT) {
      this.boardT = performance.now() + BOARD_EVERY;
      this.conn.board();
    }
    // voice: how loud everyone is talking, for their mouths (entities.js), and the talking indicators
    this.voice.sampleMouths(performance.now());
    if (this.frame % 6 === 0) {
      const talking = this.voice.poll();
      const key = talking.map((id) => (this.voice.overRadio(id) ? 'r' : '') + id).join();
      if (key !== this.talkKey) {
        this.talkKey = key;
        this.talkPeers = talking;
        this.ui.setVoiceState({ enabled: this.voice.enabled, transmitting: this.voice.transmitting, speakers: this.speakers() });
      }
    }
    // post
    this.damageFx = Math.max(0, this.damageFx - dt * 1.5);
    const lowHealth = self.alive && !self.zombie ? (s.downed ? 1 : Math.max(0, 1 - hpFrac / 0.3)) : 0;
    this.post = {
      time,
      night: this.env.night,
      damage: this.damageFx,
      lowHealth,
      infected: self.zombie ? 1 : 0,
      dead: self.alive ? (s.downed ? 0.35 : 0) : 1,
      exposure: this.env.exposure * (self.zombie ? 1.6 : 1),
      rays: this.env.rays,
      beam: this.beamState(),
      adaptRef: self.alive ? this.env.adaptRef : 0,
      dt,
    };
  }
}

installParts(Game);

export { MAX_PLAYERS, DUSK_WARNING, AMMO_NAMES, ZTYPE, dqpos };
