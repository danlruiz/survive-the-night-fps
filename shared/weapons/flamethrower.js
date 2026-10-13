import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'FLAMETHROWER',
  id: 67,
  def: { name: 'Flamethrower', cat: 'weapon', stack: 1, color: 0xb5651d, desc: 'A short cone of fire. Whatever it touches keeps burning.' },
  stats: { slot: 0, damage: 6, rate: 0.08, mag: 100, reload: 2.8, ammo: 6, pellets: 1, spread: 0.02, moveSpread: 0.01, recoil: 0.003, range: 11, headMul: 1, auto: true, noise: 30, flame: { cone: 0.2 } },
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 2, [ITEM.SCRAP]: 4, [ITEM.TAPE]: 2, [ITEM.CHEM]: 1 }, station: 'bench', schem: ITEM.SCHEM_EXPLOSIVES },
  salvage: { [ITEM.GUNPARTS]: 1, [ITEM.SCRAP]: 2, [ITEM.TAPE]: 1 },
  feat: 'kill_flame',
  hole: null,
  shotSound: null,
};
