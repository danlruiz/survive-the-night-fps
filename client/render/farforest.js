// The far forest: every tree of a big world (the mainland's 2 km) past the trees' drawing distance, as one card each -
// a picture of a tree turned to face the eye (an impostor). The trees themselves (foliage.js) are drawn out to the
// quality's tree distance, which on the lower presets is well short of the haze, and on the mainland the woods are what
// the land is: without the cards the hills past that distance stand bare, and a view from high up shows no forest at
// all. One instanced draw for all of them; a card nearer than the trees' own distance is folded away in the vertex
// shader, and across the last metres of it the two cross-fade by a dither. No shadows: a card casts none and is in no
// shadow map.
// What it costs is the pixels the cards cover, many deep where a slope of woods faces the eye. So: a card is the
// tree's outline (eight corners round the spruce's cone or the birch's crown, not a rectangle with the corners cut
// away by the texture), and the instance buffer holds only the cards past the trees' reach and inside the far plane,
// nearest first (filled again when the eye has moved FILL_MOVE): the near cards write the depth first and the ones
// behind them are thrown away before they are shaded.
import * as THREE from 'three';
import { VEG } from './materials.js';

// which picture a tree variant (world.js TREE_TYPES) is drawn by: 0 a conifer, 1 a broadleaf (the dead have none)
const CARD = [0, 0, 0, -1, -1, 1, -1];
// how tall and wide each picture stands at scale 1 (m): about the trees' own size
const SIZE = [
  [20, 7.6],
  [14, 7.8],
];
// each picture's outline on the card (x across -0.5..0.5, y up 0..1), a convex ring of eight corners
const OUTLINE = [
  // the spruce: the trunk's foot, the lowest tier's wide boughs, up to the tip
  [[-0.05, 0], [0.05, 0], [0.5, 0.06], [0.5, 0.15], [0.08, 1], [-0.08, 1], [-0.5, 0.15], [-0.5, 0.06]],
  // the birch: the trunk's foot, then round the crown
  [[-0.04, 0], [0.04, 0], [0.5, 0.3], [0.5, 0.74], [0.2, 0.86], [-0.2, 0.86], [-0.5, 0.74], [-0.5, 0.3]],
];
const FILL_MOVE = 14; // m the eye moves before the cards are put in order again
const FAR = 1750; // past the camera's far plane on the mainland (game.js FAR_BIG): no card is drawn there
const BINS = 160;

let _tex = null;
// the two pictures, side by side: a dark spruce of tiers lit from its west side, a round birch crown on a pale trunk
function cardTexture() {
  if (_tex) return _tex;
  const W = 128;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W * 2;
  cv.height = H;
  const g = cv.getContext('2d');
  // the conifer
  {
    const cx = W / 2;
    g.fillStyle = '#3a2a1c';
    g.fillRect(cx - 3, H - 34, 6, 34);
    for (let t = 0; t < 7; t++) {
      const y0 = H - 22 - t * 32;
      const half = 58 - t * 7.5;
      const top = y0 - 58;
      const grad = g.createLinearGradient(cx - half, 0, cx + half, 0);
      grad.addColorStop(0, '#34472f');
      grad.addColorStop(0.45, '#233320');
      grad.addColorStop(1, '#141e12');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx, top);
      // (a ragged edge: the boughs)
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        g.lineTo(cx + half * u + (k % 2 ? 4 : -3), top + (y0 - top) * u + (k % 2 ? -3 : 3));
      }
      for (let k = 8; k >= 0; k--) {
        const u = k / 8;
        g.lineTo(cx - half * u - (k % 2 ? 4 : -3), top + (y0 - top) * u + (k % 2 ? -3 : 3));
      }
      g.closePath();
      g.fill();
    }
  }
  // the broadleaf
  {
    const cx = W + W / 2;
    g.fillStyle = '#cfc6b4';
    g.fillRect(cx - 3, H - 110, 6, 110);
    for (const [dx, dy, r, c] of [[0, -150, 52, '#38422a'], [-30, -122, 38, '#3f4a2c'], [30, -118, 38, '#2e3720'], [-14, -180, 34, '#4a5434'], [16, -96, 30, '#323b23']]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(cx + dx, H + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  _tex = new THREE.CanvasTexture(cv);
  _tex.colorSpace = THREE.SRGBColorSpace;
  _tex.generateMipmaps = true;
  _tex.minFilter = THREE.LinearMipmapLinearFilter;
  _tex.anisotropy = 4;
  return _tex;
}

export class FarForest {
  // trees: world.trees (Float32Array, stride 6: x, y, z, scale, rot, variant)
  constructor(scene, trees) {
    let n = 0;
    for (let i = 0; i < trees.length; i += 6) if (CARD[trees[i + 5] | 0] >= 0) n++;
    // every card: x, y, z and its scale, the scale negative for a broadleaf
    this.all = new Float32Array(n * 4);
    let k = 0;
    for (let i = 0; i < trees.length; i += 6) {
      const c = CARD[trees[i + 5] | 0];
      if (c < 0) continue;
      this.all.set([trees[i], trees[i + 1], trees[i + 2], c ? -trees[i + 3] : trees[i + 3]], k++ * 4);
    }
    this.n = n;
    this._d = new Float32Array(n);
    this._sel = new Int32Array(n);
    this._bins = new Int32Array(BINS + 1);
    this.lastX = 1e9;
    this.lastZ = 1e9;
    this.lastR = -1;
    const geo = new THREE.InstancedBufferGeometry();
    // (the corners as they stand; the shader takes the second picture's from 'alt')
    const pos = [], alt = [];
    for (let v = 0; v < 8; v++) {
      pos.push(OUTLINE[0][v][0], OUTLINE[0][v][1], 0);
      alt.push(OUTLINE[1][v][0], OUTLINE[1][v][1]);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('alt', new THREE.Float32BufferAttribute(alt, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(16).fill(0), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7]);
    this.at = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.at.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAt', this.at);
    geo.instanceCount = 0;
    // (it is never culled as a whole: the cards are spread over the whole map)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.near = { value: new THREE.Vector2(1e5, 1e5) };
    const mat = new THREE.MeshLambertMaterial({ map: cardTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    const near = this.near;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFarNear = near;
      shader.uniforms.uVegCam = VEG.uVegCam;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 iAt;
          attribute vec2 alt;
          uniform vec2 uFarNear;
          uniform vec3 uVegCam;
          varying float vFade;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec2 toCam = uVegCam.xz - iAt.xz;
          float camD = length(toCam);
          vec2 camDir = toCam / max(camD, 0.001);
          vec3 objectNormal = normalize(vec3(camDir.x, 0.25, camDir.y));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `float kind = iAt.w < 0.0 ? 1.0 : 0.0;
          float sc = abs(iAt.w);
          vec2 corner = kind > 0.5 ? alt : position.xy;
          vec2 sz = kind < 0.5 ? vec2(${SIZE[0][0].toFixed(1)}, ${SIZE[0][1].toFixed(1)}) : vec2(${SIZE[1][0].toFixed(1)}, ${SIZE[1][1].toFixed(1)});
          vec3 transformed = iAt.xyz + vec3(camDir.y, 0.0, -camDir.x) * corner.x * sz.y * sc + vec3(0.0, (corner.y * sz.x - 0.4) * sc, 0.0);
          vFade = smoothstep(uFarNear.x, uFarNear.y, camD);
          if (camD < uFarNear.x) transformed = iAt.xyz - vec3(0.0, 4000.0, 0.0);
          #ifdef USE_MAP
            vMapUv = vec2((corner.x + 0.5 + kind) * 0.5, corner.y);
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <alphatest_fragment>', 'if (vFade < 0.999 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > vFade) discard;\n#include <alphatest_fragment>');
    };
    mat.customProgramCacheKey = () => 'farforest-2';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'farforest';
    scene.add(mesh);
    this.mesh = mesh;
  }

  // the trees' own drawing distance this frame (m): the cards begin where they end. cx, cz: the eye
  update(treeR, cx = 0, cz = 0) {
    this.near.value.set(Math.max(0, treeR - 16), Math.max(1, treeR - 2));
    if (treeR === this.lastR && Math.hypot(cx - this.lastX, cz - this.lastZ) < FILL_MOVE) return;
    this.lastR = treeR;
    this.lastX = cx;
    this.lastZ = cz;
    // the cards that can be drawn before the eye moves FILL_MOVE again, nearest first (a counting sort into rings)
    const lo = Math.max(0, treeR - 16 - FILL_MOVE - 2);
    const lo2 = lo * lo;
    const hi2 = FAR * FAR;
    const all = this.all, d = this._d, sel = this._sel, bins = this._bins;
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      const dx = all[i * 4] - cx, dz = all[i * 4 + 2] - cz;
      const dd = dx * dx + dz * dz;
      if (dd < lo2 || dd > hi2) continue;
      sel[m] = i;
      d[m++] = Math.sqrt(dd);
    }
    bins.fill(0);
    const ring = (BINS - 1) / (FAR - lo);
    const binOf = (v) => Math.min(BINS - 1, Math.max(0, ((v - lo) * ring) | 0));
    for (let c = 0; c < m; c++) bins[binOf(d[c]) + 1]++;
    for (let b = 1; b <= BINS; b++) bins[b] += bins[b - 1];
    const out = this.at.array;
    for (let c = 0; c < m; c++) {
      const o = bins[binOf(d[c])]++ * 4;
      const s = sel[c] * 4;
      out[o] = all[s];
      out[o + 1] = all[s + 1];
      out[o + 2] = all[s + 2];
      out[o + 3] = all[s + 3];
    }
    this.at.clearUpdateRanges();
    this.at.addUpdateRange(0, m * 4);
    this.at.needsUpdate = true;
    this.mesh.geometry.instanceCount = m;
    this.mesh.visible = m > 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
