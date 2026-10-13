import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'KNIFE',
  id: 50,
  def: { name: 'Knife', cat: 'weapon', stack: 1, color: 0xaaaaaa, desc: 'Fast. Quiet.' },
  stats: { slot: 2, melee: true, damage: 38, rate: 0.42, range: 2.0, altDamage: 80, altRate: 1.0, headMul: 1.6, knock: 0.5, swing: 0.12 },
  // what everyone starts with, made again cheaply when lost
  recipe: { n: 1, cost: { [ITEM.SCRAP]: 2, [ITEM.LEATHER]: 1 }, station: 'bench' },
  salvage: { [ITEM.SCRAP]: 1, [ITEM.LEATHER]: 1 },
  feat: 'kill_knife',
  blow: 'SLASH',
};
