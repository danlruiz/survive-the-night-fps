// Terrain mesh built from the shared heightfield (exactly matches collision), splat-blended ground
// textures (meadow grass / forest floor / mud / rock) with baked ambient occlusion under trees, drainage
// wetness and slope rock. The ground layers come from groundFields(), which the grass placement shares, so
// grass cards stand on the grass layer. Roads are drawn per pixel from a road frame baked into the vertices
// (signed offset from the nearest road's centre line and distance along it): dirt roads get tyre ruts, a
// grassy crown and puddles, trails a worn footpath and Route 9 faded lane lines and gravel shoulders.
import * as THREE from 'three';
import { GRID_STEP, WATER_LEVEL } from '../../shared/constants.js';
import { smoothstep } from '../../shared/rng.js';
import { ROAD } from '../../shared/world.js';
import { MINE_R, PORTAL } from '../../shared/mine.js';
import { getTexture } from './textures.js';
import { MultiMesh, ALWAYS, dropArray } from './multimesh.js';
import { GROUND_MACRO_GLSL, groundNoiseTexture, VEG } from './vegshading.js';
import { groundFields } from './groundfields.js';

// (the water has a file of its own: Game finds it here)
export { buildWater } from './water.js';

const TERRAIN_CHUNK = 48; // cells a side of a piece of the terrain mesh (96 m): see buildTerrain
// the road frame is kept this far (m) past a road's edge, so its fade-out stays well clear of the road
const FRAME_REACH = 12;

/**
 * Per-vertex road frame: signed lateral offset from the nearest road's centre line, distance along that
 * road, its half width, its kind and a confidence that falls to 0 wherever the frame jumps (junctions,
 * road ends, switchbacks, out of reach) so the shader never interpolates across a discontinuity.
 */
function roadFrame(world) {
  const N = world.gridN;
  const MAP_HALF = world.half;
  const cnt = N * N;
  const lat = new Float32Array(cnt).fill(FRAME_REACH * 4);
  const along = new Float32Array(cnt);
  const hw = new Float32Array(cnt);
  const edge = new Float32Array(cnt).fill(1e9);
  const rid = new Int16Array(cnt).fill(-1);
  const bad = new Uint8Array(cnt);
  world.roads.forEach((road, ri) => {
    const p = road.pts;
    const n = p.length / 2;
    const reach = road.width + FRAME_REACH;
    let s0 = 0;
    for (let s = 0; s < n - 1; s++) {
      const ax = p[s * 2];
      const az = p[s * 2 + 1];
      const bx = p[s * 2 + 2];
      const bz = p[s * 2 + 3];
      const ex = bx - ax;
      const ez = bz - az;
      const el2 = ex * ex + ez * ez;
      if (el2 < 1e-8) continue;
      const el = Math.sqrt(el2);
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + MAP_HALF) / GRID_STEP));
      const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + MAP_HALF) / GRID_STEP));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + MAP_HALF) / GRID_STEP));
      const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + MAP_HALF) / GRID_STEP));
      for (let j = j0; j <= j1; j++) {
        const z = -MAP_HALF + j * GRID_STEP;
        for (let i = i0; i <= i1; i++) {
          const x = -MAP_HALF + i * GRID_STEP;
          let t = ((x - ax) * ex + (z - az) * ez) / el2;
          const cap = (t < 0 && s === 0) || (t > 1 && s === n - 2);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
          const e = d - road.width;
          const k = j * N + i;
          if (e > FRAME_REACH || e >= edge[k]) continue;
          edge[k] = e;
          lat[k] = ex * (z - az) - ez * (x - ax) >= 0 ? d : -d;
          along[k] = s0 + t * el;
          hw[k] = road.width;
          rid[k] = ri;
          bad[k] = cap ? 1 : 0;
        }
      }
      s0 += el;
    }
  });
  // discontinuities: a different road (or none) next door, or a jump along the same road
  const jump = GRID_STEP * 4;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (rid[k] < 0) {
        bad[k] = 1;
        continue;
      }
      for (let dj = -1; dj <= 1 && !bad[k]; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= N) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= N) continue;
          const kk = jj * N + ii;
          if (rid[kk] !== rid[k] || Math.abs(along[kk] - along[k]) > jump) {
            bad[k] = 1;
            break;
          }
        }
      }
    }
  }
  // confidence: 0 within 2 cells of a discontinuity (so every triangle touching one is exactly 0), then
  // two box blurs fade it back in
  let conf = new Float32Array(cnt);
  const R = 2;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let ok = 1;
      for (let dj = -R; dj <= R && ok; dj++) {
        const jj = Math.min(N - 1, Math.max(0, j + dj));
        for (let di = -R; di <= R; di++) {
          if (bad[jj * N + Math.min(N - 1, Math.max(0, i + di))]) {
            ok = 0;
            break;
          }
        }
      }
      conf[j * N + i] = ok;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = conf;
    conf = new Float32Array(cnt);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = Math.min(N - 1, Math.max(0, j + dj));
          for (let di = -1; di <= 1; di++) s += src[jj * N + Math.min(N - 1, Math.max(0, i + di))];
        }
        conf[j * N + i] = s / 9;
      }
    }
  }
  const kind = (k) => (rid[k] >= 0 ? world.roads[rid[k]].kind : 0);
  return { lat, along, hw, conf, kind };
}

export function buildTerrain(world) {
  const steps = terrainSteps(world);
  let r;
  while (!(r = steps.next()).done);
  return r.value;
}
// ...a little at a time (Game.loadWorldSoon): a generator that yields between pieces of the work and returns the terrain
export function* terrainSteps(world) {
  const N = world.gridN;
  const MAP_HALF = world.half;
  const H = world.heights;
  const count = N * N;
  const F = groundFields(world);
  yield;
  const frame = roadFrame(world);
  yield;
  const pos = new Float32Array(count * 3);
  const extra = new Float32Array(count * 4);
  const roadAttr = new Float32Array(count * 4);
  const soilAttr = new Uint8Array(count * 2); // (bytes, normalized: a quarter of the memory floats took)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      pos[k * 3] = -MAP_HALF + i * GRID_STEP;
      pos[k * 3 + 1] = H[k];
      pos[k * 3 + 2] = -MAP_HALF + j * GRID_STEP;
      // road kind: +1 asphalt, -1 trail, 0 dirt road
      const kd = frame.kind(k);
      extra[k * 4] = F.paved[k] ? 1 : kd === ROAD.ASPHALT ? 1 : kd === ROAD.TRAIL ? -1 : 0;
      extra[k * 4 + 1] = F.ao[k];
      extra[k * 4 + 2] = F.wet[k];
      extra[k * 4 + 3] = F.rock[k];
      roadAttr[k * 4] = frame.lat[k];
      roadAttr[k * 4 + 1] = frame.along[k];
      roadAttr[k * 4 + 2] = frame.hw[k];
      roadAttr[k * 4 + 3] = F.paved[k] ? 0 : frame.conf[k]; // (a paved yard: its layer as it is, no road's edges or lines)
      soilAttr[k * 2] = Math.round(F.soil[k] * 255);
      soilAttr[k * 2 + 1] = Math.round(F.scree[k] * 255);
    }
    if (j % 32 === 31) yield;
  }
  // One vertex buffer for the whole heightfield, drawn as TERRAIN_CHUNK x TERRAIN_CHUNK-cell pieces with an index
  // buffer and a bounding sphere each, so what is behind the camera or past the edge of a shadow cascade is not
  // drawn: the mainland's field is four times the island's, and neither the frame nor the shadow passes should
  // pay for the part of it nobody is looking at.
  const attrs = {
    position: new THREE.BufferAttribute(pos, 3),
    normal: new THREE.BufferAttribute(F.nrm, 3),
    aSplat: new THREE.BufferAttribute(F.base, 4),
    aExtra: new THREE.BufferAttribute(extra, 4),
    aRoad: new THREE.BufferAttribute(roadAttr, 4),
    aSoil: new THREE.BufferAttribute(soilAttr, 2, true),
  };
  // (the pieces are runs of one index buffer, and the terrain one mesh that draws those in sight in one call: multimesh.js)
  // On a world as big as the mainland a piece wholly past the drawing distance (the haze has everything there) is not
  // drawn in the view (update, below): from the bluff the frustum held most of a two-million-triangle field. The shadow
  // maps still take every piece in their frustum, near or far: a mountain past the haze still shades the valley under it.
  const far = world.size > 1000;
  const runs = [];
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let o = 0;
  for (let cj = 0; cj < N - 1; cj += TERRAIN_CHUNK) {
    for (let ci = 0; ci < N - 1; ci += TERRAIN_CHUNK) {
      const i1 = Math.min(N - 1, ci + TERRAIN_CHUNK);
      const j1 = Math.min(N - 1, cj + TERRAIN_CHUNK);
      const first = o;
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = cj; j < j1; j++) {
        for (let i = ci; i < i1; i++) {
          const k00 = j * N + i;
          const k10 = k00 + 1;
          const k01 = k00 + N;
          const k11 = k01 + 1;
          idx[o++] = k00;
          idx[o++] = k01;
          idx[o++] = k10;
          idx[o++] = k10;
          idx[o++] = k01;
          idx[o++] = k11;
          lo = Math.min(lo, H[k00], H[k10], H[k01], H[k11]);
          hi = Math.max(hi, H[k00], H[k10], H[k01], H[k11]);
        }
      }
      const sx = ((i1 - ci) * GRID_STEP) / 2;
      const sz = ((j1 - cj) * GRID_STEP) / 2;
      runs.push({ first, count: o - first, x: -MAP_HALF + ci * GRID_STEP + sx, y: (lo + hi) / 2, z: -MAP_HALF + cj * GRID_STEP + sz, r: Math.hypot(sx, sz, (hi - lo) / 2), hx: sx, hz: sz, chunk: far ? { on: true, near: 0 } : ALWAYS, maxDist: Infinity });
    }
    yield;
  }
  const geo = new THREE.BufferGeometry();
  for (const name in attrs) geo.setAttribute(name, attrs[name]);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const tex = (name) => {
    const t = getTexture(name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  groundNoiseTexture();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    tGrass: { value: tex('ground_grass') },
    tForest: { value: tex('ground_forest') },
    tRoad: { value: tex('ground_road') },
    tAsph: { value: tex('ground_asphalt') },
    tMud: { value: tex('ground_mud') },
    tRock: { value: tex('rock') },
    tNoise: { value: tex('ground_noise') },
    tDirt: { value: tex('ground_dirt') },
    tGravel: { value: tex('gravel') },
    uMain: { value: world.cliffAt ? 1 : 0 }, // (the mainland's ground: its forest floor broken up too - the island's as it was)
    tGroundNoise: VEG.tGroundNoise,
    // the mouths of the mine (x, z, and the unit vector into the drift): inside a portal the decline runs down
    // through the ground, which is not drawn there (the portal's own stone stands over the gap)
    // (how far from the eye the terrain is drawn: past it, on a world with mountains, the far mountains are - below)
    uCut: { value: 1e9 },
    // (the quarry's pit, if the world has one: x, z, radius)
    uPit: { value: new THREE.Vector3(...((world.marks || []).find((m) => m.kind === 'pit') ? ((m) => [m.x, m.z, m.r])(world.marks.find((m) => m.kind === 'pit')) : [0, 0, 0])) },
    uHole: { value: [0, 1].map((k) => (world.mine ? new THREE.Vector4(world.mine.portals[k].x, world.mine.portals[k].z, world.mine.portals[k].dx, world.mine.portals[k].dz) : new THREE.Vector4(1e6, 1e6, 1, 0))) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aSplat;\nattribute vec4 aExtra;\nattribute vec4 aRoad;\nattribute vec2 aSoil;\nvarying vec2 vSoil;\nvarying vec4 vSplat;\nvarying vec4 vExtra;\nvarying vec4 vRoad;\nvarying vec3 vWPos;\nvarying vec3 vNw;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat;\nvExtra = aExtra;\nvRoad = aRoad;\nvSoil = aSoil;\nvWPos = position;\nvNw = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrass;
        uniform sampler2D tForest;
        uniform sampler2D tRoad;
        uniform sampler2D tAsph;
        uniform sampler2D tMud;
        uniform sampler2D tRock;
        uniform sampler2D tNoise;
        uniform sampler2D tDirt;
        uniform sampler2D tGravel;
        uniform float uMain;
        uniform vec4 uHole[2];
        uniform float uCut;
        uniform vec3 uPit;
        varying vec4 vSplat;
        varying vec4 vExtra;
        varying vec4 vRoad;
        varying vec2 vSoil;
        varying vec3 vWPos;
        varying vec3 vNw;
        ${GROUND_MACRO_GLSL}
        // anti-tiling: a second, rotated + rescaled sample of the same layer takes over in noise patches; the seam
        // follows the texture's luminance (its "height"), so it reads as relief instead of a cross-fade.
        // Explicit gradients: layers are only sampled where they have weight (non-uniform control flow).
        vec4 terrLayer(sampler2D t, vec2 uv, vec2 dx, vec2 dy, float n, float ang, float sc, vec2 off) {
          vec3 a = textureGrad(t, uv, dx, dy).rgb;
          mat2 R = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * sc;
          vec3 b = textureGrad(t, R * uv + off, R * dx, R * dy).rgb;
          float la = dot(a, vec3(0.333)), lb = dot(b, vec3(0.333));
          float k = smoothstep(0.4, 0.6, n + (lb - la) * 1.5);
          return vec4(mix(a, b, k), mix(la, lb, k));
        }
        // rock laid on from three sides by the normal (a face that stands up is not the ground's texture drawn out down it
        // in streaks): p the world position, n the normal, sc the scale; dpx / dpy its screen gradients
        vec4 triRock(sampler2D t, vec3 p, vec3 n, float sc, vec3 dpx, vec3 dpy) {
          vec3 an = abs(n);
          an = an * an * an * an;
          an /= an.x + an.y + an.z;
          vec3 rX = textureGrad(t, p.zy * sc, dpx.zy * sc, dpy.zy * sc).rgb;
          vec3 rY = textureGrad(t, p.xz * sc, dpx.xz * sc, dpy.xz * sc).rgb;
          vec3 rZ = textureGrad(t, p.xy * sc + 0.37, dpx.xy * sc, dpy.xy * sc).rgb;
          vec3 r = rX * an.x + rY * an.y + rZ * an.z;
          return vec4(r, dot(r, vec3(0.333)));
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec2 wp = vWPos.xz;
        if (distance(wp, cameraPosition.xz) > uCut) discard;
        for (int i = 0; i < 2; i++) {
          vec2 hd = wp - uHole[i].xy;
          float hs = dot(hd, uHole[i].zw);
          if (hs > 0.0 && hs < ${PORTAL.HOLE.toFixed(2)} && abs(hd.y * uHole[i].z - hd.x * uHole[i].w) < ${(MINE_R + PORTAL.LINER).toFixed(2)}) discard;
        }
        vec2 tuv = wp * 0.22;
        // gradients taken here, in uniform control flow, so branch-local samples get the right mip level
        vec2 gx = dFdx(tuv), gy = dFdy(tuv);
        vec2 wx = dFdx(wp), wy = dFdy(wp);
        vec3 dpx = dFdx(vWPos), dpy = dFdy(vWPos);
        const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
        vec2 rwx = ROT * wx, rwy = ROT * wy;
        vec4 nz = texture2D(tGroundNoise, wp * (1.0 / 29.0));
        float n1 = nz.r * 0.6 + nz.g * 0.4;
        float n2 = nz.g * 0.5 + nz.b * 0.5;
        // tNoise holds independent tileable noise fields in r / g / b (linear data): road edges, ruts, puddles
        vec3 nMid = texture2D(tNoise, wp * 0.041 + 0.31).rgb;
        vec3 nFine = texture2D(tNoise, wp * 0.23 + 0.67).rgb;
        float wet = vExtra.z;

        // ---- road coverage: per pixel from the road frame, per vertex where the frame is not trustworthy
        // (junctions, road ends). Ragged dirt edges that grass creeps over, clean asphalt edges with a gravel shoulder.
        float conf = vRoad.w;
        float lat = vRoad.x;
        float aLat = abs(lat);
        float hw = vRoad.z;
        float asph = max(vExtra.x, 0.0);
        float trail = max(-vExtra.x, 0.0);
        float edgeN = (nFine.g - 0.5) * mix(1.3, 0.3, asph) + (nMid.b - 0.5) * mix(0.8, 0.0, asph);
        float soft = mix(0.55, 0.12, asph);
        float pixRoad = 1.0 - smoothstep(hw + asph * 0.7 - soft, hw + asph * 0.7 + soft * 0.3, aLat + edgeN);
        float road = mix(vSplat.w, pixRoad, conf);
        vec2 ruv = vec2(lat * 0.7, vRoad.y * 0.06);
        vec2 rux = dFdx(ruv), ruy = dFdy(ruv);

        // ---- ground under and beside the roads
        vec3 w = vSplat.xyz;
        // ragged meadow / forest-floor border
        float nb = (n2 - 0.5) * 0.9;
        w.x = max(0.0, w.x + nb * w.y);
        w.y = max(0.0, w.y - nb * w.y);
        vec4 cG = vec4(0.0), cF = vec4(0.0), cM = vec4(0.0);
        // (grass is also sampled on the road: the crown between the ruts and the verges grow it)
        if (w.x > 0.002 || road > 0.002) {
          cG = terrLayer(tGrass, tuv, gx, gy, n1, 1.3, 0.83, vec2(0.31, 0.17));
          cG.rgb = mix(cG.rgb, cG.w * vec3(1.45, 1.2, 0.66), groundDry(wp) * 0.3);
        }
        if (w.y > 0.002 && road < 0.998) {
          cF = terrLayer(tForest, tuv * 0.9 + 0.37, gx * 0.9, gy * 0.9, n2, 2.2, 1.17, vec2(0.13, 0.71));
          // moss mats on the damp forest floor
          cF.rgb = mix(cF.rgb, cF.rgb * vec3(0.72, 1.02, 0.58) + vec3(0.0, 0.006, 0.0), smoothstep(0.5, 0.78, nz.a * 0.7 + nz.r * 0.3 + wet * 0.35) * 0.75);
        }
        if (w.z > 0.002 && road < 0.998) cM = terrLayer(tMud, tuv * 1.1, gx * 1.1, gy * 1.1, n1, 0.9, 0.79, vec2(0.57, 0.23));
        // height-aware blend: where two layers meet, the higher texel (blade, leaf, pebble) wins
        vec3 b = (w + vec3(cG.w, cF.w, cM.w * 0.7) * 0.9) * step(0.002, w);
        float ma = max(max(b.x, b.y), b.z) - 0.14;
        w = max(b - ma, 0.0);
        w /= max(w.x + w.y + w.z, 1e-4);
        vec3 ground = cG.rgb * w.x + cF.rgb * w.y + cM.rgb * w.z;
        // under the trees no one floor: patches of bare dark earth and needles between the moss and the litter
        if (w.y > 0.05 && uMain > 0.5) {
          // (the floor's own texel, darkened to earth: no texture more to read)
          vec3 earth = cF.w * vec3(0.5, 0.4, 0.31) + 0.012;
          float ke = smoothstep(0.55, 0.75, nMid.g * 0.75 + nFine.b * 0.3 + (cF.w - 0.3) * 0.8) * w.y * uMain;
          ground = mix(ground, earth, ke * 0.8);
        }
        // bare ground: gravel and trodden dirt (the roads' edges, the yards, patches in the open), and the scree of
        // broken stone along a mountain's foot - each laid on by the height of its texel, so the edges are ragged
        // (only where there is enough of either to show: below that the texel heights never let it through)
        if (vSoil.x > 0.1 || vSoil.y > 0.05) {
          vec3 bareC = textureGrad(tDirt, ROT * wp * 0.27 + 0.13, rwx * 0.27, rwy * 0.27).rgb * vec3(0.95, 0.9, 0.84);
          float gk = smoothstep(0.35, 0.65, nMid.g + (nFine.r - 0.5) * 0.3);
          if (gk > 0.01) bareC = mix(bareC, textureGrad(tGravel, wp * 0.45, wx * 0.45, wy * 0.45).rgb * vec3(0.5, 0.48, 0.44), gk);
          // (the quarry's ledges and floor: broken stone and grit, grey and dark in the pit's shade)
          if (uPit.z > 0.0) bareC = mix(bareC, dot(bareC, vec3(0.333)) * vec3(0.62, 0.62, 0.64), 1.0 - smoothstep(uPit.z - 3.0, uPit.z + 6.0, distance(wp, uPit.xy)));
          float ks = smoothstep(0.3, 0.7, vSoil.x + (dot(bareC, vec3(0.333)) - 0.32) * 1.2 + (nFine.r - 0.5) * 0.45);
          ground = mix(ground, bareC, ks);
          if (vSoil.y > 0.01) {
            vec4 sc = triRock(tRock, vWPos * 2.1, normalize(vNw), 0.21, dpx * 2.1, dpy * 2.1);
            vec3 screeC = sc.rgb * (0.75 + 0.5 * nMid.r) * vec3(0.95, 0.93, 0.9);
            float kc = smoothstep(0.3, 0.7, vSoil.y + (sc.w - 0.4) * 0.9 + (nMid.b - 0.5) * 0.5);
            ground = mix(ground, screeC, kc);
          }
        }
        // steep slopes: rock breaks through (height-aware too)
        float rk = 0.0;
        if (vExtra.w > 0.01) {
          // (from three sides: on a steep face the ground's own mapping smeared the rock down it in streaks)
          vec4 cK = triRock(tRock, vWPos, normalize(vNw), 0.21, dpx, dpy);
          // (a second, coarser sample over it: the face's larger slabs and seams, so no one scale tiles)
          vec4 cK2 = triRock(tRock, vWPos * 0.37 + vec3(3.1, 0.0, 1.7), normalize(vNw), 0.21, dpx * 0.37, dpy * 0.37);
          cK = vec4(mix(cK.rgb, cK.rgb * (0.7 + 0.6 * cK2.w), 0.6), mix(cK.w, cK.w * (0.7 + 0.6 * cK2.w), 0.6));
          rk = smoothstep(0.3, 0.7, vExtra.w + (cK.w - 0.35) * 0.9);
          // (the faces of the quarry's benches are cut stone in the shade of the pit: darker)
          float inPit = uPit.z > 0.0 ? 1.0 - smoothstep(uPit.z - 3.0, uPit.z + 6.0, distance(wp, uPit.xy)) : 0.0;
          ground = mix(ground, cK.rgb * vec3(1.08, 1.1, 1.12) * (1.0 - 0.42 * inPit), rk);
        }
        // the mountains (the mainland's: nothing on the island stands this high): bare rock up high whatever its slope,
        // scree - paler, broken stone - where the faces ease off, and snow lying on the flatter ground near the tops
        if (vWPos.y > 52.0) {
          float hi = smoothstep(52.0, 110.0, vWPos.y);
          // (the rock laid on from three sides by the normal, so a face that stands up is not the ground's texture
          // drawn out down it in streaks)
          vec4 cR = triRock(tRock, vWPos, normalize(vNw), 0.16, dpx, dpy);
          vec4 cR2 = triRock(tRock, vWPos * 0.29 + vec3(1.3, 0.0, 4.1), normalize(vNw), 0.16, dpx * 0.29, dpy * 0.29);
          cR = vec4(cR.rgb * (0.68 + 0.64 * cR2.w), cR.w * (0.68 + 0.64 * cR2.w));
          vec3 rockC = cR.rgb * vec3(0.8, 0.79, 0.78);
          float scree = smoothstep(0.62, 0.86, vNw.y) * (1.0 - smoothstep(0.86, 0.97, vNw.y));
          rockC = mix(rockC, cR.w * vec3(1.16, 1.12, 1.06) + 0.05, scree * 0.55);
          ground = mix(ground, rockC, hi * (0.55 + 0.45 * (1.0 - rk)));
          rk = max(rk, hi);
          float snow = smoothstep(176.0, 214.0, vWPos.y + (n2 - 0.5) * 40.0) * smoothstep(0.55, 0.8, vNw.y + (n1 - 0.5) * 0.25);
          ground = mix(ground, vec3(0.78, 0.8, 0.83) * (0.9 + 0.1 * cR.w), snow);
        }
        // a face that stands up is layered rock: bands of it a metre or so deep, wandering, and dark streaks run down it
        // from the ledges (the mainland's faces only: their heights)
        if (uMain > 0.5 && rk > 0.05) {
          float steepF = 1.0 - smoothstep(0.35, 0.8, vNw.y);
          float strata = 0.5 + 0.5 * sin(vWPos.y * 0.9 + (nMid.r - 0.5) * 7.0 + nz.g * 4.0);
          vec2 hz = normalize(vNw.xz + vec2(1e-4));
          float across = dot(wp, vec2(-hz.y, hz.x));
          float streak = smoothstep(0.55, 0.85, texture2D(tNoise, vec2(across * 0.09, vWPos.y * 0.006) + 0.13).g);
          ground *= mix(1.0, (0.8 + 0.28 * strata) * (1.0 - 0.3 * streak), steepF * rk);
        }
        // drainage lines and hollows: darker, greener
        ground *= mix(vec3(1.0), vec3(0.74, 0.84, 0.7), wet * 0.75 * (1.0 - rk));

        // ---- roads
        if (road > 0.002) {
          float tb = smoothstep(0.3, 0.7, nMid.r);
          vec3 dirt = textureGrad(tRoad, ROT * wp * 0.2, rwx * 0.2, rwy * 0.2).rgb;
          if (tb > 0.002) dirt = mix(dirt, textureGrad(tRoad, wp * 0.083 + 0.5, wx * 0.083, wy * 0.083).rgb, tb * 0.5);
          // tyre ruts (dirt roads) or one worn footpath (trails), wandering a little
          float wob = (nMid.r - 0.5) * 0.55 + (nFine.b - 0.5) * 0.12;
          float la = abs(lat + wob);
          float rutC = 0.82 * (1.0 - trail);
          float rw = mix(0.3, 0.42, trail);
          float dr = abs(la - rutC);
          float rut = (1.0 - smoothstep(rw * 0.55, rw * 0.9, dr)) * conf;
          float berm = smoothstep(rw * 0.9, rw * 1.3, dr) * (1.0 - smoothstep(rw * 1.3, rw * 2.2, dr)) * conf * (1.0 - trail);
          // tyre streaks: the dirt texture stretched along the road
          vec3 streak = textureGrad(tRoad, ruv, rux, ruy).rgb;
          vec3 rutCol = mix(dirt, streak, 0.55) * vec3(0.7, 0.67, 0.64);
          // faint tread imprint across the tyre tracks
          rutCol *= 1.0 - 0.1 * step(0.55, fract(vRoad.y * 3.3 + la * 1.5)) * (1.0 - trail);
          dirt = mix(dirt, rutCol, rut * mix(0.85, 0.6, trail));
          dirt *= 1.0 + berm * 0.1;
          // standing water in the ruts
          float pud = rut * smoothstep(0.62, 0.7, nMid.g) * smoothstep(0.35, 0.6, nFine.r) * (1.0 - trail);
          dirt = mix(dirt, vec3(0.018, 0.02, 0.022) + dirt * 0.25, pud * 0.85);
          // grassy crown between the ruts and grass creeping in from the verge
          float crown = (1.0 - smoothstep(0.16, 0.4, la)) * smoothstep(0.38, 0.62, nMid.g + nFine.r * 0.25) * (1.0 - trail) * conf;
          float verge = smoothstep(hw - 1.3, hw - 0.2, aLat + edgeN * 0.5) * smoothstep(0.45, 0.7, nFine.g) * conf * (1.0 - asph);
          dirt = mix(dirt, cG.rgb * 0.92, max(crown * 0.85, verge * 0.7));
          if (asph > 0.002) {
            vec3 a = textureGrad(tAsph, ROT * wp * 0.16, rwx * 0.16, rwy * 0.16).rgb;
            if (tb > 0.002) a = mix(a, textureGrad(tAsph, wp * 0.061 + 0.2, wx * 0.061, wy * 0.061).rgb, tb * 0.5);
            // faded lane markings: dashed yellow centre line, white edge lines, worn through in places
            float grit = textureGrad(tNoise, wp * 1.9, wx * 1.9, wy * 1.9).g;
            float wear = smoothstep(0.25, 0.6, nFine.b) * smoothstep(0.2, 0.5, nMid.r) * smoothstep(0.3, 0.55, grit);
            float cl = (1.0 - smoothstep(0.055, 0.085, aLat)) * step(fract(vRoad.y / 12.0), 0.3);
            float el = 1.0 - smoothstep(0.05, 0.08, abs(aLat - (hw - 0.45)));
            // (a road's, not a runway's: that is four lanes wide and has its own paint)
            float lanes = 1.0 - step(9.0, hw);
            a = mix(a, vec3(0.22, 0.16, 0.05), cl * conf * wear * 0.75 * lanes);
            a = mix(a, vec3(0.27, 0.27, 0.25), el * conf * wear * 0.6 * lanes);
            // crumbling edge and a gravel shoulder
            float sh = smoothstep(hw - 0.2, hw + 0.05, aLat + (nFine.g - 0.5) * 0.35);
            a = mix(a, dirt * vec3(1.02, 1.0, 0.97), sh * conf);
            dirt = mix(dirt, a, asph);
          }
          ground = mix(ground, dirt, road);
        }
        ground *= groundMacro(wp);
        diffuseColor.rgb *= ground * vExtra.y;
        `,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-splat-8';
  const group = new THREE.Group();
  group.name = 'terrain';
  const mesh = new MultiMesh(geo, mat, runs);
  mesh.receiveShadow = true;
  // (after everything else that is opaque: what stands on the ground hides most of it, and its shader - five layers
  // of texture - is then run only where the ground shows)
  mesh.renderOrder = 1;
  group.add(mesh);
  mesh.viewOnlyDistance = true;
  // THE FAR MOUNTAINS. A world with mountains in it is seen past the drawing distance where it stands high (the haze
  // thins with height: globals.js uHaze), and the terrain's pieces are not drawn there. Its mountains (and their
  // foothills) are one more mesh, a vertex every 16 m (it is never nearer than the drawing distance), coloured by the
  // height and the slope as the terrain's shader colours them - rock, the snow on the tops, the woods low down - and
  // drawn only past the drawing distance.
  let farMtn = null;
  let farLowFrom = 0;
  if (far) {
    const FS = 8;
    const FN = Math.floor((N - 1) / FS) + 1;
    const fp = new Float32Array(FN * FN * 3);
    const fc = new Float32Array(FN * FN * 3);
    const fh = (i, j) => H[Math.min(N - 1, Math.max(0, j * FS)) * N + Math.min(N - 1, Math.max(0, i * FS))];
    for (let j = 0; j < FN; j++) {
      for (let i = 0; i < FN; i++) {
        const k = j * FN + i;
        const x = -MAP_HALF + i * FS * GRID_STEP;
        const z = -MAP_HALF + j * FS * GRID_STEP;
        const h = fh(i, j);
        fp.set([x, h, z], k * 3);
        const gx = (fh(i + 1, j) - fh(i - 1, j)) / (2 * FS * GRID_STEP);
        const gz = (fh(i, j + 1) - fh(i, j - 1)) / (2 * FS * GRID_STEP);
        const ny = 1 / Math.hypot(gx, 1, gz);
        const woods = world.forestAt ? world.forestAt(x, z) * (1 - smoothstep(110, 150, h)) * smoothstep(0.55, 0.8, ny) : 0;
        const snow = smoothstep(180, 215, h) * smoothstep(0.55, 0.8, ny);
        const n = 0.85 + 0.3 * (((i * 7919 + j * 104729) % 97) / 97);
        // (rock up high and on the faces; the lowland's meadow under it, olive, and the city's paving grey)
        const low = (1 - smoothstep(24, 60, h)) * smoothstep(0.75, 0.9, ny);
        const town = world.city && Math.abs(x - world.city.x) < world.city.grid * world.city.pitch * 0.55 && Math.abs(z - world.city.z) < world.city.grid * world.city.pitch * 0.55 ? 1 : 0;
        let r = (0.2 + (0.1 - 0.2) * low + (0.17 - 0.1) * low * town) * n;
        let g = (0.195 + (0.11 - 0.195) * low + (0.165 - 0.11) * low * town) * n;
        let b = (0.185 + (0.05 - 0.185) * low + (0.15 - 0.05) * low * town) * n;
        r = r + (0.05 - r) * woods;
        g = g + (0.07 - g) * woods;
        b = b + (0.045 - b) * woods;
        r += (0.62 - r) * snow;
        g += (0.64 - g) * snow;
        b += (0.68 - b) * snow;
        fc.set([r, g, b], k * 3);
      }
    }
    // the mountains first, then the lowland, all of it that is dry: from high up the land runs on into the haze under
    // the ranges (it was the sky's white with the mountains standing over it). From the ground the lowland past the
    // drawing distance is hidden by what stands round the eye, so it is drawn only from high up (update: drawRange)
    const fi = [];
    const lowland = [];
    for (let j = 0; j < FN - 1; j++) {
      for (let i = 0; i < FN - 1; i++) {
        const top = Math.max(fh(i, j), fh(i + 1, j), fh(i, j + 1), fh(i + 1, j + 1));
        if (top < WATER_LEVEL - 0.5) continue;
        const k = j * FN + i;
        (top >= 24 ? fi : lowland).push(k, k + FN, k + 1, k + 1, k + FN, k + FN + 1);
      }
    }
    farLowFrom = fi.length;
    for (const v of lowland) fi.push(v);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    fg.setIndex(fi);
    fg.computeVertexNormals();
    fg.computeBoundingSphere();
    const fm = new THREE.MeshLambertMaterial({ vertexColors: true });
    const cut = { value: 1e9 };
    fm.userData.cut = cut;
    fm.onBeforeCompile = (shader) => {
      shader.uniforms.uCut = cut;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCut;\nvarying vec2 vFarXZ;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (distance(vFarXZ, cameraPosition.xz) < uCut) discard;');
    };
    fm.customProgramCacheKey = () => 'far-mountains-1';
    farMtn = new THREE.Mesh(fg, fm);
    farMtn.renderOrder = 1;
    farMtn.matrixAutoUpdate = false;
    farMtn.frustumCulled = false;
    farMtn.userData.far = true;
    group.add(farMtn);
  }
  // the caps of the road tunnels (mainland.js: the mountain over a gallery, whose corridor the heightfield cuts down to
  // the road): drawn as more of the terrain, with its material, so the mountain is whole over a tunnel
  for (const t of world.tunnels || []) {
    if (!t.cap) continue;
    const { s0, step, lat, n, m, h } = t.cap;
    const dx = (t.b[0] - t.a[0]) / t.len;
    const dz = (t.b[1] - t.a[1]) / t.len;
    const cp = new Float32Array(n * m * 3);
    const cn = new Float32Array(n * m * 3);
    const cs = new Float32Array(n * m * 4);
    const ce = new Float32Array(n * m * 4);
    const cr = new Float32Array(n * m * 4);
    const hh = (a, b) => h[Math.max(0, Math.min(n - 1, a)) * m + Math.max(0, Math.min(m - 1, b))];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < m; b++) {
        const k = a * m + b;
        const s = s0 + a * step;
        const l = -lat + b * step;
        const x = t.a[0] + dx * s - dz * l;
        const z = t.a[1] + dz * s + dx * l;
        cp.set([x, h[k], z], k * 3);
        // (the normal from the grid's own slopes, along (dx, dz) and across (-dz, dx))
        const gs = (hh(a + 1, b) - hh(a - 1, b)) / (2 * step);
        const gl = (hh(a, b + 1) - hh(a, b - 1)) / (2 * step);
        const nx = -(gs * dx - gl * dz);
        const nz = -(gs * dz + gl * dx);
        const nl = Math.hypot(nx, 1, nz);
        cn.set([nx / nl, 1 / nl, nz / nl], k * 3);
        const vi = Math.max(0, Math.min(N - 1, Math.round((z + MAP_HALF) / GRID_STEP))) * N + Math.max(0, Math.min(N - 1, Math.round((x + MAP_HALF) / GRID_STEP)));
        cs.set([F.base[vi * 4], F.base[vi * 4 + 1], F.base[vi * 4 + 2], 0], k * 4);
        ce.set([0, 1, 0, smoothstep(0.16, 0.27, 1 - 1 / nl)], k * 4);
        cr.set([FRAME_REACH * 4, 0, 0, 0], k * 4);
      }
    }
    const ci = [];
    for (let a = 0; a < n - 1; a++) {
      for (let b = 0; b < m - 1; b++) {
        const k = a * m + b;
        ci.push(k, k + 1, k + m, k + 1, k + m + 1, k + m);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    cg.setAttribute('normal', new THREE.BufferAttribute(cn, 3));
    cg.setAttribute('aSplat', new THREE.BufferAttribute(cs, 4));
    cg.setAttribute('aExtra', new THREE.BufferAttribute(ce, 4));
    cg.setAttribute('aRoad', new THREE.BufferAttribute(cr, 4));
    cg.setIndex(ci);
    cg.computeBoundingSphere();
    const cap = new THREE.Mesh(cg, mat);
    cap.receiveShadow = true;
    cap.renderOrder = 1;
    cap.matrixAutoUpdate = false;
    cap.userData.cap = true;
    group.add(cap);
  }
  group.userData.update = (cam, viewDist) => {
    if (!far) return;
    // (the terrain to the drawing distance, the far mountains from there: the line between them a circle about the eye)
    uniforms.uCut.value = viewDist;
    if (farMtn) {
      farMtn.material.userData.cut.value = viewDist;
      // (the lowland only from 60 m over the ground under the eye)
      const gi = Math.max(0, Math.min(N - 1, Math.round((cam.x + MAP_HALF) / GRID_STEP))), gj = Math.max(0, Math.min(N - 1, Math.round((cam.z + MAP_HALF) / GRID_STEP)));
      farMtn.geometry.setDrawRange(0, cam.y - H[gj * N + gi] > 60 ? Infinity : farLowFrom);
    }
    for (const run of runs) {
      run.chunk.near = Math.hypot(Math.max(0, Math.abs(cam.x - run.x) - run.hx), Math.max(0, Math.abs(cam.z - run.z) - run.hz));
      run.maxDist = viewDist;
    }
  };
  // (what Game does with it: the hills shade the valleys on the presets with sun shadows; a world comes and goes)
  group.userData.setShadows = (on) => group.children.forEach((m) => (m.castShadow = on && !m.userData.far));
  group.userData.dispose = () => {
    geo.dispose();
    for (const c of group.children) if (c.userData.cap || c.userData.far) c.geometry.dispose();
    farMtn?.material.dispose();
    mat.dispose();
  };
  // (once the heightfield is on the graphics card its copy in memory is let go of, as the static world's is: on the
  // mainland that is a hundred megabytes - positions, normals, the ground layers, the road frame and the indices. The
  // fields the grass is placed by stay; the normals and the layers drawn from are the terrain's alone)
  for (const name in attrs) attrs[name].onUpload(dropArray);
  geo.index.onUpload(dropArray);
  F.nrm = F.base = null;
  return group;
}
