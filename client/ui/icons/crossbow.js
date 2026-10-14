// The crossbow's icon: [viewBox width, height, inner markup]
// seen from above, latched: tiller, swept-back limbs, string drawn to the latch, bolt on the rail
import { ITEM } from '../../../shared/defs.js';
import { P, S } from './svg.js';

export default {
  id: ITEM.CROSSBOW,
  icon: [
    112,
    56,
    P('M2 23.4H30L36 25H88V31H36L30 32.6H2Z') + // stock + tiller
      P('M81 23H89V33H81Z') + // prod bracket
      S('M85 24Q84 10 68 4', 3.2) + // limbs
      S('M85 32Q84 46 68 52', 3.2) +
      S('M68 4L45 28L68 52', 1.1) + // string
      P('M41 24.4H49V31.6H41Z') + // latch
      P('M49 27.1H98V28.9H49Z') + // bolt
      P('M96.5 24.6L106 28L96.5 31.4Z') +
      P('M51 24.9H61L58 27.1H51Z') + // vanes
      P('M51 31.1H61L58 28.9H51Z') +
      S('M89 25Q101 28 89 31', 1.4), // stirrup
  ],
};
