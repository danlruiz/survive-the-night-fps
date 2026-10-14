// Hand-numbered wire ids (docs/merge-conflicts.md, "Hand-picked ids"): every table of them is made through uniqueIds
// (shared/ids.js; shared/protocol.js has its own copy), so two names on one number stop the game from loading. This
// checks that the guard throws, that protocol.js still loads importing nothing (server/builds.js loads an older
// build's copy of it on its own), and prints the next free id of each table for whoever adds one.
// usage: node scripts/test-wire-ids.js
import { readFileSync } from 'node:fs';
import { uniqueIds } from '../shared/ids.js';
import * as defs from '../shared/defs.js';
import * as protocol from '../shared/protocol.js';

const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};

let threw = '';
try {
  uniqueIds('TEST', { A: 1, B: 2, C: 1 });
} catch (err) {
  threw = err.message;
}
check('two names on one id throw', threw === 'TEST.C and TEST.A are both 1', threw);
const t = { A: 1, B: 2 };
check('...and a table without a clash comes back as it was', uniqueIds('TEST', t) === t);

const src = readFileSync(new URL('../shared/protocol.js', import.meta.url), 'utf8');
check('shared/protocol.js imports nothing (an older build loads its copy alone)', !/^\s*import\b/m.test(src) && !/\bimport\(/.test(src));

const tables = {
  ...Object.fromEntries(['ITEM', 'SOUND', 'ZTYPE', 'EVT', 'NOTIFY', 'STRUCT', 'PROJ', 'AREA', 'CONT', 'ZONE', 'IMPACT', 'HEARD', 'ZANIM', 'CANIM'].map((k) => [k, defs[k]])),
  ...Object.fromEntries(['C2S', 'S2C', 'ACT', 'ENT', 'HOLD', 'PFLAG', 'PSTAT', 'ZSTATUS', 'CARDOP', 'CARDMSG', 'REJECT_REASON'].map((k) => [k, protocol[k]])),
};
for (const [name, table] of Object.entries(tables)) {
  const ids = Object.values(table);
  const clash = ids.length !== new Set(ids).size;
  const top = Math.max(...ids);
  check(`${name}: every id its own`, !clash, `(${ids.length} ids, the highest ${top}: next free ${name === 'PFLAG' || name === 'PSTAT' || name === 'ZSTATUS' ? top * 2 : top + 1})`);
}
// the ids with a ceiling of their own
const weaponTop = Math.max(...Object.values(defs.ITEM).filter((id) => defs.WEAPONS[id]));
check('weapons: the 50-69 block is full, so a new one takes an id from 100 (u8)', weaponTop <= 255, `(the highest weapon ${weaponTop}: next free ${Math.max(100, weaponTop + 1)})`);
const ztop = Math.max(...Object.values(defs.ZTYPE));
check('zombie kinds: a bestiary record is a bit per ZTYPE, which holds 31', ztop <= 30, `(the highest ${ztop})`);

if (fails.length) {
  console.log(`\n${fails.length} FAILED`);
  process.exit(1);
}
console.log('\nall wire id checks passed');
