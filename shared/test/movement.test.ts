import { describe, expect, it } from 'vitest';
import { INPUT_DT } from '../src/constants';
import type { Box } from '../src/math';
import { createMoveState, stepMovement, type MoveInput, type MoveState } from '../src/movement';

const floor: Box = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 } };
const idle: MoveInput = {
  forward: 0,
  right: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  crouch: false,
  sprint: false,
  ads: false,
};

function simulate(state: MoveState, input: MoveInput, world: Box[], seconds: number): MoveState {
  for (let t = 0; t < seconds; t += INPUT_DT) state = stepMovement(state, input, INPUT_DT, world);
  return state;
}

describe('stepMovement', () => {
  it('falls onto the floor and stays grounded', () => {
    const s = simulate(createMoveState({ x: 0, y: 3, z: 0 }), idle, [floor], 2);
    expect(s.pos.y).toBeCloseTo(0);
    expect(s.onGround).toBe(true);
  });

  it('walks forward (towards -Z at yaw 0) at walk speed', () => {
    const s = simulate(createMoveState({ x: 0, y: 0, z: 0 }), { ...idle, forward: 1 }, [floor], 1);
    expect(s.pos.z).toBeLessThan(-4);
    expect(s.pos.z).toBeGreaterThan(-5.1);
  });

  it('is stopped by walls', () => {
    const wall: Box = { min: { x: -5, y: 0, z: -3 }, max: { x: 5, y: 5, z: -2 } };
    const s = simulate(createMoveState({ x: 0, y: 0, z: 0 }), { ...idle, forward: 1 }, [floor, wall], 2);
    expect(s.pos.z).toBeGreaterThan(-2);
  });

  it('climbs a small step but not a tall block', () => {
    const step: Box = { min: { x: -5, y: 0, z: -10 }, max: { x: 5, y: 0.4, z: -2 } };
    const climbed = simulate(createMoveState({ x: 0, y: 0, z: 0 }), { ...idle, forward: 1 }, [floor, step], 2);
    expect(climbed.pos.y).toBeCloseTo(0.4);
    const tall: Box = { ...step, max: { ...step.max, y: 1 } };
    const blocked = simulate(createMoveState({ x: 0, y: 0, z: 0 }), { ...idle, forward: 1 }, [floor, tall], 2);
    expect(blocked.pos.z).toBeGreaterThan(-2);
  });

  it('cannot stand up under a low ceiling', () => {
    const roof: Box = { min: { x: -5, y: 1.4, z: -5 }, max: { x: 5, y: 2, z: 5 } };
    const crouched = { ...createMoveState({ x: 0, y: 0, z: 0 }), crouching: true, onGround: true };
    const s = stepMovement(crouched, idle, INPUT_DT, [floor, roof]);
    expect(s.crouching).toBe(true);
  });
});
