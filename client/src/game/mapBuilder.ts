import type { BuiltMap, MapBlock, MaterialId } from '@mp-fps/shared';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCar, isCarMaterial } from './carModel';
import { getMaterial, tileMeters } from './materials';
import { buildMonitors } from './monitorModel';

/**
 * Box with UVs in world meters, so textures keep the same scale on every wall
 * and line up seamlessly between neighbouring boxes.
 */
function worldUvBox(block: MapBlock, metersPerTile: number): THREE.BufferGeometry {
  const w = block.max.x - block.min.x;
  const hgt = block.max.y - block.min.y;
  const d = block.max.z - block.min.z;
  const geometry = new THREE.BoxGeometry(w, hgt, d);
  geometry.translate(block.min.x + w / 2, block.min.y + hgt / 2, block.min.z + d / 2);

  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i))];
    if (nx > 0.5) uv.setXY(i, z / metersPerTile, y / metersPerTile);
    else if (ny > 0.5) uv.setXY(i, x / metersPerTile, z / metersPerTile);
    else uv.setXY(i, x / metersPerTile, y / metersPerTile);
  }
  return geometry;
}

/** Builds the visible level: one merged mesh per material keeps draw calls very low. */
export function buildMapMeshes(map: BuiltMap): THREE.Group {
  const group = new THREE.Group();
  const byMaterial = new Map<MaterialId, THREE.BufferGeometry[]>();

  const floor: MapBlock = {
    min: { x: -map.width / 2, y: -1, z: -map.depth / 2 },
    max: { x: map.width / 2, y: 0, z: map.depth / 2 },
    material: map.definition.floorMaterial,
  };
  for (const block of [floor, ...map.blocks]) {
    if (block.material === 'invisible') continue;
    if (isCarMaterial(block.material)) {
      group.add(buildCar(block));
      continue;
    }
    const list = byMaterial.get(block.material) ?? [];
    list.push(worldUvBox(block, tileMeters(block.material)));
    byMaterial.set(block.material, list);
  }

  const monitorsOn = map.definition.monitorsOn ?? [];
  map.blocks
    .filter((block) => monitorsOn.includes(block.material))
    .forEach((block, i) => group.add(buildMonitors(block, i)));

  for (const [materialId, geometries] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), getMaterial(materialId));
    mesh.castShadow = materialId !== map.definition.floorMaterial;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  return group;
}
