import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'HAMMER',
  id: 54,
  def: { name: 'Hammer', cat: 'weapon', stack: 1, color: 0x7a5c3a, desc: 'Build and repair structures.' },
  stats: { slot: 4, melee: true, damage: 25, rate: 0.6, range: 2.0, altDamage: 25, altRate: 0.6, headMul: 1.5, knock: 1, swing: 0.15, build: true },
  recipe: { n: 1, cost: { [ITEM.WOOD]: 1, [ITEM.SCRAP]: 1 } },
  salvage: { [ITEM.SCRAP]: 1 },
  feat: null,
  blow: 'HAMMER',
};
