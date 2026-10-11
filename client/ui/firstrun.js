// What a brand-new player is shown differently (#270): the first things they see build their idea of the game, so
// their first run opens on the car and the goal, the new-game card suggests Ember, and their first runs keep the
// HUD to health, ammo, the goal and the compass. "New" is this browser's own record (records.js): a player who has
// finished no run here. Nothing in here is sent to the server.
//
// To see it all again without wiping the record: open the game with ?newplayer in the address. That tab plays as a
// brand-new player until it is closed, and the key hints and the remembered difficulty start over.
import { DIFFICULTIES } from '../../shared/difficulty.js';
import { lsGet, lsSet } from './dom.js';

const DIFF_KEY = 'stn.difficulty'; // the difficulty this browser last made a game on
const HINTS_KEY = 'stn.keyhints'; // keyhints.js: how often each key hint's thing was done
const NEW_KEY = 'stn.newplayer'; // sessionStorage: this tab plays as a brand-new player (?newplayer)
export const NEW_DIFFICULTY = 'ember'; // what a player with no run behind them is offered first
export const SIMPLE_HUD_RUNS = 3; // runs played with the simple HUD (Settings -> Show the whole HUD turns it off)
export const MAP_REVEAL_DIST = 80; // m from the car: on a simple-HUD run the minimap comes up the first time you are this far out

// ?newplayer in the address (main.js, as the page loads): this tab is a brand-new player from now on, and what a
// first run teaches starts over. The address loses it once a game is joined, so it is kept for the tab.
export function applyNewPlayer(search = globalThis.location?.search ?? '') {
  if (!new URLSearchParams(search).has('newplayer')) return false;
  try {
    sessionStorage.setItem(NEW_KEY, '1');
    localStorage.removeItem(HINTS_KEY);
    localStorage.removeItem(DIFF_KEY);
  } catch {
    /* storage unavailable: nothing to start over */
  }
  return true;
}

const forcedNew = () => {
  try {
    return sessionStorage.getItem(NEW_KEY) === '1';
  } catch {
    return false;
  }
};

// rec: loadRecord()
const runsIn = (rec) => (forcedNew() ? 0 : rec?.total?.runs | 0);
export const isFirstRun = (rec) => runsIn(rec) === 0;

// The difficulty the new-game card starts on: the one last picked here, else Ember for a player with no run behind
// them and Nightfall (the game as it has always been) for anyone else.
export function suggestedDifficulty(rec, last = lsGet(DIFF_KEY, '')) {
  if (DIFFICULTIES.some((d) => d.id === last)) return last;
  return isFirstRun(rec) ? NEW_DIFFICULTY : 'nightfall';
}

export function rememberDifficulty(id) {
  if (DIFFICULTIES.some((d) => d.id === id)) lsSet(DIFF_KEY, id);
}

// The simple HUD: on a player's first SIMPLE_HUD_RUNS runs (early: earlyRuns(rec), worked out as a run starts), unless
// they asked for everything
export const earlyRuns = (rec) => runsIn(rec) < SIMPLE_HUD_RUNS;
export const simpleHud = (early, settings) => !!early && settings?.fullHud !== true;

// On a simple-HUD run the minimap waits until it is needed to find the way back: MAP_REVEAL_DIST m from the car, the
// dusk horn (or the night, the final stand, the crossing), or a noise of yours waking the dead (its ring is drawn on
// the minimap: Game's heard). Once up it stays up for the run. dayPhase: the day, before the horn
export const mapNeeded = ({ dayPhase, dusk, dist }) => !dayPhase || dusk || dist >= MAP_REVEAL_DIST;

// The look that faces a survivor at (x, z) towards (tx, tz): forward is (-sin yaw, -cos yaw), as everywhere
export const yawTowards = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

// The goal in one line, for the opening of a first run: "Fix the car: 7 parts"
export function goalLine(need, thing = 'car') {
  return `Fix the ${thing}: ${need} part${need === 1 ? '' : 's'}`;
}
