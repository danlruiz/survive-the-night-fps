// What trees shot down cost a frame (scripts/perf/trees-frame.js): the real forest of an island (render/foliage.js)
// at High quality, shadows on, seen from in among the trees, with the nearest n of them in front of the eye
//   scene=whole    standing, as no one has shot them
//   scene=gone     out of the forest altogether (what a shot tree came to before it could be shot again)
//   scene=cut      shot down to what stands of them, each at its own height (render/cuttrees.js)
//   scene=falling  shot that moment: what was above each coming down (render/fallingtrees.js), 0.5 s in
// It draws `frames` frames (each waited for on the card: a pixel read back) and puts the times, the draws and the
// triangles of a frame, and the JavaScript the trees took, in window.__clip.
import * as THREE from 'three';
import { worldFor } from '../../shared/worlds.js';
import { COL } from '../../shared/collision.js';
import { cutTree } from '../../shared/felling.js';
import { Foliage } from '../render/foliage.js';
import '../render/globals.js';

const Q = new URLSearchParams(location.search);
const SCENE = Q.get('scene') || 'cut';
const N = +(Q.get('n') || 40);
const FRAMES = +(Q.get('frames') || 120);
const SEED = +(Q.get('seed') || 1337);
let rs = 99;
Math.random = () => ((rs = (rs * 16807) % 2147483647) - 1) / 2147483646; // (the same heights and throws every run)

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9aa6b2);
scene.add(new THREE.HemisphereLight(0xdde4ee, 0x6a6256, 3.2));
const sun = new THREE.DirectionalLight(0xfff4e2, 3.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
scene.add(sun, sun.target);

const world = worldFor(SEED);
// the eye: by the tree with the most others within 25 m of it
const trees = [];
for (const c of world.staticGrid.query(0, 0, 2000, [])) if (c.flags & COL.TREE) trees.push(c);
let best = null;
let most = -1;
for (let k = 0; k < trees.length; k += 7) {
  const c = trees[k];
  const n = world.staticGrid.query(c.x, c.z, 25, []).filter((o) => o.flags & COL.TREE).length;
  if (n > most) [best, most] = [c, n];
}
// (out of their crowns: the nearest spot to it with no tree within 5 m)
let ex = best.x;
let ez = best.z;
search: for (let d = 2; d < 40; d += 1) {
  for (let a = 0; a < 6.28; a += 0.3) {
    const x = best.x + Math.cos(a) * d;
    const z = best.z + Math.sin(a) * d;
    if (!world.staticGrid.query(x, z, 5, []).some((o) => o.flags & COL.TREE)) {
      [ex, ez] = [x, z];
      break search;
    }
  }
}
const eye = new THREE.Vector3(ex, world.heightAt(ex, ez) + 1.6, ez);
// look the way most of them stand
const near = world.staticGrid.query(eye.x, eye.z, 40, []).filter((o) => o.flags & COL.TREE);
let ax = 0;
let az = 0;
for (const c of near) {
  const d = Math.hypot(c.x - eye.x, c.z - eye.z) || 1;
  ax += (c.x - eye.x) / d;
  az += (c.z - eye.z) / d;
}
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);
camera.position.copy(eye);
camera.lookAt(eye.x + ax, eye.y + 0.3 * Math.hypot(ax, az), eye.z + az);
sun.position.set(eye.x + 40, eye.y + 80, eye.z + 30);
sun.target.position.copy(eye);

const quality = { shadows: true, shadowDist: 120, foliageShadows: true, grass: 0, treeDist: 240 };
const foliage = new Foliage(scene, world, quality, 0);
// the nearest n in front of the eye
const fwd = new THREE.Vector3();
camera.getWorldDirection(fwd);
const shot = near
  .filter((c) => (c.x - eye.x) * fwd.x + (c.z - eye.z) * fwd.z > 0)
  .sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z))
  .slice(0, N);
for (const c of shot) {
  const cut = 0.4 + Math.random() * 5;
  if (SCENE === 'gone') foliage.fell(c.ti);
  else if (SCENE === 'cut' || SCENE === 'falling') {
    const top = c.y1 - c.y0 - 1;
    cutTree(world, c, cut);
    foliage.breakTree(c.ti, Math.random() * 6.28, cut, Infinity, SCENE === 'falling' ? 1 : 0, c.r);
    void top;
  }
}

const gl = renderer.getContext();
const px = new Uint8Array(4);
const ms = [];
const js = [];
let calls = 0;
let tris = 0;
let t = 0;
const frame = (dt) => {
  t += dt;
  const j0 = performance.now();
  foliage.update(camera.position, 600, t, null, camera);
  const j1 = performance.now();
  renderer.render(scene, camera);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [performance.now() - j0, j1 - j0];
};
// warm up (programs, buffers), and a falling tree half a second into its fall
const warm = SCENE === 'falling' ? 0.5 : 0.5;
for (let k = 0; k < 10; k++) frame(warm / 10);
const fall = foliage.falling;
const keepT = fall.active.map((f) => f.t);
for (let k = 0; k < FRAMES; k++) {
  if (SCENE === 'falling') fall.active.forEach((f, i) => (f.t = keepT[i])); // (held at that moment: every frame the same picture)
  const [a, b] = frame(SCENE === 'falling' ? 0 : 1 / 60);
  ms.push(a);
  js.push(b);
  calls = renderer.info.render.calls;
  tris = renderer.info.render.triangles;
}
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
const out = { scene: SCENE, n: shot.length, ms: med(ms), p95: p95(ms), js: med(js), calls, tris, cutDraws: foliage.cut.draws(), falling: fall.active.length };
document.getElementById('hud').textContent = JSON.stringify(out);
window.__clip = { text: JSON.stringify(out) };
