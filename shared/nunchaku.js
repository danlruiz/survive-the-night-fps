// Nunchucks (ITEM.NUNCHAKU): the rules both ends run. No DOM, no three.js: the server and the client read them, and
// scripts/test-nunchucks.js. The simulation of the chain and the free handle that both views draw is
// shared/nunchaku-chain.js (re-exported here).
//
// THE RULES. Every other melee weapon lands its blow on the command that swings it. Nunchucks are a moveset: a move
// is started by a command (`nk_swing`), its blows land a set time into it (`melee`, with the move and which of its
// hits), and a press inside the window after a move continues the combo with the move that follows it. All of it is
// simulatePlayer's, so the client predicts it and the server is the authority, command for command.
//
// It adds no field to the simulated state, and so nothing to the wire. With nunchucks in hand three fields that a
// melee weapon never used carry it (playersim.js):
//   s.recoil    the move under way or last made, + 1 (0: no combo). A gun's count of shots in a row, a combo's count
//               of moves in a row.
//   s.cooldown  runs down from the move's `rate` to 0 as for any weapon, and then on down to -NK.window: the time
//               since the move ended. Past the window the combo is over (recoil back to 0, cooldown to 0).
//   s.reloadT   the heavy attack's wind-up clock: it counts UP while the secondary button is held, and is 0 again the
//               moment the strike is let go. (So PFLAG.RELOADING, which the snapshot sets from reloadT > 0, says
//               "winding up" of a survivor holding nunchucks: that is how others see the spin.)
import { BTN, STAMINA_REGEN_DELAY } from './constants.js';

// The moves. damage: of each hit; hits: when they land (s after the move starts); rate: until the next move can
// start; stamina: what starting it costs; knock: the shove (3 and up staggers); targets: how many it can strike;
// reach: added to the weapon's range; next: the move a press inside the window goes on to. (The hit times are when
// the simulated free handle comes round to the front in each move's animation - models/nunchaku.js - so that what
// lands is what is seen to land; they were read off the animation, the animation does not read them.)
export const NK_MOVE = { WHIP: 0, BACKHAND: 1, EIGHT: 2, SMASH: 3, LUNGE: 4, SWEEP: 5, RETREAT: 6, HEAVY1: 7, HEAVY2: 8, HEAVY3: 9 };
export const NK_MOVES = [
  // the light chain: forward whip, backhand, a figure-eight that lands twice, an overhead smash
  { name: 'whip', damage: 28, hits: [0.14], rate: 0.32, stamina: 5, knock: 0.6, targets: 1, reach: 0, next: 1 },
  { name: 'backhand', damage: 30, hits: [0.14], rate: 0.3, stamina: 5, knock: 0.6, targets: 1, reach: 0, next: 2 },
  { name: 'eight', damage: 24, hits: [0.14, 0.27], rate: 0.44, stamina: 7, knock: 0.4, targets: 1, reach: 0, next: 3 },
  { name: 'smash', damage: 92, hits: [0.21], rate: 0.62, stamina: 10, knock: 4, targets: 1, reach: 0, next: 0 },
  // openers, by how the survivor is moving: at a sprint, crouched, backing away. Each goes on to the backhand
  { name: 'lunge', damage: 44, hits: [0.15], rate: 0.42, stamina: 8, knock: 2.5, targets: 1, reach: 0.5, next: 1 },
  { name: 'sweep', damage: 30, hits: [0.13], rate: 0.38, stamina: 6, knock: 1.5, targets: 2, reach: 0, next: 1 },
  { name: 'retreat', damage: 26, hits: [0.14], rate: 0.34, stamina: 5, knock: 3.5, targets: 1, reach: 0, next: 1 },
  // the heavy attack let go after a short, a middling and a full wind-up (NK.tiers)
  { name: 'heavy', damage: 70, hits: [0.14], rate: 0.7, stamina: 6, knock: 3, targets: 1, reach: 0.1, next: 0, heavy: 1 },
  { name: 'heavy2', damage: 115, hits: [0.14], rate: 0.75, stamina: 6, knock: 5, targets: 2, reach: 0.2, next: 0, heavy: 2 },
  { name: 'heavy3', damage: 165, hits: [0.14], rate: 0.8, stamina: 6, knock: 7, targets: 2, reach: 0.3, next: 0, heavy: 3 },
];
export const NK = {
  window: 0.45, // s after a move's `rate` has run out in which the next press continues the combo
  tiers: [0.4, 0.95], // wind-up (s) at which the heavy attack becomes heavy2, heavy3
  windMax: 2.5, // the clock stops here (the spin can be held on, at its cost)
  windDrain: 11, // stamina a second while winding up
  tired: 0.7, // damage x this from a survivor who is exhausted, and no combo: only the opener
};

/** The move a wind-up of `t` seconds lets go. */
export const heavyMove = (t) => (t >= NK.tiers[1] ? NK_MOVE.HEAVY3 : t >= NK.tiers[0] ? NK_MOVE.HEAVY2 : NK_MOVE.HEAVY1);
/** The move under way or last made (null: none), from the simulated state. */
export const nkMove = (s) => (s.recoil > 0 ? NK_MOVES[Math.round(s.recoil) - 1] || null : null);
/** How far into the heavy wind-up they are: 0 (not winding), or the tier 1..3 it would let go now. */
export const nkWind = (s) => (s.reloadT > 0 ? NK_MOVES[heavyMove(s.reloadT)].heavy : 0);
/** The opener for how they are moving (b: the command's buttons). */
export function nkOpener(s, b) {
  if (s.sprinting) return NK_MOVE.LUNGE;
  if (s.crouch) return NK_MOVE.SWEEP;
  if (b & BTN.BACK && !(b & BTN.FWD)) return NK_MOVE.RETREAT;
  return NK_MOVE.WHIP;
}

/**
 * One command of the weapon's state machine (simulatePlayer's melee branch, with nunchucks in hand).
 * b: the buttons; cd0: s.cooldown before this command ran it down; events: where { type: 'nk_swing' | 'nk_wind' |
 * 'melee' | 'exhausted' } go (may be null).
 */
export function simNunchaku(s, b, cd0, weapon, events, dt) {
  const attack = b & BTN.ATTACK;
  const alt = b & BTN.ALT;
  // the blows of the move under way: each lands on the command in which the move's clock passes its time
  const mv = nkMove(s);
  if (mv && cd0 > 0) {
    const was = mv.rate - cd0, now = was + dt;
    for (let i = 0; i < mv.hits.length; i++) {
      if (was < mv.hits[i] && mv.hits[i] <= now && events) events.push({ type: 'melee', weapon, heavy: !!mv.heavy, move: Math.round(s.recoil) - 1, hit: i });
    }
  }
  // the window after it: the cooldown runs on below zero, and the combo is over when it has run out
  if (cd0 <= 0 && s.recoil > 0) {
    s.cooldown = cd0 - dt;
    if (s.cooldown < -NK.window) {
      s.cooldown = 0;
      s.recoil = 0;
    }
  }
  const ready = s.cooldown <= 0 && s.switchT <= 0;
  const start = (m) => {
    const d = NK_MOVES[m];
    s.recoil = m + 1;
    s.cooldown = d.rate;
    s.fireCount = (s.fireCount + 1) & 255;
    spend(s, d.stamina, events);
    if (events) events.push({ type: 'nk_swing', weapon, move: m });
  };
  if (s.reloadT > 0) {
    // winding up: held, it spins on (the clock stops at windMax) and costs stamina; let go, or with the primary
    // button pressed, or out of breath, it is struck
    if (alt && !attack && !s.exhausted) {
      s.reloadT = Math.min(NK.windMax, s.reloadT + dt);
      spend(s, NK.windDrain * dt, events);
    }
    if (!alt || attack || s.exhausted) {
      const m = heavyMove(s.reloadT);
      s.reloadT = 0;
      start(m);
    }
  } else if (ready && alt && !attack) {
    s.reloadT = dt;
    s.recoil = 0;
    s.cooldown = 0;
    if (events) events.push({ type: 'nk_wind', weapon });
  } else if (ready && attack) {
    start(mv && !s.exhausted ? mv.next : nkOpener(s, b));
  }
}

function spend(s, n, events) {
  if (s.exhausted) return;
  s.stamina -= n;
  s.staminaDelay = STAMINA_REGEN_DELAY;
  if (s.stamina <= 0) {
    s.stamina = 0;
    s.exhausted = 1;
    if (events) events.push({ type: 'exhausted' });
  }
}

// the chain (shared/nunchaku-chain.js)
export { NK_GEOM, NK_CHAIN, NK_SIM, NK_COL, NK_JOINTS, ChainSim } from './nunchaku-chain.js';
