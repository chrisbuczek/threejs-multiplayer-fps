import {
  GRENADE_KINDS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  WEAPON_IDS,
  type ClientMessage,
  type GrenadeKind,
  type InputCommand,
  type Vec3,
} from '@mp-fps/shared';

/**
 * Turns raw socket data into a typed message, or null when it is malformed.
 * Nothing coming from a client is trusted.
 */
type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isString = (v: unknown): v is string => typeof v === 'string';

function isVec3(v: unknown): v is Vec3 {
  return isObject(v) && isNumber(v.x) && isNumber(v.y) && isNumber(v.z);
}

function isInput(v: unknown): v is InputCommand {
  return (
    isObject(v) &&
    Number.isInteger(v.seq) &&
    isNumber(v.forward) &&
    Math.abs(v.forward) <= 1 &&
    isNumber(v.right) &&
    Math.abs(v.right) <= 1 &&
    isNumber(v.yaw) &&
    isNumber(v.pitch) &&
    Math.abs(v.pitch) <= Math.PI / 2 &&
    isBool(v.jump) &&
    isBool(v.crouch) &&
    isBool(v.sprint) &&
    isBool(v.ads)
  );
}

export function sanitizeName(name: string): string | null {
  const clean = name.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim();
  if (clean.length < NAME_MIN_LENGTH || clean.length > NAME_MAX_LENGTH) return null;
  return clean;
}

export function parseClientMessage(data: string): ClientMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(msg) || !isString(msg.type)) return null;

  switch (msg.type) {
    case 'hello':
      return isString(msg.name) ? { type: 'hello', name: msg.name } : null;
    case 'listRooms':
    case 'leaveRoom':
    case 'startMatch':
    case 'reload':
      return { type: msg.type };
    case 'createRoom':
    case 'updateSettings':
      // Detailed checks happen in validateRoomSettings().
      return isObject(msg.settings) ? (msg as unknown as ClientMessage) : null;
    case 'joinRoom':
      return isString(msg.roomId) ? { type: 'joinRoom', roomId: msg.roomId } : null;
    case 'switchTeam':
      return msg.team === 'red' || msg.team === 'blue' ? { type: 'switchTeam', team: msg.team } : null;
    case 'inputs':
      return Array.isArray(msg.inputs) && msg.inputs.length <= 60 && msg.inputs.every(isInput)
        ? { type: 'inputs', inputs: msg.inputs }
        : null;
    case 'fire':
      return WEAPON_IDS.includes(msg.weaponId as never) &&
        isNumber(msg.viewTime) &&
        Array.isArray(msg.directions) &&
        msg.directions.length <= 16 &&
        msg.directions.every(isVec3)
        ? (msg as unknown as ClientMessage)
        : null;
    case 'switchWeapon':
      return msg.slot === 'primary' || msg.slot === 'secondary' ? { type: 'switchWeapon', slot: msg.slot } : null;
    case 'buyWeapon':
      return WEAPON_IDS.includes(msg.weaponId as never) ? (msg as unknown as ClientMessage) : null;
    case 'flashlight':
      return typeof msg.on === 'boolean' ? { type: 'flashlight', on: msg.on } : null;
    case 'throwGrenade':
      return GRENADE_KINDS.includes(msg.kind as never) && isNumber(msg.yaw) && isNumber(msg.pitch)
        ? { type: 'throwGrenade', kind: msg.kind as GrenadeKind, yaw: msg.yaw, pitch: msg.pitch }
        : null;
    case 'pong':
      return isNumber(msg.t) ? { type: 'pong', t: msg.t } : null;
    default:
      return null;
  }
}
