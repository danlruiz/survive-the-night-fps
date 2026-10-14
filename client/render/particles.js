// The particles Effects (effects.js) draws: CPU-simulated sprites from one atlas, in two Points draws (additive and
// alpha), and the ground decals laid as instances (blood, acid, scorch marks).
import * as THREE from 'three';
import { getTexture } from './textures.js';

// atlas cells (3x3)
export const TEX = { FIRE: 0, SMOKE: 1, SPARK: 2, BLOOD: 3, GLOW: 4, MUZZLE: 5, DUST: 6 };
// added to a cell: the particle is lit like a body (by the sky's light level, or by the local flashlight when its beam
// is on it) instead of getting the smoke's night tint. Blood uses it: under that tint it glowed in the dark and went
// a dull grey-pink in the beam
export const LIT = 16;
const ATLAS_NAMES = ['fx_fire', 'fx_smoke', 'fx_spark', 'fx_blood', 'fx_glow', 'fx_muzzle', 'fx_smoke'];

export function buildAtlas() {
  const size = 768;
  const cell = size / 3;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ATLAS_NAMES.forEach((name, i) => {
    const x = (i % 3) * cell;
    const y = Math.floor(i / 3) * cell;
    let img = null;
    try {
      img = getTexture(name)?.image;
    } catch {
      img = null;
    }
    if (img && img.data && !(img instanceof HTMLCanvasElement)) {
      // DataTexture ({data,width,height}, row 0 = top): blit through a temp canvas
      const tc = document.createElement('canvas');
      tc.width = img.width;
      tc.height = img.height;
      const tctx = tc.getContext('2d');
      tctx.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height), 0, 0);
      img = tc;
    }
    if (img && (img.width || img.naturalWidth)) {
      const w = img.width || img.naturalWidth;
      const h = img.height || img.naturalHeight;
      // fx_fire is a 4x4 animated sheet: take frame 0 (top-left)
      if (name === 'fx_fire') ctx.drawImage(img, 0, 0, w / 4, h / 4, x, y, cell, cell);
      else ctx.drawImage(img, x, y, cell, cell);
    } else {
      const g = ctx.createRadialGradient(x + cell / 2, y + cell / 2, 0, x + cell / 2, y + cell / 2, cell / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

const PVERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute float aTex;
attribute float aRot;
varying vec4 vColor;
varying float vTex;
varying float vRot;
varying float vLit;
uniform float uScale;
uniform float uLit;
uniform vec4 uTorch;
uniform float uTorchDecay;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vTex = aTex;
  vRot = aRot;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = -mvPosition.z;
  // light on a LIT particle: the sky's level or the local flashlight's beam, whichever is the stronger (cone and
  // falloff as three's SpotLight; the lamp is taken to sit at the eye, looking straight ahead).
  // uTorch: strength, cos(cone), cos(inner cone), reach (m)
  float dist = max(0.3, length(mvPosition.xyz));
  float reach = clamp(1.0 - pow(dist / uTorch.w, 4.0), 0.0, 1.0);
  vLit = max(uLit, uTorch.x * smoothstep(uTorch.y, uTorch.z, depth / dist) * pow(dist, -uTorchDecay) * reach * reach);
  // particles right in front of the lens fade out instead of filling the screen
  vColor.a *= smoothstep(0.35, 1.6, depth);
  gl_PointSize = min(aSize * uScale / max(0.1, depth), 420.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const PFRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTint;
varying vec4 vColor;
varying float vTex;
varying float vRot;
varying float vLit;
#include <fog_pars_fragment>
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float c = cos(vRot); float s = sin(vRot);
  pc = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y) + 0.5;
  if (pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0) discard;
  float cell = floor(vTex + 0.5);
  float lit = step(${LIT - 0.5}, cell);
  cell -= ${LIT}.0 * lit;
  vec2 uv = (vec2(mod(cell, 3.0), 2.0 - floor(cell / 3.0)) + vec2(pc.x, 1.0 - pc.y)) / 3.0;
  vec4 t = texture2D(uAtlas, uv);
  vec4 col = t * vColor;
  col.rgb *= mix(uTint, vLit, lit);
  if (col.a < 0.004) discard;
  gl_FragColor = col;
  #include <fog_fragment>
}`;

export class ParticlePool {
  constructor(max, additive, atlas, scene) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.tex = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aTex = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [this.aPos, this.aSize, this.aColor, this.aTex, this.aRot];
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aTex', this.aTex);
    geo.setAttribute('aRot', this.aRot);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: PVERT,
      fragmentShader: PFRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas: { value: null }, uScale: { value: 600 }, uTint: { value: 1 }, uLit: { value: 1 }, uTorch: { value: new THREE.Vector4(0, 0.9, 1, 50) }, uTorchDecay: { value: 1 } }]),
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.material.uniforms.uAtlas.value = atlas;
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    this.geo = geo;
    scene.add(this.points);
  }

  // p: {x,y,z, vx,vy,vz, life, size, size1, r,g,b,a, r1,g1,b1,a1, grav, drag, tex, spin}
  // 20 positional arguments, then the optional spin. One number too many still runs: it takes the tex slot (0 = FIRE)
  // and the TEX.* constant lands in spin, so count them
  emit(x, y, z, vx, vy, vz, life, size, size1, r, g, b, a, r1, g1, b1, a1, grav, drag, tex, spin = 0) {
    let i;
    if (this.count < this.max) i = this.count++;
    else i = Math.floor(Math.random() * this.max);
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.size1[i] = size1;
    this.c0[i * 4] = r;
    this.c0[i * 4 + 1] = g;
    this.c0[i * 4 + 2] = b;
    this.c0[i * 4 + 3] = a;
    this.c1[i * 4] = r1;
    this.c1[i * 4 + 1] = g1;
    this.c1[i * 4 + 2] = b1;
    this.c1[i * 4 + 3] = a1;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.tex[i] = tex;
    this.rot[i] = Math.random() * 6.283;
    this.spin[i] = spin;
  }

  update(dt, pixelScale) {
    this.material.uniforms.uScale.value = pixelScale;
    let n = this.count;
    const P = this.pos;
    const V = this.vel;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        if (i !== n) this._move(n, i);
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      V[i * 3] *= d;
      V[i * 3 + 1] = V[i * 3 + 1] * d - this.grav[i] * dt;
      V[i * 3 + 2] *= d;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
    }
    this.count = n;
    const ap = this.aPos.array;
    const as = this.aSize.array;
    const ac = this.aColor.array;
    const at = this.aTex.array;
    const ar = this.aRot.array;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      ap[i * 3] = P[i * 3];
      ap[i * 3 + 1] = P[i * 3 + 1];
      ap[i * 3 + 2] = P[i * 3 + 2];
      as[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      for (let c = 0; c < 4; c++) ac[i * 4 + c] = this.c0[i * 4 + c] + (this.c1[i * 4 + c] - this.c0[i * 4 + c]) * t;
      at[i] = this.tex[i];
      ar[i] = this.rot[i];
    }
    this.geo.setDrawRange(0, n);
    if (n) {
      // (only the live particles go up to the card, not the whole pool)
      for (const a of this.attrs) {
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }

  _move(from, to) {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
    }
    for (let c = 0; c < 4; c++) {
      this.c0[to * 4 + c] = this.c0[from * 4 + c];
      this.c1[to * 4 + c] = this.c1[from * 4 + c];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.tex[to] = this.tex[from];
    this.rot[to] = this.rot[from];
    this.spin[to] = this.spin[from];
  }
}

export class DecalPool {
  constructor(scene, texName, max, color, opacity, blending = THREE.NormalBlending) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    let map = null;
    try {
      map = getTexture(texName);
    } catch {
      map = null;
    }
    const mat = new THREE.MeshLambertMaterial({ map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, blending });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.max = max;
    this.next = 0;
    this.ages = new Float32Array(max);
    this.scales = new Float32Array(max);
    this.data = new Float32Array(max * 4); // x,y,z,rot
    this.life = 60;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }
  add(x, y, z, size) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.ages[i] = 0;
    this.scales[i] = size;
    this.data[i * 4] = x;
    this.data[i * 4 + 1] = y;
    this.data[i * 4 + 2] = z;
    this.data[i * 4 + 3] = Math.random() * 6.283;
    this._write(i, 0.3);
  }
  _write(i, grow) {
    const s = this.scales[i] * grow;
    this._q.setFromAxisAngle(this._up, this.data[i * 4 + 3]);
    this._p.set(this.data[i * 4], this.data[i * 4 + 1], this.data[i * 4 + 2]);
    this._s.set(s, 1, s);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < this.mesh.count; i++) {
      const a = this.ages[i];
      if (a > this.life + 5) continue;
      this.ages[i] = a + dt;
      if (a < 0.6) this._write(i, 0.3 + (a / 0.6) * 0.7);
      else if (a > this.life) this._write(i, Math.max(0.001, 1 - (a - this.life) / 5));
    }
  }
}
