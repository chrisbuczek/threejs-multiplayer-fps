import type { WeaponId } from '@mp-fps/shared';
import * as THREE from 'three';

const LIGHT_COUNT = 4;
/** A real muzzle flash lasts a frame or two; the flame shrinks over this time. */
const FLASH_MS = 60;
const VARIANTS = 8;
/** Overall size multiplier for every flash. */
const SIZE = 0.75;
/** Peak opacity: the flame is a bit see-through. */
const OPACITY = 0.7;

/** How a weapon's flash looks. Sizes are for the third-person model (meters). */
interface FlashStyle {
  /** White-hot core billboard. */
  core: number;
  /** Forward flame cones along the barrel. */
  length: number;
  width: number;
  /** Flame petals bursting sideways (what you see from behind the gun). */
  petals: number;
  petalLength: number;
  light: number;
}

const STYLES: Record<WeaponId, FlashStyle> = {
  ak47: { core: 0.32, length: 0.55, width: 0.22, petals: 3, petalLength: 0.3, light: 45 },
  m4a4: { core: 0.26, length: 0.4, width: 0.16, petals: 4, petalLength: 0.22, light: 38 },
  awp: { core: 0.42, length: 0.8, width: 0.3, petals: 5, petalLength: 0.4, light: 60 },
  shotgun: { core: 0.5, length: 0.6, width: 0.4, petals: 6, petalLength: 0.38, light: 60 },
  minigun: { core: 0.3, length: 0.5, width: 0.22, petals: 4, petalLength: 0.26, light: 40 },
  deagle: { core: 0.36, length: 0.4, width: 0.26, petals: 5, petalLength: 0.28, light: 45 },
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Star-shaped white-hot core with a warm halo; every variant has different spikes. */
function coreTexture(): THREE.Texture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.translate(64, 64);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 64);
    halo.addColorStop(0, 'rgba(255,255,240,1)');
    halo.addColorStop(0.15, 'rgba(255,230,160,0.95)');
    halo.addColorStop(0.45, 'rgba(255,150,50,0.35)');
    halo.addColorStop(1, 'rgba(255,90,10,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-64, -64, 128, 128);
    const spikes = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < spikes; i++) {
      ctx.rotate((Math.PI * 2) / spikes + rand(-0.25, 0.25));
      const len = rand(35, 62);
      const g = ctx.createLinearGradient(0, 0, 0, -len);
      g.addColorStop(0, 'rgba(255,245,210,0.95)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-rand(3, 7), 0);
      ctx.lineTo(0, -len);
      ctx.lineTo(rand(3, 7), 0);
      ctx.fill();
    }
  });
}

/** Ragged flame tongue: base at the left (u = 0), tip at the right, with hot streaks and broken edges. */
function flameTexture(): THREE.Texture {
  return canvasTexture(256, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,250,225,1)');
    g.addColorStop(0.2, 'rgba(255,215,120,0.95)');
    g.addColorStop(0.55, 'rgba(255,130,35,0.6)');
    g.addColorStop(1, 'rgba(200,60,10,0)');
    ctx.fillStyle = g;
    // Teardrop silhouette with a wobbly edge.
    ctx.beginPath();
    ctx.moveTo(0, 32);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, 32 - (1 - x / 256) * 26 * rand(0.6, 1.1) - 2);
    for (let x = 256; x >= 0; x -= 16) ctx.lineTo(x, 32 + (1 - x / 256) * 26 * rand(0.6, 1.1) + 2);
    ctx.fill();
    // Bright streaks running along the flame.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = `rgba(255,${200 + Math.random() * 55},150,${rand(0.15, 0.4)})`;
      ctx.lineWidth = rand(1, 3);
      ctx.beginPath();
      const y = 32 + rand(-10, 10);
      ctx.moveTo(0, 32);
      ctx.quadraticCurveTo(rand(60, 120), y, rand(120, 220), y + rand(-6, 6));
      ctx.stroke();
    }
  });
}

const CORE_TEXTURES = Array.from({ length: VARIANTS }, coreTexture);
const FLAME_TEXTURES = Array.from({ length: VARIANTS }, flameTexture);

/** Glow strength of the flame (HDR: well above 1, so bloom picks it up and the core burns white-hot). */
const EMISSIVE_INTENSITY = 12;

/**
 * Emissive flame material: the flame is a light source, not a lit surface. Black base color (no diffuse
 * shading), the texture drives both the glow and the soft alpha edges, and the output is HDR + tone mapped.
 */
function emissive(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    map,
    emissive: new THREE.Color(1, 0.94, 0.84),
    emissiveMap: map,
    emissiveIntensity: EMISSIVE_INTENSITY,
    metalness: 0,
    roughness: 1,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Unit flame quad pointing down local -Z (along the barrel), base at the origin. */
const CONE_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2).translate(0, 0, -0.5);
/** Unit flame quad pointing along local +X (sideways), base at the origin. */
const PETAL_GEOMETRY = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
const MAX_PETALS = 6;

/**
 * Layered muzzle flash in the style of modern shooters: a white-hot core, crossed flame cones
 * shooting forward and petals bursting sideways. Randomized on every shot. Barrel = local -Z.
 */
export class MuzzleFlashModel extends THREE.Group {
  private readonly core: THREE.Sprite;
  private readonly cones: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly petals: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private startedAt = 0;
  private duration = FLASH_MS;
  private peak = OPACITY;
  private style: FlashStyle = STYLES.ak47;

  /** scale shrinks the whole flash (the first-person viewmodel uses a smaller scale). */
  constructor(private readonly scaleFactor = 1) {
    super();
    this.core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: CORE_TEXTURES[0],
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        // HDR white-hot core (sprites have no emissive slot; a color above 1 does the same).
        color: new THREE.Color(1.9, 1.85, 1.7).multiplyScalar(EMISSIVE_INTENSITY * 0.6),
      }),
    );
    this.add(this.core);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(CONE_GEOMETRY, emissive(FLAME_TEXTURES[0]));
      cone.rotation.z = (i * Math.PI) / 3;
      this.cones.push(cone);
      this.add(cone);
    }
    for (let i = 0; i < MAX_PETALS; i++) {
      const petal = new THREE.Mesh(PETAL_GEOMETRY, emissive(FLAME_TEXTURES[0]));
      this.petals.push(petal);
      this.add(petal);
    }
    this.visible = false;
  }

  fire(weaponId: WeaponId): void {
    const s = (this.style = STYLES[weaponId]);
    // Every shot gets its own overall size, brightness, lifetime and warm tint.
    const k = this.scaleFactor * SIZE * rand(0.7, 1.15);
    this.startedAt = performance.now();
    this.duration = FLASH_MS * rand(0.6, 1.2);
    this.peak = OPACITY * rand(0.6, 1);
    this.visible = true;
    const tint = new THREE.Color().setHSL(rand(0.06, 0.12), rand(0.3, 0.7), 1);
    const pick = () => FLAME_TEXTURES[Math.floor(Math.random() * VARIANTS)];

    const coreMaterial = this.core.material;
    coreMaterial.map = CORE_TEXTURES[Math.floor(Math.random() * VARIANTS)];
    coreMaterial.rotation = Math.random() * Math.PI * 2;
    this.core.scale.set(s.core * k * rand(0.6, 1.3), s.core * k * rand(0.6, 1.3), 1);

    // Sometimes one fat tongue, sometimes a spray of thin ones.
    const coneCount = 1 + Math.floor(Math.random() * 3);
    const spin = Math.random() * Math.PI;
    this.cones.forEach((cone, i) => {
      cone.visible = i < coneCount;
      if (!cone.visible) return;
      const coneMap = pick();
      cone.material.map = coneMap;
      cone.material.emissiveMap = coneMap;
      cone.material.emissive.setRGB(1, 0.94, 0.84).multiply(tint);
      cone.rotation.z = spin + (i * Math.PI) / coneCount + rand(-0.4, 0.4);
      cone.rotation.x = rand(-0.12, 0.12);
      cone.scale.set(1, s.width * k * rand(0.5, 1.3), s.length * k * rand(0.4, 1.4));
    });

    const petalCount = Math.max(0, s.petals + Math.floor(rand(-2, 2)));
    const offset = Math.random() * Math.PI * 2;
    this.petals.forEach((petal, i) => {
      petal.visible = i < petalCount && Math.random() > 0.25;
      if (!petal.visible) return;
      const petalMap = pick();
      petal.material.map = petalMap;
      petal.material.emissiveMap = petalMap;
      petal.material.emissive.setRGB(1, 0.94, 0.84).multiply(tint);
      // Petals tilt slightly forward like gas escaping a flash hider.
      petal.rotation.set(0, rand(0.1, 0.5), offset + (i / Math.max(1, petalCount)) * Math.PI * 2 + rand(-0.5, 0.5));
      petal.scale.set(s.petalLength * k * rand(0.4, 1.4), s.width * 0.6 * k * rand(0.5, 1.2), 1);
    });
  }

  /** Shrinks and fades the flame; hides it once the flash is over. */
  update(): void {
    if (!this.visible) return;
    const t = (performance.now() - this.startedAt) / this.duration;
    if (t >= 1) {
      this.visible = false;
      return;
    }
    const fade = this.peak * (1 - t * t);
    this.core.material.opacity = fade;
    for (const m of [...this.cones, ...this.petals]) m.material.opacity = fade;
  }

  get lightIntensity(): number {
    return this.style.light;
  }
}

/**
 * World muzzle flashes (other players' guns) plus the light every shot casts on the surroundings.
 * The number of lights never changes (changing it would force three.js to recompile every shader and stutter).
 */
export class MuzzleFlashes {
  private readonly slots: { light: THREE.PointLight; model: MuzzleFlashModel; until: number; peak: number }[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const light = new THREE.PointLight(0xffa850, 0, 14, 2);
      const model = new MuzzleFlashModel();
      scene.add(light, model);
      this.slots.push({ light, model, until: 0, peak: 0 });
    }
  }

  /** direction = null for our own gun: only the light, the viewmodel draws its own flame. */
  flash(position: THREE.Vector3, direction: THREE.Vector3 | null, weaponId: WeaponId): void {
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % LIGHT_COUNT;
    slot.light.position.copy(position);
    slot.light.color.setHSL(rand(0.07, 0.1), 1, rand(0.6, 0.7));
    slot.peak = STYLES[weaponId].light * rand(0.8, 1.2);
    slot.light.intensity = slot.peak;
    slot.until = performance.now() + FLASH_MS;
    if (!direction) return;
    slot.model.position.copy(position);
    // lookAt points +Z at the target; the flame points down -Z, so look backwards.
    slot.model.lookAt(position.clone().sub(direction));
    slot.model.fire(weaponId);
  }

  update(): void {
    const now = performance.now();
    for (const slot of this.slots) {
      slot.model.update();
      const left = (slot.until - now) / FLASH_MS;
      slot.light.intensity = left > 0 ? slot.peak * left : 0;
    }
  }
}
