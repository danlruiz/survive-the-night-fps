import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'FLARE_GUN',
  id: 56, // a sidearm (the pistol's slot): one parachute flare at a time, up into the sky (shared/skyflare.js)
  def: { name: 'Flare Gun', cat: 'weapon', stack: 1, color: 0xe0601c, desc: 'Fires a parachute flare high into the sky. It lights the ground for a minute as it drifts back down, and Shades cannot move under it. Takes the pistol\'s place.' },
  // a break-open single shot: it hurts nothing, the flare is the point. The pop carries about as far as a pistol shot
  stats: { slot: 1, damage: 0, rate: 0.6, mag: 1, reload: 1.7, autoReload: true, ammo: 9, pellets: 1, spread: 0.006, moveSpread: 0.02, recoil: 0.07, range: 0, headMul: 1, auto: false, noise: 50, sound: 'flaregun', skyflare: true },
  // the flare gun is a pipe and a hammer; a shell is a road flare's makings with a little chute packed on top
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 1, [ITEM.SCRAP]: 3, [ITEM.TAPE]: 1 }, station: 'bench' },
  salvage: { [ITEM.SCRAP]: 2 }, // (made of a gun part, 3 scrap and tape: the part is what is not got back)
  feat: null,
  hole: null,
  shotSound: 'FLARE_GUN',
  kick: [1.5, 0.12],
};
