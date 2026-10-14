// The spiked bat's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { E, S } from './svg.js';

export default {
  id: ITEM.SPIKED_BAT,
  icon: [
    116,
    30,
    '<g transform="translate(0 3)">' +
      E(
        'M2 9Q2 6.5 4.5 6.5H8.5V9.3L38 10.2Q62 9 82 6Q98 3.8 105 5.4Q109.5 6.6 109.5 12Q109.5 17.4 105 18.6Q98 20.2 82 18Q62 15 38 13.8L8.5 14.7V17.5H4.5Q2 17.5 2 15Z' +
          'M70 7.4L71.2 7.2L67.8 16.8L66.6 16.6Z' +
          'M86 5.2L87.2 5L84 18.4L82.8 18.2Z' +
          'M96 4.4L97.2 4.3L94.4 19.4L93.2 19.2Z',
      ) +
      S('M62 9.3L60 3.3M72 7.8L71 1.2M82 6L82.4-0.4M92 5L93.8-1.2M101.2 4.9L104.2-0.6M66 14.8L64 20.8M76 16.6L76.2 23M86 18.4L87.2 24.4M96 19.2L98.6 24.6M109.4 12L114 11.2', 1.3) +
      '</g>',
  ],
};
