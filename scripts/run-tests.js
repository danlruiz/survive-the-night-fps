// npm test: the syntax check, then every scripts/test-*.js, then the simulations - each in a process of its own, one
// at a time. The tests are found by their names, so a new test-*.js is part of `npm test` with nothing to add to
// package.json (the test line there was one long && chain that every PR adding a test edited, so they all conflicted).
// Every step runs even when one before it fails; the failed ones are listed at the end and the exit code is 1.
// A few slow sweeps (NIGHTLY, about 14 of the 29 minutes) are left out of the per-PR run, for a nightly job to run with
// --nightly, and by hand with it when a change touches what they cover.
// Each step has STEP_MS to finish: one that hangs is killed and counted as failed, and the rest still run.
// usage: node scripts/run-tests.js              the per-PR set (npm test)
//        node scripts/run-tests.js --nightly    only the nightly sweeps (npm run test:nightly)
//        node scripts/run-tests.js --all        both
//        node scripts/run-tests.js test-cards.js sim-act2.js ...   just these steps
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
// many seeds, team sizes or a whole two-act playthrough each: sweeps, not checks a PR needs every time (issue #351).
// test-layout12.js still checks the mainland's layout on a few seeds per PR.
//   test-vehicles.js  seats for every team size on two dozen seeds (~9 min) - vehicles, cars, the garage
//   test-mainland.js  the mainland generated for many seeds (~2.5 min) - mainland.js, the places on it
//   sim-act2.js       a full playthrough of both acts (~2.5 min) - acts, the boat, the end of the run
const NIGHTLY = new Set(['test-vehicles.js', 'test-mainland.js', 'sim-act2.js']);
const STEP_MS = 20 * 60_000; // (the slowest step, test-vehicles, takes about 9 minutes)
const tests = readdirSync(here)
  .filter((f) => /^test-.+\.js$/.test(f) && !ELSEWHERE.has(f))
  .sort();
const every = [...FIRST, ...tests, ...LAST];
const args = process.argv.slice(2);
const named = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/^scripts\//, '').replace(/(\.js)?$/, '.js'));
const unknown = named.filter((f) => !every.includes(f) && !ELSEWHERE.has(f));
if (unknown.length) {
  say(`no such step: ${unknown.join(', ')}`);
  process.exit(2);
}
const steps = named.length ? named : args.includes('--all') ? every : args.includes('--nightly') ? every.filter((f) => NIGHTLY.has(f)) : every.filter((f) => !NIGHTLY.has(f));

const failed = [];
const t0 = Date.now();
for (const [i, f] of steps.entries()) {
  say(`\n=== [${i + 1}/${steps.length}] node scripts/${f}`);
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: 'inherit', timeout: STEP_MS, killSignal: 'SIGKILL' });
  if (r.error?.code === 'ETIMEDOUT') failed.push(`${f} (still running after ${STEP_MS / 60000} min: killed)`);
  else if (r.status !== 0) failed.push(`${f} (${r.signal || `exit ${r.status}`})`);
}
const mins = ((Date.now() - t0) / 60000).toFixed(1);
say(failed.length ? `\n${failed.length} of ${steps.length} FAILED in ${mins} min:\n  ${failed.join('\n  ')}` : `\nall ${steps.length} passed in ${mins} min`);
process.exit(failed.length ? 1 : 0);
