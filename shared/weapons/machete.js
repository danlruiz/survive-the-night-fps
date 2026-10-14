import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'MACHETE',
  id: 53,
  def: { name: 'Machete', cat: 'weapon', stack: 1, color: 0x9aa3a8, desc: 'Cleaves through the horde.' },
  stats: { slot: 2, melee: true, damage: 75, rate: 0.55, range: 2.2, altDamage: 125, altRate: 1.0, headMul: 2.0, knock: 1.5, swing: 0.15 },
  recipe: { n: 1, cost: { [ITEM.SCRAP]: 4, [ITEM.LEATHER]: 1, [ITEM.TAPE]: 1 }, station: 'bench' },
  salvage: { [ITEM.SCRAP]: 2, [ITEM.LEATHER]: 1 },
  feat: null,
  blow: 'CHOP',
  pry: 1.3,
};
