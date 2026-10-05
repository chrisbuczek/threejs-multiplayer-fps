import { raycastBoxes, type Box } from '@mp-fps/shared';
import * as THREE from 'three';
import { Decals } from './decals';
import { MuzzleFlashes } from './muzzleFlash';
import { ParticleSystem } from './particles';
import { Tracers } from './tracers';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function randomDirection(): THREE.Vector3 {
  return new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
}

/** All short-lived visual effects in one place. */
export class Effects {
  readonly tracers: Tracers;
  readonly flashes: MuzzleFlashes;
  private readonly decals: Decals;
  private readonly smoke: ParticleSystem;
  private readonly sparks: ParticleSystem;
  private readonly pendingDecals: { at: number; run: () => void }[] = [];
  private readonly blasts: { light: THREE.PointLight; age: number }[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: Box[],
    light: number,
  ) {
    this.tracers = new Tracers(scene);
    this.flashes = new MuzzleFlashes(scene);
    this.decals = new Decals(scene);
    this.smoke = new ParticleSystem(scene, 1500, false, light);
    this.sparks = new ParticleSystem(scene, 300, true);
  }

  /** Bullet hitting a wall: hole, dust puff and a few sparks. */
  impact(point: THREE.Vector3, normal: THREE.Vector3): void {
    this.decals.bulletHole(point, normal);
    for (let i = 0; i < 6; i++) {
      this.smoke.emit({
        position: point,
        velocity: normal.clone().multiplyScalar(rand(0.5, 2)).add(randomDirection().multiplyScalar(0.5)),
        life: rand(0.5, 1),
        size: rand(0.08, 0.15),
        growth: 0.4,
        color: new THREE.Color(0.55, 0.5, 0.42),
        alpha: 0.6,
        drag: 3,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.sparks.emit({
        position: point,
        velocity: normal.clone().multiplyScalar(3).add(randomDirection().multiplyScalar(3)),
        life: rand(0.1, 0.3),
        size: 0.03,
        color: new THREE.Color(4, 2.5, 1),
        gravity: 9.8,
      });
    }
  }

  /** Small blood puff for non-lethal hits. */
  bloodHit(point: THREE.Vector3, direction: THREE.Vector3): void {
    for (let i = 0; i < 14; i++) {
      this.smoke.emit({
        position: point,
        velocity: direction.clone().multiplyScalar(rand(0.5, 2.5)).add(randomDirection().multiplyScalar(0.8)),
        life: rand(0.3, 0.7),
        size: rand(0.06, 0.14),
        growth: 0.3,
        color: new THREE.Color(0.35, 0.01, 0.01),
        alpha: 0.85,
        gravity: 3,
        drag: 2,
      });
    }
  }

  /** The big headshot effect: a dense red mist cloud, flying droplets and splatter on nearby surfaces. */
  headshotBurst(head: THREE.Vector3, direction: THREE.Vector3): void {
    for (let i = 0; i < 220; i++) {
      const color = new THREE.Color().setHSL(0, rand(0.85, 1), rand(0.12, 0.3));
      this.smoke.emit({
        position: head.clone().add(randomDirection().multiplyScalar(0.1)),
        velocity: direction
          .clone()
          .multiplyScalar(rand(0.5, 4))
          .add(randomDirection().multiplyScalar(rand(0.5, 3))),
        life: rand(0.9, 2),
        size: rand(0.12, 0.35),
        growth: rand(0.4, 0.9),
        color,
        alpha: rand(0.5, 0.9),
        gravity: 0.8,
        drag: 2.5,
      });
    }
    for (let i = 0; i < 50; i++) {
      this.smoke.emit({
        position: head,
        velocity: direction
          .clone()
          .multiplyScalar(rand(2, 6))
          .add(randomDirection().multiplyScalar(rand(1, 4))),
        life: rand(0.5, 1),
        size: rand(0.03, 0.06),
        color: new THREE.Color(0.3, 0, 0),
        gravity: 9.8,
        drag: 0.5,
      });
    }
    // Splatter: cast rays from the head (mostly backwards and down) and paint where they land.
    const origin = { x: head.x, y: head.y, z: head.z };
    for (let i = 0; i < 12; i++) {
      const dir = direction
        .clone()
        .add(randomDirection().multiplyScalar(0.9))
        .add(new THREE.Vector3(0, -0.6, 0))
        .normalize();
      const hit = raycastBoxes(origin, dir, this.world, 5);
      if (!hit) continue;
      const point = head.clone().addScaledVector(dir, hit.distance);
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      this.pendingDecals.push({
        at: performance.now() + hit.distance * 120,
        run: () => this.decals.bloodSplat(point, normal, rand(0.3, 0.9)),
      });
    }
  }

  /** Flashbang pop: a blinding white light, a burst of sparks and a puff of grey smoke. */
  flashBurst(center: THREE.Vector3): void {
    const light = new THREE.PointLight(0xffffff, 900, 30, 2);
    light.position.copy(center).setY(center.y + 0.3);
    this.scene.add(light);
    this.blasts.push({ light, age: 0 });
    for (let i = 0; i < 50; i++) {
      this.sparks.emit({
        position: center,
        velocity: randomDirection().multiplyScalar(rand(3, 10)),
        life: rand(0.1, 0.35),
        size: rand(0.05, 0.12),
        color: new THREE.Color(5, 5, 4.5),
        gravity: 4,
      });
    }
    for (let i = 0; i < 20; i++) {
      const grey = rand(0.4, 0.55);
      this.smoke.emit({
        position: center,
        velocity: randomDirection().multiplyScalar(rand(0.3, 1.5)),
        life: rand(1.5, 2.5),
        size: rand(0.4, 0.9),
        growth: 0.6,
        color: new THREE.Color(grey, grey, grey),
        alpha: 0.4,
        gravity: -0.2,
        drag: 2,
      });
    }
  }

  /** Thin wisp of gun smoke drifting out of the barrel after a shot. */
  muzzleSmoke(muzzle: THREE.Vector3, direction: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      const grey = rand(0.5, 0.7);
      this.smoke.emit({
        position: muzzle.clone().addScaledVector(direction, rand(0.05, 0.3)),
        velocity: direction
          .clone()
          .multiplyScalar(rand(0.6, 1.8))
          .add(new THREE.Vector3(0, rand(0.2, 0.5), 0)),
        life: rand(0.6, 1.2),
        size: rand(0.08, 0.16),
        growth: rand(0.3, 0.6),
        color: new THREE.Color(grey, grey, grey),
        alpha: rand(0.12, 0.25),
        gravity: -0.3,
        drag: 2.5,
      });
    }
  }

  /** Grenade blast: flash of light, fireball, flying debris and a slowly rising smoke cloud. */
  explosion(center: THREE.Vector3): void {
    const light = new THREE.PointLight(0xffa040, 400, 25, 2);
    light.position.copy(center).setY(center.y + 0.5);
    this.scene.add(light);
    this.blasts.push({ light, age: 0 });

    for (let i = 0; i < 60; i++) {
      this.sparks.emit({
        position: center,
        velocity: randomDirection()
          .multiplyScalar(rand(2, 7))
          .add(new THREE.Vector3(0, 2, 0)),
        life: rand(0.15, 0.45),
        size: rand(0.25, 0.6),
        color: new THREE.Color(rand(3, 5), rand(1.2, 2.2), 0.3),
        drag: 4,
      });
    }
    for (let i = 0; i < 40; i++) {
      this.sparks.emit({
        position: center,
        velocity: randomDirection()
          .multiplyScalar(rand(6, 14))
          .add(new THREE.Vector3(0, 4, 0)),
        life: rand(0.3, 0.9),
        size: 0.04,
        color: new THREE.Color(4, 2.5, 1),
        gravity: 9.8,
      });
    }
    for (let i = 0; i < 70; i++) {
      const grey = rand(0.18, 0.35);
      this.smoke.emit({
        position: center.clone().add(randomDirection().multiplyScalar(rand(0, 0.8))),
        velocity: randomDirection()
          .multiplyScalar(rand(0.5, 3))
          .add(new THREE.Vector3(0, rand(0.5, 1.5), 0)),
        life: rand(2, 4),
        size: rand(0.8, 1.6),
        growth: rand(0.6, 1.2),
        color: new THREE.Color(grey, grey * 0.95, grey * 0.9),
        alpha: rand(0.4, 0.7),
        gravity: -0.3,
        drag: 1.5,
      });
    }
    // Scorch marks on the floor and nearby walls.
    const origin = { x: center.x, y: center.y + 0.1, z: center.z };
    for (const dir of [
      { x: 0, y: -1, z: 0 },
      { x: 1, y: -0.3, z: 0 },
      { x: -1, y: -0.3, z: 0 },
      { x: 0, y: -0.3, z: 1 },
      { x: 0, y: -0.3, z: -1 },
    ]) {
      const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
      const hit = raycastBoxes(origin, d, this.world, 2.5);
      if (!hit) continue;
      const point = new THREE.Vector3(origin.x, origin.y, origin.z).addScaledVector(d, hit.distance);
      this.decals.scorch(point, new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), rand(1.2, 2));
    }
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.tracers.update(dt);
    this.flashes.update();
    this.smoke.update(dt, camera, viewportHeight);
    this.sparks.update(dt, camera, viewportHeight);
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i];
      blast.age += dt;
      blast.light.intensity = 400 * Math.max(0, 1 - blast.age / 0.35);
      if (blast.age < 0.35) continue;
      this.scene.remove(blast.light);
      blast.light.dispose();
      this.blasts.splice(i, 1);
    }
    const now = performance.now();
    for (let i = this.pendingDecals.length - 1; i >= 0; i--) {
      if (this.pendingDecals[i].at > now) continue;
      this.pendingDecals[i].run();
      this.pendingDecals.splice(i, 1);
    }
  }
}
