import { describe, expect, it } from 'vitest';
import { GRENADE_MAX_DAMAGE, GRENADE_RADIUS, grenadeDamage, stepGrenade, throwGrenade } from '../src/grenade';
import type { Box } from '../src/math';

const floor: Box = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 } };
const wall: Box = { min: { x: -50, y: 0, z: -6 }, max: { x: 50, y: 5, z: -5 } };

function simulate(world: Box[], seconds: number) {
  let state = throwGrenade({ x: 0, y: 1.6, z: 0 }, 0, 0, { x: 0, y: 0, z: 0 }, world);
  for (let t = 0; t < seconds; t += 1 / 30) state = stepGrenade(state, 1 / 30, world);
  return state;
}

describe('grenade', () => {
  it('lands on the floor and comes to rest', () => {
    const { pos, vel } = simulate([floor], 6);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.y).toBeLessThan(0.2);
    expect(Math.hypot(vel.x, vel.y, vel.z)).toBeLessThan(0.5);
  });

  it('bounces off walls instead of passing through', () => {
    const { pos } = simulate([floor, wall], 3);
    expect(pos.z).toBeGreaterThan(-5);
  });

  it('starts at the eye when thrown into a wall the player touches', () => {
    const close: Box = { min: { x: -5, y: 0, z: -0.5 }, max: { x: 5, y: 5, z: -0.3 } };
    const state = throwGrenade({ x: 0, y: 1.6, z: 0 }, 0, 0, { x: 0, y: 0, z: 0 }, [close]);
    expect(state.pos.z).toBe(0);
  });

  it('deals full damage at the center and none at the edge', () => {
    expect(grenadeDamage(0)).toBe(GRENADE_MAX_DAMAGE);
    expect(grenadeDamage(GRENADE_RADIUS / 2)).toBeCloseTo(GRENADE_MAX_DAMAGE / 2);
    expect(grenadeDamage(GRENADE_RADIUS)).toBe(0);
  });
});
