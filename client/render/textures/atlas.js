// The label / stencil atlas (1024): ammunition boxes, medicine, stencils, plates, signs, the billboard.
// rect = [x, y, w, h] in pixels of the 1024 atlas (y from top). 'alpha' cells have transparent background.
import { rngf, mkCanvas, ctx2d, canvasToImg } from './kit.js';
export const ATLAS = {
  medkit: [0, 0, 256, 256],
  hazard: [256, 0, 256, 256],
  sign: [512, 0, 256, 256],
  moon: [768, 0, 128, 128],
  bullet: [896, 0, 128, 128],
  ammo_9mm: [0, 256, 256, 128],
  ammo_shells: [256, 256, 256, 128],
  ammo_762: [512, 256, 256, 128],
  ammo_308: [768, 256, 256, 128],
  army: [0, 384, 256, 128],
  supply: [256, 384, 256, 128],
  pump: [512, 384, 256, 256],
  grave: [768, 384, 256, 128],
  flammable: [768, 512, 256, 128],
  battery: [0, 512, 256, 128],
  pills: [256, 512, 256, 128],
  carbattery: [0, 640, 256, 128],
  plate: [256, 640, 256, 128],
  gunparts: [512, 640, 256, 128],
  cross_mark: [768, 640, 128, 128],
  hazard_small: [896, 640, 128, 128],
  numbers: [0, 768, 256, 128],
  whiskey: [256, 768, 256, 128],
  // iteration 2 (props / pickups)
  blueprint: [768, 128, 256, 128],
  billboard: [512, 768, 512, 256],
  motel: [0, 896, 256, 128],
  vacancy: [256, 896, 256, 64],
  bus_text: [256, 960, 256, 64],
};
export function atlasUV(name) {
  const [x, y, w, h] = ATLAS[name];
  return { u0: x / 1024, u1: (x + w) / 1024, v0: 1 - (y + h) / 1024, v1: 1 - y / 1024 };
}

export const atlasTexture = () => {
  const S = 1024;
  const c = mkCanvas(S, S);
  const ctx = ctx2d(c);
  const m = mkCanvas(S, S); // alpha mask
  const mx = ctx2d(m);
  mx.fillStyle = '#fff';
  mx.fillRect(0, 0, S, S);
  const r = rngf(701);
  ctx.fillStyle = '#6a6a60';
  ctx.fillRect(0, 0, S, S);
  const font = (px, w = 'bold') => `${w} ${px}px "Arial Black", "Arial", sans-serif`;
  const grime = (x, y, w, h, n = 10, a = 0.25) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let k = 0; k < n; k++) {
      const px = x + r() * w, py = y + r() * h, R = 6 + r() * Math.min(w, h) * 0.3;
      const g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, `rgba(30,24,16,${a * (0.5 + r())})`);
      g.addColorStop(1, 'rgba(30,24,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - R, py - R, R * 2, R * 2);
    }
    ctx.restore();
  };
  const text = (t, x, y, px, col, align = 'center', wgt = 'bold') => {
    ctx.font = font(px, wgt);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(t, x, y);
  };
  const alphaCell = (name) => {
    const [x, y, w, h] = ATLAS[name];
    mx.fillStyle = '#000';
    mx.fillRect(x, y, w, h);
  };
  const box = (name, col) => {
    const [x, y, w, h] = ATLAS[name];
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    return [x, y, w, h];
  };
  // medkit: red case face with white cross
  {
    const [x, y, w, h] = box('medkit', '#8e1d18');
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(x + w * 0.38, y + h * 0.18, w * 0.24, h * 0.64);
    ctx.fillRect(x + w * 0.18, y + h * 0.38, w * 0.64, h * 0.24);
    grime(x, y, w, h, 16, 0.35);
  }
  // hazard label
  {
    const [x, y, w, h] = box('hazard', '#b8a24a');
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#d2b43a';
    ctx.fillRect(-78, -78, 156, 156);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#141210';
    ctx.strokeRect(-70, -70, 140, 140);
    ctx.restore();
    // skull
    ctx.fillStyle = '#141210';
    ctx.beginPath();
    ctx.arc(x + 128, y + 112, 30, 0, 7);
    ctx.fill();
    ctx.fillRect(x + 110, y + 126, 36, 26);
    ctx.fillStyle = '#d2b43a';
    ctx.beginPath();
    ctx.arc(x + 116, y + 110, 8, 0, 7);
    ctx.arc(x + 140, y + 110, 8, 0, 7);
    ctx.fill();
    ctx.fillRect(x + 118, y + 142, 4, 10);
    ctx.fillRect(x + 126, y + 142, 4, 10);
    ctx.fillRect(x + 134, y + 142, 4, 10);
    ctx.strokeStyle = '#141210';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 88, y + 158);
    ctx.lineTo(x + 168, y + 190);
    ctx.moveTo(x + 168, y + 158);
    ctx.lineTo(x + 88, y + 190);
    ctx.stroke();
    grime(x, y, w, h, 14, 0.3);
  }
  // road sign: yellow warning square (geometry rotates it into a diamond)
  {
    const [x, y, w, h] = box('sign', '#a88a1e');
    ctx.fillStyle = '#b89a2a';
    ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
    ctx.strokeStyle = '#141210';
    ctx.lineWidth = 8;
    ctx.strokeRect(x + 16, y + 16, w - 32, h - 32);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-Math.PI / 4);
    // deer silhouette-ish crossing / curve arrow
    ctx.strokeStyle = '#141210';
    ctx.lineWidth = 18;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-10, 70);
    ctx.lineTo(-10, 0);
    ctx.quadraticCurveTo(-10, -30, 20, -40);
    ctx.stroke();
    ctx.fillStyle = '#141210';
    ctx.beginPath();
    ctx.moveTo(18, -70);
    ctx.lineTo(56, -40);
    ctx.lineTo(14, -12);
    ctx.fill();
    ctx.restore();
    // rust + bullet holes
    grime(x, y, w, h, 18, 0.45);
    for (let k = 0; k < 7; k++) {
      const px = x + 30 + r() * (w - 60), py = y + 30 + r() * (h - 60);
      ctx.fillStyle = 'rgba(110,55,20,0.6)';
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#0c0a08';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,190,170,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, 7);
      ctx.stroke();
    }
  }
  // moon crescent (alpha)
  {
    const [x, y, w, h] = ATLAS.moon;
    alphaCell('moon');
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(x, y, w, h);
    mx.fillStyle = '#fff';
    mx.beginPath();
    mx.arc(x + 64, y + 64, 48, 0, 7);
    mx.fill();
    mx.fillStyle = '#000';
    mx.beginPath();
    mx.arc(x + 88, y + 52, 44, 0, 7);
    mx.fill();
  }
  // bullet hole (alpha) - generic decal
  {
    const [x, y, w, h] = ATLAS.bullet;
    alphaCell('bullet');
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(x, y, w, h);
    mx.fillStyle = '#fff';
    mx.beginPath();
    mx.arc(x + 64, y + 64, 24, 0, 7);
    mx.fill();
  }
  // ammo boxes
  const ammo = (name, bg, stripe, t1, t2, tc) => {
    const [x, y, w, h] = box(name, bg);
    ctx.fillStyle = stripe;
    ctx.fillRect(x, y + h * 0.62, w, h * 0.22);
    text(t1, x + w / 2, y + h * 0.36, 54, tc);
    text(t2, x + w / 2, y + h * 0.73, 22, bg);
    grime(x, y, w, h, 10, 0.35);
  };
  ammo('ammo_9mm', '#b3922e', '#2a2418', '9MM', 'LUGER  50 RDS', '#1c160e');
  ammo('ammo_shells', '#7e1f19', '#d8ceb4', '12 GA', 'BUCKSHOT  00', '#e0d6bc');
  ammo('ammo_762', '#3e4630', '#c8b870', '7.62x39', 'CARTRIDGES 440', '#d8cc90');
  ammo('ammo_308', '#6a4020', '#e2d2a8', '.308 WIN', 'SOFT POINT 20', '#f0e2b8');
  // stencils (alpha): army, supply, grave text, flammable
  const stencil = (name, lines, px, col) => {
    const [x, y, w, h] = ATLAS[name];
    alphaCell(name);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    mx.font = font(px);
    mx.textAlign = 'center';
    mx.textBaseline = 'middle';
    mx.fillStyle = '#fff';
    lines.forEach((ln, k) => mx.fillText(ln, x + w / 2, y + h * ((k + 1) / (lines.length + 1)) + (lines.length > 1 ? (k ? -6 : 6) : 0)));
    // stencil breaks + wear
    mx.fillStyle = '#000';
    for (let k = 0; k < 90; k++) mx.fillRect(x + r() * w, y + r() * h, 1 + r() * 4, 1 + r() * 3);
  };
  stencil('army', ['U.S. ARMY', '4 AMMO 7.62'], 34, '#c8c09a');
  stencil('supply', ['▲ SUPPLY ▲', 'AIRDROP 24'], 34, '#d0c8a0');
  stencil('flammable', ['FLAMMABLE', 'DIESEL - NO SMOKING'], 30, '#8c1c14');
  // gravestone inscription: engraved text (alpha)
  {
    const [x, y, w, h] = ATLAS.grave;
    alphaCell('grave');
    ctx.fillStyle = '#26241f';
    ctx.fillRect(x, y, w, h);
    mx.font = font(40, 'bold');
    mx.textAlign = 'center';
    mx.textBaseline = 'middle';
    mx.fillStyle = '#fff';
    mx.fillText('R.I.P.', x + w / 2, y + 38);
    mx.font = font(20, 'bold');
    mx.fillText('BELOVED', x + w / 2, y + 74);
    mx.fillText('1931 - 1987', x + w / 2, y + 102);
    mx.fillStyle = '#000';
    for (let k = 0; k < 60; k++) mx.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  // gas pump display
  {
    const [x, y, w, h] = box('pump', '#7a1d16');
    ctx.fillStyle = '#d6cfb8';
    ctx.fillRect(x + 12, y + 12, w - 24, 50);
    text('GAS', x + w / 2, y + 38, 38, '#7a1d16');
    ctx.fillStyle = '#16140f';
    ctx.fillRect(x + 20, y + 80, w - 40, 64);
    ctx.fillRect(x + 20, y + 160, w - 40, 64);
    text('0 0 0 0', x + w / 2, y + 114, 38, '#c9c0a4', 'center', 'normal');
    text('8 . 9 9', x + w / 2, y + 194, 38, '#c9c0a4', 'center', 'normal');
    ctx.font = font(12);
    ctx.fillStyle = '#d6cfb8';
    ctx.fillText('GALLONS', x + w / 2, y + 152);
    ctx.fillText('SALE', x + w / 2, y + 234);
    ctx.strokeStyle = 'rgba(200,200,200,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 30, y + 90);
    ctx.lineTo(x + 120, y + 200);
    ctx.lineTo(x + 180, y + 150);
    ctx.stroke();
    grime(x, y, w, h, 20, 0.45);
  }
  // batteries (copper top)
  {
    const [x, y, w, h] = box('battery', '#141414');
    ctx.fillStyle = '#9a5a26';
    ctx.fillRect(x, y, w * 0.3, h);
    text('1.5V', x + w * 0.62, y + h * 0.4, 40, '#c8a050');
    text('ALKALINE', x + w * 0.62, y + h * 0.72, 20, '#8a8a8a');
    grime(x, y, w, h, 6, 0.3);
  }
  // pills label
  {
    const [x, y, w, h] = box('pills', '#d8d4c8');
    ctx.fillStyle = '#2d5d8a';
    ctx.fillRect(x, y, w, 30);
    text('Rx', x + 40, y + 70, 44, '#1c1c1c');
    ctx.fillStyle = '#3a3a3a';
    for (let k = 0; k < 4; k++) ctx.fillRect(x + 90, y + 50 + k * 16, 140 - k * 20, 6);
    grime(x, y, w, h, 8, 0.3);
  }
  // car battery label
  {
    const [x, y, w, h] = box('carbattery', '#1a1c20');
    ctx.fillStyle = '#23409a';
    ctx.fillRect(x, y + 20, w, 60);
    text('12V  HEAVY DUTY', x + w / 2, y + 50, 26, '#e0e0e0');
    text('+', x + 30, y + 104, 30, '#c03020');
    text('−', x + w - 30, y + 104, 30, '#d0d0d0');
    grime(x, y, w, h, 10, 0.35);
  }
  // license plate
  {
    const [x, y, w, h] = box('plate', '#c9c3ae');
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    text('OREGON', x + w / 2, y + 26, 18, '#2a4a7a');
    text('4KX 229', x + w / 2, y + 76, 58, '#1c1c1c');
    grime(x, y, w, h, 14, 0.45);
  }
  // gun parts box
  {
    const [x, y, w, h] = box('gunparts', '#3a3a34');
    text('PARTS KIT', x + w / 2, y + 46, 32, '#b0a888');
    text('M-16 / AR', x + w / 2, y + 90, 22, '#8a846c');
    grime(x, y, w, h, 10, 0.3);
  }
  // small red cross on white (for bandage wrappers)
  {
    const [x, y, w, h] = box('cross_mark', '#d6d0c2');
    ctx.fillStyle = '#9a1e18';
    ctx.fillRect(x + 50, y + 22, 28, 84);
    ctx.fillRect(x + 22, y + 50, 84, 28);
    grime(x, y, w, h, 6, 0.3);
  }
  // small hazard triangle
  {
    const [x, y] = box('hazard_small', '#c8b040');
    ctx.fillStyle = '#141210';
    ctx.beginPath();
    ctx.moveTo(x + 64, y + 16);
    ctx.lineTo(x + 116, y + 108);
    ctx.lineTo(x + 12, y + 108);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c8b040';
    ctx.beginPath();
    ctx.moveTo(x + 64, y + 36);
    ctx.lineTo(x + 100, y + 100);
    ctx.lineTo(x + 28, y + 100);
    ctx.closePath();
    ctx.fill();
    text('!', x + 64, y + 76, 44, '#141210');
  }
  // numbers (serial) stencil-ish
  {
    const [x, y, w, h] = box('numbers', '#3c4130');
    text('LOT 7-2231', x + w / 2, y + h / 2, 32, '#bdb48c');
  }
  // whiskey label
  {
    const [x, y, w, h] = box('whiskey', '#d8c9a0');
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(x, y + 8, w, 6);
    ctx.fillRect(x, y + h - 14, w, 6);
    text('OLD CROW', x + w / 2, y + 44, 34, '#3a1c10');
    text('KENTUCKY WHISKEY', x + w / 2, y + 80, 18, '#5a2a14');
    text('XXX', x + w / 2, y + 102, 16, '#7a1c10');
    grime(x, y, w, h, 14, 0.45);
  }
  // ---- iteration 2 cells
  // blueprint paper: blue with a fine grid and white technical line work (rolled schematics)
  {
    const [x, y, w, h] = box('blueprint', '#2a4a70');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(150,185,230,0.28)';
    ctx.lineWidth = 1;
    for (let k = 0; k <= w; k += 8) {
      ctx.beginPath();
      ctx.moveTo(x + k + 0.5, y);
      ctx.lineTo(x + k + 0.5, y + h);
      ctx.stroke();
    }
    for (let k = 0; k <= h; k += 8) {
      ctx.beginPath();
      ctx.moveTo(x, y + k + 0.5);
      ctx.lineTo(x + w, y + k + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(225,235,245,0.85)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    // parts: a long receiver + barrel, a circle (cylinder end), dimension lines
    ctx.strokeRect(x + 22, y + 34, 120, 26);
    ctx.strokeRect(x + 142, y + 42, 80, 10);
    ctx.beginPath();
    ctx.moveTo(x + 40, y + 60);
    ctx.lineTo(x + 34, y + 92);
    ctx.lineTo(x + 52, y + 92);
    ctx.lineTo(x + 60, y + 60);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 196, y + 88, 18, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 196, y + 88, 7, 0, 7);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 24);
    ctx.lineTo(x + 222, y + 24);
    ctx.moveTo(x + 22, y + 20);
    ctx.lineTo(x + 22, y + 28);
    ctx.moveTo(x + 222, y + 20);
    ctx.lineTo(x + 222, y + 28);
    ctx.moveTo(x + 176, y + 88);
    ctx.lineTo(x + 150, y + 108);
    ctx.stroke();
    ctx.font = font(9, 'bold');
    ctx.fillStyle = 'rgba(225,235,245,0.85)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCHEMATIC  REV.3', x + 70, y + 100);
    ctx.fillText('412.5', x + 110, y + 17);
    // fold creases + age stains
    ctx.strokeStyle = 'rgba(10,20,40,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.5, y + h);
    ctx.stroke();
    ctx.restore();
    grime(x, y, w, h, 10, 0.3);
  }
  // billboard poster: a faded ad for the airfield past the bridge (issue #269: the run's far goal, seen from the
  // breakdown), torn strips showing boards, water streaks, red graffiti
  {
    const [x, y, w, h] = ATLAS.billboard;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#7f9aa0');
    g.addColorStop(0.55, '#b9b7a0');
    g.addColorStop(1, '#cbbf98');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // pines on the left + a moon
    ctx.fillStyle = '#3c5a44';
    for (const [px, ph] of [[40, 150], [78, 196], [118, 140]]) {
      ctx.beginPath();
      ctx.moveTo(x + px, y + h - 18 - ph);
      ctx.lineTo(x + px + ph * 0.32, y + h - 18);
      ctx.lineTo(x + px - ph * 0.32, y + h - 18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#e8dfb8';
    ctx.beginPath();
    ctx.arc(x + 150, y + 52, 24, 0, 7);
    ctx.fill();
    text('CALDER FIELD', x + 300, y + 62, 36, '#7a2418');
    text('AIRPORT', x + 300, y + 108, 34, '#23364e');
    text('FLIGHTS OUT DAILY', x + 300, y + 148, 18, '#3a3a34');
    ctx.fillStyle = '#7a2418';
    ctx.fillRect(x + 190, y + 170, 270, 36);
    text('OVER THE BRIDGE  →', x + 325, y + 189, 22, '#e8dcc0');
    // sun fade
    ctx.fillStyle = 'rgba(230,226,205,0.28)';
    ctx.fillRect(x, y, w, h);
    // water streaks
    for (let k = 0; k < 40; k++) {
      const sx = x + r() * w, sl = 30 + r() * 200, sw = 1 + r() * 5;
      const gg = ctx.createLinearGradient(0, y, 0, y + sl);
      gg.addColorStop(0, 'rgba(40,36,26,0.35)');
      gg.addColorStop(1, 'rgba(40,36,26,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(sx, y, sw, sl);
    }
    // torn patches: boards showing through, pale paper edge
    const tear = (cx, cy, rw, rh) => {
      const pts = [];
      for (let s = 0; s < 14; s++) {
        const an = (s / 14) * Math.PI * 2;
        const k = 0.6 + r() * 0.55;
        pts.push([cx + Math.cos(an) * rw * k, cy + Math.sin(an) * rh * k]);
      }
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#ddd4b8';
      ctx.stroke();
      ctx.fillStyle = '#4a3a2a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,8,0.6)';
      ctx.lineWidth = 2;
      for (let k = 1; k < 5; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - rw * 1.2, cy - rh + k * rh * 0.45);
        ctx.lineTo(cx + rw * 1.2, cy - rh + k * rh * 0.45);
        ctx.stroke();
      }
    };
    ctx.save();
    tear(x + 470, y + 40, 44, 50);
    tear(x + 200, y + 236, 70, 34);
    tear(x + 20, y + 120, 26, 60);
    ctx.restore();
    // graffiti
    ctx.save();
    ctx.translate(x + 168, y + 214);
    ctx.rotate(-0.08);
    ctx.shadowColor = 'rgba(120,10,6,0.9)';
    ctx.shadowBlur = 6;
    ctx.font = font(24, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8a1208';
    ctx.fillText('THEY COME AT NIGHT', 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(120,14,8,0.7)';
    for (let k = 0; k < 12; k++) ctx.fillRect(x + 20 + r() * 260, y + 226 + r() * 10, 2, 6 + r() * 16);
    ctx.restore();
    grime(x, y, w, h, 26, 0.35);
  }
  // motel sign face: red letters on teal board
  {
    const [x, y, w, h] = box('motel', '#2c6560');
    ctx.strokeStyle = '#d8ceb0';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    ctx.lineJoin = 'round';
    ctx.font = font(56);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#e2d6b4';
    ctx.strokeText('MOTEL', x + w / 2, y + h / 2 + 3);
    ctx.fillStyle = '#b8321c';
    ctx.fillText('MOTEL', x + w / 2, y + h / 2 + 3);
    for (let k = 0; k < 18; k++) {
      const gg = ctx.createLinearGradient(0, y, 0, y + h);
      gg.addColorStop(0, 'rgba(110,50,20,0.4)');
      gg.addColorStop(1, 'rgba(110,50,20,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x + r() * w, y + r() * 30, 2 + r() * 4, 40 + r() * 80);
    }
    grime(x, y, w, h, 16, 0.4);
  }
  // NO VACANCY box
  {
    const [x, y, w, h] = box('vacancy', '#16130f');
    text('NO', x + 42, y + h / 2 + 2, 30, '#5a1a12');
    text('VACANCY', x + 150, y + h / 2 + 2, 30, '#a82a18');
    grime(x, y, w, h, 8, 0.35);
  }
  // SCHOOL BUS lettering (alpha stencil)
  {
    const [x, y, w, h] = ATLAS.bus_text;
    alphaCell('bus_text');
    ctx.fillStyle = '#121110';
    ctx.fillRect(x, y, w, h);
    mx.font = font(30);
    mx.textAlign = 'center';
    mx.textBaseline = 'middle';
    mx.fillStyle = '#fff';
    mx.fillText('SCHOOL BUS', x + w / 2, y + h / 2 + 2, w - 12);
    mx.fillStyle = '#000';
    for (let k = 0; k < 50; k++) mx.fillRect(x + r() * w, y + r() * h, 1 + r() * 4, 1 + r() * 3);
  }
  // compose alpha
  const ci = canvasToImg(c), mi = canvasToImg(m);
  for (let i = 0; i < ci.d.length; i += 4) ci.d[i + 3] = mi.d[i];
  return ci;
};
