import {
  AIR_ACCEL,
  ADS_SPEED,
  CROUCH_HEIGHT,
  CROUCH_SPEED,
  GRAVITY,
  GROUND_ACCEL,
  JUMP_VELOCITY,
  PLAYER_RADIUS,
  SPRINT_SPEED,
  STAND_HEIGHT,
  STEP_HEIGHT,
  WALK_SPEED,
} from './constants';
import { boxesOverlap, type Box } from './math';
import type { Vec3 } from './types';

/**
 * Movement is a pure, deterministic step function shared by the client (prediction)
 * and the server (authority). Same inputs + same map = same result on both sides.
 */
export interface MoveState {
  /** Feet position (center of the bottom of the player box). */
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
  crouching: boolean;
}

export interface MoveInput {
  /** -1..1, forward is positive. */
  forward: number;
  /** -1..1, right is positive. */
  right: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  ads: boolean;
}

type Axis = 'x' | 'y' | 'z';
const SKIN = 0.001;

export function playerHeight(crouching: boolean): number {
  return crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
}

export function playerBox(pos: Vec3, height: number): Box {
  return {
    min: { x: pos.x - PLAYER_RADIUS, y: pos.y, z: pos.z - PLAYER_RADIUS },
    max: { x: pos.x + PLAYER_RADIUS, y: pos.y + height, z: pos.z + PLAYER_RADIUS },
  };
}

function collides(pos: Vec3, height: number, world: Box[]): boolean {
  const box = playerBox(pos, height);
  return world.some((b) => boxesOverlap(box, b));
}

/** Moves along one axis and pushes the player out of anything it runs into. */
function moveAxis(pos: Vec3, axis: Axis, delta: number, height: number, world: Box[]) {
  const next = { ...pos };
  next[axis] += delta;
  let blocked = false;
  for (const b of world) {
    if (!boxesOverlap(playerBox(next, height), b)) continue;
    blocked = true;
    if (axis === 'y') {
      next.y = delta < 0 ? b.max.y : b.min.y - height;
    } else {
      next[axis] = delta > 0 ? b.min[axis] - PLAYER_RADIUS - SKIN : b.max[axis] + PLAYER_RADIUS + SKIN;
    }
  }
  return { pos: next, blocked };
}

/** Horizontal move that can climb small ledges and stairs while on the ground. */
function moveHorizontal(pos: Vec3, axis: Axis, delta: number, height: number, onGround: boolean, world: Box[]): Vec3 {
  const flat = moveAxis(pos, axis, delta, height, world);
  if (!flat.blocked || !onGround) return flat.pos;

  const raised = { ...pos, y: pos.y + STEP_HEIGHT };
  if (collides(raised, height, world)) return flat.pos;
  const stepped = moveAxis(raised, axis, delta, height, world);
  if (stepped.blocked) return flat.pos;
  return moveAxis(stepped.pos, 'y', -STEP_HEIGHT, height, world).pos;
}

function targetSpeed(input: MoveInput, crouching: boolean, speedMultiplier: number): number {
  let speed = WALK_SPEED;
  if (crouching) speed = CROUCH_SPEED;
  else if (input.ads) speed = ADS_SPEED;
  else if (input.sprint && input.forward > 0) speed = SPRINT_SPEED;
  return speed * speedMultiplier;
}

function approach(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function stepMovement(
  state: MoveState,
  input: MoveInput,
  dt: number,
  world: Box[],
  speedMultiplier = 1,
): MoveState {
  let crouching = state.crouching;
  if (input.crouch) crouching = true;
  else if (crouching && !collides(state.pos, STAND_HEIGHT, world)) crouching = false;
  const height = playerHeight(crouching);

  // Desired horizontal velocity from input direction and yaw.
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wishX = -sin * input.forward + cos * input.right;
  let wishZ = -cos * input.forward - sin * input.right;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 1) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }
  const speed = targetSpeed(input, crouching, speedMultiplier);
  const accel = (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt;
  const vel = {
    x: approach(state.vel.x, wishX * speed, accel),
    y: state.vel.y - GRAVITY * dt,
    z: approach(state.vel.z, wishZ * speed, accel),
  };
  if (input.jump && state.onGround && !crouching) vel.y = JUMP_VELOCITY;

  let pos = moveHorizontal(state.pos, 'x', vel.x * dt, height, state.onGround, world);
  pos = moveHorizontal(pos, 'z', vel.z * dt, height, state.onGround, world);
  const vertical = moveAxis(pos, 'y', vel.y * dt, height, world);
  pos = vertical.pos;

  const landed = vertical.blocked && vel.y < 0;
  if (vertical.blocked) vel.y = 0;
  return { pos, vel, onGround: landed, crouching };
}

export function createMoveState(pos: Vec3): MoveState {
  return { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, onGround: false, crouching: false };
}
