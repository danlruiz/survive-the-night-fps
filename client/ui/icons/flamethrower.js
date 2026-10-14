// The flamethrower's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
// pipe lance with a finned shield and a flared nozzle, gas bottle for a stock, fuel flask hung underneath
import { ITEM } from '../../../shared/defs.js';
import { P, S, rct } from './svg.js';

export default {
  id: ITEM.FLAMETHROWER,
  icon: [
    128,
    44,
    P('M6 11.4H28Q34 11.4 34 15.4V19.4Q34 23.4 28 23.4H6Q2 23.4 2 19.4V15.4Q2 11.4 6 11.4Z') + // gas bottle
      P('M33 9.6H67V23H33Z') + // receiver
      P('M39 22.6H47.6L44.6 35.6Q44.2 36.8 43 36.8H37.6Q36.4 36.8 36.8 35.6Z') + // grip
      S('M47.6 23.4Q52 23.8 51.4 28.6Q50.8 30 47.8 29.9', 1.6) + // trigger guard
      P('M58 22.6H63V26.4H58Z') + // flask neck
      P('M56.4 26H64.6Q66.6 26 66.6 28V40Q66.6 42 64.6 42H56.4Q54.4 42 54.4 40V28Q54.4 26 56.4 26Z') + // fuel flask
      P('M67 13.6H113V18.6H67Z') + // lance
      P('M71 11.6H90V20.6H71Z') + // wooden sleeve
      [95, 99.2, 103.4, 107.6].map((x) => P(rct(x, 11, 2.2, 10.2))).join('') + // heat shield fins
      P('M112 13.2L123 10V22.2L112 19Z') + // nozzle
      S('M67 22.2H108L120 24', 1.2), // pilot line
  ],
};
