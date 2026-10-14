// Noisemaker: a wind-up twin-bell alarm clock (11 cm across the bells, 13 cm from its feet to the handle). Red enamel
// drum case, chrome bezel round a cream dial with its hour marks and hands, two steel bells on posts with the hammer
// between them, a wire carrying handle over the top, splayed ball feet, and the two winding keys on the back. Long
// axis +Y; the dial faces +Z (the holder), the keys -Z.
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { PI, profile, latheZ, latheY, M, R, handQ, SPRINT } from './parts.js';

function buildDecoy(P) {
  const hi = P.hi;
  const B = P.get('body');
  const rs = R(hi, 28, 16);
  const red = { region: WR.PLAIN, color: [0.62, 0.1, 0.07], mottle: 0.06 };
  const chrome = { ...M.steel, color: [0.95, 0.95, 0.93] };
  const dark = { region: WR.PLAIN, color: 0x141414, mottle: 0.02 };
  // drum case (along Z): back plate, red drum, chrome bezel, dial (latheZ: [r, f], f forward = -Z)
  latheZ(B, [[0, 0.0175], [0.034, 0.0175], [0.0392, 0.0158], [0.0418, 0.0128], [0.042, 0.0], [0.0418, -0.0118], [0, -0.0118]], 0, 0, { ...red, rs, sharp: true });
  latheZ(B, [[0, 0.0182], [0.031, 0.0182], [0.0316, 0.0176], [0, 0.0176]], 0, 0, { ...chrome, color: [0.85, 0.85, 0.82], rs, sharp: true });
  latheZ(B, [[0.0352, -0.0112], [0.0432, -0.0112], [0.0442, -0.0136], [0.0438, -0.0172], [0.0408, -0.0194], [0.0364, -0.019], [0.0352, -0.0172]], 0, 0, { ...chrome, rs, sharp: true });
  latheZ(B, [[0, -0.0148], [0.0356, -0.0148], [0.0356, -0.0152], [0, -0.0152]], 0, 0, { region: WR.PLAIN, color: [0.93, 0.89, 0.76], mottle: 0.04, rs, sharp: true });
  // hour marks (long at 12, 3, 6, 9), a centre boss, the hands at ten past ten and the red alarm hand
  const dialZ = 0.0154;
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * PI * 2;
    const big = h % 3 === 0;
    const r0 = big ? 0.0262 : 0.0282;
    const c = [Math.sin(a) * (r0 + 0.0315) / 2, Math.cos(a) * (r0 + 0.0315) / 2, dialZ];
    B.box(0, c, [big ? 0.0026 : 0.0014, 0.0315 - r0, 0.0006], { ...dark, rot: [0, 0, -a] });
  }
  if (hi) for (let m = 0; m < 60; m++) if (m % 5) {
    const a = (m / 60) * PI * 2;
    B.box(0, [Math.sin(a) * 0.0305, Math.cos(a) * 0.0305, dialZ], [0.0006, 0.0018, 0.0004], { ...dark, rot: [0, 0, -a] });
  }
  const hand = (a, len, w, z, o) => B.box(0, [Math.sin(a) * len * 0.38, Math.cos(a) * len * 0.38, z], [w, len * 1.15, 0.0006], { ...o, rot: [0, 0, -a] });
  hand((10.17 / 12) * PI * 2, 0.019, 0.0024, dialZ + 0.0006, dark);
  hand((10 / 60) * PI * 2, 0.027, 0.0016, dialZ + 0.0012, dark);
  hand((7 / 12) * PI * 2, 0.016, 0.0012, dialZ + 0.0018, { region: WR.PLAIN, color: [0.75, 0.12, 0.08], mottle: 0.02 });
  latheZ(B, [[0, -dialZ - 0.0026], [0.0024, -dialZ - 0.0026], [0.0024, -dialZ], [0, -dialZ]], 0, 0, { ...chrome, rs: 10, sharp: true });
  // the bells: thin steel cups on posts at +-40 degrees from the top, their mouths toward the hammer
  const bellProf = [[0, 0.0178], [0.0088, 0.0156], [0.0148, 0.0102], [0.0178, 0.0036], [0.0186, 0.0004], [0.0204, 0.0], [0.0206, 0.0028], [0.0196, 0.0088], [0.0162, 0.0152], [0.0104, 0.0196], [0.0048, 0.0214], [0, 0.0216]];
  for (const s of [-1, 1]) {
    const a = s * 0.7;
    const dx = Math.sin(a), dy = Math.cos(a);
    const base = 0.0475;
    latheY(B, bellProf, 0, 0, { ...chrome, rs: R(hi, 24, 10), rot: [0, 0, -a], at: [dx * base, dy * base, -0.003] });
    B.seg(0, [dx * 0.04, dy * 0.04, -0.003], [dx * (base + 0.02), dy * (base + 0.02), -0.003], 0.0022, 0.0022, { ...chrome, rs: 6, hs: 1 });
    B.ellip(0, [dx * (base + 0.0222), dy * (base + 0.0222), -0.003], [0.0034, 0.0034, 0.0034], { ...chrome, ws: R(hi, 8, 6), hs: R(hi, 6, 4) });
  }
  // the hammer between the bells, on its spring arm out of the case top
  B.seg(0, [0, 0.0405, -0.004], [0, 0.0598, -0.004], 0.0013, 0.0011, { ...M.steel, color: [0.9, 0.88, 0.82], rs: 5, hs: 1 });
  B.ellip(0, [0, 0.0612, -0.004], [0.0042, 0.0036, 0.0036], { ...M.brass, ws: R(hi, 10, 6), hs: R(hi, 7, 4) });
  // carrying handle: a wire loop over the top, behind the hammer
  B.tube(0, [[-0.0255, 0.0352, -0.0125], [-0.0225, 0.0665, -0.0125], [0, 0.0805, -0.0125], [0.0225, 0.0665, -0.0125], [0.0255, 0.0352, -0.0125]], 0.0017, 0.0017, { ...chrome, rs: R(hi, 6, 4), ts: R(hi, 18, 9) });
  for (const s of [-1, 1]) B.ellip(0, [s * 0.0255, 0.0352, -0.0125], [0.0032, 0.0026, 0.0032], { ...chrome, ws: R(hi, 8, 6), hs: R(hi, 5, 4) });
  // splayed feet with ball ends
  for (const s of [-1, 1]) {
    const a = s * 0.62;
    B.seg(0, [Math.sin(a) * 0.036, -Math.cos(a) * 0.036, -0.002], [Math.sin(a) * 0.056, -Math.cos(a) * 0.056, -0.002], 0.0024, 0.0019, { ...chrome, rs: 6, hs: 1 });
    B.ellip(0, [Math.sin(a) * 0.0575, -Math.cos(a) * 0.0575, -0.002], [0.0052, 0.0052, 0.0052], { ...chrome, ws: R(hi, 10, 6), hs: R(hi, 7, 4) });
  }
  // on the back: the two winding keys (alarm and time), their stems out of the back plate, and the setting knob on top
  for (const s of [-1, 1]) {
    const x = s * 0.0158, y = -0.006;
    B.seg(0, [x, y, -0.0178], [x, y, -0.0262], 0.0018, 0.0018, { ...chrome, rs: 6, hs: 1 });
    profile(B, [[0.0262, -0.006], [0.0262, 0.006], [0.0288, 0.0105], [0.0318, 0.0105], [0.0322, 0.0], [0.0318, -0.0105], [0.0288, -0.0105]].map(([f, u]) => [f, u + y]), 0.0024, { ...chrome, bevel: 0.0004, curveSegs: 2, x });
  }
  B.seg(0, [0.0, 0.041, 0.0], [0.0, 0.0445, 0.0], 0.0034, 0.0034, { ...chrome, rs: 10, hs: 1 });
  P.meta.muzzle = null;
}

export default {
  id: ITEM.DECOY,
  build: buildDecoy,
  lay: [0, PI + 0.6, 0, 'YXZ'], // on the ground standing on its feet, its dial turned a little to one side
  // the alarm clock sits on the palm, the fingers cupped round its feet, its dial turned to the eye
  vm: { kind: 'throw', hip: [0.15, -0.115, -0.34, 0.15, 0.35, -0.1], rPose: 'clock', rGrip: { p: [0, -0.058, 0], q: handQ(1, [-0.71, 0, -0.71], [0, 1, 0]) }, sprint: SPRINT.throwable },
  // the alarm clock's feet down on the palm, the fingers cupped up behind its case
  poses: {
    clock: { curl: [[0.6, 0.68, 0.48], [0.56, 0.64, 0.44], [0.54, 0.71, 0.49], [0.34, 0.64, 1.2]], spread: 0.0, thumb: [[-0.22, -0.77, -0.6], [-0.16, -0.8, -0.57]], center: [-0.0115, -0.085, 0] },
  },
};
