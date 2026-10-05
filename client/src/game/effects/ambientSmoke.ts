import type { Box, BuiltMap } from '@mp-fps/shared';
import * as THREE from 'three';
import { sceneDepthGlsl, sceneDepthUniforms } from './lateSmokePass';
import { seededRandom } from '../textures';

/** Wind the smoke drifts with, in m/s. */
const WIND = new THREE.Vector3(0.35, 0, 0.12);

/** Soft, lumpy smoke puff drawn once on a canvas. */
function smokeTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(17);
  for (let i = 0; i < 40; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * size * 0.22;
    const x = size / 2 + Math.cos(angle) * dist;
    const y = size / 2 + Math.sin(angle) * dist;
    const r = size * (0.12 + rand() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.12 + rand() * 0.12})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Fade the square edges away completely.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSpin;
  uniform float uTime;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vUv = uv;
    // Billboard: build the quad from the camera's right/up vectors.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float a = aSpin * uTime;
    vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * aSize;
    vec3 world = aOffset + right * p.x + up * p.y;
    vec4 view = viewMatrix * vec4(world, 1.0);
    // Fade puffs out as the camera walks into them, so they never pop.
    float dist = -view.z;
    vAlpha = aAlpha * smoothstep(0.5, aSize * 0.6, dist);
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  ${sceneDepthGlsl}
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    if (behindScene()) discard;
    float a = texture2D(uMap, vUv).a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

interface Puff {
  pos: THREE.Vector3;
}

/**
 * Banks of smoke hanging in the air outdoors and drifting with the wind.
 * All puffs are one instanced mesh, so the whole effect is a single draw call.
 */
export class AmbientSmoke {
  private readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly offsets: THREE.InstancedBufferAttribute;
  private readonly puffs: Puff[] = [];
  private readonly material: THREE.ShaderMaterial;
  private readonly rand = seededRandom(91);
  private readonly half: { x: number; z: number };
  private readonly roofs: Box[];

  /** add: puts the mesh into the right scene (see GameRenderer.addSmoke). */
  constructor(
    add: (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>) => void,
    map: BuiltMap,
    options: { count: number; color: number; opacity: number },
  ) {
    this.half = { x: map.width / 2, z: map.depth / 2 };
    // Anything tall that covers an area (buildings) keeps smoke out.
    this.roofs = map.blocks.filter((b) => b.max.y > 3);

    const count = options.count;
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const spins = new Float32Array(count);
    this.offsets = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    for (let i = 0; i < count; i++) {
      const pos = this.randomOutdoorPoint();
      this.puffs.push({ pos });
      this.offsets.setXYZ(i, pos.x, pos.y, pos.z);
      sizes[i] = 4 + this.rand() * 6;
      alphas[i] = options.opacity * (0.5 + this.rand() * 0.8);
      spins[i] = (this.rand() - 0.5) * 0.06;
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('aOffset', this.offsets);
    geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphas, 1));
    geometry.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spins, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        ...sceneDepthUniforms(),
        uMap: { value: smokeTexture() },
        uColor: { value: new THREE.Color(options.color) },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    add(this.mesh);
  }

  update(dt: number): void {
    this.material.uniforms.uTime.value += dt;
    this.puffs.forEach((puff, i) => {
      puff.pos.addScaledVector(WIND, dt * (0.7 + (i % 5) * 0.15));
      // Puffs that leave the map (or drift into a building) start again somewhere else.
      if (Math.abs(puff.pos.x) > this.half.x || Math.abs(puff.pos.z) > this.half.z || this.underRoof(puff.pos))
        puff.pos.copy(this.randomOutdoorPoint());
      this.offsets.setXYZ(i, puff.pos.x, puff.pos.y, puff.pos.z);
    });
    this.offsets.needsUpdate = true;
  }

  private underRoof(p: THREE.Vector3): boolean {
    return this.roofs.some((b) => p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z);
  }

  private randomOutdoorPoint(): THREE.Vector3 {
    const p = new THREE.Vector3();
    for (let tries = 0; tries < 30; tries++) {
      p.set((this.rand() * 2 - 1) * this.half.x, 0.8 + this.rand() * 4, (this.rand() * 2 - 1) * this.half.z);
      if (!this.underRoof(p)) break;
    }
    return p;
  }
}
