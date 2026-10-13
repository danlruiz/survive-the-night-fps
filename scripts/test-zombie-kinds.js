// Every kind of the dead (ZTYPE) is whole: what the rest of the code asks of a kind is on its ZOMBIE_DEFS row, and
// every table that has to know a kind does. A kind that misses one fails here instead of quietly getting red blood, no
// XP, no place in a night's waves or a walker's model. Its ids run 0..N-1 with no gaps or repeats; it has a row with
// a body, a bestiary entry, a wave weight exactly when it joins the horde (STARTERS and SPECIALS), what it is worth
// when it is neither rank and file nor a boss, sounds the game has and a loop the audio engine knows, a model on the
// client (and an animation style for a humanoid one), and a far copy only where it has a humanoid model; and the
// bestiary's bitmask (1 << t) still has room for it.
// usage: node scripts/test-zombie-kinds.js
import './clip/dom-stub.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZTYPE, ZOMBIE_DEFS, SOUND, greenBlood, zombieLoop } from '../shared/defs.js';
import { BESTIARY } from '../shared/bestiary.js';
import { STARTERS, SPECIALS } from '../shared/nights.js';
import { XP, killXp } from '../shared/progress.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : detail}`);
}
const nameOf = Object.fromEntries(Object.entries(ZTYPE).map(([k, t]) => [t, k]));
const kinds = Object.values(ZTYPE);
// the kinds for which pred fails, by name (for the FAIL line)
const missing = (pred) => kinds.filter((t) => !pred(t)).map((t) => nameOf[t]);
const all = (name, pred) => {
  const m = missing(pred);
  check(name, m.length === 0, m.join(', '));
};

// ---------------------------------------------------------------- ids and rows
const sorted = [...kinds].sort((a, b) => a - b);
check('ZTYPE ids are 0..N-1, no gaps, no repeats', sorted.every((t, i) => t === i), sorted.join(','));
check('a row for every kind, and no row without one', Object.keys(ZOMBIE_DEFS).length === kinds.length && kinds.every((t) => ZOMBIE_DEFS[t]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
all('every row has a name and a body (hp, speed, dmg, rate, range, radius, height, headY, headR)', (t) => {
  const d = ZOMBIE_DEFS[t];
  return d && typeof d.name === 'string' && d.name && ['hp', 'speed', 'dmg', 'rate', 'range', 'radius', 'height', 'headY', 'headR'].every((k) => num(d[k]));
});
// a JS bitmask goes negative at bit 31 (server/bestiary.js, user_bestiary, EVT.BESTIARY's u32): widen it first
check('the bestiary mask (1 << t) has room for every kind', Math.max(...kinds) < 31, `ZTYPE ${Math.max(...kinds)}: widen the mask (shared/bestiary.js bit) before kind 31`);

// ---------------------------------------------------------------- the bestiary
const book = new Map();
for (const e of BESTIARY) book.set(e.t, (book.get(e.t) || 0) + 1);
all('every kind is in the bestiary once', (t) => book.get(t) === 1);
check('the bestiary lists no kind that is not one', BESTIARY.every((e) => ZOMBIE_DEFS[e.t]));
all('every bestiary entry has a vague line and a tip', (t) => BESTIARY.filter((e) => e.t === t).every((e) => e.vague && e.tip));

// ---------------------------------------------------------------- the night's waves
const horde = new Set([...STARTERS, ...SPECIALS]);
all('a kind that joins the horde has a wave weight', (t) => !horde.has(t) || typeof ZOMBIE_DEFS[t].wave === 'function');
all('...and a kind that never does (a boss, rolled, born) has none', (t) => horde.has(t) || ZOMBIE_DEFS[t].wave === undefined);
all('every wave weight is a number, 0 or more, from night 1 to 30 and the first wave to the last', (t) => {
  const w = ZOMBIE_DEFS[t].wave;
  if (!w) return true;
  for (let n = 1; n <= 30; n++) for (const sp of [0, 0.5, 1]) if (!num(w(n, sp)) || w(n, sp) < 0) return false;
  return true;
});
all('only a kind in the waves is scaled by the difficulty', (t) => !ZOMBIE_DEFS[t].scaled || horde.has(t));

// ---------------------------------------------------------------- XP
all('a kind that is neither rank and file nor a boss says what it is worth (xp)', (t) => {
  const d = ZOMBIE_DEFS[t];
  return d.common || d.boss || (num(d.xp) && d.xp > 0);
});
all('XP.kinds is the rows\' xp', (t) => XP.kinds[t] === ZOMBIE_DEFS[t].xp);
all('a kill is worth its xp (XP.kill without one, XP.boss for a boss)', (t) => {
  const d = ZOMBIE_DEFS[t];
  return killXp(t, false, false) === (d.xp ?? XP.kill) && killXp(t, true, false) === XP.boss;
});

// ---------------------------------------------------------------- blood and sounds
all('blood is red (unset) or green', (t) => [undefined, 'green'].includes(ZOMBIE_DEFS[t].blood));
check('the spitter, the boomer, the hive queen and the bloater bleed green, the walker red', [ZTYPE.SPITTER, ZTYPE.BOOMER, ZTYPE.BOSS_HIVEQUEEN, ZTYPE.BOSS_BLOATER].every(greenBlood) && !greenBlood(ZTYPE.WALKER));
const audioSrc = readFileSync(join(ROOT, 'client/audio/audio.js'), 'utf8');
const loops = new Set([...audioSrc.slice(audioSrc.indexOf('const LOOPS = {')).matchAll(/^  (\w+): \{/gm)].map((m) => m[1]));
all('every loop a kind carries is one the audio engine has (client/audio/audio.js LOOPS)', (t) => zombieLoop(t) === null || loops.has(zombieLoop(t)));
all('every sound a kind utters is a SOUND', (t) => {
  const s = ZOMBIE_DEFS[t].sounds || {};
  return ['growl', 'fast'].every((k) => s[k] === undefined || SOUND[s[k]] !== undefined) && (s.fastChance === undefined || (num(s.fastChance) && s.fastChance > 0 && s.fastChance <= 1));
});
all('a kind\'s sounds name nothing else (loop, growl, fast, fastChance)', (t) => Object.keys(ZOMBIE_DEFS[t].sounds || {}).every((k) => ['loop', 'growl', 'fast', 'fastChance'].includes(k)));

// ---------------------------------------------------------------- the client's model
{
  const { zombieModelOf } = await import('../client/render/models/characters.js');
  all('the client has a model for every kind (a builder, or the dog\'s rig)', (t) => zombieModelOf(t).rig !== null);
  all('every humanoid model has its own animation style (a bat poses itself)', (t) => zombieModelOf(t).rig !== 'humanoid' || zombieModelOf(t).style || ZOMBIE_DEFS[t].flying);
  all('a far copy (lod) only for a humanoid model', (t) => !ZOMBIE_DEFS[t].lod || zombieModelOf(t).rig === 'humanoid');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
