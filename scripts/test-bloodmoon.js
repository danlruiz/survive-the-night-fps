// The Blood Moon (shared/nights.js isBloodMoon, BLOOD_MOON in shared/constants.js), against a real Game
// in-process with a survivor joined as a client joins:
//   - every BLOOD_MOON.every-th night is one, and its second boss is drawn from what can come that night, never the
//     night's own boss
//   - its night: a fourth wave of runners and leapers in the night's last seconds, the second boss with the last
//     wave, and the cap on the dead on their feet at BLOOD_MOON.aliveMul of the usual (the usual on any other night, or by day)
//   - its dawn: one more air drop through the day, the first of them carrying a heavy weapon and its ammunition, the
//     night's XP times BLOOD_MOON.xp, and "Saw the Red Moon" for the survivors when nobody went down
//   - the admin's /bloodmoon: to a few seconds before the next one falls, from a day or a night
// usage: node scripts/test-bloodmoon.js [seed]
import { Game } from '../server/game.js';
import { C2S, ENT, PROTOCOL_VERSION, Writer } from '../shared/protocol.js';
import { BLOOD_MOON, NIGHT_LENGTH, NIGHT_WAVES, PHASE, SERVER_DT, WAVE_TIMES } from '../shared/constants.js';
import { ITEM, ZTYPE } from '../shared/defs.js';
import { BOSS_POOL, bloodMoonBoss, isBloodMoon, nextBloodMoon, nightBoss } from '../shared/nights.js';
import { XP, XPS } from '../shared/progress.js';

const seed = +(process.argv[2] || 4242);
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};

// ---------------------------------------------------------------- which nights, which bosses
{
  const moons = [];
  for (let n = 1; n <= 30; n++) if (isBloodMoon(n)) moons.push(n);
  check(`a Blood Moon every ${BLOOD_MOON.every}th night`, moons.join() === '7,14,21,28', moons.join());
  const bad = [];
  for (let sd = 1; sd <= 300; sd++) {
    for (const n of moons) {
      const b = bloodMoonBoss(sd, n);
      const pb = BOSS_POOL.find((x) => x.type === b);
      if (b !== bloodMoonBoss(sd, n) || !pb || n < pb.from || b === nightBoss(sd, n)) bad.push(`seed ${sd} night ${n}`);
    }
  }
  check("its second boss is one that can come that night, never the night's own, and the same from the same seed", !bad.length, bad.slice(0, 3).join(', '));
  const next = [1, 6, 7, 8, 14, 15].map(nextBloodMoon);
  check('the next one on or after a night', next.join() === '7,7,7,14,14,21', next.join());
}

// ---------------------------------------------------------------- the game, a survivor
const game = new Game({ seed, themes: false, log: () => {} });
const session = game.onOpen({ send() {} });
{
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str('Alice');
  game.onMessage(session, w.bytes().slice());
}
const p = [...game.players.values()][0];
const clear = () => {
  for (const z of [...game.zombies]) {
    game._listRemove(game.zombies, z);
    game.removeEntity(z);
  }
};
const night = (n) => {
  clear();
  game.day = n;
  game.startNight();
};

// ---------------------------------------------------------------- an ordinary night
night(6);
check('an ordinary night: three waves, one boss, the usual cap', game.waves.length === NIGHT_WAVES && !game.bossLate && game.zombieCap === 120, `${game.waves.length} waves, cap ${game.zombieCap}`);

// ---------------------------------------------------------------- the Blood Moon's night
night(7);
{
  const w4 = game.waves[NIGHT_WAVES];
  check(`a fourth wave, ${BLOOD_MOON.last} s before dawn`, game.waves.length === NIGHT_WAVES + 1 && w4 && Math.abs(w4.start - (NIGHT_LENGTH - BLOOD_MOON.last)) < 1e-6, w4 && `at ${w4.start} s`);
  const kinds = new Set(w4?.queue);
  check('...of runners and leapers', w4 && w4.queue.length >= 3 && [...kinds].every((t) => t === ZTYPE.RUNNER || t === ZTYPE.LEAPER) && kinds.has(ZTYPE.LEAPER), `${w4?.queue.length} of them`);
  const late = bloodMoonBoss(game.seed, 7);
  check('a second boss, with the last wave', game.bossLate && game.bossLate.types[0] === late && Math.abs(game.bossLate.t - (WAVE_TIMES[NIGHT_WAVES - 1] + 8)) < 1e-6);
  check(`the cap on the dead is ${BLOOD_MOON.aliveMul}x the usual`, game.zombieCap === 180, `${game.zombieCap}`);

  // past the usual cap, the horde still comes
  const s = p.state;
  for (let i = 0; i < 150; i++) game.zm.spawn(ZTYPE.WALKER, s.x + 200 + (i % 20) * 2, s.z + 200 + Math.floor(i / 20) * 2, { horde: true });
  const before = game.zombies.length;
  const q = [ZTYPE.WALKER, ZTYPE.WALKER, ZTYPE.WALKER, ZTYPE.WALKER, ZTYPE.WALKER];
  const got = game.spawnHordeGroup(q);
  check('...so a group still comes with more than the usual 120 on their feet', before > 120 && got > 0, `${before} up, ${got} came`);
  clear();

  // both bosses come in (sooner, for the test)
  game.bossPending.t = SERVER_DT;
  game.bossLate.t = SERVER_DT * 3;
  for (let i = 0; i < 6; i++) game.update();
  const bosses = game.zombies.filter((z) => z.boss && !z.dead).map((z) => z.ztype);
  check("both the night's boss and the second one come", bosses.includes(nightBoss(game.seed, 7)) && bosses.includes(late) && !game.bossPending && !game.bossLate, bosses.join());
  clear();
}

// ---------------------------------------------------------------- its dawn
{
  const feats = [];
  const feat = game.ach.feat.bind(game.ach);
  game.ach.feat = (pl, id) => {
    feats.push(id);
    feat(pl, id);
  };
  const xp0 = p.xpRun[XPS.nights];
  game.nightStats.downs = 0;
  game.nightStats.deaths = 0;
  game.startDay();
  const got = p.xpRun[XPS.nights] - xp0;
  check(`twice the night's XP`, got === Math.min(XP.nightCap, XP.night * 7) * BLOOD_MOON.xp, `${got} XP`);
  check('"Saw the Red Moon" when nobody went down', feats.includes('blood_moon'), feats.join());
  check(`one more air drop through the day (${game.supplyAt.length})`, game.supplyAt.length === 2 + BLOOD_MOON.drops);
  check('the night after a Blood Moon is an ordinary one again', game.zombieCap < 180);

  // the first drop is the heavy one, the next is not
  const f0 = game.flyovers.length;
  game.spawnSupplyDrop();
  game.spawnSupplyDrop();
  const [a, b] = game.flyovers.slice(f0);
  check('the first air drop after it carries a heavy weapon, the next does not', a?.heavy === true && b?.heavy === false);

  // ...and opening it puts one down, with its ammunition
  const s = p.state;
  const crate = { kind: ENT.CRATE, x: s.x, y: s.y, z: s.z, gy: s.y, state: 1, despawnAt: game.time + 600, heavy: true };
  game.spawnEntity(crate);
  game.crates.push(crate);
  const dropped = [];
  const drop = game.dropItem.bind(game);
  game.dropItem = (item, n, ...rest) => {
    dropped.push(item);
    return drop(item, n, ...rest);
  };
  p.interactT = -1;
  game.interact(p, crate.id);
  delete game.dropItem;
  const heavy = [ITEM.AT_RIFLE, ITEM.RPG, ITEM.FLAMETHROWER].filter((it) => dropped.includes(it));
  check('...a heavy weapon in it', crate.state === 2 && heavy.length >= 1, `${dropped.length} things`);

  // a Blood Moon somebody went down in: no achievement
  feats.length = 0;
  game.day = 14;
  game.startNight();
  game.nightStats.downs = 1;
  game.startDay();
  check('...and no "Saw the Red Moon" when somebody went down', !feats.includes('blood_moon'), feats.join());
}

// ---------------------------------------------------------------- in proportion, whatever the difficulty
// What a Blood Moon adds goes by the night it falls on: its fourth wave is BLOOD_MOON.count of that difficulty's horde,
// its leapers that difficulty's share of the specials, it comes BLOOD_MOON.last s before that difficulty's dawn, and the
// cap is BLOOD_MOON.aliveMul times the usual one
{
  const rows = [];
  for (const d of ['ember', 'nightfall', 'blackout']) {
    const g = new Game({ seed, themes: false, difficulty: d, log: () => {} });
    g.humanCount = () => 1;
    let leapers = 0;
    let all = 0;
    let w4 = null;
    for (let i = 0; i < 30; i++) {
      g.day = 14;
      g.startNight();
      w4 = g.waves[NIGHT_WAVES];
      for (const t of w4.queue) {
        all++;
        if (t === ZTYPE.LEAPER) leapers++;
      }
    }
    const horde = g.hordeSize(14, 1);
    const scale = g.nightLen / NIGHT_LENGTH;
    const want = Math.min(0.7, BLOOD_MOON.leap * g.diff.specials);
    const cap = g.zombieCap;
    g.day = 13;
    g.startNight();
    rows.push({ d, horde, w4: w4.queue.length, start: w4.start, wantStart: (NIGHT_LENGTH - BLOOD_MOON.last) * scale, leap: leapers / all, want, cap, usual: g.zombieCap });
  }
  const say = rows.map((r) => `${r.d}: ${r.w4} of ${r.horde}, ${Math.round(r.leap * 100)}% leapers (${Math.round(r.want * 100)}%), cap ${r.cap}/${r.usual}`).join('; ');
  check('the fourth wave is half the horde on every difficulty', rows.every((r) => r.w4 === Math.max(3, Math.round(r.horde * BLOOD_MOON.count))), say);
  check("...comes the same share of that difficulty's night before its dawn", rows.every((r) => Math.abs(r.start - r.wantStart) < 1e-6));
  check("...its leapers that difficulty's share of the specials", rows.every((r) => Math.abs(r.leap - r.want) < 0.06), say);
  check('...and the cap on the dead is half again the usual on every difficulty', rows.every((r) => r.cap === Math.round(r.usual * BLOOD_MOON.aliveMul)));
}

// ---------------------------------------------------------------- the admin's /bloodmoon
{
  clear();
  game.phase = PHASE.DAY;
  game.day = 3;
  game.timeLeft = 100;
  game.debugCommand(p, ['bloodmoon']);
  check('/bloodmoon by day: to day 7, 5 s before it falls', game.phase === PHASE.DAY && game.day === 7 && game.timeLeft === 5 && !game.supplyAt.length, `day ${game.day}, ${game.timeLeft} s`);
  for (let i = 0; i < Math.ceil(6 / SERVER_DT); i++) game.update();
  check('...and the Blood Moon falls', game.phase === PHASE.NIGHT && game.day === 7 && game.waves.length === NIGHT_WAVES + 1 && !!game.bossLate, `phase ${game.phase}, day ${game.day}`);
  game.debugCommand(p, ['bloodmoon', '20']);
  check('/bloodmoon 20 during one: to the next, 20 s before it', game.phase === PHASE.DAY && game.day === 14 && game.timeLeft === 20 && !game.waves.length && !game.bossLate && !game.bossPending, `day ${game.day}, ${game.timeLeft} s`);
  game.day = 14;
  game.timeLeft = 100;
  game.debugCommand(p, ['bloodmoon']);
  check('/bloodmoon on the day of one: tonight', game.day === 14 && game.timeLeft === 5);
}

if (fails.length) {
  console.log(`\n${fails.length} FAILED`);
  process.exit(1);
}
console.log('\nall passed');
process.exit(0);
