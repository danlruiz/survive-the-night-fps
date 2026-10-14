// Game content definitions shared by client and server, a module for each kind of thing in shared/defs/. This file
// re-exports every one of them, so whatever imports from defs.js finds it all here.
// Numeric ids are part of the wire protocol - do not renumber.
export * from './defs/itemdefs.js';
export * from './defs/escape.js';
export * from './defs/fire.js';
export * from './defs/structures.js';
export * from './defs/crafting.js';
export * from './defs/zombies.js';
export * from './defs/projectiles.js';
export * from './defs/sounds.js';
export * from './defs/events.js';
export * from './defs/zones.js';
export * from './defs/loot.js';
