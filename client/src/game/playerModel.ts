import type { Team, WeaponId } from '@mp-fps/shared';
import * as THREE from 'three';
import { createGunModel } from './weapons/gunModels';

const UNIFORM: Record<Team, { cloth: number; vest: number; accent: number }> = {
  red: { cloth: 0x8a7556, vest: 0x5b4a33, accent: 0xc0392b },
  blue: { cloth: 0x3d4a5c, vest: 0x262f3b, accent: 0x2e86de },
  none: { cloth: 0x5a6148, vest: 0x3b4030, accent: 0xd0d0d0 },
};
const SKIN = new THREE.MeshStandardMaterial({ color: 0xc69c7c, roughness: 0.7 });
const BOOTS = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.8 });

const THIGH = 0.45;
const SHIN = 0.45;

function limb(width: number, length: number, material: THREE.Material): THREE.Group {
  // Pivot at the top so rotations swing it like a joint.
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, width), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/**
 * Simple jointed soldier. Proportions match the server hitboxes
 * (head center at 1.62 m standing, 1.05 m crouched).
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly arms = new THREE.Group();
  private readonly thighs: THREE.Group[] = [];
  private readonly shins: THREE.Group[] = [];
  private gun: THREE.Group | null = null;
  private walkPhase = 0;
  private crouchAmount = 0;

  constructor(team: Team) {
    const colors = UNIFORM[team];
    const cloth = new THREE.MeshStandardMaterial({ color: colors.cloth, roughness: 0.9 });
    const vest = new THREE.MeshStandardMaterial({ color: colors.vest, roughness: 0.8 });
    const accent = new THREE.MeshStandardMaterial({
      color: colors.accent,
      roughness: 0.6,
      emissive: colors.accent,
      emissiveIntensity: 0.15,
    });

    for (const side of [-1, 1]) {
      const thigh = limb(0.17, THIGH, cloth);
      thigh.position.x = side * 0.11;
      const shin = limb(0.15, SHIN, cloth);
      shin.position.y = -THIGH;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.26), BOOTS);
      boot.position.set(0, -SHIN, -0.04);
      boot.castShadow = true;
      shin.add(boot);
      thigh.add(shin);
      this.hips.add(thigh);
      this.thighs.push(thigh);
      this.shins.push(shin);
    }

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.26), cloth);
    chest.position.y = 0.28;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.3), vest);
    plate.position.y = 0.32;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.28), accent);
    band.position.y = 0.48;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), SKIN);
    head.position.y = 0.72;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), vest);
    helmet.position.y = 0.74;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.03, 0.31), accent);
    stripe.position.y = 0.76;
    for (const m of [chest, plate, head, helmet]) m.castShadow = true;
    this.torso.add(chest, plate, band, head, helmet, stripe);

    // Arms reach forward to hold the weapon; the whole group tilts with aim pitch.
    this.arms.position.y = 0.48;
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.45), cloth);
      arm.position.set(side * 0.17, -0.08, -0.2);
      arm.rotation.y = side * 0.25;
      arm.castShadow = true;
      this.arms.add(arm);
    }
    this.torso.add(this.arms);
    this.hips.add(this.torso);
    this.root.add(this.hips);
  }

  setWeapon(id: WeaponId | null): void {
    if (this.gun?.name === id) return;
    if (this.gun) this.arms.remove(this.gun);
    this.gun = id ? createGunModel(id) : null;
    if (this.gun) {
      this.gun.position.set(0.05, -0.1, -0.35);
      this.arms.add(this.gun);
    }
  }

  getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    const muzzle = this.gun?.getObjectByName('muzzle');
    return muzzle
      ? muzzle.getWorldPosition(target)
      : this.root.getWorldPosition(target).setY(this.root.position.y + 1.4);
  }

  animate(dt: number, speed: number, crouching: boolean, pitch: number): void {
    this.crouchAmount += ((crouching ? 1 : 0) - this.crouchAmount) * Math.min(1, dt * 12);
    this.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(this.walkPhase) * Math.min(speed / 5, 1) * 0.6;
    const c = this.crouchAmount;

    this.thighs[0].rotation.x = swing * (1 - c) + 1.4 * c;
    this.thighs[1].rotation.x = -swing * (1 - c) + 1.4 * c;
    this.shins[0].rotation.x = -Math.max(0, swing) * 0.8 * (1 - c) - 1.99 * c;
    this.shins[1].rotation.x = -Math.max(0, -swing) * 0.8 * (1 - c) - 1.99 * c;
    this.hips.position.y = THREE.MathUtils.lerp(THIGH + SHIN, 0.45, c);
    this.torso.rotation.x = -0.5 * c;
    this.arms.rotation.x = pitch + 0.5 * c;
  }
}
