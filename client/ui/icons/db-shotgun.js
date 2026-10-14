// The double-barrel shotgun's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, S, circ } from './svg.js';

export default {
  id: ITEM.DB_SHOTGUN,
  icon: [
    132,
    36,
    P('M2 17.6L34 13V23.6L29 24.2L7 31.6L2 30.6Z') + // stock
      P('M33 11H47V24H33Z') + // action
      P('M40 8.2H46V11H40Z') + // top lever
      P('M47 9.2H128V13.4H47Z') + // barrels
      P('M47 14.2H128V18.4H47Z') +
      P(circ(128.8, 8.4, 1.2)) + // bead
      P('M50 18.4H84Q84 21.8 81 23.2H53Q50 21.8 50 18.4Z') + // forend
      S('M36.6 24.2Q37.2 29.8 42.6 29.4L43.8 24.2', 1.5) + // trigger guard
      S('M39 24.6Q39.6 26.2 38.6 27.6', 1.2) +
      S('M41.4 24.6Q42 26.2 41 27.6', 1.2), // twin triggers
  ],
};
