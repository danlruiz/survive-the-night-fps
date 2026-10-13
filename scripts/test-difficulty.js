// The three difficulties (shared/difficulty.js). Nightfall is the valley as it was: the same day, the same
// night, the same horde, the same claw. Ember and Blackout move those numbers, and a length a test pins does not move.
import { Game } from '../server/game.js';
import { FIRST_DAY_LENGTH, NIGHT_LENGTH, dayLength } from '../shared/constants.js';
import { ITEM, ZTYPE, ZOMBIE_DEFS, KILLER, AMMO, SUPPLY_NEED } from '../shared/defs.js';
import { DIFFICULTIES, chosenDifficulty, xpBonus } from '../shared/difficulty.js';
import { zombieHitbox } from '../shared/hitbox.js';
import { C2S, S2C, PROTOCOL_VERSION, Writer, Reader } from '../shared/protocol.js';
import { countItem } from '../server/inventory.js';
import { XP, XPS, perkMask } from '../shared/progress.js';
import { playerMods } from '../server/loadouts.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const quiet = () => {};

check('nothing asked for is Nightfall', chosenDifficulty(undefined) === 'nightfall' && chosenDifficulty('') === 'nightfall');
check('a name the game does not have is refused', chosenDifficulty('god') === null);
check('the three names are the three valleys', chosenDifficulty('ember') === 'ember' && chosenDifficulty('blackout') === 'blackout');

const night = new Game({ seed: 7, log: quiet });
const ember = new Game({ seed: 7, difficulty: 'ember', log: quiet });
const black = new Game({ seed: 7, difficulty: 'blackout', log: quiet });
const pinned = new Game({ seed: 7, difficulty: 'ember', dayLength: 3600, nightLength: 3600, log: quiet });

check('Nightfall day 1 is the day the valley has always had', night.day === 0 && night.dayLen === FIRST_DAY_LENGTH && night.nightLen === NIGHT_LENGTH);
check('Nightfall night 1, one survivor, is still 17', night.hordeSize(1, 1) === 17);
check('Ember stretches day 1 to nine minutes and the night to three and a half', ember.dayLen === Math.round(FIRST_DAY_LENGTH * 1.5) && ember.nightLen === Math.round(NIGHT_LENGTH * 1.4), `${ember.dayLen} ${ember.nightLen}`);
check('Ember night 1, one survivor, is 9', ember.hordeSize(1, 1) === 9, String(ember.hordeSize(1, 1)));
check('Blackout shortens the day and the night and brings more of them', black.dayLen === Math.round(FIRST_DAY_LENGTH * 0.8) && black.nightLen === Math.round(NIGHT_LENGTH * 0.85) && black.hordeSize(1, 1) === 24, `${black.dayLen} ${black.nightLen} ${black.hordeSize(1, 1)}`);
ember.day = 8;
black.day = 8;
night.day = 8;
check('the short days stretch and shrink with the rest', ember.dayLen === Math.round(dayLength(8) * 1.5) && black.dayLen === Math.round(dayLength(8) * 0.8) && night.dayLen === dayLength(8), `${ember.dayLen} ${black.dayLen} ${night.dayLen}`);
check('a pinned clock ignores the difficulty', pinned.dayLen === 3600 && pinned.nightLen === 3600);

const walker = ZOMBIE_DEFS[ZTYPE.WALKER];
const made = (g) => g.zm.make(ZTYPE.WALKER, 0, 0, 0);
check('a Nightfall walker has the health it is drawn with', made(night).hp === walker.hp);
check('an Ember walker falls in fewer body shots', near(made(ember).hp, walker.hp * 0.72), String(made(ember).hp));
check('a Blackout walker takes more', near(made(black).hp, walker.hp * 1.28), String(made(black).hp));

const body = zombieHitbox(walker, 0, 0, false);
const fat = zombieHitbox(walker, 0, 0, false, 1.22);
check('Ember widens the body and leaves the head where it is drawn', near(fat.r, body.r * 1.22) && fat.headR === body.headR, `${fat.r} ${body.r} ${fat.headR}`);

function join(game, name) {
  const c = { id: 0 };
  c.conn = {
    send(bytes) {
      const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
      if (r.u8() === S2C.WELCOME) c.id = r.u16();
    },
  };
  c.session = game.onOpen(c.conn);
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str(name);
  w.str('');
  game.onMessage(c.session, w.bytes());
  c.p = game.players.get(c.id);
  return c;
}

const en = join(ember, 'Ann');
const bl = join(black, 'Ben');
const nt = join(night, 'Cy');
check('Ember starts with twice the rounds and twice the bandages', en.p && en.p.state.ammo[AMMO.P9] === 72 && countItem(en.p.inv, ITEM.BANDAGE) === 4, JSON.stringify(en.p && [en.p.state.ammo[AMMO.P9], countItem(en.p.inv, ITEM.BANDAGE)]));
check('Blackout starts with 24 rounds and one bandage', bl.p && bl.p.state.ammo[AMMO.P9] === 24 && countItem(bl.p.inv, ITEM.BANDAGE) === 1, JSON.stringify(bl.p && [bl.p.state.ammo[AMMO.P9], countItem(bl.p.inv, ITEM.BANDAGE)]));
check('Nightfall still starts with 36 rounds and two bandages', nt.p && nt.p.state.ammo[AMMO.P9] === 36 && countItem(nt.p.inv, ITEM.BANDAGE) === 2, JSON.stringify(nt.p && [nt.p.state.ammo[AMMO.P9], countItem(nt.p.inv, ITEM.BANDAGE)]));

function claw(g, p, amount) {
  const hp = p.hp;
  g.damagePlayer(p, amount, { kind: KILLER.ZOMBIE, ztype: ZTYPE.WALKER, x: p.state.x, z: p.state.z });
  return hp - p.hp;
}
check('Ember claws hit for just over half', near(claw(ember, en.p, 20), 11), String(claw(ember, en.p, 20)));
check('Blackout claws hit harder', near(claw(black, bl.p, 20), 28));
check('Nightfall claws hit for what they always hit for', near(claw(night, nt.p, 20), 20));
const own = en.p.hp;
ember.damagePlayer(en.p, 10, { kind: KILLER.PLAYER, id: en.p.id, x: 0, z: 0 });
check('your own bomb is not softened on Ember', near(own - en.p.hp, 10), String(own - en.p.hp));

check('coming back at dawn on Ember is two bandages, and one on the others', ember.dawnKit().items[0][1] === 2 && night.dawnKit().items[0][1] === 1 && black.dawnKit() === night.dawnKit());

const nightXp = (g, p) => {
  const was = p.xpRun[XPS.nights];
  g.award(p, XPS.nights, 100);
  return p.xpRun[XPS.nights] - was;
};
check('Ember earns 1x, Nightfall 2x and Blackout 3x the XP', nightXp(ember, en.p) === 50 && nightXp(night, nt.p) === 100 && nightXp(black, bl.p) === 150, `${nightXp(ember, en.p)} ${nightXp(night, nt.p)} ${nightXp(black, bl.p)}`);

// Issue #273: XP told as bonuses, not cuts. Ember is the 1x the others are counted from, and a fresh night's first
// kills carry a bonus instead of the rest being halved. The XP a run earns is what it was.
check('the difficulty picker counts XP up from Ember: 1x, 2x, 3x', DIFFICULTIES.map(xpBonus).join() === '1,2,3', DIFFICULTIES.map(xpBonus).join());
check('...and the harder blurbs say so', DIFFICULTIES.slice(1).every((d) => d.blurb.includes(`${xpBonus(d)}x the XP of Ember`)), DIFFICULTIES.map((d) => d.blurb).join(' | '));
check('no blurb tells a reward as a cut', DIFFICULTIES.every((d) => !/\b(half|penalty|reduced|cap)\b/i.test(d.blurb)), DIFFICULTIES.map((d) => d.blurb).join(' | '));

// a long night's kills, mixed kinds and headshots, the way the XP was counted before the bonus framing
const KINDS = [ZTYPE.WALKER, ZTYPE.RUNNER, ZTYPE.SPITTER, ZTYPE.BOOMER, ZTYPE.LEAPER, ZTYPE.SHADE, ZTYPE.TANK, ZTYPE.WALKER];
const oldKillXp = (g, p, i, ztype, head) => {
  const scale = (n) => Math.round(n * playerMods(p).xp * g.diff.xp);
  const half = i > XP.killsFull;
  const base = XP.kinds[ztype] ?? XP.kill;
  const n = scale(half ? Math.ceil(base / 2) : base);
  return Math.max(0, n) + (head ? Math.max(0, scale(half ? Math.ceil(XP.headshot / 2) : XP.headshot)) : 0);
};
for (const [g, c] of [[ember, en], [night, nt], [black, bl]]) {
  for (const perks of [[], [24]]) {
    const p = c.p;
    p.perks = perkMask(perks);
    p.nightKills = 0;
    const was = g.xpOf(p);
    const freshWas = p.xpRun[XPS.fresh] | 0;
    let want = 0;
    for (let i = 1; i <= 150; i++) {
      const ztype = KINDS[i % KINDS.length];
      const head = i % 3 === 0;
      want += oldKillXp(g, p, i, ztype, head);
      g.killXp(p, { ztype, wedgeT: 0, boss: false }, head);
    }
    const got = g.xpOf(p) - was;
    const fresh = (p.xpRun[XPS.fresh] | 0) - freshWas;
    check(`${g.diff.name}${perks.length ? ' with Quick Study' : ''}: 150 kills earn the XP they always did, the fresh-night bonus part of it`, got === want && fresh > 0, `${got} vs ${want}, bonus ${fresh}`);
    p.perks = 0;
  }
}
const p = nt.p;
p.nightKills = XP.killsFull;
const freshAt = p.xpRun[XPS.fresh];
night.killXp(p, { ztype: ZTYPE.WALKER, wedgeT: 0, boss: false }, true);
check('past the night\'s first kills there is no bonus left to earn', p.xpRun[XPS.fresh] === freshAt);

// The final stand at the car, four survivors on night 5 of the island. Ember's levers reach it: fewer of the dead, fewer
// on their feet at once, half the Tanks and fewer specials. Nightfall and Blackout meet the stand they always met.
function stand(id, shoot) {
  const g = new Game({ seed: 11, difficulty: id, log: quiet });
  for (const name of ['Ann', 'Ben', 'Cy', 'Dee']) join(g, name);
  g.day = 5;
  g.supplies = SUPPLY_NEED.slice();
  g.startEngine(null);
  const r = { size: g.finalStandSize(), tanks: g.finalStandTanks(), peak: 0, specials: 0, kinds: 0 };
  const seen = new WeakSet();
  for (let t = 0; t < 20 * 200 && !g.escape.ready; t++) {
    g.update();
    let up = 0;
    for (const z of g.zombies) {
      if (!z.horde || z.boss || z.dead) continue;
      up++;
      if (!seen.has(z)) {
        seen.add(z);
        r.kinds++;
        if (z.ztype !== ZTYPE.WALKER && z.ztype !== ZTYPE.RUNNER) r.specials++;
      }
    }
    r.peak = Math.max(r.peak, up);
    if (shoot) for (const z of g.zombies) if (z.horde && !z.boss && !z.dead) g.combat.killZombie(z, null, {});
  }
  r.sent = g.escape.sent;
  return r;
}
const fsN = stand('nightfall', true);
const fsE = stand('ember', true);
const fsB = stand('blackout', true);
const crowdN = stand('nightfall', false);
const crowdE = stand('ember', false);
console.log(`      final stand, 4 survivors, night 5: Nightfall ${fsN.size} (${fsN.tanks} Tanks, ${fsN.specials}/${fsN.kinds} specials, ${crowdN.peak} at once), Ember ${fsE.size} (${fsE.tanks} Tanks, ${fsE.specials}/${fsE.kinds} specials, ${crowdE.peak} at once), Blackout ${fsB.size}`);
const nt4 = new Game({ seed: 11, log: quiet });
for (const name of ['Ann', 'Ben', 'Cy', 'Dee']) join(nt4, name);
nt4.day = 5;
check('Nightfall\'s final stand is the size it always was: 1.25 nights, a Tank a survivor', fsN.size === Math.round(1.25 * nt4.hordeSize(5, 4)) && fsN.tanks === 4, `${fsN.size} vs ${Math.round(1.25 * nt4.hordeSize(5, 4))}, ${fsN.tanks} Tanks`);
check('Blackout\'s final stand is untouched too', fsB.size === Math.round(1.25 * Math.max(3, Math.round(Math.round((10 + 30 + 1.3 * 25) * 2.2) * 1.4))) && fsB.tanks === 4, `${fsB.size}, ${fsB.tanks} Tanks`);
check('Ember\'s final stand is a quarter smaller than its nights would make it', fsE.size === Math.round(1.25 * 0.75 * new Game({ seed: 11, difficulty: 'ember', log: quiet }).hordeSize(5, 4)), String(fsE.size));
check('Ember\'s stand brings a Tank for every two survivors, and a lone survivor still meets one', fsE.tanks === 2 && new Game({ seed: 11, difficulty: 'ember', log: quiet }).finalStandTanks() === 1, String(fsE.tanks));
check('Ember\'s stand comes in full when the team shoots', fsE.sent >= fsE.size, `${fsE.sent} of ${fsE.size}`);
check('Ember\'s stand keeps fewer of the dead on their feet at once', crowdE.peak <= Math.round(fsE.size * 0.45) + 5 && crowdE.peak < crowdN.peak, `${crowdE.peak} vs ${crowdN.peak}`);
check('Ember\'s stand brings fewer specials, as its nights do', fsE.specials / fsE.kinds < fsN.specials / fsN.kinds, `${fsE.specials}/${fsE.kinds} vs ${fsN.specials}/${fsN.kinds}`);

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('difficulty ok');
