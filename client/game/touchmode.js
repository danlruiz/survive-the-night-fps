// Touch mode: the game played on a phone or a tablet, with on-screen controls (ui/touchpad.js) in place of the mouse
// and the keyboard. Settings > Controls > Touch controls: 'auto' (on for a device whose main pointer is a finger),
// 'on' or 'off'. While it is on:
//   - <html> has the class "touch", which the stylesheets lay the screens out for fingers and small screens by;
//   - text names the on-screen button an action is on, not its key ('[USE] Pick up': binds.js setTouchLabels);
//   - Input has no mouse to lock: "the pointer locked" is play with the touch controls up, and freeing it is a screen
//     (the inventory, the map, the pause menu) taking the fingers (Input.requestLock / exitLock).
import { setTouchLabels } from './binds.js';

// what the buttons say: the names prompts and hints use for them
export const TOUCH_LABELS = Object.freeze({
  forward: 'STICK',
  back: 'STICK',
  left: 'STICK',
  right: 'STICK',
  jump: 'JUMP',
  sprint: 'SPRINT',
  crouch: 'CROUCH',
  fire: 'FIRE',
  aim: 'AIM',
  reload: 'RELOAD',
  slot1: '1',
  slot2: '2',
  slot3: '3',
  slot4: '4',
  slot5: '5',
  slot6: '6',
  lastWeapon: 'SWAP',
  drop: 'DROP',
  interact: 'USE',
  inventory: 'BAG',
  heal: 'HEAL',
  drink: 'DRINK',
  flashlight: 'LIGHT',
  buildNext: 'NEXT',
  buildPrev: 'PREV',
  demolish: 'REMOVE',
  chat: 'CHAT',
  talk: 'TALK',
  ping: 'PING',
  map: 'MAP',
  board: 'SCORES',
  bestiary: 'BESTIARY',
  cards: 'CARDS',
  players: 'PLAYERS',
});

// a device whose main pointer is a finger (a phone, a tablet; not a laptop with a touch screen and a trackpad)
export function touchDevice() {
  try {
    return (navigator.maxTouchPoints || 0) > 0 && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// ?touch=1 / ?touch=0 in the address forces it for this page (testing on a desktop, or a device that guesses wrong)
function forced() {
  try {
    const v = new URLSearchParams(location.search).get('touch');
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

let on = false;
const subs = new Set();

export const touchMode = () => on;

// setting: 'auto' | 'on' | 'off'
export function applyTouchSetting(setting = 'auto') {
  const f = forced();
  setTouchMode(f !== null ? f : setting === 'on' ? true : setting === 'off' ? false : touchDevice());
}

export function setTouchMode(v) {
  v = !!v;
  if (v === on && document.documentElement.classList.contains('touch') === v) return;
  on = v;
  document.documentElement.classList.toggle('touch', v);
  setTouchLabels(v ? TOUCH_LABELS : null);
  for (const fn of subs) {
    try {
      fn(v);
    } catch (err) {
      console.error(err);
    }
  }
}

export function onTouchMode(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// The phone held upright: the game wants it on its side (the touch controls' "turn your phone" card)
export const portrait = () => innerHeight > innerWidth;

// Fullscreen and the screen held on its side, asked for on a tap (both need the user's gesture). Android's Chrome gives
// both; an iPhone's Safari has no fullscreen for a page (added to the home screen, the page is fullscreen already:
// index.html's apple-mobile-web-app-capable) and no orientation lock, so there it does nothing.
export function takeScreen() {
  const d = document.documentElement;
  const lock = () => screen.orientation?.lock?.('landscape').catch(() => {});
  try {
    if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
    else lock();
  } catch {
    /* (not offered here) */
  }
}

// A finger has no right button and no double-click of its own (an iPhone's Safari makes neither of a long press or a
// double tap): in touch mode a finger held still on the screens (not the game's own controls) is a right click, and two
// quick taps on the same thing a double-click, so the screens that answer those (Dead Hand's deck, the survivor
// picker) answer a finger too. Where the browser makes one itself (Android's Chrome), only one goes through.
const HOLD_MS = 600;
const DOUBLE_MS = 350;
const SLOP = 12; // px a finger may wander and still be holding still, or tapping the same place
export function installTouchGestures() {
  let press = null; // { id, x, y, target, timer, native }
  let lastTap = null; // { x, y, target, t }
  let madeDbl = 0; // when one was made here: the browser's own, right after, is swallowed
  const ours = (t) => !touchMode() || !t?.closest || t.closest('.layer-touch, #game, input, textarea, select');
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || ours(e.target)) return void (press = null);
      clearTimeout(press?.timer);
      const p = (press = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target, native: false });
      p.timer = setTimeout(() => {
        if (press !== p || p.native) return;
        press = null;
        p.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 2, buttons: 2 }));
      }, HOLD_MS);
    },
    true,
  );
  addEventListener(
    'pointermove',
    (e) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) {
        clearTimeout(press.timer);
        press = null;
      }
    },
    true,
  );
  const end = (e) => {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.timer);
    const p = press;
    press = null;
    if (e.type !== 'pointerup') return;
    const now = performance.now();
    const l = lastTap;
    if (l && now - l.t < DOUBLE_MS && Math.hypot(p.x - l.x, p.y - l.y) < SLOP * 2 && l.target === p.target) {
      lastTap = null;
      madeDbl = now;
      // (after the click this lift makes)
      setTimeout(() => p.target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, detail: 2 })), 0);
    } else lastTap = { x: p.x, y: p.y, target: p.target, t: now };
  };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
  addEventListener(
    'contextmenu',
    (e) => {
      if (e.isTrusted && press) press.native = true;
    },
    true,
  );
  addEventListener(
    'dblclick',
    (e) => {
      if (e.isTrusted && touchMode() && performance.now() - madeDbl < 600) e.stopImmediatePropagation();
    },
    true,
  );
}

// The touch controls, as Settings > Keys & controls lists them in touch mode (ui/keybinds.js): [button names, what it does]
export const TOUCH_CONTROLS = [
  [['Stick'], 'Move: put your left thumb down anywhere on the left. Push it out past its ring to sprint'],
  [['Drag'], 'Look around: drag anywhere on the right, or drag while you hold FIRE or AIM'],
  [['FIRE'], 'Fire / attack. With the hammer out: BUILD opens the ring, PICK takes a piece, PLACE puts it down'],
  [['AIM'], 'Aim: a tap keeps the sights up (guns). STAB with the knife, HEAVY with other melee, ROTATE the piece to build, LEAP as a zombie'],
  [['JUMP'], 'Jump / vault barricades & windows'],
  [['CROUCH'], 'Crouch (a tap: down, another: up)'],
  [['RELOAD'], 'Reload · a flourish, with nunchucks in hand'],
  [['USE'], 'Interact (lights up when there is something to use) · hold: search, revive, start the car'],
  [['1–6'], 'The weapon bar along the top: Primary · Pistol · Melee · Throwable · Build · Walkie-talkie'],
  [['PREV', 'NEXT'], 'With the hammer out: the structure to build. FIRE places it, AIM turns it'],
  [['REMOVE'], 'Demolish (build mode)'],
  [['MENU'], 'The pause menu: settings, invite friends, leave'],
  [['BAG'], 'Inventory & crafting. Hold a stack for its menu, double-tap it to use or equip'],
  [['MAP'], 'Field map (or tap the minimap). Tap the map to set a waypoint'],
  [['LIGHT'], 'Flashlight'],
  [['MORE'], 'Heal, energy drink, last weapon, drop weapon, ping, chat, push to talk, players, leaderboard, bestiary, Dead Hand'],
];
