import { CROUCH_EYE_HEIGHT, PLAYER_RADIUS, STAND_EYE_HEIGHT } from './constants';
import { rayBox, raySphere, type Box } from './math';
import type { Vec3 } from './types';

export type HitZone = 'head' | 'body' | 'legs';

export const HEAD_RADIUS = 0.16;
const BODY_HALF_WIDTH = 0.28;

export function eyeHeight(crouching: boolean): number {
  return crouching ? CROUCH_EYE_HEIGHT : STAND_EYE_HEIGHT;
}

export function headCenter(pos: Vec3, crouching: boolean): Vec3 {
  return { x: pos.x, y: pos.y + eyeHeight(crouching), z: pos.z };
}

function zoneBox(pos: Vec3, bottom: number, top: number, halfWidth: number): Box {
  return {
    min: { x: pos.x - halfWidth, y: pos.y + bottom, z: pos.z - halfWidth },
    max: { x: pos.x + halfWidth, y: pos.y + top, z: pos.z + halfWidth },
  };
}

/** Simplified hitboxes: head sphere, torso box, legs box. */
export function raycastPlayer(
  origin: Vec3,
  dir: Vec3,
  pos: Vec3,
  crouching: boolean,
  maxDistance: number,
): { distance: number; zone: HitZone } | null {
  const head = headCenter(pos, crouching);
  const headTop = head.y - pos.y - HEAD_RADIUS;
  const waist = crouching ? 0.45 : 0.8;

  const candidates: { distance: number; zone: HitZone }[] = [];
  const headHit = raySphere(origin, dir, head, HEAD_RADIUS);
  if (headHit !== null) candidates.push({ distance: headHit, zone: 'head' });
  const bodyHit = rayBox(origin, dir, zoneBox(pos, waist, headTop, BODY_HALF_WIDTH), maxDistance);
  if (bodyHit) candidates.push({ distance: bodyHit.distance, zone: 'body' });
  const legsHit = rayBox(origin, dir, zoneBox(pos, 0, waist, PLAYER_RADIUS * 0.6), maxDistance);
  if (legsHit) candidates.push({ distance: legsHit.distance, zone: 'legs' });

  const valid = candidates.filter((c) => c.distance <= maxDistance);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (a.distance <= b.distance ? a : b));
}
