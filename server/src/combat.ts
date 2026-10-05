import {
  LIMB_DAMAGE_MULTIPLIER,
  MAX_SHOT_RANGE,
  addScaled,
  damageAtDistance,
  normalize,
  raycastBoxes,
  raycastPlayer,
  type Box,
  type Vec3,
  type WeaponStats,
} from '@mp-fps/shared';
import type { PastPose } from './history';

export interface ShotTarget {
  id: string;
  pose: PastPose;
}

export interface ShotResult {
  /** Where every pellet stopped (wall, player or max range). */
  ends: Vec3[];
  /** Total damage per victim id. */
  hits: Map<string, { damage: number; headshot: boolean }>;
}

/** Hitscan for one trigger pull: walls block bullets, closest player hitbox wins. */
export function resolveShot(
  weapon: WeaponStats,
  origin: Vec3,
  directions: Vec3[],
  targets: ShotTarget[],
  colliders: Box[],
  maxHealth: number,
): ShotResult {
  const ends: Vec3[] = [];
  const hits = new Map<string, { damage: number; headshot: boolean }>();

  for (const raw of directions) {
    const dir = normalize(raw);
    const wall = raycastBoxes(origin, dir, colliders, MAX_SHOT_RANGE);
    let range = wall ? wall.distance : MAX_SHOT_RANGE;
    let victim: { id: string; zone: string } | null = null;

    for (const target of targets) {
      if (!target.pose.alive) continue;
      const hit = raycastPlayer(origin, dir, target.pose.pos, target.pose.crouching, range);
      if (hit) {
        range = hit.distance;
        victim = { id: target.id, zone: hit.zone };
      }
    }
    ends.push(addScaled(origin, dir, range));
    if (!victim) continue;

    const headshot = victim.zone === 'head';
    let damage = damageAtDistance(weapon, range);
    if (victim.zone === 'legs') damage *= LIMB_DAMAGE_MULTIPLIER;
    const total = hits.get(victim.id) ?? { damage: 0, headshot: false };
    // Headshots one-shot, except weapons that need several (M4A4: 2, shotgun: 4). One trigger pull counts
    // as one headshot, however many pellets hit the head.
    if (headshot && weapon.headshotsToKill) damage = total.headshot ? 0 : maxHealth / weapon.headshotsToKill;
    else if (headshot) damage = Infinity;
    hits.set(victim.id, { damage: total.damage + damage, headshot: total.headshot || headshot });
  }
  return { ends, hits };
}
