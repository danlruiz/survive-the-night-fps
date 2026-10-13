import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'AT_RIFLE',
  id: 69,
  def: { name: 'Anti-Tank Rifle', cat: 'weapon', stack: 1, color: 0x4f5232, desc: 'Single-shot 14.5mm. Goes through a whole line of them, and hits bosses and Tanks three times as hard. A very slow reload.' },
  // the anti-tank rifle: one round, a long reload, made for the big ones. It goes through five, and a boss or a Tank
  // takes bossMul x of it. The loudest gun there is
  stats: { slot: 0, damage: 400, rate: 1.0, mag: 1, reload: 6.0, autoReload: true, ammo: 8, pellets: 1, spread: 0.015, moveSpread: 0.09, recoil: 0.2, range: 260, headMul: 3.0, auto: false, noise: 150, pierce: 5, bossMul: 3, sound: 'atrifle' },
  recipe: { n: 1, cost: { [ITEM.GUNPARTS]: 4, [ITEM.SCRAP]: 6, [ITEM.TAPE]: 2 }, station: 'bench', schem: ITEM.SCHEM_RIFLE },
  salvage: { [ITEM.GUNPARTS]: 2, [ITEM.SCRAP]: 3 },
  feat: 'kill_atrifle',
  hole: 3.2,
  shotSound: 'AT_RIFLE',
  kick: [2.2, 0.7],
};
