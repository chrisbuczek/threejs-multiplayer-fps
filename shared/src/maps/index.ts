import type { MapId } from '../types';
import { buildMap } from './buildMap';
import type { BuiltMap, MapDefinition } from './mapTypes';
import { MEDYCYNA, MEDYCYNA_NIGHT, MEDYCYNA_SUNNY } from './medycyna';
import { SHIPMENT } from './shipment';

export * from './cars';
export * from './mapTypes';
export { buildMap };

export const MAP_DEFINITIONS: Record<MapId, MapDefinition> = {
  medycyna: MEDYCYNA,
  medycynaSunny: MEDYCYNA_SUNNY,
  medycynaNight: MEDYCYNA_NIGHT,
  shipment: SHIPMENT,
};

const cache = new Map<MapId, BuiltMap>();

/** Built maps are cached because both client and server reuse them a lot. */
export function getMap(id: MapId): BuiltMap {
  if (!cache.has(id)) cache.set(id, buildMap(MAP_DEFINITIONS[id]));
  return cache.get(id)!;
}
