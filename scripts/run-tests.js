// npm test: the syntax check, then every scripts/test-*.js, then the simulations - each in a process of its own, one
// at a time. The tests are found by their names, so a new test-*.js is part of `npm test` with nothing to add to
// package.json (the test line there was one long && chain that every PR adding a test edited, so they all conflicted).
// Every step runs even when one before it fails; the failed ones are listed at the end and the exit code is 1.
// usage: node scripts/run-tests.js
import { readdirSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// (written straight to the file: console.log to a pipe is queued, and spawnSync would hold it back until the end)
const say = (line) => writeSync(1, line + '\n');
const here = dirname(fileURLToPath(import.meta.url));
// run by scripts of their own instead: test:cluster, and posttest (the item guide, after everything else)
const ELSEWHERE = new Set(['test-cluster.js', 'test-itemguide.js']);
const FIRST = ['check.js'];
const LAST = ['sim-act2.js', 'sim-rejoin.js', 'sim-smoke.js'];
const tests = readdirSync(here)
  .filter((f) => /^test-.+\.js$/.test(f) && !ELSEWHERE.has(f))
  .sort();
const steps = [...FIRST, ...tests, ...LAST];

const failed = [];
const t0 = Date.now();
for (const [i, f] of steps.entries()) {
  say(`\n=== [${i + 1}/${steps.length}] node scripts/${f}`);
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(`${f} (${r.signal || `exit ${r.status}`})`);
}
const mins = ((Date.now() - t0) / 60000).toFixed(1);
say(failed.length ? `\n${failed.length} of ${steps.length} FAILED in ${mins} min:\n  ${failed.join('\n  ')}` : `\nall ${steps.length} passed in ${mins} min`);
process.exit(failed.length ? 1 : 0);
