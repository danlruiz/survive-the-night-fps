// The pistol's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, rct } from './svg.js';

export default {
  id: ITEM.PISTOL,
  icon: [
    64,
    44,
    E('M4 7H58.6Q60 7 60 8.4V17H4Z' + rct(9, 9, 1, 6) + rct(11.6, 9, 1, 6) + rct(14.2, 9, 1, 6)) + // slide
      P(rct(55, 5, 3, 2)) +
      P(rct(5, 5, 5, 2)) +
      P('M8 17H52V21H27Z') + // frame
      P('M6 17H25.4L23.8 22L21.2 40Q21 41.4 19.6 41.4H7.6Q6 41.4 5.8 39.8L4.6 24Z') + // grip
      S('M25.4 21.2Q25.6 29 33 28.6Q35.6 28.2 36 21.2', 1.8) + // trigger guard
      S('M29.6 21.6Q30.2 24 29 26', 1.4),
  ],
};
