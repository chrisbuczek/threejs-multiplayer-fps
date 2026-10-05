import type { MaterialId } from '@mp-fps/shared';
import * as THREE from 'three';
import { blotches, createTextureSet, speckle, type Painter } from './textures';

interface MaterialRecipe {
  painter: Painter;
  /** How many meters one texture tile covers. */
  tileMeters: number;
  metalness: number;
  roughness: number;
  normalStrength: number;
}

const corrugatedContainer =
  (color: string, dark: string): Painter =>
  (ctx, size, rand) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    const ribs = 8;
    for (let i = 0; i < ribs; i++) {
      const x = (i / ribs) * size;
      const g = ctx.createLinearGradient(x, 0, x + size / ribs, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.18)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, size / ribs, size);
    }
    blotches(ctx, size, rand, 14, 'rgba(110,60,25,0.45)', size / 10); // rust
    blotches(ctx, size, rand, 10, dark, size / 6);
    speckle(ctx, size, rand, 5000, ['#3a2a1a', '#d8d0c0'], 1.5);
    // Rust streaks running down.
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(90,50,20,${0.1 + rand() * 0.2})`;
      ctx.fillRect(rand() * size, rand() * size * 0.5, 1 + rand() * 3, size * (0.2 + rand() * 0.5));
    }
  };

const planks: Painter = (ctx, size, rand) => {
  ctx.fillStyle = '#7a5a36';
  ctx.fillRect(0, 0, size, size);
  const planksCount = 6;
  for (let i = 0; i < planksCount; i++) {
    const y = (i / planksCount) * size;
    ctx.fillStyle = `hsl(30, ${35 + rand() * 15}%, ${28 + rand() * 12}%)`;
    ctx.fillRect(0, y + 3, size, size / planksCount - 6);
    for (let k = 0; k < 40; k++) {
      ctx.strokeStyle = `rgba(40,25,10,${0.1 + rand() * 0.25})`;
      ctx.beginPath();
      const gy = y + 6 + rand() * (size / planksCount - 12);
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(size * 0.3, gy + rand() * 6 - 3, size * 0.6, gy + rand() * 6 - 3, size, gy);
      ctx.stroke();
    }
  }
  // Frame around the crate face.
  ctx.strokeStyle = '#4a3218';
  ctx.lineWidth = size * 0.07;
  ctx.strokeRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size);
  ctx.stroke();
  speckle(ctx, size, rand, 3000, ['#2a1a0a', '#c8a070'], 1.5);
};

const flatNoise =
  (base: string, colors: string[], blotchColor: string): Painter =>
  (ctx, size, rand) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, rand, 40, blotchColor, size / 5);
    speckle(ctx, size, rand, 30000, colors, 2);
  };

/** Weathered deck boards running along the porch, no crate frame. */
const deckBoards: Painter = (ctx, size, rand) => {
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(0, 0, size, size);
  const boards = 5;
  const boardH = size / boards;
  for (let i = 0; i < boards; i++) {
    const y = i * boardH;
    ctx.fillStyle = `hsl(28, ${22 + rand() * 12}%, ${34 + rand() * 10}%)`;
    ctx.fillRect(0, y + 2, size, boardH - 4);
    for (let k = 0; k < 30; k++) {
      ctx.strokeStyle = `rgba(40,28,15,${0.1 + rand() * 0.2})`;
      ctx.beginPath();
      const gy = y + 5 + rand() * (boardH - 10);
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(size * 0.3, gy + rand() * 4 - 2, size * 0.6, gy + rand() * 4 - 2, size, gy);
      ctx.stroke();
    }
    // Board end joint and nails.
    const jx = rand() * size;
    ctx.fillStyle = 'rgba(30,20,10,0.7)';
    ctx.fillRect(jx, y + 2, 3, boardH - 4);
    ctx.fillStyle = 'rgba(30,30,30,0.6)';
    for (const ny of [y + boardH * 0.3, y + boardH * 0.7]) ctx.fillRect(jx + 6, ny, 3, 3);
  }
  blotches(ctx, size, rand, 15, 'rgba(120,120,110,0.18)', size / 5); // grey weathering
  speckle(ctx, size, rand, 3000, ['#2a1a0a', '#a08060'], 1.5);
};

/** Light grey precast concrete with two rows of narrow dark windows per tile (one tile = two storeys). */
const concreteFacade: Painter = (ctx, size, rand) => {
  ctx.fillStyle = '#b9bbbc';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, rand, 30, 'rgba(90,92,95,0.18)', size / 4);
  speckle(ctx, size, rand, 12000, ['#8d8f91', '#d6d8d9'], 1.5);
  // Panel seams.
  ctx.strokeStyle = 'rgba(80,82,85,0.5)';
  ctx.lineWidth = 2;
  for (const y of [0, size / 2]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const columns = 4;
  for (const storeyTop of [0, size / 2]) {
    for (let c = 0; c < columns; c++) {
      const w = size / columns;
      const x = c * w + w * 0.3;
      const y = storeyTop + size * 0.12;
      const winW = w * 0.4;
      const winH = size * 0.24;
      ctx.fillStyle = '#4a4f55';
      ctx.fillRect(x - 3, y - 3, winW + 6, winH + 6);
      const g = ctx.createLinearGradient(0, y, 0, y + winH);
      g.addColorStop(0, '#5d6670');
      g.addColorStop(1, '#2a2f35');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, winW, winH);
      ctx.fillStyle = 'rgba(200,210,220,0.15)';
      ctx.fillRect(x, y, winW * 0.35, winH);
    }
  }
  // Dirt streaks under the windows.
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(70,70,70,${0.04 + rand() * 0.08})`;
    ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 4, size * (0.05 + rand() * 0.2));
  }
};

/** The cobalt blue textured render of the slanted block. */
const blueRender: Painter = (ctx, size, rand) => {
  ctx.fillStyle = '#2f3fa6';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, rand, 40, 'rgba(20,25,90,0.3)', size / 4);
  blotches(ctx, size, rand, 25, 'rgba(90,110,210,0.18)', size / 5);
  speckle(ctx, size, rand, 40000, ['#1d2a7a', '#4a5cc4', '#26338f'], 1.5);
  // Faint horizontal panel joints.
  ctx.fillStyle = 'rgba(15,20,70,0.25)';
  ctx.fillRect(0, size / 2, size, 2);
};

const glassCurtain: Painter = (ctx, size) => {
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#6f7b86');
  g.addColorStop(1, '#2e3640');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#3a3e42';
  ctx.lineWidth = 6;
  for (let i = 0; i <= 2; i++) {
    const p = (i / 2) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
};

const dryGrass: Painter = (ctx, size, rand) => {
  ctx.fillStyle = '#6e5f45';
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, rand, 40, 'rgba(60,45,30,0.4)', size / 5);
  blotches(ctx, size, rand, 30, 'rgba(150,135,95,0.3)', size / 6);
  for (let i = 0; i < 6000; i++) {
    ctx.strokeStyle = ['#8a7a58', '#5a4a34', '#a39168', '#4d5236'][Math.floor(rand() * 4)];
    ctx.globalAlpha = 0.3 + rand() * 0.4;
    const x = rand() * size;
    const y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 8, y - 4 - rand() * 12);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

/** Car side: painted body, dark window band on top, tyres at the bottom (one tile = car height). */
const carBody =
  (paint: string, shade: string): Painter =>
  (ctx, size, rand) => {
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createLinearGradient(0, size * 0.4, 0, size);
    g.addColorStop(0, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    ctx.fillRect(0, size * 0.4, size, size * 0.6);
    // Windows.
    ctx.fillStyle = '#1e2329';
    ctx.fillRect(size * 0.08, size * 0.05, size * 0.38, size * 0.3);
    ctx.fillRect(size * 0.52, size * 0.05, size * 0.4, size * 0.3);
    // Tyres.
    ctx.fillStyle = '#151515';
    for (const x of [size * 0.22, size * 0.78]) {
      ctx.beginPath();
      ctx.arc(x, size, size * 0.18, Math.PI, 0);
      ctx.fill();
    }
    blotches(ctx, size, rand, 12, 'rgba(110,95,70,0.25)', size / 6); // road dirt
    speckle(ctx, size, rand, 2000, ['#5a5040', '#e0e0e0'], 1);
  };

const RECIPES: Record<MaterialId, MaterialRecipe> = {
  pavement: {
    painter: flatNoise('#8d8e8b', ['#5f605d', '#b5b6b2', '#73746f'], 'rgba(60,58,50,0.25)'),
    tileMeters: 4,
    metalness: 0,
    roughness: 0.9,
    normalStrength: 2,
  },
  concrete: {
    painter: flatNoise('#a9aaa6', ['#7d7e7a', '#cfd0cc'], 'rgba(70,70,65,0.25)'),
    tileMeters: 2,
    metalness: 0,
    roughness: 0.9,
    normalStrength: 2,
  },
  deck: { painter: deckBoards, tileMeters: 2, metalness: 0, roughness: 0.85, normalStrength: 3 },
  facadeGrey: { painter: concreteFacade, tileMeters: 4.5, metalness: 0, roughness: 0.85, normalStrength: 2 },
  facadeBlue: { painter: blueRender, tileMeters: 5, metalness: 0, roughness: 0.9, normalStrength: 3 },
  glass: { painter: glassCurtain, tileMeters: 2.5, metalness: 0.7, roughness: 0.15, normalStrength: 1 },
  grassDry: { painter: dryGrass, tileMeters: 3, metalness: 0, roughness: 1, normalStrength: 3 },
  carWhite: {
    painter: carBody('#d8d9d6', 'rgba(60,60,60,0.3)'),
    tileMeters: 1.5,
    metalness: 0.4,
    roughness: 0.35,
    normalStrength: 1,
  },
  carDark: {
    painter: carBody('#2b2f35', 'rgba(0,0,0,0.3)'),
    tileMeters: 1.5,
    metalness: 0.5,
    roughness: 0.35,
    normalStrength: 1,
  },
  carSilver: {
    painter: carBody('#8b8f93', 'rgba(20,20,20,0.3)'),
    tileMeters: 1.5,
    metalness: 0.6,
    roughness: 0.35,
    normalStrength: 1,
  },
  invisible: { painter: () => {}, tileMeters: 1, metalness: 0, roughness: 1, normalStrength: 0 },
  carBlue: {
    painter: carBody('#2449a8', 'rgba(0,0,30,0.3)'),
    tileMeters: 1.5,
    metalness: 0.5,
    roughness: 0.35,
    normalStrength: 1,
  },
  wood: { painter: planks, tileMeters: 2, metalness: 0, roughness: 0.8, normalStrength: 3 },
  crate: { painter: planks, tileMeters: 1.1, metalness: 0, roughness: 0.8, normalStrength: 3 },
  asphalt: {
    painter: flatNoise('#3b3b3d', ['#1c1c1e', '#6a6a6c', '#2c2c2e'], 'rgba(20,20,20,0.35)'),
    tileMeters: 4,
    metalness: 0,
    roughness: 0.75,
    normalStrength: 2,
  },
  metal: {
    painter: flatNoise('#7a7d80', ['#4a4d50', '#a0a3a6'], 'rgba(60,40,20,0.3)'),
    tileMeters: 2,
    metalness: 0.8,
    roughness: 0.45,
    normalStrength: 1,
  },
  containerRed: {
    painter: corrugatedContainer('#8e2a22', 'rgba(40,10,5,0.3)'),
    tileMeters: 2.6,
    metalness: 0.5,
    roughness: 0.55,
    normalStrength: 6,
  },
  containerBlue: {
    painter: corrugatedContainer('#24496e', 'rgba(5,15,30,0.3)'),
    tileMeters: 2.6,
    metalness: 0.5,
    roughness: 0.55,
    normalStrength: 6,
  },
  containerGreen: {
    painter: corrugatedContainer('#2f5a3a', 'rgba(5,20,10,0.3)'),
    tileMeters: 2.6,
    metalness: 0.5,
    roughness: 0.55,
    normalStrength: 6,
  },
  containerYellow: {
    painter: corrugatedContainer('#b88a23', 'rgba(40,30,5,0.3)'),
    tileMeters: 2.6,
    metalness: 0.5,
    roughness: 0.55,
    normalStrength: 6,
  },
};

const cache = new Map<MaterialId, THREE.MeshStandardMaterial>();

export function getMaterial(id: MaterialId): THREE.MeshStandardMaterial {
  let material = cache.get(id);
  if (!material) {
    const recipe = RECIPES[id];
    const textures = createTextureSet(recipe.painter, {
      seed: id.length * 97,
      normalStrength: recipe.normalStrength,
      roughness: recipe.roughness,
    });
    material = new THREE.MeshStandardMaterial({
      ...textures,
      metalness: recipe.metalness,
      roughness: 1,
      normalScale: new THREE.Vector2(1, 1),
    });
    cache.set(id, material);
  }
  return material;
}

export function tileMeters(id: MaterialId): number {
  return RECIPES[id].tileMeters;
}
