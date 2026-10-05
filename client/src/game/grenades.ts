import { stepGrenade, type Box, type GrenadeKind, type GrenadeState, type Vec3 } from '@mp-fps/shared';
import * as THREE from 'three';

const body = new THREE.MeshStandardMaterial({ color: 0x3d4a2c, metalness: 0.3, roughness: 0.6 });
const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.9, roughness: 0.35 });
const bodyGeometry = new THREE.SphereGeometry(0.055, 14, 10).scale(1, 1.25, 1);
const capGeometry = new THREE.CylinderGeometry(0.022, 0.026, 0.03, 10);
const leverGeometry = new THREE.BoxGeometry(0.012, 0.07, 0.008);

const smokeBody = new THREE.MeshStandardMaterial({ color: 0x5c6152, metalness: 0.4, roughness: 0.55 });
const flashBody = new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.6, roughness: 0.4 });
const flashBand = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.2, roughness: 0.5 });
const canGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14);
const bandGeometry = new THREE.CylinderGeometry(0.0355, 0.0355, 0.015, 14);

/** Smoke: an olive canister. Flashbang: a dark canister with a white band. Frag: the classic egg. */
function grenadeMesh(kind: GrenadeKind): THREE.Group {
  if (kind !== 'frag') {
    const group = new THREE.Group();
    const can = new THREE.Mesh(canGeometry, kind === 'smoke' ? smokeBody : flashBody);
    const cap = new THREE.Mesh(capGeometry, steel);
    cap.position.y = 0.072;
    const lever = new THREE.Mesh(leverGeometry, steel);
    lever.position.set(0.038, 0.03, 0);
    group.add(can, cap, lever);
    for (const y of kind === 'flash' ? [0.03, -0.03] : [0.035]) {
      const band = new THREE.Mesh(bandGeometry, kind === 'flash' ? flashBand : steel);
      band.position.y = y; // Object3D.position is read-only, so set it rather than assign a new vector
      group.add(band);
    }
    group.traverse((o) => (o.castShadow = true));
    return group;
  }
  const group = new THREE.Group();
  const cap = new THREE.Mesh(capGeometry, steel);
  cap.position.y = 0.075;
  const lever = new THREE.Mesh(leverGeometry, steel);
  lever.position.set(0.035, 0.05, 0);
  lever.rotation.z = -0.3;
  group.add(new THREE.Mesh(bodyGeometry, body), cap, lever);
  group.traverse((o) => (o.castShadow = true));
  return group;
}

interface FlyingGrenade {
  mesh: THREE.Group;
  state: GrenadeState;
  spin: THREE.Vector3;
}

/** Grenades in flight. The server sends the start state; we run the same shared physics locally. */
export class Grenades {
  private readonly flying = new Map<number, FlyingGrenade>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: Box[],
  ) {}

  /** `elapsed` = seconds already passed on the server since the throw (network latency). */
  add(id: number, kind: GrenadeKind, pos: Vec3, vel: Vec3, elapsed: number): void {
    const mesh = grenadeMesh(kind);
    const state = stepGrenade({ pos, vel }, Math.max(0, Math.min(0.3, elapsed)), this.world);
    const spin = new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 6, Math.random() * 12 - 6);
    this.flying.set(id, { mesh, state, spin });
    this.scene.add(mesh);
  }

  /** Removes the grenade and returns where it was. */
  remove(id: number): void {
    const g = this.flying.get(id);
    if (!g) return;
    this.scene.remove(g.mesh);
    this.flying.delete(id);
  }

  update(dt: number): void {
    for (const g of this.flying.values()) {
      g.state = stepGrenade(g.state, dt, this.world);
      const { pos, vel } = g.state;
      g.mesh.position.set(pos.x, pos.y, pos.z);
      // Spin while flying, settle once it stops rolling.
      const speed = Math.min(1, Math.hypot(vel.x, vel.y, vel.z) / 4);
      g.mesh.rotation.x += g.spin.x * dt * speed;
      g.mesh.rotation.y += g.spin.y * dt * speed;
      g.mesh.rotation.z += g.spin.z * dt * speed;
    }
  }

  dispose(): void {
    for (const id of [...this.flying.keys()]) this.remove(id);
  }
}
