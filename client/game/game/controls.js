// Game: the keys and buttons - what a key going down or up does in play (binds.js says which action it is).
import { SLOT_THROW, SLOT_BUILD, SLOT_PRIMARY, SLOT_PISTOL, SLOT_MELEE } from '../../../shared/constants.js';
import { ITEM_DEFS, THROW_ITEMS } from '../../../shared/defs.js';
import { ACT, ENT } from '../../../shared/protocol.js';
import { SPAWN_KEY } from '../../ui/spawnmenu.js';
import { actionsOf, bindTag, bindLabel } from '../binds.js';
import { DROP_HOLD, TAP_HINT } from '../drophold.js';
import { BUILD_ROT_STEP, BUILD_ROT_FINE, BUILD_ROT_WHEEL } from './build.js';

export const methods = {
  setupInputHandlers() {
    const inp = this.input;
    inp.handlers.isTyping = () => this.ui.isTyping();
    inp.handlers.onLockChange = (locked) => {
      if (this.state !== 'playing') {
        if (locked && !this.joinHold) inp.exitLock(); // (asked for on the click on Join, landing after the join failed)
        return;
      }
      if (!locked && (this.overlay === 'gameover' || this.overlay === 'victory')) {
        inp.enabled = false; // (the run's end screen let the pointer go, for its poll: no pause menu over it)
      } else if (!locked && !this.ui.isTyping() && !this.screenUp()) {
        // (the browser kept the Esc for itself: back from the menu, the hammer is out with no piece up)
        this.dropBuildPick();
        this.ui.showPause(true);
        inp.enabled = false;
      } else if (locked) {
        this.ui.showPause(false);
        // A lock lands a moment after it is asked for, and a screen can open in that moment (I straight after the click
        // that takes the mouse back, the pause menu's way back with the map up, a chat line sent from the inventory). Held
        // over it the pointer can't click the screen and the input is off: the trigger is dead and, with Esc the page's
        // under fullscreen's keyboard lock, only leaving fullscreen got out. The screen keeps the pointer.
        inp.enabled = !this.screenUp();
        if (!inp.enabled) inp.exitLock();
      }
    };
    inp.handlers.onKey = (code, acts) => this.onKey(code, acts);
    // acts: what the key went down as (rebound since or not: what was started by it is what stops)
    inp.handlers.onKeyUp = (code, acts, cancelled) => {
      for (const a of acts) {
        if (a === 'talk' && this.settings.pushToTalk !== false) {
          this.pttHeld = false;
          if (!this.radio.keyed) this.voice.setTransmit(false); // (still keying the walkie-talkie: still talking)
        } else if (a === 'interact') {
          this.endHold();
          this.power.release();
          this.vehicles.release();
          this.gun.keyUp();
        } else if (a === 'players' && !this.ui.rosterPinned) this.showRoster(false);
        else if (a === 'drop' && this.dropHold.release(cancelled) === 'tap') this.cancelHoldRing(`Hold ${bindLabel('drop')} to drop`, TAP_HINT); // (let go too soon: the ring says to hold it)
      }
    };
    inp.handlers.onBlur = () => this.ui.rosterPinned || this.showRoster(false);
  },

  // A key (or mouse button) went down: code, and the actions it is bound to (binds.js). Most keys are one action; a key
  // of the hands and a key of building can be the same one, and then which it is depends on the hammer being out.
  onKey(code, acts = actionsOf(code)) {
    if (this.state !== 'playing') return;
    const s = this.prediction.state;
    const ui = this.ui;
    const has = (a) => acts.includes(a);
    if (code === 'Escape') {
      if (ui.pledgeOpen) this.togglePledge(false);
      else if (ui.rosterPinned) this.pinRoster(false);
      else if (ui.mapOpen) this.toggleMap(false);
      else if (ui.boardOpen) this.toggleBoard(false);
      else if (ui.bestiaryOpen) this.toggleBestiary(false);
      else if (this.perksUp) this.togglePerks(false);
      else if (this.achUp) this.toggleAchievements(false);
      else if (ui.cardsOpen) {
        if (!ui.cards.back()) this.toggleCards(false); // (a view inside it first: a card picked, the chooser, a deck)
      } else if (ui.spawnOpen) this.toggleSpawn(false);
      else if (ui.pauseOpen) {
        if (ui.fieldNotes.visible) ui.fieldNotes.hide(); // (its own keys missed it: the focus was elsewhere, or a panel was up)
        else this.resumeFromPause();
      }
      // (Esc only gets here with the mouse still taken under fullscreen's keyboard lock, keyguard.js: it shuts the ring,
      // then puts the piece down, and only then lets go of the mouse for the menu - whatever the input is doing: the
      // browser no longer lets go of the mouse on Esc itself, so this is the only way out short of leaving fullscreen)
      else if (this.input.locked) {
        if (this.buildMenu) this.closeBuildMenu(true);
        else if (!this.dropBuildPick(true)) this.input.exitLock();
      }
      return;
    }
    // (an admin's: it takes over the key from any bind on it)
    if (code === SPAWN_KEY && this.admin) {
      if (!ui.inventoryOpen && !ui.isTyping()) this.toggleSpawn(!ui.spawnOpen);
      return;
    }
    if (has('pledge') && !ui.isTyping()) {
      if (ui.pledgeOpen) this.togglePledge(false);
      else if (ui.pledge.view.open && !ui.pauseOpen) this.togglePledge(true);
      return;
    }
    if (has('players')) {
      if (ui.cardsOpen || this.perksUp || this.achUp) return; // (Tab is no key of the card table or the perks: the list would only sit under it)
      if (ui.boardOpen) this.sheetGo('players');
      else if (ui.rosterPinned) this.pinRoster(false);
      else this.showRoster(true);
      return;
    }
    // a click with the player list held up keeps it there, with the pointer free to pick someone out of it
    if (ui.rosterOpen && !ui.rosterPinned && this.input.locked && (has('fire') || has('aim'))) {
      this.pinRoster(true);
      return;
    }
    // (whatever else takes the screen or the keys lets go of a pinned list first)
    if (ui.rosterPinned && ['inventory', 'map', 'board', 'bestiary', 'cards', 'perks', 'achievements', 'chat'].some(has)) this.pinRoster(false, false);
    // The kit screens, [I] [M] [P] [U] (ui/screentabs.js): one modal with a tab each. The open tab's key shuts it,
    // another's goes to its tab. Over the pause menu (the map, its Perks or its Achievements up) they only go between
    // those three
    const kit = ['inventory', 'map', 'perks', 'achievements'].find(has);
    if (kit) {
      if (kit !== 'inventory' && ui.isTyping()) return;
      const panel = kit === 'perks' ? ui.progress : kit === 'achievements' ? ui.achPanel : null;
      if (ui.pauseOpen && (ui.mapOpen || ui.progress.visible || ui.achPanel.visible)) {
        if (kit === 'inventory') return;
        if (kit === 'map' && ui.mapOpen) this.toggleMap(false);
        else if (panel?.visible) panel.hide();
        else this.screenGo(kit);
      } else if (kit === 'inventory' || kit === 'map') {
        if (kit === 'inventory' ? ui.inventoryOpen : ui.mapOpen) kit === 'inventory' ? this.toggleInventory(false) : this.toggleMap(false);
        else this.screenGo(kit);
      } else if (ui.pauseOpen) return;
      else if (kit === 'perks' ? this.perksUp : this.achUp) panel.hide(); // (its onHide hands the pointer back)
      else this.screenGo(kit);
      return;
    }
    if (this.achUp && ['board', 'bestiary', 'cards'].some(has)) this.toggleAchievements(false, false);
    if (this.perksUp && ['board', 'bestiary', 'cards'].some(has)) this.togglePerks(false, false);
    if (has('board')) {
      if (ui.inventoryOpen || ui.isTyping()) return;
      this.toggleBoard(!ui.boardOpen);
      return;
    }
    if (has('bestiary')) {
      if (ui.inventoryOpen || ui.isTyping()) return;
      this.toggleBestiary(!ui.bestiaryOpen);
      return;
    }
    if (has('cards')) {
      if (ui.inventoryOpen || ui.isTyping()) return;
      this.toggleCards(!ui.cardsOpen);
      return;
    }
    // Y as in Half-Life. Input only passes it on while in play; Enter also gets through from the inventory.
    if (has('chat')) {
      // (not from the map: the chat box is hidden under it and could never take the focus, which left
      // every key dead until a reload)
      if (!ui.isTyping() && !ui.mapOpen && !ui.boardOpen && !ui.bestiaryOpen && !ui.cardsOpen) {
        ui.openChat();
        this.input.releaseAll();
        this.inputBuffer.clear();
      }
      return;
    }
    if (!this.input.enabled) return;
    const digit = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'].findIndex(has);
    if (digit >= 0) {
      // (the mounted gun in their arms: any weapon key reaches for that weapon, and the gun drops where they stand)
      if (digit === SLOT_THROW && s.slot === SLOT_THROW && !s.hmg) {
        // cycle to the next throwable we carry
        const counts = this.invCounts();
        const i = THROW_ITEMS.indexOf(s.weapons[SLOT_THROW]);
        for (let k = 1; k <= THROW_ITEMS.length; k++) {
          const it = THROW_ITEMS[(i + k) % THROW_ITEMS.length];
          if (counts[it] && it !== s.weapons[SLOT_THROW]) {
            this.conn.action(ACT.SELECT_THROWABLE, it);
            break;
          }
        }
        return;
      }
      // the hammer's key again with the hammer out: the ring of structures, to pick another (or put it away again)
      if (digit === SLOT_BUILD && s.slot === SLOT_BUILD && !s.zombie && !s.hmg && !s.using && this.self.alive && !s.downed) {
        if (this.buildMenu) this.closeBuildMenu(true);
        else this.openBuildMenu();
        return;
      }
      if (digit !== s.slot) this.lastSlot = s.slot;
      this.prediction.requestSlot(digit);
      return;
    }
    // hammer out: fire opens the ring of structures and fire in it picks the one pointed at (aim shuts it). With one
    // picked, fire places it and aim turns the piece. The build keys step through the structures (Q back, R / E on) -
    // but the interact key still interacts whenever the prompt offers it, and the ring is not up
    if (s.slot === SLOT_BUILD && !s.zombie) {
      const menu = this.buildMenu;
      const offered = !menu && has('interact') && !!this.prompt?.startsWith(bindTag('interact'));
      if (!offered) {
        if (has('buildPrev')) return this.cycleBuild(-1);
        if (has('buildNext')) return this.cycleBuild(1);
        if (has('demolish')) {
          if (this.lookTarget && this.lookTarget.kind === ENT.STRUCTURE) this.conn.action(ACT.DEMOLISH, this.lookTarget.id);
          return;
        }
      }
      if (this.self.alive && !s.downed && (has('fire') || has('aim'))) {
        // (with an item in the hands the click puts it away, as it does with a weapon out: asking for the slot we are on is
        // what does that here, the build mode's clicks being no fire button)
        if (menu) {
          if (has('fire')) this.pickStructure(menu.hover);
          else this.closeBuildMenu(true);
        } else if (has('fire') && s.using) this.prediction.requestSlot(SLOT_BUILD);
        else if (has('fire')) {
          if (this.buildPicked) this.tryBuild();
          else this.openBuildMenu();
        } else if (this.buildPicked) {
          // clockwise seen from above (+yaw is counter-clockwise): 45°, or 15° with the fine-rotate key held
          this.buildRot = (this.buildRot - (this.input.held('buildFine') ? BUILD_ROT_FINE : BUILD_ROT_STEP)) & 255;
          this.audio.playLocal('ui_click', { volume: 0.4 });
        }
        return;
      }
    }
    for (const a of acts) {
      switch (a) {
        case 'lastWeapon': {
          const t = this.lastSlot;
          this.lastSlot = s.slot;
          this.prediction.requestSlot(t);
          break;
        }
        case 'flashlight': {
          if (this.vehicles.lightsKey()) break; // (in a vehicle the key is its headlamp)
          if (s.zombie) break;
          this.localFlash = !this.localFlash;
          if (this.localFlash && this.self.battery <= 1) this.localFlash = false;
          this.localFlashT = 0.6;
          this.conn.action(ACT.FLASHLIGHT, this.localFlash ? 1 : 0);
          this.audio.playLocal('flashlight');
          break;
        }
        case 'interact':
          this.interact();
          break;
        case 'ping':
          this.ping();
          break;
        case 'drop':
          this.pressDrop();
          break;
        case 'heal':
          this.quickHeal();
          break;
        case 'drink':
          this.quickDrink();
          break;
        case 'talk':
          if (this.settings.pushToTalk !== false) {
            this.pttHeld = true;
            this.voice.setTransmit(true);
          } else this.voice.setTransmit(!this.voice.transmitting);
          break;
      }
    }
  },

  // The drop key: the weapon in the hands goes on the ground once the key has been held a moment (drophold.js), or
  // at once with "Hold to drop weapon" off. Never a throwable (those are thrown), never as a zombie.
  pressDrop() {
    const s = this.prediction.state;
    if (s.hmg) return void this.gun.drop(); // the mounted gun in their arms goes down first, at a press (carrying it is all they do)
    if (s.pet) return void this.cat.put(); // ...and so does the cat
    if (s.zombie || s.slot === SLOT_THROW || !s.weapons[s.slot]) return;
    if (this.settings.holdToDrop === false) this.conn.action(ACT.DROP_WEAPON, s.slot);
    else {
      this.dropHold.start(s.slot);
      this.startHoldRing('drop', 0, { label: `Dropping ${ITEM_DEFS[s.weapons[s.slot]]?.name || 'it'}…`, need: DROP_HOLD });
    }
  },

  // dev builds only: preview the weather locally. /weather fog|gale|rain|storm|clear|auto, /lightning [meters]
  devCommand(text) {
    if (!import.meta.env?.DEV) return false;
    const [cmd, arg] = text.trim().split(/\s+/);
    if (cmd === '/weather') {
      this.weather.force = !arg || arg === 'auto' ? null : arg === 'clear' ? { rain: 0, bolts: 0, cloud: 0, fog: 1, wind: 0.3 } : { kind: arg };
      this.ui.notify(`Weather: ${arg || 'auto'}`, 'toast', 2);
      return true;
    }
    if (cmd === '/lightning') {
      this.weather.strikeNear(this.camera.position, +arg || 150, true, this.input.yaw + Math.PI);
      return true;
    }
    return false;
  },

  // The mouse wheel: with the hammer out it steps round the structures, or with a piece picked and the fine-rotate key
  // held it turns the piece (down clockwise, as a right click does); otherwise it cycles the weapons carried
  onWheel(wheel, s) {
    if (s.slot === SLOT_BUILD && !s.zombie && this.buildPicked && !this.buildMenu && this.input.held('buildFine')) this.buildRot = (this.buildRot - wheel * BUILD_ROT_WHEEL) & 255;
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
  },
};
