// The mainland's field map (issue #232: "Mainland Layout 12" redrawn as the field map). It is the island's survey map in
// the colours and the symbols of the picture the mainland was built to: paper, the sea and the lake in blue with their
// shallows and a light rim round every islet, the mountains as ranges of lit and shaded faces with the crests inked
// (no outline: their feet go into the woods), the woods as the picture draws them - tree after tree, a crown each,
// the nearer over the further - the roads by the picture's legend, the buildings in slate, and the picture's marks: the
// town, the airport, the industry, the gas station, the passes and the mines, the camps, the lighthouse, the radio
// tower, the quarry; and its legend in the corner of the sea. Place names are not baked (the map screen writes them as
// they are discovered), but "TO ISLAND" is, as the picture has it.
//
// Everything is drawn from the world as generated (mainland.js), at MAP_PPM pixels a metre: the raster (paper, relief,
// water, rock) at a pixel a metre, scaled up, and the rest as vectors over it.
import { drawRelief } from './mainland/relief.js';
import { drawWoods } from './mainland/woods.js';
import { drawRoads } from './mainland/roads.js';
import { drawBuilt } from './mainland/built.js';
import { drawHarbour } from './mainland/harbour.js';
import { INK, drawMarks, drawLegend } from './mainland/marks.js';

// The sheet, layer by layer: each layer over the ones before it
export function drawMainland(g, world, S, mapX, mapY) {
  const PX = world.size * S;
  drawRelief(g, world, S);
  drawWoods(g, world, S, mapX, mapY);
  drawRoads(g, world, S, mapX, mapY);
  drawBuilt(g, world, S, mapX, mapY);
  drawHarbour(g, world, S, mapX, mapY);
  // the picture's marks
  drawMarks(g, world, S, mapX, mapY);
  drawToIsland(g, world, S, mapY);
  // the legend, in the south-west corner of the sea where the picture has it
  drawLegend(g, PX);
  drawTitle(g, PX);
  drawSheet(g, world, S);
}

// "TO ISLAND", as the picture writes it on the bridge's way out
function drawToIsland(g, world, S, mapY) {
  if (world.bridge) {
    const y = mapY(world.bridge.z);
    const x = 18 * S;
    g.save();
    g.translate(x, y);
    g.scale(2.2 * (S / 2), 2.2 * (S / 2));
    g.translate(-x, -y);
    g.fillStyle = '#a32a1a';
    g.strokeStyle = 'rgba(246, 236, 212, 0.95)';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(x, y - 36);
    g.lineTo(x + 26, y - 50);
    g.lineTo(x + 26, y - 41);
    g.lineTo(x + 70, y - 41);
    g.lineTo(x + 70, y - 31);
    g.lineTo(x + 26, y - 31);
    g.lineTo(x + 26, y - 22);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    g.fillStyle = '#a32a1a';
    g.strokeStyle = 'rgba(246, 236, 212, 0.95)';
    g.lineWidth = 9;
    g.font = `bold ${Math.round(64 * (S / 2))}px Georgia, serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.strokeText('TO ISLAND', x - 8, y + 70);
    g.fillText('TO ISLAND', x - 8, y + 70);
  }
}

// the sheet's title, as the picture writes its own over the north-west corner: spaced bold capitals in a light
// halo, a rule under them
function drawTitle(g, PX) {
  const k = PX / 4096;
  const t = 'THE CALDER COAST';
  g.save();
  g.font = `bold ${Math.round(124 * k)}px Georgia, serif`;
  g.letterSpacing = `${Math.round(7 * k)}px`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const x = 84 * k;
  const y = 170 * k;
  const w = g.measureText(t).width;
  g.lineJoin = 'round';
  g.lineWidth = 16 * k;
  g.strokeStyle = 'rgba(232, 214, 176, 0.94)';
  g.strokeText(t, x, y);
  g.fillStyle = INK;
  g.fillText(t, x, y);
  g.fillStyle = 'rgba(232, 214, 176, 0.94)';
  g.fillRect(x - 6 * k, y + 20 * k, w + 12 * k, 14 * k);
  g.fillStyle = INK;
  g.fillRect(x, y + 24 * k, w, 3 * k);
  g.fillRect(x, y + 30 * k, w, 1.4 * k);
  g.restore();
}

// grid (a square of 128 m) and the age of the sheet
function drawSheet(g, world, S) {
  const SIZE = world.size;
  const PX = SIZE * S;
  g.strokeStyle = 'rgba(70, 48, 30, 0.1)';
  g.lineWidth = 1;
  g.beginPath();
  for (let v = 0; v <= SIZE; v += 128) {
    g.moveTo(v * S, 0);
    g.lineTo(v * S, PX);
    g.moveTo(0, v * S);
    g.lineTo(PX, v * S);
  }
  g.stroke();
  const grad = g.createRadialGradient(PX / 2, PX / 2, PX * 0.3, PX / 2, PX / 2, PX * 0.74);
  grad.addColorStop(0, 'rgba(70,44,18,0)');
  grad.addColorStop(0.7, 'rgba(70,44,18,0.16)');
  grad.addColorStop(1, 'rgba(60,36,14,0.46)');
  g.fillStyle = grad;
  g.fillRect(0, 0, PX, PX);
}
