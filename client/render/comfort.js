// Settings > Accessibility, as the renderer needs it: how bright the game's sudden flashes are drawn. 1 is as designed;
// "Reduce flashes" (main.js applySettings) turns it down for the muzzle flashes (their light and their sprites), the
// light and the fireball's glow of a blast (lights.js, effects.js) and lightning (game/weather.js).
export const comfort = { flash: 1 };

export const REDUCED_FLASH = 0.3;
