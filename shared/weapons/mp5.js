import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'MP5',
  id: 64,
  def: { name: 'MP5', cat: 'weapon', stack: 1, color: 0x353535, desc: 'Full-auto 9mm submachine gun. Fast and quiet.' },
  stats: { slot: 0, damage: 25, rate: 0.075, mag: 30, reload: 1.9, ammo: 0, pellets: 1, spread: 0.017, moveSpread: 0.016, recoil: 0.011, range: 90, headMul: 2.4, auto: true, noise: 35, sound: 'mp5' },
  // a step past the pistol
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 2, [ITEM.SCRAP]: 4, [ITEM.TAPE]: 1 }, station: 'bench' },
  salvage: { [ITEM.GUNPARTS]: 1, [ITEM.SCRAP]: 2 },
  feat: null,
  hole: 0.75,
  shotSound: 'MP5',
  kick: [0.8, 0.04],
};
