import { HEALTH_OPTIONS, MAX_PLAYERS_LIMIT, ROOM_NAME_MAX_LENGTH } from './constants';
import type { GameMode, MapId, RoomSettings } from './types';

const MAP_IDS: readonly MapId[] = ['medycyna', 'medycynaSunny', 'medycynaNight', 'shipment'];
import { WEAPON_IDS } from './weapons';

export function defaultScoreLimit(mode: GameMode): number {
  return mode === 'tdm' ? 75 : 30;
}

export function defaultRoomSettings(playerName: string): RoomSettings {
  return {
    name: `${playerName}'s room`.slice(0, ROOM_NAME_MAX_LENGTH),
    map: 'medycynaSunny',
    mode: 'tdm',
    isPrivate: false,
    maxHealth: 100,
    allowedWeapons: [...WEAPON_IDS],
    maxPlayers: 12,
    scoreLimit: defaultScoreLimit('tdm'),
    timeLimitMinutes: 10,
  };
}

/** Returns an error message, or null when the settings are valid. Used by client and server. */
export function validateRoomSettings(s: RoomSettings): string | null {
  if (typeof s !== 'object' || s === null) return 'Missing settings';
  if (typeof s.name !== 'string' || s.name.trim().length === 0) return 'Room name is required';
  if (s.name.length > ROOM_NAME_MAX_LENGTH) return 'Room name is too long';
  if (!MAP_IDS.includes(s.map)) return 'Unknown map';
  if (s.mode !== 'tdm' && s.mode !== 'dm') return 'Unknown mode';
  if (typeof s.isPrivate !== 'boolean') return 'Invalid privacy flag';
  if (!(HEALTH_OPTIONS as readonly number[]).includes(s.maxHealth)) return 'Invalid player health';
  if (!Array.isArray(s.allowedWeapons) || s.allowedWeapons.length === 0) return 'Allow at least one weapon';
  if (!s.allowedWeapons.every((w) => WEAPON_IDS.includes(w))) return 'Unknown weapon';
  if (!Number.isInteger(s.maxPlayers) || s.maxPlayers < 2 || s.maxPlayers > MAX_PLAYERS_LIMIT)
    return 'Invalid max players';
  if (!Number.isInteger(s.scoreLimit) || s.scoreLimit < 1 || s.scoreLimit > 500) return 'Invalid score limit';
  if (!Number.isInteger(s.timeLimitMinutes) || s.timeLimitMinutes < 1 || s.timeLimitMinutes > 60)
    return 'Invalid time limit';
  return null;
}
