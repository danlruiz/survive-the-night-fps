import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'CROSSBOW',
  id: 66,
  def: { name: 'Crossbow', cat: 'weapon', stack: 1, color: 0x5a4a34, desc: 'One heavy bolt, almost no noise. Slow to cock.' },
  stats: { slot: 0, damage: 160, rate: 0.4, mag: 1, reload: 2.2, autoReload: true, ammo: 5, pellets: 1, spread: 0.004, moveSpread: 0.02, recoil: 0.03, range: 110, headMul: 2.5, auto: false, noise: 6, quiet: true, sound: 'crossbow' },
  recipe: { n: 1, cost: { [ITEM.ROPE]: 1, [ITEM.STICK]: 4, [ITEM.SCRAP]: 3 }, station: 'bench' },
  salvage: { [ITEM.ROPE]: 1, [ITEM.SCRAP]: 1 },
  feat: null,
  hole: 0.5,
  shotSound: 'CROSSBOW',
  kick: [0, 0.1],
};
