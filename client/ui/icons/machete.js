// The machete's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, circ } from './svg.js';

export default {
  id: ITEM.MACHETE,
  icon: [
    112,
    28,
    E('M2 12Q2 9.5 4.5 9.5H30V19.5H4.5Q2 19.5 2 17Z' + circ(8, 14.5, 1.6) + circ(16.5, 14.5, 1.1) + circ(24, 14.5, 1.1)) +
      P('M30 7.5H33.6V21.5H30Z') +
      P('M33.6 9.5L98 8Q105 7.4 110 5Q109.5 14 101 19Q88 23.6 64 22L33.6 19.5Z'),
  ],
};
