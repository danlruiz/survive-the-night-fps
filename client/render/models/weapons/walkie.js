// Walkie-talkie (everyone's, weapon slot 6): a 13 cm olive handset held like a bottle (long axis +Y), the palm on its
// back (+X) and the fingers round its far edge (-Z), so its face (-X) - speaker grille, the little lit display - is
// turned to the eye. The push-to-talk key runs up its near edge (+Z) under the thumb; a stub antenna and the channel
// knob stand on top.
import { ITEM } from '../../../../shared/defs.js';
import { WR } from '../charTextures.js';
import { PI, latheY, boxR, M, R, gunGrip, SPRINT } from './parts.js';

function buildWalkie(P) {
  const hi = P.hi;
  const B = P.get('body');
  const olive = { region: WR.PLAIN, color: [0.27, 0.31, 0.21], mottle: 0.08 };
  const rubber = { ...M.polyDark, color: [0.55, 0.55, 0.55] };
  const X0 = -0.015, X1 = 0.015, Y0 = -0.07, Y1 = 0.058, Z0 = -0.028, Z1 = 0.028;
  // the case, rounded at its edges, with the battery's seam round its lower third
  B.box(0, [0, (Y0 + Y1) / 2, 0], [X1 - X0, Y1 - Y0, Z1 - Z0], { ...olive, round: 0.22, seg: R(hi, 3, 2) });
  boxR(B, X0 - 0.0004, X1 + 0.0004, -0.03, -0.028, Z0 - 0.0004, Z1 + 0.0004, { ...olive, color: [0.15, 0.17, 0.12] });
  // the face: a recessed speaker grille (its slots), the display above it, and a strip of three keys between them
  const fx = X0 - 0.0006;
  boxR(B, fx, fx + 0.002, 0.004, 0.036, -0.021, 0.021, { ...rubber, color: [0.32, 0.32, 0.32] });
  for (let k = 0; k < (hi ? 7 : 4); k++) {
    const y = 0.008 + (k * 0.024) / (hi ? 6 : 3);
    boxR(B, fx - 0.0004, fx + 0.001, y - 0.0011, y + 0.0011, -0.018, 0.018, { region: WR.PLAIN, color: 0x0b0b0b, mottle: 0 });
  }
  boxR(B, fx, fx + 0.0016, 0.041, 0.053, -0.017, 0.013, { region: WR.PLAIN, color: [0.12, 0.13, 0.1], mottle: 0.02 });
  boxR(B, fx - 0.0005, fx + 0.001, 0.0425, 0.0515, -0.0155, 0.0115, { region: WR.PLAIN, color: [0.5, 0.66, 0.36], mottle: 0.04 });
  for (const z of [-0.012, 0, 0.012]) boxR(B, fx - 0.0012, fx + 0.001, 0.0375, 0.0395, z - 0.004, z + 0.004, rubber);
  // the push-to-talk key up the near edge (under the thumb), ribbed; the orange call key below it
  boxR(B, -0.0085, 0.0085, 0.006, 0.04, Z1 - 0.001, Z1 + 0.0035, { ...rubber, round: 0.3, seg: 2 });
  if (hi) for (let k = 0; k < 5; k++) boxR(B, -0.008, 0.008, 0.01 + k * 0.0066, 0.0114 + k * 0.0066, Z1 + 0.003, Z1 + 0.0042, rubber);
  boxR(B, -0.005, 0.005, -0.004, 0.002, Z1 - 0.001, Z1 + 0.003, { region: WR.PLAIN, color: [0.85, 0.42, 0.1], mottle: 0.04 });
  // on top: the stub antenna at the back corner (a collar, then the rubber whip with a ball tip), the ribbed channel
  // knob at the far one, and the red transmit lamp between them
  const rs = R(hi, 12, 7);
  latheY(B, [[0, Y1 - 0.002], [0.0072, Y1 - 0.002], [0.0072, Y1 + 0.008], [0.0055, Y1 + 0.012], [0, Y1 + 0.012]], 0.003, 0.016, { ...rubber, rs, sharp: true });
  latheY(B, [[0, Y1 + 0.011], [0.0048, Y1 + 0.011], [0.0042, Y1 + 0.06], [0.0034, Y1 + 0.076], [0, Y1 + 0.08]], 0.003, 0.016, { ...rubber, rs });
  latheY(B, [[0, Y1 - 0.002], [0.0068, Y1 - 0.002], [0.0068, Y1 + 0.011], [0.006, Y1 + 0.013], [0, Y1 + 0.013]], 0.0, -0.014, { ...rubber, rs: R(hi, 14, 8), sharp: true });
  if (hi) for (let k = 0; k < 10; k++) {
    const a = (k / 10) * PI * 2;
    B.box(0, [Math.cos(a) * 0.0069, Y1 + 0.0055, -0.014 + Math.sin(a) * 0.0069], [0.0012, 0.011, 0.0012], { ...rubber, rot: [0, -a, 0] });
  }
  B.ellip(0, [-0.004, Y1 + 0.001, 0.0005], [0.0022, 0.0018, 0.0022], { region: WR.PLAIN, color: [0.75, 0.08, 0.05], mottle: 0, ws: 8, hs: 5 });
  P.meta.muzzle = null;
}

export default {
  id: ITEM.WALKIE,
  build: buildWalkie,
  // the walkie-talkie up in front of the chest, its face to the eye; keyed (talk: added as the key goes down), it
  // comes up and in toward the mouth
  // (held low on the case, below the grille, so the fingers leave the face clear)
  vm: { kind: 'radio', hip: [0.12, -0.12, -0.3, 0.12, 0.7, 0.0], rPose: 'radioHold', rGrip: { p: [0, -0.04, 0], q: gunGrip(0.0) }, talk: [-0.04, 0.05, 0.06, 0.2, 0.15, 0], sprint: SPRINT.throwable },
  poses: {
    radioHold: { curl: [[0.31, 1.47, 0.22], [0.31, 1.58, 0.22], [0.38, 1.45, 0.26], [0.41, 1.04, 0.42]], spread: 0, thumb: [[0.18, -0.71, -0.68], [0, -0.71, -0.71]], center: [-0.0329, -0.083, 0] }, // the walkie-talkie, held by the case below the grille
  },
};
