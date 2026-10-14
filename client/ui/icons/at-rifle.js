// The anti-tank rifle's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
// anti-tank rifle: padded shoulder piece, tube stock, open-topped receiver, a long barrel with a carry handle and the
// bipod folded under it, a two-port brake
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, circ, rct } from './svg.js';

export default {
  id: ITEM.AT_RIFLE,
  icon: [
    152,
    40,
    P('M4 9H7Q9.4 9 9.4 11.4V30.6Q9.4 33 7 33H4Q2 33 2 30.6V11.4Q2 9 4 9Z') + // shoulder pad
      P('M9 19H46V24H9Z') + // stock tube
      P('M14 19.4L16.4 14.6H33.6L36 19.4Z') + // cheek rest
      P('M24 23.4H28.6V30Q28.6 31.6 27 31.6H25.6Q24 31.6 24 30Z') + // rear grip
      P('M42 20.4H60V24H42Z') + // trigger housing
      P('M43.6 23H51L48.6 35Q48.2 36.4 46.8 36.4H42.6Q41.2 36.4 41.6 35Z') + // pistol grip
      S('M51.4 24.6Q55.8 25 55.6 28.6', 1.6) + // trigger guard
      P('M34 13.6H38.4V19.6H34Z') + // bolt
      S('M39.6 18.6L43 25.4', 1.8) + // bolt handle
      P(circ(43.6, 26.6, 2)) +
      E('M38 12H72V21H38Z' + rct(49, 13.2, 16, 2.6)) + // receiver, the port
      E(circ(58, 5.4, 2.4) + circ(58, 5.4, 1.1)) + // rear aperture
      P(rct(57.2, 7.6, 1.6, 4.6)) +
      P('M72 13H82V20H72Z') + // chamber
      P('M82 12.4H99Q100.6 12.4 100.6 14V19Q100.6 20.6 99 20.6H82Z') + // handguard
      P('M100 13.8L136 14.6V18.6L100 19.2Z') + // barrel
      S('M106.4 14.6Q107.4 8.6 111.4 8.6H116Q120 8.6 121 14.6', 1.6) + // carry handle
      P(rct(126, 18, 3.4, 4.4)) + // bipod hinge and folded legs
      S('M112 21.6H126.4', 1.6) +
      P(rct(110, 20, 3, 3.6)) +
      P(rct(131, 8.4, 1.6, 6.8)) + // front sight
      S('M128.8 10.2Q131.8 5.6 134.8 10.2', 1.1) +
      E(rct(136, 11.6, 13, 9.8) + rct(138.2, 13.4, 3.6, 6.2) + rct(143.4, 13.4, 3.6, 6.2)), // muzzle brake
  ],
};
