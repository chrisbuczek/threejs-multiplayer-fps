import * as THREE from 'three';

/**
 * Procedural PBR textures, so the game needs no downloaded assets.
 * A painter draws a grayscale-ish albedo; normal and roughness maps are derived from its brightness.
 */
export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export type Painter = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void;

/** Small deterministic random generator so textures look the same every run. */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Speckle noise: thousands of tiny translucent dots. Cheap and convincing for sand, stone, asphalt. */
export function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  count: number,
  colors: string[],
  maxRadius = 2,
) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = 0.08 + rand() * 0.25;
    const r = 0.5 + rand() * maxRadius;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
  ctx.globalAlpha = 1;
}

/** Large soft blotches for color variation (dirt, sun bleaching). */
export function blotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  count: number,
  color: string,
  maxRadius: number,
) {
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = maxRadius * (0.3 + rand() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // Draw wrapped copies so the texture tiles seamlessly.
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
  }
}

function heightToNormal(src: ImageData, size: number, strength: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(size, size);
  const lum = (x: number, y: number) => {
    const i = (((y + size) % size) * size + ((x + size) % size)) * 4;
    return (src.data[i] * 0.3 + src.data[i + 1] * 0.59 + src.data[i + 2] * 0.11) / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
      const dy = (lum(x, y - 1) - lum(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function brightnessToRoughness(src: ImageData, size: number, base: number, variation: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(size, size);
  for (let i = 0; i < src.data.length; i += 4) {
    const l = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 765;
    // Darker spots (dirt, grooves) are rougher.
    const v = Math.min(1, Math.max(0, base + (0.5 - l) * variation)) * 255;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

export function createTextureSet(
  painter: Painter,
  options: {
    size?: number;
    seed?: number;
    normalStrength?: number;
    roughness?: number;
    roughnessVariation?: number;
    anisotropy?: number;
  },
): TextureSet {
  const size = options.size ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  painter(ctx, size, seededRandom(options.seed ?? 1));
  const pixels = ctx.getImageData(0, 0, size, size);

  const wrap = (source: HTMLCanvasElement, srgb: boolean) => {
    const texture = new THREE.CanvasTexture(source);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = options.anisotropy ?? 8;
    return texture;
  };
  return {
    map: wrap(canvas, true),
    normalMap: wrap(heightToNormal(pixels, size, options.normalStrength ?? 3), false),
    roughnessMap: wrap(
      brightnessToRoughness(pixels, size, options.roughness ?? 0.85, options.roughnessVariation ?? 0.4),
      false,
    ),
  };
}

/** Soft round sprite used by particles. */
export function createSoftCircleTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
