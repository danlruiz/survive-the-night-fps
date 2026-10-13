import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'M4A1',
  id: 63,
  def: { name: 'M4A1', cat: 'weapon', stack: 1, color: 0x2e2f2c, desc: 'Full-auto 5.56 carbine. Accurate, soft recoil.' },
  stats: { slot: 0, damage: 30, rate: 0.085, mag: 30, reload: 2.1, ammo: 4, pellets: 1, spread: 0.013, moveSpread: 0.032, recoil: 0.015, range: 170, headMul: 2.6, auto: true, sound: 'm4a1' },
  // one of the dearest guns short of the anti-tank rifle, behind the Rifle Schematic like it
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 3, [ITEM.SCRAP]: 4, [ITEM.TAPE]: 2 }, station: 'bench', schem: ITEM.SCHEM_RIFLE },
  salvage: { [ITEM.GUNPARTS]: 2, [ITEM.SCRAP]: 2 },
  feat: 'kill_rifle',
  hole: 1,
  shotSound: 'M4A1',
};
