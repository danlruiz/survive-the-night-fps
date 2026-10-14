// The vegetation's shading: every tree, bush, fern and grass card sways in the wind, cross-fades between its tree LODs,
// thins out with distance and lets light through its thin outer shell, all in its material (materials.js holds the
// shared instances: MAT.pine, MAT.grass ...). Felled, blown-apart and shot-down trees get their own twins here.
import * as THREE from 'three';
import { getTexture, tiledTexture } from './textures.js';

// Every vegetation geometry carries `aVeg` (vec4):
//   trees : x crown occlusion, y branch weight (0 trunk .. 1 tip), z branch phase, w needle flutter weight
//   plants: x occlusion, y flex (0 anchored .. 1 tip), z phase, w dryness
// Shared uniforms (Foliage keeps them current). uVegCam is the MAIN camera position: LOD cross-fades and
// grass thinning must agree in the shadow passes, where cameraPosition is the light's camera.
export const VEG = {
  uVegCam: { value: new THREE.Vector3() },
  uTreeLod: { value: new THREE.Vector2(53, 67) },
  uGrassFade: { value: new THREE.Vector2(16, 34) },
  uGrassNear: { value: new THREE.Vector2(12, 22) },
  tGroundNoise: { value: null },
};

/** Tileable value noise, RGBA = 4 / 8 / 16 / 32 cells per repeat (linear data, shared with the terrain). */
export function groundNoiseTexture() {
  if (VEG.tGroundNoise.value) return VEG.tGroundNoise.value;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const hash = (x, y, c) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(c + 11, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  [4, 8, 16, 32].forEach((cells, c) => {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, fy = (y / N) * cells;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const x1 = (ix + 1) % cells, y1 = (iy + 1) % cells;
        const v = (hash(ix, iy, c) * (1 - tx) + hash(x1, iy, c) * tx) * (1 - ty) + (hash(ix, y1, c) * (1 - tx) + hash(x1, y1, c) * tx) * ty;
        data[(y * N + x) * 4 + c] = Math.round(v * 255);
      }
    }
  });
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  VEG.tGroundNoise.value = t;
  return t;
}

// large-scale ground colour drift, shared by the terrain splat and the grass cards (cards sit in their layer)
export const GROUND_MACRO_GLSL = /* glsl */ `
uniform sampler2D tGroundNoise;
vec3 groundMacro(vec2 xz) {
  vec4 a = textureLod(tGroundNoise, xz * (1.0 / 180.0) + 0.37, 0.0);
  float b = textureLod(tGroundNoise, xz * (1.0 / 46.0) + 0.61, 0.0).g;
  float m = a.r * 0.6 + b * 0.4;
  return (0.8 + 0.4 * m) * mix(vec3(1.06, 1.0, 0.86), vec3(0.93, 1.0, 1.07), smoothstep(0.25, 0.75, a.b));
}
float groundDry(vec2 xz) {
  return smoothstep(0.52, 0.78, textureLod(tGroundNoise, xz * (1.0 / 97.0) + 0.21, 0.0).a);
}
`;

const VEG_VERT_PARS = /* glsl */ `
uniform vec4 uWind;
uniform vec3 uVegCam;
uniform vec2 uTreeLod;
uniform vec2 uGrassFade;
uniform vec2 uGrassNear;
attribute vec4 aVeg;
varying float vVegFade;
varying float vVegSolid;
#ifndef VEG_DEPTH
  varying vec4 vVeg;
  varying vec3 vVegTint;
#endif
#ifdef VEG_GRASS
  ${GROUND_MACRO_GLSL}
#endif
bool vegDrop = false;
vec3 vegNW;
float vegHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// wind pressure: steady part + gust fronts rolling downwind (visible as waves over canopy and meadows)
float vegGust(vec2 xz) {
  vec2 dir = uWind.zw;
  float along = dot(xz, dir);
  float across = dot(xz, vec2(-dir.y, dir.x));
  float t = uWind.x;
  float w1 = sin(along * 0.018 - t * 0.9 + sin(across * 0.011 + t * 0.07) * 2.1) * 0.5 + 0.5;
  float w2 = sin(along * 0.043 - t * 1.7 + sin(across * 0.029) * 1.3) * 0.5 + 0.5;
  return uWind.y * (0.65 + 0.35 * w2 + 1.2 * w1 * w1 * (0.55 + 0.45 * w2));
}
// trunk bend (grows with height^2) + branch bob/swing (own phase per branch) + needle flutter
vec3 vegTreeWind(vec3 root, vec3 p, float y, vec4 w, vec3 n, float seed) {
  vec3 dir = vec3(uWind.z, 0.0, uWind.w);
  vec3 side = vec3(-uWind.w, 0.0, uWind.z);
  float g = vegGust(root.xz);
  float t = uWind.x;
  float fT = 1.5 + seed * 0.3;
  float sway = sin(t * fT + seed * 6.2831) * 0.6 + sin(t * fT * 2.37 + seed * 17.0) * 0.25;
  float amp = 0.0085 * g * (0.55 + 0.45 * g) * y * y * 0.05;
  vec3 off = dir * (amp * (1.0 + 0.45 * sway)) + side * (amp * 0.35 * sin(t * fT * 0.71 + seed * 3.0));
  off.y -= dot(off, off) * 0.5 / max(y, 1.0);
  float bw = w.y * w.y;
  float ph = w.z * 6.2831 + seed * 3.0;
  float fBr = 1.6 + w.z * 1.1;
  float gl = vegGust(p.xz);
  float brAmp = 0.25 * (1.0 - exp(-gl * gl * 1.5));
  off.y += sin(t * fBr + ph) * brAmp * 0.8 * bw;
  off += dir * (brAmp * (0.6 + 0.4 * sin(t * fBr * 1.3 + ph * 1.7)) * bw);
  off += side * (brAmp * 0.35 * sin(t * fBr * 0.8 + ph * 2.3) * bw);
  float fl = sin(t * 9.0 + dot(p, vec3(1.7, 2.3, 1.3)) + ph) * 0.6 + sin(t * 14.3 + dot(p.xz, vec2(3.1, -2.2))) * 0.4;
  off += n * (fl * max(w.w, 0.0) * (0.008 + 0.03 * min(gl * gl, 1.5)));
  return off;
}
// small plants: whole plant bends downwind (tips move, base anchored; saturates - a gust lays grass over,
// never flat) + leaf flutter
vec3 vegPlantWind(vec3 root, float flex, float stiff, vec3 n, float ph, float h) {
  vec2 dir = uWind.zw;
  float g = vegGust(root.xz);
  float t = uWind.x;
  float fx = mix(1.0, 0.15, stiff);
  // h: height of this vertex above the root (m)
  float b = (1.0 - exp(-(0.3 + 0.7 * g) * g * 1.3 * fx)) * flex * h;
  float fl = (sin(t * 7.3 + root.x * 0.9 + root.z * 1.3 + ph * 6.0) * 0.5 + sin(t * 11.1 + root.z * 1.7 + root.x * 0.4 + ph * 11.0) * 0.3) * min(0.25 + g, 1.2) * fx * flex * h;
  vec3 off = vec3(dir.x, 0.0, dir.y) * (b * 0.6) + vec3(-dir.y, 0.0, dir.x) * (fl * 0.12);
  off.y -= b * b / max(h, 0.05) * 0.3;
  off += n * sin(t * (5.0 + ph * 4.0) + ph * 31.0) * (0.004 + 0.02 * min(g, 1.0)) * flex;
  return off;
}
`;

const VEG_VERT_MAIN = /* glsl */ `
#include <begin_vertex>
{
  mat4 vegM = modelMatrix;
  #ifdef USE_INSTANCING
    vegM = modelMatrix * instanceMatrix;
  #endif
  mat3 vm3 = mat3(vegM);
  vec3 vegRoot = vegM[3].xyz;
  vec3 vsc2 = vec3(dot(vm3[0], vm3[0]), dot(vm3[1], vm3[1]), dot(vm3[2], vm3[2]));
  float vegSeed = vegHash(vegRoot.xz + 0.37);
  float vegD = distance(vegRoot.xz, uVegCam.xz);
  vegNW = normalize(vm3 * normal);
  vec3 vegOff = vec3(0.0);
  float vegFade = 0.0;
  #ifdef VEG_TREE
    vegOff = vegTreeWind(vegRoot, vegRoot + vm3 * transformed, max(transformed.y, 0.0) * sqrt(vsc2.y), aVeg, vegNW, vegSeed);
    vegFade = smoothstep(uTreeLod.x, uTreeLod.y, vegD);
  #endif
  #ifdef VEG_PLANT
    vegOff = vegPlantWind(vegRoot, aVeg.y, VEG_STIFF, vegNW, aVeg.z, max(transformed.y, 0.0) * sqrt(vsc2.y));
  #endif
  #ifdef VEG_GRASS
    // distance thinning: instances drop out by seed, the survivors widen to keep the cover closed
    float th = smoothstep(uGrassFade.x, uGrassFade.y, vegD);
    vegDrop = vegSeed < th * 0.92 || vegD > uGrassFade.y;
    #ifdef VEG_GRASS_NEAR
      // the near infill (a second clump in every cell, so the cover is closed at your feet) drops out by seed
      // across uGrassNear, where the clumps already overlap from the eye's low angle
      vegDrop = vegDrop || vegSeed < smoothstep(uGrassNear.x, uGrassNear.y, vegD) || vegD > uGrassNear.y;
    #endif
    transformed.xz *= 1.0 + 1.1 * th;
    vegOff = vegPlantWind(vegRoot, aVeg.y, 0.0, vegNW, aVeg.z + vegSeed, max(transformed.y, 0.0) * sqrt(vsc2.y));
  #endif
  transformed += (transpose(vm3) * vegOff) / vsc2;
  vVegFade = vegFade;
  // near LOD beyond the band / far LOD inside it: collapse. Shadows always come from the far LOD (all casters,
  // no fade), so it also holds the near casters - those only exist for the shadow passes.
  #if defined( VEG_LOD_OUT ) && !defined( VEG_DEPTH )
    if (vegFade >= 1.0) vegDrop = true;
  #endif
  #if defined( VEG_LOD_IN ) && !defined( VEG_DEPTH )
    if (vegFade <= 0.0) vegDrop = true;
  #endif
  vVegSolid = step(aVeg.w, -0.5);
  #ifndef VEG_DEPTH
    // (solid bark geometry: no translucency, no dryness)
    vVeg = vec4(aVeg.x, vegFade, smoothstep(0.25, 0.9, aVeg.x) * (1.0 - vVegSolid), max(aVeg.w, 0.0));
    float vbr = mix(0.8, 1.12, fract(vegSeed * 5.13));
    float vhue = fract(vegSeed * 17.7) - 0.5;
    vVegTint = vbr * vec3(1.0 + vhue * 0.12, 1.0, 1.0 - vhue * 0.18);
    #ifdef VEG_OPAQUE
      vVegTint = mix(vec3(1.0), vVegTint, 0.5);
    #endif
    #ifdef VEG_GRASS
      vVegTint = mix(vec3(1.0), vVegTint, 0.6) * groundMacro(vegRoot.xz);
      // drier swathes of meadow (the terrain's grass layer uses the same field)
      vVeg.w = clamp(aVeg.w + groundDry(vegRoot.xz) * 0.45 * aVeg.y, 0.0, 1.0);
    #endif
  #endif
}
`;

const VEG_FRAG_PARS = /* glsl */ `
varying vec4 vVeg;
varying vec3 vVegTint;
uniform vec4 uVegTrans;
`;

// complementary screen-space dither between the near and far tree LOD
const VEG_LOD_DITHER = /* glsl */ `
#if defined( VEG_LOD_OUT ) || defined( VEG_LOD_IN )
{
  float vegIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  #ifdef VEG_LOD_OUT
    if (vegIgn < vVegFade) discard;
  #else
    if (vegIgn >= vVegFade) discard;
  #endif
}
#endif
`;

// a felled tree going: the same screen-space dither, by its own uVegGone (0 there .. 1 gone). A piece of a tree
// blown apart (VEG_BAND) is the slice of it between uVegBand.x and .y up its own model (vVegY: before the wind); a
// tree shot down to what stands of it (VEG_TOP) is cut off at its instance's aVegTop up its model
const VEG_FELL_PARS = /* glsl */ `
#ifdef VEG_FELL
  uniform float uVegGone;
#endif
#if defined( VEG_BAND ) || defined( VEG_TOP )
  varying float vVegY;
#endif
#ifdef VEG_BAND
  uniform vec2 uVegBand;
#endif
#ifdef VEG_TOP
  varying float vVegTop;
#endif
`;
const VEG_FELL_DITHER = /* glsl */ `
#ifdef VEG_FELL
  if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < uVegGone) discard;
#endif
#ifdef VEG_BAND
  if (vVegY < uVegBand.x || vVegY > uVegBand.y) discard;
#endif
#ifdef VEG_TOP
  if (vVegY > vVegTop) discard;
#endif
`;

// thin needles / blades: light from behind the card + a forward-scattering lobe towards the viewer, only
// on the outer shell (vVeg.z ~ crown depth) so backlit crowns get a glowing rim and a dark core
const VEG_TRANSLUCENCY = /* glsl */ `
void RE_Direct_Veg( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Lambert( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float back = saturate( -dot( geometryNormal, directLight.direction ) );
  float fwd = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 8.0 );
  vec3 fwdCol = directLight.color;
  #if NUM_SUN_LIGHTS > 0
    // the sun through the thin outer shell: the shadow map sees a solid crown, the rim still transmits
    if ( dot( directLight.direction, sunLights[ 0 ].direction ) > 0.9999 ) fwdCol = mix( directLight.color, sunLights[ 0 ].color, 0.55 * vVeg.z );
  #endif
  reflectedLight.directDiffuse += BRDF_Lambert( material.diffuseColor ) * uVegTrans.rgb * ( directLight.color * back * 0.5 + fwdCol * fwd * uVegTrans.w * vVeg.z ) * vVeg.z;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Veg
`;

// far-LOD trunks share their tree's card material: aVeg.w = -1 marks solid, vertex-coloured bark
const VEG_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = vVegSolid > 0.5 ? vec4( 1.0 ) : texture2D( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

// alpha boost with the mip level so distant cards don't dissolve
const VEG_MIP_ALPHA = /* glsl */ `
#if defined( USE_MAP ) && defined( USE_ALPHATEST )
{
  vec2 tsz = vec2( textureSize( map, 0 ) );
  vec2 mdx = dFdx( vMapUv * tsz ), mdy = dFdy( vMapUv * tsz );
  float mlod = max( 0.0, 0.5 * log2( max( dot( mdx, mdx ), dot( mdy, mdy ) ) ) );
  diffuseColor.a *= 1.0 + mlod * 0.3;
}
#endif
#include <alphatest_fragment>
`;

const VEG_CUT_VERT_PARS = /* glsl */ `
#if defined( VEG_BAND ) || defined( VEG_TOP )
  varying float vVegY;
#endif
#ifdef VEG_TOP
  attribute float aVegTop;
  varying float vVegTop;
#endif
`;
const VEG_CUT_VERT = /* glsl */ `
#if defined( VEG_BAND ) || defined( VEG_TOP )
  vVegY = position.y;
#endif
#ifdef VEG_TOP
  vVegTop = aVegTop;
#endif
`;

function vegVertex(sh) {
  Object.assign(sh.uniforms, VEG);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${VEG_VERT_PARS}\n${VEG_CUT_VERT_PARS}`)
    .replace('#include <begin_vertex>', VEG_VERT_MAIN)
    .replace('#include <project_vertex>', `#include <project_vertex>\nif (vegDrop) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);\n${VEG_CUT_VERT}`);
  return sh;
}

/** Shadow-map twin of a vegetation material: same wind and cut-outs, so shadows match. */
function vegDepthMaterial(defines, gone = null, band = null) {
  const m = new THREE.MeshDepthMaterial();
  m.defines = { ...defines, VEG_DEPTH: '' };
  m.onBeforeCompile = (sh) => {
    vegVertex(sh);
    if (gone) sh.uniforms.uVegGone = gone;
    if (band) sh.uniforms.uVegBand = band;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vVegFade;\nvarying float vVegSolid;\n${VEG_FELL_PARS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${VEG_FELL_DITHER}`)
      .replace('#include <map_fragment>', VEG_MAP)
      .replace('#include <alphatest_fragment>', VEG_MIP_ALPHA);
  };
  m.customProgramCacheKey = () => 'veg-depth';
  return m;
}

/**
 * Vegetation material (Lambert). kind: 'tree' | 'trunk' | 'plant' | 'grass'. lod: 0 near tree LOD (dithers out
 * across uTreeLod), 1 far tree LOD (dithers in). trans: [r, g, b, forward lobe] translucency (null = opaque).
 * near: the grass's near infill (fades out across uGrassNear). gone: a felled tree's { value } (0 .. 1), which
 * dithers it out, shadow and all.
 */
export function vegMaterial(o, { kind, trans = null, stiff = 0.5, near = false }, lod = -1, gone = null, band = null, top = false) {
  const opaque = kind === 'trunk';
  const mat = new THREE.MeshLambertMaterial(opaque ? o : { alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, ...o });
  const defines = {};
  if (kind === 'tree' || kind === 'trunk') defines.VEG_TREE = '';
  if (kind === 'plant') defines.VEG_PLANT = '';
  if (kind === 'grass') defines.VEG_GRASS = '';
  if (near) defines.VEG_GRASS_NEAR = '';
  if (opaque) defines.VEG_OPAQUE = '';
  if (trans) defines.VEG_TRANS = ''; // (program cache key: the translucency code is spliced in)
  if (lod === 0) defines.VEG_LOD_OUT = '';
  if (lod === 1) defines.VEG_LOD_IN = '';
  if (gone) defines.VEG_FELL = '';
  if (band) defines.VEG_BAND = '';
  if (top) defines.VEG_TOP = '';
  defines.VEG_STIFF = stiff.toFixed(3);
  mat.defines = defines;
  if (kind === 'grass') groundNoiseTexture();
  const uTrans = { value: new THREE.Vector4(...(trans || [0, 0, 0, 0])) };
  mat.userData.vegTrans = uTrans;
  mat.onBeforeCompile = (sh) => {
    vegVertex(sh);
    sh.uniforms.uVegTrans = uTrans;
    if (gone) sh.uniforms.uVegGone = gone;
    if (band) sh.uniforms.uVegBand = band;
    if (kind === 'tree' && !opaque) {
      // look shadows up slightly outside the crown shell: the outer cards aren't shadowed by the (coarser,
      // far-LOD) caster around them
      sh.vertexShader = sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#ifdef USE_SHADOWMAP\nworldPosition.xyz += vegNW * 0.5;\n#endif');
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${VEG_FRAG_PARS}\nvarying float vVegFade;\nvarying float vVegSolid;\n${VEG_FELL_PARS}`)
      .replace('#include <map_fragment>', VEG_MAP)
      .replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\n${trans ? VEG_TRANSLUCENCY : ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${VEG_LOD_DITHER}\n${VEG_FELL_DITHER}`)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <alphatest_fragment>', VEG_MIP_ALPHA)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= vVegTint * mix( 1.0, vVeg.x, 0.5 );
        #if defined( VEG_GRASS ) || defined( VEG_PLANT )
          // dry straw tips / dead fronds: toward a luminance-matched pale straw
          diffuseColor.rgb = mix( diffuseColor.rgb, dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) * vec3( 1.55, 1.2, 0.62 ), vVeg.w );
        #endif`,
      )
      // occlusion darkens the sky light; thin needles / blades of the outer shell also pass sky light through
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix( 0.4, 1.0, vVeg.x ) * ( 1.0 + 0.35 * vVeg.z * step( 0.001, uVegTrans.w ) );');
  };
  mat.customProgramCacheKey = () => 'veg';
  mat.userData.depth = vegDepthMaterial(defines, gone, band);
  return mat;
}

const TREE_TRANS = [0.9, 1.0, 0.42, 12.0];
const VEG_MATS = {
  tree_bark: [() => ({ map: tiledTexture('bark') }), { kind: 'trunk' }],
  tree_bark_birch: [() => ({ map: tiledTexture('bark_birch') }), { kind: 'trunk' }],
  tree_bark_dead: [() => ({ map: tiledTexture('bark_dead') }), { kind: 'trunk' }],
  tree_charred: [() => ({ map: tiledTexture('charred') }), { kind: 'trunk' }],
  pine: [() => ({ map: getTexture('pine') }), { kind: 'tree', trans: TREE_TRANS }],
  leaves: [() => ({ map: getTexture('leaves') }), { kind: 'tree', trans: [1.0, 0.8, 0.4, 10.0] }],
};
export const vegDef = (name) => [VEG_MATS[name][0](), VEG_MATS[name][1]];
const vegNoLod = new Map();
/** Twin of a tree material without the LOD fade (variants drawn with one LOD at every distance). */
export function vegStaticMaterial(mat) {
  let m = vegNoLod.get(mat);
  if (!m) {
    m = vegMaterial(...vegDef(mat.name), -1);
    m.name = mat.name + '_static';
    vegNoLod.set(mat, m);
  }
  return m;
}
/**
 * A felled tree's own twin of a tree material (near or far LOD): drawn at every distance, and dithered out by
 * `gone` ({ value } 0 .. 1), shadow and all. A new one every call - each falling tree fades on its own. band
 * ({ value: Vector2 }): the slice of the model up its height that is drawn (a piece of a tree blown apart).
 */
export function vegFellMaterial(mat, gone, band) {
  const m = vegMaterial(...vegDef(mat.name.replace(/_(far|static)$/, '')), -1, gone, band);
  m.name = mat.name + '_fell';
  return m;
}
const vegCut = new Map();
/**
 * Twin of a tree material (near LOD) for trees shot down to what stands of them (render/cuttrees.js): drawn at every
 * distance, and cut off, shadow and all, at the height up its model in each instance's aVegTop.
 */
export function vegCutMaterial(mat) {
  let m = vegCut.get(mat);
  if (!m) {
    m = vegMaterial(...vegDef(mat.name.replace(/_(far|static)$/, '')), -1, null, null, true);
    m.name = mat.name + '_cut';
    vegCut.set(mat, m);
  }
  return m;
}
const vegFar = new Map();
/** Far-LOD twin of a tree material (dithers in where the near one dithers out). */
export function vegFarMaterial(mat) {
  let m = vegFar.get(mat);
  if (!m) {
    m = vegMaterial(...vegDef(mat.name), 1);
    m.name = mat.name + '_far';
    vegFar.set(mat, m);
  }
  return m;
}

