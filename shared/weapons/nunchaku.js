import { BASE_ITEM as ITEM } from '../items.js';

export default {
  key: 'NUNCHAKU',
  id: 57, // melee with a moveset of its own: combos, a wound-up heavy, a simulated chain (shared/nunchaku.js)
  def: { name: 'Nunchucks', cat: 'weapon', stack: 1, color: 0x7a4a2a, desc: 'Two hardwood handles on a chain. Keep swinging for a four-move combo whose last blow lands hardest; hold the heavy attack to spin it up. Short reach, one target, and every move costs stamina.' },
  // Nunchucks: a moveset, not one swing (nunchaku: true; the moves, their timing and what each costs are NK_MOVES in
  // shared/nunchaku.js). The numbers here are the opener's and the fully wound heavy's, for whatever reads a weapon's
  // row. Against the others, on one target with the whole chain landed: 198 damage in 1.68 s, 118 a second - over the
  // knife (90) and the bat (83), under the machete (136) and the spiked bat (132), which also strike two at once and
  // cost nothing. The shortest reach there is, one target, and 27 stamina a combo: three and a half combos empty a
  // full bar, and out of breath it is the opener alone at 0.7 of its damage (61 a second). The heavy: 70 on a tap,
  // 165 after a full 0.95 s wind-up (87 a second either way, under the light chain as the rule over WEAPONS in shared/defs.js asks).
  stats: { slot: 2, melee: true, nunchaku: true, damage: 28, rate: 0.32, range: 1.9, altDamage: 165, altRate: 0.8, headMul: 1.7, knock: 0.6, swing: 0.1 },
  // two turned handles, a chain cut out of scrap, tape for the grips
  recipe: { n: 1, cost: { [ITEM.WOOD]: 2, [ITEM.SCRAP]: 2, [ITEM.TAPE]: 1 }, station: 'bench' },
  salvage: { [ITEM.WOOD]: 1, [ITEM.SCRAP]: 1 },
  feat: null,
  blow: 'BLUNT',
  pry: 1.6,
};
