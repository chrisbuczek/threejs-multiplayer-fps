import * as THREE from 'three';
import { createSoftCircleTexture } from '../textures';

export interface ParticleOptions {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  size: number;
  /** Size added per second (smoke and mist expand). */
  growth?: number;
  color: THREE.Color;
  alpha?: number;
  gravity?: number;
  /** Fraction of velocity lost per second. */
  drag?: number;
}

interface Particle extends Required<ParticleOptions> {
  age: number;
}

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uLight;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * uLight, tex.a * vAlpha);
  }
`;

/**
 * Pooled CPU-simulated particles drawn as one THREE.Points object (a single draw call).
 * Used for blood mist, dust puffs and sparks.
 */
export class ParticleSystem {
  private readonly particles: Particle[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly colors: Float32Array;

  constructor(
    scene: THREE.Scene,
    private readonly max: number,
    additive: boolean,
    light = 1,
  ) {
    this.positions = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.colors = new Float32Array(max * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uMap: { value: createSoftCircleTexture() }, uScale: { value: 500 }, uLight: { value: light } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    scene.add(points);
  }

  emit(options: ParticleOptions): void {
    if (this.particles.length >= this.max) this.particles.shift();
    this.particles.push({
      growth: 0,
      alpha: 1,
      gravity: 0,
      drag: 0,
      ...options,
      position: options.position.clone(),
      velocity: options.velocity.clone(),
      color: options.color.clone(),
      age: 0,
    });
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      p.velocity.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.position.addScaledVector(p.velocity, dt);
      p.size += p.growth * dt;
    }
    this.particles.forEach((p, i) => {
      p.position.toArray(this.positions, i * 3);
      p.color.toArray(this.colors, i * 3);
      this.sizes[i] = p.size;
      // Fade out over the last 60% of life.
      this.alphas[i] = p.alpha * Math.min(1, (1 - p.age / p.life) / 0.6);
    });
    this.geometry.setDrawRange(0, this.particles.length);
    for (const name of ['position', 'aSize', 'aAlpha', 'aColor']) this.geometry.attributes[name].needsUpdate = true;
  }
}
