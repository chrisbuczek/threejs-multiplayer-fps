import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const SAMPLES = 48;
/** The occlusion image is rendered at this fraction of the screen size (rays are soft anyway). */
const OCCLUSION_SCALE = 0.25;

const shader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tOcclusion: { value: null as THREE.Texture | null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: 1 },
    uColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uIntensity: { value: 0 },
    uFlare: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tOcclusion;
    uniform vec2 uSun;
    uniform float uAspect;
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uFlare;
    varying vec2 vUv;

    // Soft disc (ring = 0) or thin ring (ring = 1) of a lens ghost.
    float ghost(vec2 uv, vec2 center, float radius, float ring) {
      float d = length((uv - center) * vec2(uAspect, 1.0));
      float disc = 1.0 - smoothstep(radius * 0.6, radius, d);
      float edge = 1.0 - smoothstep(0.0, radius * 0.12, abs(d - radius * 0.9));
      return mix(disc, edge, ring);
    }

    vec3 lensFlare(vec2 uv) {
      // How much of the sun is unblocked: average the occlusion image around it.
      float visible = 0.0;
      for (int i = 0; i < 9; i++) {
        vec2 o = vec2(float(i - (i / 3) * 3) - 1.0, float(i / 3) - 1.0) * 0.006;
        visible += texture2D(tOcclusion, uSun + o).r;
      }
      visible /= 9.0;
      if (visible <= 0.0) return vec3(0.0);

      vec2 toSun = (uv - uSun) * vec2(uAspect, 1.0);
      float dist = length(toSun);
      // Halo ring and starburst streaks around the sun.
      vec3 f = vec3(1.0, 0.9, 0.75) * (1.0 - smoothstep(0.0, 0.06, abs(dist - 0.16))) * 0.25;
      float angle = atan(toSun.y, toSun.x);
      f += vec3(1.0, 0.95, 0.85) * pow(abs(cos(angle * 6.0)), 40.0) * exp(-dist * 9.0) * 0.6;
      f += vec3(1.0, 0.95, 0.85) * exp(-dist * 22.0) * 0.5;

      // Ghosts on the line from the sun through the screen center.
      vec2 axis = vec2(0.5) - uSun;
      f += vec3(0.4, 0.7, 1.0) * ghost(uv, uSun + axis * 0.6, 0.035, 0.0) * 0.18;
      f += vec3(1.0, 0.6, 0.3) * ghost(uv, uSun + axis * 1.0, 0.06, 1.0) * 0.22;
      f += vec3(0.5, 1.0, 0.6) * ghost(uv, uSun + axis * 1.3, 0.02, 0.0) * 0.25;
      f += vec3(0.7, 0.5, 1.0) * ghost(uv, uSun + axis * 1.6, 0.09, 0.0) * 0.1;
      f += vec3(1.0, 0.8, 0.5) * ghost(uv, uSun + axis * 2.0, 0.14, 1.0) * 0.12;
      return f * visible;
    }

    // Only open sky close to the sun emits rays.
    float source(vec2 uv) {
      vec2 d = (uv - uSun) * vec2(uAspect, 1.0);
      float glow = 1.0 - smoothstep(0.0, 0.5, length(d));
      return texture2D(tOcclusion, uv).r * glow;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (uIntensity <= 0.0) { gl_FragColor = color; return; }
      // March from this pixel toward the sun, collecting unblocked sky light.
      vec2 step = (vUv - uSun) / float(${SAMPLES}) * 0.9;
      vec2 uv = vUv;
      float decay = 1.0;
      float light = 0.0;
      for (int i = 0; i < ${SAMPLES}; i++) {
        uv -= step;
        light += source(uv) * decay;
        decay *= 0.965;
      }
      light /= float(${SAMPLES});
      color.rgb += uColor * light * uIntensity;
      if (uFlare > 0.0) color.rgb += lensFlare(vUv) * uFlare;
      gl_FragColor = color;
    }
  `,
};

/**
 * Sun light shafts (god rays) in screen space: sky around the sun is smeared toward the viewer,
 * and anything standing in front of it (buildings, cars, players) cuts dark gaps into the rays.
 */
export class LightShaftsPass extends ShaderPass {
  private readonly occlusion: THREE.WebGLRenderTarget;
  private readonly black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly sunDirection: THREE.Vector3;
  private readonly strength: number;
  private readonly flareStrength: number;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sky: THREE.Object3D,
    options: { sunDirection: THREE.Vector3; color: number; intensity: number; flare: number },
  ) {
    super(shader);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(OCCLUSION_SCALE);
    this.occlusion = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y));
    this.uniforms.tOcclusion.value = this.occlusion.texture;
    this.uniforms.uColor.value.set(options.color);
    this.sunDirection = options.sunDirection.clone().normalize();
    this.strength = options.intensity;
    this.flareStrength = options.flare;
  }

  /** Call once per frame before the composer renders. */
  update(): void {
    const u = this.uniforms;
    // Fade out as the sun leaves the view (and switch off when it is behind us).
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const facing = THREE.MathUtils.smoothstep(forward.dot(this.sunDirection), 0.2, 0.75);
    u.uIntensity.value = this.strength * facing;
    u.uFlare.value = 0;
    if (facing <= 0) return;

    const sun = this.camera.position.clone().addScaledVector(this.sunDirection, 1000).project(this.camera);
    u.uSun.value.set(sun.x * 0.5 + 0.5, sun.y * 0.5 + 0.5);
    // Lens flare only while the sun itself is on screen, fading near the edges.
    const edge = Math.max(Math.abs(sun.x), Math.abs(sun.y));
    u.uFlare.value = this.flareStrength * (1 - THREE.MathUtils.smoothstep(edge, 0.85, 1));
    u.uAspect.value = this.camera.aspect;

    // Occlusion image: sky white, everything else black.
    const r = this.renderer;
    const clearColor = r.getClearColor(new THREE.Color());
    const clearAlpha = r.getClearAlpha();
    const fog = this.scene.fog;
    this.sky.visible = false;
    // Only solid geometry can hide the sun: smoke, tracers, muzzle flashes, decals and other see-through
    // effects would otherwise flash in front of it and switch the rays off with every shot.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverseVisible((o) => {
      if (isSeeThrough(o)) hidden.push(o);
    });
    for (const o of hidden) o.visible = false;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.black;
    r.setRenderTarget(this.occlusion);
    r.setClearColor(0xffffff, 1);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.setClearColor(clearColor, clearAlpha);
    this.scene.overrideMaterial = null;
    this.scene.fog = fog;
    for (const o of hidden) o.visible = true;
    this.sky.visible = true;
  }

  setSize(width: number, height: number): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(OCCLUSION_SCALE);
    this.occlusion.setSize(Math.max(1, size.x), Math.max(1, size.y));
    super.setSize(width, height);
  }
}

function isSeeThrough(o: THREE.Object3D): boolean {
  if (o instanceof THREE.Points || o instanceof THREE.Sprite) return true;
  if (!(o instanceof THREE.Mesh)) return false;
  const materials = Array.isArray(o.material) ? o.material : [o.material];
  return materials.some((m: THREE.Material) => m.transparent || m.blending === THREE.AdditiveBlending);
}
