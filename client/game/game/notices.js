// Game: what the server's notifications (NOTIFY) say and do, and how a run is introduced: a new game, a late join, the
// first look at the car.
import { PHASE, DUSK_WARNING, DAWN_RETURN, MOON } from '../../../shared/constants.js';
import { ITEM, ITEM_DEFS, ZOMBIE_DEFS, SOUND, NOTIFY, CACHE_GAVE, ZONE, ZONE_NAMES } from '../../../shared/defs.js';
import { UNDO_NO } from '../../../shared/protocol.js';
import { WORLD, RUNWAY } from '../../../shared/acts.js';
import { SUPPLIES, SUPPLY_NEED, W } from '../act.js';
import { gridRef } from '../../ui/mapmarks.js';
import { nightTheme } from '../../../shared/nights.js';
import { needLines } from '../harvest.js';
import { bindTag } from '../binds.js';
import { mateDown } from '../matedown.js';
import { isFirstRun, yawTowards } from '../../ui/firstrun.js';
import { tonightBrief } from '../../ui/tonight.js';

// what the car's radio says once its battery is in (carRadio), word for word as the owner wrote it
const CAR_RADIO_LINE = 'if anyone can hear us, we are trying to go to the airfield, it’s our only way to escape this hell';
// ...in one of two voices (client/audio/radio/, samples.js REC), whose words begin this many seconds in
const CAR_RADIO_TAKES = ['vo_radio_am_michael', 'vo_radio_af_bella'];
const CAR_RADIO_WORDS = 1.6;
const FACE_CAR_NEAR = 80; // m: a first run's opening look turns to the car once we stand this near it (turnToCar)...
const FACE_CAR_WAIT = 10; // ...within this many seconds of the run's start, or not at all
// what the mainland's arrival says a wipe there costs: the run starts again at the bridgehead, never on the island
const BRIDGE_TEXT = 'If everyone falls here, the run starts again at the bridgehead.';

export const methods = {
  // the car's battery is in, and its radio comes on: static, then a voice (issue #269: from the first day, the run's
  // far goal is the airfield past the bridge). The voice is one of two takes, picked at random (CAR_RADIO_TAKES: their
  // static comes first, the words CAR_RADIO_WORDS s in); a take still loading is waited for a few seconds, and with
  // no take at all the radio's own static plays at the car. The words are on screen as they are spoken.
  carRadio() {
    const key = CAR_RADIO_TAKES[Math.floor(Math.random() * CAR_RADIO_TAKES.length)];
    const caption = () => {
      if (this.state !== 'playing') return;
      this.ui.notify('THE CAR RADIO CRACKLES', 'big', 9);
      this.ui.notify(`"${CAR_RADIO_LINE}"`, 'sub', 9);
    };
    let tries = 0;
    const play = () => {
      if (this.state !== 'playing') return;
      if (this.audio.playRecording?.(key)) return void setTimeout(caption, CAR_RADIO_WORDS * 1000);
      if (++tries < 16) return void setTimeout(play, 250);
      const car = this.world.car;
      if (car) this.audio.play(SOUND.RADIO_TUNE, { x: car.x, y: car.y + 1, z: car.z });
      setTimeout(caption, 1400);
    };
    play();
  },

  onNotify(msg, arg) {
    const ui = this.ui;
    const a = this.audio;
    if (this.fixtures.notify(msg, arg)) return;
    if (this.vehicles.notify(msg, arg)) return;
    if (this.fair.onNotify(msg, arg)) return;
    switch (msg) {
      case NOTIFY.NIGHT_FALLS: {
        // a themed night says so (the same theme the server drew: both work it out from the seed)
        const th = nightTheme(this.seed, arg, this.act);
        const moon = this.global.moon;
        if (moon === MOON.BLOOD) {
          // a blood moon leads: it is the thing about tonight (the theme still says what the horde is made of)
          ui.notify(`NIGHT ${arg}: BLOOD MOON`, 'big', 6);
          ui.notify('More of them than any night yet, and they will not let up. Hold together.', 'sub', 6);
          if (th) ui.notify(`${th.name}: ${th.warn}`, 'toast', 8);
        } else {
          ui.notify(th ? `NIGHT ${arg}: ${th.name.toUpperCase()}` : moon === MOON.CLEAR ? `NIGHT ${arg}: CLEAR MOON` : `NIGHT ${arg}`, 'big', th ? 6 : 4);
          ui.notify(th ? th.warn : moon === MOON.CLEAR ? 'A bright moon and a calmer night. Regroup and patch up.' : arg <= 1 ? 'The horde is coming to wherever you are. Hold your shelter.' : `Horde ${arg}: more of them than last night.`, 'sub', th ? 6 : 4);
          if (th && moon === MOON.CLEAR) ui.notify('A clear moon: a calmer night. Regroup and patch up.', 'toast', 6);
        }
        a.stinger?.('night');
        break;
      }
      case NOTIFY.WAVE:
        ui.notify(`WAVE ${arg}`, 'danger', 3);
        a.playLocal('notify');
        break;
      case NOTIFY.DAWN:
        ui.notify(`DAY ${arg}`, 'big', 4);
        ui.notify('You made it. The sun burns the horde - go find those supplies.', 'sub', 4);
        a.stinger?.('dawn');
        break;
      case NOTIFY.HORDE_SOON:
        // one line. What tonight brings (its theme, the new kind, its boss) is on the card under the clock from now to
        // dark (tonight.js Tonight, from Game.tonight), and the objective says where to board up
        // ...unless tonight is a blood moon: that is said out loud (and the sky turns red as the sun goes)
        if (this.global.moon === MOON.BLOOD) {
          ui.notify('A BLOOD MOON IS RISING', 'big', 6);
          ui.notify('Tonight will hurt: more of them, and no let-up. Dig in.', 'sub', 6);
          a.stinger?.('boss');
        } else ui.notify('THE HORDE IS COMING', 'danger', 5);
        break;
      case NOTIFY.BOSS: {
        const zd = ZOMBIE_DEFS[arg];
        ui.notify(zd ? (zd.boss ? '' : 'A ') + zd.name.toUpperCase() : 'SOMETHING', 'big', 4);
        ui.notify('has risen from the woods.', 'sub', 4);
        if (zd?.tip) ui.notify(zd.tip, 'toast', 7);
        // (the final stand's boss never sees a sunrise: the clock is stopped)
        if (!this.global.finale) ui.notify('Bring it down before sunrise and what it carries is yours. The sun leaves nothing.', 'toast', 7);
        a.stinger?.('boss');
        break;
      }
      case NOTIFY.SHADE:
        ui.notify('A SHADE IS OUT THERE', 'danger', 4);
        ui.notify('It only moves in the dark. Keep a light on it: flashlight, torch, campfire or flare.', 'toast', 7);
        a.playLocal('notify');
        break;
      case NOTIFY.SUPPLY_DROP:
        ui.notify('A supply plane is inbound - follow its smoke trail to the drop.', 'toast', 6);
        a.stinger?.('supply');
        break;
      case NOTIFY.SUPPLY_HINT: {
        // (to a team that has found nothing yet) a voice on the walkie-talkie
        const zid = this.global.hints[arg];
        const sp = this.world.partSpots[this.global.spots[arg]];
        const item = ITEM_DEFS[SUPPLIES[Math.min(arg, 4)]];
        ui.notify(`RADIO: "...${item?.name || 'a supply'}, ${ZONE_NAMES[zid] || 'out there'}${sp ? ', grid ' + gridRef(this.world, sp.x, sp.z) : ''}. Look for the crows."`, 'toast', 9);
        a.playLocal('notify');
        break;
      }
      case NOTIFY.SCOUTED: {
        // a Scout has been near where a car supply is hidden (shared/roles.js): it is on everyone's compass now
        const item = ITEM_DEFS[SUPPLIES[Math.min(arg, 4)]];
        ui.notify(`Scout: ${item?.name || 'a supply'} hidden near here. It's on your compass.`, 'good', 5);
        a.playLocal('notify');
        break;
      }
      case NOTIFY.SUPPLY_FOUND:
        ui.notify(`${ITEM_DEFS[arg]?.name || 'A supply'} found! Bring it to the ${W.thing}.`, 'good', 5);
        a.stinger?.('car_part');
        break;
      case NOTIFY.CAR_PART:
        ui.notify(`${ITEM_DEFS[arg]?.name || 'Part'} installed in the ${W.thing}`, 'good', 4);
        a.playLocal('install_part');
        if (arg === ITEM.CAR_BATTERY && this.act !== WORLD.MAINLAND) this.carRadio();
        break;
      case NOTIFY.SUPPLIES_DONE:
        ui.notify(this.act === WORLD.MAINLAND ? 'THE PLANE IS FIXED' : 'EVERY SUPPLY IS IN', 'big', 5);
        if (this.act === WORLD.MAINLAND) ui.notify(`Hold ${bindTag('interact')} at the plane to start fuelling. Hold the fuel truck for ${RUNWAY.FUEL_TIME} seconds, then the plane for ${RUNWAY.WARM_TIME}, and keep the runway clear.`, 'sub', 9);
        else ui.notify(`Fortify the car. Hold ${bindTag('interact')} at the car to start the engine - it takes 90 seconds to warm up.`, 'sub', 7);
        a.stinger?.('car_part');
        break;
      case NOTIFY.NEED_SUPPLIES:
        ui.notify(`${W.The} still needs ${W.supplies}`, 'warning', 2.5);
        break;
      case NOTIFY.CAR_ALARM:
        ui.notify('CAR ALARM!', 'danger', 4);
        ui.notify('The noise is drawing the dead. Move!', 'sub', 4);
        a.stinger?.('boss');
        break;
      case NOTIFY.HERD:
        ui.notify('THE HERD HAS SEEN YOU', 'danger', 4);
        ui.notify(`${arg} of them, all coming at a run. Sprint out of their sight or stand and fight.`, 'sub', 5);
        a.stinger?.('boss');
        break;
      case NOTIFY.ENGINE_START:
        ui.notify('THE FINAL STAND', 'big', 5);
        ui.notify(W.thing === 'plane' ? 'The pump is loud and the mainland heard it. Hold the fuel truck, then guard the plane.' : 'The engine is warming up. Every corpse in the valley heard it. Stay at the car: it stalls if nobody is there.', 'sub', 6);
        a.stinger?.('boss');
        break;
      case NOTIFY.ESCAPE_READY:
        ui.notify(W.getIn.toUpperCase(), 'big', 5);
        ui.notify(`Hold ${bindTag('interact')} at the ${W.thing} to ${W.go}. Whoever is not at the ${W.thing} is left behind.`, 'sub', 7);
        a.stinger?.('car_part');
        break;
      case NOTIFY.SCHEMATIC:
        ui.notify(`${ITEM_DEFS[arg]?.name || 'Schematic'} found - unlocked for the team`, 'good', 5);
        a.playLocal('craft');
        break;
      case NOTIFY.LOCKED:
        ui.notify(`Locked: find the ${ITEM_DEFS[arg]?.name || 'schematic'}`, 'warning', 3);
        a.playLocal('build_fail');
        break;
      case NOTIFY.DOWNED:
        if (arg === this.myId) {
          a.stinger?.('death');
        } else mateDown(this, arg);
        break;
      case NOTIFY.REVIVED:
        ui.notify(arg === this.myId ? "You're back on your feet." : `${this.name(arg)} is back up.`, 'good', 3);
        break;
      case NOTIFY.YOU_DIED:
        this.deathInfo = { killer: arg === 255 ? 'the wilderness' : arg === 254 ? 'an undead deer' : ZOMBIE_DEFS[arg]?.name || 'the dead', ztype: arg < 254 ? arg : -1, day: this.global.day, night: this.global.phase === PHASE.NIGHT, dawn: this.dawnAhead(), dawnIn: this.global.phase === PHASE.NIGHT ? this.global.timeLeft : 0 };
        ui.showDeath(this.deathInfo);
        a.stopRing?.(); // (the screecher's ringing, if it was still going: screech)
        a.stinger?.('death');
        this.deathShown = true;
        break;
      case NOTIFY.PLAYER_DIED:
        if (arg !== this.myId) ui.notify(`${this.name(arg)} has fallen... and will rise as one of them${this.dawnAhead() ? ' until dawn' : ''}.`, 'danger', 5);
        break;
      case NOTIFY.RETURNED:
        if (arg === this.myId) {
          // (the death card is still up if we died in the last seconds of the night)
          if (this.deathShown) ui.hideOverlays();
          this.deathShown = false;
          ui.notify('The sun burns it out of you: you are a survivor again.', 'good', 6);
          ui.notify('You wake with one pistol magazine and a bandage. Your old gear may still lie where you fell.', 'toast', 8);
        } else ui.notify(`${this.name(arg)} is back among the living.`, 'good', 5);
        break;
      case NOTIFY.VICTORY:
        a.stinger?.('victory');
        break;
      // the two acts (shared/acts.js)
      case NOTIFY.ARRIVED:
        ui.notify('THE MAINLAND', 'big', 6);
        ui.notify('The bridge is gone behind you. There is an airfield past the city: find the plane, find its parts, fly out.', 'sub', 9);
        if (arg) ui.notify(`${arg === 1 ? 'One of the dead is' : `${arg} of the dead are`} a survivor again: the crossing brought them back.`, 'good', 7);
        ui.notify(BRIDGE_TEXT, 'toast', 9);
        this.discovered = new Set([ZONE.BRIDGEHEAD]);
        break;
      case NOTIFY.CHECKPOINT: {
        // a wipe on the mainland: the run starts again at the bridge (arg: the day)
        this.deathShown = false;
        this.waypoint = null;
        this.pings = [];
        this.discovered = new Set([ZONE.BRIDGEHEAD]);
        ui.notify('BACK AT THE BRIDGEHEAD', 'big', 5);
        ui.notify('As you came off the bridge, with what you carried over it.', 'sub', 7);
        break;
      }
      case NOTIFY.CACHE: {
        const got = [arg & CACHE_GAVE.PISTOL && 'a pistol', arg & CACHE_GAVE.AMMO && 'ammunition', arg & CACHE_GAVE.BANDAGE && 'a bandage', arg & CACHE_GAVE.MELEE && 'a knife', arg & CACHE_GAVE.BUILD && 'a hammer'].filter(Boolean);
        if (got.length) ui.notify(`From the checkpoint's cache at the bridgehead: ${got.join(', ')}.`, 'toast', 8);
        break;
      }
      case NOTIFY.STAND_STAGE:
        ui.notify('THE TANKS ARE FULL', 'big', 4);
        ui.notify('The engines are turning over. Get to the plane and hold it.', 'sub', 6);
        a.stinger?.('car_part');
        break;
      case NOTIFY.RUNWAY_BLOCKED:
        ui.notify(`${arg} of the dead are on the runway. Clear it before you go.`, 'warning', 3);
        a.playLocal('build_fail');
        break;
      case NOTIFY.GAME_OVER:
        a.stinger?.('gameover');
        break;
      case NOTIFY.NEED_FIRE:
        ui.notify(`Needs a lit campfire nearby (build one ${bindTag('slot5')})`, 'warning', 2.5);
        a.playLocal('build_fail');
        break;
      case NOTIFY.NEED_BENCH:
        ui.notify(`Needs a workbench nearby (build one ${bindTag('slot5')})`, 'warning', 2.5);
        a.playLocal('build_fail');
        break;
      case NOTIFY.NEED_STATION:
        ui.notify('Requires a crafting station nearby', 'warning', 2.5);
        a.playLocal('build_fail');
        break;
      case NOTIFY.CANT_BUILD_HERE:
        ui.notify("Can't build there", 'warning', 2);
        a.playLocal('build_fail');
        break;
      case NOTIFY.DOOR_ONLY:
        ui.notify('Door boards go in a doorway', 'warning', 2);
        a.playLocal('build_fail');
        break;
      case NOTIFY.STRUCT_CAP:
        ui.notify(`Too many structures - demolish some ${bindTag('demolish')}`, 'warning', 2.5);
        break;
      case NOTIFY.NOT_ENOUGH: {
        // The server names one item (arg) or nothing at all. What is short, by how much and where it comes from is
        // worked out here: from that item, or from the cost of what was last asked for against what we carry.
        const need = arg ? needLines({ [arg]: 1 }, {}) : needLines(this.askedCost, this.invCounts());
        if (!need.length) ui.notify('Not enough materials', 'warning', 2.5);
        need.forEach((line, i) => ui.notify(line, i ? 'toast' : 'warning', 4.5));
        a.playLocal('build_fail');
        break;
      }
      case NOTIFY.SEARCH_EMPTY:
        ui.notify(arg === 1 ? 'This tree is stripped bare' : arg === 2 ? 'Nothing left to salvage' : arg === 3 ? 'Mined out' : 'Already searched', 'toast', 1.6);
        break;
      case NOTIFY.INVENTORY_FULL: {
        // arg: the item a full backpack left lying where the survivor walked over it (0: a craft, a search, a swap)
        const d = ITEM_DEFS[arg];
        if (d?.cat === 'part') {
          ui.notify(`Inventory full - ${d.name} left on the ground! Drop something to make room: right-click a stack in the backpack ${bindTag('inventory')}.`, 'danger', 6);
          a.playLocal('build_fail');
        } else if (d?.cat === 'ammo') ui.notify(`Can't carry more ${d.name}`, 'warning', 2);
        else ui.notify(d ? `Inventory full - no room for ${d.name}` : 'Inventory full', 'warning', 2);
        break;
      }
      case NOTIFY.POCKETS:
        ui.notify("Empty the backpack's extra pockets first", 'warning', 2.5);
        a.playLocal('build_fail');
        break;
      case NOTIFY.NEED_HAMMER:
        ui.notify(`Equip the hammer to repair ${bindTag('slot5')}`, 'warning', 2);
        a.playLocal('build_fail');
        break;
      case NOTIFY.UNDO_GONE:
        ui.notify(arg === UNDO_NO.LATE ? 'Too late to take it back: it is still on the ground' : arg === UNDO_NO.FAR ? 'Too far from it to take it back: it is still on the ground' : 'Somebody already picked it up', 'warning', 2.5);
        a.playLocal('build_fail');
        break;
      case NOTIFY.CAMPFIRE_LIT:
        ui.notify('The fire roars back to life.', 'good', 2);
        break;
      case NOTIFY.GEN_LOW:
        ui.notify('The generator is down to its last minute of fuel.', 'warning', 4);
        break;
      case NOTIFY.GEN_OUT:
        ui.notify('The generator has run dry. The floodlights are out.', 'danger', 5);
        break;
      case NOTIFY.NEW_GAME:
        ui.hideOverlays();
        if (this.overlay === 'gameover' || this.overlay === 'victory') this.pointerAfterEnd();
        this.overlay = null;
        this.deathShown = false;
        this.discovered = new Set([ZONE.CAMP]);
        this.stripped.clear();
        this.regrowTrees();
        this.pings = [];
        this.waypoint = null;
        this.flyover?.clear();
        this.graves?.reset();
        this.introPending = false;
        ui.notify(`DAY ${arg}`, 'big', 5);
        if (this.act === WORLD.MAINLAND) {
          // a game that starts on the mainland (map 2): at the bridgehead, with the gun crates (acts.js MAINLAND_START)
          this.discovered = new Set([ZONE.BRIDGEHEAD]);
          ui.notify('THE MAINLAND', 'big', 6);
          ui.notify('There is an airfield past the city: find the plane, find its parts, fly out. Break open the gun crates at the bridgehead first.', 'sub', 9);
          ui.notify(BRIDGE_TEXT, 'toast', 9);
          break;
        }
        ui.notify('Your car died on Route 9. Find the supplies to fix it - before the dark finds you.', 'sub', 6);
        // a new player's first run opens on the goal (#270): turned to face the car, and the walkthrough's first
        // card says what it needs (onboarding.js)
        if (isFirstRun()) this.faceCar = FACE_CAR_WAIT;
        break;
      case NOTIFY.PLAYER_JOINED:
      case NOTIFY.PLAYER_LEFT:
        break;
      case NOTIFY.GRAVES:
        ui.notify('THE GRAVES ARE STIRRING', 'danger', 5);
        ui.notify('Part of the horde is coming up out of St. Agnes Cemetery. Watch the ground behind you.', 'toast', 7);
        break;
    }
  },

  // a death now lasts until sunrise (DAWN_RETURN) - unless there is none to come: the final stand stops the clock,
  // and a wipe ends the run
  dawnAhead() {
    const g = this.global;
    return DAWN_RETURN && !g.finale && (g.phase === PHASE.DAY || g.phase === PHASE.NIGHT);
  },

  // The card under the clock from the dusk horn to nightfall (tonight.js Tonight): what the coming night brings, worked
  // out from the seed as the server does. The same object while it holds (the card rebuilds when the key changes);
  // null by night, before the horn and in the final stand
  tonight(g) {
    if (g.phase !== PHASE.DAY || g.finale || !g.day || g.timeLeft > DUSK_WARNING) return null;
    const key = `${this.seed}:${this.act}:${g.day}:${g.moon || 0}`;
    if (this._tonight?.key !== key) this._tonight = { key, rows: tonightBrief(this.seed, g.day, this.act, g.moon) };
    return this._tonight;
  },

  // Joined a run that is already under way. NEW_GAME, the card that says what the game is, went out before we were
  // here (and on a drop-in server that is how most first-time players arrive), so say it for the moment we arrive
  // in: the goal in one line, the day and phase, and how far the team has got.
  lateJoinIntro() {
    this.introPending = false;
    const g = this.global;
    const ui = this.ui;
    const night = g.phase === PHASE.NIGHT;
    let need = 0;
    let have = 0;
    SUPPLY_NEED.forEach((n, i) => {
      need += n;
      have += Math.min(n, g.supplies[i]);
    });
    ui.notify(g.finale ? 'THE FINAL STAND' : `${night ? 'NIGHT' : 'DAY'} ${g.day}`, 'big', 5);
    if (g.finale) {
      ui.notify('The car is fixed and the engine is warming up. Defend it, then get in.', 'sub', 6);
      ui.notify('You joined a run in progress: every supply is in. Your team is at the car.', 'toast', 8);
      return;
    }
    if (this.act === WORLD.MAINLAND) {
      ui.notify('The team crossed the bridge to the mainland. Find the parts of the plane, fix it, fly out.', 'sub', 6);
      ui.notify(g.suppliesDone ? 'You joined a run in progress: every part is in. Fuelling the plane is next.' : `You joined a run in progress, in its second act: ${have} of ${need} plane parts are in.`, 'toast', 8);
    } else {
      ui.notify('Your car died on Route 9. Find the supplies, fix it, drive out.', 'sub', 6);
      ui.notify(g.suppliesDone ? 'You joined a run in progress: every supply is in. Starting the engine is next.' : `You joined a run in progress: ${have} of ${need} car supplies are in.`, 'toast', 8);
    }
    let team = 'Your team is marked on the compass. Scavenge with them before dark.';
    if (night) team = 'Night: the horde is out. Find your team on the compass and hold out until dawn.';
    else if (g.suppliesDone) team = 'Your team is marked on the compass. Meet them at the car.';
    else if (g.timeLeft <= DUSK_WARNING) team = 'Night is seconds away. Find your team on the compass and board up with them.';
    ui.notify(team, 'toast', 8);
  },

  // The first look of a player's first run (#270): at the car they came in, once our own state is at the start beside
  // it. The look is ours to set: the server takes the yaw our commands send.
  turnToCar(dt) {
    this.faceCar -= dt;
    if (!this.prediction.hasServerState || !this.self.alive) return;
    const s = this.prediction.state;
    const car = this.world.car;
    if (Math.hypot(car.x - s.x, car.z - s.z) > FACE_CAR_NEAR) return;
    this.faceCar = 0;
    this.input.yaw = yawTowards(s.x, s.z, car.x, car.z);
    this.input.pitch = 0;
  },
};
