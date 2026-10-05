import { WEAPONS, type Loadout, type WeaponId, type WeaponSlot } from '@mp-fps/shared';

export function fullAmmo(weaponId: WeaponId | null) {
  return { mag: weaponId ? WEAPONS[weaponId].magSize : 0 };
}

/** Keeps the player's previous picks when still allowed, otherwise the first allowed weapon. */
export function createLoadout(allowed: WeaponId[], previous?: Loadout): Loadout {
  const pick = (slot: WeaponSlot): WeaponId | null => {
    const prev = previous?.[slot];
    if (prev && allowed.includes(prev)) return prev;
    return allowed.find((id) => WEAPONS[id].slot === slot) ?? null;
  };
  const primary = pick('primary');
  const secondary = pick('secondary');
  return {
    primary,
    secondary,
    active: primary ? 'primary' : 'secondary',
    ammo: { primary: fullAmmo(primary), secondary: fullAmmo(secondary) },
  };
}

export function activeWeaponId(loadout: Loadout): WeaponId | null {
  return loadout[loadout.active];
}
