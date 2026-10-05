import type { MapDefinition, TileDef } from './mapTypes';

/** Office ceiling at 4 m; the slab fills up to the 9 m flat roof that the porch stairs lead to. */
const OFFICE_ROOF = { height: 4, material: 'concrete', thickness: 5 } as const;
/** Small back door: 2.5 m opening, wall filled above it up to the roof. */
const BACK_DOOR = { height: 2.5, material: 'facadeGrey', thickness: 6.5 } as const;
/** Blue hall ceiling at 6 m, flush with the 13 m blue walls. */
const HALL_ROOF = { height: 6, material: 'concrete', thickness: 7 } as const;

/**
 * Concrete stairs against the facade: they start at the main door and climb west to the low wing's roof (7 m),
 * where four more steps lead up to the main roof (9 m).
 */
const STAIR_CHARS = '0123456789ABCEGHMNORT';
const STAIRS: Record<string, TileDef> = Object.fromEntries(
  [...STAIR_CHARS].map((char, i) => [char, { solid: { height: 0.6 + i * 0.4, material: 'concrete' } }]),
);

/**
 * Foggy office park street in front of the Medycyna Praktyczna building.
 * North (top rows) = the building: grey offices and glass atrium (4 m roof) joined to the blue hall (6 m roof).
 * Front entrances: main door under the canopy and the atrium door; a small back door leads to the rear walkway. The blue hall is reached only from inside,
 * through the passage from the atrium.
 * Outside, the street is open and the cars are parked in one line along the south berm; a paved walkway runs around the
 * back and sides of the building, a big parking lot lies to the west, and dry grass berms close the map.
 *
 * Legend: f/F grey facade, L glass, U blue block, r office floor, q blue hall floor, I office wall, D back door,
 * J hall pillar, d desk, x/X crates, h grass berm, K concrete block, p wooden porch, o porch spawn, 0-9/A-T stairs, c/e/i/j wing roof steps, w/k/v/b white/dark/silver/blue car,
 * s outdoor spawn (red team), S/Q indoor spawn (blue team); in deathmatch all spawns are used.
 */
export const MEDYCYNA: MapDefinition = {
  id: 'medycyna',
  name: 'MedycynaPraktycznaKrakoskieCzystePowietrze',
  cellSize: 1,
  floorMaterial: 'pavement',
  monitorsOn: ['wood', 'crate'],
  legend: {
    f: { solid: { height: 7, material: 'facadeGrey' } },
    F: { solid: { height: 9, material: 'facadeGrey' } },
    L: { solid: { height: 10, material: 'glass' } },
    U: { solid: { height: 13, material: 'facadeBlue' } },
    r: { ceiling: OFFICE_ROOF },
    D: { ceiling: BACK_DOOR },
    q: { ceiling: HALL_ROOF },
    // Office walls carry the roof slab too, so the 9 m roof has no gaps above them.
    I: { solid: { height: 4, material: 'concrete' }, ceiling: OFFICE_ROOF },
    J: { solid: { height: 6, material: 'concrete' } },
    d: { solid: { height: 0.8, material: 'wood' }, ceiling: OFFICE_ROOF },
    x: { solid: { height: 1.0, material: 'crate' }, ceiling: HALL_ROOF },
    X: { solid: { height: 2.0, material: 'crate' }, ceiling: HALL_ROOF },
    S: { spawn: 'blue', ceiling: OFFICE_ROOF },
    Q: { spawn: 'blue', ceiling: HALL_ROOF },
    h: { solid: { height: 3, material: 'grassDry' } },
    K: { solid: { height: 1.6, material: 'concrete' } },
    w: { solid: { height: 1.5, material: 'carWhite' } },
    k: { solid: { height: 1.5, material: 'carDark' } },
    v: { solid: { height: 1.5, material: 'carSilver' } },
    b: { solid: { height: 1.5, material: 'carBlue' } },
    s: { spawn: 'red' },
    p: { solid: { height: 0.2, material: 'deck' } },
    o: { solid: { height: 0.2, material: 'deck' }, spawn: 'red' },
    ...STAIRS,
    c: { solid: { height: 7.4, material: 'facadeGrey' } },
    e: { solid: { height: 7.8, material: 'facadeGrey' } },
    i: { solid: { height: 8.2, material: 'facadeGrey' } },
    j: { solid: { height: 8.6, material: 'facadeGrey' } },
  },
  theme: {
    sunElevation: 22,
    sunAzimuth: 200,
    sunColor: 0xeeeee6,
    sunIntensity: 1.3,
    turbidity: 14,
    rayleigh: 3,
    exposure: 0.55,
    fogColor: 0xd2d4cf,
    fogDensity: 0.03,
    ambientSmoke: { count: 180, color: 0xd6d8d3, opacity: 0.35 },
    // Long tube lights under the office (4 m) and hall (6 m) ceilings.
    lamps: [
      ...[
        [-3, -9.5],
        [1, -14.5],
        [9.5, -9.5],
        [9.5, -16.5],
        [22, -11.5],
      ].map(([x, z]) => ({ position: { x, y: 4, z }, color: 0xf4f7ff, intensity: 18, style: 'ceiling' as const })),
      ...[
        [31, -16.5],
        [38, -10.5],
        [32, -8.5],
        [41, -16.5],
      ].map(([x, z]) => ({ position: { x, y: 6, z }, color: 0xf4f7ff, intensity: 35, style: 'ceiling' as const })),
    ],
  },
  grid: [
    'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
    'hh................................s.............................K.........s.......................hh',
    'hh...s...........s..........................KK........s.........K.................KK..........s...hh',
    'hh................................................................................................hh',
    'hh..bb.kk.ww....vv.bb....ww........ffffffffFFFFFFFFFFFFFFFFFFFDDFFFFFFFLLLUUUUUUUUUUUUUUUUUUUUU...hh',
    'hh..bb.kk.ww....vv.bb....ww........ffffffffFrSrrrrrrrIrrrrrrrrrrrrrrrrrrrrUqqqqqqqqqqqqqqqqqqqU...hh',
    'hh..bb.kk.ww....vv.bb....ww........ffffffffFrrrrrrrrrIrrdddrrrrrrrrrrrrrrrUqqQqqqqqQqqqqqqqqqqU...hh',
    'hh..bb.kk.ww....vv.bb....ww........ffffffffFrrddrddrrIrrrrrrrrrrrrrrrrrrSrUqqqqqqqqqqqqqqqqqqqU...hh',
    'hh..ww.......bb.kk....kk.vv.bb..s..ffffffffFrrrrrrrrrIrrrrrrrrIrrIIIIIrrrrUqqqqJqqqqqJqqqqqJqqU...hh',
    'hh..ww.......bb.kk....kk.vv.bb.....ffffffffFrrrrSrrrrIrrSrrrrrIrrrrrrrrrrrrqqqqqqqqqqqqqqqqqqqU...hh',
    'hh..ww.......bb.kk....kk.vv.bb.....ffffffffFrrrrrrrrrIrrrrrrrrIrrrrrSrrrrrrqqqqqqXXqqqqqqqqqQqU...hh',
    'hh..ww.......bb.kk....kk.vv.bb.....ffffffffFIIIIIIrrrIrrrrrrrrIrrrrrrrrrrrrqqqqqqXXqqqqqxqqqqqU..shh',
    'hh.................................ffffffffFrrrrrrrrrrrrrrrrrrIrddrddrrrrrUqqQqqqqqqqqqqqqqqqqU...hh',
    'hh.................................ffffffffFrrdrrrrrrrrrrrSrrrIrrrrrrrrrrrUqqqqJqqqqqJqqqqqJqqU...hh',
    'hh.........................s.....s.ffffffffFrrdrrrrSrrrrrrrrrrIrrSrrrrrrrrUqqqqqqqqqqqqqqqqqqqU...hh',
    'hh.......s.........................ffffceijFrrrrrrrrrrrrrrrrrrIrrrrrrrrrrrUqXXqqqqqqqqqQqqqqqqU...hh',
    'hh.................................ffffffffFFFFFFFFFFFFFrrrFFFFFFFFFFFFLrLUqqqqqqqqqqqqqqqQqqqU.s.hh',
    'hh.................................TRONMHGECBA9876543210ppppppppppppppppppUUUUUUUUUUUUUUUUUUUUU...hh',
    'hh..bb.kk.ww....vv.bb.......bb.....TRONMHGECBA9876543210pppppppoppppppppppppppppppppppppppppppp...hh',
    'hh..bb.kk.ww....vv.bb.......bb.....ppppppppppppppppppppppppppppppppppppppoppppppppppppppppppppp...hh',
    'hh..bb.kk.ww....vv.bb.......bb.....pppoppppppppopppppppppppppppppppppppppppppppppppppppppppoppp...hh',
    'hh..bb.kk.ww....vv.bb.......bb.....pppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp...hh',
    'hh..ww.vv.kk.bb.kk.ww.......ww.........................................s..........................hh',
    'hh..ww.vv.kk.bb.kk.ww.......ww.........s...............s..................................s.......hh',
    'hh..ww.vv.kk.bb.kk.ww.......ww....................................................................hh',
    'hh..ww.vv.kk.bb.kk.ww.......ww....................................................................hh',
    'hh................................................................................................hh',
    'hh................................................................................................hh',
    'hh....s.............s.............................................................................hh',
    'hh...........................................s...............s.................s...........s......hh',
    'hh................................................................................................hh',
    'hh................................................................................................hh',
    'hh..bb.kk.ww.kk.vv.bb.vv.ww.bb....................................................................hh',
    'hh..bb.kk.ww.kk.vv.bb.vv.ww.bb....................................................................hh',
    'hh..bb.kk.ww.kk.vv.bb.vv.ww.bb........s...........................s...............................hh',
    'hh..bb.kk.ww.kk.vv.bb.vv.ww.bb....................s..............................s................hh',
    'hh..........................................s............................s........................hh',
    'hh...........s............s................................................................s......hh',
    'hh....................................wwww.kkkk.vvvv.bbbb.wwww.kkkk.vvvv.bbbb.wwww.kkkk.wwww......hh',
    'hh....................................wwww.kkkk.vvvv.bbbb.wwww.kkkk.vvvv.bbbb.wwww.kkkk.wwww......hh',
    'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
  ],
};

/** Indoor ceiling lights shared by every version of the map. */
const INDOOR_LAMPS = MEDYCYNA.theme.lamps;

/** Same place on a clear summer day: high sun, hard shadows, almost no haze. */
export const MEDYCYNA_SUNNY: MapDefinition = {
  ...MEDYCYNA,
  id: 'medycynaSunny',
  name: 'MedycynaPraktycznaSunny',
  theme: {
    sunElevation: 55,
    sunAzimuth: 210,
    sunColor: 0xffffff,
    sunIntensity: 4.2,
    turbidity: 1.6,
    rayleigh: 2.6,
    exposure: 0.8,
    // Light blue overhead with drifting clouds, paler toward the horizon, a light summer haze.
    lightShafts: 2,
    lensFlare: 1,
    skyGradient: { zenith: 0x6aa8e6, horizon: 0xb4d4f2, clouds: 0.45 },
    // Keep the blue sky from tinting the whole map: weaker sky light, warm bounce from the pavement.
    environmentIntensity: 0.3,
    ambientIntensity: 0.35,
    skyLightColor: 0xf2f4f7,
    groundColor: 0x9a8d78,
    fogColor: 0xb4d4f2,
    fogDensity: 0.012,
    lamps: INDOOR_LAMPS,
  },
};

/** Same place at night: near-black sky, faint cold moonlight; only the lit offices glow. */
export const MEDYCYNA_NIGHT: MapDefinition = {
  ...MEDYCYNA,
  id: 'medycynaNight',
  name: 'MedycynaPraktycznaNight',
  theme: {
    sunElevation: 40,
    sunAzimuth: 160,
    sunColor: 0x9db4e0,
    // Faint moonlight from above.
    sunIntensity: 0.12,
    turbidity: 2,
    rayleigh: 0.5,
    exposure: 0.45,
    skyGradient: { zenith: 0x03050a, horizon: 0x0b1019 },
    environmentIntensity: 0.15,
    ambientIntensity: 0.04,
    fogColor: 0x070a10,
    fogDensity: 0.025,
    lamps: INDOOR_LAMPS,
  },
};
