import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'AK47',
  id: 61,
  def: { name: 'AK-47', cat: 'weapon', stack: 1, color: 0x5a4632, desc: 'Full-auto 7.62 rifle.' },
  // the AK-47: the hardest hitting automatic and the least accurate - a wider cone than the M4A1 in every stance and
  // half again its climb, tight for a first aimed round or a short burst (scripts/test-spread.js holds its groups)
  stats: { slot: 0, damage: 36, rate: 0.1, mag: 30, reload: 2.3, ammo: 2, pellets: 1, spread: 0.016, moveSpread: 0.034, recoil: 0.022, range: 150, headMul: 2.6, auto: true, sound: 'ak47' },
  // one of the dearest guns short of the anti-tank rifle, behind the Rifle Schematic like it
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 3, [ITEM.SCRAP]: 3, [ITEM.WOOD]: 2, [ITEM.TAPE]: 1 }, station: 'bench', schem: ITEM.SCHEM_RIFLE },
  salvage: { [ITEM.GUNPARTS]: 2, [ITEM.SCRAP]: 2, [ITEM.WOOD]: 1 },
  feat: 'kill_rifle',
  hole: 1.05,
  shotSound: 'AK47',
};
