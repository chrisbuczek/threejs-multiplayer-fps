export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type GameMode = 'tdm' | 'dm';
export type MapId = 'medycyna' | 'medycynaSunny' | 'medycynaNight' | 'shipment';
/** 'none' is used in free-for-all deathmatch. */
export type Team = 'red' | 'blue' | 'none';
export type WeaponId = 'ak47' | 'm4a4' | 'awp' | 'shotgun' | 'minigun' | 'deagle';
/** What a kill was made with (shown in the kill feed). */
export type KillWeapon = WeaponId | 'grenade';
export type WeaponSlot = 'primary' | 'secondary';
export type RoomStatus = 'lobby' | 'playing' | 'ended';

export interface RoomSettings {
  name: string;
  map: MapId;
  mode: GameMode;
  isPrivate: boolean;
  maxHealth: number;
  allowedWeapons: WeaponId[];
  maxPlayers: number;
  scoreLimit: number;
  timeLimitMinutes: number;
}

/** Entry shown in the public room list. */
export interface RoomSummary {
  id: string;
  name: string;
  map: MapId;
  mode: GameMode;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team;
}

/** Full room info sent to everyone inside the room. */
export interface RoomInfo {
  id: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: LobbyPlayer[];
}

export interface ScoreEntry {
  id: string;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  headshots: number;
  ping: number;
}

export interface Scores {
  players: ScoreEntry[];
  teamKills: { red: number; blue: number };
}
