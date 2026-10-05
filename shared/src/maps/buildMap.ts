import type { Box } from '../math';
import { carColliders, isCar } from './cars';
import type { BuiltMap, MapBlock, MapDefinition, SpawnPoint, TileDef } from './mapTypes';

const CEILING_THICKNESS = 0.6;
const FLOOR_THICKNESS = 1;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Greedy merge of equal grid characters into as few rectangles as possible.
 * Fewer rectangles = fewer collision boxes and draw calls.
 */
function mergeCells(grid: string[], matches: (char: string) => boolean): Map<string, Rect[]> {
  const rows = grid.length;
  const cols = grid[0].length;
  const used = grid.map(() => new Array<boolean>(cols).fill(false));
  const result = new Map<string, Rect[]>();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const char = grid[y][x];
      if (used[y][x] || !matches(char)) continue;
      let w = 1;
      while (x + w < cols && grid[y][x + w] === char && !used[y][x + w]) w++;
      let h = 1;
      const rowFits = (row: number) => {
        for (let i = x; i < x + w; i++) if (grid[row][i] !== char || used[row][i]) return false;
        return true;
      };
      while (y + h < rows && rowFits(y + h)) h++;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) used[j][i] = true;
      if (!result.has(char)) result.set(char, []);
      result.get(char)!.push({ x, y, w, h });
    }
  }
  return result;
}

export function buildMap(def: MapDefinition): BuiltMap {
  const cols = def.grid[0].length;
  const rows = def.grid.length;
  for (const row of def.grid) {
    if (row.length !== cols) throw new Error(`Map ${def.id}: all grid rows must have ${cols} characters`);
  }
  const s = def.cellSize;
  const width = cols * s;
  const depth = rows * s;
  const toX = (col: number) => col * s - width / 2;
  const toZ = (row: number) => row * s - depth / 2;
  const tile = (char: string): TileDef | undefined => def.legend[char];

  const blocks: MapBlock[] = [];
  const addRects = (kind: 'solid' | 'ceiling') => {
    const merged = mergeCells(def.grid, (c) => tile(c)?.[kind] !== undefined);
    for (const [char, rects] of merged) {
      const part = tile(char)![kind]!;
      const bottom = kind === 'solid' ? 0 : part.height;
      const thickness = ('thickness' in part && part.thickness) || CEILING_THICKNESS;
      const top = kind === 'solid' ? part.height : part.height + thickness;
      for (const r of rects) {
        blocks.push({
          min: { x: toX(r.x), y: bottom, z: toZ(r.y) },
          max: { x: toX(r.x + r.w), y: top, z: toZ(r.y + r.h) },
          material: part.material,
        });
      }
    }
  };
  addRects('solid');
  addRects('ceiling');

  const floor: Box = {
    min: { x: -width / 2, y: -FLOOR_THICKNESS, z: -depth / 2 },
    max: { x: width / 2, y: 0, z: depth / 2 },
  };

  return {
    definition: def,
    blocks,
    // Cars collide with their real shape instead of their full grid block.
    colliders: [floor, ...blocks.flatMap((b) => (isCar(b.material) ? carColliders(b) : [b]))],
    spawns: collectSpawns(def, toX, toZ),
    width,
    depth,
  };
}

function collectSpawns(def: MapDefinition, toX: (c: number) => number, toZ: (r: number) => number): SpawnPoint[] {
  const s = def.cellSize;
  const spawns: SpawnPoint[] = [];
  def.grid.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const side = def.legend[char]?.spawn;
      if (!side) return;
      // Spawns may stand on a thin solid (e.g. a grass layer).
      const position = { x: toX(x) + s / 2, y: def.legend[char]?.solid?.height ?? 0, z: toZ(y) + s / 2 };
      // Face the middle of the map.
      const yaw = Math.atan2(position.x, position.z);
      spawns.push({ position, yaw, side });
    });
  });
  return spawns;
}
