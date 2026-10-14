// The knife's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, circ, rct } from './svg.js';

export default {
  id: ITEM.KNIFE,
  icon: [
    100,
    28,
    E('M2 11Q2 8.5 5 8.5H33V19.5H5Q2 19.5 2 17Z' + circ(10, 14, 1.5) + circ(24, 14, 1.5)) + // handle
      P('M33 4.5H37.6V23.5H33Z') + // guard
      E('M37.6 8.5H78L98 14Q86 20.6 60 20H37.6Z' + rct(40, 11.2, 30, 1.2)), // blade + fuller
  ],
};
