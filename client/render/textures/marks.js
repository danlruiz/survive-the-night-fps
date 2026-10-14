// The atlas of the marks left on the world (render/marks.js draws them): a cell per kind (shared/surfaces.js MARK).
// Each cell is painted once, by hand as it were: what the mark shows is the material under the surface (pale wood,
// fresh stone, bare steel), the shadow inside the cut and the bits standing up round it. Long marks lie along x.
import { MARK, MARK_COLS, MARK_ROWS } from '../../../shared/surfaces.js';

const CELL = 128;
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
// a lens along x: the outline of a cut, half-height hh at its middle, ragged by `rag`
function lens(c, r, x0, x1, hh, rag = 0.15, skew = 0) {
  const n = 14;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = Math.sin(Math.PI * t) ** 0.8;
    c.lineTo(x0 + (x1 - x0) * t, 64 - hh * e * (1 + (r() - 0.5) * rag) + skew * (t - 0.5));
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const e = Math.sin(Math.PI * t) ** 0.8;
    c.lineTo(x0 + (x1 - x0) * t, 64 + hh * e * (1 + (r() - 0.5) * rag) + skew * (t - 0.5));
  }
  c.closePath();
}
function blob(c, r, cx, cy, rad, rag = 0.3, n = 16) {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = rad * (1 + (r() - 0.5) * rag * 2);
    c.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
  }
  c.closePath();
}
const soft = (c, cx, cy, r0, r1, col0, col1) => {
  const g = c.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, col0);
  g.addColorStop(1, col1);
  c.fillStyle = g;
  c.fillRect(cx - r1, cy - r1, r1 * 2, r1 * 2);
};
function ticks(c, r, n, x0, x1, y, len, col, w = 1, lean = 0.5) {
  c.strokeStyle = col;
  c.lineWidth = w;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * r();
    const up = r() < 0.5 ? -1 : 1;
    const l = len * (0.4 + r());
    c.beginPath();
    c.moveTo(x, y + up * 2);
    c.lineTo(x + (r() - 0.5) * l * lean * 2, y + up * (2 + l));
    c.stroke();
  }
}
function cracks(c, r, cx, cy, n, r0, r1, col, w = 1) {
  c.strokeStyle = col;
  c.lineWidth = w;
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.7;
    let x = cx + Math.cos(a) * r0, y = cy + Math.sin(a) * r0;
    c.beginPath();
    c.moveTo(x, y);
    const len = r1 * (0.55 + r() * 0.45);
    for (let d = r0; d < len; d += 7) {
      a += (r() - 0.5) * 0.5;
      x += Math.cos(a) * 7;
      y += Math.sin(a) * 7;
      c.lineTo(x, y);
    }
    c.stroke();
  }
}
const PAINT = {
  [MARK.SLASH_WOOD](c, r) {
    lens(c, r, 6, 122, 7, 0.3);
    const g = c.createLinearGradient(0, 56, 0, 72);
    g.addColorStop(0, '#2a1c10');
    g.addColorStop(0.35, '#8a6a40');
    g.addColorStop(1, '#e3cfa2');
    c.fillStyle = g;
    c.fill();
    ticks(c, r, 7, 14, 114, 64, 4, 'rgba(226,208,164,0.85)', 1.1, 1.6);
    ticks(c, r, 5, 14, 114, 64, 3, 'rgba(40,26,14,0.6)', 1, 1.2);
  },
  [MARK.GOUGE_WOOD](c, r) {
    lens(c, r, 8, 120, 15, 0.35, 5);
    const g = c.createLinearGradient(0, 48, 0, 82);
    g.addColorStop(0, '#1a110a');
    g.addColorStop(0.45, '#5c4326');
    g.addColorStop(0.75, '#c9ae7c');
    g.addColorStop(1, '#eedcb2');
    c.fillStyle = g;
    c.fill();
    // chips lifted along the lower lip
    for (let i = 0; i < 9; i++) {
      const x = 18 + r() * 92, y = 74 + r() * 10;
      c.fillStyle = rgba(225 + r() * 20, 205 + r() * 20, 160 + r() * 20, 0.95);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 6 + r() * 9, y + 2 + r() * 4);
      c.lineTo(x + 2 + r() * 5, y + 6 + r() * 6);
      c.closePath();
      c.fill();
    }
    ticks(c, r, 9, 12, 116, 64, 8, 'rgba(232,214,170,0.85)', 1.3, 1.8);
  },
  [MARK.BRUISE_WOOD](c, r) {
    soft(c, 64, 64, 4, 50, 'rgba(46,32,18,0.75)', 'rgba(60,44,26,0)');
    blob(c, r, 64, 64, 24, 0.25);
    c.fillStyle = 'rgba(205,182,138,0.85)';
    c.fill();
    blob(c, r, 64, 62, 15, 0.3);
    c.fillStyle = 'rgba(96,72,44,0.9)';
    c.fill();
    cracks(c, r, 64, 64, 9, 18, 56, 'rgba(30,20,10,0.8)', 1.4);
    cracks(c, r, 64, 64, 7, 20, 44, 'rgba(232,214,172,0.8)', 1);
  },
  [MARK.SCRATCH_STONE](c, r) {
    c.lineCap = 'round';
    for (const [w, a, o] of [[9, 0.25, 0], [4, 0.75, 0], [1.6, 0.95, -1], [1.4, 0.6, 5]]) {
      c.strokeStyle = rgba(226, 220, 208, a);
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(8, 64 + o);
      for (let x = 20; x <= 120; x += 12) c.lineTo(x, 64 + o + (r() - 0.5) * 3);
      c.stroke();
    }
    for (let i = 0; i < 26; i++) {
      c.fillStyle = rgba(200, 194, 182, 0.5 * r());
      c.fillRect(8 + r() * 112, 58 + r() * 14, 1.5 + r() * 2, 1.5 + r() * 2);
    }
  },
  [MARK.CHIP_STONE](c, r) {
    soft(c, 64, 64, 10, 58, 'rgba(214,208,196,0.5)', 'rgba(214,208,196,0)');
    blob(c, r, 64, 64, 30, 0.45, 11);
    c.fillStyle = '#d2cabb';
    c.fill();
    c.save();
    c.clip();
    const g = c.createLinearGradient(0, 30, 0, 98);
    g.addColorStop(0, 'rgba(40,36,30,0.85)');
    g.addColorStop(0.35, 'rgba(120,112,100,0.3)');
    g.addColorStop(1, 'rgba(255,250,240,0.25)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    c.restore();
    cracks(c, r, 64, 64, 6, 26, 54, 'rgba(34,30,26,0.7)', 1.2);
  },
  [MARK.SCRAPE_METAL](c, r) {
    for (let i = 0; i < 7; i++) {
      const y = 57 + i * 2.2 + (r() - 0.5) * 2;
      const x0 = 6 + r() * 24, x1 = 122 - r() * 24;
      c.strokeStyle = i % 3 === 1 ? rgba(70, 52, 40, 0.7) : rgba(160 + r() * 40, 164 + r() * 40, 168 + r() * 40, 0.5 + r() * 0.4);
      c.lineWidth = 0.8 + r() * 1.6;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y + (r() - 0.5) * 3);
      c.stroke();
    }
  },
  [MARK.GASH_METAL](c, r) {
    // a crease cut through the paint: a dark slit, a thin edge of bare steel under it, the paint flaked along it
    soft(c, 64, 64, 4, 52, 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0)');
    lens(c, r, 6, 122, 9, 0.35);
    c.fillStyle = 'rgba(150,154,158,0.85)';
    c.fill();
    lens(c, r, 10, 118, 5, 0.4);
    c.fillStyle = '#080808';
    c.fill();
    ticks(c, r, 12, 14, 114, 64, 6, 'rgba(120,70,40,0.6)', 1.2, 0.7);
  },
  [MARK.DENT_METAL](c, r) {
    // a hollow, lit from above: dark under its upper lip, bright along its lower one
    soft(c, 64, 60, 4, 56, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)');
    c.lineCap = 'round';
    c.filter = 'blur(5px)';
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 15;
    c.beginPath();
    c.arc(64, 70, 40, Math.PI * 1.14, Math.PI * 1.86);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 11;
    c.beginPath();
    c.arc(64, 56, 42, Math.PI * 0.16, Math.PI * 0.84);
    c.stroke();
    c.filter = 'none';
    // the paint gone where the blow landed: bare steel, a rim of primer and rust
    blob(c, r, 62, 62, 17, 0.5, 13);
    c.fillStyle = 'rgba(118,72,44,0.9)';
    c.fill();
    blob(c, r, 62, 62, 12, 0.5, 11);
    c.fillStyle = 'rgba(190,194,198,0.95)';
    c.fill();
    c.strokeStyle = 'rgba(20,20,20,0.6)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(30, 70);
    c.quadraticCurveTo(64, 52, 100, 66);
    c.stroke();
    for (let i = 0; i < 16; i++) {
      c.fillStyle = r() < 0.5 ? rgba(190, 194, 198, 0.9) : rgba(110, 66, 40, 0.9);
      const a = r() * 6.28, d = 14 + r() * 30;
      c.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + r() * 3, 1.5 + r() * 3);
    }
  },
  [MARK.CUT_EARTH](c, r) {
    soft(c, 64, 64, 4, 60, 'rgba(30,20,12,0.35)', 'rgba(30,20,12,0)');
    lens(c, r, 8, 120, 9, 0.5);
    c.fillStyle = '#1c130b';
    c.fill();
    for (let i = 0; i < 46; i++) {
      const x = 10 + r() * 108, y = 64 + (r() - 0.5) * 36;
      c.fillStyle = r() < 0.6 ? rgba(58, 40, 24, 0.9) : rgba(98, 74, 46, 0.9);
      c.beginPath();
      c.arc(x, y, 1 + r() * 2.6, 0, 6.3);
      c.fill();
    }
  },
  [MARK.DIVOT_EARTH](c, r) {
    soft(c, 64, 64, 8, 60, 'rgba(34,24,14,0.6)', 'rgba(34,24,14,0)');
    blob(c, r, 64, 64, 26, 0.4, 13);
    c.fillStyle = '#1e150c';
    c.fill();
    for (let i = 0; i < 60; i++) {
      const a = r() * 6.28, d = 20 + r() * 36;
      c.fillStyle = r() < 0.6 ? rgba(62, 44, 26, 0.9) : rgba(104, 80, 50, 0.85);
      c.beginPath();
      c.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 3, 0, 6.3);
      c.fill();
    }
  },
  [MARK.TEAR_CLOTH](c, r) {
    lens(c, r, 6, 122, 8, 0.6, 4);
    c.fillStyle = '#050505';
    c.fill();
    ticks(c, r, 26, 10, 118, 64, 8, 'rgba(206,200,180,0.85)', 1, 0.9);
    ticks(c, r, 12, 10, 118, 64, 5, 'rgba(20,20,18,0.7)', 1, 0.9);
  },
  [MARK.CRACK_GLASS](c, r) {
    soft(c, 64, 64, 2, 16, 'rgba(240,246,250,0.95)', 'rgba(240,246,250,0)');
    cracks(c, r, 64, 64, 11, 4, 60, 'rgba(236,244,250,0.95)', 2);
    cracks(c, r, 64, 64, 8, 6, 40, 'rgba(255,255,255,0.7)', 1.3);
    c.strokeStyle = 'rgba(236,244,250,0.55)';
    c.lineWidth = 0.9;
    for (const rad of [16, 30, 46]) {
      for (let k = 0; k < 5; k++) {
        const a = r() * 6.28;
        c.beginPath();
        c.arc(64, 64, rad * (0.9 + r() * 0.2), a, a + 0.5 + r() * 0.7);
        c.stroke();
      }
    }
  },
  [MARK.HOLE](c, r) {
    soft(c, 64, 64, 14, 44, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)');
    blob(c, r, 64, 64, 22, 0.2);
    c.fillStyle = '#030303';
    c.fill();
  },
  [MARK.SCORCH](c, r) {
    soft(c, 64, 64, 4, 62, 'rgba(6,5,4,0.9)', 'rgba(6,5,4,0)');
    for (let i = 0; i < 60; i++) {
      const a = r() * 6.28, d = 14 + r() * 44;
      soft(c, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 0, 4 + r() * 9, 'rgba(8,6,5,0.5)', 'rgba(8,6,5,0)');
    }
  },
  [MARK.STAB](c, r) {
    soft(c, 64, 64, 4, 40, 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)');
    lens(c, r, 36, 92, 7, 0.4);
    c.fillStyle = '#040404';
    c.fill();
    ticks(c, r, 8, 40, 88, 64, 6, 'rgba(210,204,190,0.6)', 1, 0.8);
  },
  [MARK.SCUFF_RUBBER](c, r) {
    soft(c, 64, 64, 6, 52, 'rgba(150,150,146,0.5)', 'rgba(150,150,146,0)');
    for (let i = 0; i < 10; i++) {
      c.strokeStyle = rgba(170, 170, 166, 0.3 + r() * 0.3);
      c.lineWidth = 1 + r() * 2;
      c.beginPath();
      c.moveTo(30 + r() * 20, 44 + r() * 40);
      c.lineTo(80 + r() * 20, 44 + r() * 40);
      c.stroke();
    }
  },
  [MARK.HOLE_WOOD](c, r) {
    // torn fibres round a dark hole, the grain's way (x)
    soft(c, 64, 64, 10, 46, 'rgba(40,28,16,0.45)', 'rgba(40,28,16,0)');
    for (let i = 0; i < 26; i++) {
      const up = (r() - 0.5) * 30;
      const len = 14 + r() * 34;
      const side = r() < 0.5 ? -1 : 1;
      c.strokeStyle = r() < 0.75 ? rgba(228 + r() * 20, 208 + r() * 20, 164 + r() * 20, 0.95) : rgba(60, 42, 24, 0.8);
      c.lineWidth = 1 + r() * 1.8;
      c.beginPath();
      c.moveTo(64 + side * 8, 64 + up * 0.5);
      c.lineTo(64 + side * (8 + len), 64 + up);
      c.stroke();
    }
    blob(c, r, 64, 64, 20, 0.4, 12);
    c.fillStyle = '#060403';
    c.fill();
  },
  [MARK.HOLE_STONE](c, r) {
    // a crater: a light ring of fresh stone, darker towards the hole, dust round it
    soft(c, 64, 64, 18, 60, 'rgba(222,216,204,0.55)', 'rgba(222,216,204,0)');
    blob(c, r, 64, 64, 34, 0.4, 12);
    c.fillStyle = '#d6cebf';
    c.fill();
    blob(c, r, 64, 64, 24, 0.35, 11);
    c.fillStyle = '#8c8478';
    c.fill();
    blob(c, r, 64, 65, 12, 0.3, 9);
    c.fillStyle = '#12100e';
    c.fill();
    c.strokeStyle = 'rgba(30,26,22,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(64, 64, 25, Math.PI * 1.05, Math.PI * 1.95);
    c.stroke();
    cracks(c, r, 64, 64, 5, 30, 52, 'rgba(40,36,32,0.6)', 1.1);
  },
  [MARK.HOLE_METAL](c, r) {
    // punched clean: a dimple, a bright bare rim, the hole
    soft(c, 64, 64, 14, 56, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)');
    c.fillStyle = 'rgba(112,68,42,0.85)';
    blob(c, r, 64, 64, 31, 0.2, 14);
    c.fill();
    c.fillStyle = '#d4d8dc';
    c.beginPath();
    c.arc(64, 64, 26, 0, 6.3);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(64, 64, 22, Math.PI * 0.1, Math.PI * 0.9);
    c.stroke();
    c.fillStyle = '#020202';
    c.beginPath();
    c.arc(64, 64, 17, 0, 6.3);
    c.fill();
  },
  [MARK.HOLE_GLASS](c, r) {
    cracks(c, r, 64, 64, 13, 8, 62, 'rgba(238,246,252,0.95)', 2.2);
    c.strokeStyle = 'rgba(238,246,252,0.7)';
    c.lineWidth = 1.6;
    for (const rad of [14, 24]) {
      for (let k = 0; k < 6; k++) {
        const a = r() * 6.28;
        c.beginPath();
        c.arc(64, 64, rad * (0.9 + r() * 0.2), a, a + 0.6 + r() * 0.8);
        c.stroke();
      }
    }
    soft(c, 64, 64, 6, 20, 'rgba(244,250,255,0.95)', 'rgba(244,250,255,0)');
    blob(c, r, 64, 64, 7, 0.4, 9);
    c.fillStyle = '#040506';
    c.fill();
  },
  [MARK.SHARDS](c, r) {
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 58;
      const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, s = 2 + r() * 6;
      c.fillStyle = r() < 0.2 ? rgba(214, 228, 230, 0.8) : rgba(110 + r() * 40, 150 + r() * 40, 150 + r() * 40, 0.4 + r() * 0.3);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + s * (r() - 0.2), y + s * (r() - 0.5));
      c.lineTo(x + s * (r() - 0.5), y + s * (r() + 0.1));
      c.closePath();
      c.fill();
    }
  },
  [MARK.CRACK_PANE](c, r) {
    // the whole pane crazed: several stars, their legs running to the edges
    // (a vehicle's glass is seen through: crazed, it is milky, and what is behind it only shapes)
    c.fillStyle = 'rgba(206,220,224,0.34)';
    c.fillRect(0, 0, 128, 128);
    for (const [x, y, n, len] of [[44, 54, 12, 110], [92, 82, 9, 80], [84, 28, 7, 60]]) {
      cracks(c, r, x, y, n, 3, len, 'rgba(238,246,252,0.9)', 1.2);
      soft(c, x, y, 1, 9, 'rgba(244,250,255,0.9)', 'rgba(244,250,255,0)');
      c.strokeStyle = 'rgba(238,246,252,0.5)';
      c.lineWidth = 0.9;
      for (const rad of [12, 24, 38]) {
        for (let k = 0; k < 4; k++) {
          const a = r() * 6.28;
          c.beginPath();
          c.arc(x, y, rad, a, a + 0.5 + r() * 0.8);
          c.stroke();
        }
      }
    }
  },
  [MARK.REMNANT](c, r) {
    // teeth of glass standing in the frame all the way round, the middle of it clear: long ones in the corners
    // and along the bottom, where a pane holds on longest
    const tooth = (x, y, ax, ay, bx, by, w, len) => {
      // its foot on the frame at (x, y) running along a, its point `len` in along b, leaning
      const lean = (r() - 0.5) * w * 0.9;
      c.beginPath();
      c.moveTo(x - ax * w * 0.5, y - ay * w * 0.5);
      c.lineTo(x + ax * w * 0.5, y + ay * w * 0.5);
      c.lineTo(x + ax * lean + bx * len, y + ay * lean + by * len);
      c.closePath();
      const g = 150 + r() * 50;
      c.fillStyle = rgba(g * 0.8, g * 0.98, g, 0.5 + r() * 0.3);
      c.fill();
      c.strokeStyle = 'rgba(240,248,250,0.85)';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x - ax * w * 0.5, y - ay * w * 0.5);
      c.lineTo(x + ax * lean + bx * len, y + ay * lean + by * len);
      c.stroke();
    };
    for (const [x0, y0, ax, ay, bx, by, deep] of [[2, 126, 1, 0, 0, -1, 1.5], [2, 2, 1, 0, 0, 1, 0.8], [2, 2, 0, 1, 1, 0, 1], [126, 2, 0, 1, -1, 0, 1]]) {
      let s = 0;
      while (s < 124) {
        const w = 5 + r() * 15;
        const edge = Math.min(s, 124 - s) / 62; // 0 at a corner .. 1 in the middle of the side
        const len = (5 + r() * 16 + (1 - edge) ** 2 * 22) * deep * (r() < 0.16 ? 0.2 : 1);
        tooth(x0 + ax * (s + w / 2), y0 + ay * (s + w / 2), ax, ay, bx, by, w, len);
        s += w * (0.75 + r() * 0.7);
      }
    }
  },
  [MARK.HOLE_BIG](c, r) {
    soft(c, 64, 64, 20, 62, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)');
    blob(c, r, 64, 64, 40, 0.5, 13);
    c.fillStyle = 'rgba(176,170,160,0.9)';
    c.fill();
    blob(c, r, 64, 64, 31, 0.55, 12);
    c.fillStyle = '#040404';
    c.fill();
    cracks(c, r, 64, 64, 9, 30, 62, 'rgba(20,18,16,0.8)', 1.6);
    cracks(c, r, 64, 64, 6, 32, 54, 'rgba(226,222,214,0.7)', 1.2);
  },
  [MARK.PITS](c, r) {
    for (let i = 0; i < 22; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 54;
      const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, s = 1.5 + r() * 4.5;
      soft(c, x, y, s * 0.6, s * 2.6, 'rgba(210,204,192,0.5)', 'rgba(210,204,192,0)');
      c.fillStyle = '#0a0908';
      c.beginPath();
      c.arc(x, y, s, 0, 6.3);
      c.fill();
    }
  },
};

const TALL = { [MARK.SLASH_WOOD]: 3.2, [MARK.GOUGE_WOOD]: 2.4, [MARK.SCRATCH_STONE]: 3.4, [MARK.SCRAPE_METAL]: 2.6, [MARK.GASH_METAL]: 1.8, [MARK.CUT_EARTH]: 2.6, [MARK.TEAR_CLOTH]: 3 };
export function paintMarkAtlas(canvas = document.createElement('canvas')) {
  canvas.width = CELL * MARK_COLS;
  canvas.height = CELL * MARK_ROWS;
  const c = canvas.getContext('2d');
  for (const k of Object.keys(PAINT)) {
    const cell = +k;
    c.save();
    c.translate((cell % MARK_COLS) * CELL, Math.floor(cell / MARK_COLS) * CELL);
    c.beginPath();
    c.rect(2, 2, CELL - 4, CELL - 4); // (a clear border: no cell bleeds into the next)
    c.clip();
    // (a long mark's cell is laid on a quad several times as long as it is high: drawn that much taller here, it
    // comes out the right thickness there)
    const tall = TALL[cell] || 1;
    c.translate(0, 64);
    c.scale(1, tall);
    c.translate(0, -64);
    PAINT[k](c, rng(977 + cell * 131));
    c.restore();
  }
  return canvas;
}
