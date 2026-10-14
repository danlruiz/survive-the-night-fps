// The Desert Eagle's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
// Desert Eagle: a tall slide with its grip serrations, a long fixed barrel past it with the rib along the top, a
// squared trigger guard over the pistol's grip
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, rct } from './svg.js';

export default {
  id: ITEM.DEAGLE,
  icon: [
    72,
    44,
    E('M4 6H34V18H4Z' + rct(8, 8.6, 1.1, 7) + rct(10.8, 8.6, 1.1, 7) + rct(13.6, 8.6, 1.1, 7) + rct(16.4, 8.6, 1.1, 7)) + // slide
      P('M34.6 7.4H67.2Q68.4 7.4 68.4 8.6V18H34.6Z') + // barrel
      P(rct(35, 5.4, 33, 1.6)) + // top rib
      P(rct(64.4, 3.6, 2.4, 2)) + // front sight
      P(rct(5, 4, 4.6, 2)) + // rear sight
      P('M8 18H62V22H28Z') + // frame and dust cover
      P('M6 18H25.4L23.8 23L21.2 40.6Q21 42 19.6 42H7.6Q6 42 5.8 40.4L4.6 25Z') + // grip
      S('M25.4 22.2V27.6Q25.4 29.8 27.6 29.8H35.2Q37 29.8 37 28V22.2', 1.8) + // squared trigger guard
      S('M29.6 22.6Q30.2 25 29 27', 1.4),
  ],
};
