import type { Box } from '../math';
import type { MapId, Vec3 } from '../types';

export type MaterialId =
  | 'wood'
  | 'crate'
  | 'asphalt'
  | 'metal'
  | 'containerRed'
  | 'containerBlue'
  | 'containerGreen'
  | 'containerYellow'
  | 'pavement'
  | 'deck'
  | 'concrete'
  | 'facadeGrey'
  | 'facadeBlue'
  | 'glass'
  | 'grassDry'
  | 'carWhite'
  | 'carDark'
  | 'carSilver'
  | 'carBlue'
  /** Collides but is never drawn (map boundaries). */
  | 'invisible';

export type SpawnSide = 'red' | 'blue' | 'any';

/** What one character of the ASCII grid means. */
export interface TileDef {
  /** A solid block standing on the floor. */
  solid?: { height: number; material: MaterialId };
  /** A roof above a walkable tile (tunnels). Thickness defaults to a thin slab. */
  ceiling?: { height: number; material: MaterialId; thickness?: number };
  spawn?: SpawnSide;
}

export interface MapTheme {
  /** Sun position in degrees. */
  sunElevation: number;
  sunAzimuth: number;
  sunColor: number;
  sunIntensity: number;
  /**
   * Sun elevation used only for the sky picture (default: sunElevation). At night the sky's sun sits
   * below the horizon for a dark sky, while the directional light acts as moonlight from above.
   */
  skyElevation?: number;
  /** Sky haze: low = clear blue, high = hazy. */
  turbidity: number;
  rayleigh: number;
  /** Haze/glow around the sun (default 0.005). Lower = cleaner, deeper blue sky. */
  mieCoefficient?: number;
  exposure: number;
  /**
   * Optional painted gradient sky (overhead and horizon colors) instead of the physical sky model.
   * Gives exact colors, e.g. a light blue that doesn't get washed out by a strong sun.
   */
  skyGradient?: { zenith: number; horizon: number; /** Cloud coverage 0..1 (default none). */ clouds?: number };
  /** Strength of sky reflections/ambient light (default 0.6) and of the bounce fill light (default 0.25). */
  environmentIntensity?: number;
  ambientIntensity?: number;
  /** Color of the fill light coming from the sky (default: light blue 0xbcd4ff). */
  skyLightColor?: number;
  /** Color of light bouncing up from the ground (default: fogColor). */
  groundColor?: number;
  /** Strength of sun light shafts (god rays) when looking toward the sun; omit for none. */
  lightShafts?: number;
  /** Strength of the lens flare when the sun is on screen (needs lightShafts). */
  lensFlare?: number;
  /** Drifting smoke banks hanging in the air outdoors (cuts visibility). */
  ambientSmoke?: { count: number; color: number; opacity: number };
  fogColor: number;
  /** 0 = no fog. */
  fogDensity: number;
  /**
   * Extra lamps. 'pole' (default) stands on the ground, e.g. harbor flood lights;
   * 'ceiling' is a long tube fixture hanging just under the given position (indoor lighting).
   */
  lamps: { position: Vec3; color: number; intensity: number; style?: 'pole' | 'ceiling' }[];
}

export interface MapDefinition {
  id: MapId;
  name: string;
  /** Size of one grid cell in meters. */
  cellSize: number;
  floorMaterial: MaterialId;
  /** Computer monitors are placed on top of blocks with these materials (office desks). */
  monitorsOn?: MaterialId[];
  /** Rows from north (-Z) to south (+Z); every row must have the same length. */
  grid: string[];
  legend: Record<string, TileDef>;
  theme: MapTheme;
}

export interface MapBlock extends Box {
  material: MaterialId;
}

export interface SpawnPoint {
  position: Vec3;
  yaw: number;
  side: SpawnSide;
}

export interface BuiltMap {
  definition: MapDefinition;
  /** Visual blocks (also used for collision). */
  blocks: MapBlock[];
  /** Collision boxes: blocks + floor. */
  colliders: Box[];
  spawns: SpawnPoint[];
  width: number;
  depth: number;
}
