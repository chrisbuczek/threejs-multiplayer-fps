import type { WeaponId, WeaponSlot } from './types';

export interface WeaponStats {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  automatic: boolean;
  rpm: number;
  /** Body damage per bullet (or per pellet) at close range. Headshots kill unless headshotsToKill says otherwise. */
  damage: number;
  pellets: number;
  magSize: number;
  /** Seconds for a full reload. The shotgun loads shell by shell (see reloadSeconds). */
  reloadTime: number;
  /** Spread cone half-angles in radians. */
  hipSpread: number;
  adsSpread: number;
  moveSpread: number;
  /** Camera kick per shot in radians. */
  recoilPitch: number;
  recoilYaw: number;
  adsFov: number;
  adsTime: number;
  moveSpeedMultiplier: number;
  falloffStart: number;
  falloffEnd: number;
  /** Damage multiplier at and beyond falloffEnd. */
  minDamageMultiplier: number;
  /** Headshots needed for a kill at full health (default 1 = every headshot kills). */
  headshotsToKill?: number;
  /** Extra camera shake for the shooter on every shot (0..1). */
  cameraShake?: number;
}

export const LIMB_DAMAGE_MULTIPLIER = 0.85;
export const MAX_SHOT_RANGE = 300;

export const WEAPONS: Record<WeaponId, WeaponStats> = {
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    slot: 'primary',
    automatic: true,
    rpm: 600,
    damage: 34,
    pellets: 1,
    magSize: 30,
    reloadTime: 2.5,
    hipSpread: 0.045,
    adsSpread: 0.004,
    moveSpread: 0.03,
    recoilPitch: 0.036,
    recoilYaw: 0.036,
    adsFov: 55,
    adsTime: 0.25,
    moveSpeedMultiplier: 0.95,
    falloffStart: 30,
    falloffEnd: 60,
    minDamageMultiplier: 0.75,
  },
  m4a4: {
    id: 'm4a4',
    name: 'M4A4',
    slot: 'primary',
    automatic: true,
    rpm: 750,
    damage: 28,
    pellets: 1,
    magSize: 30,
    reloadTime: 2.2,
    hipSpread: 0.04,
    adsSpread: 0.002,
    moveSpread: 0.025,
    recoilPitch: 0.025,
    recoilYaw: 0.0075,
    adsFov: 55,
    adsTime: 0.22,
    moveSpeedMultiplier: 0.97,
    falloffStart: 30,
    falloffEnd: 60,
    minDamageMultiplier: 0.75,
    headshotsToKill: 2,
  },
  awp: {
    id: 'awp',
    name: 'Sniper',
    slot: 'primary',
    automatic: false,
    rpm: 41,
    damage: 99,
    pellets: 1,
    magSize: 5,
    reloadTime: 3.6,
    hipSpread: 0.12,
    adsSpread: 0,
    moveSpread: 0.08,
    recoilPitch: 0.09,
    recoilYaw: 0.015,
    adsFov: 18,
    adsTime: 0.4,
    moveSpeedMultiplier: 0.85,
    falloffStart: MAX_SHOT_RANGE,
    falloffEnd: MAX_SHOT_RANGE,
    minDamageMultiplier: 1,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    slot: 'primary',
    automatic: false,
    rpm: 70,
    damage: 20,
    pellets: 14,
    magSize: 8,
    reloadTime: 0.5,
    hipSpread: 0.09,
    adsSpread: 0.065,
    moveSpread: 0.01,
    recoilPitch: 0.03,
    recoilYaw: 0.015,
    adsFov: 65,
    adsTime: 0.2,
    moveSpeedMultiplier: 0.95,
    falloffStart: 5,
    falloffEnd: 15,
    minDamageMultiplier: 0.3,
    headshotsToKill: 4,
  },
  minigun: {
    id: 'minigun',
    name: 'Minigun',
    slot: 'primary',
    automatic: true,
    rpm: 1800,
    damage: 16,
    pellets: 1,
    magSize: 150,
    reloadTime: 5,
    hipSpread: 0.06,
    adsSpread: 0.03,
    moveSpread: 0.04,
    // Super recoil: at 30 rounds a second the barrel climbs and thrashes side to side.
    recoilPitch: 0.06,
    recoilYaw: 0.07,
    adsFov: 65,
    adsTime: 0.5,
    moveSpeedMultiplier: 0.7,
    falloffStart: 20,
    falloffEnd: 50,
    minDamageMultiplier: 0.6,
    cameraShake: 0.6,
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    slot: 'secondary',
    automatic: false,
    rpm: 130,
    damage: 50,
    pellets: 1,
    magSize: 7,
    reloadTime: 2.0,
    hipSpread: 0.03,
    adsSpread: 0.006,
    moveSpread: 0.03,
    recoilPitch: 0.3,
    recoilYaw: 0.081,
    adsFov: 62,
    adsTime: 0.18,
    moveSpeedMultiplier: 1.05,
    falloffStart: 20,
    falloffEnd: 45,
    minDamageMultiplier: 1,
    cameraShake: 0.9,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function fireIntervalSeconds(weapon: WeaponStats): number {
  return 60 / weapon.rpm;
}

/** The shotgun loads shells one by one; every other weapon swaps the whole magazine. */
export function reloadSeconds(weapon: WeaponStats, bulletsMissing: number): number {
  return weapon.id === 'shotgun' ? 0.4 + weapon.reloadTime * bulletsMissing : weapon.reloadTime;
}

/** Damage of one bullet/pellet at a distance, before hit-zone multipliers. */
export function damageAtDistance(weapon: WeaponStats, distance: number): number {
  if (distance <= weapon.falloffStart) return weapon.damage;
  if (distance >= weapon.falloffEnd) return weapon.damage * weapon.minDamageMultiplier;
  const t = (distance - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
  return weapon.damage * (1 - t * (1 - weapon.minDamageMultiplier));
}
