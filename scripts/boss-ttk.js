// Each boss's time-to-kill against its budget (docs/bosses.md), printed as the table that doc carries:
// node scripts/boss-ttk.js
//
// Trigger time only: how long a team keeps a boss under fire to bring it down, on the first night it can come, with
// that night's expected guns. It leaves out the horde, moving, reviving and running dry, so a real fight is longer;
// what it is for is comparing bosses with each other and a change with what was there before.
//   - a gun's rate is its sustained one, reloads included; HIT of the rounds land, on the body (a head takes ×1.6)
//   - a boss's health is Game.spawnBosses': hp, + BOSS_HP_PER_PLAYER of it per extra survivor, + BOSS_HP_PER_NIGHT per
//     night after the first
//   - "with its window": the team shoots throughout, and the share of the fight the boss spends reeling (its cycle
//     below, from its cooldowns) takes stunHurt × damage. The Brute's and The Alpha's windows depend on the survivors
//     (a swing dodged, a wall rammed), so they count none
import { WEAPONS, ITEM, ZOMBIE_DEFS, ZTYPE } from '../shared/defs.js';
import { BOSS_HP_PER_PLAYER, BOSS_HP_PER_NIGHT, TANK_BOSS_HP } from '../shared/constants.js';

const HIT = 0.6;
// the budget: s of trigger time for a team of two (the smallest group the game is for), and alone
export const BUDGET = { duo: 30, solo: 45 };

const D = ZOMBIE_DEFS;
const sustained = (key) => {
  const w = WEAPONS[ITEM[key]];
  const cycle = w.mag * w.rate + (w.reloadEach ? w.mag * w.reload : w.reload);
  return (w.damage * w.pellets * w.mag) / cycle;
};
// [boss, first night, the guns a survivor can be expected to have by then, its reeling share of a fight]
const BOSSES = [
  [ZTYPE.BOSS_BRUTE, 1, ['PISTOL'], 0],
  [ZTYPE.BOSS_ALPHA, 2, ['PISTOL', 'SHOTGUN'], 0],
  // windup 0.9 s, a charge of about 1 s, then 8-12 s of cooldown (the reel is part of it)
  [ZTYPE.TANK, 2, ['PISTOL', 'SHOTGUN'], D[ZTYPE.TANK].chargeReel / (0.9 + 1 + 10)],
  // windup 0.8 s, then spewRate + 0-2 s
  [ZTYPE.BOSS_BLOATER, 3, ['SHOTGUN', 'MP5'], D[ZTYPE.BOSS_BLOATER].spewReel / (0.8 + D[ZTYPE.BOSS_BLOATER].spewRate + 1)],
  // windup 1 s, then 5-7 s (while a survivor is within 7 m of it: the fight up close)
  [ZTYPE.BOSS_ABOMINATION, 4, ['M4A1', 'AK47'], D[ZTYPE.BOSS_ABOMINATION].slamReel / (1 + 6)],
  // a brood every broodRate s, the windup within it
  [ZTYPE.BOSS_HIVEQUEEN, 5, ['M4A1', 'AK47'], D[ZTYPE.BOSS_HIVEQUEEN].broodReel / D[ZTYPE.BOSS_HIVEQUEEN].broodRate],
];

const hp = (t, night, team) => D[t].hp * (1 + BOSS_HP_PER_PLAYER * (team - 1) + BOSS_HP_PER_NIGHT * (night - 1)) * (t === ZTYPE.TANK ? TANK_BOSS_HP : 1);
const name = (k) => k.replace('_', '-').toLowerCase();

console.log('| Boss | Night | Guns | Health (1 / 2 / 4) | Reeling share | Solo s | Duo s | Four s | Solo, with its window | Duo, with its window | Budget |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [t, night, guns, share] of BOSSES) {
  const each = (guns.reduce((a, k) => a + sustained(k), 0) / guns.length) * HIT;
  const ttk = (team) => hp(t, night, team) / (each * team);
  const open = 1 + share * ((D[t].stunHurt || 1) - 1);
  const solo = ttk(1) / open;
  const duo = ttk(2) / open;
  const ok = duo <= BUDGET.duo && solo <= BUDGET.solo;
  console.log(
    `| ${D[t].name} | ${night} | ${guns.map(name).join(', ')} | ${[1, 2, 4].map((n) => Math.round(hp(t, night, n))).join(' / ')} | ${share ? `${Math.round(share * 100)}% at ×${D[t].stunHurt}` : 'up to the team'} | ${ttk(1).toFixed(0)} | ${ttk(2).toFixed(0)} | ${ttk(4).toFixed(0)} | ${solo.toFixed(0)} | ${duo.toFixed(0)} | ${ok ? 'within' : '**over**'} |`,
  );
}
