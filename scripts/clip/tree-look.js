// Stills of trees coming down in the trees sandbox (client/sandbox/trees-test.js): each argument is a name and the
// page's query, shot to <out>/<name>.png, and with --sheet they are put on one sheet. One headless browser through
// lib.js's launchChrome, software rendering.
//   node scripts/clip/tree-look.js [--out shots/clip/trees] [--sheet title] [--cols 4] name=how=shot&t=1 ...
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO, parseArgs, startVite, launchChrome, shoot, composeSheets, LIFE_DEFAULT } from './lib.js';

const args = parseArgs(process.argv.slice(2), { out: join(REPO, 'shots', 'clip', 'trees'), w: '640', h: '480', cols: '4' });
const out = resolve(args.out);
mkdirSync(out, { recursive: true });
let vite = null, chrome = null;
try {
  chrome = await launchChrome({ width: +args.w, height: +args.h, life: LIFE_DEFAULT });
  vite = await startVite(REPO);
  const cells = [];
  for (const a of args._) {
    const i = a.indexOf('=');
    const name = a.slice(0, i), q = a.slice(i + 1);
    const file = join(out, `${name}.png`);
    const r = await shoot(chrome.page, `${vite.url}/sandbox/trees-test.html?${q}`, { w: +args.w, h: +args.h, wait: 2500, file, evaluate: () => window.__clip?.text || '' });
    console.log(`${name}: ${r}`);
    cells.push({ img: file, label: name });
  }
  if (args.sheet) await composeSheets(chrome.page, [{ out: join(out, 'sheet.png'), title: args.sheet, cols: +args.cols, cellW: +args.w / 2 | 0, cellH: +args.h / 2 | 0, cells }]);
} finally {
  if (chrome) await chrome.close();
  if (vite) vite.stop();
}
