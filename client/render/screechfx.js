// A screecher's scream, seen: while it draws breath (ZANIM.SPECIAL) a shimmering aura of sound pulses around it,
// rings running out from its throat; when the scream lets go, shells of sound blast out from its head across the
// field, one after another, rippling as they go - the call every zombie for a long way round hears. All of it is a
// few additive shells (no lights, no depth writes), drawn only while there is something to draw.
import * as THREE from 'three';

const AURA_R = 1.05; // m: the aura's size about the body (stretched to its height)
const AURA_IN = 0.35, AURA_OUT = 0.5; // s to come up, and to go once it is over
const BLAST_N = 3; // shells per scream, BLAST_GAP s apart
const BLAST_GAP = 0.22;
const BLAST_T = 1.7; // s a shell takes to reach BLAST_R
const BLAST_R = 32; // m (about how far the ringing reaches, ZOMBIE_DEFS screamRange)
const ECHO_T = 2.6; // s the aura goes on screaming after the blast (the scream is ~3.5 s, synth-creatures.js screecherScream)
const ECHO_GAP = 0.5; // s between the smaller rings it keeps sending out meanwhile
const ECHO_R = 14; // m
const POOL = 16;
const COLOR_AURA = new THREE.Color(1.0, 0.42, 0.34);
const COLOR_BLAST = new THREE.Color(1.0, 0.78, 0.7);

const VERT = /* glsl */ `
uniform float uTime;
uniform float uRipple;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec3 p = position;
  // the shell wobbles as the sound runs through it
  float w = sin(p.y * 9.0 + uTime * 23.0) * sin(p.x * 7.0 - uTime * 17.0) + sin(p.z * 8.0 + uTime * 19.0);
  p += normal * w * uRipple;
  vP = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform float uBands;
uniform float uFill;
uniform vec3 uColor;
uniform vec3 uFrom;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 2.2);
  // rings running out from the throat (uFrom, in the shell's own space)
  float d = length(vP - uFrom);
  float band = 0.5 + 0.5 * sin(d * uBands - uTime * 26.0);
  band = band * band * band;
  float a = clamp(uAlpha * (rim * (0.6 + 1.4 * band) + uFill * band), 0.0, 1.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * 1.5, a); // (additive: the colour times a)
}
`;

function shellMaterial(color, bands, ripple, fill) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uBands: { value: bands },
      uRipple: { value: ripple },
      uFill: { value: fill }, // the bands across the face of the shell, not only at its rim (seen from inside a blast)
      uColor: { value: color.clone() },
      uFrom: { value: new THREE.Vector3() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

export class ScreechFx {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.SphereGeometry(1, 40, 24);
    this.time = 0;
    this.auras = new Map(); // entity -> { mesh, k, on }
    this.blasts = []; // { mesh, t } (t < 0: waiting its turn)
    this.free = [];
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(this.geo, shellMaterial(COLOR_BLAST, 12, 0.02, 0.45));
      m.name = 'screech-blast';
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.free.push(m);
    }
  }

  // the screecher at e has begun (on) or stopped drawing breath; stopping alive, the whole windup through (minT s),
  // is the scream itself
  special(e, on, headY, minT = 0) {
    let a = this.auras.get(e);
    if (on) {
      if (!a) {
        const mesh = new THREE.Mesh(this.geo, shellMaterial(COLOR_AURA, 22, 0.035, 0.08));
        mesh.name = 'screech-aura';
        mesh.renderOrder = 5;
        this.scene.add(mesh);
        a = { mesh, k: 0, on: true, headY, start: 0, until: 0, echo: 0 };
        this.auras.set(e, a);
      }
      a.on = true;
      a.start = performance.now() / 1000; // (wall time: a slow frame or two must not make a whole windup look cut short)
      a.until = Infinity;
      return;
    }
    if (!a) return;
    if (e.dead || performance.now() / 1000 - a.start < minT) {
      a.on = false; // (cut short: killed, or knocked out of it)
      return;
    }
    a.until = this.time + ECHO_T;
    a.echo = ECHO_GAP;
    this.blast(e.rx, e.ry + headY - 0.1, e.rz);
  }

  blast(x, y, z, n = BLAST_N, maxR = BLAST_R, k = 1) {
    for (let i = 0; i < n; i++) {
      const mesh = this.free.pop();
      if (!mesh) return;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(0.01);
      mesh.visible = false;
      mesh.material.uniforms.uFrom.value.set(0, -1.6, 0); // (bands across the shell, rising)
      this.blasts.push({ mesh, t: -i * BLAST_GAP, i, maxR, k });
    }
  }

  update(dt) {
    if (!this.auras.size && !this.blasts.length) return;
    this.time += dt;
    const t = this.time;
    for (const [e, a] of this.auras) {
      const gone = e.dead || !e.view;
      if (a.on && t > a.until) a.on = false;
      if (a.on && a.until < Infinity && !gone && (a.echo -= dt) <= 0) {
        a.echo += ECHO_GAP;
        this.blast(e.rx, e.ry + a.headY - 0.1, e.rz, 1, ECHO_R, 0.6);
      }
      a.k = a.on && !gone ? Math.min(1, a.k + dt / AURA_IN) : Math.max(0, a.k - dt / AURA_OUT);
      if (a.k <= 0 && (!a.on || gone)) {
        this.scene.remove(a.mesh);
        a.mesh.material.dispose();
        this.auras.delete(e);
        continue;
      }
      const m = a.mesh;
      const h = Math.max(1.2, a.headY + 0.25);
      const pulse = 1 + 0.06 * Math.sin(t * 11);
      m.position.set(e.rx, e.ry + h * 0.52, e.rz);
      m.scale.set(AURA_R * pulse, (h * 0.62) * pulse, AURA_R * pulse);
      const u = m.material.uniforms;
      u.uTime.value = t;
      u.uAlpha.value = a.k * (0.45 + 0.15 * Math.sin(t * 7));
      // the rings start at the throat, a little below the head (in the shell's own unit space)
      u.uFrom.value.set(0, (a.headY - 0.15 - h * 0.52) / (h * 0.62), 0.3);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const m = b.mesh;
      if (b.t < 0) continue;
      const u = b.t / BLAST_T;
      if (u >= 1) {
        m.visible = false;
        this.free.push(m);
        this.blasts.splice(i, 1);
        continue;
      }
      m.visible = true;
      // fast at first, slowing as it spreads; each later shell a little smaller and fainter
      const r = b.maxR * (1 - Math.pow(1 - u, 2.2)) * (1 - 0.15 * b.i) + 0.3;
      m.scale.setScalar(r);
      const mu = m.material.uniforms;
      mu.uTime.value = t;
      mu.uAlpha.value = Math.min(1, b.t * 12) * Math.pow(1 - u, 1.6) * (1 - 0.25 * b.i) * 1.2 * b.k;
      mu.uRipple.value = 0.025;
    }
  }

  dispose() {
    for (const a of this.auras.values()) {
      this.scene.remove(a.mesh);
      a.mesh.material.dispose();
    }
    this.auras.clear();
    for (const b of this.blasts) this.free.push(b.mesh);
    this.blasts.length = 0;
    for (const m of this.free) {
      this.scene.remove(m);
      m.material.dispose();
    }
    this.free.length = 0;
    this.geo.dispose();
  }
}
