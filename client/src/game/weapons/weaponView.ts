import type { WeaponId } from '@mp-fps/shared';
import * as THREE from 'three';
import { MuzzleFlashModel } from '../effects/muzzleFlash';
import { createGunModel } from './gunModels';

/** Walk bob strength from the hip and while aiming down sights (aiming used to damp it to 0.15). */
const HIP_BOB = 1.3;
const ADS_BOB = 0.6;
const SHOT_GLOW_MS = 80;
const SHOT_GLOW_INTENSITY = 4;
/** How far in front of the eye the gun sits while aiming down sights. */
const ADS_DISTANCE = 0.42;
const HIP_POSITION = new THREE.Vector3(0.2, -0.22, -0.55);
/** Where the gun drifts while airborne: closer to the middle of the screen. */
const JUMP_POSITION = new THREE.Vector3(0.08, -0.17, -0.52);
const SLEEVE = new THREE.MeshStandardMaterial({ color: 0x4a4f3c, roughness: 0.9 });
const GLOVE = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.75 });

/** A box stretched between two points (forearms). */
function segment(from: THREE.Vector3, to: THREE.Vector3, thickness: number, material: THREE.Material): THREE.Mesh {
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, length), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.lookAt(to);
  return mesh;
}

function createArms(sightHeight: number): THREE.Group {
  const arms = new THREE.Group();
  const rightHand = new THREE.Vector3(0.01, -0.09, 0.09);
  const leftHand = new THREE.Vector3(-0.01, -0.04 + sightHeight * 0.2, -0.3);
  arms.add(
    segment(rightHand, new THREE.Vector3(0.14, -0.3, 0.5), 0.085, SLEEVE),
    segment(leftHand, new THREE.Vector3(-0.2, -0.32, 0.25), 0.085, SLEEVE),
  );
  for (const hand of [rightHand, leftHand]) {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.1), GLOVE);
    glove.position.copy(hand);
    arms.add(glove);
  }
  return arms;
}

export interface ViewState {
  ads: number;
  sprinting: boolean;
  /** 0..1 progress of an active reload, or -1. */
  reloadProgress: number;
  /** 0 = weapon fully lowered, 1 = ready. */
  raise: number;
  mouseDX: number;
  mouseDY: number;
  bob: number;
  bobSide: number;
  hidden: boolean;
  /** True while the player is in the air. */
  airborne: boolean;
}

/**
 * First-person weapon, rendered in its own scene and camera on top of the world
 * (so it never sticks into walls). Handles sway, bob, recoil kick and simple animations.
 */
export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 10);
  private readonly holder = new THREE.Group();
  private gun: THREE.Group | null = null;
  /** The viewmodel is drawn at a smaller scale than the world, so its flash is scaled down too. */
  private readonly flash = new MuzzleFlashModel(0.45);
  private kick = 0;
  private readonly sway = new THREE.Vector2();
  private sprint = 0;
  private air = 0;
  /** Spin speed of a rotary barrel cluster (radians/s); spins up when firing, winds down after. */
  private barrelSpin = 0;
  private sightHeight = 0.06;
  /** Gun extent along the barrel (model z), for the aiming depth of field. */
  private gunRearZ = 0.3;
  private gunLength = 1;
  /** Lights up our own gun and hands when the flashlight is on. */
  private readonly flashlightGlow = new THREE.PointLight(0xfff1dc, 0, 2, 2);
  /** Warm burst from each shot lighting up our own gun and hands (always present, dimmed to 0 between shots). */
  private readonly shotGlow = new THREE.PointLight(0xffa64d, 0, 1.6, 2);
  private shotGlowAt = 0;

  /** brightness: 1 for daylight maps, lower at night so the gun doesn't glow in the dark. */
  constructor(
    environment: THREE.Texture,
    sunColor: number,
    sunDirection: THREE.Vector3,
    brightness = 1,
    skyLightColor = 0xbcd4ff,
  ) {
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.6 * brightness;
    const sun = new THREE.DirectionalLight(sunColor, 2.2 * brightness);
    sun.position.copy(sunDirection);
    this.scene.add(sun, new THREE.HemisphereLight(skyLightColor, 0x6b5a45, 0.5 * brightness), this.holder);
    this.flashlightGlow.position.set(0.25, -0.05, -0.6);
    this.camera.add(this.flashlightGlow);
    this.scene.add(this.camera);
    window.addEventListener('resize', this.onResize);
  }

  setWeapon(id: WeaponId | null): void {
    if (this.gun?.name === id) return;
    this.holder.clear();
    this.gun = id ? createGunModel(id) : null;
    if (!this.gun) return;
    this.sightHeight = this.gun.userData.sightHeight as number;
    const bounds = new THREE.Box3().setFromObject(this.gun);
    this.gunRearZ = bounds.max.z;
    this.gunLength = bounds.max.z - bounds.min.z;
    this.gun.add(createArms(this.sightHeight));
    this.gun.getObjectByName('muzzle')!.add(this.flash, this.shotGlow);
    // Slightly behind and above the muzzle so the light falls back along the barrel onto the hands.
    this.shotGlow.position.set(0, 0.05, 0.08);
    this.holder.add(this.gun);
  }

  /** Follows the main camera's rotation so lighting on the gun matches where we look. */
  syncRotation(worldCamera: THREE.Camera): void {
    this.camera.quaternion.copy(worldCamera.quaternion);
  }

  /**
   * Camera distance of the point 60% of the gun's length from its rear while aimed: the part closer than this
   * is blurred by the viewmodel depth of field.
   */
  get dofFocus(): number {
    return ADS_DISTANCE - this.gunRearZ + this.gunLength * 0.56;
  }

  setFlashlight(on: boolean): void {
    this.flashlightGlow.intensity = on ? 0.6 : 0;
  }

  fire(weaponId: WeaponId, strength: number): void {
    this.kick = Math.min(2, this.kick + strength);
    this.flash.fire(weaponId);
    this.shotGlowAt = performance.now();
    this.shotGlow.color.setHSL(0.07 + Math.random() * 0.03, 1, 0.6);
    this.barrelSpin = Math.min(40, this.barrelSpin + 6);
  }

  update(dt: number, s: ViewState): void {
    this.holder.visible = !s.hidden && this.gun !== null;
    this.flash.update();
    // Bright for a frame or two, then fades out over ~80 ms.
    const sinceShot = (performance.now() - this.shotGlowAt) / SHOT_GLOW_MS;
    this.shotGlow.intensity = sinceShot < 1 ? SHOT_GLOW_INTENSITY * (1 - sinceShot) * (1 - sinceShot) : 0;
    const barrels = this.gun?.getObjectByName('barrels');
    if (barrels) barrels.rotation.z += this.barrelSpin * dt;
    this.barrelSpin *= Math.exp(-2.5 * dt);
    this.kick *= Math.exp(-14 * dt);
    this.sprint += ((s.sprinting ? 1 : 0) - this.sprint) * Math.min(1, dt * 8);
    this.air += ((s.airborne ? 1 : 0) - this.air) * Math.min(1, dt * 7);

    // Sway lags behind mouse movement; less while aiming.
    const swayScale = 1 - s.ads * 0.85;
    this.sway.x += (THREE.MathUtils.clamp(-s.mouseDX * 0.00056, -0.042, 0.042) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(s.mouseDY * 0.00056, -0.042, 0.042) - this.sway.y) * Math.min(1, dt * 10);

    const adsPosition = new THREE.Vector3(0, -this.sightHeight, -ADS_DISTANCE);
    // Hip position slides toward the center while jumping; aiming down sights overrides both.
    const hip = HIP_POSITION.clone().lerp(JUMP_POSITION, this.air);
    const pos = hip.lerp(adsPosition, s.ads);
    const bobScale = THREE.MathUtils.lerp(HIP_BOB, ADS_BOB, s.ads);
    pos.x += this.sway.x * swayScale + s.bobSide * 0.5 * bobScale - this.sprint * 0.08;
    pos.y += this.sway.y * swayScale + s.bob * 0.6 * bobScale - this.sprint * 0.04 - (1 - s.raise) * 0.3;
    pos.z += this.kick * 0.05;

    const reloadDip = s.reloadProgress >= 0 ? Math.sin(Math.PI * s.reloadProgress) : 0;
    pos.y -= reloadDip * 0.08;

    this.holder.position.copy(this.camera.position).add(pos.applyQuaternion(this.camera.quaternion));
    this.holder.quaternion.copy(this.camera.quaternion);
    this.holder.rotateX(this.kick * 0.09 - reloadDip * 0.5 - this.sprint * 0.25 + s.bob * 0.5 * bobScale);
    this.holder.rotateY(this.sprint * 0.7 + this.sway.x * 2 * swayScale);
    this.holder.rotateZ(reloadDip * 0.4 + this.sprint * 0.2 + s.bobSide * 0.5 * bobScale);
    this.camera.fov = 55 - s.ads * 15;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
  }

  private readonly onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
}
