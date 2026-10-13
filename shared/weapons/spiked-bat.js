import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'SPIKED_BAT',
  id: 52,
  def: { name: 'Spiked Bat', cat: 'weapon', stack: 1, color: 0x8a5a3b, desc: 'A bat wrapped in nails and wire.' },
  stats: { slot: 2, melee: true, damage: 95, rate: 0.72, range: 2.4, altDamage: 155, altRate: 1.3, headMul: 1.8, knock: 5, swing: 0.2 },
  recipe: { n: 1, cost: { [ITEM.WOOD]: 3, [ITEM.NAILS]: 8, [ITEM.WIRE]: 1 }, station: 'bench' },
  salvage: { [ITEM.WOOD]: 1, [ITEM.NAILS]: 4 },
  feat: null,
  blow: 'BLUNT',
};
