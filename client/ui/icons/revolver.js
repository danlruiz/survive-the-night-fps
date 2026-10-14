// The revolver's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
// swing-out cylinder revolver: the cylinder (its flutes cut in) in a frame behind a ribbed barrel, the ejector rod
// under it, the hammer spur behind, a round-butted grip
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, rct } from './svg.js';

export default {
  id: ITEM.REVOLVER,
  icon: [
    64,
    44,
    E('M6.6 9Q6.6 6 9.6 6H32V23H6.6Z' + rct(14, 9.4, 15, 1.4) + rct(14, 14, 15, 1.4) + rct(14, 18.6, 15, 1.4)) + // frame and cylinder
      E('M32 7.6H60.6Q62 7.6 62 9V14H32Z' + rct(35, 9.6, 23, 1)) + // barrel and rib
      P(rct(58.4, 5, 2.4, 2.8)) + // front sight
      P(rct(32, 15.4, 15, 2.2) + rct(45.6, 14.6, 2.8, 3.8)) + // ejector rod
      P('M3 4.2L6.8 2.4L12 7.2L9.6 9.4Z') + // hammer spur
      P('M6.6 22.6H24.6L23 27.6L21 39.6Q20.6 41.6 18.6 41.6H7.4Q5.4 41.6 5.4 39.4L5.8 28Z') + // grip
      S('M24.8 23.4Q25 31 32 30.6Q35 30.2 35.4 23.4', 1.8) + // trigger guard
      S('M28.8 23.8Q29.6 26.2 28.4 28.2', 1.4), // trigger
  ],
};
