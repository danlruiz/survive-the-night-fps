# Bosses and specials: every tough enemy has a mechanical answer

Read this before you tune a boss or a special, or add one. Issue #281 has the background: an enemy whose only answer is
"more bullets" is a bullet sponge. The fight takes longer and asks nothing new of the team.

## The rule

Every boss has a **weak window** after its big move. The move has a tell (a windup with its cry), then the boss
**reels** where it stands: it lands no blow, and it takes `stunHurt` × damage until the reel runs out. The team's job is
to survive the move and pour fire into the reel. Tips, the dawn card and the bestiary all say the same thing: "shoot it
while it reels" (the bestiary's beat line is `While it reels ×2`).

In the code a reel is `Zombies.reel(z, s)` (server/zombies.js). It sets `z.dazedT`, and `Combat.damageZombie`
multiplies damage by `def.stunHurt` while `dazedT` runs. The client sees the stagger animation.

| Boss | Its big move (tell) | Its weak window | Field in `ZOMBIE_DEFS` |
|---|---|---|---|
| The Brute (night 1) | a heavy swing (wind back, 0.32 s) | a swing that finds nobody in reach leaves it stumbling, 1.5 s at ×2 | `whiffReel` |
| The Alpha (night 2) | a ram at what was built (snarl, crouch) | reels after the ram, at ×1.5 (as its dogs do) | `stunHurt`, dog.js `DOG_RAM_STUN` |
| Tank (boss from night 2, horde from night 9) | a charge (roar, 0.9 s) | a charge that gets nobody leaves it reeling, 2.2 s at ×2 | `chargeReel` |
| The Bloater (night 3) | a fan of bile (gurgle, 0.8 s) | gasps after every heave, 2 s at ×2 | `spewReel` |
| The Abomination (night 4) | a ground slam (roar, 1 s) | fists stuck after every slam, 1.8 s at ×2 (and no blow follows a slam) | `slamReel` |
| The Hive Queen (night 5) | its brood of bats (shriek, 0.9 s) | shudders as the bats tear out of its back, 2.5 s at ×2 | `broodReel` |

The Brute's other answer stays: it is slow until badly hurt (`enrage`), so a team that keeps its distance is never
swung at. The Bloater's stays too: it bursts when it dies, so bring it down away from the walls. The anti-tank rifle
still hits bosses and Tanks three times as hard (`bossMul`).

`scripts/test-bosses.js` checks every window: that it opens after the move, lasts as long as its field says, that the
boss stays put through it, and that it takes `stunHurt` × damage. It also checks that a Tank that got someone with its
charge does not reel, and that no Abomination blow lands while it is stuck after a slam.

## Time-to-kill budget

`node scripts/boss-ttk.js` prints this table. It counts trigger time only: how long a team keeps a boss under fire on
the first night it can come, with that night's expected guns, 60% of rounds landing on the body. The horde, moving,
reviving and running dry are left out, so a real fight is longer. Use it to compare bosses with each other, and a change
with what was there before.

**Budget: 30 s for a team of two (the smallest group the game is for), 45 s alone.** A night is 150 s
(`NIGHT_LENGTH`) and the boss comes with its second wave, so the fight should be a fifth of the night for a group.

| Boss | Night | Guns | Health (1 / 2 / 4) | Reeling share | Solo s | Duo s | Four s | Solo, with its window | Duo, with its window | Budget |
|---|---|---|---|---|---|---|---|---|---|---|
| The Brute | 1 | pistol | 750 / 1200 / 2100 | up to the team | 11 | 9 | 8 | 11 | 9 | within |
| The Alpha | 2 | pistol, shotgun | 825 / 1275 / 2175 | up to the team | 13 | 10 | 8 | 13 | 10 | within |
| Tank | 2 | pistol, shotgun | 2420 / 3740 / 6380 | 18% at ×2 | 37 | 28 | 24 | 31 | 24 | within |
| The Bloater | 3 | shotgun, mp5 | 2880 / 4320 / 7200 | 23% at ×2 | 33 | 25 | 21 | 27 | 20 | within |
| The Abomination | 4 | m4a1, ak47 | 5200 / 7600 / 12400 | 26% at ×2 | 44 | 32 | 26 | 35 | 25 | within |
| The Hive Queen | 5 | m4a1, ak47 | 4760 / 6800 / 10880 | 18% at ×2 | 40 | 29 | 23 | 34 | 24 | within |

The Abomination was over budget for a pair (32 s) before it had a window; its window brings it to 25 s without
touching its health. That is the order to fix things in.

Two to watch:
- **A Tank as night 2's boss, alone.** Within the time budget once its window is used, but a pistol-only survivor needs
  about 134 rounds at 60% (110 or so with the window), most of the 150 9mm they can carry. If playtests say night 2's
  Tank is a slog, the next step is `TANK_BOSS_HP` (shared/constants.js), with a note here on why the window was not enough.
- **A Tank in the horde from night 9.** It has the horde's health multiplier on top of its 2200. The window helps;
  nothing else is planned yet.

## Tuning: mechanics first, health last

No change to a boss's or a special's `hp` (or `TANK_BOSS_HP`, `BOSS_HP_PER_PLAYER`, `BOSS_HP_PER_NIGHT`) ships without a
line in its PR on why a change to its window or its moves was not enough. Run `node scripts/boss-ttk.js` before and
after, and put both tables in the PR's metrics section. A new boss gets a weak window, a field for it, a tip that names
it, and a check in `scripts/test-bosses.js`.

## The specials

Each special's counter, whether the game teaches it, and whether a team that does not know the counter can still win
by focus fire. "Taught" means the line on the dawn card the night it joins the horde (`introBrief`), the full line on
the night's card (`intro`), and the bestiary's beat and watch lines (client/ui/books.js `kindFacts`).

| Special | Health | Its counter or weak window | Taught in play | Focus fire alone |
|---|---|---|---|---|
| Tank | 2200 | sidestep the charge, shoot while it reels (×2); the anti-tank rifle (×3); no barricade holds it | dawn card and bestiary: "Sidestep, shoot it as it reels" | slowly: see the budget above |
| Leaper | 90 | mash Space to shove it off, or a teammate shoots it off | dawn card: "Mash Space to shove one off" | yes (frail) |
| Roper | 150 | break line of sight; shoot the roper to break the rope | dawn card: "Keep to cover" | yes |
| Spitter | 95 | shoot it first; walls stop acid, barricades do not | dawn card: "Shoot them first" | yes |
| Boomer | 70 | shoot it far off; shot before it swells, it cannot breach | dawn card: "Shoot them far off" | yes (but it breaches the wall it reaches) |
| Shade | 240 | light freezes it | dawn card: "Keep a light on them" | hard: it closes at 8.6 m/s and hits for 55; a lit one takes only a quarter of the damage, so light is its counter but not a damage window |
| Bat | 28 | shotgun or melee | dawn card: "Shotguns and melee" | yes |
| Zombie dog | 60 | barricades stop them; shoot them as they come in; reels after a ram (×1.5) | dawn card, bestiary "While it reels ×1.5" | yes |
| Screecher | 130 | kill it before it sees you, or it screams up a horde | dawn card: "Kill them on sight" | yes |
| Smoker | 130 | kill it out past the walls, or its last breath fills the base | dawn card | yes |
| Crawler | 40 | keep away from the trees it chitters in; shake your head to tear it off | dawn card | yes |
| Flammer | 150 | metal walls do not burn; a hammer puts out a fire; mash Space to put yourself out | dawn card | yes (bullets hurt it; fire does not) |
| Mother | 160 | do not shoot her belly, or her babies crawl out | bestiary only: she has no night of her own, so no dawn card | yes |

## Cheap deaths

A cheap death is an attack that can down a survivor at full health (100) with no visible windup. Numbers below are a
blow's damage on its first night (blows grow 7% a night), at Normal and at Hard (`hurt` 1.4), before armour.

| Attack | Normal | Hard | Tell | Verdict |
|---|---|---|---|---|
| The Abomination's slam, then a blow while the survivor is knocked down | 50 + 67 | 70 + 93 | the slam's roar (1 s) | **fixed here**: it is stuck after a slam, so no blow follows |
| The Abomination's blow | 67 | 93 | its swing (0.32 s, as a walker's) | from night 6 on Hard one blow is 100+: watch it |
| A Tank's charge, then its blow while the survivor is knocked down | 32 + 41 | 45 + 57 | the charge's roar (0.9 s) and its footsteps | at Hard, from full health to down; the roar is the tell |
| Two blows from a Shade | 59 × 2 in 1.2 s | 82 × 2 | its whisper, and only in the dark | downs from full on any difficulty, the one with the least tell. A Shade's counter is light; follow-up worth considering |
| The Bloater's burst | 70 | 98 | it is dying, in plain sight | fine: the tip says to kill it away from you |
| The Abomination's boulder | up to 50 | up to 70 | a 0.9 s windup with no cry | cannot down from full; worth giving it a cry |
| The Hive Queen's acid barrage | 10 a glob, 5 globs, and pools | 14 a glob | its roar (0.8 s) | cannot down from full alone |

Related: #268 (the difficulty curve), #279 (one tell vocabulary), #230 (map 2 too hard).
