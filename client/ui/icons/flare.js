// The road flare's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, circ, rct, flameTop } from './svg.js';

export default {
  id: ITEM.FLARE,
  icon: [
    32,
    44,
    E('M12.6 13H19.4V34H12.6Z' + rct(12.6, 20.6, 6.8, 1.1) + rct(12.6, 25.6, 6.8, 1.1)) +
      P('M13.2 13L14.2 10.4H17.8L18.8 13Z') +
      P('M11.8 34.6H20.2V40.6Q20.2 41.6 19.2 41.6H12.8Q11.8 41.6 11.8 40.6Z') +
      S('M14 41.6L11.6 43.6M18 41.6L20.4 43.6', 1.2) +
      flameTop(16, -0.4, 0.85) +
      P(circ(8.6, 6.4, 0.9)) +
      P(circ(24.2, 4.2, 0.8)) +
      P(circ(23.4, 10.2, 0.7)),
  ],
};
