// How the shared surface materials are shaded over their tiles (materials.js builds them with these): the weathered
// coat of paint, rust or moss and the grime laid over a building's walls and a painted prop, and a vehicle's glass.
import * as THREE from 'three';
import { tiledTexture, tiledNormalMap } from './textures.js';
import { groundNoiseTexture } from './vegshading.js';

// ------------------------------------------------ weathered surfaces
// Building surfaces and painted / galvanised props are shaded in three steps on top of their tile:
//  1. a coat (paint, rust or moss) laid over the tile's bare material wherever the tile's wear field (its
//     alpha) plus slow noise over the surface crosses a threshold, so damage never repeats with the tile;
//  2. broad tonal drift, run-off streaks down walls and damp stains from the same noise;
//  3. static world only: mud splashed up from the ground and contact darkening (aGround).
// The slow noise is world-space and static-world only; anything that moves shows its tile's own wear.
//
// tone: tonal drift (+-), streak: run-off streaks, stain: [r, g, b, amount] tint of the damp patches,
// dust: [r, g, b, amount] film settling on upward faces, gloss: sky reflected at grazing angles (paint,
// plating, glass; rust and moss kill it), splash: how high the mud reaches (m). layer: the coat -
//   kind 'paint' | 'rust' | 'moss'; col / col2 (sRGB: paint + its chalked tint, fresh rust + dark scale,
//   moss + dry lichen); cover: how much of the surface the coat takes (about -1 none .. 1 all);
//   detail / macro: weight of the tile's wear field and of the slow noise; soft: edge width;
//   ground / run / up: bias near the ground, down the run-off streaks and on upward faces;
//   shade [gain, power]: how much of the tile's own shading shows through; fx: lifted paint edge / rust
//   bleed / moss opacity; tint: static world multiplies the coat by a per-building colour (aTint).
const RUST = { kind: 'rust', col: 0x9c6830, col2: 0x4a3020 };
const SURF = {
  planks: { tone: 0.2, streak: 0.22, stain: [0.66, 0.72, 0.52, 0.55] },
  barn: { tone: 0.16, streak: 0.16, stain: [0.74, 0.74, 0.66, 0.4], layer: { kind: 'paint', col: 0x7a3229, col2: 0xd4bdb0, cover: 0.42, detail: 2.2, macro: 1.8, soft: 0.14, ground: -0.45, run: -0.2, shade: [4.6, 0.75], fx: 0.12, tint: true } },
  clapboard: { tone: 0.12, streak: 0.14, stain: [0.72, 0.76, 0.62, 0.5], layer: { kind: 'paint', col: 0xcfccc0, col2: 0xf0e8d4, cover: 0.42, detail: 2.0, macro: 1.9, soft: 0.03, ground: -0.5, run: -0.25, shade: [3.6, 0.42], fx: 0.4, tint: true } },
  logwall: { tone: 0.2, streak: 0.2, stain: [0.7, 0.74, 0.58, 0.5] },
  concrete: { tone: 0.16, streak: 0.3, stain: [0.66, 0.68, 0.6, 0.6] },
  concrete_pale: { tone: 0.12, streak: 0.22, stain: [0.78, 0.79, 0.74, 0.45] },
  brick: { tone: 0.16, streak: 0.14, stain: [0.62, 0.6, 0.58, 0.55] },
  shingles: { tone: 0.2, streak: 0, stain: [0.8, 0.84, 0.72, 0.4], layer: { kind: 'moss', col: 0x4a5a26, col2: 0x7e7c5c, cover: -0.42, detail: 1.3, macro: 3.2, soft: 0.16, ground: 0, run: 0, up: 0, shade: [5, 0.5], fx: 0.85 } },
  tin: { tone: 0.14, streak: 0.14, gloss: 0.3, stain: [0.8, 0.78, 0.72, 0.4], layer: { ...RUST, cover: -0.42, detail: 1.2, macro: 2.6, soft: 0.05, ground: 0.45, run: 0.3, shade: [3.2, 0.8], fx: 0.6 } },
  tin_rust: { tone: 0.14, streak: 0.14, gloss: 0.25, stain: [0.8, 0.76, 0.7, 0.4], layer: { ...RUST, cover: 0.1, detail: 1.2, macro: 2.8, soft: 0.05, ground: 0.45, run: 0.35, shade: [3.2, 0.8], fx: 0.7 } },
  rust: { tone: 0.22, streak: 0.1 },
  metal: { tone: 0.16, streak: 0.16, layer: { ...RUST, cover: -0.5, detail: 1.4, macro: 2.4, soft: 0.04, ground: 0.4, run: 0.25, shade: [5, 0.6], fx: 0.6 } },
  stone: { tone: 0.2, streak: 0.16, stain: [0.72, 0.76, 0.62, 0.5], layer: { kind: 'moss', col: 0x45562a, col2: 0x70745a, cover: -0.4, detail: 1.4, macro: 2.6, soft: 0.14, ground: 0.5, run: 0.1, up: 0.35, shade: [4, 0.5], fx: 0.8 } },
  dockwood: { tone: 0.2, streak: 0.1, stain: [0.6, 0.72, 0.5, 0.6] },
  charred: { tone: 0.2, streak: 0.1 },
  olive: { tone: 0.12, streak: 0.12, layer: { ...RUST, cover: -0.55, detail: 1.4, macro: 2.0, soft: 0.04, ground: 0.4, run: 0.2, shade: [4.5, 0.6], fx: 0.5 } },
  paint: { tone: 0.12, streak: 0.12, gloss: 0.5, splash: 0.5, dust: [0.36, 0.33, 0.28, 0.22], layer: { ...RUST, cover: -0.42, detail: 1.6, macro: 1.8, soft: 0.04, ground: 0.55, run: 0.25, up: 0.08, shade: [1.1, 0.6], fx: 0.4 } },
  carpaint: { tone: 0.2, streak: 0.24, gloss: 1.2, splash: 0.4, stain: [0.74, 0.7, 0.62, 0.5], dust: [0.4, 0.37, 0.31, 0.3], layer: { ...RUST, cover: -0.44, detail: 1.6, macro: 1.7, soft: 0.035, ground: 0.6, run: 0.2, up: 0.14, shade: [1.1, 0.6], fx: 0.4 } },
  chrome: { tone: 0.1, streak: 0.08, gloss: 3.2, splash: 0.4, dust: [0.3, 0.28, 0.24, 0.2], layer: { ...RUST, cover: -0.5, detail: 1.6, macro: 2.0, soft: 0.05, ground: 0.4, run: 0.1, shade: [1.6, 0.6], fx: 0.4 } },
  glass: { tone: 0.1, streak: 0.2, gloss: 2.4, splash: 0.5, dust: [0.3, 0.28, 0.24, 0.3] },
};
const LAYER_KINDS = { paint: 0, rust: 1, moss: 2 };

const SURF_VERT_PARS = /* glsl */ `
varying vec3 vGPos;
varying vec3 vGNrm;
#ifdef SURF_STATIC
  attribute float aGround;
  varying float vGround;
#endif
#ifdef SURF_TINT_ATTR
  attribute vec3 aTint;
  varying vec3 vTint;
#endif
`;
const SURF_VERT_MAIN = /* glsl */ `
vGPos = position;
#ifdef SURF_STATIC
  vGround = aGround;
#endif
#ifdef SURF_TINT_ATTR
  vTint = aTint;
#endif
`;
const SURF_FRAG_PARS = /* glsl */ `
varying vec3 vGPos;
varying vec3 vGNrm;
uniform sampler2D tSurfNoise;
uniform vec4 uSurfA;
uniform vec4 uSurfStain;
uniform vec4 uSurfDust;
#ifdef SURF_STATIC
  varying float vGround;
  float grimeNoise( float x ) {
    float i = floor( x ), f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( fract( sin( i * 127.1 ) * 43758.5453 ), fract( sin( ( i + 1.0 ) * 127.1 ) * 43758.5453 ), f );
  }
#endif
#ifdef SURF_TINT_ATTR
  varying vec3 vTint;
#endif
#ifdef SURF_LAYER
  uniform vec4 uLayerA;
  uniform vec4 uLayerB;
  uniform vec4 uLayerS;
  uniform vec3 uLayerCol;
  uniform vec3 uLayerCol2;
#endif
`;
const SURF_FRAG_MAIN = /* glsl */ `
diffuseColor.a = opacity;
float surfGloss = uSurfA.z;
{
  vec3 gn = normalize( vGNrm );
  float hl = length( gn.xz );
  float wall = step( 0.35, hl );
  // walls: along the wall and up it; floors and shallow roofs: the ground plane
  vec2 sp = wall > 0.5 ? vec2( dot( vGPos.xz, vec2( -gn.z, gn.x ) ) / hl, vGPos.y ) : vGPos.xz;
  float up = max( gn.y, 0.0 );
  #ifdef SURF_STATIC
    vec4 nA = texture2D( tSurfNoise, sp * 0.043 );
    vec4 nB = texture2D( tSurfNoise, sp * 0.137 + 0.37 );
    float run = smoothstep( 0.45, 0.85, texture2D( tSurfNoise, vec2( sp.x * 0.61, sp.y * 0.021 ) + 0.11 ).g ) * wall;
    float g0 = 1.0 - smoothstep( 0.0, uSurfA.w * 1.5, vGround );
  #else
    // things that move keep to their tile's own wear: noise in their object space would be the same on every
    // copy, and in world space it would crawl over them
    vec4 nA = vec4( 0.5 ), nB = vec4( 0.5 );
    float run = 0.0, g0 = 0.0;
  #endif
  float macro = nA.r * 0.45 + nA.g * 0.3 + nB.r * 0.25;
  float mid = nA.b * 0.5 + nB.g * 0.5;
  #ifdef SURF_LAYER
  {
    float t = uLayerA.x + ( sampledDiffuseColor.a - 0.5 ) * uLayerA.y + ( macro - 0.5 + ( mid - 0.5 ) * 0.5 ) * uLayerA.z + g0 * uLayerB.x + run * uLayerB.y + up * uLayerB.z;
    float mask = smoothstep( -uLayerA.w, uLayerA.w, t );
    float shade = pow( dot( sampledDiffuseColor.rgb, vec3( 0.3333 ) ) * uLayerS.x, uLayerS.y );
    vec3 lc = uLayerCol;
    #ifdef SURF_TINT_ATTR
      lc *= vTint;
    #endif
    #if SURF_LAYER == 0
      // paint: chalks and yellows where it is about to let go, a thin shadow under its lifted edge
      lc = mix( lc, lc * uLayerCol2, 1.0 - smoothstep( 0.0, 0.3, t ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, lc * shade, mask ) * ( 1.0 - mask * ( 1.0 - mask ) * 4.0 * uLayerS.z );
    #elif SURF_LAYER == 1
      // rust: fresh orange at its edge and in the speckle, dark scale inside, bleeding into what surrounds it
      float bleed = smoothstep( -uLayerA.w * 4.0 - 0.06, 0.0, t ) * ( 1.0 - mask );
      diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.86, 0.6, 0.4 ), bleed * uLayerS.z );
      lc = mix( uLayerCol2, lc, clamp( ( 1.0 - smoothstep( 0.0, 0.45, t ) ) * 0.75 + ( nB.a - 0.5 ) * 0.9 + ( sampledDiffuseColor.a - 0.7 ) * 1.4 + 0.12, 0.0, 1.0 ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, lc * shade, mask );
      surfGloss *= 1.0 - mask;
    #else
      lc = mix( uLayerCol2, lc, smoothstep( 0.3, 0.7, sampledDiffuseColor.a * 0.6 + nB.a * 0.4 ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, lc * shade, mask * uLayerS.z );
      surfGloss *= 1.0 - mask;
    #endif
  }
  #endif
  diffuseColor.rgb *= ( 1.0 + ( macro - 0.5 ) * 2.0 * uSurfA.x ) * ( 1.0 - run * uSurfA.y );
  float damp = smoothstep( 0.5, 0.78, nA.g * 0.6 + nB.r * 0.4 + g0 * 0.2 );
  diffuseColor.rgb *= mix( vec3( 1.0 ), uSurfStain.rgb, damp * uSurfStain.a );
  float film = up * up * uSurfDust.a * ( 0.4 + 1.2 * mid );
  diffuseColor.rgb = mix( diffuseColor.rgb, uSurfDust.rgb, film );
  surfGloss *= 1.0 - film;
  #ifdef SURF_STATIC
  {
    // walls only (floors and roofs face up or down): mud splashed up by rain, darker right at the ground
    float side = 1.0 - smoothstep( 0.5, 0.85, abs( gn.y ) );
    float s = vGPos.x + vGPos.z;
    float edge = grimeNoise( s * 2.3 ) * 0.28 + grimeNoise( s * 9.1 ) * 0.1;
    float splash = ( 1.0 - smoothstep( 0.0, uSurfA.w, vGround - edge * uSurfA.w * 1.25 ) ) * side;
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.5, 0.43, 0.34 ), splash * 0.8 );
    diffuseColor.rgb *= mix( 1.0, mix( 0.5, 1.0, smoothstep( -0.05, 0.35, vGround ) ), side );
    surfGloss *= 1.0 - splash;
  }
  #endif
}
`;
// the sky (the hemisphere light) mirrored in a glossy surface, strongest at grazing angles
const SURF_FRAG_GLOSS = /* glsl */ `
#if NUM_HEMI_LIGHTS > 0
{
  // the face normal, not the normal map: corrugations and laps would alias into sparkle at a distance
  vec3 vd = normalize( vViewPosition );
  float fres = 0.05 + 0.95 * pow( 1.0 - saturate( dot( nonPerturbedNormal, vd ) ), 4.0 );
  outgoingLight += getHemisphereLightIrradiance( hemisphereLights[ 0 ], reflect( -vd, nonPerturbedNormal ) ) * ( RECIPROCAL_PI * surfGloss * fres );
}
#endif
`;

function surfacePatch(mat, name, isStatic = false) {
  const s = SURF[name];
  const L = s.layer;
  const tinted = isStatic && !!L?.tint;
  const defines = { ...mat.defines };
  if (isStatic) defines.SURF_STATIC = '';
  if (L) defines.SURF_LAYER = LAYER_KINDS[L.kind];
  if (tinted) defines.SURF_TINT_ATTR = '';
  mat.defines = defines;
  const uniforms = {
    tSurfNoise: { value: isStatic ? groundNoiseTexture() : null },
    uSurfA: { value: new THREE.Vector4(s.tone ?? 0, s.streak ?? 0, s.gloss ?? 0, s.splash ?? 0.8) },
    uSurfStain: { value: new THREE.Vector4(...(s.stain ?? [1, 1, 1, 0])) },
    uSurfDust: { value: new THREE.Vector4(...(s.dust ?? [0, 0, 0, 0])) },
  };
  if (L) {
    uniforms.uLayerA = { value: new THREE.Vector4(L.cover, L.detail, L.macro, L.soft) };
    uniforms.uLayerB = { value: new THREE.Vector4(L.ground ?? 0, L.run ?? 0, L.up ?? 0, 0) };
    uniforms.uLayerS = { value: new THREE.Vector4(L.shade[0], L.shade[1], L.fx ?? 0, 0) };
    // a tinted coat takes its whole colour from the building
    uniforms.uLayerCol = { value: new THREE.Color(tinted ? 0xffffff : L.col) };
    uniforms.uLayerCol2 = { value: new THREE.Color(L.col2) };
  }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${SURF_VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvGNrm = objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SURF_VERT_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURF_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SURF_FRAG_MAIN}`)
      .replace('#include <opaque_fragment>', `${SURF_FRAG_GLOSS}\n#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'surface';
  mat.userData.staticGrime = isStatic;
  mat.userData.staticPaint = tinted;
  return mat;
}

/** A weathered surface material: tile + normal map + the SURF coat and noise (see above). */
export function surface(name, o = {}, tex = name) {
  return surfacePatch(new THREE.MeshLambertMaterial({ map: tiledTexture(tex), normalMap: tiledNormalMap(tex), ...o }), name);
}

const staticVariants = new Map();
/** The static world's variant of a shared material (itself when the material has none). */
export function staticSurface(mat) {
  if (!SURF[mat.name]) return mat;
  let v = staticVariants.get(mat);
  if (!v) {
    v = surfacePatch(mat.clone(), mat.name, true);
    v.name = mat.name;
    staticVariants.set(mat, v);
  }
  return v;
}

// ================================================================== a vehicle's glass
// Glass one can see through (the windows of every vehicle: models/cabin.js), and the same glass made opaque for a
// canopy that has no cabin behind it (an aircraft's, built as a closed skin). The pane itself is a dark tint; what
// lies on it - dust, the runs the rain left, cracks - is the `carglass` tile, turned up or down by the pane; the sky
// is mirrored in it, most at a glancing angle. A pane's vertex colour is not a colour but what it is like:
//   r: how dirty (0 wiped clean .. 1 caked), g: its tint (0 green-grey .. 1 bronze), b: blood smeared on it.
// See-through, it is drawn without sorting, by one mesh, before everything else that is see-through (staticworld.js
// `unsorted`): a pane is a thin dark film, and two of them come out the same whichever is drawn first.
const GLASS_FRAG_PARS = /* glsl */ `
uniform vec4 uGlass; // x: the bare pane's opacity, y: the film's, z: the sky's mirror, w: 1 a canopy (opaque)
`;
const GLASS_FRAG_COLOR = /* glsl */ `
float glassSheen = 0.0;
{
  float film = sampledDiffuseColor.a;
  float dirt = vColor.r, blood = vColor.b;
  // (a crack - the tile's brightest, fullest alpha - shows on the cleanest pane)
  // (blood: smeared where a hand or a head went down the glass - the film's own patches, and dark)
  float smear = blood * smoothstep( 0.2, 0.6, film );
  float cover = clamp( film * ( 0.1 + 1.2 * dirt ) + smoothstep( 0.9, 1.0, film ) + smear * 0.75, 0.0, 1.0 );
  vec3 tint = mix( vec3( 0.022, 0.034, 0.036 ), vec3( 0.046, 0.036, 0.022 ), vColor.g );
  vec3 grime = mix( sampledDiffuseColor.rgb, vec3( 0.2, 0.012, 0.01 ) * ( 0.5 + sampledDiffuseColor.g ), clamp( smear * 1.6, 0.0, 1.0 ) );
  // (a canopy: there is nothing behind it to see, so what would be the cockpit is the tint, a shade lighter)
  tint += uGlass.w * vec3( 0.02, 0.028, 0.032 );
  diffuseColor.rgb = mix( tint, grime, cover );
  diffuseColor.a = mix( mix( uGlass.x, uGlass.y, cover ), 1.0, uGlass.w );
  glassSheen = 1.0 - cover * 0.8;
}
`;
const GLASS_FRAG_SHEEN = /* glsl */ `
#if NUM_HEMI_LIGHTS > 0
{
  vec3 vd = normalize( vViewPosition );
  float fres = pow( 1.0 - saturate( abs( dot( nonPerturbedNormal, vd ) ) ), 3.0 );
  vec3 sky = getHemisphereLightIrradiance( hemisphereLights[ 0 ], reflect( -vd, nonPerturbedNormal ) ) * RECIPROCAL_PI;
  float k = uGlass.z * glassSheen * ( 0.1 + 0.9 * fres );
  // (blended over what is behind it by its alpha: the mirrored sky is made up for that, and the pane more solid there)
  outgoingLight += sky * k / max( diffuseColor.a, 0.25 );
  diffuseColor.a = min( 1.0, diffuseColor.a + fres * 0.45 * glassSheen * ( 1.0 - uGlass.w ) );
}
#endif
`;
export function glassPatch(mat, canopy) {
  const uGlass = { value: new THREE.Vector4(0.42, 0.9, canopy ? 0.6 : 1.0, canopy ? 1 : 0) };
  mat.userData.uGlass = uGlass;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlass = uGlass;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${GLASS_FRAG_PARS}`)
      .replace('#include <color_fragment>', GLASS_FRAG_COLOR)
      .replace('#include <opaque_fragment>', `${GLASS_FRAG_SHEEN}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'carglass';
  return mat;
}
