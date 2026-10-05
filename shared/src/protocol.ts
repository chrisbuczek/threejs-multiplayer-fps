import type { GrenadeKind } from './grenade';
import type { MoveInput, MoveState } from './movement';
import type {
  KillWeapon,
  RoomInfo,
  RoomSettings,
  RoomSummary,
  Scores,
  Team,
  Vec3,
  WeaponId,
  WeaponSlot,
} from './types';

/** One movement input; every input covers INPUT_DT seconds. */
export interface InputCommand extends MoveInput {
  seq: number;
}

// ───────────── Client → Server ─────────────

export type ClientMessage =
  | { type: 'hello'; name: string }
  | { type: 'listRooms' }
  | { type: 'createRoom'; settings: RoomSettings }
  | { type: 'joinRoom'; roomId: string }
  | { type: 'leaveRoom' }
  | { type: 'updateSettings'; settings: RoomSettings }
  | { type: 'switchTeam'; team: Team }
  | { type: 'startMatch' }
  | { type: 'inputs'; inputs: InputCommand[] }
  /** `directions` has one entry per pellet. `viewTime` is the server time the shooter was seeing. */
  | { type: 'fire'; weaponId: WeaponId; directions: Vec3[]; viewTime: number }
  | { type: 'reload' }
  | { type: 'switchWeapon'; slot: WeaponSlot }
  | { type: 'buyWeapon'; weaponId: WeaponId }
  | { type: 'throwGrenade'; kind: GrenadeKind; yaw: number; pitch: number }
  | { type: 'flashlight'; on: boolean }
  | { type: 'pong'; t: number };

// ───────────── Server → Client ─────────────

export interface PlayerSnapshot {
  id: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  crouching: boolean;
  alive: boolean;
  weaponId: WeaponId | null;
  team: Team;
  flashlight: boolean;
}

export interface Loadout {
  primary: WeaponId | null;
  secondary: WeaponId | null;
  active: WeaponSlot;
  /** Rounds in each magazine. Reserve ammo is infinite. */
  ammo: Record<WeaponSlot, { mag: number }>;
}

/** Private state only the owning player receives. */
export interface SelfSnapshot {
  lastInputSeq: number;
  move: MoveState;
  health: number;
  loadout: Loadout;
  reloading: boolean;
  /** Server time (ms) when the next grenade of each type can be thrown. */
  grenadeReadyAt: Record<GrenadeKind, number>;
}

export interface MatchInfo {
  roomId: string;
  settings: RoomSettings;
  /** Server time (ms) when the match ends by time limit. */
  endsAt: number;
}

export type ServerMessage =
  | { type: 'welcome'; playerId: string; name: string }
  | { type: 'error'; message: string }
  | { type: 'roomList'; rooms: RoomSummary[] }
  | { type: 'roomState'; room: RoomInfo }
  | { type: 'leftRoom' }
  | { type: 'matchStart'; match: MatchInfo }
  | { type: 'snapshot'; serverTime: number; players: PlayerSnapshot[]; you: SelfSnapshot | null }
  | { type: 'spawn'; pos: Vec3; yaw: number; loadout: Loadout }
  | { type: 'shot'; shooterId: string; weaponId: WeaponId; origin: Vec3; ends: Vec3[] }
  | { type: 'hitConfirm'; headshot: boolean; kill: boolean }
  | { type: 'damaged'; attackerPos: Vec3; health: number }
  | { type: 'kill'; killerId: string; victimId: string; weaponId: KillWeapon; headshot: boolean; headPos: Vec3 }
  /** Clients simulate the flight themselves with stepGrenade() from this start state. */
  | {
      type: 'grenadeThrown';
      id: number;
      kind: GrenadeKind;
      ownerId: string;
      pos: Vec3;
      vel: Vec3;
      explodeAt: number;
    }
  | { type: 'grenadeExploded'; id: number; kind: GrenadeKind; pos: Vec3 }
  | { type: 'scores'; scores: Scores }
  | { type: 'matchEnd'; scores: Scores; winner: string }
  | { type: 'ping'; t: number };
