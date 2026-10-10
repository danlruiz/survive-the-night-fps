// What a player feels of the mainland, one build against another (issue #232: Mainland Layout 12 against the 1280 m
// mainland it replaced): the time from the crossing's world swap (the admin's /map2) to the mainland being drawn, the
// memory the page holds then, and at three scenes - the bridgehead, the city's main street, the thickest woods - the
// JavaScript and the GPU's time a frame, the draw calls and the triangles. Each scene is found from that build's own
// world (the same seed), so the two maps are compared like for like. Capped (vsync on: lib.js launchChrome with the real
// GPU, as bench.js --capped): frame rates mean nothing, the work a frame takes does. The builds alternate, the table is
// the median of the rounds.
//
// usage: node scripts/perf/layout12-compare.js --before <dir of the other build> [--rounds 3] [--seconds 4] [--out shots/perf/layout12]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, parseArgs, sleep, startGame, launchChrome } from '../clip/lib.js';
import { SEED, DAY, INSTRUMENT, chat, loadMenu, join as joinGame, stand, measure, median } from './lib.js';

const args = parseArgs(process.argv.slice(2), { rounds: '3', seconds: '4', out: join(REPO, 'shots', 'perf', 'layout12') });
if (!args.before) throw new Error('--before <dir of the build to compare against> is needed');
const OUT = resolve(args.out);
mkdirSync(OUT, { recursive: true });
const trees = [['before', resolve(String(args.before))], ['after', REPO]];

// the scenes of a build's mainland, from its own world
async function scenesOf(tree) {
  const { worldFor } = await import(pathToFileURL(join(tree, 'shared/worlds.js')).href);
  const w = worldFor(SEED, 2);
  const C = w.city;
  const G2 = (C.grid * C.pitch) / 2;
  // the thickest woods: the 24 m cell with the most trees, off the roads, on dry ground
  const cells = new Map();
  const T = w.trees;
  for (let i = 0; i < T.length; i += 6) {
    const k = `${Math.floor(T[i] / 24)},${Math.floor(T[i + 2] / 24)}`;
    cells.set(k, (cells.get(k) || 0) + 1);
  }
  let best = null;
  for (const [k, n] of [...cells].sort((a, b) => b[1] - a[1])) {
    const [i, j] = k.split(',').map(Number);
    const x = (i + 0.5) * 24;
    const z = (j + 0.5) * 24;
    if (w.roadDistAt(x, z) > 6 && w.heightAt(x, z) > 0 && (!w.cliffAt || w.cliffAt(x, z) < -10)) {
      best = { at: [x, z], yaw: 0.8, pitch: 0, trees: n };
      break;
    }
  }
  return {
    bridgehead: { at: [w.start.x + 4, w.start.z], yaw: -Math.PI / 2, pitch: 0 },
    street: { at: [C.x - G2 + 30, C.z], yaw: -Math.PI / 2, pitch: 0.02 },
    woods: best,
  };
}

async function session(name, tree) {
  const res = { name, scenes: {} };
  let game = null, chrome = null;
  try {
    const sc = await scenesOf(tree);
    game = await startGame(tree, { seed: SEED, env: { NODE_ENV: 'test', DEV_ADMIN: '1' } });
    chrome = await launchChrome({ width: 1280, height: 720, gpu: true, storage: { 'stn.settings': JSON.stringify({ quality: 'high', renderScale: 1 }), 'stn.character': '3', 'stn.name': 'bench' } });
    const page = chrome.page;
    await page.evaluateOnNewDocument(INSTRUMENT);
    await loadMenu(page, game.url);
    await joinGame(page);
    // the world swap: the mainland built and drawn, from the moment the server is asked for it
    const t0 = await page.evaluate(() => performance.now());
    await chat(page, '/map2');
    let swapMs = 0;
    for (let i = 0; i < 1200; i++) {
      const s = await page.evaluate(() => ({ act: window.__game.act, warm: window.__game.warm, t: performance.now() }));
      if (s.act === 2 && !s.warm) {
        swapMs = s.t - t0;
        break;
      }
      await sleep(50);
    }
    res.swapMs = swapMs;
    await sleep(3000);
    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.collectGarbage');
    const h = await cdp.send('Runtime.getHeapUsage');
    res.heapMB = (h.usedSize + (h.backingStorageSize || 0)) / 1048576;
    await cdp.detach().catch(() => {});
    res.gpuMem = await page.evaluate(() => window.__bench.gpuMem());
    for (const [k, spot] of Object.entries(sc)) {
      if (!spot) continue;
      await stand(page, spot, DAY);
      await sleep(3500);
      const m = await measure(page, +args.seconds);
      res.scenes[k] = { jsMs: m.jsMs, gpuMs: m.gpuMs, calls: m.calls, tris: m.tris };
      console.log(`  ${name} ${k.padEnd(10)} js ${m.jsMs?.toFixed(2)} gpu ${m.gpuMs?.toFixed(2) ?? 'n/a'} calls ${m.calls} tris ${(m.tris / 1e6).toFixed(2)}M`);
    }
  } finally {
    await chrome?.close().catch((e) => console.error(String(e)));
    game?.stop();
  }
  return res;
}

const runs = [];
for (let r = 0; r < +args.rounds; r++) {
  for (const [name, tree] of r % 2 ? [...trees].reverse() : trees) {
    const res = await session(name, tree);
    res.round = r;
    runs.push(res);
    console.log(`round ${r} ${name}: world swap ${(res.swapMs / 1000).toFixed(2)} s, page ${res.heapMB.toFixed(0)} MB`);
  }
}
writeFileSync(join(OUT, 'runs.json'), JSON.stringify(runs, null, 1));
// the medians, in a table
const med = (name, f) => median(runs.filter((x) => x.name === name).map(f).filter((v) => v !== null && v !== undefined && Number.isFinite(v)));
const row = (label, f, fmt) => `| ${label} | ${fmt(med('before', f))} | ${fmt(med('after', f))} |`;
const ms = (v) => (v === null ? 'n/a' : v.toFixed(2) + ' ms');
const lines = ['| | before | after |', '|---|---|---|'];
lines.push(row('world swap after the crossing (/map2 to drawn)', (x) => x.swapMs / 1000, (v) => v.toFixed(2) + ' s'));
lines.push(row('page memory (heap and its buffers)', (x) => x.heapMB, (v) => v.toFixed(0) + ' MB'));
for (const k of ['bridgehead', 'street', 'woods']) {
  lines.push(row(`${k}: JavaScript a frame`, (x) => x.scenes[k]?.jsMs, ms));
  lines.push(row(`${k}: GPU a frame`, (x) => x.scenes[k]?.gpuMs, ms));
  lines.push(row(`${k}: draw calls`, (x) => x.scenes[k]?.calls, (v) => String(Math.round(v))));
  lines.push(row(`${k}: triangles`, (x) => x.scenes[k]?.tris, (v) => (v / 1e6).toFixed(2) + ' M'));
}
const table = lines.join('\n');
writeFileSync(join(OUT, 'table.md'), table + '\n');
console.log('\n' + table);
