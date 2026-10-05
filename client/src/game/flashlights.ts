import { directionFromYawPitch, eyeHeight } from '@mp-fps/shared';
import * as THREE from 'three';
import { createSoftCircleTexture } from './textures';

/** Other players' flashlights that can shine at once (nearest ones win). */
const REMOTE_LIGHTS = 3;
const COLOR = 0xfff1dc;
const INTENSITY = 70;
const RANGE = 45;
/** Half-angle of the beam in radians. */
const ANGLE = 0.36;

function spotLight(): THREE.SpotLight {
  const light = new THREE.SpotLight(COLOR, 0, RANGE, ANGLE, 0.45, 1.6);
  light.target.position.set(0, 0, -1);
  return light;
}

export interface FlashlightOwner {
  position: THREE.Vector3;
  crouching: boolean;
  yaw: number;
  pitch: number;
}

/**
 * Gun-mounted flashlights. Every light exists all the time and is only dimmed to zero when off:
 * changing the number of lights would make three.js recompile every shader and stutter.
 */
export class Flashlights {
  private readonly local = spotLight();
  private readonly remote: { light: THREE.SpotLight; lens: THREE.Sprite }[] = [];

  constructor(scene: THREE.Scene, shadows: boolean) {
    this.local.castShadow = shadows;
    this.local.shadow.mapSize.setScalar(1024);
    this.local.shadow.bias = -0.0005;
    this.local.shadow.camera.near = 0.3;
    scene.add(this.local, this.local.target);

    const lensMaterial = new THREE.SpriteMaterial({
      map: createSoftCircleTexture(),
      color: new THREE.Color(4, 3.8, 3.4),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    for (let i = 0; i < REMOTE_LIGHTS; i++) {
      const light = spotLight();
      // The glowing lens you see when someone points their flashlight at you.
      const lens = new THREE.Sprite(lensMaterial.clone());
      lens.scale.setScalar(0.35);
      lens.visible = false;
      scene.add(light, light.target, lens);
      this.remote.push({ light, lens });
    }
  }

  update(camera: THREE.PerspectiveCamera, localOn: boolean, owners: FlashlightOwner[]): void {
    // Our own light sits a bit right of and below the eye, like a light on the gun.
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    this.local.position
      .copy(camera.position)
      .addScaledVector(right, 0.15)
      .add(new THREE.Vector3(0, -0.12, 0));
    this.local.target.position.copy(camera.position).addScaledVector(forward, 10);
    this.local.intensity = localOn ? INTENSITY : 0;

    const nearest = owners
      .map((o) => ({ o, d: o.position.distanceToSquared(camera.position) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, REMOTE_LIGHTS);
    this.remote.forEach(({ light, lens }, i) => {
      const owner = nearest[i]?.o;
      lens.visible = owner !== undefined;
      if (!owner) {
        light.intensity = 0;
        return;
      }
      const dir = new THREE.Vector3().copy(directionFromYawPitch(owner.yaw, owner.pitch));
      const side = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
      const eye = owner.position.clone().setY(owner.position.y + eyeHeight(owner.crouching) - 0.12);
      light.position.copy(eye).addScaledVector(side, 0.15).addScaledVector(dir, 0.5);
      light.target.position.copy(light.position).addScaledVector(dir, 10);
      light.intensity = INTENSITY;
      lens.position.copy(light.position);
      // The lens only glares when the beam points roughly toward us.
      const toCamera = camera.position.clone().sub(light.position).normalize();
      lens.material.opacity = THREE.MathUtils.clamp((dir.dot(toCamera) - 0.6) / 0.4, 0, 1);
    });
  }
}
