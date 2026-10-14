// What the dead are made of: which kinds come out by day (daySpecial, for the dead the day puts about:
// Zombies.spawnInitial and its kin) and what each night's horde is made of (nightWaves, for Game.startNight). Which
// kinds have joined the run so far is drawn from the seed in shared/nights.js (joinOrder); the numbers that shape
// each kind's own fight are in server/specials/.
import { NIGHT_LENGTH, NIGHT_WAVES, WAVE_TIMES, WAVE_SPREAD } from '../shared/constants.js';
import { ZTYPE, ZOMBIE_DEFS } from '../shared/defs.js';
import { nightRank } from '../shared/acts.js';
import { nightTheme, joinNight, hasJoined, kindsJoining } from '../shared/nights.js';

// the kinds a night's waves are drawn from, in ZTYPE order: every one whose row has a wave weight (shared/defs/zombies.js)
const WAVE_KINDS = Object.values(ZTYPE).filter((t) => ZOMBIE_DEFS[t].wave);

export const SPAWN_SPREAD = 4; // a horde group is scattered this far round the spot picked for it (Game.spawnHordeGroup)
// By day the further out from the car (where every run starts), the stronger the dead, whatever the night: none of the
// specials inside DAY_SPECIAL_NEAR, then a share of them that grows to DAY_SPECIAL_MAX at DAY_SPECIAL_FAR and beyond
// (daySpecial). Places lie 115 m from the car at p10, 216 m at the median and 293 m at p90 (20 valleys). The kinds come
// in by distance: spitters and boomers first, leapers from DAY_LEAPER of the ramp, ropers from DAY_ROPER. No shades
// (the sun pins them out here), no bats and no Tanks: those, and every boss, only come at night
const DAY_SPECIAL_NEAR = 90;
const DAY_SPECIAL_FAR = 320;
const DAY_SPECIAL_MAX = 0.4;
const DAY_LEAPER = 0.35;
const DAY_ROPER = 0.65;
// One of the specials for a day zombie standing at (x, z), or -1 for the plain dead: the further from the car, the
// likelier and the nastier (DAY_SPECIAL_*), of the kinds the run has met so far (Game.joined)
export function daySpecial(g, x, z) {
  const car = g.world.car;
  const k = Math.min(1, (Math.hypot(x - car.x, z - car.z) - DAY_SPECIAL_NEAR) / (DAY_SPECIAL_FAR - DAY_SPECIAL_NEAR));
  if (k <= 0 || g.rng() >= DAY_SPECIAL_MAX * k * g.diff.specials) return -1;
  const r = g.rng() * (k >= DAY_ROPER ? 4 : k >= DAY_LEAPER ? 3 : 2);
  const t = r < 1 ? ZTYPE.SPITTER : r < 2 ? ZTYPE.BOOMER : r < 3 ? ZTYPE.LEAPER : ZTYPE.ROPER;
  return g.joined(t) ? t : -1;
}

// Night n's waves (Game.startNight): `total` of the dead in all (Game.hordeSize) for this many humans, in NIGHT_WAVES
// waves, each a queue of the kinds that come in it
export function nightWaves(g, n, humans, total) {
  const shares = [0.3, 0.33, 0.37];
  const scale = g.nightLen / NIGHT_LENGTH;
  // tonight's theme re-weights the blend below (the client works out the same theme from the seed to warn the team)
  const theme = g.themes ? nightTheme(g.seed, n, g.act) : null;
  const rank = nightRank(g.act, n); // (which kinds have joined the horde: on the mainland, those of night 4 at the least)
  const shadeNight = joinNight(g.seed, ZTYPE.SHADE);
  const shadeCap = Math.min(6, (1 + Math.floor((rank - shadeNight) / 2) + Math.floor(humans / 2)) * (theme?.shadeCap ?? 1));
  let shades = 0;
  const waves = [];
  for (let k = 0; k < NIGHT_WAVES; k++) {
    const count = Math.max(3, Math.round(total * shares[k]));
    const sp = k / (NIGHT_WAVES - 1); // later waves bring more specials
    // (each kind's weight is its row's wave: shared/defs/zombies.js ZOMBIE_DEFS. A dog pick is a pack of 2-3; each screecher's
    // scream brings a crowd of its own, SCREECH_* in specials/screecher.js)
    const weights = WAVE_KINDS.map((t) => [t, ZOMBIE_DEFS[t].wave(n, sp)]);
    // one new kind a night: each stays out of the horde until its night comes
    for (const wt of weights) if (!hasJoined(g.seed, wt[0], n, g.act)) wt[1] = 0;
    if (theme) for (const wt of weights) wt[1] *= theme.mul[wt[0]] ?? 1;
    // Ember thins the kinds that punish movement (scaled). Blackout brings more of them. Walkers and tanks stay: one is
    // the crowd, the other is a slow thing you can see coming. The night's guaranteed new kind is added below.
    if (g.diff.specials !== 1) {
      for (const wt of weights) if (ZOMBIE_DEFS[wt[0]].scaled) wt[1] *= g.diff.specials;
    }
    const tot = weights.reduce((a, b) => a + b[1], 0);
    const q = [];
    for (let i = 0; i < count; i++) {
      let r = g.rng() * tot;
      for (const [t, wgt] of weights) {
        r -= wgt;
        if (r <= 0) {
          // only so many shades a night: each one ties up a light (or a survivor holding a beam on it)
          if (t === ZTYPE.SHADE && shades++ >= shadeCap) {
            q.push(ZTYPE.RUNNER);
            break;
          }
          const k = ZOMBIE_DEFS[t].pack ? 2 + (g.rng() < 0.5 ? 1 : 0) : 1;
          for (let j = 0; j < k; j++) q.push(t);
          i += k - 1;
          break;
        }
      }
    }
    waves.push({ start: WAVE_TIMES[k] * scale, queue: q, started: false, spawnT: 0, interval: (WAVE_SPREAD * scale) / Math.max(1, Math.ceil(count / 3.5)) });
  }
  // the night's new kind is in it for certain (the dawn card and the dusk horn said it would be), and from their
  // night on there is always at least one shade out there. Both come with the second wave, in a walker's place
  const fresh = [];
  for (const t of kindsJoining(g.seed, n, g.act)) if (!waves.some((wv) => wv.queue.includes(t))) fresh.push(t);
  if (rank >= shadeNight && !shades && !fresh.includes(ZTYPE.SHADE)) fresh.push(ZTYPE.SHADE);
  for (const t of fresh) {
    const q = waves[1].queue;
    const at = q.indexOf(ZTYPE.WALKER);
    q[at >= 0 ? at : Math.floor(g.rng() * q.length)] = t;
  }
  return waves;
}
