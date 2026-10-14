// The RPG's icon (side profile, muzzle to the right): [viewBox width, height, inner markup]
// RPG, loaded: flared venturi, tube with a two-piece heat shield, the sight standing above it, pistol grip and a
// front grip under the front third, the grenade's bulb and nose out past the muzzle
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, rct } from './svg.js';

export default {
  id: ITEM.RPG,
  icon: [
    160,
    38,
    P('M2 8.6Q8 9.6 18 12V20Q8 22.4 2 23.4Z') + // venturi
      P('M17 12H115V20H17Z') + // tube
      P('M29.4 10.6H44.6Q45.4 10.6 45.4 11.4V20.6Q45.4 21.4 44.6 21.4H29.4Q28.6 21.4 28.6 20.6V11.4Q28.6 10.6 29.4 10.6Z') + // heat shield
      P('M47.4 10.6H62.6Q63.4 10.6 63.4 11.4V20.6Q63.4 21.4 62.6 21.4H47.4Q46.6 21.4 46.6 20.6V11.4Q46.6 10.6 47.4 10.6Z') +
      P('M61.4 4.4H76.6V12H61.4Z') + // sight
      P('M76.4 5.2H79.6V11.2H76.4Z') +
      P(rct(62.6, 1.4, 1.6, 3.2)) +
      P(rct(73.4, 2, 1.2, 2.6)) +
      P('M65.8 20H81V23.4H65.8Z') + // trigger housing
      P('M66 22.6H74.6L72 34Q71.6 35.4 70.2 35.4H65.6Q64.2 35.4 64.6 34Z') + // pistol grip
      S('M74.6 23.2Q79.2 23.6 78.6 28.6Q78 30 74.8 29.9', 1.6) + // trigger guard
      P('M86.4 11.4H94V20.6H86.4Z') + // clamp band
      P('M87.4 20H93L94 32.4Q94 33.6 92.8 33.6H88.4Q87.2 33.6 87.2 32.4Z') + // front grip
      P('M112 11.4H115.4V20.6H112Z') + // muzzle ring
      P('M115 13.6H119.8V18.4H115Z') + // motor
      E('M119.4 13.6L125.6 9.2H134.6Q146 10.6 154.6 14.8L158.4 15.4V16.6L154.6 17.2Q146 21.4 134.6 22.8H125.6L119.4 18.4Z' + rct(129.4, 9.2, 1.2, 13.6)), // grenade
  ],
};
