// The touch controls (touch mode: game/touchmode.js): what a phone plays the game with in place of the mouse and the
// keyboard. Up while the game has "the pointer" (Input.locked: play, no screen up), under the HUD so a piece of the HUD
// that takes taps (the weapon slots, the build ring) is tapped first.
//   - a stick for the left thumb, wherever it lands on the left of the screen: the direction keys, and sprint with the
//     stick pushed out past its ring;
//   - a drag anywhere else turns the view, and so does a drag that starts on FIRE or AIM (shoot while turning);
//   - buttons for the right thumb (fire, aim, jump, crouch, reload, use) and, with the hammer out, the build keys;
//   - a row at the top: the pause menu, the bag, the map, the flashlight, and "more" for the rest of the actions.
// Every button is an action pressed and let go through Input.pressAction / releaseAction, as its key would be, so the
// game does with it whatever it does with the key.
import { el, svgEl } from './dom.js';
import { glyph } from './icons.js';
import { WEAPONS, ITEM } from '../../shared/defs.js';
import { SLOT_BUILD } from '../../shared/constants.js';
import { currentWeapon } from '../../shared/playersim.js';
import { touchMode, onTouchMode, portrait, TOUCH_LABELS } from '../game/touchmode.js';

const STICK_R = 54; // px: how far the stick's knob goes from its centre
const STICK_DEAD = 0.22; // of STICK_R: no move inside this
const STICK_SPRINT = 1.3; // of STICK_R: the thumb pushed this far out sprints (forward only)
const SECTOR = 0.383; // sin 22.5deg: a direction is held within 67.5deg of it (so a diagonal holds two)
const LOOK_PX = 2.4; // a finger's px is this many mouse counts (x the touch look setting)
const TAP_MS = 220; // AIM let go sooner than this is a tap: the sights stay up until the next tap (guns only)
const STICK_ZONE = 0.42; // of the width: a touch that lands left of this (not on a button) is the stick

// The buttons on the right. kind: hold (down while the finger is), tap (pressed and let go at once), toggle (crouch:
// a tap holds it, the next lets go), aim (see TAP_MS). look: a drag from it turns the view too.
const BUTTONS = [
  { act: 'fire', kind: 'hold', look: true, cls: 'tb-fire', icon: 'blast' },
  { act: 'aim', kind: 'aim', look: true, cls: 'tb-aim', icon: 'eye' },
  { act: 'jump', kind: 'hold', cls: 'tb-jump', icon: 'arrowUp' },
  { act: 'crouch', kind: 'toggle', cls: 'tb-crouch', icon: 'downed' },
  { act: 'reload', kind: 'hold', cls: 'tb-reload', icon: 'wave' },
  { act: 'interact', kind: 'hold', cls: 'tb-use', icon: 'hand' },
  // the hammer out: the structures back and on, and taking one down
  { act: 'buildPrev', kind: 'tap', cls: 'tb-bprev tb-build', icon: 'arrowLeft' },
  { act: 'buildNext', kind: 'tap', cls: 'tb-bnext tb-build', icon: 'arrowRight' },
  { act: 'demolish', kind: 'tap', cls: 'tb-demolish tb-build', icon: 'hammer' },
];
// the row at the top
const TOP = [
  { act: 'pause', icon: 'grid', label: 'MENU' },
  { act: 'inventory', icon: 'container' },
  { act: 'map', icon: 'map' },
  { act: 'flashlight', icon: 'flashlight' },
  { act: 'more', icon: 'plus', label: 'MORE' },
];
// "more": the rest of the actions, held while the finger is down (drop and push to talk are held; the player list is up
// while it is)
const MORE = [
  { act: 'heal', icon: 'cross' },
  { act: 'drink', icon: 'bolt', label: 'DRINK' },
  { act: 'lastWeapon', icon: 'arrowLeft', label: 'LAST GUN' },
  { act: 'drop', icon: 'drop', label: 'DROP (HOLD)' },
  { act: 'ping', icon: 'ping' },
  { act: 'chat', icon: 'chat', onUp: true }, // (on the finger's lift: an iPhone only brings its keyboard up for a field focused then)
  { act: 'talk', icon: 'mic', label: 'TALK (HOLD)' },
  { act: 'players', icon: 'people', label: 'PLAYERS (HOLD)' },
  { act: 'board', icon: 'trophy' },
  { act: 'bestiary', icon: 'skull' },
  { act: 'cards', icon: 'cards' },
];
const MOVES = ['forward', 'back', 'left', 'right'];

export class TouchPad {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    const ui = game.ui;
    const hud = ui.root.querySelector('.layer-hud');
    this.root = el('div', 'layer layer-touch');
    ui.root.insertBefore(this.root, hud);
    this.on = false; // up (touch mode, and play)
    this.fingers = new Map(); // pointerId -> { kind: 'stick' | 'look' | 'button', x, y, ... }
    this.held = new Set(); // the stick's directions held
    this.sprint = false;
    this.crouched = false;
    this.aimLatched = false;

    // ---- the stick
    this.stick = el('div', 'tp-stick', this.root);
    this.knob = el('div', 'tp-knob', this.stick);

    // ---- the buttons
    this.btns = {};
    for (const b of BUTTONS) {
      const n = svgEl('div', 'tbtn ' + b.cls, this.root, glyph(b.icon, 'tb-ico'));
      const txt = el('span', 'tb-txt', n, TOUCH_LABELS[b.act]);
      n.dataset.act = b.act;
      this.btns[b.act] = { def: b, node: n, txt, said: TOUCH_LABELS[b.act] };
    }
    const top = el('div', 'tp-top', this.root);
    for (const b of TOP) {
      const n = svgEl('div', 'tbtn tb-sm', top, glyph(b.icon, 'tb-ico'));
      el('span', 'tb-txt', n, b.label || TOUCH_LABELS[b.act]);
      n.dataset.act = b.act;
      this.btns[b.act] = { def: { ...b, kind: 'tap' }, node: n };
    }
    this.more = el('div', 'tp-more', this.root);
    this.more.hidden = true;
    for (const b of MORE) {
      const n = svgEl('div', 'tbtn tb-sm', this.more, glyph(b.icon, 'tb-ico'));
      el('span', 'tb-txt', n, b.label || TOUCH_LABELS[b.act]);
      n.dataset.act = b.act;
      this.btns[b.act] = { def: { ...b, kind: 'hold', more: true }, node: n };
    }

    // ---- turn the phone (in play, held upright)
    this.turn = el('div', 'tp-turn', ui.root);
    svgEl('i', 'tp-turn-ico', this.turn, glyph('arrowRight'));
    el('div', 'tp-turn-txt', this.turn, 'Turn your phone on its side to play');

    const r = this.root;
    r.addEventListener('pointerdown', (e) => this.down(e));
    r.addEventListener('pointermove', (e) => this.move(e));
    r.addEventListener('pointerup', (e) => this.up(e));
    r.addEventListener('pointercancel', (e) => this.up(e, true));
    r.addEventListener('lostpointercapture', (e) => this.up(e, true));
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    // No click (nor mouse events) made of a touch on the controls: the browser aims it where the finger lifted, at
    // whatever is there by then - the pause menu a tap on MENU just opened, which a click shuts again
    for (const t of ['touchstart', 'touchend']) r.addEventListener(t, (e) => e.cancelable && e.preventDefault(), { passive: false });

    // the minimap: a tap opens the field map
    ui.hud.minimap.root.addEventListener('pointerdown', (e) => {
      if (!this.on) return;
      e.preventDefault();
      this.tap('map');
    });
    // the HUD's weapon slots are the weapon bar: a tap is that slot's key
    ui.hud.slotEls.forEach((s, i) =>
      s.row.addEventListener('pointerdown', (e) => {
        if (!this.on) return;
        e.preventDefault();
        this.tap('slot' + (i + 1));
      }),
    );

    onTouchMode((v) => {
      // (switched off in play: the game takes the real mouse again, which a click asks for)
      if (!v) this.input.exitLock();
      this.sync();
    });
    addEventListener('resize', () => this.sync());
    this.sync();
  }

  // ---------------------------------------------------------------- fingers
  down(e) {
    if (!this.on) return;
    e.preventDefault();
    const n = e.target.closest?.('[data-act]');
    // (t0: when the finger went down, by the event's own clock: a slow frame must not make a tap a hold)
    const f = { kind: '', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, act: '' };
    if (n) {
      f.kind = 'button';
      f.act = n.dataset.act;
      f.node = n;
      f.def = this.btns[f.act]?.def;
      this.press(f);
    } else if (e.clientX < innerWidth * STICK_ZONE && ![...this.fingers.values()].some((o) => o.kind === 'stick')) {
      f.kind = 'stick';
      this.stick.classList.add('on');
      const o = this.root.getBoundingClientRect(); // (the controls keep inside a notch: touch.css)
      this.stick.style.left = e.clientX - o.left + 'px';
      this.stick.style.top = e.clientY - o.top + 'px';
      this.knob.style.transform = '';
    } else f.kind = 'look';
    if (this.more.hidden === false && !f.def?.more && f.act !== 'more') this.showMore(false);
    this.fingers.set(e.pointerId, f);
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {}
  }

  move(e) {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    e.preventDefault();
    const dx = e.clientX - f.x;
    const dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    if (f.kind === 'stick') this.steer(f);
    else if (f.kind === 'look' || (f.kind === 'button' && f.def?.look)) this.look(dx, dy);
  }

  up(e, cancelled = false) {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    this.fingers.delete(e.pointerId);
    if (f.kind === 'stick') {
      this.restStick();
      this.setMoves(new Set(), false);
    } else if (f.kind === 'button') this.release(f, cancelled, e.timeStamp);
  }

  look(dx, dy) {
    const s = this.game.settings;
    const k = (LOOK_PX * (s.touchLook || 1)) / (s.sensitivity || 1); // (Input's sensitivity has the mouse setting in it)
    this.input.look(dx * k, dy * k);
  }

  steer(f) {
    let dx = f.x - f.x0;
    let dy = f.y - f.y0;
    const d = Math.hypot(dx, dy);
    const m = Math.min(1, d / STICK_R);
    const k = d > STICK_R ? STICK_R / d : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const moves = new Set();
    if (m > STICK_DEAD) {
      const ux = dx / d;
      const uy = dy / d;
      if (-uy > SECTOR) moves.add('forward');
      if (uy > SECTOR) moves.add('back');
      if (-ux > SECTOR) moves.add('left');
      if (ux > SECTOR) moves.add('right');
    }
    this.setMoves(moves, moves.has('forward') && !moves.has('back') && d > STICK_R * STICK_SPRINT && -dy / d > 0.7);
  }

  // the stick back where it waits for the thumb (touch.css)
  restStick() {
    this.stick.classList.remove('on', 'sprint');
    this.stick.style.left = this.stick.style.top = this.knob.style.transform = '';
  }

  setMoves(moves, sprint) {
    for (const a of MOVES) {
      if (moves.has(a) && !this.held.has(a)) this.input.pressAction(a);
      else if (!moves.has(a) && this.held.has(a)) this.input.releaseAction(a);
    }
    this.held = moves;
    if (sprint !== this.sprint) {
      this.sprint = sprint;
      if (sprint) this.input.pressAction('sprint');
      else this.input.releaseAction('sprint');
      this.stick.classList.toggle('sprint', sprint);
    }
  }

  // ---------------------------------------------------------------- buttons
  tap(act) {
    this.input.pressAction(act);
    this.input.releaseAction(act);
  }

  press(f) {
    const act = f.act;
    const kind = f.def?.kind || 'tap';
    f.node.classList.add('down');
    if (f.def?.onUp) return;
    if (act === 'pause') {
      // (Esc backs out of building a step at a time - the ring, then the piece picked - before it opens the menu: MENU
      // opens it at once)
      this.game.closeBuildMenu();
      this.game.dropBuildPick();
      return void this.game.onKey('Escape', []);
    }
    if (act === 'more') return this.showMore(this.more.hidden);
    if (kind === 'tap') return this.tap(act);
    if (kind === 'toggle') {
      this.crouched = !this.crouched;
      if (this.crouched) this.input.pressAction(act);
      else this.input.releaseAction(act);
      return;
    }
    if (kind === 'aim' && this.aimLatched) {
      // (the tap that lets the sights down again)
      this.aimLatched = false;
      f.unlatch = true;
      return void this.input.releaseAction(act);
    }
    this.input.pressAction(act);
  }

  release(f, cancelled, t = f.t0) {
    f.node.classList.remove('down');
    const act = f.act;
    const kind = f.def?.kind || 'tap';
    if (f.def?.onUp) {
      if (!cancelled) this.tap(act);
      return;
    }
    if (kind !== 'hold' && kind !== 'aim') return;
    if (kind === 'aim') {
      if (f.unlatch) return;
      // a tap with a gun out: the sights stay up
      if (!cancelled && t - f.t0 < TAP_MS && this.gunInHands()) {
        this.aimLatched = true;
        return;
      }
    }
    this.input.releaseAction(act, cancelled);
  }

  // what AIM does now: the sights with a gun, a stab with the knife, a heavy blow with the other melee weapons, a turn
  // of the piece to build (the ring up: shut it), a zombie's leap
  aimSays(s, build) {
    const g = this.game;
    if (s.zombie) return 'LEAP';
    if (build) return g.buildMenu ? 'CLOSE' : g.buildPicked ? 'ROTATE' : 'AIM';
    const item = currentWeapon(s);
    const w = WEAPONS[item];
    if (!w?.melee) return 'AIM';
    return item === ITEM.KNIFE ? 'STAB' : 'HEAVY';
  }

  say(btn, text) {
    if (btn.said === text) return;
    btn.said = text;
    btn.txt.textContent = text;
  }

  gunInHands() {
    const s = this.game.prediction.state;
    const w = WEAPONS[currentWeapon(s)];
    return !!w && !w.melee;
  }

  showMore(open) {
    this.more.hidden = !open;
    this.btns.more.node.classList.toggle('lit', open);
  }

  // everything held let go (the controls went away: a screen came up, the game ended)
  letGo() {
    for (const f of this.fingers.values()) if (f.kind === 'button') this.release(f, true, performance.now());
    this.fingers.clear();
    this.setMoves(new Set(), false);
    this.restStick();
    if (this.crouched) {
      this.crouched = false;
      this.input.releaseAction('crouch', true);
    }
    if (this.aimLatched) {
      this.aimLatched = false;
      this.input.releaseAction('aim', true);
    }
    this.showMore(false);
  }

  // ---------------------------------------------------------------- each frame
  sync() {
    const g = this.game;
    const tm = touchMode();
    const on = tm && g.state === 'playing' && this.input.locked && this.input.enabled && !g.ui.isTyping() && !g.ui.pauseOpen;
    if (on !== this.on) {
      this.on = on;
      this.root.classList.toggle('on', on);
      if (!on) this.letGo();
    }
    this.turn.classList.toggle('on', tm && g.state === 'playing' && portrait());
    return on;
  }

  update() {
    if (!this.sync()) return;
    const g = this.game;
    const s = g.prediction.state;
    const b = this.btns;
    b.interact.node.classList.toggle('lit', !!g.prompt?.startsWith('[' + TOUCH_LABELS.interact + ']'));
    this.root.classList.toggle('building', s.slot === SLOT_BUILD && !s.zombie);
    this.root.classList.toggle('zombie', !!s.zombie);
    // FIRE and AIM say what they do with what is in the hands
    const build = s.slot === SLOT_BUILD && !s.zombie;
    this.say(b.fire, build ? (g.buildMenu ? 'PICK' : g.buildPicked ? 'PLACE' : 'BUILD') : 'FIRE');
    this.say(b.aim, this.aimSays(s, build));
    b.crouch.node.classList.toggle('lit', this.crouched);
    b.aim.node.classList.toggle('lit', this.aimLatched);
    b.flashlight.node.classList.toggle('lit', !!g.localFlash);
    // (the sights latched up, and then a knife came out or the gun went: let down)
    if (this.aimLatched && !this.gunInHands()) {
      this.aimLatched = false;
      this.input.releaseAction('aim', true);
    }
  }
}
