// The mainland field map's roads and the bridge's deck (mapmainland.js), by the picture's legend.

// each kind of road as [line width, colour] strokes, the casing first; the dirt roads and the trails a single dashed
// stroke (ROAD_DASH). The legend (marks.js) draws its samples from these.
export const ROAD_STYLE = {
  main: [[17, '#2a2420'], [11, '#8e8a82'], [2.2, '#d4cec2']],
  street: [[12, '#2e2824'], [7.6, '#9a958c']],
  secondary: [[11, '#4a2a14'], [6.6, '#b9733a']],
  lane: [[6.4, 'rgba(84, 52, 28, 0.8)'], [3.6, '#d2a06a']],
  dirt: [[5, 'rgba(122, 40, 22, 0.92)']],
  trail: [[3.4, 'rgba(24, 18, 14, 0.88)']],
};
export const ROAD_DASH = { dirt: [15, 9], trail: [9, 7] };

// roads, by the picture's legend: main roads a grey band in a dark casing with a light line down it; secondary
// roads orange-brown; dirt roads a red-brown dash; trails a black dash; the streets of the places as the main roads,
// narrower; the runway its own
export function drawRoads(g, world, S, mapX, mapY) {
  const path = (road) => {
    const p = road.pts;
    g.beginPath();
    g.moveTo(mapX(p[0]), mapY(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(mapX(p[i]), mapY(p[i + 1]));
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const styleOf = (road) => (road.width > 6 ? 'runway' : road.kind === 3 ? 'trail' : road.kind === 1 ? 'dirt' : road.width >= 3.5 ? 'main' : road.width >= 3.3 ? 'street' : road.width >= 2.7 ? 'secondary' : 'lane');
  for (const road of world.roads) {
    if (styleOf(road) !== 'runway') continue;
    path(road);
    g.strokeStyle = '#2a2420';
    g.lineCap = 'butt';
    g.lineWidth = road.width * 2 * S + 4;
    g.stroke();
    g.strokeStyle = '#6f6c66';
    g.lineWidth = road.width * 2 * S;
    g.stroke();
    g.setLineDash([12, 9]);
    g.strokeStyle = '#e4ddcf';
    g.lineWidth = 1.6;
    g.stroke();
    g.setLineDash([]);
    g.lineCap = 'round';
  }
  for (const pass of [0, 1, 2]) {
    for (const road of world.roads) {
      const st = styleOf(road);
      if (st === 'runway') continue;
      if (st === 'dirt' || st === 'trail') {
        if (pass !== 1) continue;
        path(road);
        const [[width, colour]] = ROAD_STYLE[st];
        g.setLineDash(ROAD_DASH[st]);
        g.strokeStyle = colour;
        g.lineWidth = width;
        g.stroke();
        g.setLineDash([]);
        continue;
      }
      const layer = ROAD_STYLE[st][pass];
      if (!layer) continue;
      path(road);
      g.strokeStyle = layer[1];
      g.lineWidth = layer[0];
      g.stroke();
    }
  }

  // (Town Center's ring is its grid's edge streets, square at the corners where the avenues come to it: drawn above as
  // the streets they are, not as a main road of its own with rounded corners the avenues ran out past)

  // ---- the bridge to the island: its deck out over the sea to the edge of the map, and the picture's arrow
  if (world.bridge) {
    const br = world.bridge;
    const y = mapY(br.z);
    g.fillStyle = '#2a2420';
    g.fillRect(0, y - 7 * S, mapX(br.x1), 14 * S);
    g.fillStyle = '#7d7972';
    g.fillRect(0, y - 4.4 * S, mapX(br.x1), 8.8 * S);
    g.strokeStyle = '#2a2420';
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = mapX(br.x1); x > 0; x -= 16 * S) {
      g.moveTo(x, y - 6.6 * S);
      g.lineTo(x, y + 6.6 * S);
    }
    g.stroke();
  }
}
