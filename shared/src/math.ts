import type { Vec3 } from './types';

export interface Box {
  min: Vec3;
  max: Vec3;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Direction a camera with this yaw/pitch looks at (three.js convention: yaw 0 looks down -Z). */
export function directionFromYawPitch(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

export interface RayHit {
  distance: number;
  normal: Vec3;
}

/** Slab test. Returns the entry distance and face normal, or null when the ray misses. */
export function rayBox(origin: Vec3, dir: Vec3, box: Box, maxDistance: number): RayHit | null {
  let tMin = 0;
  let tMax = maxDistance;
  let normal: Vec3 = vec3();
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
      continue;
    }
    let t1 = (box.min[axis] - o) / d;
    let t2 = (box.max[axis] - o) / d;
    let sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      normal = vec3();
      normal[axis] = sign;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return { distance: tMin, normal };
}

export function raySphere(origin: Vec3, dir: Vec3, center: Vec3, radius: number): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/** Closest hit of a ray against a list of boxes (the map). */
export function raycastBoxes(origin: Vec3, dir: Vec3, boxes: Box[], maxDistance: number): RayHit | null {
  let best: RayHit | null = null;
  for (const box of boxes) {
    const hit = rayBox(origin, dir, box, best ? best.distance : maxDistance);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}
