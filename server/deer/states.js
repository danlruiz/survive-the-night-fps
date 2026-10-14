// What a group of deer is doing, and what one of a hunting pack is (server/deer.js, server/deer/pack.js)

// a group: grazing its ground, walking on to new ground, running from something, standing watching where it came
// from, and (the undead) hunting a survivor
export const MODE = { GRAZE: 0, DRIFT: 1, BOLT: 2, WARY: 3, HUNT: 4 };
// (undead) one of a pack on the hunt (m.hs): closing in or keeping its distance until it may go, standing with its
// antlers down (the telegraph), the charge, and carrying on past
export const HS = { CLOSE: 0, WINDUP: 1, CHARGE: 2, PAST: 3 };
export const SNORT_EVERY = 5; // s between snorts of one group
