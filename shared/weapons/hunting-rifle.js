import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'HUNTING_RIFLE',
  id: 62,
  def: { name: 'Hunting Rifle', cat: 'weapon', stack: 1, color: 0x6b4f33, desc: 'Bolt-action .308. Pierces.' },
  stats: { slot: 0, damage: 180, rate: 1.0, mag: 5, reload: 2.6, ammo: 3, pellets: 1, spread: 0.002, moveSpread: 0.03, recoil: 0.09, range: 220, headMul: 3.0, auto: false, noise: 100, pierce: 3, sound: 'rifle' },
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 3, [ITEM.WOOD]: 2, [ITEM.TAPE]: 1 }, station: 'bench', schem: ITEM.SCHEM_RIFLE },
  salvage: { [ITEM.GUNPARTS]: 1, [ITEM.WOOD]: 1 },
  feat: 'kill_rifle',
  hole: 1.25,
  shotSound: 'RIFLE',
  kick: [1.3, 0.3],
};
