import * as THREE from 'three';

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const BULLET_HOLE = canvasTexture((ctx) => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(10,8,6,1)');
  g.addColorStop(0.25, 'rgba(25,20,15,0.95)');
  g.addColorStop(0.5, 'rgba(60,50,40,0.5)');
  g.addColorStop(1, 'rgba(60,50,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
});

const BLOOD_SPLAT = canvasTexture((ctx) => {
  ctx.fillStyle = 'rgba(120,8,4,0.92)';
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 40;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(angle) * dist, 64 + Math.sin(angle) * dist, 6 + Math.random() * 18, 0, Math.PI * 2);
    ctx.fill();
  }
});

const SCORCH = canvasTexture((ctx) => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(8,7,6,0.95)');
  g.addColorStop(0.45, 'rgba(20,18,15,0.7)');
  g.addColorStop(1, 'rgba(30,25,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
});

/** Flat quads stuck onto walls: bullet holes and blood splatter. Oldest ones get recycled. */
class DecalPool {
  private readonly meshes: THREE.Mesh[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count: number, texture: THREE.Texture, roughness: number) {
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      roughness,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const geometry = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  place(point: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    const mesh = this.meshes[this.next];
    this.next = (this.next + 1) % this.meshes.length;
    mesh.position.copy(point).addScaledVector(normal, 0.01);
    mesh.lookAt(mesh.position.clone().add(normal));
    mesh.rotateZ(Math.random() * Math.PI * 2);
    mesh.scale.setScalar(size);
    mesh.visible = true;
  }
}

export class Decals {
  private readonly holes: DecalPool;
  private readonly blood: DecalPool;
  private readonly scorches: DecalPool;

  constructor(scene: THREE.Scene) {
    this.holes = new DecalPool(scene, 150, BULLET_HOLE, 0.9);
    this.blood = new DecalPool(scene, 60, BLOOD_SPLAT, 0.35);
    this.scorches = new DecalPool(scene, 30, SCORCH, 1);
  }

  bulletHole(point: THREE.Vector3, normal: THREE.Vector3): void {
    this.holes.place(point, normal, 0.09 + Math.random() * 0.03);
  }

  bloodSplat(point: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    this.blood.place(point, normal, size);
  }

  scorch(point: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    this.scorches.place(point, normal, size);
  }
}
