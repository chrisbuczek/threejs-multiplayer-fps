import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { GraphicsQuality } from '../settings';
import { LateSmokePass } from './effects/lateSmokePass';
import { LightShaftsPass } from './effects/lightShafts';
import { MotionBlurPass } from './effects/motionBlur';
import { ViewmodelDof, type DofSettings } from './effects/viewmodelDof';

/**
 * WebGL renderer + post-processing chain:
 * scene → ambient occlusion (GTAO) → bloom → camera motion blur → tone mapping (ACES) → SMAA anti-aliasing.
 * The first-person weapon is drawn afterwards in its own pass so it never clips into walls.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly motionBlur: MotionBlurPass;
  private readonly viewmodelDof: ViewmodelDof;
  private lightShafts: LightShaftsPass | null = null;
  /** Smoke drawn after ambient occlusion (only when AO is on). */
  readonly lateSmoke: LateSmokePass | null = null;

  constructor(
    container: HTMLElement,
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    quality: GraphicsQuality,
    exposure: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    const maxRatio = quality === 'ultra' ? 2 : quality === 'high' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);

    const width = window.innerWidth;
    const height = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality === 'high' || quality === 'ultra') {
      const aoPass = new GTAOPass(scene, camera, width, height);
      aoPass.blendIntensity = 0.85;
      aoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1 });
      this.composer.addPass(aoPass);
      this.lateSmoke = new LateSmokePass(camera, () => aoPass.depthTexture);
      this.composer.addPass(this.lateSmoke);
    }
    if (quality !== 'low')
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.25, 0.5, 0.95));
    this.motionBlur = new MotionBlurPass(camera);
    this.composer.addPass(this.motionBlur);
    this.composer.addPass(new OutputPass());
    if (quality !== 'low') this.composer.addPass(new SMAAPass());

    this.viewmodelDof = new ViewmodelDof(this.renderer);
    window.addEventListener('resize', this.onResize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Adds sun light shafts right before motion blur (so they blur with the camera too). */
  enableLightShafts(
    scene: THREE.Scene,
    sky: THREE.Object3D,
    options: { sunDirection: THREE.Vector3; color: number; intensity: number; flare: number },
  ): void {
    this.lightShafts = new LightShaftsPass(this.renderer, scene, this.camera, sky, options);
    this.composer.insertPass(this.lightShafts, this.composer.passes.indexOf(this.motionBlur));
  }

  /** Adds a smoke effect: after ambient occlusion when that is on, otherwise straight into the world. */
  addSmoke(world: THREE.Scene, mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>): void {
    if (!this.lateSmoke) return void world.add(mesh);
    this.lateSmoke.adopt(mesh.material);
    this.lateSmoke.scene.add(mesh);
  }

  set motionBlurEnabled(enabled: boolean) {
    this.motionBlur.enabled = enabled;
  }

  render(overlayScene: THREE.Scene, overlayCamera: THREE.PerspectiveCamera, dt: number, dof?: DofSettings): void {
    this.motionBlur.updateCamera(dt);
    this.lightShafts?.update();
    this.renderer.autoClear = true;
    this.composer.render();
    // Weapon viewmodel on top, with a cleared depth buffer (blurred near the eye while aiming).
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    if (dof && dof.amount > 0.01) this.viewmodelDof.render(overlayScene, overlayCamera, dof);
    else this.renderer.render(overlayScene, overlayCamera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.viewmodelDof.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private readonly onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.viewmodelDof.setSize();
  };
}
