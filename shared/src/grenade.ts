import { GRAVITY } from './constants';
import { boxesOverlap, directionFromYawPitch, type Box } from './math';
import type { Vec3 } from './types';

/**
 * Frag grenade: thrown with G, bounces off the world and explodes after a fuse.
 * The flight is a pure step function so the server (authority) and clients (visuals) agree.
 */
export type GrenadeKind = 'frag' | 'smoke' | 'flash';
export const GRENADE_KINDS: readonly GrenadeKind[] = ['frag', 'smoke', 'flash'];

/** Fuse and cooldown per grenade type, in seconds. */
export const GRENADE_FUSE: Record<GrenadeKind, number> = { frag: 2.2, smoke: 1.4, flash: 1.6 };
export const GRENADE_COOLDOWN: Record<GrenadeKind, number> = { frag: 6, smoke: 10, flash: 8 };
/** Smoke grenades fill this area with thick smoke (meters) for SMOKE_SECONDS. */
export const SMOKE_RADIUS = 5;
export const SMOKE_SECONDS = 15;
/** Flashbangs blind anyone within this range who has line of sight to the bang. */
export const FLASH_RANGE = 28;
export const GRENADE_THROW_SPEED = 15;
/** Extra upward speed so a throw straight ahead still arcs. */
export const GRENADE_THROW_LIFT = 3;
export const GRENADE_RADIUS = 7;
export const GRENADE_MAX_DAMAGE = 150;
/** Half size of the grenade's collision box. */
const SIZE = 0.06;
const BOUNCE = 0.35;
/** Horizontal speed kept per ground contact; makes it roll to a stop. */
const GROUND_FRICTION = 0.75;
const SUBSTEP = 1 / 120;

export interface GrenadeState {
  pos: Vec3;
  vel: Vec3;
}

/**
 * Start state of a throw from the eye position, adding some of the thrower's own velocity.
 * Starts slightly in front of the eye, unless that point is inside a wall the player stands against.
 */
export function throwGrenade(eye: Vec3, yaw: number, pitch: number, throwerVel: Vec3, world: Box[]): GrenadeState {
  const dir = directionFromYawPitch(yaw, pitch);
  const ahead = { x: eye.x + dir.x * 0.4, y: eye.y + dir.y * 0.4 - 0.1, z: eye.z + dir.z * 0.4 };
  return {
    pos: inside(ahead, world) ? { ...eye } : ahead,
    vel: {
      x: dir.x * GRENADE_THROW_SPEED + throwerVel.x * 0.5,
      y: dir.y * GRENADE_THROW_SPEED + GRENADE_THROW_LIFT + throwerVel.y * 0.5,
      z: dir.z * GRENADE_THROW_SPEED + throwerVel.z * 0.5,
    },
  };
}

function inside(pos: Vec3, world: Box[]): boolean {
  const box = {
    min: { x: pos.x - SIZE, y: pos.y - SIZE, z: pos.z - SIZE },
    max: { x: pos.x + SIZE, y: pos.y + SIZE, z: pos.z + SIZE },
  };
  return world.some((b) => boxesOverlap(box, b));
}

/** Advances a grenade by dt seconds (in small substeps so it never tunnels through thin walls). */
export function stepGrenade(state: GrenadeState, dt: number, world: Box[]): GrenadeState {
  const pos = { ...state.pos };
  const vel = { ...state.vel };
  for (let left = dt; left > 1e-6; left -= SUBSTEP) {
    const h = Math.min(SUBSTEP, left);
    vel.y -= GRAVITY * h;
    for (const axis of ['x', 'y', 'z'] as const) {
      const before = pos[axis];
      pos[axis] += vel[axis] * h;
      if (!inside(pos, world)) continue;
      pos[axis] = before;
      const landed = axis === 'y' && vel.y < 0;
      vel[axis] = -vel[axis] * BOUNCE;
      if (landed) {
        vel.x *= GROUND_FRICTION;
        vel.z *= GROUND_FRICTION;
        if (Math.abs(vel.y) < 0.5) vel.y = 0;
      }
    }
  }
  return { pos, vel };
}

/** Linear falloff from full damage at the center to zero at the edge of the blast. */
export function grenadeDamage(distance: number): number {
  return distance >= GRENADE_RADIUS ? 0 : GRENADE_MAX_DAMAGE * (1 - distance / GRENADE_RADIUS);
}
