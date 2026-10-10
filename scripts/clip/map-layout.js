// The mainland's field map against the layout picture it was built to (issue #232, "Mainland Layout 12"): bakes the
// map in the map sandbox (client/sandbox/map-test.html ?act=2&export=1, through lib.js launchChrome: one headless
// browser, software rendering) and writes, at the same scale,
//   map.png       the baked field map with the places' names in it
//   overlay.png   the picture laid over the map, half see-through
//   side.png      the picture and the map side by side
// The picture is not in the repository: pass it with --picture (a PNG of the whole layout, its frame included).
//
// usage: node scripts/clip/map-layout.js --picture <layout.png> [--seed 1337] [--out shots/clip/map-layout] [--size 1600] [--alpha 0.5]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OUT, REPO, parseArgs, sleep, startVite, launchChrome } from './lib.js';

const args = parseArgs(process.argv.slice(2), { seed: '1337', out: join(OUT, 'map-layout'), size: '1600', alpha: '0.5' });
if (!args.picture) throw new Error('--picture <the layout picture, a PNG> is needed');
const out = resolve(args.out);
mkdirSync(out, { recursive: true });
const picture = 'data:image/png;base64,' + readFileSync(resolve(args.picture)).toString('base64');
const size = +args.size;

let vite = null;
let chrome = null;
try {
  vite = await startVite(REPO);
  chrome = await launchChrome({ width: 1200, height: 900 });
  const p = chrome.page;
  await p.goto(`${vite.url}/sandbox/map-test.html?seed=${args.seed}&act=2&export=1`, { waitUntil: 'load', timeout: 120000 });
  for (let i = 0; i < 240 && !(await p.evaluate(() => !!window.__mapPNG)); i++) await sleep(500);
  const times = await p.evaluate(() => window.__mapTimes);
  const res = await p.evaluate(
    async (map, pic, size, alpha) => {
      const load = (src) => new Promise((ok, no) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = no;
        im.src = src;
      });
      const [m, q] = await Promise.all([load(map), load(pic)]);
      const one = (draw, w = size, h = size) => {
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        draw(cv.getContext('2d'));
        return cv.toDataURL('image/png');
      };
      return {
        map: one((g) => g.drawImage(m, 0, 0, size, size)),
        overlay: one((g) => {
          g.drawImage(m, 0, 0, size, size);
          g.globalAlpha = alpha;
          g.drawImage(q, 0, 0, size, size);
        }),
        side: one((g) => {
          g.fillStyle = '#111';
          g.fillRect(0, 0, size * 2 + 16, size);
          g.drawImage(q, 0, 0, size, size);
          g.drawImage(m, size + 16, 0, size, size);
        }, size * 2 + 16, size),
      };
    },
    await p.evaluate(() => window.__mapPNG),
    picture,
    size,
    +args.alpha,
  );
  for (const k of ['map', 'overlay', 'side']) writeFileSync(join(out, `${k}.png`), Buffer.from(res[k].split(',')[1], 'base64'));
  console.log(`world ${times.world.toFixed(0)} ms, map bake ${times.map.toFixed(0)} ms -> ${out}`);
} finally {
  await chrome?.close().catch((e) => console.error(String(e)));
  vite?.stop();
}
