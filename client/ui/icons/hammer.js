// The hammer's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, rct } from './svg.js';

export default {
  id: ITEM.HAMMER,
  icon: [
    92,
    40,
    E('M2 18Q2 15.4 4.6 15.4H77V22.6H4.6Q2 22.6 2 20Z' + rct(10, 15.4, 0.9, 7.2) + rct(14, 15.4, 0.9, 7.2) + rct(18, 15.4, 0.9, 7.2) + rct(22, 15.4, 0.9, 7.2)) +
      P('M70.5 1.6H88.5Q90 1.6 90 3.1V10.4Q90 11.9 88.5 11.9H83V24Q83 32.6 75.6 38.4L72.2 35.4Q77 31 77 24V11.9H72Q70.5 11.9 70.5 10.4Z'),
  ],
};
