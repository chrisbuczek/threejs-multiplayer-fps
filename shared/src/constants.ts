/** Server simulation rate. A snapshot is sent to clients every tick. */
export const TICK_RATE = 30;
/** Every movement input covers exactly this much time (client sends 60 inputs per second). */
export const INPUT_DT = 1 / 60;

export const GRAVITY = 20;
export const JUMP_VELOCITY = 6.5;
export const WALK_SPEED = 5.0;
export const SPRINT_SPEED = 7.5;
export const CROUCH_SPEED = 2.5;
export const ADS_SPEED = 3.0;
export const GROUND_ACCEL = 45;
export const AIR_ACCEL = 8;
export const STEP_HEIGHT = 0.45;

export const PLAYER_RADIUS = 0.35;
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.2;
export const STAND_EYE_HEIGHT = 1.62;
export const CROUCH_EYE_HEIGHT = 1.05;

export const RESPAWN_SECONDS = 3;
export const SPAWN_PROTECTION_SECONDS = 2;
export const HEALTH_REGEN_DELAY_SECONDS = 5;
/** Fraction of max health regenerated per second once regen starts. */
export const HEALTH_REGEN_RATE = 0.4;
export const MATCH_END_SCREEN_SECONDS = 10;
/** Remote players are rendered this far in the past for smooth interpolation. */
export const INTERPOLATION_DELAY_MS = 100;
/** How far back the server may rewind hitboxes for lag compensation. */
export const MAX_REWIND_MS = 250;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;
export const ROOM_NAME_MAX_LENGTH = 24;
export const HEALTH_OPTIONS = [50, 100, 150, 200] as const;
export const MAX_PLAYERS_LIMIT = 12;
export const DEFAULT_SERVER_PORT = 3456;
