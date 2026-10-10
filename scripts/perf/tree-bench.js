// What trees being shot cost the server, in node alone: a game on the island with four players, each firing a pistol
// round every tick (20 a second - faster than anyone can) into the trunks round them, at heights about their middle,
// for 1200 ticks. Each tick is timed as a whole, and so is the firing alone; the bytes of events it makes are counted.
// Run on two trees to compare builds:
//   node scripts/perf/tree-bench.js [--before <ref> | <dir> | none] [--rounds 3]
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { REPO, parseArgs, tempWorktree } from '../clip/lib.js';
import { median } from './lib.js';

const args = parseArgs(process.argv.slice(2), { before: 'none', rounds: '3' });
const SEED = 4242;
const TICKS = 1200;

async function one(tree) {
  const imp = (p) => import(pathToFileURL(join(tree, p)).href);
  const { Game } = await imp('server/game.js');
  const { C2S, S2C, PROTOCOL_VERSION, Writer } = await imp('shared/protocol.js');
  const { ITEM } = await imp('shared/defs.js');
  const { COL } = await imp('shared/collision.js');
  const g = new Game({ seed: SEED, godMode: true, log: () => {} });
  let bytes = 0;
  const players = [];
  for (let k = 0; k < 4; k++) {
    const c = { id: 0 };
    c.session = g.onOpen({
      ip: `p${k}`,
      send(b) {
        if (b[0] === S2C.WELCOME) c.id = b[1] | (b[2] << 8);
        else bytes += b.length;
      },
    });
    const w = new Writer(64);
    w.u8(C2S.JOIN);
    w.u8(PROTOCOL_VERSION);
    w.str(`P${k}`);
    g.onMessage(c.session, w.bytes().slice());
    players.push(c);
  }
  for (let i = 0; i < 20; i++) g.update();
  g.combat.forTargets = () => {}; // (nobody in the way: every round meets the tree)
  // the trees round the car, each player given its own
  const trees = g.world.staticGrid.query(g.world.car.x, g.world.car.z, 300, []).filter((c) => c.flags & COL.TREE);
  let rnd = 12345;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) - 1) / 2147483646;
  const ps = players.map((c) => g.players.get(c.id));
  const tick = [];
  const fire = [];
  bytes = 0;
  let n = 0;
  for (let t = 0; t < TICKS; t++) {
    const t0 = performance.now();
    let f = 0;
    for (let k = 0; k < ps.length; k++) {
      const col = trees[(k * 37 + Math.floor(t / 4)) % trees.length]; // (four rounds a tree, then the next)
      const ty = col.y0 + 1 + 1 + r() * 4;
      const ox = col.x + col.r + 2;
      const oy = col.y0 + 2.5;
      const f0 = performance.now();
      g.combat.fire(ps[k], { weapon: ITEM.PISTOL, x: ox, y: oy, z: col.z, yaw: Math.PI / 2, pitch: Math.atan2(ty - oy, col.r + 2), recoilPitch: 0, spread: 0, seed: 1 });
      f += performance.now() - f0;
      n++;
    }
    g.update();
    tick.push(performance.now() - t0);
    fire.push(f);
  }
  const s = (a) => [...a].sort((x, y) => x - y);
  const T = s(tick);
  const F = s(fire);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const broken = (g.world.cut?.size || 0) + (g.world.felled?.length || 0);
  return { tickMean: mean(T), tickP99: T[Math.floor(T.length * 0.99)], fireMean: (mean(F) / ps.length) * 1000, rounds: n, bytesPerSec: bytes / (TICKS / 20) / ps.length, broken };
}

let before = null;
let wt = null;
if (args.before !== 'none') {
  if (existsSync(resolve(String(args.before), 'package.json'))) before = resolve(String(args.before));
  else {
    wt = tempWorktree(String(args.before));
    before = wt.dir;
  }
}
const runs = { before: [], after: [] };
try {
  for (let k = 0; k < +args.rounds; k++) {
    if (before) runs.before.push(await one(before));
    runs.after.push(await one(REPO));
  }
} finally {
  wt?.remove();
}
const m = (label, key) => median(runs[label].map((x) => x[key]));
const rows = [
  ['tick, mean (ms)', 'tickMean', 3],
  ['tick, p99 (ms)', 'tickP99', 3],
  ['a round fired into a tree (µs)', 'fireMean', 1],
  ['bytes a player is sent a second', 'bytesPerSec', 0],
  ['trees broken or down at the end', 'broken', 0],
];
console.log(`| 4 players, a pistol round each every tick into trees, ${TICKS} ticks | ${before ? 'before | after' : 'value'} |`);
console.log(before ? '|---|---|---|' : '|---|---|');
for (const [name, key, d] of rows) console.log(`| ${name} | ${before ? `${m('before', key).toFixed(d)} | ` : ''}${m('after', key).toFixed(d)} |`);
console.log(`\n${args.rounds} rounds, medians; seed ${SEED}; ${process.version}`);
process.exit(0);
