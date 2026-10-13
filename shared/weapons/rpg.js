import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'RPG',
  id: 68,
  def: { name: 'RPG', cat: 'weapon', stack: 1, color: 0x4b5320, desc: 'Fires one rocket grenade at a time. It bursts on impact and tears apart everything around it. Slow to reload, and very loud.' },
  stats: { slot: 0, damage: 360, rate: 0.5, mag: 1, reload: 3.4, autoReload: true, ammo: 7, pellets: 1, spread: 0.008, moveSpread: 0.03, recoil: 0.12, range: 200, headMul: 1, auto: false, noise: 90, sound: 'rpg', rocket: { speed: 48, grav: 3, radius: 5.5 } },
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 3, [ITEM.SCRAP]: 5, [ITEM.TAPE]: 2 }, station: 'bench', schem: ITEM.SCHEM_EXPLOSIVES },
  salvage: { [ITEM.GUNPARTS]: 1, [ITEM.SCRAP]: 2, [ITEM.TAPE]: 1 },
  feat: 'kill_rpg',
  hole: null,
  shotSound: 'RPG',
  kick: [1.8, 0.45],
};
