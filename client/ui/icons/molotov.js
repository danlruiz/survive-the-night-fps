// The molotov's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, rct, flameTop } from './svg.js';

export default {
  id: ITEM.MOLOTOV,
  icon: [
    32,
    44,
    E('M11 25Q11 21.5 13.5 20V14H18.5V20Q21 21.5 21 25V41.5Q21 43.5 19 43.5H13Q11 43.5 11 41.5Z' + rct(12.6, 29, 6.8, 6)) +
      P('M13.8 14L13.4 9.6Q15 11 16 9.2Q17.4 11 18.6 9.6L18.2 14Z') +
      P('M13.6 12.6Q8.6 14.6 7.6 20.4Q10.2 16.6 13.6 16Z') +
      flameTop(16, -0.4, 0.95),
  ],
};
