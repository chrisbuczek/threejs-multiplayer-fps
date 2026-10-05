import * as THREE from 'three';

/** Strongest blur radius (pixels at 1080p) for the part of the gun right in front of the eye. */
const MAX_BLUR_PX = 7;
/** Distance over which the blur ramps from zero (at the focus point) to full, in meters. */
const RAMP = 0.25;
const TAPS = 16;

export interface DofSettings {
  /** Camera distance (m) of the sharp point; everything closer is blurred. */
  focus: number;
  /** 0 = off, 1 = fully aimed down sights. */
  amount: number;
}

const fragmentShader = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uFocus;
  uniform float uRamp;
  uniform float uMaxBlur;
  varying vec2 vUv;

  float distanceAt(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return -perspectiveDepthToViewZ(d, uNear, uFar);
  }

  // Blur radius (pixels) for a point at this camera distance: 0 beyond the focus, growing toward the eye.
  float cocAt(vec2 uv) {
    if (texture2D(tDepth, uv).x >= 1.0) return 0.0;
    return uMaxBlur * clamp((uFocus - distanceAt(uv)) / uRamp, 0.0, 1.0);
  }

  void main() {
    // Background pixels borrow the blur of nearby gun pixels so blurred edges spill softly outward.
    float coc = cocAt(vUv);
    if (coc < 0.5) {
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        coc = max(coc, cocAt(vUv + vec2(cos(a), sin(a)) * uTexel * uMaxBlur) * 0.8);
      }
    }
    vec4 sum = texture2D(tColor, vUv);
    sum.rgb *= sum.a;
    float weight = 1.0;
    if (coc >= 0.5) {
      // Golden-angle disk of samples.
      for (int i = 1; i < ${TAPS}; i++) {
        float r = sqrt(float(i) / float(${TAPS})) * coc;
        float a = float(i) * 2.39996;
        vec4 c = texture2D(tColor, vUv + vec2(cos(a), sin(a)) * r * uTexel);
        sum += vec4(c.rgb * c.a, c.a);
        weight += 1.0;
      }
    }
    sum /= weight;
    if (sum.a < 0.002) discard;
    gl_FragColor = vec4(sum.rgb / sum.a, sum.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Depth of field for the first-person weapon while aiming: the part of the gun near the eye goes soft,
 * the sights and barrel stay sharp. The weapon is drawn into its own target, then composited blurred.
 */
export class ViewmodelDof {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          tColor: { value: this.target.texture },
          tDepth: { value: this.target.depthTexture },
          uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
          uNear: { value: 0.01 },
          uFar: { value: 10 },
          uFocus: { value: 0.6 },
          uRamp: { value: RAMP },
          uMaxBlur: { value: 0 },
        },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Draws the weapon scene on top of what's already on screen, blurred near the eye. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, settings: DofSettings): void {
    const r = this.renderer;
    const previousClearAlpha = r.getClearAlpha();
    r.setRenderTarget(this.target);
    r.setClearAlpha(0);
    r.clear(true, true, false);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.setClearAlpha(previousClearAlpha);

    const u = this.quad.material.uniforms;
    const height = r.getDrawingBufferSize(new THREE.Vector2()).y;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFocus.value = settings.focus;
    u.uMaxBlur.value = MAX_BLUR_PX * settings.amount * (height / 1080);
    r.render(this.scene, this.camera);
  }

  setSize(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.quad.material.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
  }

  dispose(): void {
    this.target.dispose();
    this.quad.material.dispose();
  }
}
