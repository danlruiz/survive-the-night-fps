// What trees shot down cost a frame, in the trees' own page (client/sandbox/trees-perf.html): the real forest of an
// island at High quality with shadows, the nearest n trees in front of the eye whole, gone, cut down to what stands
// of them, or coming down. The scenes alternate, round after round; the table is the median of the rounds.
// One headless browser through lib.js's launchChrome (software rendering: the times are the CPU drawing for the
// card, slow, but the same for every scene - draws and triangles are what the card is asked for).
//   node scripts/perf/trees-frame.js [--rounds 3] [--n 40] [--frames 120] [--w 960] [--h 540]
import { REPO, parseArgs, startVite, launchChrome, shoot, LIFE_MAX } from '../clip/lib.js';
import { median } from './lib.js';

const args = parseArgs(process.argv.slice(2), { rounds: '3', n: '40', frames: '120', w: '960', h: '540', scenes: 'whole,gone,cut,falling' });
const scenes = String(args.scenes).split(',');
const res = Object.fromEntries(scenes.map((s) => [s, []]));
let vite = null;
let chrome = null;
try {
  chrome = await launchChrome({ width: +args.w, height: +args.h, life: LIFE_MAX });
  vite = await startVite(REPO);
  for (let r = 0; r < +args.rounds; r++) {
    for (const s of scenes) {
      const text = await shoot(chrome.page, `${vite.url}/sandbox/trees-perf.html?scene=${s}&n=${args.n}&frames=${args.frames}`, { w: +args.w, h: +args.h, wait: 500, evaluate: async () => {
        for (let k = 0; k < 600 && !window.__clip; k++) await new Promise((ok) => setTimeout(ok, 500));
        return window.__clip?.text || '';
      } });
      console.error(`round ${r + 1} ${s}: ${text}`);
      res[s].push(JSON.parse(text));
    }
  }
} finally {
  if (chrome) await chrome.close();
  if (vite) vite.stop();
}
const m = (s, k) => median(res[s].map((x) => x[k]));
console.log(`| ${args.n} trees in front of the eye | ${scenes.join(' | ')} |`);
console.log(`|---|${scenes.map(() => '---|').join('')}`);
for (const [name, k, d] of [['frame, median (ms)', 'ms', 1], ['frame, p95 (ms)', 'p95', 1], ['JavaScript of the trees a frame (ms)', 'js', 3], ['draw calls a frame (with the shadow pass)', 'calls', 0], ['...of them the cut trees\'', 'cutDraws', 0], ['triangles a frame', 'tris', 0], ['pieces coming down', 'falling', 0]]) {
  console.log(`| ${name} | ${scenes.map((s) => m(s, k).toFixed(d)).join(' | ')} |`);
}
console.log(`\n${args.rounds} rounds, medians; ${args.w} x ${args.h}, software rendering`);
