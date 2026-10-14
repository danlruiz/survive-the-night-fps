// Game: being in a game - joining it, the snapshots and the clock they keep, the commands sent up, a drop, a deploy, leaving,
// and the personal record of the run.
import { PHASE, SERVER_TICK_RATE, INTERP_DELAY } from '../../../shared/constants.js';
import { ZONE } from '../../../shared/defs.js';
import { LEFT_CODE, MOVED_CODE, SNAP } from '../../../shared/protocol.js';
import { WORLD, MAINLAND_START } from '../../../shared/acts.js';
import { chosenCharacter } from '../../ui/picker.js';
import { lookKey } from '../../../shared/appearance.js';
import { nearestRoster } from '../../render/models/looks.js';
import { readHeader, readGlobal, readSelf, readEntities, readEvents } from '../../net/decode.js';
import { playerId } from '../../net/identity.js';
import { accountState } from '../../net/account.js';
import { joinedGame } from '../../net/achievements.js';
import { joinedBestiary } from '../../net/bestiary.js';
import { warmSurvivor } from '../../render/models/characters.js';
import { recordRun } from '../../ui/records.js';
import { finishOnboarding } from '../../ui/firstrun.js';

const MOVING_NOTE_MS = 400; // a deploy that takes longer than this to bring us back says so (onMoving)
const RUN_JOIN_GRACE = 60; // seconds into day one by which a player must have joined for the run to go on their record

export const methods = {
  // The click on Join is the user's gesture the browser wants before it gives the page the mouse and fullscreen, and
  // it no longer counts once the game is joined (the socket, the valley built: a second or more): Firefox and Safari
  // only take a request made while the click is handled, Chrome one within 5 s of it. So both are asked for on the
  // click itself (main.js onJoin), join() asks again for any not given, and a join that fails gives them back.
  holdForJoin() {
    this.joinHold = true;
    this.input.requestLock();
  },

  dropJoinHold() {
    if (!this.joinHold) return;
    this.joinHold = false;
    this.input.exitLock();
    this.keyGuard.release();
  },

  // code: the game to join (an invite, a pick from the list, one just made); none for a quick join. resume: back into
  // the game we were playing a moment ago on the server before a deploy (onMoving): the same run on the same valley,
  // so what this client knows of it - the places found, its waypoint, the run being recorded - stays, and there is no
  // stinger or introduction. back: coming back into the game this page was just in, after a drop or a deploy
  // (Connection.url): our own body, not a new player beside it
  async join(name, code = '', { resume = false, back = resume } = {}) {
    if (!resume) this.audio.stinger?.('join');
    // who to be (the splash's picker): a roster survivor, or a custom one - its models built now, under the load, and
    // the roster survivor most like it sent beside it (who an older server makes us)
    const pick = chosenCharacter();
    if (pick.look) warmSurvivor(lookKey(pick.look));
    this.looks = new Map();
    const info = await this.conn.connect(name, playerId(), code, pick.look ? nearestRoster(pick.look) : pick.character, pick.look, back);
    this.room = info.room; // { code, name, inviteOnly }: what the invite link points at
    this.myId = info.id;
    this.admin = info.admin;
    this.voice.setMyId(info.id);
    this.ensureViewModel();
    this.loadWorld(info.seed, info.act);
    this.entities.clear();
    this.rockets.clear();
    this.skyflares.clear();
    this.clientTick = info.tick;
    this.clockInit = false;
    this.interpExtra = 0;
    this.introPending = !resume; // until NEW_GAME introduces the run this join started, or lateJoinIntro one already under way
    if (!resume) {
      this.runOn = false;
      this.sawRunEnd = false;
      this.run = this.runReport = null;
      this.progress = null; // our XP (onProgress), once the server says
    }
    this.moving = false;
    this.ui.setConnectionStatus('');
    this.state = 'playing';
    this.joinHold = false; // (what it asked for is the game's now)
    this.input.enabled = true;
    this.inputBuffer.clear();
    this.input.requestLock();
    if (!resume) this.discovered = new Set([ZONE.CAMP, ZONE.BRIDGEHEAD]); // (where a run, and its second act, begin)
    this.stripped.clear(); // (the first snapshot says which are)
    this.regrowTrees(); // (and which trees are down: on a rejoin the valley is the one we left)
    if (!resume) this.waypoint = null;
    if (this.admin && !resume) this.ui.addChat('', 'Admin: the key under Esc ( ` ~ ) opens the spawn menu.', { system: true });
    joinedGame(!!accountState().user); // (a guest's achievements count the days played on here; an account's, the server)
    joinedBestiary(); // (whose bestiary this game keeps: its first EVT.BESTIARY says)
    return info;
  },

  // code: the socket's close code. why: what the splash says (none: a drop, which main.js goes straight back in from)
  onDisconnect(code = 0, why = '') {
    if (this.state !== 'playing') return;
    if (code === MOVED_CODE && this.room && this.onMove && !this.leaving) return this.onMoving();
    this.moving = false;
    this.ui.setConnectionStatus('');
    this.state = 'menu';
    this.perksUp = false; // (the panel itself may stay up over the splash: it is the splash's too)
    this.achUp = false;
    this.ui.pledge.set({ open: false }); // (the window was the game's: it is gone with it)
    this.ui.pledge.setOpen(false);
    this.pledgeShown = false;
    this.input.enabled = false;
    this.input.exitLock();
    this.keyGuard.release();
    this.entities.clear();
    this.rockets.clear();
    this.skyflares.clear();
    this.voice.closeAll();
    this.radio.reset();
    // the splash is see-through and the next join starts from this UI: take down whatever the game had up
    this.ui.setMapOpen(false);
    this.ui.setBoardOpen(false);
    this.ui.setBestiaryOpen(false);
    this.ui.setCardsOpen(false);
    this.cards.reset(); // (the asks, the match and the trade were that game's; the collection comes again on joining)
    this.ui.setBoard(null); // (what it showed was that server's, as of then)
    this.ui.setSpawnOpen(false);
    this.ui.setRosterOpen(false);
    this.ui.setInventoryOpen(false);
    this.ui.showPause(false); // ("Leave game" is pressed on it)
    this.ui.clearNotices();
    this.ui.hideOverlays();
    this.overlay = null;
    this.deathShown = false;
    this.ui.showSplash();
    // a player who pressed "Leave game" knows why they are back here: only a drop is an error - and the server holds
    // the place of a dropped player for a minute, so main.js goes straight back in (onDrop)
    const dropped = !this.leaving;
    this.leaving = false;
    if (why) this.ui.setJoinError(why);
    else if (dropped && this.room && this.onDrop) this.onDrop(this.room.code);
    else if (dropped) this.ui.setJoinError('Disconnected from server.');
  },

  // The server went down for a deploy and handed this game to the next one (MOVED_CODE, server/handoff.js), where our
  // body waits for us. The game stays on screen, still, with the pointer kept, while main.js joins the same code
  // there (moveBack: join with resume); only if that cannot be done does it end here as a drop does (onDisconnect).
  onMoving() {
    this.moving = true;
    this.input.enabled = false;
    this.inputBuffer.clear();
    this.voice.closeAll(); // (the peers find each other again through the next server)
    this.radio.reset();
    // (the move is usually done in well under a tenth of a second - the next server has the game ready, net/moveback.js:
    // the banner only comes up for one that takes long enough to be noticed, rather than flashing every deploy)
    clearTimeout(this.movingNote);
    this.movingNote = setTimeout(() => this.moving && this.ui.setConnectionStatus('Server updating - bringing you back'), MOVING_NOTE_MS);
    this.onMove(this.room.code);
  },

  // The page is about to be loaded again for a deploy's new client (main.js reloadInto), and Edge has crashed instead of
  // reloading a page still in the middle of a game. What the game holds of the browser - the mouse, fullscreen with the
  // keyboard locked, the microphone - is given back first, and the mouse and the screen are waited for (the browser
  // says when they are back, or a moment passes).
  async letGo() {
    this.input.enabled = false;
    this.input.handlers.onLockChange = null; // (the mouse let go is not Esc: no pause menu under the "Game updated" card)
    const back = (type, ms) => new Promise((done) => (document.addEventListener(type, done, { once: true }), setTimeout(done, ms)));
    const mouse = document.pointerLockElement ? back('pointerlockchange', 300) : null;
    this.input.exitLock();
    await mouse;
    const screen = document.fullscreenElement ? back('fullscreenchange', 600) : null;
    this.keyGuard.release(); // (the keyboard lock, and the fullscreen it took)
    await screen;
    this.voice.closeAll();
    this.voice.stopMic();
  },

  leave() {
    if (this.state !== 'playing') return;
    this.leaving = true;
    if (this.moving) return this.onDisconnect(); // (between two servers: nothing to close)
    this.conn.close(LEFT_CODE);
  },

  onSnapshot(r) {
    const flags = readHeader(r, this.net);
    const tick = this.net.tick;
    this.snapAt = performance.now(); // (when they stop coming the HUD says so: updateHud)
    const ack = this.net.ack;
    if (flags & SNAP.GLOBAL) this.global = readGlobal(r, this.global);
    const sync = readSelf(r, this.self, flags);
    readEntities(r, this.entities.store, tick, flags);
    // clock
    if (!this.clockInit) {
      this.clientTick = tick;
      this.clockAdj = 0;
      this.jitter2 = 0;
      this.lateRun = 0;
      this.latestTick = tick;
      this.clockInit = true;
    } else {
      const err = tick - (this.clientTick + this.clockAdj);
      // way off: resync. A single very late snapshot is not that - it's the head of a burst after a
      // server/network stall, and pulling the clock back for it would rewind every entity
      this.lateRun = err < -6 ? this.lateRun + 1 : 0;
      if (err > 6 || this.lateRun > 4) {
        this.clientTick = tick;
        this.clockAdj = 0;
        this.lateRun = 0;
      } else if (err >= -6) {
        this.clockAdj += err * 0.08;
        this.jitter2 += (Math.min(err * err, 9) - this.jitter2) * 0.02;
      }
      if (tick > this.latestTick || this.latestTick - tick > 1000) this.latestTick = tick;
    }
    // the server only sends our own state when the prediction has to be rebased on it
    if (sync) this.prediction.reconcile(ack, this.self);
    else this.prediction.confirm(ack);
    readEvents(r, this.eventHandler, flags, this.entities.ents);
    // (after the events: a join that starts the run gets NEW_GAME in this same snapshot, and that is its introduction)
    if (this.introPending && flags & SNAP.GLOBAL && (this.global.phase === PHASE.DAY || this.global.phase === PHASE.NIGHT)) this.lateJoinIntro();
    if (flags & SNAP.GLOBAL) this.trackRun();
  },

  // the commands the prediction has made go out (force: now, not batched up for later; frameDt: Prediction.takeOutbox)
  sendCommands(frameDt, force) {
    for (let out; (out = this.prediction.takeOutbox(frameDt, force)); ) {
      const rt = this.renderTick;
      const rti = Math.floor(rt);
      this.conn.sendInput(rti, rt - rti, out, this.prediction.hash(out));
    }
  },

  // The personal record (ui/records.js). A run goes on it when this player was in it from its first minute
  // and is still connected when it ends: joining later or leaving early records nothing. It follows the
  // replicated phase, not the NEW_GAME / VICTORY / GAME_OVER notifications: a client the server skips for a
  // tick loses that tick's events, while the global state always catches up.
  trackRun() {
    const g = this.global;
    // (the crossing between the acts is part of the run: it goes on over the bridge)
    if (g.phase === PHASE.DAY || g.phase === PHASE.NIGHT || g.phase === PHASE.CROSSING) {
      if (this.runOn) return;
      this.runOn = true;
      this.onboarding.reset(); // (a new player's walkthrough looks at this run from its start: onboarding.js)
      // how much of the run was played before we saw it: nothing when it starts under us. A run starts on day 1, on
      // the mainland's first day in a game made to start there, or on whatever day a restart at the bridge does
      // (we saw the try before it end)
      const first = g.day === 1 || this.sawRunEnd || (this.room?.startAct === WORLD.MAINLAND && g.day === MAINLAND_START.DAY);
      this.sawRunEnd = false;
      const gone = g.phase === PHASE.DAY && first ? g.phaseLen - g.timeLeft : Infinity;
      // kills0: our score when the run began. The server's count can carry over from the run before
      this.run = gone <= RUN_JOIN_GRACE ? { tick: this.net.tick - gone * SERVER_TICK_RATE, kills0: this.players.get(this.myId)?.kills ?? Infinity, day: g.day } : null;
    } else if (this.runOn) {
      this.runOn = false;
      const run = this.run;
      this.run = null;
      if (g.phase !== PHASE.VICTORY && g.phase !== PHASE.GAMEOVER) return;
      this.sawRunEnd = true;
      finishOnboarding(); // (a run played to its end: the walkthrough is not shown again, firstrun.js)
      if (!run) {
        this.runReport = { late: true };
        return;
      }
      // a run from the mainland's start or a restart at the bridge is not the whole run: its time and nights
      // would beat a whole one's, so it is not put on the record
      if (run.day !== 1) {
        this.runReport = { part: true };
        return;
      }
      this.runReport = recordRun({
        t: Date.now(),
        seed: this.seed,
        result: g.phase === PHASE.VICTORY ? 'escaped' : 'wiped',
        nights: g.day - 1, // night N closes day N: a run that ends on day N got through N - 1 of them
        secs: (this.net.tick - run.tick) / SERVER_TICK_RATE, // the server's tick clock, which the day and night run on: a stalled tab or a laggy link cannot bend it
        kills: (this.players.get(this.myId)?.kills ?? 0) - run.kills0,
        team: this.players.size,
      });
    }
  },

  // The interpolation clock, a frame on: corrections are eased in (a step in the clock is a step in every remote entity),
  // and the render delay widens a little when snapshots arrive unevenly so entities don't stall and lurch
  advanceClock(dt) {
    const adj = this.clockAdj * Math.min(1, dt * 6);
    this.clockAdj -= adj;
    this.clientTick += dt * SERVER_TICK_RATE + adj;
    const extra = Math.min(1.5, Math.max(0, 2.5 * Math.sqrt(this.jitter2) - 0.6));
    this.interpExtra += Math.max(-dt * 0.5, Math.min(dt * 0.5, extra - this.interpExtra));
    this.renderTick = this.clientTick - INTERP_DELAY * SERVER_TICK_RATE - this.interpExtra;
  },
};
