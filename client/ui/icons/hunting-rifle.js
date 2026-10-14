// The hunting rifle's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, S, circ, rct } from './svg.js';

export default {
  id: ITEM.HUNTING_RIFLE,
  icon: [
    132,
    40,
    P('M2 21Q3 18.4 8 18.4H45V25Q40.5 25.4 36.5 27.4Q31.5 30 29.5 33.4H8Q3 33.4 2 30Z') + // stock
      P('M44 18.4H99V22.8Q71 23.4 59 25H44Z') + // forend
      P('M97 19H130V21.6H97Z') + // barrel
      P('M49 9.4H57.5L60.5 11.4H83.5L86.5 9.4H96V15.6H86.5L83.5 13.6H60.5L57.5 15.6H49Z') + // scope
      P(rct(63.5, 13.4, 3, 5.2)) +
      P(rct(78.5, 13.4, 3, 5.2)) +
      S('M55.5 20L59.4 26', 1.8) +
      P(circ(60, 27.2, 2.2)) + // bolt
      S('M46 25.2Q46.6 30.4 52.2 29.8L53.2 25', 1.5),
  ],
};
