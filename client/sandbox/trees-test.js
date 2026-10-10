// Look-dev for trees coming down (render/fallingtrees.js): one tree of a variant, felled, shot or blown apart, posed
// at a moment of its fall. URL params:
//   v=<variant index> (default 0)   how=fell|shot|blast (default shot)   cut=<m up its foot> (default 2)
//   pieces=<2|3> (blast)   t=<s after the event> (default 1)   yaw, pitch (deg), dist: the camera about the tree
//   seed=<n>: the blast's random throws
import * as THREE from 'three';
import { getTreeVariants } from '../render/models/vegetation.js';
import { VEG } from '../render/materials.js';
import { FallingTrees } from '../render/fallingtrees.js';

const Q = new URLSearchParams(location.search);
const V = +(Q.get('v') || 0);
const HOW = Q.get('how') || 'shot';
const CUT = +(Q.get('cut') || 2);
const PIECES = HOW === 'shot' ? 1 : +(Q.get('pieces') || 3);
const T = +(Q.get('t') ?? 1);
const deg = (k, d) => THREE.MathUtils.degToRad(+(Q.get(k) ?? d));
// (the blast's throws: Math.random, seeded so a sheet of moments is one blast)
let seed = +(Q.get('seed') || 7);
Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9aa6b2);
scene.fog = new THREE.FogExp2(0x9aa6b2, 0.004);
scene.add(new THREE.HemisphereLight(0xdde4ee, 0x6a6256, 3.2));
const sun = new THREE.DirectionalLight(0xfff4e2, 3.6);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 200 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x5d5a3e }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const variants = getTreeVariants();
const scale = 1;
const data = new Float32Array([0, 0, 0, scale, 0.4, V]);
const mats = new Float32Array(16);
new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4), new THREE.Vector3(scale, scale, scale)).toArray(mats);
const trees = { data, mats, variants, castDist: 50 };
const world = { heightAt: () => 0 };
const falling = new FallingTrees(scene, world, trees);
// cmp=1: the same tree standing beside it, drawn as the forest draws it
if (Q.get('cmp') === '1') {
  for (const part of variants[V].parts) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, 1);
    im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(8, 0, -4));
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }
}
const H = variants[V].height * scale;

// it goes toward -X (yaw PI/2): seen side on from +Z
const yaw = Math.PI / 2;
let cuts = [CUT];
if (HOW === 'fell') falling.fell(0, yaw, 0, 0);
else cuts = falling.breakTree(0, yaw, CUT, PIECES, 0.35 * scale, 0, 0);
for (let t = 0; t < T; t += 1 / 60) falling.update(Math.min(1 / 60, T - t));

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
// near=1: close on where it broke
const NEAR = Q.get('near') === '1';
const dist = +(Q.get('dist') || (NEAR ? 7 : H * 1.5));
const cy = deg('yaw', NEAR ? 25 : 0);
const cp = deg('pitch', NEAR ? 12 : 8);
const target = NEAR ? new THREE.Vector3(-1, Math.min(CUT, 3), 0) : new THREE.Vector3(-H * 0.35, H * 0.3, 0);
camera.position.set(target.x + Math.sin(cy) * Math.cos(cp) * dist, target.y + Math.sin(cp) * dist, target.z + Math.cos(cy) * Math.cos(cp) * dist);
camera.lookAt(target);
VEG.uVegCam.value.copy(camera.position);
// (the textures come in after the first frames)
let frames = 0;
(function draw() {
  renderer.render(scene, camera);
  if (++frames < 90) requestAnimationFrame(draw);
})();
document.getElementById('hud').textContent = `${variants[V].name} - ${HOW}${HOW === 'blast' ? ` x${PIECES}` : ''} at ${cuts.map((c) => c.toFixed(1)).join(', ')} m - t ${T.toFixed(2)} s`;
window.__clip = { text: `${variants[V].name} H ${H.toFixed(1)} cuts ${cuts.map((c) => c.toFixed(2)).join(',')} active ${falling.active.length}` };
