// Game: the screens that take the pointer (the kit screens, the player list, the leaderboard, the bestiary, the perks,
// the pledge, the achievements, the spawn menu, Dead Hand), the pause menu, and the run's end screens.
import { PHASE, ESCAPE_RADIUS } from '../../../shared/constants.js';
import { bindPair, bindLabel } from '../binds.js';
import { screenLeft } from '../../ui/screentabs.js';

const BOARD_EVERY = 4000; // ms between two requests for the leaderboard while it is open

export const methods = {
  // A screen that takes clicks is up (the inventory, the map, the leaderboard, the bestiary, Dead Hand, the spawn menu,
  // the pinned player list): the pointer is free for it, and the game's keys and buttons are off
  screenUp() {
    const ui = this.ui;
    return ui.inventoryOpen || ui.mapOpen || ui.boardOpen || ui.bestiaryOpen || ui.cardsOpen || ui.spawnOpen || ui.rosterPinned || ui.pledgeOpen || this.perksUp || this.achUp;
  },

  resumeFromPause() {
    this.ui.showPause(false);
    if (this.screenUp()) return; // (the map or the bestiary opened over the menu keeps the pointer)
    this.input.enabled = true;
    const lock = this.input.requestLock();
    lock?.then?.((ok) => {
      // Esc closes the menu, but browsers can refuse to re-lock immediately after Esc released it.
      if (ok !== false || this.state !== 'playing' || this.input.locked || this.screenUp() || this.ui.pauseOpen || this.ui.isTyping()) return;
      this.ui.notify('Click the game to resume looking around.', 'warning', 4);
    });
  },

  // relock: false when something else that needs the cursor is taking over (another of the kit screens' tabs)
  toggleInventory(open, relock = true) {
    const ui = this.ui;
    if (open === ui.inventoryOpen) return;
    if (ui.mapOpen) this.toggleMap(false, false); // the inventory wants the pointer free as well
    if (ui.boardOpen) this.toggleBoard(false, false);
    if (ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (ui.cardsOpen) this.toggleCards(false, false);
    if (open && this.perksUp) this.togglePerks(false, false); // (another tab of the same screen: screenGo)
    if (open && this.achUp) this.toggleAchievements(false, false);
    ui.setCraftContext(this.craftContext());
    ui.setInventoryOpen(open);
    this.input.enabled = !open && !this.screenUp();
    if (open) this.input.exitLock();
    else if (relock && this.input.enabled) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // whether the kit screens are the game's to go between (Game.screenGo): in a run, not over its end screen
  screenRun() {
    return this.state === 'playing' && !this.overlay;
  },

  // The kit screens' tabs (ui/screentabs.js): the inventory, the map, the perks and the achievements are one modal, and
  // a tab (or another tab's key) goes from one to the next with the pointer free all the while, nothing sliding in
  // again. Opened over the pause menu, the map, the perks and the achievements swap over it; the inventory puts it away.
  screenGo(id) {
    const ui = this.ui;
    const up = { inventory: ui.inventoryOpen, map: ui.mapOpen, perks: ui.progress.visible, achievements: ui.achPanel.visible };
    if (up[id] || !(id in up)) return;
    screenLeft();
    if (ui.pauseOpen && (up.map || up.perks || up.achievements)) {
      if (id !== 'inventory') {
        // (the one coming first, then the one going: there is never a frame of the bare menu between them)
        if (id === 'map') this.toggleMap(true);
        else (id === 'perks' ? ui.progress : ui.achPanel).show();
        if (id !== 'map' && up.map) this.toggleMap(false, false);
        if (id !== 'perks' && up.perks) ui.progress.hide();
        if (id !== 'achievements' && up.achievements) ui.achPanel.hide();
        return;
      }
      if (up.map) this.toggleMap(false, false);
      if (up.perks) ui.progress.hide();
      if (up.achievements) ui.achPanel.hide();
      ui.showPause(false);
    }
    if (id === 'inventory') this.toggleInventory(true);
    else if (id === 'map') this.toggleMap(true);
    else if (id === 'perks') this.togglePerks(true);
    else this.toggleAchievements(true);
  },

  // The player list, up for as long as [Tab] is held, with the pointer still locked and the game going on under it...
  showRoster(open) {
    const ui = this.ui;
    if (open === ui.rosterOpen) return;
    if (open) this.pushRoster(); // health as of now, not as of the last player list
    ui.setRosterOpen(open);
  },

  // ...until a click pins it up with the pointer free, the way the map frees it: a click on a player opens their
  // profile (ui/profile.js). Tab, Esc or its cross let it go. Clicks made while it is free never reach the weapon.
  // relock: false when something else that needs the cursor is taking over
  pinRoster(pin, relock = true) {
    const ui = this.ui;
    if (pin === ui.rosterPinned) return;
    this.input.releaseAll();
    this.inputBuffer.clear();
    this.endHold();
    if (pin) {
      if (ui.cardsOpen) this.toggleCards(false, false);
      this.pushRoster();
      ui.setRosterOpen(true);
      ui.setRosterPinned(true);
      this.input.enabled = false;
      this.input.exitLock();
    } else {
      ui.setRosterOpen(false);
      this.input.enabled = !ui.inventoryOpen && !ui.mapOpen && !ui.boardOpen && !ui.bestiaryOpen && !ui.cardsOpen;
      if (this.input.enabled && relock) this.input.requestLock();
    }
    this.audio.playLocal('ui_click', { volume: 0.4 });
  },

  // The side sheet's tabs (ui/sheet.js): from the pinned player list to the leaderboard and back, the pointer free all
  // the while
  sheetGo(where) {
    if (where === 'board' && !this.ui.boardOpen) {
      if (this.ui.rosterPinned) this.pinRoster(false, false);
      this.toggleBoard(true);
    } else if (where === 'players' && !this.ui.rosterPinned) {
      if (this.ui.boardOpen) this.toggleBoard(false, false);
      this.pinRoster(true);
    }
  },

  // relock: false when something else that needs the cursor is taking over. Shut with the Esc menu still up under it
  // (the map, the leaderboard, the bestiary, Dead Hand opened from the menu), it is the menu again, not the game: the
  // mouse is not taken back (that would be the menu's "Back to the game") and the input stays off.
  toggleMap(open, relock = true) {
    const ui = this.ui;
    if (open === ui.mapOpen) return;
    if (open && ui.inventoryOpen) this.toggleInventory(false, false); // (another tab of the same screen: screenGo)
    if (open && this.perksUp) this.togglePerks(false, false);
    if (open && this.achUp) this.toggleAchievements(false, false);
    if (open && ui.boardOpen) this.toggleBoard(false, false);
    if (open && ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (open && ui.cardsOpen) this.toggleCards(false, false);
    ui.setMapOpen(open);
    this.input.enabled = !open && !ui.inventoryOpen && !ui.pauseOpen;
    this.input.releaseAll();
    this.endHold();
    // the map takes clicks (your waypoint), so it frees the pointer the way the inventory does. Clicks made
    // while it is free never reach the weapon: Input only counts a mouse button pressed under the lock.
    if (open) this.input.exitLock();
    else if (relock && !ui.pauseOpen) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // The leaderboard [L]: it takes clicks (which list, which column), so it frees the pointer the way the map does.
  // relock: false when something else that needs the cursor is taking over
  toggleBoard(open, relock = true) {
    const ui = this.ui;
    if (open === ui.boardOpen) return;
    if (open && ui.mapOpen) this.toggleMap(false, false);
    if (open && ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (open && ui.cardsOpen) this.toggleCards(false, false);
    ui.setBoardOpen(open);
    this.input.enabled = !open && !ui.inventoryOpen && !ui.pauseOpen;
    this.input.releaseAll();
    this.endHold();
    if (open) {
      this.boardT = 0; // ask the server at once (update)
      this.input.exitLock();
    } else if (relock && !ui.pauseOpen) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // The bestiary [J] (and the pause menu's button): it scrolls, so it frees the pointer as the leaderboard does.
  // relock: false when something else that needs the cursor is taking over
  toggleBestiary(open, relock = true) {
    const ui = this.ui;
    if (open === ui.bestiaryOpen || (open && this.state !== 'playing')) return;
    if (open && ui.mapOpen) this.toggleMap(false, false);
    if (open && ui.boardOpen) this.toggleBoard(false, false);
    if (open && ui.rosterPinned) this.pinRoster(false, false);
    if (open && ui.spawnOpen) this.toggleSpawn(false, false);
    if (open && ui.cardsOpen) this.toggleCards(false, false);
    ui.setBestiaryOpen(open);
    this.input.enabled = !open && !ui.inventoryOpen && !ui.pauseOpen;
    this.input.releaseAll();
    this.endHold();
    if (open) this.input.exitLock();
    else if (relock && !ui.pauseOpen) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // The Perks panel [P] (ui/progress.js: the kit screens' Perks tab; the pause menu and the splash open it too): a
  // point spent mid-run without the pause menu. It takes clicks, so it frees the pointer as the bestiary does, and its
  // own close, Esc or a click outside it hands the pointer back (progress.onHide). perksUp: open from here, not over a
  // menu.
  // relock: false when something else that needs the cursor is taking over
  togglePerks(open, relock = true) {
    const ui = this.ui;
    if (open === !!this.perksUp || (open && (this.state !== 'playing' || this.cine || this.overlay || ui.pauseOpen))) return;
    if (open && ui.mapOpen) this.toggleMap(false, false);
    if (open && ui.boardOpen) this.toggleBoard(false, false);
    if (open && ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (open && ui.rosterPinned) this.pinRoster(false, false);
    if (open && ui.spawnOpen) this.toggleSpawn(false, false);
    if (open && ui.cardsOpen) this.toggleCards(false, false);
    if (open && ui.inventoryOpen) this.toggleInventory(false, false); // (another tab of the same screen: screenGo)
    if (open && this.achUp) this.toggleAchievements(false, false);
    this.perksUp = open;
    if (open) ui.progress.show();
    else if (ui.progress.visible) ui.progress.hide(); // (calls back here, and finds it shut already)
    // (shut over the end screen, after a leave: the input stays as they left it)
    if (!open && (this.state !== 'playing' || this.overlay || ui.pauseOpen)) return;
    this.input.enabled = !open && !this.screenUp();
    this.input.releaseAll();
    this.inputBuffer.clear();
    this.endHold();
    if (open) this.input.exitLock();
    else if (relock && this.input.enabled) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // The pledge window (server/pledge.js) as the server sees it for us. Its panel opens by itself once a window, when
  // there are Skulls to spend; the Pledge key [O] brings it back, and it goes when the window shuts.
  onPledge(m) {
    const ui = this.ui;
    ui.pledge.set(m);
    if (!m.open) {
      this.pledgeShown = false;
      if (ui.pledgeOpen) this.togglePledge(false);
      return;
    }
    if (!this.pledgeShown && m.balance > 0 && !m.done) {
      this.togglePledge(true);
      this.pledgeShown = ui.pledgeOpen; // (not playing yet - still loading the world: the next one tries again)
    }
  },

  // The pledge panel: it takes clicks, so it frees the pointer as the Perks panel does. relock: false when something
  // else that needs the cursor is taking over
  togglePledge(open, relock = true) {
    const ui = this.ui;
    if (open === ui.pledgeOpen || (open && (this.state !== 'playing' || this.cine || this.overlay || ui.pauseOpen))) return;
    if (open && ui.mapOpen) this.toggleMap(false, false);
    if (open && ui.boardOpen) this.toggleBoard(false, false);
    if (open && ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (open && ui.rosterPinned) this.pinRoster(false, false);
    if (open && ui.spawnOpen) this.toggleSpawn(false, false);
    if (open && ui.cardsOpen) this.toggleCards(false, false);
    if (open && ui.inventoryOpen) this.toggleInventory(false, false);
    if (open && this.perksUp) this.togglePerks(false, false);
    if (open && this.achUp) this.toggleAchievements(false, false);
    ui.pledge.setOpen(open);
    if (!open && ui.pledge.view.open) ui.notify(`Pledge & buy (${bindLabel('pledge')}) stays open until the window closes`, 'sub', 3);
    if (!open && (this.state !== 'playing' || this.overlay || ui.pauseOpen)) return;
    this.input.enabled = !open && !this.screenUp();
    this.input.releaseAll();
    this.inputBuffer.clear();
    this.endHold();
    if (open) this.input.exitLock();
    else if (relock && this.input.enabled) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // The Achievements panel [U] (ui/achievements.js: the kit screens' third tab; the pause menu and the splash open it
  // too), as the Perks panel: it frees the pointer, and its own close, Esc or a click outside it hands the pointer back
  // (achPanel.onHide). achUp: open from here, not over a menu. relock: false when something else that needs the cursor
  // is taking over
  toggleAchievements(open, relock = true) {
    const ui = this.ui;
    if (open === !!this.achUp || (open && (this.state !== 'playing' || this.cine || this.overlay || ui.pauseOpen))) return;
    if (open && ui.mapOpen) this.toggleMap(false, false);
    if (open && ui.boardOpen) this.toggleBoard(false, false);
    if (open && ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (open && ui.rosterPinned) this.pinRoster(false, false);
    if (open && ui.spawnOpen) this.toggleSpawn(false, false);
    if (open && ui.cardsOpen) this.toggleCards(false, false);
    if (open && this.perksUp) this.togglePerks(false, false);
    if (open && ui.inventoryOpen) this.toggleInventory(false, false); // (another tab of the same screen: screenGo)
    this.achUp = open;
    if (open) ui.achPanel.show();
    else if (ui.achPanel.visible) ui.achPanel.hide(); // (calls back here, and finds it shut already)
    // (shut over the end screen, after a leave: the input stays as they left it)
    if (!open && (this.state !== 'playing' || this.overlay || ui.pauseOpen)) return;
    // (its Sign in took them to the account panel: the pause menu under it, as when it was opened from there)
    if (!open && ui.accountPanel.visible) return ui.showPause(true);
    this.input.enabled = !open && !this.screenUp();
    this.input.releaseAll();
    this.inputBuffer.clear();
    this.endHold();
    if (open) this.input.exitLock();
    else if (relock && this.input.enabled) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // The admin spawn menu [`] (ui/spawnmenu.js): a search box and a list to click, so it frees the pointer and keeps
  // the keys while it is up. Only offered when the server says we are an admin; it checks every command anyway.
  // relock: false when something else that needs the cursor is taking over
  toggleSpawn(open, relock = true) {
    const ui = this.ui;
    if (open === ui.spawnOpen || (open && !this.admin)) return;
    if (open && ui.mapOpen) this.toggleMap(false, false);
    if (open && ui.boardOpen) this.toggleBoard(false, false);
    if (open && ui.rosterPinned) this.pinRoster(false, false);
    if (open && ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (open && ui.cardsOpen) this.toggleCards(false, false);
    ui.setSpawnOpen(open);
    this.input.enabled = !open && !ui.inventoryOpen && !ui.pauseOpen;
    this.input.releaseAll();
    this.inputBuffer.clear();
    this.endHold();
    if (open) this.input.exitLock();
    else if (relock && !ui.pauseOpen) this.input.requestLock();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // Dead Hand [K] (and the pause menu's row, a teammate's [E]): the card game's screen (ui/cards.js), over a world that
  // goes on. It takes clicks and keys of its own, so it frees the pointer as the bestiary does. Not in a cutscene or
  // under the end screen. view: the one to open it on ('table', 'deck', 'chooser', ...; null: the one it would pick).
  // relock: false when something else that needs the cursor is taking over
  toggleCards(open, relock = true, view = null) {
    const ui = this.ui;
    if (open && (this.state !== 'playing' || this.cine || this.overlay)) return;
    if (open) {
      ui.cards.bind(this.cards);
      ui.cards.onClose = () => this.toggleCards(false);
    }
    if (open === ui.cardsOpen) {
      if (open && view) ui.cards.show(view);
      return;
    }
    if (open && ui.mapOpen) this.toggleMap(false, false);
    if (open && ui.boardOpen) this.toggleBoard(false, false);
    if (open && ui.bestiaryOpen) this.toggleBestiary(false, false);
    if (open && ui.rosterPinned) this.pinRoster(false, false);
    if (open && ui.spawnOpen) this.toggleSpawn(false, false);
    ui.setCardsOpen(open, view);
    this.input.enabled = !open && !ui.inventoryOpen && !ui.pauseOpen;
    this.input.releaseAll();
    this.inputBuffer.clear();
    this.endHold();
    if (open) this.input.exitLock();
    else if (relock && !this.overlay && !ui.pauseOpen) this.input.requestLock();
    this.audio.playLocal(open ? 'card_shuffle' : 'ui_click', { volume: open ? 0.35 : 0.5 });
  },

  // The end screen asks how hard the run was (ui/menus.js EndScreen): the pointer goes free so it can be clicked
  freePointerForEnd() {
    this.ui.showPause(false);
    this.input.exitLock();
    this.input.enabled = false;
  },

  // ...and once it is down and the next run is on, a pointer it let go is taken back as after any pause, with a click
  pointerAfterEnd() {
    if (this.state !== 'playing' || this.input.locked || this.ui.isTyping()) return;
    this.ui.showPause(true);
    this.input.enabled = false;
  },

  updateOverlays() {
    const g = this.global;
    if (g.phase === PHASE.GAMEOVER && this.overlay !== 'gameover') {
      this.overlay = 'gameover';
      this.ui.setMapOpen(false);
      this.ui.setBoardOpen(false);
      this.ui.setBestiaryOpen(false);
      this.ui.setCardsOpen(false);
      this.ui.setSpawnOpen(false);
      const kills = [...this.players].map(([id, p]) => ({ name: p.name, kills: p.kills, me: id === this.myId }));
      // (a run that has got to the mainland starts again at the bridge, never back on the island)
      const reason = !this.world.car.plane ? 'Every survivor has fallen.' : 'Every survivor has fallen on the mainland. The team goes back to the bridgehead.';
      this.ui.showGameOver({ days: g.day, kills, reason, restartIn: Math.ceil(g.restartT), record: this.runReport, progress: this.progress });
      this.freePointerForEnd();
    } else if (g.phase === PHASE.VICTORY && this.overlay !== 'victory' && !this.cine) {
      this.overlay = 'victory';
      this.ui.setMapOpen(false);
      this.ui.setBoardOpen(false);
      this.ui.setBestiaryOpen(false);
      this.ui.setCardsOpen(false);
      this.ui.setSpawnOpen(false);
      const kills = [...this.players].map(([id, p]) => ({ name: p.name, kills: p.kills, me: id === this.myId }));
      // The run is won for everyone, but the car took whoever was at it: a survivor further off than ESCAPE_RADIUS
      // when it left stayed in the valley, and so did the players who had already turned.
      const car = this.world.car;
      let title = 'You escaped';
      let reason = 'The engine roars. You tear down Route 9 and leave the valley behind.';
      const plane = !!car.plane; // (the mainland: the run ends in the air)
      if (plane) reason = 'The wheels leave the runway. The town, the bridge and the island fall away behind you.';
      if (!this.self.alive || this.prediction.state.zombie) {
        title = 'They escaped';
        reason = plane ? 'The plane is a speck over the hills. You stay on the mainland with the rest of the dead.' : 'The engine roars and the car is gone down Route 9. You stay in the valley with the rest of the dead.';
      } else if (Math.hypot(this.renderPos.x - car.x, this.renderPos.z - car.z) > ESCAPE_RADIUS) {
        title = 'Left behind';
        reason = plane ? 'The plane goes without you. The others made it off the mainland.' : 'The car tears down Route 9 without you. The others made it out of the valley.';
      }
      this.ui.showVictory({ days: g.day, kills, title, reason, plane, restartIn: Math.ceil(g.restartT), record: this.runReport, progress: this.progress });
      this.freePointerForEnd();
    } else if ((g.phase === PHASE.DAY || g.phase === PHASE.NIGHT) && (this.overlay === 'gameover' || this.overlay === 'victory')) {
      this.overlay = null;
      this.ui.hideOverlays();
      this.pointerAfterEnd();
    }
    // death overlay clears when we rise as a zombie
    if (this.deathShown && this.self.alive && this.self.zombie) {
      this.deathShown = false;
      this.ui.hideOverlays();
      this.ui.notify('YOU HAVE RISEN', 'big', 4);
      this.ui.notify(this.dawnAhead() ? `Hunt the survivors until dawn. [${bindPair('aim')}] to leap.` : `Hunt the survivors. [${bindPair('aim')}] to leap.`, 'sub', 4);
    }
  },

  // the leaderboard is asked for while it is up: as it opens, then every few seconds (it moves as people play)
  updateBoard() {
    if (this.ui.boardOpen && performance.now() >= this.boardT) {
      this.boardT = performance.now() + BOARD_EVERY;
      this.conn.board();
    }
  },
};
