import { describe, expect, it } from 'vitest';
import { WEAPONS, damageAtDistance, reloadSeconds } from '../src/weapons';

describe('weapons', () => {
  it('applies full damage up close and falloff far away', () => {
    expect(damageAtDistance(WEAPONS.ak47, 5)).toBe(34);
    expect(damageAtDistance(WEAPONS.ak47, 100)).toBeCloseTo(34 * 0.75);
    expect(damageAtDistance(WEAPONS.shotgun, 10)).toBeLessThan(20);
  });

  it('sniper deals 99 body damage at any range (leaves a 100 HP player on 1 HP)', () => {
    expect(damageAtDistance(WEAPONS.awp, 5)).toBe(99);
    expect(damageAtDistance(WEAPONS.awp, 200)).toBe(99);
  });

  it('shotgun reload scales with missing shells', () => {
    expect(reloadSeconds(WEAPONS.shotgun, 4)).toBeGreaterThan(reloadSeconds(WEAPONS.shotgun, 1));
    expect(reloadSeconds(WEAPONS.ak47, 1)).toBe(WEAPONS.ak47.reloadTime);
  });
});
