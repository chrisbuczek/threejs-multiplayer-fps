import {
  GRENADE_COOLDOWN,
  GRENADE_FUSE,
  GRENADE_RADIUS,
  HEALTH_REGEN_DELAY_SECONDS,
  HEALTH_REGEN_RATE,
  INPUT_DT,
  MAX_REWIND_MS,
  RESPAWN_SECONDS,
  SPAWN_PROTECTION_SECONDS,
  TICK_RATE,
  WEAPONS,
  createMoveState,
  eyeHeight,
  fireIntervalSeconds,
  getMap,
  grenadeDamage,
  headCenter,
  reloadSeconds,
  stepGrenade,
  stepMovement,
  throwGrenade,
  type BuiltMap,
  type GrenadeKind,
  type GrenadeState,
  type InputCommand,
  type KillWeapon,
  type Loadout,
  type MoveState,
  type PlayerSnapshot,
  type RoomSettings,
  type Scores,
  type ServerMessage,
  type Team,
  type Vec3,
  type WeaponId,
  type WeaponSlot,
  raycastBoxes,
} from '@mp-fps/shared';
import type { Client } from './client';
import { now } from './clock';
import { resolveShot } from './combat';
import { PoseHistory, type PastPose } from './history';
import { activeWeaponId, createLoadout, fullAmmo } from './loadout';
import { chooseSpawn } from './spawns';

const WEAPON_SWITCH_MS = 350;
/** Network jitter can bunch shots together; accept them slightly early. */
const FIRE_RATE_TOLERANCE = 0.8;
const MAX_QUEUED_INPUTS = 120;
const MAX_INPUT_BUDGET = 30;
const SCORES_INTERVAL_MS = 2000;

interface MatchPlayer {
  client: Client;
  team: Team;
  move: MoveState;
  yaw: number;
  pitch: number;
  alive: boolean;
  health: number;
  loadout: Loadout;
  reloadEndsAt: number;
  lastFireAt: number;
  weaponReadyAt: number;
  protectedUntil: number;
  respawnAt: number;
  lastDamageAt: number;
  inputQueue: InputCommand[];
  /** How many queued inputs may be simulated right now (stops speed hacks). */
  inputBudget: number;
  lastInputSeq: number;
  kills: number;
  deaths: number;
  headshots: number;
  grenadeReadyAt: Record<GrenadeKind, number>;
  flashlight: boolean;
}

interface LiveGrenade {
  id: number;
  kind: GrenadeKind;
  ownerId: string;
  state: GrenadeState;
  explodeAt: number;
}

type EndHandler = (scores: Scores, winner: string) => void;

/** Authoritative simulation of one running match. */
export class Match {
  private readonly players = new Map<string, MatchPlayer>();
  private readonly map: BuiltMap;
  private readonly history = new PoseHistory();
  private readonly endsAt: number;
  private readonly timer: NodeJS.Timeout;
  private lastTick = now();
  private lastScoresAt = 0;
  private finished = false;
  private grenades: LiveGrenade[] = [];
  private nextGrenadeId = 1;

  constructor(
    private readonly roomId: string,
    private readonly settings: RoomSettings,
    private readonly onEnd: EndHandler,
  ) {
    this.map = getMap(settings.map);
    this.endsAt = now() + settings.timeLimitMinutes * 60_000;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  // ───────────── Membership ─────────────

  addPlayer(client: Client, team: Team): void {
    const player: MatchPlayer = {
      client,
      team,
      move: createMoveState({ x: 0, y: 0, z: 0 }),
      yaw: 0,
      pitch: 0,
      alive: false,
      health: 0,
      loadout: createLoadout(this.settings.allowedWeapons),
      reloadEndsAt: 0,
      lastFireAt: 0,
      weaponReadyAt: 0,
      protectedUntil: 0,
      respawnAt: 0,
      lastDamageAt: 0,
      inputQueue: [],
      inputBudget: 0,
      lastInputSeq: -1,
      kills: 0,
      deaths: 0,
      headshots: 0,
      grenadeReadyAt: { frag: 0, smoke: 0, flash: 0 },
      flashlight: false,
    };
    this.players.set(client.id, player);
    client.send({ type: 'matchStart', match: { roomId: this.roomId, settings: this.settings, endsAt: this.endsAt } });
    this.spawn(player);
    this.broadcastScores();
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.broadcastScores();
  }

  // ───────────── Client messages ─────────────

  handleInputs(id: string, inputs: InputCommand[]): void {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    for (const input of inputs) if (input.seq > p.lastInputSeq) p.inputQueue.push(input);
    if (p.inputQueue.length > MAX_QUEUED_INPUTS) p.inputQueue.splice(0, p.inputQueue.length - MAX_QUEUED_INPUTS);
  }

  handleFire(id: string, weaponId: WeaponId, directions: Vec3[], viewTime: number): void {
    const p = this.players.get(id);
    const t = now();
    if (!p || !p.alive || this.finished) return;
    if (activeWeaponId(p.loadout) !== weaponId || t < p.weaponReadyAt || p.reloadEndsAt > 0) return;
    const weapon = WEAPONS[weaponId];
    const ammo = p.loadout.ammo[p.loadout.active];
    if (ammo.mag <= 0 || directions.length !== weapon.pellets) return;
    if (t - p.lastFireAt < fireIntervalSeconds(weapon) * 1000 * FIRE_RATE_TOLERANCE) return;

    ammo.mag--;
    p.lastFireAt = t;
    p.protectedUntil = 0;

    const origin = { ...p.move.pos, y: p.move.pos.y + eyeHeight(p.move.crouching) };
    const rewindTime = Math.min(t, Math.max(t - MAX_REWIND_MS, viewTime));
    const targets = [...this.players.values()]
      .filter((o) => o !== p && o.alive && !this.isTeammate(p, o))
      .map((o) => ({ id: o.client.id, pose: this.history.poseAt(o.client.id, rewindTime) ?? this.currentPose(o) }));

    const result = resolveShot(weapon, origin, directions, targets, this.map.colliders, this.settings.maxHealth);
    this.broadcast({ type: 'shot', shooterId: id, weaponId, origin, ends: result.ends }, id);
    for (const [victimId, hit] of result.hits) this.applyDamage(p, victimId, hit.damage, hit.headshot, weaponId);
  }

  handleReload(id: string): void {
    const p = this.players.get(id);
    const weaponId = p && activeWeaponId(p.loadout);
    if (!p || !p.alive || !weaponId || p.reloadEndsAt > 0) return;
    const ammo = p.loadout.ammo[p.loadout.active];
    const missing = WEAPONS[weaponId].magSize - ammo.mag;
    if (missing <= 0) return;
    p.reloadEndsAt = now() + reloadSeconds(WEAPONS[weaponId], missing) * 1000;
  }

  handleSwitchWeapon(id: string, slot: WeaponSlot): void {
    const p = this.players.get(id);
    if (!p || !p.alive || !p.loadout[slot] || p.loadout.active === slot) return;
    p.loadout.active = slot;
    p.reloadEndsAt = 0;
    p.weaponReadyAt = now() + WEAPON_SWITCH_MS;
  }

  handleBuy(id: string, weaponId: WeaponId): void {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (!this.settings.allowedWeapons.includes(weaponId)) return;
    const slot = WEAPONS[weaponId].slot;
    p.loadout[slot] = weaponId;
    p.loadout.ammo[slot] = fullAmmo(weaponId);
    p.loadout.active = slot;
    p.reloadEndsAt = 0;
    p.weaponReadyAt = now() + WEAPON_SWITCH_MS;
  }

  handleFlashlight(id: string, on: boolean): void {
    const p = this.players.get(id);
    if (p) p.flashlight = on;
  }

  handleThrowGrenade(id: string, kind: GrenadeKind, yaw: number, pitch: number): void {
    const p = this.players.get(id);
    const t = now();
    if (!p || !p.alive || this.finished || t < p.grenadeReadyAt[kind]) return;
    p.grenadeReadyAt[kind] = t + GRENADE_COOLDOWN[kind] * 1000;
    p.protectedUntil = 0;
    const eye = { ...p.move.pos, y: p.move.pos.y + eyeHeight(p.move.crouching) };
    const grenade: LiveGrenade = {
      id: this.nextGrenadeId++,
      kind,
      ownerId: id,
      state: throwGrenade(eye, yaw, pitch, p.move.vel, this.map.colliders),
      explodeAt: t + GRENADE_FUSE[kind] * 1000,
    };
    this.grenades.push(grenade);
    const { pos, vel } = grenade.state;
    this.broadcast({
      type: 'grenadeThrown',
      id: grenade.id,
      kind,
      ownerId: id,
      pos,
      vel,
      explodeAt: grenade.explodeAt,
    });
  }

  // ───────────── Simulation ─────────────

  private tick(): void {
    const t = now();
    const dt = (t - this.lastTick) / 1000;
    this.lastTick = t;

    for (const p of this.players.values()) {
      if (p.alive) {
        this.simulateInputs(p, dt);
        this.updateReload(p, t);
        this.regenerateHealth(p, t, dt);
      } else if (t >= p.respawnAt && !this.finished) {
        this.spawn(p);
      }
    }
    this.updateGrenades(t, dt);
    const poses = new Map<string, PastPose>();
    for (const p of this.players.values()) poses.set(p.client.id, this.currentPose(p));
    this.history.record(t, poses);

    this.sendSnapshots(t);
    if (t - this.lastScoresAt > SCORES_INTERVAL_MS) {
      this.lastScoresAt = t;
      this.broadcastScores(); // keeps ping values on the scoreboard fresh
    }
    if (!this.finished && t >= this.endsAt) this.finish();
  }

  private simulateInputs(p: MatchPlayer, dt: number): void {
    p.inputBudget = Math.min(MAX_INPUT_BUDGET, p.inputBudget + dt / INPUT_DT);
    const weaponId = activeWeaponId(p.loadout);
    const speed = weaponId ? WEAPONS[weaponId].moveSpeedMultiplier : 1;
    while (p.inputQueue.length > 0 && p.inputBudget >= 1) {
      const input = p.inputQueue.shift()!;
      p.inputBudget--;
      p.move = stepMovement(p.move, input, INPUT_DT, this.map.colliders, speed);
      p.yaw = input.yaw;
      p.pitch = input.pitch;
      p.lastInputSeq = input.seq;
    }
    // Safety net: never let anyone fall out of the world.
    if (p.move.pos.y < -10) this.spawn(p);
  }

  private updateReload(p: MatchPlayer, t: number): void {
    const weaponId = activeWeaponId(p.loadout);
    if (p.reloadEndsAt === 0 || t < p.reloadEndsAt || !weaponId) return;
    const ammo = p.loadout.ammo[p.loadout.active];
    // Reserve ammo is infinite: a reload always fills the magazine.
    ammo.mag = WEAPONS[weaponId].magSize;
    p.reloadEndsAt = 0;
  }

  private updateGrenades(t: number, dt: number): void {
    for (const g of this.grenades) g.state = stepGrenade(g.state, dt, this.map.colliders);
    const exploding = this.grenades.filter((g) => t >= g.explodeAt);
    if (exploding.length === 0) return;
    this.grenades = this.grenades.filter((g) => t < g.explodeAt);
    for (const g of exploding) this.explode(g);
  }

  /** Frags damage everyone in the blast radius who isn't behind cover. The thrower can hurt themselves. */
  private explode(g: LiveGrenade): void {
    const center = g.state.pos;
    this.broadcast({ type: 'grenadeExploded', id: g.id, kind: g.kind, pos: center });
    // Smoke and flashbangs are handled by every client (vision only); only frags deal damage.
    const owner = this.players.get(g.ownerId);
    if (!owner || g.kind !== 'frag') return;
    for (const victim of [...this.players.values()]) {
      if (!victim.alive || (victim !== owner && this.isTeammate(owner, victim))) continue;
      const chest = { ...victim.move.pos, y: victim.move.pos.y + eyeHeight(victim.move.crouching) * 0.7 };
      const distance = Math.hypot(chest.x - center.x, chest.y - center.y, chest.z - center.z);
      if (distance >= GRENADE_RADIUS) continue;
      const dir = {
        x: (chest.x - center.x) / distance,
        y: (chest.y - center.y) / distance,
        z: (chest.z - center.z) / distance,
      };
      const wall = distance > 0.01 ? raycastBoxes(center, dir, this.map.colliders, distance) : null;
      if (wall) continue;
      this.applyDamage(owner, victim.client.id, grenadeDamage(distance), false, 'grenade', center);
    }
  }

  private regenerateHealth(p: MatchPlayer, t: number, dt: number): void {
    const max = this.settings.maxHealth;
    if (p.health >= max || t - p.lastDamageAt < HEALTH_REGEN_DELAY_SECONDS * 1000) return;
    p.health = Math.min(max, p.health + max * HEALTH_REGEN_RATE * dt);
  }

  private spawn(p: MatchPlayer): void {
    const enemies = [...this.players.values()]
      .filter((o) => o !== p && o.alive && !this.isTeammate(p, o))
      .map((o) => o.move.pos);
    const point = chooseSpawn(this.map, this.settings.mode, p.team, enemies);
    const t = now();
    p.move = createMoveState(point.position);
    p.yaw = point.yaw;
    p.pitch = 0;
    p.alive = true;
    p.health = this.settings.maxHealth;
    p.loadout = createLoadout(this.settings.allowedWeapons, p.loadout);
    p.reloadEndsAt = 0;
    p.weaponReadyAt = t;
    p.protectedUntil = t + SPAWN_PROTECTION_SECONDS * 1000;
    p.inputQueue = [];
    p.inputBudget = 0;
    p.client.send({ type: 'spawn', pos: point.position, yaw: point.yaw, loadout: p.loadout });
  }

  private applyDamage(
    attacker: MatchPlayer,
    victimId: string,
    damage: number,
    headshot: boolean,
    weaponId: KillWeapon,
    sourcePos: Vec3 = attacker.move.pos,
  ): void {
    const victim = this.players.get(victimId);
    const t = now();
    if (!victim || !victim.alive || t < victim.protectedUntil) return;

    victim.health = Math.max(0, victim.health - damage);
    victim.lastDamageAt = t;
    const kill = victim.health <= 0;
    const selfDamage = attacker === victim;
    if (!selfDamage) attacker.client.send({ type: 'hitConfirm', headshot, kill });
    victim.client.send({ type: 'damaged', attackerPos: sourcePos, health: victim.health });
    if (!kill) return;

    victim.alive = false;
    victim.respawnAt = t + RESPAWN_SECONDS * 1000;
    victim.deaths++;
    if (!selfDamage) attacker.kills++;
    if (headshot) attacker.headshots++;
    this.broadcast({
      type: 'kill',
      killerId: attacker.client.id,
      victimId,
      weaponId,
      headshot,
      headPos: headCenter(victim.move.pos, victim.move.crouching),
    });
    this.broadcastScores();
    this.checkScoreLimit();
  }

  // ───────────── Scores & end ─────────────

  getScores(): Scores {
    const players = [...this.players.values()].map((p) => ({
      id: p.client.id,
      name: p.client.name,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
      headshots: p.headshots,
      ping: Math.round(p.client.ping),
    }));
    const teamKills = { red: 0, blue: 0 };
    for (const p of players) if (p.team !== 'none') teamKills[p.team] += p.kills;
    return { players, teamKills };
  }

  broadcastScores(): void {
    this.broadcast({ type: 'scores', scores: this.getScores() });
  }

  private checkScoreLimit(): void {
    const scores = this.getScores();
    const best =
      this.settings.mode === 'tdm'
        ? Math.max(scores.teamKills.red, scores.teamKills.blue)
        : Math.max(0, ...scores.players.map((p) => p.kills));
    if (best >= this.settings.scoreLimit) this.finish();
  }

  private finish(): void {
    this.finished = true;
    const scores = this.getScores();
    let winner: string;
    if (this.settings.mode === 'tdm') {
      const { red, blue } = scores.teamKills;
      winner = red === blue ? 'Draw' : red > blue ? 'Red team' : 'Blue team';
    } else {
      const top = [...scores.players].sort((a, b) => b.kills - a.kills)[0];
      winner = top ? top.name : 'Nobody';
    }
    this.onEnd(scores, winner);
  }

  // ───────────── Helpers ─────────────

  private isTeammate(a: MatchPlayer, b: MatchPlayer): boolean {
    return this.settings.mode === 'tdm' && a.team === b.team;
  }

  private currentPose(p: MatchPlayer): PastPose {
    return { pos: { ...p.move.pos }, crouching: p.move.crouching, alive: p.alive };
  }

  private sendSnapshots(t: number): void {
    const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
      id: p.client.id,
      pos: { x: round(p.move.pos.x), y: round(p.move.pos.y), z: round(p.move.pos.z) },
      yaw: round(p.yaw),
      pitch: round(p.pitch),
      crouching: p.move.crouching,
      alive: p.alive,
      weaponId: activeWeaponId(p.loadout),
      team: p.team,
      flashlight: p.flashlight,
    }));
    for (const p of this.players.values()) {
      p.client.send({
        type: 'snapshot',
        serverTime: t,
        players,
        you: {
          lastInputSeq: p.lastInputSeq,
          move: p.move,
          health: Math.ceil(p.health),
          loadout: p.loadout,
          reloading: p.reloadEndsAt > 0,
          grenadeReadyAt: { ...p.grenadeReadyAt },
        },
      });
    }
  }

  private broadcast(message: ServerMessage, exceptId?: string): void {
    const json = JSON.stringify(message);
    for (const p of this.players.values()) if (p.client.id !== exceptId) p.client.sendRaw(json);
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
