import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const SAMPLES = 10;
/** Blur length as a fraction of the motion during one 60 fps frame (like a camera shutter). */
const SHUTTER = 0.6;
/** Longest smear allowed, in screen UV units. */
const MAX_BLUR = 0.04;
/** Above this turn per frame (radians) the view was snapped (spawn, death cam): skip the blur. */
const SNAP_ANGLE = 0.5;

const shader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uInvViewProj: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uStrength: { value: 0 },
    uMaxBlur: { value: MAX_BLUR },
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
    uniform mat4 uInvViewProj;
    uniform mat4 uPrevViewProj;
    uniform float uStrength;
    uniform float uMaxBlur;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.0) { gl_FragColor = color; return; }

      // Where was this pixel's view direction on screen last frame? (Rotation only, so no depth is needed.)
      vec4 dir = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec4 prev = uPrevViewProj * vec4(dir.xyz / dir.w, 1.0);
      vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
      vec2 velocity = (vUv - prevUv) * uStrength;
      float len = length(velocity);
      if (len > uMaxBlur) velocity *= uMaxBlur / len;

      vec4 sum = color;
      for (int i = 1; i < ${SAMPLES}; i++) {
        float t = float(i) / float(${SAMPLES - 1}) - 0.5;
        sum += texture2D(tDiffuse, clamp(vUv + velocity * t, 0.0, 1.0));
      }
      gl_FragColor = sum / float(${SAMPLES});
    }
  `,
};

/**
 * Camera motion blur: smears the image along how the view turned since the last frame.
 * Only camera rotation counts, which is what makes fast flicks feel smooth in shooters.
 */
export class MotionBlurPass extends ShaderPass {
  private readonly prevQuaternion = new THREE.Quaternion();
  private hasPrevious = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    super(shader);
  }

  /** Call once per frame before rendering. */
  updateCamera(dt: number): void {
    const u = this.uniforms;
    const angle = this.hasPrevious ? this.prevQuaternion.angleTo(this.camera.quaternion) : Infinity;
    const viewProj = (q: THREE.Quaternion) =>
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        new THREE.Matrix4().makeRotationFromQuaternion(q).invert(),
      );

    u.uPrevViewProj.value.copy(viewProj(this.prevQuaternion));
    u.uInvViewProj.value.copy(viewProj(this.camera.quaternion)).invert();
    // Normalize to a 60 fps frame so the blur looks the same at any frame rate.
    u.uStrength.value = angle < SNAP_ANGLE && dt > 0 ? (SHUTTER * (1 / 60)) / dt : 0;

    this.prevQuaternion.copy(this.camera.quaternion);
    this.hasPrevious = true;
  }
}
