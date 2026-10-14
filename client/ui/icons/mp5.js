// The MP5's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, circ, rct } from './svg.js';

export default {
  id: ITEM.MP5,
  icon: [
    112,
    44,
    P('M2 11H37V19.4L8 31.6H2Z') + // fixed stock
      P('M36 10H74V21.4H36Z') + // receiver
      P(circ(41, 7.6, 2.6)) + // drum rear sight
      P('M74 10H92V14.6H74Z') + // cocking tube
      E(circ(90, 6.2, 3) + circ(90, 6.2, 1.5)) + // hooded front sight
      P(rct(88.4, 8, 3.2, 2.4)) +
      S('M84 11.6L80.4 7.4', 1.6) + // cocking handle
      P('M74 14.6H92Q93 20 90 23H76Q74 20 74 14.6Z') + // handguard
      P('M92 15.8H104V19H92Z') + // barrel
      P('M42 21.4H60V24.6H42Z') + // trigger group
      P('M44 23H52L49.6 35Q49.2 36.4 47.8 36.4H43.4Q42 36.4 42.4 35Z') + // grip
      S('M52.4 24.8Q56.8 25 56.6 28.6', 1.6) + // trigger guard
      P('M62 21.4H68.4Q69.4 30 74.4 37.6L68 40.8Q62.8 31 62 21.4Z'), // curved magazine
  ],
};
