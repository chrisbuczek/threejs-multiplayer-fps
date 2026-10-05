import type { MapTheme } from '@mp-fps/shared';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { GraphicsQuality } from '../settings';

const SHADOW_SIZE: Record<GraphicsQuality, number> = { low: 1024, medium: 2048, high: 4096, ultra: 4096 };
/** Half-size of the area around the player covered by the sun's shadow map. */
const SHADOW_EXTENT = 45;

/**
 * Physically based outdoor lighting:
 * - analytic sky (also baked into an environment map → image based lighting / reflections)
 * - shadow-casting sun aligned with the sky's sun
 * - hemisphere fill light that fakes light bouncing off the ground
 * - exponential fog for atmospheric depth
 */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly environment: THREE.Texture;
  readonly sky: THREE.Object3D;
  readonly sunDirection: THREE.Vector3;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, theme: MapTheme, quality: GraphicsQuality) {
    const phi = THREE.MathUtils.degToRad(90 - theme.sunElevation);
    const theta = THREE.MathUtils.degToRad(theme.sunAzimuth);
    this.sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    const skyPhi = THREE.MathUtils.degToRad(90 - (theme.skyElevation ?? theme.sunElevation));
    const skySun = new THREE.Vector3().setFromSphericalCoords(1, skyPhi, theta);

    const sky = theme.skyGradient ? gradientSky(theme.skyGradient, skySun, theme.exposure) : physicalSky(theme, skySun);
    scene.add(sky);
    this.sky = sky;

    // Bake the sky into a prefiltered environment map for PBR reflections and ambient light.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    skyScene.add(sky.clone());
    this.environment = pmrem.fromScene(skyScene, 0, 1, 6000).texture;
    pmrem.dispose();
    scene.environment = this.environment;
    scene.environmentIntensity = theme.environmentIntensity ?? 0.6;

    this.sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    this.sun.castShadow = true;
    const shadow = this.sun.shadow;
    shadow.mapSize.setScalar(SHADOW_SIZE[quality]);
    shadow.camera.left = shadow.camera.bottom = -SHADOW_EXTENT;
    shadow.camera.right = shadow.camera.top = SHADOW_EXTENT;
    shadow.camera.near = 1;
    shadow.camera.far = 400;
    shadow.bias = -0.0003;
    shadow.normalBias = 0.04;
    shadow.radius = 2;
    scene.add(this.sun, this.sun.target);

    const fill = new THREE.HemisphereLight(
      theme.skyLightColor ?? 0xbcd4ff,
      theme.groundColor ?? theme.fogColor,
      theme.ambientIntensity ?? 0.25,
    );
    scene.add(fill);

    for (const lamp of theme.lamps) {
      if (lamp.style === 'ceiling') this.addCeilingLamp(scene, lamp);
      else this.addPoleLamp(scene, lamp);
    }

    if (theme.fogDensity > 0) scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
  }

  private addPoleLamp(scene: THREE.Scene, lamp: MapTheme['lamps'][number]): void {
    const light = new THREE.PointLight(lamp.color, lamp.intensity, 40, 2);
    light.position.set(lamp.position.x, lamp.position.y, lamp.position.z);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 8),
      new THREE.MeshStandardMaterial({ emissive: lamp.color, emissiveIntensity: 8, color: 0x000000 }),
    );
    bulb.position.copy(light.position);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, lamp.position.y, 8),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.4 }),
    );
    pole.position.set(lamp.position.x, lamp.position.y / 2, lamp.position.z);
    pole.castShadow = true;
    scene.add(light, bulb, pole);
  }

  /** Long fluorescent fixture mounted flat on the ceiling; position.y is the ceiling height. */
  private addCeilingLamp(scene: THREE.Scene, lamp: MapTheme['lamps'][number]): void {
    const { x, y, z } = lamp.position;
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.06, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 0.3, roughness: 0.5 }),
    );
    housing.position.set(x, y - 0.03, z);
    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.03, 0.18),
      new THREE.MeshStandardMaterial({ emissive: lamp.color, emissiveIntensity: 6, color: 0x000000 }),
    );
    tube.position.set(x, y - 0.07, z);
    const light = new THREE.PointLight(lamp.color, lamp.intensity, 14, 2);
    light.position.set(x, y - 0.4, z);
    scene.add(housing, tube, light);
  }

  /** The shadow map only covers the area around the player; snap it to texels to avoid shimmering edges. */
  /** Drifts the clouds of a painted sky. */
  update(dt: number): void {
    const material = (this.sky as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (material?.uniforms?.uTime) material.uniforms.uTime.value += dt;
  }

  follow(target: THREE.Vector3): void {
    const texel = (SHADOW_EXTENT * 2) / this.sun.shadow.mapSize.x;
    const x = Math.round(target.x / texel) * texel;
    const z = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x, 0, z).addScaledVector(this.sunDirection, 150);
    this.sun.target.updateMatrixWorld();
  }
}

function physicalSky(theme: MapTheme, sun: THREE.Vector3): THREE.Object3D {
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const u = sky.material.uniforms;
  u.turbidity.value = theme.turbidity;
  u.rayleigh.value = theme.rayleigh;
  u.mieCoefficient.value = theme.mieCoefficient ?? 0.005;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sun);
  return sky;
}

/** three.js ACES filmic tone mapping (same math as the shader), for linear RGB in 0..∞. */
function acesFilmic(c: number[], exposure: number): number[] {
  const mul = (m: number[][], v: number[]) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  const input = [
    [0.59719, 0.35458, 0.04823],
    [0.076, 0.90834, 0.01566],
    [0.0284, 0.13383, 0.83777],
  ];
  const output = [
    [1.60475, -0.53108, -0.07367],
    [-0.10208, 1.10813, -0.00605],
    [-0.00327, -0.07276, 1.07602],
  ];
  const rrt = (x: number) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081);
  const v = mul(
    input,
    c.map((x) => (x * exposure) / 0.6),
  ).map(rrt);
  return mul(output, v).map((x) => THREE.MathUtils.clamp(x, 0, 1));
}

/**
 * The renderer tone-maps the whole frame, which would dull a painted sky. Find the linear color that
 * comes out of tone mapping as exactly the requested color (simple fixed-point iteration).
 */
function colorBeforeToneMapping(hex: number, exposure: number): THREE.Color {
  const target = new THREE.Color(hex); // converted to linear
  const want = [target.r, target.g, target.b];
  const x = [...want];
  for (let i = 0; i < 400; i++) {
    const got = acesFilmic(x, exposure);
    for (let k = 0; k < 3; k++) x[k] = Math.max(0, x[k] + (want[k] - got[k]) * 0.5);
  }
  return new THREE.Color(x[0], x[1], x[2]);
}

/** Sky dome painted with a vertical gradient plus a soft glow around the sun; appears on screen in the given colors. */
function gradientSky(
  colors: { zenith: number; horizon: number; clouds?: number },
  sun: THREE.Vector3,
  exposure: number,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: colorBeforeToneMapping(colors.zenith, exposure) },
      uHorizon: { value: colorBeforeToneMapping(colors.horizon, exposure) },
      uSun: { value: sun.clone().normalize() },
      uCloudCover: { value: colors.clouds ?? 0 },
      uCloudLit: { value: colorBeforeToneMapping(0xf7f8fa, exposure) },
      uCloudShade: { value: colorBeforeToneMapping(0xb9c3d0, exposure) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always on the far plane
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      uniform float uCloudCover;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform float uTime;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
        return v;
      }

      void main() {
        vec3 dir = normalize(vDir);
        float up = clamp(dir.y, 0.0, 1.0);
        vec3 color = mix(uHorizon, uZenith, pow(up, 0.45));
        float sunAmount = max(dot(dir, uSun), 0.0);

        if (uCloudCover > 0.0 && dir.y > 0.01) {
          // Project onto a flat cloud layer so clouds shrink and bunch up toward the horizon.
          vec2 p = dir.xz / dir.y * 0.6 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = fbm(p);
          float density = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.3, n);
          // Lighter tops, greyer bellies; brighter where the sun shines through the edges.
          float shade = fbm(p * 2.0 + 5.0);
          vec3 cloud = mix(uCloudShade, uCloudLit, smoothstep(0.3, 0.7, shade) * 0.7 + 0.3 * (1.0 - density));
          cloud += vec3(1.0, 0.95, 0.85) * pow(sunAmount, 8.0) * (1.0 - density) * 0.6;
          // Fade the layer out near the horizon where it would get too dense and aliased.
          density *= smoothstep(0.02, 0.18, dir.y);
          color = mix(color, cloud, density);
          sunAmount *= 1.0 - density * 0.85; // clouds dim the sun disc
        }

        color += vec3(1.0, 0.97, 0.9) * (pow(sunAmount, 600.0) * 4.0 + pow(sunAmount, 12.0) * 0.12);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), material);
  dome.frustumCulled = false;
  return dome;
}
