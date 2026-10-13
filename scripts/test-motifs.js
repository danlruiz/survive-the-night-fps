// The specials' approach motifs (issue #298, client/audio/motifs.js):
//   - every special kind (and the dog pack) has one, of 2-4 notes and short; commons and bosses have none
//   - no two are alike, even moved up or down: each has a run of intervals of its own
//   - a special is heard as it comes into view (far) and again within MOTIF_NEAR m of any survivor (near)
//   - one per kind per MOTIF_EVERY s, MOTIF_GAP s between any two; a far cue held back too long is dropped, a near one
//     waits; a pack is heard once
// usage: node scripts/test-motifs.js
import { MOTIFS, MotifWatch, MOTIF_NEAR, MOTIF_EVERY, MOTIF_GAP, MOTIF_STALE, MOTIF_PROBE, MOTIF_BEAT, MOTIF_FAR_SLOW } from '../client/audio/motifs.js';
import { ZOMBIE_DEFS, ZTYPE } from '../shared/defs.js';

let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fails++;
};
const NAME = Object.fromEntries(Object.entries(ZTYPE).map(([k, v]) => [v, k]));

// ---- the table
for (const t of Object.values(ZTYPE)) {
  const d = ZOMBIE_DEFS[t];
  const want = (!d.common && !d.boss) || t === ZTYPE.DOG;
  check(!!MOTIFS[t] === want, `${NAME[t]} ${want ? 'has' : 'has no'} motif`);
}
const sig = new Map();
for (const [t, m] of Object.entries(MOTIFS)) {
  check(m.length >= 2 && m.length <= 4, `${NAME[t]}: ${m.length} notes (2-4)`);
  const secs = m.reduce((a, [, b]) => a + b, 0) * MOTIF_BEAT;
  check(secs <= 1.2 && secs * MOTIF_FAR_SLOW <= 1.7, `${NAME[t]}: ${secs.toFixed(2)} s near, ${(secs * MOTIF_FAR_SLOW).toFixed(2)} s far`);
  check(m.every(([n, b]) => Number.isInteger(n) && n >= -14 && n <= 20 && b > 0), `${NAME[t]}: notes in range`);
  const iv = m.slice(1).map(([n], i) => n - m[i][0]).join(',');
  check(!sig.has(iv), `${NAME[t]}: its intervals (${iv}) are its own${sig.has(iv) ? ` - same as ${sig.get(iv)}` : ''}`);
  sig.set(iv, NAME[t]);
}

// ---- the watch
const z = (id, ztype, x, z, dead = false) => ({ id, ztype, rx: x, rz: z, dead });
function run(steps) {
  const w = new MotifWatch();
  const heard = [];
  for (const [t, ents, surv] of steps) w.update(t, ents, surv, (ztype, near) => heard.push({ t, ztype, near }));
  return heard;
}
const me = [{ x: 0, z: 0 }];

// a leaper comes into view 100 m off and runs in
{
  const steps = [];
  for (let t = 0; t <= 20; t += MOTIF_PROBE) steps.push([t, [z(1, ZTYPE.LEAPER, Math.max(5, 100 - 4.2 * t), 0)], me]);
  const h = run(steps);
  check(h.length === 2 && !h[0].near && h[0].t === 0 && h[1].near, `leaper: far as it appears, near as it closes (${JSON.stringify(h)})`);
  // it reaches 30 m at ~16.7 s, past the 8 s window
  check(h[1] && Math.abs(h[1].t - 16.75) < 0.3, `leaper: the near cue when it crosses ${MOTIF_NEAR} m (${h[1]?.t})`);
}
// one that appears already close: only the near cue
{
  const h = run([[0, [z(1, ZTYPE.SPITTER, 10, 0)], me], [1, [z(1, ZTYPE.SPITTER, 9, 0)], me]]);
  check(h.length === 1 && h[0].near, 'spitter close by: one near cue');
}
// any survivor counts, not just this one
{
  const h = run([[0, [z(1, ZTYPE.ROPER, 100, 0)], [{ x: 0, z: 0 }, { x: 80, z: 0 }]]]);
  check(h.length === 1 && h[0].near, 'roper 20 m from a teammate: near');
}
// the same kind again inside the window is held back; a far one gives up, a near one waits
{
  const h = run([
    [0, [z(1, ZTYPE.SMOKER, 90, 0)], me],
    [3, [z(1, ZTYPE.SMOKER, 90, 0), z(2, ZTYPE.SMOKER, -90, 0)], me],
    [3 + MOTIF_STALE + 0.5, [z(1, ZTYPE.SMOKER, 90, 0), z(2, ZTYPE.SMOKER, -90, 0)], me],
    [MOTIF_EVERY + 1, [z(1, ZTYPE.SMOKER, 90, 0), z(2, ZTYPE.SMOKER, -90, 0)], me],
  ]);
  check(h.length === 1, `a second smoker far off within ${MOTIF_EVERY} s: not heard, nor once its far cue has gone stale (${h.length})`);
}
{
  const h = run([
    [0, [z(1, ZTYPE.SMOKER, 90, 0)], me],
    [3, [z(1, ZTYPE.SMOKER, 90, 0), z(2, ZTYPE.SMOKER, -20, 0)], me],
    [MOTIF_EVERY - MOTIF_PROBE, [z(1, ZTYPE.SMOKER, 90, 0), z(2, ZTYPE.SMOKER, -20, 0)], me],
    [MOTIF_EVERY, [z(1, ZTYPE.SMOKER, 90, 0), z(2, ZTYPE.SMOKER, -20, 0)], me],
  ]);
  check(h.length === 2 && h[1].near && h[1].t === MOTIF_EVERY, `a second smoker close by: its near cue waits out the window (${JSON.stringify(h)})`);
}
// different kinds at once: one at a time, MOTIF_GAP apart
{
  const ents = [z(1, ZTYPE.SPITTER, 90, 0), z(2, ZTYPE.BOOMER, 0, 90), z(3, ZTYPE.TANK, -90, 0)];
  const steps = [];
  for (let t = 0; t <= 5; t += MOTIF_PROBE) steps.push([t, ents, me]);
  const h = run(steps);
  const gaps = h.slice(1).map((x, i) => x.t - h[i].t);
  check(h.length === 3 && new Set(h.map((x) => x.ztype)).size === 3, `three kinds coming into view together: all three heard (${h.length})`);
  check(gaps.every((g) => g >= MOTIF_GAP - 1e-9), `...each at least ${MOTIF_GAP} s after the last (${gaps.map((g) => g.toFixed(2))})`);
}
// a pack of dogs: heard once far, once near
{
  const steps = [];
  for (let t = 0; t <= 20; t += MOTIF_PROBE) {
    const x = Math.max(4, 100 - 6 * t);
    steps.push([t, [0, 1, 2, 3, 4].map((i) => z(10 + i, ZTYPE.DOG, x + i * 2, i * 3)), me]);
  }
  const h = run(steps);
  check(h.length === 2 && !h[0].near && h[1].near, `a pack of five dogs: one far cue, one near cue (${h.length})`);
}
// the dead, the commons and bosses are never heard
{
  const h = run([[0, [z(1, ZTYPE.WALKER, 10, 0), z(2, ZTYPE.RUNNER, 10, 0), z(3, ZTYPE.BOSS_BRUTE, 10, 0), z(4, ZTYPE.LEAPER, 10, 0, true), z(5, ZTYPE.BAT, 5, 0)], me]]);
  check(h.length === 0, 'walkers, runners, bats, bosses and a dead leaper: silent');
}
// no survivor alive to be near: far cues only
{
  const h = run([[0, [z(1, ZTYPE.SHADE, 5, 0)], []]]);
  check(h.length === 1 && !h[0].near, 'nobody left standing: the far cue only');
}
// out of view and back: heard again (a new arrival), within the limits
{
  const h = run([
    [0, [z(1, ZTYPE.FLAMMER, 90, 0)], me],
    [2, [], me],
    [MOTIF_EVERY + 1, [z(1, ZTYPE.FLAMMER, 90, 0)], me],
  ]);
  check(h.length === 2 && !h[1].near, 'a flammer that wandered out of view and back: heard again');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
