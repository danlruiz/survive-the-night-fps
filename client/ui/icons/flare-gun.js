// The flare gun's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
// break-open signal pistol: fat barrel with a lip at the muzzle, the hammer spur behind the breech, a round grip
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, circ, rct } from './svg.js';

export default {
  id: ITEM.FLARE_GUN,
  icon: [
    64,
    44,
    E('M17 7.6H57Q58.6 7.6 58.6 9.2V9.4H60.6Q62 9.4 62 10.8V20.6Q62 22 60.6 22H58.6V22.2Q58.6 23.8 57 23.8H17Z' + rct(28, 13.6, 25, 1.3)) + // barrel
      P('M7.6 10Q7.6 7 10.6 6.8L17.6 6.4V25H7.6Z') + // standing breech
      P('M3.4 4.2L6.8 2.4L12.2 7.4L10 9.8Z') + // hammer spur
      E('M17 23.4H40.4Q43.4 23.4 43.4 25.8Q43.4 28 40.4 28H17Z' + circ(40.2, 25.7, 1.1)) + // lug and hinge pin
      P('M7.6 24.6H25L23.4 29.4L21.4 39.4Q21 41.6 18.8 41.6H6.6Q4.2 41.6 4.4 39.2L5.4 28Z') + // grip
      S('M25.2 27Q25.2 34.6 31.4 34.2Q35.2 33.8 35.6 27.6', 1.8) + // trigger guard
      S('M28.8 27.8Q29.6 30.2 28.4 32.2', 1.4), // trigger
  ],
};
