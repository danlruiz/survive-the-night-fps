// The loot glints (entities.js): one Points draw call for every unsearched container, car supply and schematic
// nearby, and a smaller, quieter sparkle on each loose item close by. Laid onto Entities as methods (addMethods).
import * as THREE from 'three';
import { ENT, dqpos } from '../../../shared/protocol.js';

const MAX_GLINTS = 96;
const ITEM_GLINT_RANGE = 13; // a loose item glints inside this distance (m), fading in over the last 3
const ITEM_GLINT_GAIN = 0.9; // ...at up to this brightness by day, against 1 for a container or a car supply
const ITEM_GLINT_SPACING = 0.75; // ...and no closer than this (m) to the next one

// soft star-shaped sparkle for unsearched containers ("loot glint")
function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,244,210,1)');
  grd.addColorStop(0.18, 'rgba(255,214,140,0.65)');
  grd.addColorStop(0.5, 'rgba(255,190,110,0.12)');
  grd.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[30, 2.4], [2.4, 30]]) {
    const lg = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    lg.addColorStop(0, 'rgba(255,240,200,0.9)');
    lg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = lg;
    g.fillRect(32 - w, 32 - h, w * 2, h * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const methods = {
  initGlints() {
    const gg = new THREE.BufferGeometry();
    this.glintPos = new Float32Array(MAX_GLINTS * 3);
    this.glintSize = new Float32Array(MAX_GLINTS);
    this.glintGain = new Float32Array(MAX_GLINTS); // brightness: the sprite is additive, so this is also how it fades
    gg.setAttribute('position', new THREE.BufferAttribute(this.glintPos, 3).setUsage(THREE.DynamicDrawUsage));
    gg.setAttribute('aSize', new THREE.BufferAttribute(this.glintSize, 1).setUsage(THREE.DynamicDrawUsage));
    gg.setAttribute('aGain', new THREE.BufferAttribute(this.glintGain, 1).setUsage(THREE.DynamicDrawUsage));
    gg.setDrawRange(0, 0);
    const gm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { map: { value: glintTexture() }, uScale: { value: 400 } },
      vertexShader: 'attribute float aSize; attribute float aGain; uniform float uScale; varying float vGain; void main(){ vGain = aGain; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying float vGain; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb * c.a * vGain, c.a); }',
    });
    this.glints = new THREE.Points(gg, gm);
    this.glints.frustumCulled = false;
    this.glints.renderOrder = 7;
  },

  // loot glints on unsearched containers nearby (none on what is outlined: game/highlight.js)
  updateGlints(time, camPos) {
    const g = this.g;
    const lit = g.highlight?.focus;
    let n = 0;
    for (const e of this.caches) {
      if (n >= MAX_GLINTS) break;
      const supply = e.kind === ENT.ITEM;
      if ((!supply && e.q[3] !== 0) || e === lit) continue;
      const x = dqpos(e.q[0]);
      const y = dqpos(e.q[1]);
      const z = dqpos(e.q[2]);
      const d = Math.hypot(x - camPos.x, z - camPos.z);
      const range = supply ? 48 : 26;
      if (d > range) continue;
      this.glintPos[n * 3] = x;
      this.glintPos[n * 3 + 1] = y + (supply ? 0.45 : 0.12);
      this.glintPos[n * 3 + 2] = z;
      const pulse = 0.55 + 0.45 * Math.sin(time * (supply ? 4 : 2.6) + e.id * 1.7);
      this.glintSize[n] = (supply ? 0.3 + 0.22 * pulse : 0.14 + 0.1 * pulse) * Math.min(1, (range - d) / 6) * (d < 3 ? 0.6 : 1);
      this.glintGain[n] = 1;
      n++;
    }
    // ...and a small, quiet one on every other loose item close by, each flaring on its own beat. Dimmer at night:
    // the night's exposure would turn it into a lamp, and it lights nothing
    const gain = ITEM_GLINT_GAIN * (1 - 0.6 * g.env.night);
    const pos = this.glintPos;
    const first = n * 3;
    for (const e of this.loose) {
      if (n >= MAX_GLINTS) break;
      if (e === lit) continue;
      const x = dqpos(e.q[0]);
      const z = dqpos(e.q[2]);
      const d2 = (x - camPos.x) * (x - camPos.x) + (z - camPos.z) * (z - camPos.z);
      if (d2 > ITEM_GLINT_RANGE * ITEM_GLINT_RANGE) continue; // too far to glint: nothing more is done for it
      const y = dqpos(e.q[1]) + 0.35; // up among the grass tips: the model lies under them
      // a heap gets one glint, not one per item: an item beside one that already glints goes without
      // (looking at the latest first: what fell together is listed together)
      let j = n * 3 - 3;
      for (; j >= first; j -= 3) {
        const dx = pos[j] - x;
        const dy = pos[j + 1] - y;
        const dz = pos[j + 2] - z;
        if (dx * dx + dy * dy + dz * dz < ITEM_GLINT_SPACING * ITEM_GLINT_SPACING) break;
      }
      if (j >= first) continue;
      const d = Math.sqrt(d2);
      let flare = 0.5 + 0.5 * Math.sin(time * 1.9 + e.id * 1.7);
      flare *= flare;
      const near = Math.min(1, 0.3 + d * 0.175); // underfoot the model is plain to see: full size from 4 m out
      pos[n * 3] = x;
      pos[n * 3 + 1] = y;
      pos[n * 3 + 2] = z;
      // past 6.5 m it holds its size on screen (it would be a pixel or two at 10 m) and only fades
      this.glintSize[n] = (0.2 + 0.07 * flare) * near * Math.max(1, d / 6.5);
      this.glintGain[n] = gain * (0.7 + 0.3 * flare) * near * Math.min(1, (ITEM_GLINT_RANGE - d) / 3);
      n++;
    }
    const gg = this.glints.geometry;
    gg.setDrawRange(0, n);
    if (n) {
      gg.attributes.position.needsUpdate = true;
      gg.attributes.aSize.needsUpdate = true;
      gg.attributes.aGain.needsUpdate = true;
    }
    this.glints.material.uniforms.uScale.value = (g.renderer.renderer.domElement.height * 0.5) / Math.tan((g.camera.fov * Math.PI) / 360);
  },
};
