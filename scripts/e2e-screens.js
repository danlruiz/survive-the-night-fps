// Kit screens e2e (client/ui/screentabs.js): the inventory [I], the field map [M], the perks [P] and the achievements [U]
// are one modal with a tab each. In a live game: each key opens it on its own tab; another tab's key or a click on a tab
// goes there with the pointer left free (no lock asked for in between); the open tab's key, Esc and the close shut it
// and take the mouse back. All four are drawn in the same frame, the row of tabs in the same place. Over the pause menu
// (its Perks row, or [M]), the map, the perks and the achievements swap there and Esc goes back to the menu; the
// Inventory tab puts the menu away. Then each tab at a small and a zoomed-in window: nothing runs off the side, the
// tabs and the close stay on screen, and the map is still a good size.
// usage: node scripts/e2e-screens.js [--root <tree>] [--out shots/clip/screens] [--build]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO, OUT, parseArgs, sleep, startGame, launchChrome, LIFE_MAX, CHEAP_SETTINGS } from './clip/lib.js';

const args = parseArgs(process.argv.slice(2), { out: join(OUT, 'screens') });
const root = args.root ? resolve(args.root) : REPO;
const out = resolve(args.out);
mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, ok, info) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info === undefined ? '' : ' ' + JSON.stringify(info)}`);
};

// what is up: which screen, the open tab, the frame and the row (rounded), the pointer, and the lock asks so far
const STATE = () => {
  const g = window.__game;
  const ui = g.ui;
  const box = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map(Math.round);
  };
  const screen = ui.inventoryOpen ? ui.inventory.root : ui.mapOpen ? ui.map.root : ui.progress.visible ? ui.progress.root : ui.achPanel.visible ? ui.achPanel.root : null;
  const up = [ui.inventoryOpen && 'inventory', ui.mapOpen && 'map', ui.progress.visible && 'perks', ui.achPanel.visible && 'achievements'].filter(Boolean);
  const bar = screen?.querySelector('.scr-bar');
  const on = bar?.querySelector('.scr-tab.on')?.dataset.tab || '';
  const frame = screen && (screen.querySelector('.inv-wrap') || screen.querySelector('.scr-frame'));
  const vw = document.documentElement.clientWidth;
  const tabs = bar ? [...bar.querySelectorAll('.scr-tab')].filter((b) => b.getClientRects().length) : [];
  const close = bar?.querySelector('.scr-close');
  const cr = close?.getBoundingClientRect();
  return {
    up,
    on,
    tabs: tabs.map((b) => b.dataset.tab),
    frame: box(frame),
    bar: box(bar),
    // (nothing of the row past the window's edge or past the row itself)
    fits: !!bar && bar.scrollWidth <= bar.clientWidth + 1 && tabs.every((b) => b.getBoundingClientRect().right <= vw + 0.5) && !!cr && cr.right <= vw + 0.5 && cr.width >= 24,
    pageScroll: document.documentElement.scrollWidth > vw + 1,
    locked: g.input.locked,
    enabled: g.input.enabled,
    asks: window.__asks,
    pause: ui.pauseOpen,
    perksUp: !!g.perksUp,
    achUp: !!g.achUp,
    clock: !!bar?.querySelector('.scr-aside .clock'),
    mapView: ui.mapOpen ? box(ui.map.view) : null,
  };
};

let game = null,
  chrome = null;
try {
  game = await startGame(root, { seed: 1, build: !!args.build });
  chrome = await launchChrome({ width: 1280, height: 720, life: LIFE_MAX, storage: { 'stn.settings': CHEAP_SETTINGS } });
  const p = chrome.page;
  await p.goto(game.url, { waitUntil: 'load', timeout: 60000 });
  await sleep(3500);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^\s*(quick )?join/i.test(x.textContent))?.click());
  for (let i = 0; i < 120 && !(await p.evaluate(() => !!(window.__game && window.__game.myId && window.__game.vm))); i++) await sleep(250);
  await sleep(2500);

  // the mouse: headless Chrome may not take it, so a stand-in that answers at once and counts the asks
  await p.evaluate(() => {
    const inp = window.__game.input;
    const change = (locked) => {
      if (inp.locked === locked) return;
      inp.locked = locked;
      inp.handlers.onLockChange?.(locked);
    };
    window.__asks = 0;
    inp.requestLock = function () {
      window.__asks++;
      if (!this.locked) setTimeout(() => change(true), 20);
    };
    inp.exitLock = function () {
      if (this.locked) setTimeout(() => change(false), 20);
    };
    window.__lock = change;
  });
  const state = () => p.evaluate(STATE);
  const key = async (code) => {
    await p.keyboard.press(code);
    await sleep(400);
  };
  const tab = async (id) => {
    await p.evaluate((id) => [...document.querySelectorAll(`.scr-tab[data-tab=${id}]`)].find((b) => b.getClientRects().length)?.click(), id);
    await sleep(400);
  };
  const shot = (name) => p.screenshot({ path: join(out, name + '.png') });
  await p.evaluate(() => window.__lock(true));
  await sleep(200);

  // the keys, in play: each opens its tab; the others go to theirs with the mouse left free
  const frames = {};
  await key('KeyP');
  let s = await state();
  check('P opens the screen on Perks', s.up.join() === 'perks' && s.on === 'perks' && s.perksUp && !s.locked && !s.enabled, s);
  check('in a run: all four tabs, the clock in the row', s.tabs.join() === 'inventory,map,perks,achievements' && s.clock, s);
  frames.perks = s;
  await shot('perks');
  const asks0 = s.asks;
  await key('KeyI');
  s = await state();
  check('I from Perks: the Inventory tab, Perks gone', s.up.join() === 'inventory' && s.on === 'inventory' && !s.perksUp, s);
  frames.inventory = s;
  await shot('inventory');
  await key('KeyU');
  s = await state();
  check('U from the inventory: the Achievements tab', s.up.join() === 'achievements' && s.on === 'achievements' && s.achUp, s);
  frames.achievements = s;
  await shot('achievements');
  await tab('perks');
  s = await state();
  check('the Perks tab clicked: Perks', s.up.join() === 'perks' && s.perksUp && !s.achUp, s);
  await key('KeyM');
  s = await state();
  check('M from Perks: the Map tab, Perks gone', s.up.join() === 'map' && s.on === 'map' && !s.perksUp && s.clock, s);
  frames.map = s;
  await shot('map');
  await key('KeyI');
  s = await state();
  check('I from the map: the inventory, the map gone', s.up.join() === 'inventory', s);
  await tab('map');
  s = await state();
  check('the Map tab clicked: the map', s.up.join() === 'map', s);
  await tab('achievements');
  s = await state();
  check("the map's Achievements tab: Achievements", s.up.join() === 'achievements' && s.achUp, s);
  await tab('inventory');
  s = await state();
  check('the Inventory tab clicked: the inventory', s.up.join() === 'inventory', s);
  check('going between tabs never asked for the mouse back', s.asks === asks0 && !s.locked && !s.enabled, { asks0, ...s });
  const f = Object.values(frames);
  check('one frame for all four', f.every((x) => JSON.stringify(x.frame) === JSON.stringify(f[0].frame)), Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, v.frame])));
  check('the row of tabs in one place on all four', f.every((x) => JSON.stringify(x.bar) === JSON.stringify(f[0].bar)), Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, v.bar])));

  // shutting it: the open tab's key, Esc, the close
  await key('KeyI');
  s = await state();
  check('I on the Inventory tab shuts it and takes the mouse back', !s.up.length && s.locked && s.enabled && s.asks === asks0 + 1, s);
  await key('KeyU');
  await key('KeyU');
  s = await state();
  check('U twice: open, then shut, the mouse back', !s.up.length && s.locked && s.enabled, s);
  await key('KeyP');
  await key('Escape');
  s = await state();
  check('P then Esc: shut, the mouse back', !s.up.length && s.locked && s.enabled, s);
  await key('KeyU');
  await p.evaluate(() => [...document.querySelectorAll('.scr-close')].find((b) => b.getClientRects().length)?.click());
  await sleep(400);
  s = await state();
  check("Achievements' close: shut, the mouse back", !s.up.length && s.locked && s.enabled, s);
  await key('KeyM');
  await key('KeyM');
  s = await state();
  check('M twice: open, then shut, the mouse back', !s.up.length && s.locked && s.enabled, s);
  await key('KeyM');
  await p.evaluate(() => [...document.querySelectorAll('.scr-close')].find((b) => b.getClientRects().length)?.click());
  await sleep(400);
  s = await state();
  check("the map's close: shut, the mouse back", !s.up.length && s.locked && s.enabled, s);

  // over the pause menu: its Perks row, then the tabs
  const pause = async () => {
    await p.evaluate(() => window.__lock(true));
    await sleep(100);
    await p.evaluate(() => window.__lock(false)); // (Esc, as the browser lets go of the mouse)
    await sleep(300);
  };
  const row = (label) => p.evaluate((label) => [...document.querySelectorAll('.pm-row')].find((b) => b.querySelector('.pm-label')?.textContent === label)?.click(), label);
  await pause();
  await row('Perks');
  await sleep(500);
  s = await state();
  check('Perks from the pause menu: over the menu', s.up.join() === 'perks' && s.pause && !s.perksUp, s);
  await tab('achievements');
  s = await state();
  check('its Achievements tab: Achievements, still over the menu', s.up.join() === 'achievements' && s.pause && !s.achUp, s);
  await key('Escape');
  s = await state();
  check('Esc: back on the pause menu', !s.up.length && s.pause && !s.locked, s);
  await key('KeyM');
  s = await state();
  check('M over the pause menu: the map over it', s.up.join() === 'map' && s.pause && !s.locked, s);
  await tab('perks');
  s = await state();
  check("the map's Perks tab: Perks, still over the menu", s.up.join() === 'perks' && s.pause && !s.perksUp, s);
  await key('KeyM');
  s = await state();
  check('M from Perks over the menu: the map, still over the menu', s.up.join() === 'map' && s.pause, s);
  await key('KeyM');
  s = await state();
  check('M on the map: back on the pause menu', !s.up.length && s.pause && !s.locked, s);
  await row('Perks');
  await sleep(500);
  await tab('inventory');
  s = await state();
  check('its Inventory tab: the inventory, the menu put away', s.up.join() === 'inventory' && !s.pause && !s.locked, s);
  await key('KeyI');
  s = await state();
  check('I: back in the game', !s.up.length && !s.pause && s.locked, s);

  // small windows and zoomed-in ones (1280 x 720 at 150%, at 200%; a phone held sideways)
  for (const [w, h] of [
    [854, 480],
    [640, 360],
    [568, 320],
  ]) {
    await p.setViewport({ width: w, height: h });
    await sleep(500);
    for (const [k, id] of [
      ['KeyI', 'inventory'],
      ['KeyM', 'map'],
      ['KeyP', 'perks'],
      ['KeyU', 'achievements'],
    ]) {
      await key(k);
      s = await state();
      check(`${w}x${h} ${id}: the row fits, no sideways scroll`, s.up.join() === id && s.fits && !s.pageScroll && s.tabs.length === 4, s);
      // (the map square, inside the window, and most of the window's height less the row)
      if (id === 'map') {
        const [x, y, mw, mh] = s.mapView || [];
        check(`${w}x${h} map: square, on screen, ${mh}px tall`, s.mapView && Math.abs(mw - mh) <= 1 && x >= 0 && y >= 0 && x + mw <= w && y + mh <= h && mh >= (h - 80) * 0.7, s.mapView);
      }
      await shot(`${id}-${w}x${h}`);
    }
    await key('KeyU');
    s = await state();
    check(`${w}x${h}: shut`, !s.up.length, s);
  }
} catch (e) {
  failed++;
  console.error(e);
} finally {
  await chrome?.close?.();
  game?.stop?.();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
