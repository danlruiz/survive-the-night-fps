// Procedural canvas textures (no asset files). All textures are generated lazily and cached.
//
// Conventions:
//  - Image row 0 is the TOP of the texture (v = 1), like a canvas. flipY is applied on upload.
//  - Building / prop surface textures are designed for METER UVs: each texture covers a known world size
//    (see TEXTURE_WORLD_SIZE); materials.js sets texture.repeat = 1 / worldSize.
//  - Surface generators may also return `height` (Float32Array, 0..1, same size) and `relief` (the depth in
//    meters that 0..1 spans): getNormalMap(name) bakes the tangent-space normal map from it.
//  - Weathered surfaces keep their top layer OUT of the texture: RGB is the clean / bare material and the
//    alpha channel a tileable "wear" detail field. materials.js lays the paint, rust or moss over it in the
//    shader, driven by world-space noise, so no wall repeats its damage (see `surfacePatch` there).
//  - Ground textures are 512px and seamlessly tileable (periodic noise + wrapped drawing).
//  - fx_* sprites are white/grey on transparent (RGB is never black under transparent pixels -> premultiply-friendly).
//  - decal_* textures carry their own colour + alpha.
// The generators are in textures/, a file a family (what they paint with is textures/kit.js); this file is the
// registry: it bakes a texture on its first use, keeps it, and hands out copies with their own repeat.
import * as THREE from 'three';
import { SURFACE_GEN } from './textures/surfaces.js';
import { PROP_GEN } from './textures/props.js';
import { VEGETATION_GEN } from './textures/vegetation.js';
import { GROUND_GEN } from './textures/ground.js';
import { FX_GEN } from './textures/fx.js';
import { atlasTexture } from './textures/atlas.js';
import { CITY_GEN } from './textures/city.js';

export { ATLAS, atlasUV } from './textures/atlas.js';
export { CITY_ATLAS, cityUV } from './textures/city.js';

// name -> generator: () => { canvas } | raw pixels { w, h, d }, with what `finish` and getNormalMap read off it
const GEN = { ...SURFACE_GEN, ...PROP_GEN, ...VEGETATION_GEN, ...GROUND_GEN, ...FX_GEN, atlas: atlasTexture, ...CITY_GEN };

// ------------------------------------------------------------------ registry
const cache = new Map();
const derived = new Map();
const heights = new Map(); // height fields waiting to be baked into normal maps
const allTextures = new Set();
let maxAniso = 4;

// world size (meters) covered by one repeat of each surface texture (used by materials.js)
export const TEXTURE_WORLD_SIZE = {
  planks: 2, barn: 2, clapboard: 2, logwall: 2, concrete: 3, brick: 2, shingles: 2, tin: 2, rust: 1.5, chrome: 1,
  metal: 1.5, stone: 2, dockwood: 2, glass: 2, carglass: 2, cabin: 1, sash: 1, door: [1, 2.1], hay: 1, canvas: 2, olive: 2, wood: 1,
  bark: [1, 2], bark_birch: [1, 2], bark_dead: [1, 2], rock: 2, tire: 1, paint: 1.5, carpaint: 2, cloth: 0.6,
  burlap: 0.6, bone: 0.3, charred: 1, skin: 0.6, mattress: 1, plastic: 1, pumpkin: 1, ash: 1, cardboard: 0.6,
  ground_grass: 4, ground_dirt: 4, ground_forest: 4, ground_road: 4, ground_asphalt: 4, ground_mud: 4, ground_sand: 4,
  aircraft: 4,
  // the city's (citykit.js)
  plaster: 4, lino: 2.4, ceiling: 4.8, roofing: 4, roadpaint: 6,
};

function registerTex(t) {
  allTextures.add(t);
  t.anisotropy = t.userData.noAniso ? 1 : maxAniso;
  return t;
}

function repeated(t, key, rx, ry) {
  if (rx === undefined) return t;
  if (ry === undefined) ry = rx;
  key = `${key}|${rx}|${ry}`;
  let d = derived.get(key);
  if (!d) {
    d = t.clone();
    d.repeat.set(rx, ry);
    d.needsUpdate = true;
    registerTex(d);
    derived.set(key, d);
  }
  return d;
}

/** Cached texture by name. Optional rx/ry return a cached clone with that repeat (shares the GPU image). */
export function getTexture(name, rx, ry) {
  let t = cache.get(name);
  if (!t) {
    const gen = GEN[name];
    if (!gen) throw new Error(`textures: unknown texture '${name}'`);
    const out = gen();
    if (out.height) heights.set(name, { h: out.height, w: out.canvas ? out.canvas.width : out.w, ht: out.canvas ? out.canvas.height : out.h, relief: out.relief ?? 0.01 });
    t = finish(out, name);
    cache.set(name, t);
  }
  return repeated(t, name, rx, ry);
}

/**
 * Tangent-space normal map baked from the height field of a surface texture, or null when its generator
 * leaves none. Same repeat convention as getTexture.
 */
export function getNormalMap(name, rx, ry) {
  const key = `${name}#n`;
  let t = cache.get(key);
  if (t === undefined) {
    getTexture(name);
    const hf = heights.get(name);
    heights.delete(name);
    t = hf ? finish(normalFromHeight(hf, TEXTURE_WORLD_SIZE[name] ?? 1), key) : null;
    cache.set(key, t);
  }
  return t && repeated(t, key, rx, ry);
}

// slopes are true to scale: `relief` meters of depth over a texture covering `size` meters
function normalFromHeight({ h, w, ht, relief }, size) {
  const [sx, sy] = Array.isArray(size) ? size : [size, size];
  const kx = (relief * w) / sx / 2, ky = (relief * ht) / sy / 2;
  const d = new Uint8ClampedArray(w * ht * 4);
  for (let y = 0, i = 0; y < ht; y++) {
    const up = ((y + ht - 1) % ht) * w, dn = ((y + 1) % ht) * w, row = y * w;
    for (let x = 0; x < w; x++, i += 4) {
      // image rows run down while v runs up
      const nx = (h[row + ((x + w - 1) % w)] - h[row + ((x + 1) % w)]) * kx;
      const ny = (h[dn + x] - h[up + x]) * ky;
      const inv = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      d[i] = 127.5 + nx * inv;
      d[i + 1] = 127.5 + ny * inv;
      d[i + 2] = 127.5 + inv;
      d[i + 3] = 255;
    }
  }
  return { w, h: ht, d, linear: true };
}

export function setMaxAnisotropy(n) {
  maxAniso = Math.max(1, n | 0);
  for (const t of allTextures) {
    const a = t.userData.noAniso ? 1 : maxAniso;
    if (t.anisotropy !== a) {
      t.anisotropy = a;
      t.needsUpdate = true;
    }
  }
}

export const TEXTURE_NAMES = () => Object.keys(GEN);
// Every texture made ahead of its first use, one a step (a generator: Game.loadWorldSoon gives the page a frame between
// them). The ground's first: the terrain wants them first. (each is some 50 to 500 ms of drawing)
export function* textureSteps() {
  const names = Object.keys(GEN).sort((a, b) => b.startsWith('ground_') - a.startsWith('ground_'));
  for (const name of names) {
    if (!cache.has(name)) {
      getTexture(name);
      yield;
    }
  }
}

function finish(out, name) {
  let t;
  if (out.canvas) {
    t = new THREE.CanvasTexture(out.canvas);
  } else {
    t = new THREE.DataTexture(out.d, out.w, out.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.flipY = true;
    t.unpackAlignment = 4;
  }
  t.name = name;
  t.colorSpace = out.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  const clampTex = out.clamp;
  t.wrapS = t.wrapT = clampTex ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (out.wrapT === 'repeat') t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.userData.noAniso = !!out.noAniso;
  t.needsUpdate = true;
  return registerTex(t);
}
