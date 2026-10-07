// The views of Mainland Layout 12 (issue #232) in the real game: one headless browser (lib.js launchChrome: one at a
// time, software rendering), a game server on a free port, straight to the mainland with /map2. Every view is found
// from the world the game built (the same createMainland, in node), the camera put there by game.debugCam, the haze
// thinned for the long ones. Then the field map, opened as a player opens it.
//
// usage: node scripts/clip/layout12-shots.js [--seed 1337] [--out shots/clip/layout12] [--size 1280x720] [--only a,b]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO, OUT, parseArgs, sleep, startGame, launchChrome, LIFE_MAX, list } from './lib.js';
import { createMainland } from '../../shared/mainland.js';
import { ZONE } from '../../shared/defs.js';

const args = parseArgs(process.argv.slice(2), { seed: '1337', out: join(OUT, 'layout12'), size: '1280x720' });
const only = list(args.only);
const out = resolve(args.out);
mkdirSync(out, { recursive: true });
const [W, H] = String(args.size).split('x').map(Number);
const seed = +args.seed;
const w = createMainland(seed);
const F = (f) => (f - 0.5) * w.size;
const ground = (x, z) => w.heightAt(x, z);
const zp = (id) => w.zoneById[id];

// [name, camera [x, y, z], look-at [x, y, z], { fog, far, cycle }]
const views = [];
const view = (name, at, look, o = {}) => views.push([name, at, look, o]);
{
  // arriving: on the bluff behind the car the team came in, the road into Town Center ahead
  const c = w.props.find((p) => p.type === 'car');
  view('01-bridgehead', [c.x - 14, c.y + 3.2, c.z + 3], [c.x + 60, c.y, c.z - 4]);
  // Town Center: down its middle street, Main Street
  const ch = zp(ZONE.CITY).h;
  view('02-town-center', [w.city.x - 150, ch + 1.7, w.city.z + 1], [w.city.x + 40, ch + 7, w.city.z]);
  // the Gas Station, at the fork
  const g = zp(ZONE.TRUCKSTOP);
  view('03-gas-station', [g.x - 40, ground(g.x - 40, g.z + 30) + 3, g.z + 30], [g.x + 4, g.h + 2, g.z]);
  // Pine Lake from its marina's pier
  const m = zp(ZONE.MARINA);
  const px = m.x + Math.sin(m.ry) * 40;
  const pz = m.z + Math.cos(m.ry) * 40;
  view('04-pine-lake', [px, -0.2, pz], [px + Math.sin(m.ry) * 100, -1, pz + Math.cos(m.ry) * 100], { fog: 0.4 });
  // North Pass: the road up to its west mouth
  for (const [name, t] of [['05-north-pass', w.tunnels.find((q) => q.name === 'North Pass')], ['07-east-pass', w.tunnels.find((q) => q.name === 'East Pass')]]) {
    const dx = (t.b[0] - t.a[0]) / t.len;
    const dz = (t.b[1] - t.a[1]) / t.len;
    const [mx, mz] = [t.a[0] + dx * t.s0, t.a[1] + dz * t.s0];
    const back = name === '07-east-pass' ? -1 : 1; // (East Pass from its far end: the airport's side)
    const [ex, ez] = back > 0 ? [mx, mz] : [t.a[0] + dx * t.s1, t.a[1] + dz * t.s1];
    const cx = ex - dx * 45 * back;
    const cz = ez - dz * 45 * back;
    view(name, [cx + dz * 6, ground(cx, cz) + 4, cz - dx * 6], [ex, ground(ex, ez) + 5, ez], { fog: 0.5 });
  }
  // North Ridge Outpost: from its gate, the radio tower over it
  const o = zp(ZONE.OUTPOST);
  view('06-outpost', [o.x + 4, o.h + 3, o.z + 62], [o.x - 6, o.h + 16, o.z - 18], { fog: 0.5 });
  // the airport: on the apron's edge, up the runway past the plane
  const r = w.runway;
  const fx = -Math.sin(r.ry);
  const fz = -Math.cos(r.ry);
  const plane = w.car;
  view('08-airport', [plane.x - fz * 24 - fx * 30, r.y + 5, plane.z + fx * 24 - fz * 30], [plane.x + fx * 120, r.y + 2, plane.z + fz * 120], { fog: 0.4 });
  // South Forest: among the trees by its first camp
  const sf = zp(ZONE.SOUTH_FOREST);
  view('09-south-forest', [sf.x + 22, ground(sf.x + 22, sf.z + 16) + 1.7, sf.z + 16], [sf.x, sf.h + 1, sf.z]);
  // the quarry: from its yard over the pit
  const q = zp(ZONE.AGGREGATES);
  const pit = [F(0.545), F(0.865)];
  view('10-quarry', [q.x, q.h + 6, q.z], [pit[0], q.h - 8, pit[1]], { fog: 0.5 });
  // inside the mines: in the drift by the junction, along it
  const M = w.mine;
  const j = M.jx;
  const k = Math.max(0, j - 14);
  view('11-mines', [M.main.x[k], M.main.y[k] + 1.6, M.main.z[k]], [M.main.x[j + 6], M.main.y[j + 6] + 1.2, M.main.z[j + 6]], { cycle: 0.2 });
  // the river from its bank, by the bridge, downstream
  const br = w.river.bridges[0];
  const f = w.river.flow(br.x, br.z + 60);
  view('12-river', [f.cx + f.dz * 16, ground(f.cx + f.dz * 16, f.cz - f.dx * 16) + 2, f.cz - f.dx * 16], [f.cx + f.dx * 60, -2, f.cz + f.dz * 60], { fog: 0.5 });
  // the Ridge from the city side: from the end of the road at its foot, across the trees to the cliffs
  const rx = F(0.56);
  const rz = F(0.455);
  view('13-ridge', [rx, ground(rx, rz) + 6, rz], [F(0.64), 70, F(0.43)], { fog: 0.3, far: 900 });
  // the mine's west mouth, from the track up from the quarry
  const p0 = M.portals[0];
  view('14-mine-mouth', [p0.x - p0.dx * 24, p0.y + 3, p0.z - p0.dz * 24], [p0.x, p0.y + 2, p0.z]);
}

let game = null;
let chrome = null;
try {
  game = await startGame(REPO, { seed, build: true, env: { NODE_ENV: 'test', DEV_ADMIN: '1' } });
  chrome = await launchChrome({ width: W, height: H, life: LIFE_MAX, storage: { 'stn.settings': JSON.stringify({ quality: 'medium', renderScale: 1 }) } });
  const p = chrome.page;
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await p.goto(game.url, { waitUntil: 'load', timeout: 60000 });
  await sleep(3500);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^\s*(quick )?join/i.test(x.textContent))?.click());
  for (let i = 0; i < 120 && !(await p.evaluate(() => !!(window.__game && window.__game.myId && window.__game.vm))); i++) await sleep(250);
  await sleep(2000);
  await p.evaluate(() => {
    const g = window.__game;
    g.input.locked = true;
    g.input.enabled = true;
    g.input.requestLock = () => {};
    g.input.handlers.onLockChange = () => {};
    g.ui.showPause(false);
  });
  const t0 = Date.now();
  await p.evaluate(() => window.__game.conn.chat('/map2'));
  for (let i = 0; i < 240 && (await p.evaluate(() => window.__game.act)) !== 2; i++) await sleep(250);
  await sleep(6000);
  console.log(`on the mainland after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // the field map, as a player opens it (the HUD up for it)
  if (!only || only.includes('map')) {
    await p.evaluate(() => window.__game.toggleMap(true));
    await sleep(2500);
    await p.screenshot({ path: join(out, '00-field-map.png') });
    const baked = await p.evaluate(() => window.__game.ui.map.baked().toDataURL('image/png'));
    writeFileSync(join(out, '00-field-map-baked.png'), Buffer.from(baked.split(',')[1], 'base64'));
    await p.evaluate(() => window.__game.toggleMap(false));
  }
  await p.addStyleTag({ content: '#ui { visibility: hidden !important; }' });
  const costs = [];
  for (const [name, at, look, o] of views) {
    if (only && !only.some((s) => name.includes(s))) continue;
    await p.evaluate(
      (at, look, cycle, fog, far) => {
        const g = window.__game;
        const dx = look[0] - at[0];
        const dy = look[1] - at[1];
        const dz = look[2] - at[2];
        g.debugCam = { x: at[0], y: at[1], z: at[2], yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
        g.debugCycle = cycle;
        g.debugFog = fog;
        g.weather.force = { kind: 'clear' };
        g.renderer.vmScene.visible = false;
        g.renderer.camera.far = far;
        g.renderer.camera.updateProjectionMatrix();
      },
      at,
      look,
      o.cycle ?? 0.25,
      o.fog,
      o.far ?? 600,
    );
    await sleep(2600);
    await p.screenshot({ path: join(out, `${name}.png`) });
    const c = await p.evaluate(
      () =>
        new Promise((done) => {
          const info = window.__game.renderer.renderer.info;
          info.autoReset = false;
          info.reset();
          requestAnimationFrame(() => {
            const r = [info.render.calls, info.render.triangles];
            info.autoReset = true;
            done(r);
          });
        }),
    );
    costs.push([name, ...c]);
    process.stdout.write(`${name} `);
  }
  console.log('\nview: draw calls, triangles');
  for (const [name, calls, tris] of costs) console.log(`  ${name}: ${calls}, ${tris}`);
  writeFileSync(join(out, 'costs.json'), JSON.stringify(costs));
  if (errors.length) console.log('page errors:\n  ' + [...new Set(errors)].slice(0, 20).join('\n  '));
} finally {
  await chrome?.close().catch((e) => console.error(String(e)));
  game?.stop();
}
