// Water surface (lake + ponds): dark murky water with animated ripples, fresnel sky reflection and
// moon/sun glints. A sheet at the water line over every cell of the heightfield that dips below it, and nowhere
// else: under dry ground it would show in the drifts of the mine, which run down through that level.
import * as THREE from 'three';
import { GRID_STEP, WATER_LEVEL } from '../../shared/constants.js';

// (m from the eye: the sea past the map fades into the sky between these - buildWater)
const SEA_FADE = [1100, 1650];

export function buildWater(world) {
  const N = world.gridN;
  const MAP_HALF = world.half;
  const H = world.heights;
  const quads = [];
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const k = j * N + i;
      if (Math.min(H[k], H[k + 1], H[k + N], H[k + N + 1]) > WATER_LEVEL + 0.02) continue;
      const x = -MAP_HALF + i * GRID_STEP;
      const z = -MAP_HALF + j * GRID_STEP;
      quads.push(x, 0, z, x, 0, z + GRID_STEP, x + GRID_STEP, 0, z, x + GRID_STEP, 0, z, x, 0, z + GRID_STEP, x + GRID_STEP, 0, z + GRID_STEP);
    }
  }
  // the sea (the mainland's west shore): on out past the edge of the map, as far as anybody can see from the bridge
  if (world.sea) {
    const far = 2600;
    const x1 = -MAP_HALF;
    const z0 = -MAP_HALF - far;
    const z1 = MAP_HALF + far;
    quads.push(x1 - far, 0, z0, x1 - far, 0, z1, x1, 0, z0, x1, 0, z0, x1 - far, 0, z1, x1, 0, z1);
    // (and round the corners of the map, where the shore runs out through its north and south edges: as far east as
    // the sea reaches along each - sea.south, where it reaches further along the south one)
    for (const [za, zb, sx] of [[z0, -MAP_HALF, world.sea.x], [MAP_HALF, z1, world.sea.south ?? world.sea.x]]) quads.push(x1, 0, za, x1, 0, zb, sx, 0, za, sx, 0, za, x1, 0, zb, sx, 0, zb);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(quads, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSky: { value: new THREE.Color(0x445566) },
        uDeep: { value: new THREE.Color(0x05090a) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(0xffffff) },
        uCam: { value: new THREE.Vector3() },
        // (the sea runs on past the edge of the map, where no sea bed is under it: uEdge is half the map, or 0)
        uEdge: { value: world.sea ? MAP_HALF : 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uCam; uniform float uEdge;
      varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main() {
        vec2 p = vW.xz;
        float e = 0.08;
        float t = uTime;
        float a = n(p * 0.35 + vec2(t * 0.12, t * 0.07)) + 0.5 * n(p * 0.9 - vec2(t * 0.2, -t * 0.11));
        float bx = n((p + vec2(e, 0.0)) * 0.35 + vec2(t * 0.12, t * 0.07)) + 0.5 * n((p + vec2(e, 0.0)) * 0.9 - vec2(t * 0.2, -t * 0.11));
        float bz = n((p + vec2(0.0, e)) * 0.35 + vec2(t * 0.12, t * 0.07)) + 0.5 * n((p + vec2(0.0, e)) * 0.9 - vec2(t * 0.2, -t * 0.11));
        vec3 N = normalize(vec3((a - bx) * 1.6, 1.0, (a - bz) * 1.6));
        vec3 V = normalize(uCam - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 col = mix(uDeep, uSky * 0.8, 0.15 + fres * 0.75);
        vec3 R = reflect(-V, N);
        col += uSunCol * pow(max(dot(R, normalize(uSunDir)), 0.0), 120.0) * 0.9;
        // The sheet lets a tenth of what is under it through. Inside the map that is the sea bed, dark; past the
        // map's edge there is none, only the haze behind the horizon, pale - which drew the edge of the map on the
        // sea as a straight line. So the sheet thickens to opaque over the last metres before the edge.
        float alpha = 0.9;
        // Past the map the sheet runs on for kilometres, and from high up (the wide views, the crossing's camera) its far
        // edge showed as a dark wedge over the horizon, the haze thin up there. So it fades out into the sky behind it
        // from SEA_FADE m out: the sea meets the sky in the haze wherever the eye is.
        if (uEdge > 0.0) alpha = mix(1.0, 0.9, smoothstep(0.0, 70.0, uEdge - max(abs(vW.x), abs(vW.z)))) * (1.0 - smoothstep(${SEA_FADE[0].toFixed(1)}, ${SEA_FADE[1].toFixed(1)}, distance(vW.xz, uCam.xz)))
          // (and past the map's north and south edges, where the land stops short at the edge, the strips of sea at the
          // corners end close by too: out there they stood up over the land's own horizon as a grey wedge, seen from high)
          * (1.0 - smoothstep(0.0, 50.0, abs(vW.z) - uEdge)) * (1.0 - smoothstep(700.0, 1100.0, -vW.x - uEdge));
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, WATER_LEVEL, 0);
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return mesh;
}
