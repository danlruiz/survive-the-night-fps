// The noisemaker's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, circ, rct } from './svg.js';

export default {
  id: ITEM.DECOY,
  icon: [
    40,
    40,
    // a twin-bell alarm clock, ringing: bells on their posts, the hammer, the dial (rim, marks, hands), splayed feet,
    // and the ring in the air either side
    '<g transform="translate(11.4 13.6) rotate(-40)">' + P('M-5.8 0.4Q-5.8 -7.6 0 -7.6Q5.8 -7.6 5.8 0.4Z') + P(rct(-1.1, 0, 2.2, 2.6)) + '</g>' +
      '<g transform="translate(28.6 13.6) rotate(40)">' + P('M-5.8 0.4Q-5.8 -7.6 0 -7.6Q5.8 -7.6 5.8 0.4Z') + P(rct(-1.1, 0, 2.2, 2.6)) + '</g>' +
      P(rct(19.3, 6.4, 1.4, 5.2)) +
      P(circ(20, 6, 2.1)) +
      E(circ(20, 23.4, 12) + circ(20, 23.4, 9.2)) +
      P(rct(19.35, 15.6, 1.3, 2.4) + rct(19.35, 28.8, 1.3, 2.4) + rct(12.2, 22.75, 2.4, 1.3) + rct(25.4, 22.75, 2.4, 1.3)) +
      S('M20 23.4L16.4 20.6M20 23.4L22.8 18.2', 1.7) +
      P(circ(20, 23.4, 1.3)) +
      S('M12.6 32.6L9.4 37.6M27.4 32.6L30.6 37.6', 2.3) +
      S('M3.6 17.2Q1.6 23.4 3.6 29.6M36.4 17.2Q38.4 23.4 36.4 29.6', 1.3),
  ],
};
