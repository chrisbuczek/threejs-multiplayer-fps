import {
  FLASH_RANGE,
  GRENADE_COOLDOWN,
  GRENADE_FUSE,
  GRENADE_RADIUS,
  RESPAWN_SECONDS,
  WEAPONS,
  getMap,
  type GrenadeKind,
  type KillWeapon,
  raycastBoxes,
  type BuiltMap,
  type MatchInfo,
  type RoomInfo,
  type Scores,
  type ServerMessage,
  type Team,
  type Vec3,
} from '@mp-fps/shared';
import * as THREE from 'three';
import { h } from '../dom';
import type { GameSocket } from '../net/socket';
import { loadSettings, saveSettings, type UserSettings } from '../settings';
import { BuyMenu } from '../ui/buyMenu';
import { HeadshotBanner } from '../ui/headshotBanner';
import { Hud } from '../ui/hud';
import { PauseMenu } from '../ui/pauseMenu';
import { Scoreboard } from '../ui/scoreboard';
import { GameAudio } from './audio';
import { AmbientSmoke } from './effects/ambientSmoke';
import { Effects } from './effects/effects';
import { SmokeClouds } from './effects/smokeClouds';
import { Flashlights } from './flashlights';
import { Grenades } from './grenades';
import { Input } from './input';
import { Lighting } from './lighting';
import { LocalPlayer, type Controls } from './localPlayer';
import { buildMapMeshes } from './mapBuilder';
import { RemotePlayers } from './remotePlayers';
import { GameRenderer } from './renderer';
import { ServerClock } from './serverClock';
import { WeaponController } from './weapons/weaponController';
import { WeaponView } from './weapons/weaponView';

const BUY_HINT_MS = 5000;
/** Bullets passing within this many meters of our head make a whizzing sound. */
const NEAR_MISS_DISTANCE = 1.2;
/** Strongest blur of the world view right after being flashed. */
const FLASH_BLUR_PX = 14;
/** Sniper scope blur while walking: time to fully blur, time to refocus, and strongest blur. */
const SCOPE_BLUR_IN_SECONDS = 1.5;
const SCOPE_BLUR_OUT_SECONDS = 0.5;
const SCOPE_BLUR_MAX_PX = 8;

type Msg<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

interface DeathInfo {
  killerId: string;
  respawnAt: number;
  cameraStart: THREE.Vector3;
}

/**
 * One running match on the client. Owns the 3D scene and wires together input,
 * prediction, networking, weapons, effects, audio and the HUD.
 */
export class Game {
  private readonly settings: UserSettings = loadSettings();
  private readonly root: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly map: BuiltMap;
  private readonly renderer: GameRenderer;
  private readonly lighting: Lighting;
  private readonly input: Input;
  private readonly clock = new ServerClock();
  private readonly player: LocalPlayer;
  private readonly remotes: RemotePlayers;
  private readonly view: WeaponView;
  private readonly effects: Effects;
  private readonly grenades: Grenades;
  private readonly smokeClouds: SmokeClouds;
  private readonly flashlights: Flashlights;
  private readonly ambientSmoke: AmbientSmoke | null;
  private flashlightOn = false;
  private readonly audio: GameAudio;
  private readonly weapons: WeaponController;
  private readonly hud = new Hud();
  private readonly scoreboard: Scoreboard;
  private readonly buyMenu: BuyMenu;
  private readonly banner = new HeadshotBanner();
  private readonly pause: PauseMenu;
  private readonly unsubscribe: (() => void)[] = [];

  private readonly names = new Map<string, { name: string; team: Team }>();
  private myTeam: Team = 'none';
  private health = 0;
  /** Show the "press B" hint for a few seconds after each spawn. */
  private buyHintUntil = 0;
  /** Server time when our next grenade of each type is ready. */
  private grenadeReadyAt: Record<GrenadeKind, number> = { frag: 0, smoke: 0, flash: 0 };
  /** Camera shake from nearby explosions, decays over time. */
  private shake = 0;
  /** Rate limit for near-miss sounds (a minigun spray would be a wall of noise). */
  private lastWhizAt = 0;
  /** 0..1: how blurred the sniper scope view is from walking while scoped. */
  private scopeBlur = 0;
  private scores: Scores = { players: [], teamKills: { red: 0, blue: 0 } };
  private death: DeathInfo | null = null;
  private matchOver = false;
  private crouchToggled = false;
  private stepTimer = 0;
  private lastFrame = performance.now();
  private animationFrame = 0;

  constructor(
    container: HTMLElement,
    private readonly socket: GameSocket,
    private readonly playerId: string,
    room: RoomInfo,
    private readonly match: MatchInfo,
  ) {
    this.updateRoom(room);
    this.map = getMap(match.settings.map);
    const theme = this.map.definition.theme;

    this.root = h('div', { className: 'game-root' });
    container.append(this.root);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 2000);
    this.camera.rotation.order = 'YXZ';
    this.renderer = new GameRenderer(this.root, this.scene, this.camera, this.settings.quality, theme.exposure);
    this.renderer.motionBlurEnabled = this.settings.motionBlur;
    this.lighting = new Lighting(this.scene, this.renderer.renderer, theme, this.settings.quality);
    this.scene.add(buildMapMeshes(this.map));
    if (theme.lightShafts) {
      this.renderer.enableLightShafts(this.scene, this.lighting.sky, {
        sunDirection: this.lighting.sunDirection,
        color: theme.sunColor,
        intensity: theme.lightShafts,
        flare: theme.lensFlare ?? 0,
      });
    }

    this.input = new Input(this.renderer.canvas);
    this.player = new LocalPlayer(this.map.colliders);
    this.remotes = new RemotePlayers(this.scene, playerId, match.settings.mode);
    const sunDirection = this.lighting.sun.position.clone().sub(this.lighting.sun.target.position).normalize();
    this.view = new WeaponView(
      this.lighting.environment,
      theme.sunColor,
      sunDirection,
      Math.min(1, theme.sunIntensity / 1.2),
      theme.skyLightColor,
    );
    this.view.scene.environmentIntensity = (theme.environmentIntensity ?? 0.6) * Math.min(1, theme.sunIntensity / 1.2);
    this.effects = new Effects(this.scene, this.map.colliders, Math.min(1.2, theme.sunIntensity / 2.5));
    this.grenades = new Grenades(this.scene, this.map.colliders);
    this.smokeClouds = new SmokeClouds(
      (mesh) => this.renderer.addSmoke(this.scene, mesh),
      this.map.colliders,
      Math.min(1.2, theme.sunIntensity / 2.5) + 0.25 * Math.min(1, theme.sunIntensity) /* barely lit at night */,
    );
    this.ambientSmoke = theme.ambientSmoke
      ? new AmbientSmoke((mesh) => this.renderer.addSmoke(this.scene, mesh), this.map, theme.ambientSmoke)
      : null;
    this.flashlights = new Flashlights(
      this.scene,
      this.settings.quality === 'high' || this.settings.quality === 'ultra',
    );
    this.audio = new GameAudio(this.settings.volume);
    this.weapons = new WeaponController({
      socket,
      player: this.player,
      view: this.view,
      audio: this.audio,
      effects: this.effects,
      clock: this.clock,
      remotePlayers: this.remotes,
      world: this.map.colliders,
    });

    this.scoreboard = new Scoreboard(match.settings.mode, playerId);
    this.scoreboard.hide();
    this.buyMenu = new BuyMenu((weaponId) => {
      socket.send({ type: 'buyWeapon', weaponId });
      void this.input.requestLock();
    });
    this.buyMenu.close();
    this.pause = new PauseMenu(this.settings, {
      onResume: () => this.lockPointer(),
      onLeave: () => socket.send({ type: 'leaveRoom' }),
      onChange: (s) => this.applySettings(s),
    });
    this.root.append(this.hud.root, this.banner.root, this.scoreboard.root, this.buyMenu.root, this.pause.root);
    this.pause.show();

    this.renderer.canvas.addEventListener('click', this.lockPointer);
    this.input.onLockChanged((locked) => {
      if (locked) this.pause.hide();
      else if (!this.buyMenu.isOpen && !this.matchOver) this.pause.show();
    });
    this.listen();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  updateRoom(room: RoomInfo): void {
    for (const p of room.players) this.names.set(p.id, { name: p.name, team: p.team });
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.unsubscribe.forEach((u) => u());
    this.input.dispose();
    this.view.dispose();
    this.audio.dispose();
    this.remotes.dispose();
    this.grenades.dispose();
    this.renderer.dispose();
    this.root.remove();
  }

  // ───────────── Networking ─────────────

  private listen(): void {
    const on = <T extends ServerMessage['type']>(type: T, handler: (m: Msg<T>) => void) =>
      this.unsubscribe.push(this.socket.on(type, handler));

    on('snapshot', (m) => this.onSnapshot(m));
    on('spawn', (m) => this.onSpawn(m));
    on('shot', (m) => this.onShot(m));
    on('hitConfirm', ({ kill, headshot }) => {
      this.hud.showHitmarker(kill);
      this.audio.hitmarker(kill);
      if (headshot) this.audio.headshotHit();
    });
    on('damaged', (m) => this.onDamaged(m));
    on('kill', (m) => this.onKill(m));
    on('grenadeThrown', (m) => {
      this.grenades.add(
        m.id,
        m.kind,
        m.pos,
        m.vel,
        (this.clock.now() - (m.explodeAt - GRENADE_FUSE[m.kind] * 1000)) / 1000,
      );
    });
    on('grenadeExploded', (m) => this.onGrenadeExploded(m));
    on('scores', ({ scores }) => {
      this.scores = scores;
      for (const p of scores.players) this.names.set(p.id, { name: p.name, team: p.team });
    });
    on('matchEnd', ({ scores, winner }) => {
      this.matchOver = true;
      this.scoreboard.showFinal(scores, winner);
      this.buyMenu.close();
      this.pause.hide();
      if (this.input.isLocked) document.exitPointerLock();
    });
  }

  private onSnapshot(m: Msg<'snapshot'>): void {
    this.clock.sync(m.serverTime);
    const me = m.players.find((p) => p.id === this.playerId);
    if (me) this.myTeam = me.team;
    const names = new Map([...this.names].map(([id, v]) => [id, v.name]));
    this.remotes.onSnapshot(m.serverTime, m.players, this.myTeam, names);
    if (!m.you) return;
    this.player.reconcile(m.you);
    this.weapons.syncFromServer(m.you);
    this.health = m.you.health;
    this.grenadeReadyAt = { ...m.you.grenadeReadyAt };
  }

  private onSpawn(m: Msg<'spawn'>): void {
    this.player.spawn(m.pos, m.yaw);
    this.weapons.setLoadout(m.loadout);
    this.buyHintUntil = performance.now() + BUY_HINT_MS;
    this.health = this.match.settings.maxHealth;
    this.death = null;
    this.crouchToggled = false;
    this.hud.hideDeath();
  }

  private onShot(m: Msg<'shot'>): void {
    const shooter = this.remotes.get(m.shooterId);
    const muzzle = shooter
      ? shooter.model.getMuzzleWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(m.origin.x, m.origin.y, m.origin.z);
    const aim = m.ends[0] ?? m.origin;
    const direction = new THREE.Vector3(aim.x - m.origin.x, aim.y - m.origin.y, aim.z - m.origin.z).normalize();
    this.effects.flashes.flash(muzzle, direction, m.weaponId);
    this.effects.muzzleSmoke(muzzle, direction);
    this.audio.gunshot(m.weaponId, muzzle);
    this.playNearMiss(m.origin, m.ends);
    for (const end of m.ends) {
      const endVec = new THREE.Vector3(end.x, end.y, end.z);
      this.effects.tracers.spawn(muzzle, endVec);
      const dir = endVec
        .clone()
        .sub(m.origin as THREE.Vector3Like)
        .normalize();
      const length = endVec.distanceTo(m.origin as THREE.Vector3Like);
      const wall = raycastBoxes(m.origin, dir, this.map.colliders, length + 0.05);
      if (wall && Math.abs(wall.distance - length) < 0.05) {
        this.effects.impact(endVec, new THREE.Vector3(wall.normal.x, wall.normal.y, wall.normal.z));
      } else if (length < 290) {
        this.effects.bloodHit(endVec, dir);
      }
    }
  }

  private onGrenadeExploded(m: Msg<'grenadeExploded'>): void {
    this.grenades.remove(m.id);
    const center = new THREE.Vector3(m.pos.x, m.pos.y, m.pos.z);
    const distance = center.distanceTo(this.camera.position);
    if (m.kind === 'smoke') {
      this.smokeClouds.spawn(center);
      this.audio.grenadeThrow(); // soft hiss as the canister starts pouring
      return;
    }
    if (m.kind === 'flash') {
      this.effects.flashBurst(center);
      this.audio.flashBang(center);
      this.applyFlash(center, distance);
      return;
    }
    this.effects.explosion(center);
    this.audio.explosion(center);
    this.shake = Math.max(this.shake, Math.max(0, 1 - distance / (GRENADE_RADIUS * 2.5)));
  }

  /** Blinds us if we can see the flashbang: stronger when close and when looking at it. */
  private applyFlash(center: THREE.Vector3, distance: number): void {
    if (!this.player.alive || distance > FLASH_RANGE) return;
    const eye = this.camera.position;
    const toFlash = center.clone().sub(eye).normalize();
    const wall = raycastBoxes(eye, toFlash, this.map.colliders, Math.max(0, distance - 0.15));
    if (wall) return;
    const facing = this.camera.getWorldDirection(new THREE.Vector3()).dot(toFlash); // -1 behind .. 1 straight at it
    const look = THREE.MathUtils.clamp((facing + 0.3) / 1.3, 0, 1);
    const near = 1 - distance / FLASH_RANGE;
    const strength = THREE.MathUtils.clamp(near * (0.3 + 0.7 * look) * 1.25, 0, 1);
    if (strength < 0.05) return;
    const seconds = 0.5 + 2.8 * strength;
    this.hud.flashBlind(strength, seconds);
    this.audio.flashRinging(strength, seconds);
  }

  private toggleFlashlight(): void {
    this.flashlightOn = !this.flashlightOn;
    this.socket.send({ type: 'flashlight', on: this.flashlightOn });
    this.view.setFlashlight(this.flashlightOn);
    this.audio.flashlightClick();
  }

  private throwGrenade(kind: GrenadeKind): void {
    if (this.clock.now() < this.grenadeReadyAt[kind]) return;
    // Optimistic cooldown so holding the key doesn't spam; the server's value arrives with the next snapshot.
    this.grenadeReadyAt[kind] = this.clock.now() + GRENADE_COOLDOWN[kind] * 1000;
    this.socket.send({ type: 'throwGrenade', kind, yaw: this.player.aimYaw, pitch: this.player.aimPitch });
    this.audio.grenadeThrow();
  }

  /** Bullets from someone else that passed close to our head make a whizzing sound. */
  private playNearMiss(origin: Vec3, ends: Vec3[]): void {
    if (!this.player.alive || performance.now() - this.lastWhizAt < 70) return;
    const head = this.camera.position;
    const from = new THREE.Vector3(origin.x, origin.y, origin.z);
    let best: { point: THREE.Vector3; distance: number } | null = null;
    for (const end of ends) {
      const segment = new THREE.Line3(from, new THREE.Vector3(end.x, end.y, end.z));
      const point = segment.closestPointToPoint(head, true, new THREE.Vector3());
      const distance = point.distanceTo(head);
      // Skip bullets that stopped well before reaching us (they never flew past).
      if (point.equals(segment.end) && segment.distance() < from.distanceTo(head) - 1) continue;
      if (!best || distance < best.distance) best = { point, distance };
    }
    if (!best || best.distance > NEAR_MISS_DISTANCE) return;
    this.lastWhizAt = performance.now();
    const closeness = 1 - best.distance / NEAR_MISS_DISTANCE;
    this.audio.bulletWhiz(best.point, closeness);
    this.hud.flashNearMiss(closeness);
  }

  private onDamaged(m: Msg<'damaged'>): void {
    this.health = m.health;
    this.audio.damageTaken();
    const dx = m.attackerPos.x - this.player.state.pos.x;
    const dz = m.attackerPos.z - this.player.state.pos.z;
    const yawToAttacker = Math.atan2(-dx, -dz);
    this.hud.showDamage(-(yawToAttacker - this.player.yaw));
  }

  private onKill(m: Msg<'kill'>): void {
    const killer = this.names.get(m.killerId) ?? { name: '?', team: 'none' as Team };
    const victim = this.names.get(m.victimId) ?? { name: '?', team: 'none' as Team };
    const mine = m.killerId === this.playerId || m.victimId === this.playerId;
    this.hud.addKill(killer, victim, killWeaponName(m.weaponId), m.headshot, mine);
    this.remotes.playDeath(m.victimId);

    const head = new THREE.Vector3(m.headPos.x, m.headPos.y, m.headPos.z);
    const killerPos = m.killerId === this.playerId ? this.camera.position : this.remotes.get(m.killerId)?.position;
    const direction = killerPos ? head.clone().sub(killerPos).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    if (m.headshot) this.effects.headshotBurst(head, direction);
    else this.effects.bloodHit(head.clone().setY(head.y - 0.4), direction);

    if (m.killerId === this.playerId && m.victimId !== this.playerId) this.hud.showElimination(victim.name);
    if (m.killerId === this.playerId && m.headshot) {
      this.banner.show();
      this.audio.headshot();
    }
    if (m.victimId === this.playerId) {
      this.player.alive = false;
      this.buyMenu.close();
      this.death = {
        killerId: m.killerId,
        respawnAt: performance.now() + RESPAWN_SECONDS * 1000,
        cameraStart: this.camera.position.clone(),
      };
    }
  }

  // ───────────── Frame loop ─────────────

  private readonly frame = (time: number) => {
    this.animationFrame = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (time - this.lastFrame) / 1000);
    this.lastFrame = time;

    const playing = this.input.isLocked && this.player.alive && !this.matchOver;
    this.handleKeys(playing);
    if (playing) {
      const fovScale = this.camera.fov / this.settings.fov;
      this.player.look(this.input.mouseDX, this.input.mouseDY, this.settings.sensitivity * fovScale);
    }

    const controls = this.readControls(playing);
    this.player.update(dt, controls);
    const inputs = this.player.takeOutbox();
    if (inputs.length > 0) this.socket.send({ type: 'inputs', inputs });
    if (playing && !this.buyMenu.isOpen) this.weapons.update(dt, this.input, controls.sprint);
    this.shake = Math.max(this.shake, this.weapons.takeShake());

    this.grenades.update(dt);
    this.smokeClouds.update(dt);
    this.ambientSmoke?.update(dt);
    this.remotes.update(this.clock.renderTime(), dt);
    for (const step of this.remotes.footsteps) this.audio.footstep(step);
    this.updateCamera(dt);
    this.updateViewmodel(dt);
    this.flashlights.update(this.camera, this.flashlightOn && this.player.alive, this.remotes.withFlashlight());
    this.effects.update(dt, this.camera, this.renderer.canvas.height);
    this.lighting.follow(this.camera.position);
    this.lighting.update(dt);
    this.audio.updateListener(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    this.playOwnFootsteps(dt);
    this.updateHud();

    const scoped = this.weapons.weapon?.id === 'awp' && this.weapons.ads > 0.95;
    this.renderer.render(this.view.scene, this.view.camera, dt, {
      focus: this.view.dofFocus,
      amount: scoped ? 0 : this.weapons.ads,
    });
    this.input.endFrame();
  };

  private handleKeys(playing: boolean): void {
    const input = this.input;
    if (input.wasPressed('Tab') && !this.matchOver) this.scoreboard.show(this.scores, this.secondsLeft());
    if (input.wasReleased('Tab') && !this.matchOver) this.scoreboard.hide();
    if (input.wasPressed('KeyB')) this.toggleBuyMenu();

    if (this.buyMenu.isOpen) {
      for (let i = 0; i < 9; i++) if (input.wasPressed(`Digit${i + 1}`)) this.buyMenu.pick(i);
      return;
    }
    if (!playing) return;
    if (input.wasPressed('KeyR')) this.weapons.reload();
    if (input.wasPressed('KeyG')) this.throwGrenade('frag');
    if (input.wasPressed('KeyH')) this.throwGrenade('smoke');
    if (input.wasPressed('KeyJ')) this.throwGrenade('flash');
    if (input.wasPressed('KeyF')) this.toggleFlashlight();
    if (input.wasPressed('Digit1')) this.weapons.switchTo('primary');
    if (input.wasPressed('Digit2')) this.weapons.switchTo('secondary');
    if (input.wheel !== 0) this.weapons.toggleSlot();
    if (input.wasPressed('KeyC')) this.crouchToggled = !this.crouchToggled;
  }

  private readControls(playing: boolean): Controls {
    const key = (code: string) => (playing ? Number(this.input.isDown(code)) : 0);
    const forward = key('KeyW') - key('KeyS');
    const right = key('KeyD') - key('KeyA');
    const sprint = playing && this.input.isDown('ShiftLeft') && forward > 0 && !this.input.aimHeld;
    if (sprint) this.crouchToggled = false;
    return {
      forward,
      right,
      jump: playing && this.input.isDown('Space'),
      crouch: playing && this.crouchToggled,
      sprint,
      ads: playing && this.input.aimHeld && !sprint && !this.weapons.isReloading,
    };
  }

  private toggleBuyMenu(): void {
    if (this.buyMenu.isOpen) {
      this.buyMenu.close();
      this.lockPointer();
      return;
    }
    if (!this.player.alive || this.matchOver) return;
    this.buyMenu.open(this.match.settings.allowedWeapons, this.weapons.loadout);
    if (this.input.isLocked) document.exitPointerLock();
  }

  private updateCamera(dt: number): void {
    if (this.death) {
      // Death cam: rise up and look towards the killer.
      const t = Math.min(1, 1 - (this.death.respawnAt - performance.now()) / (RESPAWN_SECONDS * 1000));
      this.camera.position.copy(this.death.cameraStart).add(new THREE.Vector3(0, 1.5 * Math.min(1, t * 2), 0));
      const killer = this.remotes.get(this.death.killerId);
      if (killer) this.camera.lookAt(killer.position.clone().setY(killer.position.y + 1.4));
      return;
    }
    this.camera.position.copy(this.player.eyePosition(dt));
    this.camera.rotation.set(this.player.aimPitch, this.player.aimYaw, 0);
    if (this.shake > 0.001) {
      const k = this.shake * this.shake * 0.04;
      this.camera.rotation.x += (Math.random() - 0.5) * k;
      this.camera.rotation.y += (Math.random() - 0.5) * k;
      this.shake *= Math.exp(-6 * dt);
    }

    const weapon = this.weapons.weapon;
    const adsFov = weapon ? Math.min(this.settings.fov, weapon.adsFov * (this.settings.fov / 80)) : this.settings.fov;
    const targetFov =
      THREE.MathUtils.lerp(this.settings.fov, adsFov, this.weapons.ads) + (this.weapons.sprinting ? 5 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 20);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateViewmodel(dt: number): void {
    this.view.syncRotation(this.camera);
    const scoped = this.weapons.weapon?.id === 'awp' && this.weapons.ads > 0.95;
    this.view.update(dt, {
      ads: this.weapons.ads,
      sprinting: this.weapons.sprinting,
      reloadProgress: this.weapons.reloadProgress,
      raise: this.weapons.raise,
      mouseDX: this.input.mouseDX,
      mouseDY: this.input.mouseDY,
      bob: this.player.bob,
      bobSide: this.player.bobSide,
      hidden: !this.player.alive || scoped || this.matchOver,
      airborne: this.player.alive && !this.player.state.onGround,
    });
    this.hud.setScope(scoped && this.player.alive);
    this.updateScopeBlur(dt, scoped && this.player.alive);
  }

  /** Walking while scoped slowly blurs the scope's ring and crosshair; standing still sharpens them quickly. */
  private updateScopeBlur(dt: number, scoped: boolean): void {
    const walking = scoped && this.player.horizontalSpeed > 0.8;
    const rate = walking ? dt / SCOPE_BLUR_IN_SECONDS : -dt / SCOPE_BLUR_OUT_SECONDS;
    this.scopeBlur = scoped ? THREE.MathUtils.clamp(this.scopeBlur + rate, 0, 1) : 0;
    const px = this.scopeBlur * this.scopeBlur * SCOPE_BLUR_MAX_PX;
    this.hud.setScopeBlur(px);
  }

  private playOwnFootsteps(dt: number): void {
    const speed = this.player.horizontalSpeed;
    if (!this.player.alive || !this.player.state.onGround || speed < 3 || this.player.state.crouching) return;
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = speed > 6 ? 0.3 : 0.4;
      this.audio.footstep(null);
    }
  }

  private updateHud(): void {
    const max = this.match.settings.maxHealth;
    this.hud.setHealth(this.player.alive ? this.health : 0, max);
    const weapon = this.weapons.weapon;
    const ammo = this.weapons.ammo;
    this.hud.setWeapon(weapon?.name ?? '', ammo.mag, this.weapons.isReloading);
    const now = this.clock.now();
    this.hud.setGrenades({
      frag: (this.grenadeReadyAt.frag - now) / 1000,
      smoke: (this.grenadeReadyAt.smoke - now) / 1000,
      flash: (this.grenadeReadyAt.flash - now) / 1000,
    });
    const flashBlur = this.hud.updateFlash();
    this.renderer.canvas.style.filter = flashBlur > 0.01 ? `blur(${(flashBlur * FLASH_BLUR_PX).toFixed(2)}px)` : '';

    const spreadPx =
      (Math.tan(this.weapons.currentSpread) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) *
      (window.innerHeight / 2);
    this.hud.setCrosshair(spreadPx, this.player.alive && this.weapons.ads < 0.5 && !this.weapons.sprinting);
    this.hud.setTimer(this.secondsLeft());
    this.hud.setScores(this.scoreBar());

    const canBuy = this.player.alive && !this.matchOver;
    this.hud.setBuyHint(canBuy && !this.buyMenu.isOpen && performance.now() < this.buyHintUntil);
    if (this.buyMenu.isOpen && !canBuy) this.toggleBuyMenu();

    if (this.death) {
      const killer = this.names.get(this.death.killerId)?.name ?? 'Unknown';
      this.hud.showDeath(killer, (this.death.respawnAt - performance.now()) / 1000);
    }
  }

  private scoreBar(): HTMLElement {
    const limit = this.match.settings.scoreLimit;
    if (this.match.settings.mode === 'tdm') {
      const { red, blue } = this.scores.teamKills;
      return h(
        'div',
        { className: 'team-scores' },
        h('span', { className: `team-score team-red ${this.myTeam === 'red' ? 'mine' : ''}`, text: String(red) }),
        h('span', { className: 'muted', text: `first to ${limit}` }),
        h('span', { className: `team-score team-blue ${this.myTeam === 'blue' ? 'mine' : ''}`, text: String(blue) }),
      );
    }
    const mine = this.scores.players.find((p) => p.id === this.playerId)?.kills ?? 0;
    const leader = Math.max(0, ...this.scores.players.map((p) => p.kills));
    return h(
      'div',
      { className: 'team-scores' },
      h('span', { className: 'team-score mine', text: `You ${mine}` }),
      h('span', { className: 'muted', text: `first to ${limit}` }),
      h('span', { className: 'team-score', text: `Leader ${leader}` }),
    );
  }

  private secondsLeft(): number {
    return (this.match.endsAt - this.clock.now()) / 1000;
  }

  private readonly lockPointer = () => {
    this.audio.resume();
    if (!this.matchOver && !this.buyMenu.isOpen) void this.input.requestLock();
  };

  private applySettings(settings: UserSettings): void {
    Object.assign(this.settings, settings);
    saveSettings(settings);
    this.audio.setVolume(settings.volume);
    this.renderer.motionBlurEnabled = settings.motionBlur;
  }
}

function killWeaponName(id: KillWeapon): string {
  return id === 'grenade' ? 'Grenade' : WEAPONS[id].name;
}
