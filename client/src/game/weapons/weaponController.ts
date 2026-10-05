import {
  MAX_SHOT_RANGE,
  WEAPONS,
  directionFromYawPitch,
  fireIntervalSeconds,
  raycastBoxes,
  raycastPlayer,
  reloadSeconds,
  type Box,
  type Loadout,
  type SelfSnapshot,
  type Vec3,
  type WeaponId,
  type WeaponSlot,
  type WeaponStats,
} from '@mp-fps/shared';
import * as THREE from 'three';
import type { GameAudio } from '../audio';
import type { Effects } from '../effects/effects';
import type { Input } from '../input';
import type { LocalPlayer } from '../localPlayer';
import type { RemotePlayers } from '../remotePlayers';
import type { ServerClock } from '../serverClock';
import type { GameSocket } from '../../net/socket';
import type { WeaponView } from './weaponView';

/** Where our own tracers start while aiming down sights, relative to the line of sight (meters). */
const ADS_TRACER_OFFSET = { right: 0.05, down: 0.09 };

/** How hard each shot kicks the first-person gun back (default 0.5). */
const VIEW_KICK: Partial<Record<WeaponId, number>> = { awp: 1.2, shotgun: 1.2, deagle: 2, minigun: 0.35 };

const SWITCH_MS = 350;
const SPRINT_TO_FIRE_MS = 150;
/** After a local change, ignore server ammo for a moment (the server hasn't seen it yet). */
const SERVER_SYNC_GRACE_MS = 500;

export interface WeaponDeps {
  socket: GameSocket;
  player: LocalPlayer;
  view: WeaponView;
  audio: GameAudio;
  effects: Effects;
  clock: ServerClock;
  remotePlayers: RemotePlayers;
  world: Box[];
}

/**
 * Client side of shooting: fire rate, ammo, reloading, aiming, spread and recoil.
 * Results are predicted for instant feedback; the server decides what actually hit.
 */
export class WeaponController {
  loadout: Loadout | null = null;
  /** 0 = hip fire, 1 = fully aimed down sights. */
  ads = 0;
  /** Camera shake requested by the last shot; the game reads it with takeShake(). */
  private shakeImpulse = 0;
  sprinting = false;
  currentSpread = 0;
  private reloadStartedAt = 0;
  private reloadEndsAt = 0;
  private nextFireAt = 0;
  private readyAt = 0;
  private sprintEndedAt = 0;
  private lastLocalChange = 0;

  constructor(private readonly d: WeaponDeps) {}

  get weapon(): WeaponStats | null {
    const id = this.loadout?.[this.loadout.active];
    return id ? WEAPONS[id] : null;
  }

  get ammo() {
    return this.loadout ? this.loadout.ammo[this.loadout.active] : { mag: 0 };
  }

  takeShake(): number {
    const shake = this.shakeImpulse;
    this.shakeImpulse = 0;
    return shake;
  }

  get isReloading(): boolean {
    return this.reloadEndsAt > 0;
  }

  get reloadProgress(): number {
    if (!this.isReloading) return -1;
    return THREE.MathUtils.clamp(
      (performance.now() - this.reloadStartedAt) / (this.reloadEndsAt - this.reloadStartedAt),
      0,
      1,
    );
  }

  /** 0..1 how far the weapon is raised after switching. */
  get raise(): number {
    return THREE.MathUtils.clamp(1 - (this.readyAt - performance.now()) / SWITCH_MS, 0, 1);
  }

  setLoadout(loadout: Loadout): void {
    this.loadout = structuredClone(loadout);
    this.reloadEndsAt = 0;
    this.readyAt = performance.now() + SWITCH_MS;
    this.lastLocalChange = performance.now();
    this.applyWeapon();
  }

  syncFromServer(you: SelfSnapshot): void {
    if (performance.now() - this.lastLocalChange < SERVER_SYNC_GRACE_MS || this.isReloading) return;
    const server = you.loadout;
    const local = this.loadout;
    const weaponChanged =
      !local ||
      local.primary !== server.primary ||
      local.secondary !== server.secondary ||
      local.active !== server.active;
    this.loadout = structuredClone(server);
    if (weaponChanged) this.applyWeapon();
  }

  switchTo(slot: WeaponSlot): void {
    if (!this.loadout || !this.loadout[slot] || this.loadout.active === slot) return;
    this.loadout.active = slot;
    this.reloadEndsAt = 0;
    this.readyAt = performance.now() + SWITCH_MS;
    this.lastLocalChange = performance.now();
    this.d.socket.send({ type: 'switchWeapon', slot });
    this.applyWeapon();
  }

  toggleSlot(): void {
    if (this.loadout) this.switchTo(this.loadout.active === 'primary' ? 'secondary' : 'primary');
  }

  reload(): void {
    const weapon = this.weapon;
    const ammo = this.ammo;
    if (!weapon || this.isReloading || ammo.mag >= weapon.magSize) return;
    const now = performance.now();
    this.reloadStartedAt = now;
    this.reloadEndsAt = now + reloadSeconds(weapon, weapon.magSize - ammo.mag) * 1000;
    this.lastLocalChange = now;
    this.d.socket.send({ type: 'reload' });
    this.d.audio.reload();
  }

  update(dt: number, input: Input, wantsSprint: boolean): void {
    const weapon = this.weapon;
    const now = performance.now();
    if (!weapon) return;

    if (this.isReloading && now >= this.reloadEndsAt) this.finishReload(weapon);

    // No aiming down sights while reloading; holding right click resumes aiming once the reload ends.
    const wantsAds = input.aimHeld && !this.isReloading;
    const wasSprinting = this.sprinting;
    this.sprinting = wantsSprint && !wantsAds;
    if (wasSprinting && !this.sprinting) this.sprintEndedAt = now;
    const adsTarget = wantsAds && !this.sprinting ? 1 : 0;
    this.ads = moveTowards(this.ads, adsTarget, dt / weapon.adsTime);

    const moving = Math.min(this.d.player.horizontalSpeed / 5, 1);
    const airborne = this.d.player.state.onGround ? 0 : 0.04;
    this.currentSpread =
      THREE.MathUtils.lerp(weapon.hipSpread, weapon.adsSpread, this.ads) + weapon.moveSpread * moving + airborne;

    const trigger = weapon.automatic ? input.fireHeld : input.wasFirePressed();
    if (trigger) this.tryFire(weapon, now);
  }

  private tryFire(weapon: WeaponStats, now: number): void {
    if (this.sprinting || now - this.sprintEndedAt < SPRINT_TO_FIRE_MS) return;
    if (now < this.readyAt || now < this.nextFireAt || this.isReloading) return;
    const ammo = this.ammo;
    if (ammo.mag <= 0) {
      this.d.audio.dryFire();
      this.nextFireAt = now + 250;
      this.reload();
      return;
    }

    ammo.mag--;
    this.nextFireAt = now + fireIntervalSeconds(weapon) * 1000;
    this.lastLocalChange = now;

    const { player } = this.d;
    const directions: Vec3[] = [];
    for (let i = 0; i < weapon.pellets; i++)
      directions.push(this.spreadDirection(player.aimYaw, player.aimPitch, this.currentSpread));
    this.d.socket.send({ type: 'fire', weaponId: weapon.id, directions, viewTime: this.d.clock.renderTime() });

    const recoilScale = 1 - this.ads * 0.35;
    player.addRecoil(weapon.recoilPitch * recoilScale, (Math.random() - 0.5) * 2 * weapon.recoilYaw * recoilScale);
    this.d.view.fire(weapon.id, VIEW_KICK[weapon.id] ?? 0.5);
    this.shakeImpulse = Math.max(this.shakeImpulse, weapon.cameraShake ?? 0);
    this.d.audio.gunshot(weapon.id, null);
    this.showShotEffects(weapon, directions);

    if (ammo.mag === 0) setTimeout(() => this.reload(), 300);
  }

  /** Local visual prediction: tracers and impacts appear instantly, damage comes from the server. */
  private showShotEffects(weapon: WeaponStats, directions: Vec3[]): void {
    const eye = this.d.player.eyePosition(0);
    const origin = { x: eye.x, y: eye.y, z: eye.z };
    const forward = new THREE.Vector3().copy(directionFromYawPitch(this.d.player.aimYaw, this.d.player.aimPitch));
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const muzzle = eye
      .clone()
      .addScaledVector(forward, 0.7)
      .addScaledVector(right, 0.15 * (1 - this.ads))
      .add(new THREE.Vector3(0, -0.12 * (1 - this.ads), 0));
    this.d.effects.flashes.flash(muzzle, null, weapon.id);
    this.d.effects.muzzleSmoke(muzzle, forward);
    // Aimed down sights the muzzle is right on our line of sight, so a tracer from there would fly straight
    // away from the eye and be invisible. Start it a bit below and right of the sights (where the barrel
    // really is) so we watch it streak into the distance toward the impact point.
    const tracerStart = muzzle
      .clone()
      .addScaledVector(right, ADS_TRACER_OFFSET.right * this.ads)
      .add(new THREE.Vector3(0, -ADS_TRACER_OFFSET.down * this.ads, 0));

    for (const dir of directions) {
      const wall = raycastBoxes(origin, dir, this.d.world, MAX_SHOT_RANGE);
      let range = wall ? wall.distance : MAX_SHOT_RANGE;
      let hitPlayer = false;
      for (const target of this.d.remotePlayers.visibleTargets()) {
        const hit = raycastPlayer(origin, dir, target.pos, target.crouching, range);
        if (hit) {
          range = hit.distance;
          hitPlayer = true;
        }
      }
      const dirVec = new THREE.Vector3(dir.x, dir.y, dir.z);
      const end = eye.clone().addScaledVector(dirVec, range);
      this.d.effects.tracers.spawn(tracerStart, end);
      if (hitPlayer) this.d.effects.bloodHit(end, dirVec);
      else if (wall) this.d.effects.impact(end, new THREE.Vector3(wall.normal.x, wall.normal.y, wall.normal.z));
    }
  }

  private spreadDirection(yaw: number, pitch: number, spread: number): Vec3 {
    const forward = new THREE.Vector3().copy(directionFromYawPitch(yaw, pitch));
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * Math.tan(spread);
    const dir = forward
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(up, Math.sin(angle) * radius)
      .normalize();
    return { x: dir.x, y: dir.y, z: dir.z };
  }

  private finishReload(weapon: WeaponStats): void {
    // Reserve ammo is infinite: a reload always fills the magazine.
    this.ammo.mag = weapon.magSize;
    this.reloadEndsAt = 0;
    this.lastLocalChange = performance.now();
  }

  private applyWeapon(): void {
    const weapon = this.weapon;
    this.d.view.setWeapon(weapon?.id ?? null);
    this.d.player.speedMultiplier = weapon?.moveSpeedMultiplier ?? 1;
  }
}

function moveTowards(value: number, target: number, maxDelta: number): number {
  return Math.abs(target - value) <= maxDelta ? target : value + Math.sign(target - value) * maxDelta;
}
