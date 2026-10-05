import * as THREE from 'three';

const POOL_SIZE = 32;
const SPEED = 450;
const LENGTH = 5;
/**
 * Lights that ride along with the newest tracers. The count never changes
 * (adding or removing lights would make three.js recompile every shader and stutter).
 */
const LIGHT_COUNT = 6;
const LIGHT_INTENSITY = 40;
const LIGHT_RANGE = 14;

interface Tracer {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  dir: THREE.Vector3;
  distance: number;
  traveled: number;
  light: THREE.PointLight | null;
}

/** Glowing bullet streaks flying from the muzzle to the impact point, lighting up what they pass. */
export class Tracers {
  private readonly pool: Tracer[] = [];
  private next = 0;
  private readonly lights: THREE.PointLight[] = [];
  private nextLight = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, -0.5);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(6, 4.5, 2.2),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        from: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        distance: 0,
        traveled: 0,
        light: null,
      });
    }
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const light = new THREE.PointLight(0xffb45a, 0, LIGHT_RANGE, 2);
      scene.add(light);
      this.lights.push(light);
    }
  }

  spawn(from: THREE.Vector3, to: THREE.Vector3): void {
    const tracer = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    tracer.from.copy(from);
    tracer.dir.subVectors(to, from);
    tracer.distance = tracer.dir.length();
    tracer.dir.normalize();
    tracer.traveled = 0;
    tracer.mesh.visible = true;
    // Take over the oldest light from whichever tracer had it.
    const light = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % LIGHT_COUNT;
    for (const t of this.pool) if (t.light === light) t.light = null;
    tracer.light = light;
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (!t.mesh.visible) continue;
      t.traveled += SPEED * dt;
      const head = Math.min(t.traveled, t.distance);
      const tail = Math.max(0, t.traveled - LENGTH);
      if (tail >= t.distance) {
        t.mesh.visible = false;
        if (t.light) t.light.intensity = 0;
        t.light = null;
        continue;
      }
      t.mesh.position.copy(t.from).addScaledVector(t.dir, head);
      t.mesh.lookAt(t.mesh.position.clone().add(t.dir));
      t.mesh.scale.set(1, 1, Math.max(0.01, head - tail));
      if (t.light) {
        // Sit in the middle of the glowing streak, fading as it reaches the impact point.
        t.light.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
        t.light.intensity = LIGHT_INTENSITY * Math.min(1, (head - tail) / LENGTH);
      }
    }
  }
}
