// The pump shotgun's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, S, circ, rct } from './svg.js';

export default {
  id: ITEM.SHOTGUN,
  icon: [
    128,
    40,
    P('M2 18.6L34 14V24.6L29 25.2L7 32.6L2 31.6Z') + // stock
      P('M33 13H62V24.6H33Z') + // receiver
      S('M40.5 24.8Q41.2 30.6 47 30.2L48.2 24.8', 1.6) + // trigger guard
      P('M62 13H124.5V17.6H62Z') + // barrel
      P('M62 19H111V22.6H62Z') + // mag tube
      [66, 70.4, 74.8, 79.2, 83.6].map((x) => P(rct(x, 18.2, 3.6, 7.6))).join('') + // pump
      P(circ(123, 12, 1.3)),
  ],
};
