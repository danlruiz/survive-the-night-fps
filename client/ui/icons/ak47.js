// The AK-47's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, S } from './svg.js';

export default {
  id: ITEM.AK47,
  icon: [
    128,
    44,
    P('M2 17L31 12.5H33V22L28 22.6L7 30.6L2 29.6Z') + // stock
      P('M31 11H73V21.5H31Z') + // receiver
      P('M63 7.6H68V11H63Z') + // rear sight
      P('M39 21H47.6L44.6 34Q44.2 35.2 43 35.2H37.6Q36.4 35.2 36.8 34Z') + // grip
      S('M47.6 21.6Q52.2 22 51.6 27Q51 28.4 47.8 28.3', 1.6) + // trigger guard
      P('M53.5 21H62Q62.6 30 70.2 37.4L63 41.6Q54 33 53.5 21Z') + // banana mag
      P('M73 12.6H94V20.6H73Z') + // handguard
      P('M73 8H96V11.6H73Z') + // gas tube
      P('M96 8H101.5V16.5H96Z') + // gas block
      P('M94 13.6H117V16.6H94Z') + // barrel
      P('M107 13.6V7.4H110.4L111.6 13.6Z') + // front sight
      P('M116 12.4H125V17.8H116Z'), // muzzle
  ],
};
