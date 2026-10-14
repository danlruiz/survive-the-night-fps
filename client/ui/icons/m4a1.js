// The M4A1's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, rct } from './svg.js';

export default {
  id: ITEM.M4A1,
  icon: [
    128,
    44,
    P('M2 13H22L26 15V29L22 30L6 33L2 32Z') + // collapsible stock
      P('M22 15.4H34V20H22Z') + // buffer tube
      P('M33 11H70V22H33Z') + // upper receiver
      P('M35 8.4H69V11H35Z') + // rail
      P('M36 4.6H41V8.4H36Z') + // rear sight
      P('M36 22H62V26H36Z') + // lower receiver
      P('M38 22H46L43.4 35Q43 36.4 41.6 36.4H37Q35.6 36.4 36 35Z') + // grip
      S('M46.4 25.8Q50.8 26 50.8 29.4', 1.6) + // trigger guard
      P('M52 26H61Q61.4 32 63.4 38.4L55.6 40.4Q53 33 52 26Z') + // magazine
      E(rct(70, 12, 25, 9.4) + [73.4, 77.6, 81.8, 86, 90.2].map((x) => rct(x, 14.4, 1.2, 4.6)).join('')) + // ribbed handguard
      P('M94.6 17H101.4L99.6 6.8H96.4Z') + // front sight base
      P(rct(97.4, 3.4, 1.2, 3.6)) +
      P('M100 14.4H117V17.6H100Z') + // barrel
      P('M116 12.8H124.6V19.2H116Z'), // flash hider
  ],
};
