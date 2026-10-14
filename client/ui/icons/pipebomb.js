// The pipe bomb's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, S, rct, raysPath } from './svg.js';

export default {
  id: ITEM.PIPEBOMB,
  icon: [
    46,
    32,
    P(rct(8, 10, 7.4, 12)) +
      P(rct(16.2, 9, 4.6, 14)) +
      P(rct(21.6, 10, 8.4, 12)) +
      P(rct(3, 8, 4.2, 16)) +
      P(rct(30.8, 8, 4.2, 16)) +
      S('M35 16Q40.6 14 39.4 8.4Q38.8 5.4 41.6 3.4', 1.3) +
      S(raysPath(41.8, 3.2, 0.6, 2.8, 6, 0.3), 1),
  ],
};
