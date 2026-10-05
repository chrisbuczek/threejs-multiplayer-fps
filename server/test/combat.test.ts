import { WEAPONS, type Box } from '@mp-fps/shared';
import { describe, expect, it } from 'vitest';
import { resolveShot } from '../src/combat';

const origin = { x: 0, y: 1.6, z: 0 };
const forward = { x: 0, y: 0, z: -1 };
const standing = (z: number) => ({ id: 'victim', pose: { pos: { x: 0, y: 0, z }, crouching: false, alive: true } });

describe('resolveShot', () => {
  it('a headshot kills instantly, except weapons that need several', () => {
    for (const weapon of Object.values(WEAPONS)) {
      const dirs = Array.from({ length: weapon.pellets }, () => forward);
      const hit = resolveShot(weapon, origin, dirs, [standing(-10)], [], 100).hits.get('victim');
      expect(hit?.headshot).toBe(true);
      expect(hit?.damage).toBe(weapon.headshotsToKill ? 100 / weapon.headshotsToKill : Infinity);
    }
  });

  it('the M4A4 needs two headshots at any max health', () => {
    for (const maxHealth of [50, 100, 200]) {
      const hit = resolveShot(WEAPONS.m4a4, origin, [forward], [standing(-10)], [], maxHealth).hits.get('victim');
      expect(hit!.damage * 2).toBeGreaterThanOrEqual(maxHealth);
      expect(hit!.damage).toBeLessThan(maxHealth);
    }
  });

  it('a body shot does normal damage', () => {
    const down = { x: 0, y: -0.06, z: -1 };
    const hit = resolveShot(WEAPONS.ak47, origin, [down], [standing(-10)], [], 100).hits.get('victim');
    expect(hit).toEqual({ damage: 34, headshot: false });
  });

  it('walls block bullets', () => {
    const wall: Box = { min: { x: -2, y: 0, z: -6 }, max: { x: 2, y: 3, z: -5 } };
    const result = resolveShot(WEAPONS.awp, origin, [forward], [standing(-10)], [wall], 100);
    expect(result.hits.size).toBe(0);
    expect(result.ends[0].z).toBeCloseTo(-5);
  });

  it('a shotgun blast to the head counts as one of the four headshots, whatever the pellet count', () => {
    const dirs = Array.from({ length: WEAPONS.shotgun.pellets }, () => forward);
    const hit = resolveShot(WEAPONS.shotgun, origin, dirs, [standing(-10)], [], 100).hits.get('victim');
    expect(hit).toEqual({ damage: 25, headshot: true });
  });
});
