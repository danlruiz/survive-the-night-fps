// The flammer (ZTYPE.FLAMMER): its model and how it moves (gathered by zombies/index.js).
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, mulberry32, fbm3, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { blister, strap, onSurf } from '../monsters.js';
import { surfPoint } from '../humans.js';
import { humanP } from '../characters/skeleton.js';
import { buildingFar, onHead, standardHumanoid } from './helpers.js';

const PI = Math.PI;

export const type = ZTYPE.FLAMMER;

/**
 * The flammer: a firefighter who went into the fire and never came out. The turnout coat and trousers, tan gone black
 * with soot where the fire licked them, the reflective bands round the coat smoked grey; the helmet with its long tail
 * over the neck and the brass shield on the front; the air cylinder still strapped to its back. Under it all the body
 * is charred, and embers glow in the cracks of the chest where the coat hangs open. (The flames on it are the burning
 * status' own, which the server keeps up on a flammer: Entities.updateBurning.)
 */
function buildFlammer() {
  const P = humanP({ hipY: 0.95, thighLen: 0.44, shinLen: 0.43, spineLen: 0.14, chestLen: 0.21, neckOff: 0.19, headR: 0.105, shoulderW: 0.19, uarmLen: 0.3, farmLen: 0.27, handLen: 0.18 });
  const far = buildingFar();
  const soot = color(0x17120e), char = color(0x0c0807);
  // soot up from the hems and in blotches, as the fire left it
  const sooty = (seed, k = 0.75) => (p, n, c) => {
    const m = fbm3(p.x * 7, p.y * 7, p.z * 7, 2, seed);
    if (m > 0.5) c.lerp(soot, Math.min(1, (m - 0.5) * 3) * k);
    if (p.y < 0.5) c.multiplyScalar(0.55 + 0.9 * p.y);
  };
  const charred = (p, n, c) => {
    const m = fbm3(p.x * 18, p.y * 18, p.z * 18, 2, 61);
    c.lerp(char, m > 0.55 ? 0.75 : 0.35);
  };
  const coatC = 0x8a7448;
  const L = {
    dead: true, skin: 0x3a2a22, eye: 0xffa040, eyeGlow: 0.9, noBrows: true,
    face: { sockets: 1.6, gaunt: 0.6, rot: 0.9, w: 1.05, jaw: 1.2, chin: 1.1, lips: 0.1, nose: 0.4 },
    gaunt: 0.3, build: { w: 1.12, d: 1.1, arm: 1.05, leg: 1.04, neck: 1.15 },
    top: { kind: 'coat', color: coatC, region: CR.CANVAS, sleeves: 'long', open: 0.3, under: { color: 0x2a2620, region: CR.COTTON }, collar: 'high', hem: 0.18, tear: 0.06, tint: sooty(13) },
    vest: { kind: 'hivis', color: coatC, open: 0.3, tint: sooty(14) },
    pants: { color: 0x7d6a44, region: CR.CANVAS, tear: 0.05, tearY: 0.1, tint: sooty(15, 0.85) },
    shoes: { kind: 'boot', color: 0x16130f }, hair: null,
    hat: { kind: 'hardhat', color: 0x1a1816 },
    gear: { gloves: true },
    jawScale: 1.2, fang: true, missingTeeth: 0x35, curl: 0.55,
    blood: [], dirt: { y0: 0.5, k: 0.8 }, skinTint: charred, headTint: onHead(charred),
  };
  const mb = new MeshBuilder();
  const built = standardHumanoid(mb, P, L);
  const { T } = built;
  const yC = P.chestY, ySh = P.shoulderY, yS = P.spineY;
  // the helmet's tail, down over the back of the neck, and the shield on its front (on the head bone: it nods with it)
  const hr = P.headR;
  mb.box('head', [0, hr * 1.12, hr * 1.38], [hr * 1.9, 0.012, hr * 1.1], { round: 0.6, seg: 2, rot: [0.42, 0, 0], color: 0x161412, region: CR.PLAIN, mottle: 0.1, blood: false });
  mb.box('head', [0, hr * 1.72, -hr * 1.02], [hr * 0.62, hr * 0.7, 0.012], { round: 0.4, seg: 2, rot: [-0.35, 0, 0], color: 0xa8843a, region: CR.PLAIN, mottle: 0.2, blood: false });
  // the air cylinder on its back, in its harness: a strap over each shoulder
  const back = (y, out) => surfPoint(T, PI, y, out);
  const r = 0.072;
  const a = back(yS + 0.02, 0.035 + r), b = back(ySh - 0.02, 0.035 + r);
  onSurf(mb, T, () => {
    mb.seg('root', a, b, r, r, { rs: far ? 8 : 12, caps: 2, capScale: 0.45, color: 0xb8b2a2, region: CR.PLAIN, mottle: 0.15, blood: false, tint: sooty(16, 0.6) });
    if (!far) mb.seg('root', [b[0], b[1] + r * 0.4, b[2]], [b[0], b[1] + r * 0.4 + 0.05, b[2]], 0.018, 0.016, { rs: 6, caps: 2, color: 0x5a5a58, region: CR.PLAIN, blood: false });
  });
  if (!far) for (const sd of [-1, 1]) strap(mb, T, [[PI - sd * 0.5, yS + 0.04, 0.03], [PI - sd * 0.7, ySh + 0.02, 0.03], [-sd * 0.85, ySh - 0.02, 0.03], [-sd * 0.55, yC - 0.05, 0.03], [-sd * 0.5, yS + 0.02, 0.03]], 0.04, 0.006, { color: 0x1e1b17, region: CR.LEATHER });
  // embers in the charred chest where the coat hangs open
  if (!far) {
    const rnd = mulberry32(1515);
    for (let i = 0; i < 7; i++) blister(mb, T, (rnd() - 0.5) * 0.5, yS + rnd() * (yC + 0.1 - yS), 0.008 + rnd() * 0.01, 0.5, { color: 0xff7a1a, glow: 0.85, rim: 0x2a0a02, ws: 6, hs: 4 });
  }
  return { mb, P, A: { jawHang: 0.2 } };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  // a heavy, deliberate trudge under the weight of the gear, arms hanging forward: it walks on through what burns
  walkLean: -0.25, runLean: -0.4, cycleWalk: 1.4, cycleRun: 2.2, walkStride: 0.38, walkKnee: 0.5, runStride: 0.55, runKnee: 0.9,
  limp: 0.2, sway: 0.9, armWalk: 0.35, armDroop: 0.12, armSwing: 0.25, armRun: 0.6, elbow: 0.35, headPitch: 0.1, headTilt: 0.15, jaw: 0.25,
  idleLean: -0.2, shoulderRoll: 0.1,
};

export { buildFlammer as build };
