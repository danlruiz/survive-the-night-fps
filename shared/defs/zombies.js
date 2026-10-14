// The dead: every kind (ZTYPE) and its row (ZOMBIE_DEFS), what the rest of the code asks of a kind, and the
// animation states the dead (and the stray cat) are sent in. Numeric ids are part of the wire protocol - do not renumber.
import { uniqueIds } from '../ids.js';

export const ZTYPE = uniqueIds('ZTYPE', {
  WALKER: 0,
  RUNNER: 1,
  TANK: 2,
  SPITTER: 3,
  LEAPER: 4,
  ROPER: 5,
  BOOMER: 6,
  BAT: 7,
  BOSS_ABOMINATION: 8,
  BOSS_HIVEQUEEN: 9,
  DOG: 10,
  SHADE: 11,
  BOSS_BRUTE: 12,
  BOSS_ALPHA: 13,
  BOSS_BLOATER: 14,
  SMOKER: 15,
  SCREECHER: 16,
  CRAWLER: 17,
  FLAMMER: 18,
  MOTHER: 19,
  BABY: 20,
});

// speed m/s, hp, dmg per hit, attack rate s, radius, height (for hitboxes), headR, headY
// common: rank-and-file (plain loot table, no killfeed line). Quadrupeds: headFwd = head sphere this far
// ahead of the body, bodyTop = top of the body cylinder (default headY - headR).
// shade: only moves in darkness; while any light is on it, it is frozen and takes litResist x damage
// legs: its legs can be shot (LEG_* in constants.js): a hit trips it, a leg can be blown off, with both gone it crawls
// When a kind joins: walkers and runners from the start, then one special a night in an order drawn from the seed
// (shared/nights.js joinNight), each said on the dusk card under the clock with its introBrief (the intro in a few
// words); from the day it joins it is out by day too, the further a place is from the car the more of the specials it
// holds (server/spawns.js daySpecial). A boss's minNight is the first night it can be drawn (BOSS_POOL)
// tip: a boss's one line on how to fight it, shown when it comes (tipBrief: in a few words, for the dusk card).
// bossLoot: the rolls it drops (default 8)
// What the rest of the code asks of a kind is read from its row, never from a list of kinds kept somewhere else
// (scripts/test-zombie-kinds.js holds every kind to it):
//   wave: (night, sp) => its weight in a night's waves (sp: 0 the first wave .. 1 the last; server/spawns.js
//     nightWaves). Every kind that joins the horde has one (shared/nights.js STARTERS and SPECIALS), and no other does
//   scaled: the difficulty's specials knob (shared/difficulty.js specials) thins it on Ember and brings more of it on Blackout
//   xp: what killing one is worth (shared/progress.js XP.kinds; XP.kill without it). Every kind that is neither rank and
//     file (common) nor a boss has one
//   blood: 'green' for the ones that bleed bile and acid (the impact a bullet makes, the gore a blown-apart one leaves)
//   lod: the client builds a far copy of its model (client/render/models/characters.js LOD_TYPES)
//   sounds: { loop, growl, fast, fastChance } - SOUND keys and createLoop names (client/game/entities.js). loop: the
//     loop it carries ('zombie_idle' when unset, null for none); growl: what it utters now and then (the moan or the
//     growl when unset, a boss's roar); fast: what it utters instead on the run, fastChance of the time (default 1)
export const ZOMBIE_DEFS = {
  [ZTYPE.WALKER]: { name: 'Walker', hp: 110, speed: 1.9, dmg: 11, rate: 1.1, range: 1.55, radius: 0.38, height: 1.75, headY: 1.58, headR: 0.17, structDmg: 22, loot: 0.28, common: true, legs: true, wave: (n, sp) => 50 - sp * 12, lod: true },
  [ZTYPE.RUNNER]: { name: 'Runner', hp: 75, speed: 5.6, dmg: 8, rate: 0.7, range: 1.5, radius: 0.34, height: 1.72, headY: 1.55, headR: 0.16, structDmg: 12, loot: 0.25, common: true, legs: true, wave: (n, sp) => 16 + n * 2 + sp * 6, lod: true, sounds: { fast: 'RUNNER_SCREAM' } },
  // a boss from night 2 (BOSS_POOL, at TANK_BOSS_HP of this health), rank-and-file in the horde from night 9. One blow
  // breaks a wood barricade
  // moveR / moveH: the body it walks and charges into the world with. Smaller than radius / height (which stay the
  // size bullets, blows and the model go by) so that it fits a doorway (1.0-1.6 m wide, the lintel 2.08 m above the
  // floor): at its full size a survivor indoors is out of its reach for good. The model does not stoop: it clips
  // the door frame on the way through. A charge that gets nobody leaves it reeling for chargeReel s, taking stunHurt x
  // damage (its weak window, server/specials/tank.js)
  [ZTYPE.TANK]: { name: 'Tank', hp: 2200, speed: 2.5, dmg: 38, rate: 1.6, range: 2.4, radius: 0.95, height: 2.8, headY: 2.45, headR: 0.3, moveR: 0.5, moveH: 1.9, structDmg: 520, loot: 1, knock: 11, chargeReel: 2.2, stunHurt: 2, intro: 'Tanks join the horde: they charge through any barricade. Sidestep the charge and shoot one while it reels.', introBrief: 'Charge through barricades. Sidestep, shoot it as it reels.', tip: 'Listen for its footsteps. It charges, and smashes straight through barricades. Sidestep the charge: a miss leaves it reeling, and it takes double then.', tipBrief: 'Sidestep its charge, then shoot it while it reels.', xp: 30, wave: (n, sp) => (1 + n * 0.3) * (0.5 + sp), sounds: { growl: 'TANK_ROAR' } },
  [ZTYPE.SPITTER]: { name: 'Spitter', hp: 95, speed: 2.3, dmg: 8, rate: 1.1, range: 1.5, radius: 0.36, height: 1.85, headY: 1.68, headR: 0.17, structDmg: 15, loot: 0.5, spitRange: 22, spitRate: 3.5, legs: true, intro: 'Spitters join the horde: acid from 20 m that eats barricades, not walls. Shoot them first.', introBrief: 'Acid from 20 m eats barricades. Shoot them first.', blood: 'green', scaled: true, xp: 15, wave: (n, sp) => 6 + sp * 4, lod: true },
  [ZTYPE.LEAPER]: { name: 'Leaper', hp: 90, speed: 4.2, dmg: 9, rate: 0.5, range: 1.5, radius: 0.36, height: 1.3, headY: 1.1, headR: 0.17, structDmg: 12, loot: 0.5, leapRange: 14, intro: 'Leapers join the horde: they pounce and pin. Mash Space to shove one off, or stay close so someone can shoot it off you.', introBrief: 'Pounce and pin. Mash Space to shove one off.', scaled: true, xp: 20, wave: (n, sp) => 6 + sp * 4, lod: true },
  [ZTYPE.ROPER]: { name: 'Roper', hp: 150, speed: 2.1, dmg: 6, rate: 0.5, range: 1.6, radius: 0.37, height: 1.9, headY: 1.72, headR: 0.17, structDmg: 15, loot: 0.6, ropeRange: 24, legs: true, intro: 'Ropers join the horde: a rope needs line of sight, so keep to cover and shoot the roper to break it.', introBrief: 'Ropes need line of sight. Keep to cover.', scaled: true, xp: 20, wave: (n, sp) => 5 + sp * 3, lod: true },
  // cannot claw at a structure: held up by one for breachHold s with a survivor within breachRange m, it swells for
  // breachWindup s and bursts against it. That piece takes breachDmg on top of the blast (with it, any wood piece
  // goes; a metal wall loses about 40%) - unless the boomer is shot first, which leaves only the blast
  [ZTYPE.BOOMER]: { name: 'Boomer', hp: 70, speed: 1.7, dmg: 0, rate: 1, range: 2.2, radius: 0.6, height: 1.8, headY: 1.62, headR: 0.2, structDmg: 0, loot: 0.6, blastRadius: 5.5, blastDmg: 45, breachHold: 0.8, breachWindup: 1.2, breachRange: 12, breachDmg: 750, legs: true, intro: 'Boomers join the horde: they burst against your walls. Shoot them far off.', introBrief: 'Burst against your walls. Shoot them far off.', blood: 'green', scaled: true, xp: 15, wave: (n, sp) => 6 + sp * 3, lod: true, sounds: { growl: 'BOOMER_GURGLE' } },
  [ZTYPE.BAT]: { name: 'Bat', hp: 28, speed: 7.5, dmg: 5, rate: 0.9, range: 1.3, radius: 0.3, height: 0.4, headY: 0.2, headR: 0.2, structDmg: 0, loot: 0.08, flying: true, common: true, intro: 'Bats join the horde: they fly over every wall. Shotguns and melee.', introBrief: 'Fly over every wall. Shotguns and melee.', scaled: true, wave: () => 7, sounds: { loop: null, growl: 'BAT_SCREECH' } },
  // stops where it sees a survivor within screamRange and screams (screamWindup s, then again every screamRate s while it
  // lives): a horde of screamHorde (+ screamHordeEach a survivor past the first) comes running out of the dark at whoever
  // it screamed at, and every survivor within ringRange m hears ringing (ringT s, or until it is dead). Breaks: hiding
  // quietly behind walls - it brings the crowd to you (SCREECH_* in server/specials/screecher.js)
  [ZTYPE.SCREECHER]: { name: 'Screecher', hp: 130, speed: 2.4, dmg: 7, rate: 1.0, range: 1.5, radius: 0.36, height: 1.78, headY: 1.6, headR: 0.17, structDmg: 12, loot: 0.6, screamRange: 30, screamWindup: 1.3, screamRate: 20, screamHorde: 6, screamHordeEach: 2, ringRange: 22, ringT: 6, legs: true, intro: 'Screechers join the horde: one scream and the dead come running. Kill them before they see you.', introBrief: 'One scream brings a horde. Kill them on sight.', scaled: true, xp: 25, wave: (n, sp) => 1.5 + sp * 2, lod: true },
  // night bosses: hp is what one survivor faces (+ BOSS_HP_PER_PLAYER of it per extra survivor, Game.spawnBosses),
  // sized so that the rounds a survivor has left once the horde has had its share can bring one down before sunrise.
  // Every boss has a weak window after its big move: it reels (Zombies.reel) for *Reel s and takes stunHurt x damage.
  // Tune a boss's window before its hp (docs/bosses.md). The Abomination's is slamReel, after it slams the ground;
  // The Hive Queen's is broodReel, as brood bats tear out of its back (broodWindup s of shrieking first, every broodRate s)
  [ZTYPE.BOSS_ABOMINATION]: { name: 'The Abomination', hp: 4000, speed: 3.0, dmg: 55, rate: 1.8, range: 3.4, radius: 1.5, height: 4.2, headY: 3.7, headR: 0.5, structDmg: 600, loot: 1, knock: 16, boss: true, minNight: 4, slamReel: 1.8, stunHurt: 2, tip: 'It slams the ground and throws boulders. After a slam its fists are stuck for a moment, and it takes double: shoot it then. Spread out and keep moving.', tipBrief: 'Stuck after a slam: shoot it then. Keep moving.', sounds: { loop: 'boss_breath' } },
  [ZTYPE.BOSS_HIVEQUEEN]: { name: 'The Hive Queen', hp: 3400, speed: 2.4, dmg: 35, rate: 1.4, range: 3.0, radius: 1.3, height: 3.6, headY: 3.1, headR: 0.45, structDmg: 300, loot: 1, knock: 8, boss: true, spitRange: 30, spitRate: 1.6, minNight: 5, brood: 3, broodRate: 14, broodWindup: 0.9, broodReel: 2.5, stunHurt: 2, tip: 'Acid barrages, and bats from its back. When it shrieks and the bats tear out, it shudders and takes double: shoot it then, and the bats off whoever they catch.', tipBrief: 'Shoot it as the bats tear out. Keep to cover.', blood: 'green', sounds: { loop: 'boss_breath' } },
  // hunts in packs: dens in the thick woods by day, with the horde from night 2. sense = scent range multiplier.
  // hitRun: it bites once and breaks off before it comes in again. Held up by what the survivors built it rams it:
  // ramDmg to the piece (a metal one takes less, and gives ramRecoil back), then it reels, taking stunHurt x damage.
  // ramWindup: s it snarls before the ram (DOG_RAM_WINDUP when unset) (DOG_* in server/specials/dog.js)
  [ZTYPE.DOG]: { name: 'Zombie Dog', hp: 60, speed: 6.2, dmg: 7, rate: 0.7, range: 1.3, radius: 0.36, height: 0.85, headY: 0.58, headR: 0.14, headFwd: 0.5, bodyTop: 0.66, structDmg: 5, loot: 0.15, leather: 0.3, lungeRange: 6, sense: 1.5, pack: true, common: true, hitRun: true, ramDmg: 180, ramRecoil: 15, stunHurt: 1.5, intro: 'Zombie dogs join the horde: they bite and run. They cannot jump a barricade, but they ram one down. Shoot them as they come in.', introBrief: 'Ram barricades down. Shoot them as they come in.', wave: (n, sp) => 3 + sp * 2, sounds: { loop: null, growl: 'DOG_SNARL', fast: 'DOG_BARK', fastChance: 0.6 } },
  [ZTYPE.SHADE]: { name: 'Shade', hp: 240, speed: 8.6, dmg: 55, rate: 0.9, range: 1.7, radius: 0.36, height: 2.0, headY: 1.82, headR: 0.17, structDmg: 30, loot: 0.8, shade: true, litResist: 0.25, legs: true, intro: 'Shades join the horde: faster than you can run, and they hit hard, but only in the dark. Light your base, and keep a flashlight on them.', introBrief: 'Move only in the dark. Keep a light on them.', scaled: true, xp: 25, wave: (n, sp) => 2.5 + sp * 2.5, lod: true, sounds: { loop: null, growl: 'SHADE_WHISPER' } },
  // night 1's boss: a hulking walker and nothing more, until it is badly hurt - below enrage of its health it roars and
  // comes on at enrageSpeed x its pace. Its body fits a doorway (moveR / moveH, as the Tank's). A swing that finds
  // nobody in reach leaves it stumbling for whiffReel s, taking stunHurt x damage (its weak window: Zombies.resolveHit)
  [ZTYPE.BOSS_BRUTE]: { name: 'The Brute', hp: 750, speed: 1.7, dmg: 24, rate: 1.5, range: 2.3, radius: 0.75, height: 2.55, headY: 2.22, headR: 0.25, moveR: 0.5, moveH: 1.9, structDmg: 240, loot: 1, bossLoot: 4, knock: 7, boss: true, minNight: 1, enrage: 0.5, enrageSpeed: 2.1, whiffReel: 1.5, stunHurt: 2, tip: 'Slow, until it is badly hurt: then it roars and comes at a run. Step back out of its swing and it stumbles, taking double: shoot it then.', tipBrief: 'Step back from its swing, shoot it as it stumbles.', sounds: { loop: 'boss_breath' } },
  // a dog the size of a pony that leads a pack: it hunts as the dogs do (fans out, lunges, bites and runs, rams down
  // what was built), and howls up summon dogs into its pack every summonRate s while it has a survivor to hunt
  // (summonMax of its pack alive at once). Its ram windup stays under the 0.38 s the client's crouch takes to become
  // its howl (client/render/models/dog.js poseCrouch)
  [ZTYPE.BOSS_ALPHA]: { name: 'The Alpha', hp: 750, speed: 6.4, dmg: 20, rate: 0.9, range: 2.0, radius: 0.7, height: 1.65, headY: 1.2, headR: 0.26, headFwd: 1.0, bodyTop: 1.35, moveR: 0.5, moveH: 1.6, structDmg: 40, loot: 1, knock: 6, lungeRange: 9, sense: 2, pack: true, boss: true, minNight: 2, summon: 3, summonRate: 16, summonMax: 6, hitRun: true, ramDmg: 450, ramRecoil: 40, ramWindup: 0.35, stunHurt: 1.5, tip: 'It howls up more dogs, bites and runs, and rams down what you built. Shoot it while it reels.', tipBrief: 'Calls dogs, rams walls. Shoot it while it reels.', sounds: { loop: null, growl: 'DOG_SNARL', fast: 'DOG_BARK', fastChance: 0.6 } },
  // a boomer three times over: it claws at what you built like any of the dead (it does not burst against it), heaves
  // bile in a fan at whoever is within spewRange every spewRate s, and when it dies it bursts: blastRadius, blastDmg
  // to survivors, blastStruct to what you built. Bring it down far from the walls. Once it has heaved it gasps for
  // spewReel s, taking stunHurt x damage (its weak window)
  [ZTYPE.BOSS_BLOATER]: { name: 'The Bloater', hp: 2400, speed: 1.45, dmg: 22, rate: 1.4, range: 2.6, radius: 1.15, height: 2.9, headY: 2.55, headR: 0.32, moveR: 0.5, moveH: 1.9, structDmg: 160, loot: 1, knock: 6, boss: true, minNight: 3, spewRange: 13, spewRate: 7, spewReel: 2, stunHurt: 2, blastRadius: 10, blastDmg: 70, blastStruct: 900, tip: 'Once it has heaved its bile it gasps for breath and takes double: shoot it then. When it dies it bursts, so bring it down far from your walls.', tipBrief: 'Shoot it as it gasps. Kill it far from your walls.', blood: 'green', sounds: { loop: 'boss_breath', growl: 'BOOMER_GURGLE' } },
  // breaks: a team that holds one wall and shoots what it sees. Within smokeRange of a survivor it stops and breathes out
  // a cloud of dark smoke (smokeRadius m, smokeLife s) every smokeRate s, and the dead come at them out of it. When it
  // dies it bursts into one more (deathSmoke); killed among what the survivors built - baseCount pieces or more within
  // baseRange m (Combat.inBase) - the cloud it lets go is big enough to fill the base (baseSmoke). Kill it out past the
  // walls. (AREA.SMOKE: the client's view thickens with it, shared/smoke.js)
  [ZTYPE.SMOKER]: { name: 'Smoker', hp: 130, speed: 2.0, dmg: 8, rate: 1.1, range: 1.55, radius: 0.38, height: 1.86, headY: 1.68, headR: 0.17, structDmg: 15, loot: 0.6, smokeRange: 20, smokeRate: 11, smokeRadius: 4.5, smokeLife: 9, deathSmoke: { radius: 5, life: 10 }, baseSmoke: { radius: 14, life: 26 }, baseRange: 12, baseCount: 4, legs: true, intro: 'Smokers join the horde: they breathe out clouds you cannot see through. Kill them out past your walls, or their last breath fills the base.', introBrief: 'Smoke you cannot see through. Kill them past the walls.', scaled: true, xp: 20, wave: (n, sp) => 3 + sp * 3, lod: true },
  // a flying squirrel the infection has grown to the size of a cat. It never claws or bites in passing (noMelee): it only
  // hurts whoever it has by the face, a nibble of latchDmg every latchRate s (+5% a night). It waits up a tree near the survivors, eyes glowing, chittering now and then (server/specials/crawler.js
  // PERCH_*), and glides down on to the face of whoever comes under it (the leaper's pounce at the head, falling slower),
  // clamping on with all four feet (s.pinned = PIN_FACE). Blind (client/game/facelatch.js: its belly and its membrane
  // over their eyes) but on their feet, they shake it off by throwing their head about (SHAKE_*), or a teammate shoots
  // or strikes it off, or it has had latchMax s. With no tree near, it springs from the ground (latchRange m)
  [ZTYPE.CRAWLER]: { name: 'Crawler', hp: 40, speed: 5.2, dmg: 0, rate: 0.6, range: 1.1, radius: 0.3, height: 0.42, headY: 0.29, headR: 0.13, headFwd: 0.27, bodyTop: 0.33, structDmg: 0, noMelee: true, loot: 0.2, latchRange: 8, latchRate: 0.6, latchDmg: 2, latchMax: 10, intro: 'Crawlers join the horde: they wait up trees, eyes glowing, and glide down onto your face to blind you. Keep away from the trees they chitter in, and shake your head hard to tear one off.', introBrief: 'Wait up trees, glide onto your face. Shake it off.', scaled: true, xp: 15, wave: (n, sp) => 5 + sp * 4, sounds: { loop: null, growl: 'CRAWLER_CHITTER' } },
  // a firefighter who went into the fire and never came out: still smouldering inside its turnout coat, which no
  // fire gets through (fireproof: fire does it no harm - a molotov, a campfire, the flamethrower - though the sun
  // still does). What the survivors built catches from it: every igniteRate s it sets alight a piece within
  // igniteRange m of its body (STRUCT_FIRE), and its blows set survivors alight (PLAYER_FIRE). Breaks the wooden fort:
  // metal does not burn, and a hammer puts a fire out
  [ZTYPE.FLAMMER]: { name: 'Flammer', hp: 150, speed: 2.1, dmg: 9, rate: 1.2, range: 1.55, radius: 0.4, height: 1.85, headY: 1.67, headR: 0.18, structDmg: 15, loot: 0.6, fireproof: true, igniteRange: 1.2, igniteRate: 1.5, deathFire: { radius: 2.5, time: 8, dps: 40 }, legs: true, intro: 'Flammers join the horde: they set your walls and you alight. A hammer puts out a fire; mash Space to put out you.', introBrief: 'Set walls and you alight. Hammer the fire, mash Space.', scaled: true, xp: 20, wave: (n, sp) => 3 + sp * 3, lod: true },
  // one walker in twenty spawns as her (ZombieManager.spawn's roll), from the first night: not a kind that joins the
  // horde on a night of its own (rolled: Game.startNight never draws her in, and no dawn card names her). Shot in the
  // belly - a bullet that strikes her front between the hips (LEG_ZONE) and bellyTop of her height (Combat.bellyHit) -
  // it bursts open (ZSTATUS.BURST) and twins, her brood of babies, crawl out of it after whoever shot her, crying as they
  // come (Combat.burstBelly). Her head, her legs or her back and nothing comes out
  [ZTYPE.MOTHER]: { name: 'Mother', hp: 160, speed: 1.8, dmg: 9, rate: 1.2, range: 1.55, radius: 0.4, height: 1.72, headY: 1.55, headR: 0.16, structDmg: 14, loot: 0.6, bellyTop: 0.68, brood: 2, broodSpread: 0.9, broodKick: 5, minNight: 1, legs: true, rolled: true, xp: 20, lod: true },
  // a Mother's baby (crawl: on its front and its hands from birth, low and quick, crying as it comes). It never joins the
  // horde on its own (born: it only comes out of her belly, Game.startNight passes it over); its minNight is hers, for the bestiary
  [ZTYPE.BABY]: { name: 'Zombie Baby', hp: 28, speed: 2.6, dmg: 4, rate: 0.8, range: 1.1, radius: 0.22, height: 0.3, headY: 0.21, headR: 0.08, headFwd: 0.22, bodyTop: 0.2, structDmg: 2, loot: 0.05, crawl: true, born: true, common: true, minNight: 1 },
};

// a kind that bleeds green (its row's blood): the spitter's acid, a boomer's bile
export const greenBlood = (t) => ZOMBIE_DEFS[t]?.blood === 'green';
// the createLoop name a kind carries (its row's sounds.loop: 'zombie_idle' when unset, null for none)
export const zombieLoop = (t) => {
  const l = ZOMBIE_DEFS[t]?.sounds?.loop;
  return l === undefined ? 'zombie_idle' : l;
};

// Overkill: a zombie killed by one heavy blow (a rifle round, a point-blank blast, an explosion) that drives it far
// below zero is blown apart instead of dropping. minHit = damage the blow has to deal, overkill = how far below zero
// it has to take the zombie, as a share of its full health.
export const GIB = { minHit: 100, overkill: 0.25 };

// zombie animation states (sent over the wire, 4 bits)
export const ZANIM = uniqueIds('ZANIM', {
  IDLE: 0,
  WALK: 1,
  RUN: 2,
  ATTACK: 3,
  SPECIAL: 4, // spit / rope / leap-windup / slam / scream
  AIRBORNE: 5, // leaping / thrown
  STAGGER: 6,
  DEAD: 7,
  EAT: 8, // idle feeding pose
  FROZEN: 9, // shade pinned by light: holds whatever pose it was caught in
  STUMBLE: 10, // shot in the leg: it trips and catches itself
  RISE: 11, // climbing out of a grave (cemetery.js): its feet are still under the ground
});

// the stray cat's animation states (sent over the wire)
export const CANIM = uniqueIds('CANIM', {
  IDLE: 0,
  WALK: 1,
  RUN: 2,
  SIT: 3,
  HELD: 4, // in a survivor's arms (its HOLDER field says whose)
  PET: 5, // ...and being stroked: it purrs
});
