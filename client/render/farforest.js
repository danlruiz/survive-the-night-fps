// The far forest: every tree of a big world (the mainland's 2 km) past the trees' drawing distance, as one card each -
// a picture of a tree turned to face the eye (an impostor). The trees themselves (foliage.js) are drawn out to the
// quality's tree distance, which on the lower presets is well short of the haze, and on the mainland the woods are what
// the land is: without the cards the hills past that distance stand bare, and a view from high up shows no forest at
// all. One instanced draw for all of them (two triangles a tree, its place and size a vec4 of one buffer filled once);
// a card nearer than the trees' own distance is folded away in the vertex shader, and across the last metres of it the
// two cross-fade by a dither. No shadows: a card casts none and is in no shadow map.
import * as THREE from 'three';
import { VEG } from './materials.js';

// which picture a tree variant (world.js TREE_TYPES) is drawn by: 0 a conifer, 1 a broadleaf (the dead have none)
const CARD = [0, 0, 0, -1, -1, 1, -1];
// how tall and wide each picture stands at scale 1 (m): about the trees' own size
const SIZE = [
  [20, 7.6],
  [14, 7.8],
];

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
    const at = new Float32Array(n * 4);
    const kind = new Float32Array(n);
    let k = 0;
    for (let i = 0; i < trees.length; i += 6) {
      const c = CARD[trees[i + 5] | 0];
      if (c < 0) continue;
      at.set([trees[i], trees[i + 1], trees[i + 2], trees[i + 3]], k * 4);
      kind[k++] = c;
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('iAt', new THREE.InstancedBufferAttribute(at, 4));
    geo.setAttribute('iKind', new THREE.InstancedBufferAttribute(kind, 1));
    geo.instanceCount = n;
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
          attribute float iKind;
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
          `vec2 sz = iKind < 0.5 ? vec2(${SIZE[0][0].toFixed(1)}, ${SIZE[0][1].toFixed(1)}) : vec2(${SIZE[1][0].toFixed(1)}, ${SIZE[1][1].toFixed(1)});
          vec3 transformed = iAt.xyz + vec3(camDir.y, 0.0, -camDir.x) * position.x * sz.y * iAt.w + vec3(0.0, (position.y * sz.x - 0.4) * iAt.w, 0.0);
          vFade = smoothstep(uFarNear.x, uFarNear.y, camD);
          if (camD < uFarNear.x) transformed = iAt.xyz - vec3(0.0, 4000.0, 0.0);`,
        )
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x = (vMapUv.x + iKind) * 0.5;\n#endif');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <alphatest_fragment>', 'if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > vFade) discard;\n#include <alphatest_fragment>');
    };
    mat.customProgramCacheKey = () => 'farforest-1';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'farforest';
    scene.add(mesh);
    this.mesh = mesh;
  }

  // the trees' own drawing distance this frame (m): the cards begin where they end
  update(treeR) {
    this.near.value.set(Math.max(0, treeR - 16), Math.max(1, treeR - 2));
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
