import { lerpVec3, type Vec3 } from '@mp-fps/shared';

export interface PastPose {
  pos: Vec3;
  crouching: boolean;
  alive: boolean;
}

interface Frame {
  time: number;
  poses: Map<string, PastPose>;
}

const MAX_FRAMES = 60;

/** Remembers where every player was during the last ~2 seconds, for lag compensation. */
export class PoseHistory {
  private readonly frames: Frame[] = [];

  record(time: number, poses: Map<string, PastPose>): void {
    this.frames.push({ time, poses });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  /** Pose of a player at a past time, interpolated between the two closest frames. */
  poseAt(playerId: string, time: number): PastPose | null {
    for (let i = this.frames.length - 1; i > 0; i--) {
      const newer = this.frames[i];
      const older = this.frames[i - 1];
      if (older.time > time) continue;
      const a = older.poses.get(playerId);
      const b = newer.poses.get(playerId);
      if (!a || !b) return b ?? a ?? null;
      const t = Math.min(1, (time - older.time) / (newer.time - older.time || 1));
      return {
        pos: lerpVec3(a.pos, b.pos, t),
        crouching: t < 0.5 ? a.crouching : b.crouching,
        alive: a.alive && b.alive,
      };
    }
    return this.frames[0]?.poses.get(playerId) ?? null;
  }
}
