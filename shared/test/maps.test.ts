import { describe, expect, it } from 'vitest';
import { boxesOverlap } from '../src/math';
import { MAP_DEFINITIONS, carColliders, getMap, type MapDefinition } from '../src/maps';
import { playerBox } from '../src/movement';
import type { MapId } from '../src/types';

/** Height of what stands on each cell (0 = open floor). */
function cellHeight(def: MapDefinition, char: string): number {
  return def.legend[char]?.solid?.height ?? 0;
}

/** Flood fill over cells a player can walk between (height change ≤ 0.45 m). */
function reachableCells(def: MapDefinition, startX: number, startY: number): Set<string> {
  const seen = new Set<string>([`${startX},${startY}`]);
  const queue = [[startX, startY]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    const h = cellHeight(def, def.grid[y][x]);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const char = def.grid[ny]?.[nx];
      if (char === undefined || seen.has(`${nx},${ny}`)) continue;
      if (Math.abs(cellHeight(def, char) - h) > 0.45) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe.each(Object.keys(MAP_DEFINITIONS) as MapId[])('map %s', (id) => {
  const map = getMap(id);
  const def = map.definition;

  it('has enough spawns', () => {
    expect(map.spawns.length).toBeGreaterThanOrEqual(12);
  });

  it('has no spawn inside geometry', () => {
    for (const spawn of map.spawns) {
      const box = playerBox({ ...spawn.position, y: spawn.position.y + 0.01 }, 1.8);
      expect(map.blocks.some((b) => boxesOverlap(box, b))).toBe(false);
    }
  });

  it('connects every spawn to every other spawn', () => {
    const spawnCells: [number, number][] = [];
    def.grid.forEach((row, y) => [...row].forEach((c, x) => def.legend[c]?.spawn && spawnCells.push([x, y])));
    const reachable = reachableCells(def, ...spawnCells[0]);
    for (const [x, y] of spawnCells) expect(reachable.has(`${x},${y}`), `spawn at ${x},${y}`).toBe(true);
  });
});

describe('car collision', () => {
  const car = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 1.5, z: 2 }, material: 'carWhite' as const };
  const [body, cabin] = carColliders(car);

  it('is low over the hood and boot so players can shoot across', () => {
    expect(body.max.y).toBeLessThan(1);
    expect(cabin.max.y).toBeLessThan(1.5);
  });

  it('keeps the cabin inside the car footprint', () => {
    expect(cabin.min.x).toBeGreaterThan(body.min.x);
    expect(cabin.max.x).toBeLessThan(body.max.x);
  });
});

describe('MedycynaPraktyczna roof', () => {
  it('is solid at 9 m over the whole grey building and atrium (no holes to fall into)', () => {
    const def = MAP_DEFINITIONS.medycyna;
    const top = (char: string) => {
      const t = def.legend[char];
      const ceiling = t?.ceiling ? t.ceiling.height + (t.ceiling.thickness ?? 0.6) : 0;
      return Math.max(t?.solid?.height ?? 0, ceiling);
    };
    const firstRow = def.grid.findIndex((row) => row.includes('F'));
    const lastRow = def.grid.length - 1 - [...def.grid].reverse().findIndex((row) => row.includes('F'));
    const cols = [def.grid[firstRow].indexOf('F'), def.grid[firstRow].lastIndexOf('L')];
    for (let y = firstRow; y <= lastRow; y++)
      for (let x = cols[0]; x <= cols[1]; x++) expect(top(def.grid[y][x]), `cell ${x},${y}`).toBeGreaterThanOrEqual(9);
  });
});
