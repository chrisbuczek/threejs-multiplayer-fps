import type { GameMode, PlayerSnapshot, Team, Vec3 } from '@mp-fps/shared';
import * as THREE from 'three';
import { PlayerModel } from './playerModel';

interface Sample {
  time: number;
  snap: PlayerSnapshot;
}

const DEATH_ANIMATION_MS = 2500;

class RemotePlayer {
  readonly model: PlayerModel;
  readonly samples: Sample[] = [];
  readonly position = new THREE.Vector3();
  crouching = false;
  alive = true;
  yaw = 0;
  pitch = 0;
  flashlight = false;
  dyingSince = 0;
  stepTimer = 0;
  private nameTag: THREE.Sprite | null = null;

  constructor(
    readonly id: string,
    readonly team: Team,
  ) {
    this.model = new PlayerModel(team);
  }

  showNameTag(name: string): void {
    if (this.nameTag) return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '600 28px Oswald, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7fc4ff';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.fillText(name, 128, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    this.nameTag.scale.set(1.2, 0.225, 1);
    this.nameTag.position.y = 2.1;
    this.nameTag.renderOrder = 10;
    this.model.root.add(this.nameTag);
  }
}

/** Other players, drawn slightly in the past and interpolated between snapshots for smooth motion. */
export class RemotePlayers {
  private readonly players = new Map<string, RemotePlayer>();
  /** Positions where a footstep happened this frame (for positional audio). */
  footsteps: THREE.Vector3[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly myId: string,
    private readonly mode: GameMode,
  ) {}

  onSnapshot(serverTime: number, snaps: PlayerSnapshot[], myTeam: Team, names: Map<string, string>): void {
    const seen = new Set<string>();
    for (const snap of snaps) {
      if (snap.id === this.myId) continue;
      seen.add(snap.id);
      let player = this.players.get(snap.id);
      if (!player || player.team !== snap.team) {
        if (player) this.scene.remove(player.model.root);
        player = new RemotePlayer(snap.id, snap.team);
        this.players.set(snap.id, player);
        this.scene.add(player.model.root);
      }
      if (this.mode === 'tdm' && snap.team === myTeam) player.showNameTag(names.get(snap.id) ?? '');
      player.samples.push({ time: serverTime, snap });
      while (player.samples.length > 40) player.samples.shift();
    }
    for (const [id, player] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(player.model.root);
        this.players.delete(id);
      }
    }
  }

  update(renderTime: number, dt: number): void {
    this.footsteps = [];
    for (const player of this.players.values()) this.updatePlayer(player, renderTime, dt);
  }

  playDeath(id: string): void {
    const player = this.players.get(id);
    if (player) player.dyingSince = performance.now();
  }

  /** Living players with their flashlight switched on. */
  withFlashlight(): RemotePlayer[] {
    return [...this.players.values()].filter((p) => p.alive && p.flashlight);
  }

  get(id: string): RemotePlayer | undefined {
    return this.players.get(id);
  }

  /** Living players as currently drawn — used for client-side hit effects. */
  visibleTargets(): { id: string; pos: Vec3; crouching: boolean }[] {
    return [...this.players.values()]
      .filter((p) => p.alive)
      .map((p) => ({ id: p.id, pos: p.position, crouching: p.crouching }));
  }

  dispose(): void {
    for (const player of this.players.values()) this.scene.remove(player.model.root);
    this.players.clear();
  }

  private updatePlayer(player: RemotePlayer, renderTime: number, dt: number): void {
    const { samples } = player;
    if (samples.length === 0) return;

    // Find the two snapshots around renderTime.
    let older = samples[0];
    let newer = samples[samples.length - 1];
    for (let i = samples.length - 1; i > 0; i--) {
      if (samples[i - 1].time <= renderTime) {
        older = samples[i - 1];
        newer = samples[i];
        break;
      }
    }
    const span = newer.time - older.time;
    const t = span > 0 ? THREE.MathUtils.clamp((renderTime - older.time) / span, 0, 1) : 1;
    const a = older.snap;
    const b = newer.snap;

    const previous = player.position.clone();
    player.position.set(
      THREE.MathUtils.lerp(a.pos.x, b.pos.x, t),
      THREE.MathUtils.lerp(a.pos.y, b.pos.y, t),
      THREE.MathUtils.lerp(a.pos.z, b.pos.z, t),
    );
    player.crouching = t < 0.5 ? a.crouching : b.crouching;
    const wasAlive = player.alive;
    player.alive = t < 0.5 ? a.alive : b.alive;
    if (player.alive && !wasAlive) player.dyingSince = 0;

    const root = player.model.root;
    const dying = player.dyingSince > 0 && performance.now() - player.dyingSince < DEATH_ANIMATION_MS;
    root.visible = player.alive || dying;
    if (!player.alive) {
      // Topple over backwards.
      const fall = Math.min(1, (performance.now() - player.dyingSince) / 400);
      root.rotation.x = (fall * Math.PI) / 2;
      return;
    }
    root.rotation.x = 0;
    root.position.copy(player.position);
    player.yaw = lerpAngle(a.yaw, b.yaw, t);
    player.pitch = THREE.MathUtils.lerp(a.pitch, b.pitch, t);
    player.flashlight = b.flashlight;
    root.rotation.y = player.yaw;
    player.model.setWeapon(b.weaponId);
    const speed = dt > 0 ? previous.distanceTo(player.position) / dt : 0;
    // Walking and sprinting are audible, crouch-walking is silent.
    if (speed > 3 && !player.crouching) {
      player.stepTimer -= dt;
      if (player.stepTimer <= 0) {
        player.stepTimer = speed > 6 ? 0.3 : 0.4;
        this.footsteps.push(player.position.clone());
      }
    }
    player.model.animate(dt, Math.min(speed, 8), player.crouching, THREE.MathUtils.lerp(a.pitch, b.pitch, t));
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
