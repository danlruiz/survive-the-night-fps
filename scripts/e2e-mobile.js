// Touch mode e2e: the game played on a phone (game/touchmode.js, ui/touchpad.js). A phone-sized page with touch
// emulated (a landscape 844 x 390 by default) joins with a tap, and is driven by fingers alone (multi-touch through the
// DevTools protocol): the stick walks and sprints, a drag turns the view, the buttons fire, aim, jump, crouch, reload,
// pick up and build, the weapon bar switches weapons, and the bag, the map, the menu and the screens behind it open,
// work and close with taps. Each step is checked, and stills go to the out dir.
// usage: node scripts/e2e-mobile.js [--root <tree>] [--out shots/clip/mobile] [--build] [--w 844 --h 390]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OUT, REPO, parseArgs, sleep, startGame, launchChrome, LIFE_MAX } from './clip/lib.js';

const args = parseArgs(process.argv.slice(2), { out: join(OUT, 'mobile'), w: 844, h: 390 });
const root = args.root ? resolve(args.root) : REPO;
const out = resolve(args.out);
const W = +args.w, H = +args.h;
mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
// a phone's first visit: no settings kept yet (settings.js picks the low preset for a touch device)
const STORAGE = {};

let failed = 0;
const check = (name, ok, info) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || info === undefined ? '' : ' ' + JSON.stringify(info)}`);
};

let game = null, chrome = null;
try {
  game = await startGame(root, { seed: 1, build: !!args.build });
  chrome = await launchChrome({ width: W, height: H, life: LIFE_MAX, storage: STORAGE });
  const p = chrome.page;
  await p.setUserAgent(UA);
  await p.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });

  // ---- fingers: id -> [x, y]. Every event carries all the fingers down (the protocol works out what changed)
  const down = new Map();
  // (at: the event's own time, s. A tap's two halves are given times 60 ms apart: here a frame takes the better part of a
  // second, and the game tells a tap from a hold by those times)
  const send = (type, at) => cdp.send('Input.dispatchTouchEvent', { type, ...(at ? { timestamp: at } : {}), touchPoints: type === 'touchEnd' ? [] : [...down].map(([id, [x, y]]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const finger = {
    async down(id, x, y, at) {
      down.set(id, [x, y]);
      await send('touchStart', at);
    },
    async move(id, x, y) {
      down.set(id, [x, y]);
      await send('touchMove');
    },
    async up(id, at) {
      down.delete(id);
      await send(down.size ? 'touchMove' : 'touchEnd', at);
    },
    // a drag in steps
    async drag(id, x0, y0, x1, y1, steps = 8, ms = 16) {
      await this.down(id, x0, y0);
      for (let i = 1; i <= steps; i++) {
        await this.move(id, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
        await sleep(ms);
      }
    },
    async tap(x, y, hold = 60) {
      const t = Date.now() / 1000;
      await this.down(9, x, y, t);
      await sleep(hold);
      await this.up(9, Math.max(t + hold / 1000, hold > 300 ? Date.now() / 1000 : 0));
    },
  };
  // the middle of an element on the page
  const at = (sel) =>
    p.evaluate((sel) => {
      // (the first one shown)
      const n = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().width);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    }, sel);
  const atText = (sel, re) =>
    p.evaluate(
      (sel, src) => {
        const re = new RegExp(src, 'i');
        const n = [...document.querySelectorAll(sel)].find((x) => re.test(x.textContent) && x.getBoundingClientRect().width);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      },
      sel,
      re.source,
    );
  const tapOn = async (sel, re) => {
    const xy = re ? await atText(sel, typeof re === 'string' ? new RegExp(re, 'i') : re) : await at(sel);
    if (!xy) return false;
    await finger.tap(xy[0], xy[1]);
    return true;
  };
  const shot = (name) => p.screenshot({ path: join(out, name + '.png') });
  const st = () =>
    p.evaluate(() => {
      const g = window.__game;
      const s = g.prediction.state;
      return { x: s.x, y: s.y, z: s.z, yaw: g.input.yaw, pitch: g.input.pitch, slot: s.slot, locked: g.input.locked, enabled: g.input.enabled, buttons: g.input.buttons, crouch: !!s.crouch, sprint: !!s.sprinting, pause: g.ui.pauseOpen, inv: g.ui.inventoryOpen, map: g.ui.mapOpen, pad: g.touchpad.on };
    });

  await p.goto(game.url, { waitUntil: 'load', timeout: 60000 });
  await sleep(3000);
  const mode = await p.evaluate(() => ({ touch: document.documentElement.classList.contains('touch'), quality: window.__game.settings.quality }));
  check('a phone is seen as one: touch mode on, the low preset', mode.touch && mode.quality === 'low', mode);
  await shot('01-splash');
  // (headless Chrome draws in software, a few frames a second: half the pixels makes it a few more)
  await p.evaluate(() => window.__game.ui._applySettings({ ...window.__game.ui.settings, renderScale: 0.5 }));
  // the splash on a phone held on its side: Quick join is on screen, and a tap on it joins
  const joinXY = await at('.sp-joinbtn');
  check("Quick join is on screen", !!joinXY && joinXY[1] < H && joinXY[0] < W, joinXY);
  if (joinXY) await finger.tap(joinXY[0], joinXY[1]);
  await sleep(500);
  for (let i = 0; i < 120 && !(await p.evaluate(() => !!(window.__game && window.__game.myId && window.__game.vm))); i++) await sleep(250);
  await sleep(3000);
  let s = await st();
  check('a tap on Join plays: the touch controls are up', s.locked && s.enabled && s.pad && !s.pause, s);
  await shot('02-ingame');

  // ---- the stick: forward walks, pushed out sprints
  const sx = 130, sy = H - 110;
  s = await st();
  await finger.drag(1, sx, sy, sx, sy - 40, 6);
  await sleep(1200);
  let s2 = await st();
  const walked = Math.hypot(s2.x - s.x, s2.z - s.z);
  check('the stick walks', walked > 1.5, { walked });
  await finger.move(1, sx, sy - 70);
  await finger.move(1, sx, sy - 90);
  await sleep(1200); // (software rendering: a few frames a second, and input is handed over on a frame)
  s2 = await st();
  check('pushed out past its ring, it sprints', s2.sprint, s2);
  await shot('03-sprint');
  await finger.up(1);
  await sleep(300);
  s = await st();
  check('let go, nothing is held', s.buttons === 0, s);

  // ---- the minimap on a 2x screen (a phone's): its canvases square, so the disc is not stretched to twice its height
  await p.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await sleep(1500);
  // (a new one, as the page makes it on a phone: its canvases start at the browser's 300 x 150)
  const mmc = await p.evaluate(() => {
    const Minimap = window.__game.ui.hud.minimap.constructor;
    const box = document.createElement('div');
    box.className = 'stn-ui';
    box.style.cssText = 'position:fixed;left:0;top:0;opacity:0;--mm:150px';
    document.body.appendChild(box);
    const m = new Minimap(box);
    m.root.hidden = false;
    m._resize(); // (what its ResizeObserver runs: here a frame takes the better part of a second)
    const out = [m.cv.width, m.cv.height, m.en.width, m.en.height, m.size, devicePixelRatio];
    box.remove();
    return out;
  });
  check('the minimap at 2x: its canvases are square, at twice its size', mmc[0] === mmc[1] && mmc[2] === mmc[3] && mmc[0] === mmc[4] * Math.min(2, mmc[5]) && mmc[5] === 2, mmc);
  await p.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await sleep(1000);

  // ---- what the buttons say: the knife's AIM is a stab
  const says = (act) => p.evaluate((act) => document.querySelector(`.layer-touch [data-act="${act}"] .tb-txt`).textContent, act);
  check('the knife in hand: AIM says STAB', (await says('aim')) === 'STAB', await says('aim'));

  // ---- a tap on the minimap opens the field map
  const mm = await at('.mmap');
  await finger.tap(...mm);
  await sleep(1500);
  s = await st();
  check('a tap on the minimap opens the field map', s.map && !s.pad, s);
  await tapOn('.mapscr .scr-close');
  await sleep(1200);
  s = await st();
  check('...and its cross takes it back to play', !s.map && s.pad, s);

  // ---- a drag on the right turns the view
  s = await st();
  await finger.drag(2, W * 0.6, H * 0.4, W * 0.6 + 120, H * 0.4 + 30, 8);
  await finger.up(2);
  s2 = await st();
  check('a drag turns the view', Math.abs(s2.yaw - s.yaw) > 0.2 && s2.pitch < s.pitch, { dyaw: s2.yaw - s.yaw, dpitch: s2.pitch - s.pitch });

  // ---- walk and turn at once (two fingers)
  s = await st();
  await finger.down(1, sx, sy);
  await finger.move(1, sx, sy - 45);
  await finger.drag(2, W * 0.6, H * 0.5, W * 0.6 - 100, H * 0.5, 10, 30);
  await sleep(500);
  s2 = await st();
  check('two fingers: walking and turning together', Math.hypot(s2.x - s.x, s2.z - s.z) > 0.5 && Math.abs(s2.yaw - s.yaw) > 0.2, { moved: Math.hypot(s2.x - s.x, s2.z - s.z), dyaw: s2.yaw - s.yaw });
  await finger.up(2);
  await finger.up(1);
  await sleep(200);

  // ---- a gun: the weapon bar, FIRE, AIM, RELOAD
  const chat = (t) => p.evaluate((t) => window.__game.conn.chat(t), t);
  await p.evaluate(() => {
    const g = window.__game;
    g.seen = [];
    const on = g.onLocalEvents.bind(g);
    g.onLocalEvents = (evs, s) => {
      for (const ev of evs) if (ev.type === 'fire' || ev.type === 'melee') g.seen.push({ type: ev.type, aiming: !!ev.aiming });
      return on(evs, s);
    };
  });
  const seen = () => p.evaluate(() => window.__game.seen.splice(0));
  await chat('/give 63 1'); // an M4
  await chat('/give 74 90'); // ...and its rounds
  await chat('/give 1 30'); // wood...
  await chat('/give 5 30'); // ...and nails, to build with
  await sleep(800);
  await p.evaluate(() => {
    const g = window.__game;
    const i = g.inventory.slots.findIndex((x) => x && x.item === 63);
    if (i >= 0) g.conn.action(5, i);
  });
  await sleep(1000);
  const slotXY = (i) => p.evaluate((i) => { const r = window.__game.ui.hud.slotEls[i].row.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, i);
  await finger.tap(...(await slotXY(0)));
  await sleep(1500);
  s = await st();
  check('a tap on the weapon bar takes the M4 out', s.slot === 0, s);
  check('...and AIM says AIM again', (await says('aim')) === 'AIM', await says('aim'));
  await shot('04-gun');
  const btn = (act) => at(`.layer-touch [data-act="${act}"]`);
  const mag0 = await p.evaluate(() => window.__game.prediction.state.mags[0]);
  const fireXY = await btn('fire');
  await finger.down(3, ...fireXY);
  await sleep(700);
  // (and a drag from FIRE turns the view while it fires)
  s = await st();
  for (let i = 1; i <= 6; i++) {
    await finger.move(3, fireXY[0] - i * 12, fireXY[1]);
    await sleep(40);
  }
  await finger.up(3);
  await sleep(1200);
  s2 = await st();
  const mag1 = await p.evaluate(() => window.__game.prediction.state.mags[0]);
  let fired = (await seen()).filter((e) => e.type === 'fire');
  check('FIRE held fires', mag1 < mag0 && fired.length > 0, { mag0, mag1, fired: fired.length });
  check('a drag from FIRE turns the view', Math.abs(s2.yaw - s.yaw) > 0.1, { dyaw: s2.yaw - s.yaw });

  await finger.tap(...(await btn('aim')));
  await sleep(1200);
  let aim = await p.evaluate(() => ({ held: window.__game.input.held('aim'), aimT: window.__game.aimT, lit: document.querySelector('.tb-aim').classList.contains('lit') }));
  check('a tap on AIM keeps the sights up', aim.held && aim.aimT > 0.5 && aim.lit, aim);
  await finger.tap(...fireXY);
  await sleep(1200);
  fired = (await seen()).filter((e) => e.type === 'fire');
  check('...and a shot then is aimed', fired.length > 0 && fired.every((e) => e.aiming), fired);
  await shot('05-aim');
  await finger.tap(...(await btn('aim')));
  await sleep(1200);
  aim = await p.evaluate(() => ({ held: window.__game.input.held('aim'), aimT: window.__game.aimT }));
  check('another tap lets them down', !aim.held && aim.aimT < 0.5, aim);

  // (a magazine emptied by FIRE held reloads by itself: let that finish, and fire one so there is something to reload)
  for (let i = 0; i < 20 && (await p.evaluate(() => window.__game.prediction.state.reloadT > 0)); i++) await sleep(500);
  await finger.tap(...fireXY);
  await sleep(1500);
  await finger.tap(...(await btn('reload')));
  await sleep(500);
  const rl = await p.evaluate(() => window.__game.prediction.state.reloadT);
  check('RELOAD reloads', rl > 0, { reloadT: rl });
  await sleep(3500);

  // ---- JUMP, CROUCH
  const y0 = (await st()).y;
  await finger.down(4, ...(await btn('jump')));
  let top = y0;
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    top = Math.max(top, (await st()).y);
  }
  await finger.up(4);
  check('JUMP jumps', top > y0 + 0.3, { y0, top });
  await sleep(1200);
  await finger.tap(...(await btn('crouch')));
  await sleep(1200);
  s = await st();
  check('a tap on CROUCH crouches, and it stays down', s.crouch, s);
  await finger.tap(...(await btn('crouch')));
  await sleep(1200);
  s = await st();
  check('another tap stands up', !s.crouch, s);

  // ---- DROP (held, from MORE) and USE to pick it up again
  await finger.tap(...(await btn('more')));
  await sleep(900);
  check('MORE opens the rest of the actions', await p.evaluate(() => !document.querySelector('.tp-more').hidden));
  await shot('06-more');
  await finger.down(5, ...(await btn('drop')));
  await sleep(4000); // (DROP_HOLD of the game's time, which a few frames a second, each at most 0.1 s, makes slow)
  await finger.up(5);
  await sleep(1500);
  let w = await p.evaluate(() => window.__game.prediction.state.weapons[0]);
  check('DROP held drops the gun', w === 0, { w });
  // look down at it, and USE
  for (let k = 0; k < 8; k++) {
    await p.evaluate((k) => (window.__game.input.pitch = -1.4 + k * 0.15), k);
    await sleep(900);
    if (await p.evaluate(() => /^\[USE\]/.test(window.__game.prompt || ''))) break;
  }
  const prompt = await p.evaluate(() => ({ prompt: window.__game.prompt, lit: document.querySelector('.tb-use').classList.contains('lit') }));
  check('looking at it, the prompt names USE and the button lights up', /^\[USE\]/.test(prompt.prompt || '') && prompt.lit, prompt);
  await shot('07-use');
  await finger.tap(...(await btn('interact')), 200);
  await sleep(1500);
  w = await p.evaluate(() => window.__game.prediction.state.weapons[0]);
  check('USE picks it up again', w === 63, { w });
  await p.evaluate(() => (window.__game.input.pitch = 0));

  // ---- build: the hammer, the ring, a piece placed
  await finger.tap(...(await slotXY(4)));
  await sleep(1500);
  s = await st();
  const shown = await p.evaluate(() => getComputedStyle(document.querySelector('.tb-bnext')).display !== 'none');
  check('the hammer out: the build buttons are up', s.slot === 4 && shown, { slot: s.slot, shown });
  await finger.tap(...fireXY);
  await sleep(1200);
  const ring = await p.evaluate(() => !!window.__game.buildMenu);
  check('FIRE opens the ring', ring);
  await shot('08-ring');
  const seg = await p.evaluate(() => {
    const n = [...document.querySelectorAll('.bradial .br-seg')].find((x) => /barricade/i.test(x.textContent));
    const r = n.querySelector('.br-seg-in').getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2, n.dataset.type];
  });
  await finger.tap(seg[0], seg[1]);
  await sleep(1200);
  const picked = await p.evaluate(() => ({ picked: window.__game.buildPicked, type: window.__game.buildType, menu: !!window.__game.buildMenu }));
  check('a tap on a piece of the ring picks it', picked.picked && !picked.menu && String(picked.type) === seg[2], { picked, seg });
  await sleep(500);
  check('a piece picked: FIRE says PLACE and AIM says ROTATE', (await says('fire')) === 'PLACE' && (await says('aim')) === 'ROTATE', [await says('fire'), await says('aim')]);
  await p.evaluate(() => (window.__game.input.pitch = -0.35));
  await sleep(800);
  const wood0 = await p.evaluate(() => window.__game.invCounts()[1] | 0);
  await finger.tap(...fireXY);
  await sleep(2000);
  const wood1 = await p.evaluate(() => window.__game.invCounts()[1] | 0);
  check('FIRE places it', wood1 < wood0, { wood0, wood1 });
  await shot('09-built');
  await finger.tap(...(await btn('buildNext')));
  await sleep(800);
  const next = await p.evaluate(() => window.__game.buildType);
  check('NEXT steps to the next structure', String(next) !== seg[2], { next });
  await finger.tap(...(await slotXY(0)));
  await sleep(1200);

  // ---- the bag
  await finger.tap(...(await btn('inventory')));
  await sleep(1200);
  s = await st();
  check('BAG opens the inventory, and the touch controls step aside', s.inv && !s.pad && !s.pause, s);
  await shot('10-bag');
  // (a stack held for its menu: with the bag fitted to a phone, the PR after this one)
  await tapOn('.ux-inv .scr-close');
  await sleep(1200);
  s = await st();
  check('Close: back to play, controls up', !s.inv && s.pad && s.locked, s);

  // ---- the map: a tap sets a waypoint
  await finger.tap(...(await btn('map')));
  await sleep(1500);
  s = await st();
  check('MAP opens the map', s.map && !s.pad, s);
  const mapXY = await at('.map-canvas, .mapscreen canvas, canvas.map-c');
  if (mapXY) {
    await finger.tap(mapXY[0] + 30, mapXY[1] + 10);
    await sleep(900);
  }
  const wp = await p.evaluate(() => !!window.__game.waypoint);
  check('a tap on the map sets a waypoint', wp, { mapXY });
  await shot('12-map');
  await tapOn('.mapscr .scr-close');
  await sleep(1200);
  s = await st();
  check('its cross shuts it, back to play', !s.map && s.pad, s);

  // ---- MENU: the pause menu, settings, controls, back
  await finger.tap(...(await btn('pause')));
  await sleep(1200);
  s = await st();
  check('MENU opens the pause menu', s.pause && !s.pad, s);
  await shot('13-pause');
  await tapOn('.pm-row', '^Settings');
  await sleep(1000);
  check('Settings opens over it', await p.evaluate(() => window.__game.ui.settingsPanel.visible));
  await shot('14-settings');
  await tapOn('.stn-settings .set-close');
  check('...and its cross shuts it', !(await p.evaluate(() => window.__game.ui.settingsPanel.visible)));
  await sleep(600);
  await tapOn('.pm-row', 'Keys & controls');
  await sleep(1000);
  const ctl = await p.evaluate(() => document.querySelector('.stn-settings .kb-sec .ux-kb-group:not([hidden])')?.textContent || '');
  check('Keys & controls lists the touch controls', /STICK|Stick/.test(ctl) && /USE/.test(ctl), ctl.slice(0, 80));
  await shot('15-controls');
  await tapOn('.stn-settings .set-close');
  await sleep(600);
  await tapOn('.pm-row', 'Back to the game');
  await sleep(1200);
  s = await st();
  check('Back to the game: play, controls up', !s.pause && s.pad && s.locked && s.enabled, s);

  // ---- the screens behind MORE: leaderboard, bestiary, Dead Hand
  for (const [act, sel, name] of [
    ['board', '.lb, .leaderboard', 'leaderboard'],
    ['bestiary', '.bestiary', 'bestiary'],
    ['cards', '.cards-screen, .cd-screen', 'cards'],
  ]) {
    await finger.tap(...(await btn('more')));
    await sleep(700);
    await finger.tap(...(await btn(act)));
    await sleep(1500);
    const open = await p.evaluate((act) => ({ board: window.__game.ui.boardOpen, bestiary: window.__game.ui.bestiaryOpen, cards: window.__game.ui.cardsOpen })[act], act);
    check(`MORE > ${act} opens the ${name}`, open);
    await shot(`16-${name}`);
    const closed = await tapOn('.layer-modal .map-close:not([hidden])');
    await sleep(1200);
    s = await st();
    check(`...and its cross shuts it`, closed && s.pad && s.locked, s);
  }

  // ---- chat: CHAT, type, Send
  await finger.tap(...(await btn('more')));
  await sleep(700);
  await finger.tap(...(await btn('chat')));
  await sleep(900);
  const typing = await p.evaluate(() => window.__game.ui.isTyping());
  check('CHAT opens the chat box', typing);
  await p.keyboard.type('hello from a phone');
  await shot('17-chat');
  await tapOn('.chat-send');
  await sleep(1500);
  const said = await p.evaluate(() => [...document.querySelectorAll('.chat-line')].some((l) => /hello from a phone/.test(l.textContent)));
  s = await st();
  check('Send sends it, and play goes on', said && s.pad && !(await p.evaluate(() => window.__game.ui.isTyping())), { said, s });

  // ---- held upright: the turn-your-phone card
  await p.setViewport({ width: H, height: W, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await sleep(1500);
  const turn = await p.evaluate(() => document.querySelector('.tp-turn').classList.contains('on'));
  check('held upright, the game asks for the phone on its side', turn);
  await shot('18-portrait');
  await p.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await sleep(1500);
  check('...and on its side again, it goes', !(await p.evaluate(() => document.querySelector('.tp-turn').classList.contains('on'))));

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await chrome?.close().catch((e) => console.error(e.message));
  game?.stop();
}
process.exit(failed ? 1 : 0);
