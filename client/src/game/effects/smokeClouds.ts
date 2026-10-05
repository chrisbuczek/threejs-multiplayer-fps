import { SMOKE_RADIUS, SMOKE_SECONDS, raycastBoxes, type Box } from '@mp-fps/shared';
import * as THREE from 'three';
import { sceneDepthGlsl, sceneDepthUniforms } from './lateSmokePass';
import { seededRandom } from '../textures';

const MAX_CLOUDS = 6;
const PUFFS_PER_CLOUD = 110;
/** Seconds for a fresh cloud to billow out to full size, and to thin out at the end. */
const GROW_SECONDS = 2.5;
const FADE_SECONDS = 4;

function puffTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(5);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * size * 0.2;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const r = size * (0.15 + rand() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.55 + rand() * 0.25})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
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
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float a = aSpin * uTime;
    vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * aSize;
    vec4 view = viewMatrix * vec4(aOffset + right * p.x + up * p.y, 1.0);
    // Only fade puffs that are practically touching the camera; inside the cloud you should be blind.
    vAlpha = aAlpha * smoothstep(0.15, 0.6, -view.z);
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

interface Cloud {
  center: THREE.Vector3;
  age: number;
  /** Per puff: direction it billows out to, final distance, height and size. */
  puffs: { dir: THREE.Vector3; reach: number; size: number; alpha: number }[];
}

/**
 * Smoke grenade clouds: a dense ball of billboard puffs that billows out, hangs for a while
 * and thins away. One instanced mesh (one draw call) for all clouds.
 */
export class SmokeClouds {
  private readonly clouds: (Cloud | null)[] = new Array(MAX_CLOUDS).fill(null);
  private next = 0;
  private readonly offsets: THREE.InstancedBufferAttribute;
  private readonly sizes: THREE.InstancedBufferAttribute;
  private readonly alphas: THREE.InstancedBufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    add: (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>) => void,
    private readonly world: Box[],
    light: number,
  ) {
    const count = MAX_CLOUDS * PUFFS_PER_CLOUD;
    this.offsets = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.sizes = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.alphas = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    const spins = new Float32Array(count).map(() => (Math.random() - 0.5) * 0.15);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('aOffset', this.offsets);
    geometry.setAttribute('aSize', this.sizes);
    geometry.setAttribute('aAlpha', this.alphas);
    geometry.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spins, 1));
    const grey = THREE.MathUtils.clamp(light, 0.08, 1) * 0.78;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        ...sceneDepthUniforms(),
        uMap: { value: puffTexture() },
        uColor: { value: new THREE.Color(grey, grey, grey * 1.02) },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, this.material, count);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    add(mesh);
  }

  spawn(at: THREE.Vector3): void {
    const center = at.clone().setY(Math.max(at.y, 0) + 0.9);
    const puffs = Array.from({ length: PUFFS_PER_CLOUD }, () => {
      // Mostly sideways and low, like real smoke spreading along the ground.
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.45, Math.random() * 2 - 1).normalize();
      // Don't let the smoke billow through walls: stop each puff short of the first obstacle.
      // Filled all the way to the center, not just a shell.
      const reach = SMOKE_RADIUS * Math.sqrt(Math.random());
      const wall = raycastBoxes(center, dir, this.world, reach);
      const free = wall ? Math.max(0.3, wall.distance - 0.8) : reach;
      return { dir, reach: free, size: 3 + Math.random() * 3, alpha: 0.85 + Math.random() * 0.15 };
    });
    this.clouds[this.next] = { center, age: 0, puffs };
    this.next = (this.next + 1) % MAX_CLOUDS;
  }

  update(dt: number): void {
    this.material.uniforms.uTime.value += dt;
    this.clouds.forEach((cloud, c) => {
      const base = c * PUFFS_PER_CLOUD;
      if (cloud) cloud.age += dt;
      if (cloud && cloud.age > SMOKE_SECONDS) this.clouds[c] = null;
      const live = this.clouds[c];
      for (let i = 0; i < PUFFS_PER_CLOUD; i++) {
        if (!live) {
          this.alphas.setX(base + i, 0);
          continue;
        }
        const p = live.puffs[i];
        const grow = 1 - Math.pow(1 - Math.min(1, live.age / GROW_SECONDS), 3);
        const fade = Math.min(1, (SMOKE_SECONDS - live.age) / FADE_SECONDS);
        const drift = live.age * 0.05;
        this.offsets.setXYZ(
          base + i,
          live.center.x + p.dir.x * p.reach * grow,
          live.center.y + p.dir.y * p.reach * grow + drift,
          live.center.z + p.dir.z * p.reach * grow,
        );
        this.sizes.setX(base + i, p.size * (0.4 + 0.6 * grow) * (1 + live.age * 0.02));
        this.alphas.setX(base + i, p.alpha * Math.min(1, live.age * 3) * fade);
      }
    });
    this.offsets.needsUpdate = this.sizes.needsUpdate = this.alphas.needsUpdate = true;
  }
}
