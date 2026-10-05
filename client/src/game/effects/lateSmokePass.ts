import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/** Uniforms smoke shaders share with the late pass so they can depth-test against the scene manually. */
export interface SceneDepthUniforms {
  tSceneDepth: { value: THREE.Texture | null };
  uResolution: { value: THREE.Vector2 };
  uCameraNear: { value: number };
  uCameraFar: { value: number };
}

export const sceneDepthUniforms = (): SceneDepthUniforms => ({
  tSceneDepth: { value: null },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uCameraNear: { value: 0.05 },
  uCameraFar: { value: 2000 },
});

/** GLSL for smoke fragment shaders: discard fragments hidden behind solid scene geometry. */
export const sceneDepthGlsl = /* glsl */ `
  #ifdef USE_SCENE_DEPTH
    uniform sampler2D tSceneDepth;
    uniform vec2 uResolution;
    bool behindScene() {
      return gl_FragCoord.z > texture2D(tSceneDepth, gl_FragCoord.xy / uResolution).x;
    }
  #else
    bool behindScene() { return false; }
  #endif
`;

/**
 * Draws smoke after ambient occlusion. GTAO darkens the finished image from solid geometry only, so smoke drawn
 * before it would show dark object outlines through it. The smoke depth-tests against GTAO's depth texture itself.
 */
export class LateSmokePass extends Pass {
  readonly scene = new THREE.Scene();
  private readonly materials: THREE.ShaderMaterial[] = [];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly depth: () => THREE.Texture,
  ) {
    super();
    this.needsSwap = false;
  }

  /** Registers a smoke material: it switches to manual depth testing. */
  adopt(material: THREE.ShaderMaterial): void {
    material.defines = { ...material.defines, USE_SCENE_DEPTH: '' };
    material.depthTest = false;
    material.needsUpdate = true;
    this.materials.push(material);
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const depth = this.depth();
    for (const m of this.materials) {
      const u = m.uniforms as unknown as SceneDepthUniforms;
      u.tSceneDepth.value = depth;
      u.uResolution.value.set(read.width, read.height);
    }
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }
}
