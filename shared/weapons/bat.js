import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'BAT',
  id: 51,
  def: { name: 'Baseball Bat', cat: 'weapon', stack: 1, color: 0x9c7a4b, desc: 'Heavy swings, knockback.' },
  stats: { slot: 2, melee: true, damage: 60, rate: 0.72, range: 2.4, altDamage: 100, altRate: 1.3, headMul: 1.8, knock: 5, swing: 0.2 },
  recipe: { n: 1, cost: { [ITEM.WOOD]: 3 } },
  salvage: { [ITEM.WOOD]: 1 },
  feat: null,
  blow: 'BLUNT',
  pry: 1.5,
};
