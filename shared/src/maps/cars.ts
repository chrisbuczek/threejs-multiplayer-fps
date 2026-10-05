import type { Box } from '../math';
import type { MapBlock, MaterialId } from './mapTypes';

/**
 * Parked cars are placed as simple grid blocks, but they collide (and stop bullets) with a car shape:
 * a low body up to the hood and a cabin up to the roof. The client draws its car model to the same proportions.
 */
export const CAR_MATERIALS: readonly MaterialId[] = ['carWhite', 'carDark', 'carSilver', 'carBlue'];

/** Gaps between the car and its grid footprint, in meters. */
export const CAR_LENGTH_GAP = 0.25;
export const CAR_WIDTH_GAP = 0.2;
export const CAR_BODY_HEIGHT = 0.95;
export const CAR_ROOF_HEIGHT = 1.42;
/** Cabin span along the car, as fractions of its length measured from the front. */
const CABIN_START = 0.33;
const CABIN_END = 0.88;

export function isCar(material: MaterialId): boolean {
  return CAR_MATERIALS.includes(material);
}

/** Deterministic per-car choice of which way it is parked (same on server and client). */
export function carFacesBackwards(block: Box): boolean {
  const cx = (block.min.x + block.max.x) / 2;
  const cz = (block.min.z + block.max.z) / 2;
  return Math.sin(cx * 12.9898 + cz * 78.233) > 0;
}

/** Collision boxes for one parked car: body + cabin. */
export function carColliders(block: MapBlock): Box[] {
  const sizeX = block.max.x - block.min.x;
  const sizeZ = block.max.z - block.min.z;
  const alongX = sizeX >= sizeZ;
  const cx = (block.min.x + block.max.x) / 2;
  const cz = (block.min.z + block.max.z) / 2;
  const length = Math.max(sizeX, sizeZ) - CAR_LENGTH_GAP;
  const width = Math.min(sizeX, sizeZ) - CAR_WIDTH_GAP;
  const y = block.min.y;

  // Positions along the car's long axis, relative to its center; flipped cars have the cabin mirrored.
  const flip = carFacesBackwards(block) ? -1 : 1;
  const a = flip * (CABIN_START - 0.5) * length;
  const b = flip * (CABIN_END - 0.5) * length;
  const span = (from: number, to: number, halfWidth: number, top: number): Box => {
    const [lo, hi] = [Math.min(from, to), Math.max(from, to)];
    return alongX
      ? { min: { x: cx + lo, y, z: cz - halfWidth }, max: { x: cx + hi, y: y + top, z: cz + halfWidth } }
      : { min: { x: cx - halfWidth, y, z: cz + lo }, max: { x: cx + halfWidth, y: y + top, z: cz + hi } };
  };
  return [span(-length / 2, length / 2, width / 2, CAR_BODY_HEIGHT), span(a, b, width / 2 - 0.08, CAR_ROOF_HEIGHT)];
}
