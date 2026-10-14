// The client's Game (client/game/game.js) in parts. game.js keeps what composes it - the constructor, which builds every
// subsystem, and the frame (update) - and each file here holds the methods of one of its responsibilities, laid onto
// Game as if they had been written in it: they are called on the game as this.name(...), and from outside as
// game.name(...), like any of its own.
import * as world from './world.js';
import * as prewarm from './prewarm.js';
import * as session from './session.js';
import * as players from './players.js';
import * as events from './events.js';
import * as shots from './shots.js';
import * as localevents from './localevents.js';
import * as notices from './notices.js';
import * as screens from './screens.js';
import * as controls from './controls.js';
import * as inventory from './inventory.js';
import * as build from './build.js';
import * as interact from './interact.js';
import * as look from './look.js';
import * as hud from './hud.js';
import * as markers from './markers.js';
import * as waypoints from './waypoints.js';
import * as view from './view.js';
import * as selfbody from './selfbody.js';
import * as scenes from './scenes.js';
import * as surroundings from './surroundings.js';

const PARTS = { world, prewarm, session, players, events, shots, localevents, notices, screens, controls, inventory, build, interact, look, hud, markers, waypoints, view, selfbody, scenes, surroundings };

// Lays each part's methods (and getters) onto the class, not enumerable, as a class's own are. Two parts giving the same
// name is a mistake, not an override.
export function installParts(cls) {
  for (const [part, { methods }] of Object.entries(PARTS)) {
    for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(methods))) {
      if (name in cls.prototype) throw new Error(`game/${part}.js: Game.${name} is defined twice`);
      Object.defineProperty(cls.prototype, name, { ...d, enumerable: false });
    }
  }
}
