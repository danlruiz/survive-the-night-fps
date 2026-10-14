// The bat's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { E, rct } from './svg.js';

export default {
  id: ITEM.BAT,
  icon: [
    112,
    24,
    E(
      'M2 9Q2 6.5 4.5 6.5H8.5V9.3L38 10.2Q62 9 82 6Q98 3.8 105 5.4Q109.5 6.6 109.5 12Q109.5 17.4 105 18.6Q98 20.2 82 18Q62 15 38 13.8L8.5 14.7V17.5H4.5Q2 17.5 2 15Z' +
        rct(13, 9.2, 0.9, 5.6) +
        rct(17, 9.3, 0.9, 5.4) +
        rct(21, 9.4, 0.9, 5.2) +
        rct(25, 9.5, 0.9, 5),
    ),
  ],
};
