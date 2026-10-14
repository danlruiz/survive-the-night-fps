// The mainland field map's marks and its legend (mapmainland.js): the picture's badges and glyphs, the lighthouse and
// the radio tower, and the legend in the corner of the sea.
import { ROAD_STYLE, ROAD_DASH } from './roads.js';

// the picture's inks: its marks' colours, and the ink its words are written in
export const RUST = '#a5462a';
const NAVY = '#24548a';
const BLACK = '#1c1a18';
export const INK = '#2a2018';

// a badge of the picture's: a rounded square of colour with a light glyph on it (r: half its size, px)
function badge(g, x, y, r, fill, glyph) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(246, 236, 212, 0.9)';
  roundRect(g, -r - 3, -r - 3, r * 2 + 6, r * 2 + 6, r * 0.45);
  g.fill();
  g.fillStyle = fill;
  roundRect(g, -r, -r, r * 2, r * 2, r * 0.35);
  g.fill();
  g.fillStyle = '#f2e8d2';
  g.strokeStyle = '#f2e8d2';
  glyph(g, r);
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
// the glyphs, each drawn in a square of half size r about the origin
const GLYPH = {
  // a civic building: a pediment over columns
  town(g, r) {
    g.beginPath();
    g.moveTo(-r * 0.75, -r * 0.2);
    g.lineTo(0, -r * 0.72);
    g.lineTo(r * 0.75, -r * 0.2);
    g.closePath();
    g.fill();
    for (let k = -2; k <= 2; k++) g.fillRect(k * r * 0.3 - r * 0.07, -r * 0.12, r * 0.14, r * 0.62);
    g.fillRect(-r * 0.8, r * 0.55, r * 1.6, r * 0.18);
  },
  church(g, r) {
    g.fillRect(-r * 0.45, -r * 0.1, r * 0.9, r * 0.8);
    g.beginPath();
    g.moveTo(-r * 0.55, -r * 0.05);
    g.lineTo(0, -r * 0.5);
    g.lineTo(r * 0.55, -r * 0.05);
    g.closePath();
    g.fill();
    g.fillRect(-r * 0.06, -r * 0.85, r * 0.12, r * 0.4);
    g.fillRect(-r * 0.2, -r * 0.72, r * 0.4, r * 0.1);
  },
  // a factory: saw-tooth roof and a stack
  industrial(g, r) {
    g.beginPath();
    g.moveTo(-r * 0.8, r * 0.7);
    g.lineTo(-r * 0.8, -r * 0.05);
    for (let k = 0; k < 3; k++) {
      g.lineTo(-r * 0.8 + (k + 1) * r * 0.4, -r * 0.35);
      g.lineTo(-r * 0.8 + (k + 1) * r * 0.4, -r * 0.05);
    }
    g.lineTo(r * 0.4, -r * 0.05);
    g.lineTo(r * 0.4, -r * 0.8);
    g.lineTo(r * 0.65, -r * 0.8);
    g.lineTo(r * 0.65, r * 0.7);
    g.closePath();
    g.fill();
  },
  gas(g, r) {
    g.fillRect(-r * 0.5, -r * 0.65, r * 0.65, r * 1.35);
    g.fillStyle = RUST;
    g.fillRect(-r * 0.38, -r * 0.5, r * 0.41, r * 0.32);
    g.fillStyle = '#f2e8d2';
    g.lineWidth = r * 0.12;
    g.beginPath();
    g.moveTo(r * 0.15, -r * 0.2);
    g.lineTo(r * 0.5, -r * 0.2);
    g.lineTo(r * 0.5, r * 0.4);
    g.stroke();
  },
  airport(g, r) {
    g.beginPath();
    g.moveTo(0, -r * 0.85);
    g.lineTo(r * 0.12, -r * 0.2);
    g.lineTo(r * 0.85, r * 0.1);
    g.lineTo(r * 0.85, r * 0.25);
    g.lineTo(r * 0.12, r * 0.12);
    g.lineTo(r * 0.1, r * 0.55);
    g.lineTo(r * 0.35, r * 0.75);
    g.lineTo(-r * 0.35, r * 0.75);
    g.lineTo(-r * 0.1, r * 0.55);
    g.lineTo(-r * 0.12, r * 0.12);
    g.lineTo(-r * 0.85, r * 0.25);
    g.lineTo(-r * 0.85, r * 0.1);
    g.lineTo(-r * 0.12, -r * 0.2);
    g.closePath();
    g.fill();
  },
  // a tent (the picture's "pass" mark, which it sets at the camps)
  tent(g, r) {
    g.beginPath();
    g.moveTo(0, -r * 0.7);
    g.lineTo(r * 0.75, r * 0.6);
    g.lineTo(-r * 0.75, r * 0.6);
    g.closePath();
    g.fill();
    g.fillStyle = BLACK;
    g.beginPath();
    g.moveTo(0, -r * 0.05);
    g.lineTo(r * 0.25, r * 0.6);
    g.lineTo(-r * 0.25, r * 0.6);
    g.closePath();
    g.fill();
  },
  // a mouth in the rock: an arch (a tunnel, a mine, an adit)
  mine(g, r) {
    g.beginPath();
    g.moveTo(-r * 0.7, r * 0.7);
    g.lineTo(-r * 0.7, -r * 0.05);
    g.arc(0, -r * 0.05, r * 0.7, Math.PI, 0);
    g.lineTo(r * 0.7, r * 0.7);
    g.closePath();
    g.fill();
    g.fillStyle = BLACK;
    g.beginPath();
    g.moveTo(-r * 0.36, r * 0.7);
    g.lineTo(-r * 0.36, r * 0.05);
    g.arc(0, r * 0.05, r * 0.36, Math.PI, 0);
    g.lineTo(r * 0.36, r * 0.7);
    g.closePath();
    g.fill();
  },
  // crossed pick and hammer
  quarry(g, r) {
    g.lineWidth = r * 0.16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-r * 0.6, r * 0.6);
    g.lineTo(r * 0.5, -r * 0.5);
    g.moveTo(r * 0.6, r * 0.6);
    g.lineTo(-r * 0.5, -r * 0.5);
    g.stroke();
    g.beginPath();
    g.moveTo(-r * 0.75, -r * 0.25);
    g.quadraticCurveTo(-r * 0.4, -r * 0.8, r * 0.05, -r * 0.75);
    g.stroke();
    g.fillRect(r * 0.25, -r * 0.8, r * 0.5, r * 0.3);
  },
};

// the marks the world asks for (world.marks: { kind, x, z }): the lighthouse and the radio tower drawn as the picture
// draws them, the rest as badges
export function drawMarks(g, world, S, mapX, mapY) {
  const u = S / 2; // (the marks are sized for a map baked at 2 px a metre)
  for (const m of world.marks || []) {
    const x = mapX(m.x);
    const y = mapY(m.z);
    if (m.kind === 'pit') {
      // the quarry's pit: dark in its depth, its benches ringed
      const r = m.r * S;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(58, 52, 46, 0.62)');
      gr.addColorStop(0.75, 'rgba(84, 76, 66, 0.35)');
      gr.addColorStop(1, 'rgba(84, 76, 66, 0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(40, 34, 28, 0.7)';
      g.lineWidth = 2.4 * u;
      for (let k = 0; k < m.steps; k++) {
        g.beginPath();
        g.arc(x, y, m.r * S - ((k + 1) * (m.r - m.floor) * S) / m.steps, 0, Math.PI * 2);
        g.stroke();
      }
      continue;
    }
    if (m.kind === 'lighthouse' || m.kind === 'tower' || m.kind === 'watertower') {
      g.save();
      g.translate(x, y);
      g.scale(2.4 * u, 2.4 * u);
      g.lineJoin = 'round';
      if (m.kind === 'lighthouse') {
        g.fillStyle = 'rgba(246, 236, 212, 0.85)';
        g.beginPath();
        g.ellipse(0, 12, 10, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f0e6d0';
        g.strokeStyle = INK;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-5, 12);
        g.lineTo(-3, -12);
        g.lineTo(3, -12);
        g.lineTo(5, 12);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#a32a1a';
        g.fillRect(-4, -4, 8, 4);
        g.fillRect(-4.6, 5, 9.2, 4);
        g.fillRect(-4, -18, 8, 6);
        g.beginPath();
        g.moveTo(-5, -18);
        g.lineTo(0, -24);
        g.lineTo(5, -18);
        g.fill();
      } else if (m.kind === 'tower') {
        g.strokeStyle = 'rgba(246, 236, 212, 0.8)';
        g.lineWidth = 4;
        const lattice = () => {
          g.beginPath();
          g.moveTo(-9, 16);
          g.lineTo(-2, -26);
          g.lineTo(2, -26);
          g.lineTo(9, 16);
          for (let k = 0; k < 5; k++) {
            const t = k / 5;
            const y0 = 16 - t * 42;
            const w0 = 9 - t * 7;
            g.moveTo(-w0, y0);
            g.lineTo(w0 - 1.4, y0 - 8);
            g.moveTo(w0, y0);
            g.lineTo(-w0 + 1.4, y0 - 8);
          }
          g.moveTo(0, -26);
          g.lineTo(0, -34);
          g.stroke();
        };
        lattice();
        g.strokeStyle = '#a32a1a';
        g.lineWidth = 1.6;
        lattice();
      } else {
        g.fillStyle = '#4a4a48';
        g.strokeStyle = '#2a2420';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-5, 12);
        g.lineTo(-2, -4);
        g.moveTo(5, 12);
        g.lineTo(2, -4);
        g.stroke();
        g.beginPath();
        g.arc(0, -8, 6.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      continue;
    }
    const small = m.kind === 'tent' || m.kind === 'mine' || m.kind === 'tunnel';
    const fill = m.kind === 'airport' ? NAVY : small ? BLACK : RUST;
    const glyph = GLYPH[m.kind === 'tunnel' ? 'mine' : m.kind];
    if (glyph) badge(g, x, y, (small ? 24 : 34) * u, fill, glyph);
  }
}

// the picture's legend: the roads, the marks, a north arrow and a scale of the map's own (2 km across)
export function drawLegend(g, PX) {
  const k = PX / 4096;
  const x0 = 46 * k;
  const y0 = PX * 0.806;
  const w = PX * 0.262;
  const h = PX * 0.176;
  g.save();
  g.fillStyle = 'rgba(234, 218, 180, 0.97)';
  g.strokeStyle = INK;
  g.lineWidth = 5 * k;
  g.fillRect(x0, y0, w, h);
  g.strokeRect(x0, y0, w, h);
  g.lineWidth = 2 * k;
  g.strokeRect(x0 + 12 * k, y0 + 12 * k, w - 24 * k, h - 24 * k);
  g.font = `${Math.round(40 * k)}px Georgia, serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const row = 78 * k;
  const top = y0 + 62 * k;
  const lines = [
    ['Main Road (vehicles)', ROAD_STYLE.main, null],
    ['Secondary Road', ROAD_STYLE.secondary, null],
    ['Dirt Road', ROAD_STYLE.dirt, ROAD_DASH.dirt],
    ['Trail (foot / moped)', ROAD_STYLE.trail, ROAD_DASH.trail],
  ];
  g.lineCap = 'butt';
  lines.forEach(([t, strokes, dash], i) => {
    const y = top + row * i;
    for (const [lw, c] of strokes) {
      g.strokeStyle = c;
      g.lineWidth = lw * k;
      g.setLineDash(dash ? dash.map((v) => v * k) : []);
      g.beginPath();
      g.moveTo(x0 + 40 * k, y);
      g.lineTo(x0 + 180 * k, y);
      g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = INK;
    g.fillText(t, x0 + 200 * k, y);
  });
  const icons = [
    ['Town / POI', RUST, 'town'],
    ['Airport', NAVY, 'airport'],
    ['Industrial', RUST, 'industrial'],
    ['Gas Station', RUST, 'gas'],
    ['Camp', BLACK, 'tent'],
    ['Tunnel / Mine', BLACK, 'mine'],
  ];
  const cx = x0 + w * 0.64;
  icons.forEach(([t, fill, kind], i) => {
    const y = top + row * i * 0.92;
    badge(g, cx, y, 24 * k, fill, GLYPH[kind]);
    g.fillStyle = INK;
    g.fillText(t, cx + 44 * k, y);
  });
  // the north arrow and the scale (half the map's width: 1 km)
  const rx = x0 + 80 * k;
  const ry = y0 + h - 86 * k;
  g.fillStyle = INK;
  for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    g.beginPath();
    g.moveTo(rx + ax * 58 * k, ry + ay * 58 * k);
    g.lineTo(rx + ay * 12 * k, ry - ax * 12 * k);
    g.lineTo(rx - ay * 12 * k, ry + ax * 12 * k);
    g.closePath();
    g.fill();
  }
  g.font = `bold ${Math.round(38 * k)}px Georgia, serif`;
  g.textAlign = 'center';
  g.fillText('N', rx, ry - 84 * k);
  const sx = x0 + 180 * k;
  const sy = y0 + h - 56 * k;
  const len = (w - 240 * k) / 500; // (a metre: 500 m across the bar)
  g.lineWidth = 4 * k;
  g.strokeStyle = INK;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(sx + 500 * len, sy);
  for (let m = 0; m <= 500; m += 125) {
    g.moveTo(sx + m * len, sy - 12 * k);
    g.lineTo(sx + m * len, sy + 12 * k);
  }
  g.stroke();
  g.font = `${Math.round(32 * k)}px Georgia, serif`;
  for (const m of [0, 250, 500]) g.fillText(m === 500 ? '500 m' : String(m), sx + m * len, sy - 34 * k);
  g.restore();
}
