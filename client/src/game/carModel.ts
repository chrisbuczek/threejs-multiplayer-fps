import {
  CAR_LENGTH_GAP,
  CAR_WIDTH_GAP,
  carFacesBackwards,
  isCar,
  type MapBlock,
  type MaterialId,
} from '@mp-fps/shared';
import * as THREE from 'three';

/** Paint colors for the car materials. Collision uses the matching shape from carColliders(). */
const PAINT: Partial<Record<MaterialId, number>> = {
  carWhite: 0xd9dbd8,
  carDark: 0x23272d,
  carSilver: 0x8c9196,
  carBlue: 0x1f45a8,
};

export function isCarMaterial(id: MaterialId): boolean {
  return isCar(id);
}

const shared = {
  glass: new THREE.MeshStandardMaterial({ color: 0x14181d, metalness: 0.9, roughness: 0.08 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xa0a4a8, metalness: 0.9, roughness: 0.3 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }),
  headlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 0.6 }),
  taillight: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xaa0000, emissiveIntensity: 0.5 }),
};
const paints = new Map<MaterialId, THREE.MeshStandardMaterial>();

function paint(id: MaterialId): THREE.MeshStandardMaterial {
  let material = paints.get(id);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: PAINT[id], metalness: 0.6, roughness: 0.32 });
    paints.set(id, material);
  }
  return material;
}

/** Side profile of a hatchback/estate, in fractions of length (x) and meters (y). Front is x = 0. */
function profile(points: [number, number][], length: number): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * length, y) : shape.lineTo(x * length, y)));
  return shape;
}

function extrude(shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  return geometry;
}

/** A parked car filling the block's footprint, aligned with its longer side. */
export function buildCar(block: MapBlock): THREE.Group {
  const sizeX = block.max.x - block.min.x;
  const sizeZ = block.max.z - block.min.z;
  const alongX = sizeX >= sizeZ;
  // Leave a little gap so neighbouring cars don't touch.
  const length = Math.max(sizeX, sizeZ) - CAR_LENGTH_GAP;
  const width = Math.min(sizeX, sizeZ) - CAR_WIDTH_GAP;

  const car = new THREE.Group();
  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    car.add(mesh);
    return mesh;
  };

  const body = profile(
    [
      [0, 0.3],
      [0, 0.72],
      [0.04, 0.84],
      [0.26, 0.94],
      [0.42, 1.4],
      [0.8, 1.42],
      [0.95, 1.05],
      [1, 0.92],
      [1, 0.3],
    ],
    length,
  );
  add(new THREE.Mesh(extrude(body, width, 0.06), paint(block.material)));

  // Greenhouse: slightly wider than the body so it shows as side windows, windshield and rear window.
  const windows = profile(
    [
      [0.285, 0.97],
      [0.425, 1.36],
      [0.79, 1.375],
      [0.935, 1.04],
    ],
    length,
  );
  add(new THREE.Mesh(extrude(windows, width + 0.03, 0), shared.glass));

  // Bumpers and side skirts.
  for (const x of [0.01, 0.99]) {
    const bumper = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, width + 0.04), shared.trim));
    bumper.position.set(x * length, 0.38, 0);
  }

  // Lights.
  for (const side of [-1, 1]) {
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.28), shared.headlight));
    head.position.set(0.02, 0.74, side * (width / 2 - 0.22));
    const tail = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.24), shared.taillight));
    tail.position.set(length - 0.01, 0.82, side * (width / 2 - 0.2));
  }

  // Wheels.
  const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20);
  tyre.rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12);
  rim.rotateX(Math.PI / 2);
  for (const x of [0.17, 0.8]) {
    for (const side of [-1, 1]) {
      const z = side * (width / 2 - 0.1);
      add(new THREE.Mesh(tyre, shared.tyre)).position.set(x * length, 0.33, z);
      add(new THREE.Mesh(rim, shared.rim)).position.set(x * length, 0.33, z);
    }
  }

  // Center the car on the block. Unflipped, the front points to -X (or -Z), matching carColliders().
  const cx = (block.min.x + block.max.x) / 2;
  const cz = (block.min.z + block.max.z) / 2;
  car.children.forEach((child) => (child.position.x -= length / 2));
  const flip = carFacesBackwards(block) ? Math.PI : 0;
  car.rotation.y = (alongX ? 0 : -Math.PI / 2) + flip;
  car.position.set(cx, block.min.y, cz);
  return car;
}
