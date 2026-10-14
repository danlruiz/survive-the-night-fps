// The walkie-talkie's icon: [viewBox width, height, inner markup]
// handset: stub antenna and channel knob on top, speaker grille, display, talk key on the side
import { ITEM } from '../../../shared/defs.js';
import { P, E, circ, rct } from './svg.js';

export default {
  id: ITEM.WALKIE,
  icon: [
    32,
    40,
    P(rct(9.4, 1.6, 2.6, 10.6)) +
      P(rct(18.4, 8.2, 3.6, 4)) +
      P(rct(4.8, 17, 1.6, 8)) +
      E(
        'M9 12H23Q25 12 25 14V36.4Q25 38.4 23 38.4H9Q7 38.4 7 36.4V14Q7 12 9 12Z' +
          rct(10, 15.2, 12, 1.5) +
          rct(10, 18.2, 12, 1.5) +
          rct(10, 21.2, 12, 1.5) +
          rct(10, 25.6, 12, 4.6) +
          circ(12.6, 34.2, 1.4) +
          circ(19.4, 34.2, 1.4),
      ),
  ],
};
