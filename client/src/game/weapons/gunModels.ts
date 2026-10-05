import type { WeaponId } from '@mp-fps/shared';
import * as THREE from 'three';

/**
 * Procedural weapon models made of simple shapes. Units are meters, the barrel points to -Z.
 * Each model has a child named "muzzle" and userData.sightHeight (height of the sight line).
 */
const mat = {
  metal: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.85, roughness: 0.35 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x151517, metalness: 0.7, roughness: 0.5 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x1d1d1d, metalness: 0, roughness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b3a1c, metalness: 0, roughness: 0.55 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x4a5236, metalness: 0.1, roughness: 0.6 }),
  /** Worn, blued stamped steel: much duller than polished metal (AK receiver). */
  stampedSteel: new THREE.MeshStandardMaterial({ color: 0x26272a, metalness: 0.45, roughness: 0.9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 1, roughness: 0.2 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.9, roughness: 0.05, emissive: 0x0a1a2a }),
};

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, rotX = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rotX;
  return mesh;
}

function tube(radius: number, length: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function finish(group: THREE.Group, muzzleZ: number, muzzleY: number, sightHeight: number): THREE.Group {
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, muzzleY, muzzleZ);
  group.add(muzzle);
  group.userData.sightHeight = sightHeight;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return group;
}

function ak47(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.05, 0.08, 0.42, mat.stampedSteel, 0, 0, -0.05),
    tube(0.012, 0.42, mat.darkMetal, 0, 0.02, -0.46),
    box(0.06, 0.06, 0.2, mat.wood, 0, 0.005, -0.33),
    box(0.035, 0.18, 0.07, mat.metal, 0, -0.12, -0.12, 0.35),
    box(0.035, 0.1, 0.045, mat.wood, 0, -0.08, 0.08, -0.3),
    box(0.045, 0.08, 0.3, mat.wood, 0, -0.03, 0.3, 0.12),
    ...akSights(),
  );
  return finish(g, -0.68, 0.02, AK_SIGHT_LINE);
}

/** Height of the AK's sight line: the front post tip and the bottom of the rear notch sit on it. */
const AK_SIGHT_LINE = 0.065;

/**
 * AK iron sights: a rear tangent leaf with a U-notch and a thin front post between two protective ears.
 * Everything stays below or beside the sight line so aiming leaves the view clear.
 */
function akSights(): THREE.Mesh[] {
  const s = AK_SIGHT_LINE;
  const rearZ = -0.15;
  const frontZ = -0.62;
  return [
    // Rear sight block and the flat leaf on top of it.
    box(0.03, 0.02, 0.05, mat.metal, 0, s - 0.022, rearZ),
    box(0.026, 0.006, 0.07, mat.darkMetal, 0, s - 0.009, rearZ - 0.01),
    // Notch: two thin shoulders on the leaf's rear edge, leaving a 7 mm gap in the middle.
    box(0.009, 0.007, 0.004, mat.darkMetal, -0.008, s - 0.0025, rearZ + 0.022),
    box(0.009, 0.007, 0.004, mat.darkMetal, 0.008, s - 0.0025, rearZ + 0.022),
    // Front sight base on the barrel.
    box(0.024, 0.03, 0.03, mat.metal, 0, s - 0.033, frontZ),
    // Front post: tip exactly on the sight line.
    box(0.003, 0.016, 0.004, mat.darkMetal, 0, s - 0.008, frontZ),
    // Protective ears on both sides of the post, open at the top.
    box(0.003, 0.022, 0.012, mat.darkMetal, -0.011, s - 0.006, frontZ),
    box(0.003, 0.022, 0.012, mat.darkMetal, 0.011, s - 0.006, frontZ),
  ];
}

function m4a4(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.05, 0.085, 0.4, mat.darkMetal, 0, 0, -0.05),
    tube(0.011, 0.36, mat.darkMetal, 0, 0.02, -0.48),
    box(0.065, 0.065, 0.26, mat.polymer, 0, 0.01, -0.33),
    box(0.03, 0.035, 0.25, mat.darkMetal, 0, 0.06, -0.08),
    box(0.035, 0.17, 0.065, mat.darkMetal, 0, -0.12, -0.1, 0.12),
    box(0.035, 0.1, 0.045, mat.polymer, 0, -0.08, 0.08, -0.3),
    box(0.05, 0.08, 0.24, mat.polymer, 0, -0.01, 0.3),
    ...m4Sights(),
  );
  return finish(g, -0.66, 0.02, M4_SIGHT_LINE);
}

/** Height of the M4's sight line: the rear aperture's center and the front post tip sit on it. */
const M4_SIGHT_LINE = 0.085;

/**
 * M4 iron sights: a rear peep ring (aperture) close to the eye on the top rail, and a thin front post
 * between two ears on the triangular front sight base. Only the thin ring and post reach the sight line.
 */
function m4Sights(): THREE.Mesh[] {
  const s = M4_SIGHT_LINE;
  const railTop = 0.0775;
  const rearZ = 0.03;
  const frontZ = -0.44;
  const ringRadius = 0.009;
  // Rear aperture: a thin ring facing the camera (torus lies in the XY plane).
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.0008, 6, 32), mat.darkMetal);
  ring.position.set(0, s, rearZ);
  const ringBottom = s - ringRadius;
  return [
    ring,
    // Sight body under the ring, clamped to the rail.
    box(0.026, ringBottom - railTop, 0.03, mat.darkMetal, 0, (railTop + ringBottom) / 2, rearZ),
    // Protective wings on both sides of the aperture.
    box(0.003, 0.02, 0.02, mat.darkMetal, -0.013, s - 0.004, rearZ),
    box(0.003, 0.02, 0.02, mat.darkMetal, 0.013, s - 0.004, rearZ),
    // Front sight base on the barrel, leaning forward like the M4's triangle.
    box(0.02, 0.05, 0.022, mat.darkMetal, 0, s - 0.042, frontZ, -0.2),
    // Front post: tip exactly on the sight line.
    box(0.003, 0.018, 0.004, mat.darkMetal, 0, s - 0.009, frontZ),
    // Ears on both sides of the post, open at the top.
    box(0.003, 0.022, 0.012, mat.darkMetal, -0.01, s - 0.007, frontZ),
    box(0.003, 0.022, 0.012, mat.darkMetal, 0.01, s - 0.007, frontZ),
  ];
}

function awp(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.07, 0.1, 0.55, mat.olive, 0, -0.01, 0),
    tube(0.014, 0.6, mat.darkMetal, 0, 0.02, -0.57),
    tube(0.028, 0.32, mat.darkMetal, 0, 0.1, -0.05),
    tube(0.036, 0.06, mat.darkMetal, 0, 0.1, -0.23),
    box(0.06, 0.003, 0.003, mat.glass, 0, 0.1, -0.265),
    box(0.035, 0.1, 0.05, mat.darkMetal, 0, -0.1, -0.05),
    box(0.06, 0.12, 0.3, mat.olive, 0, -0.03, 0.38),
    box(0.012, 0.012, 0.06, mat.chrome, 0.05, 0.04, 0.12),
  );
  return finish(g, -0.88, 0.02, 0.1);
}

function shotgun(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.055, 0.08, 0.32, mat.metal, 0, 0, 0),
    tube(0.016, 0.55, mat.darkMetal, 0, 0.025, -0.42),
    tube(0.014, 0.45, mat.darkMetal, 0, -0.015, -0.37),
    box(0.06, 0.055, 0.16, mat.wood, 0, -0.015, -0.32),
    box(0.035, 0.1, 0.045, mat.wood, 0, -0.08, 0.13, -0.35),
    box(0.05, 0.08, 0.3, mat.wood, 0, -0.03, 0.34, 0.12),
    box(0.012, 0.015, 0.012, mat.chrome, 0, 0.05, -0.68),
  );
  return finish(g, -0.7, 0.025, 0.05);
}

function deagle(): THREE.Group {
  const g = new THREE.Group();
  const slideTop = 0.049;
  const sight = 0.055;
  g.add(
    // Slide with the flat top rib and the big squared nose of the Desert Eagle.
    box(0.03, 0.038, 0.25, mat.chrome, 0, 0.03, -0.105),
    box(0.012, 0.004, 0.24, mat.chrome, 0, slideTop - 0.001, -0.11),
    box(0.032, 0.03, 0.035, mat.chrome, 0, 0.026, -0.215),
    // Muzzle bore on the front face.
    tube(0.0065, 0.004, mat.darkMetal, 0, 0.03, -0.233),
    // Ejection port on the right side.
    box(0.002, 0.012, 0.045, mat.darkMetal, 0.0155, 0.035, -0.06),
    // Frame under the slide, trigger guard and trigger.
    box(0.027, 0.02, 0.21, mat.metal, 0, 0.002, -0.095),
    box(0.012, 0.005, 0.07, mat.metal, 0, -0.038, -0.055),
    box(0.012, 0.04, 0.006, mat.metal, 0, -0.02, -0.09),
    box(0.006, 0.022, 0.006, mat.darkMetal, 0, -0.018, -0.045, 0.3),
    // Grip with steel panels, magazine base plate and hammer.
    box(0.03, 0.125, 0.055, mat.metal, 0, -0.065, 0.025, -0.25),
    box(0.034, 0.1, 0.045, mat.darkMetal, 0, -0.065, 0.027, -0.25),
    box(0.034, 0.008, 0.062, mat.darkMetal, 0, -0.127, 0.047, -0.25),
    box(0.012, 0.016, 0.012, mat.darkMetal, 0, 0.032, 0.026, 0.4),
    // Sights: rear notch (two shoulders) and a thin front post, both topping out on the sight line.
    box(0.007, sight - slideTop, 0.008, mat.darkMetal, -0.0055, (sight + slideTop) / 2, 0.01),
    box(0.007, sight - slideTop, 0.008, mat.darkMetal, 0.0055, (sight + slideTop) / 2, 0.01),
    box(0.003, sight - slideTop, 0.006, mat.darkMetal, 0, (sight + slideTop) / 2, -0.215),
  );
  // Slide serrations at the back.
  for (let i = 0; i < 7; i++) {
    for (const x of [-0.0152, 0.0152]) g.add(box(0.001, 0.026, 0.003, mat.darkMetal, x, 0.03, 0.012 - i * 0.006));
  }
  return finish(g, -0.236, 0.03, sight);
}

/** Six-barrel rotary gun. The barrel cluster is a child named "barrels" so the view can spin it. */
function minigun(): THREE.Group {
  const g = new THREE.Group();
  const barrels = new THREE.Group();
  barrels.name = 'barrels';
  barrels.position.set(0, 0, -0.42);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    barrels.add(tube(0.008, 0.6, mat.darkMetal, Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0));
  }
  barrels.add(
    tube(0.012, 0.62, mat.metal, 0, 0, 0),
    // Clamps holding the barrels together.
    tube(0.034, 0.025, mat.metal, 0, 0, -0.27),
    tube(0.034, 0.025, mat.metal, 0, 0, 0.05),
  );
  g.add(
    barrels,
    // Motor housing and receiver.
    tube(0.045, 0.16, mat.metal, 0, 0, -0.06),
    box(0.08, 0.09, 0.22, mat.darkMetal, 0, -0.01, 0.12),
    // Ammo box hanging off the left side and the feed chute.
    box(0.07, 0.11, 0.13, mat.olive, -0.08, -0.07, 0.1),
    box(0.025, 0.02, 0.1, mat.chrome, -0.04, 0.0, 0.05),
    // Rear handle and front grip.
    box(0.03, 0.1, 0.04, mat.polymer, 0, -0.09, 0.18, -0.25),
    box(0.03, 0.08, 0.035, mat.polymer, 0, -0.08, -0.12, 0.2),
    // Carry handle with a simple sight post on top.
    box(0.012, 0.012, 0.2, mat.metal, 0, 0.075, 0.0),
    box(0.012, 0.04, 0.012, mat.metal, 0, 0.055, -0.09),
    box(0.012, 0.04, 0.012, mat.metal, 0, 0.055, 0.09),
    box(0.003, 0.012, 0.004, mat.darkMetal, 0, 0.087, -0.09),
  );
  return finish(g, -0.73, 0, 0.093);
}

const BUILDERS: Record<WeaponId, () => THREE.Group> = { ak47, m4a4, awp, shotgun, minigun, deagle };

export function createGunModel(id: WeaponId): THREE.Group {
  const model = BUILDERS[id]();
  model.name = id;
  return model;
}
