// The frag grenade's icon: [viewBox width, height, inner markup]
import { ITEM } from '../../../shared/defs.js';
import { P, E, S, circ, ell, rct } from './svg.js';

// The frag grenade: a pineapple egg cut by its grooves (rows across, three columns down between them), the fuze on
// top, the spoon down its right side and the pull ring on the left.
function fragIcon() {
  const cx = 15.5, cy = 29.4, rx = 10, ry = 12.4, m = 1.1, g = 1.2;
  const halfW = (y) => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  const halfH = (x) => ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  const rows = [21.4, 26.4, 31.4, 36.4];
  let cut = '';
  for (const y of rows) {
    const w = Math.min(halfW(y), halfW(y + g)) - m;
    cut += rct(cx - w, y, 2 * w, g);
  }
  for (const x of [cx - 5.4, cx, cx + 5.4]) {
    const edge = Math.abs(x - cx) + g / 2;
    const bounds = [cy - halfH(cx + edge) + m, ...rows.flatMap((y) => [y, y + g]), cy + halfH(cx + edge) - m];
    for (let i = 0; i < bounds.length; i += 2) if (bounds[i + 1] - bounds[i] > 0.4) cut += rct(x - g / 2, bounds[i], g, bounds[i + 1] - bounds[i]);
  }
  return (
    E(ell(cx, cy, rx, ry) + cut) +
    P(rct(12.7, 13, 5.6, 4.4)) +
    P(rct(11.9, 15.8, 7.2, 1.9)) +
    P('M12 8.6Q12 7.4 13.2 7.4H17.8Q19 7.4 19 8.6V13.4H12Z') +
    P('M13.6 7.4Q15.5 4.6 17.4 7.4Z') +
    P('M18.4 6.6H21Q22.6 6.6 22.8 8.4L23.4 13Q27.6 15.4 28.4 22.4L28.8 31.2H26.8L26.4 22.6Q25.8 17.4 21.8 15L21 9.4Q20.9 8.6 20.2 8.6H18.4Z') +
    S(circ(6.4, 11.4, 3.7), 1.5) +
    S('M10.1 10.8H12', 1.3)
  );
}

export default {
  id: ITEM.GRENADE,
  icon: [32, 44, fragIcon()],
};
