import type { MapBlock } from '@mp-fps/shared';
import * as THREE from 'three';

const plastic = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.2 });
const screens = [0x2b4a7a, 0x1f5f6b, 0x3a3f6e].map(
  (color) =>
    new THREE.MeshStandardMaterial({ color: 0x050608, emissive: color, emissiveIntensity: 0.9, roughness: 0.2 }),
);

const standGeometry = new THREE.BoxGeometry(0.06, 0.18, 0.06);
const footGeometry = new THREE.BoxGeometry(0.25, 0.02, 0.18);
const frameGeometry = new THREE.BoxGeometry(0.58, 0.36, 0.04);
const screenGeometry = new THREE.PlaneGeometry(0.54, 0.32);

/** One flat-screen monitor standing at the origin, screen facing +Z. */
function monitor(screen: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const foot = new THREE.Mesh(footGeometry, plastic);
  foot.position.y = 0.01;
  const stand = new THREE.Mesh(standGeometry, plastic);
  stand.position.set(0, 0.11, -0.03);
  const frame = new THREE.Mesh(frameGeometry, plastic);
  frame.position.set(0, 0.36, 0);
  const display = new THREE.Mesh(screenGeometry, screen);
  display.position.set(0, 0.36, 0.021);
  for (const mesh of [foot, stand, frame]) mesh.castShadow = true;
  group.add(foot, stand, frame, display);
  return group;
}

/** Puts a monitor on every meter of a desk's top, facing across its short side. */
export function buildMonitors(block: MapBlock, index: number): THREE.Group {
  const group = new THREE.Group();
  const sizeX = block.max.x - block.min.x;
  const sizeZ = block.max.z - block.min.z;
  const alongX = sizeX >= sizeZ;
  const count = Math.max(1, Math.floor(Math.max(sizeX, sizeZ)));
  // Alternate which way desks face so not every screen points the same direction.
  const yaw = (alongX ? 0 : Math.PI / 2) + (index % 2 ? Math.PI : 0);

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const m = monitor(screens[(index + i) % screens.length]);
    m.position.set(
      alongX ? block.min.x + t * sizeX : (block.min.x + block.max.x) / 2,
      block.max.y,
      alongX ? (block.min.z + block.max.z) / 2 : block.min.z + t * sizeZ,
    );
    m.rotation.y = yaw;
    group.add(m);
  }
  return group;
}
