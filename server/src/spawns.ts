import { distance, type BuiltMap, type GameMode, type SpawnPoint, type Team, type Vec3 } from '@mp-fps/shared';

/** Spawn points a player may use. In TDM maps without team spawns, the map is split north/south. */
function candidateSpawns(map: BuiltMap, mode: GameMode, team: Team): SpawnPoint[] {
  if (mode === 'dm') return map.spawns;
  const teamSpawns = map.spawns.filter((s) => s.side === team);
  if (teamSpawns.length > 0) return teamSpawns;
  return map.spawns.filter((s) => (team === 'red' ? s.position.z > 0 : s.position.z <= 0));
}

/** Picks the spawn whose closest enemy is farthest away (with a little randomness). */
export function chooseSpawn(map: BuiltMap, mode: GameMode, team: Team, enemyPositions: Vec3[]): SpawnPoint {
  const candidates = candidateSpawns(map, mode, team);
  if (enemyPositions.length === 0) return candidates[Math.floor(Math.random() * candidates.length)];

  const scored = candidates.map((spawn) => ({
    spawn,
    score: Math.min(...enemyPositions.map((p) => distance(p, spawn.position))) + Math.random() * 4,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].spawn;
}
