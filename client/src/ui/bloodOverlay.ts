/**
 * Full-screen "blood on the lens" image: splatters and smears around the edges, drips from the top,
 * clean in the middle. Painted once on a canvas so no image file is needed.
 */
export function createBloodOverlayImage(width = 1280, height = 720): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  const blood = (alpha: number) =>
    `rgba(${Math.round(rand(90, 150))},${Math.round(rand(0, 12))},${Math.round(rand(0, 8))},${alpha})`;

  /** A point close to a random screen edge (exponential falloff inwards). */
  const nearEdge = (): [number, number] => {
    const inward = Math.min(0.45, -Math.log(1 - Math.random()) * 0.09);
    const along = Math.random();
    switch (Math.floor(Math.random() * 4)) {
      case 0:
        return [along * width, inward * height];
      case 1:
        return [along * width, height - inward * height];
      case 2:
        return [inward * width, along * height];
      default:
        return [width - inward * width, along * height];
    }
  };

  // Soft smeared base along the edges.
  for (let i = 0; i < 70; i++) {
    const [x, y] = nearEdge();
    const r = rand(60, 220);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, blood(rand(0.35, 0.6)));
    g.addColorStop(1, 'rgba(80,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Splatters: a dense blob with droplets thrown around it.
  for (let i = 0; i < 45; i++) {
    const [x, y] = nearEdge();
    const size = rand(10, 45);
    ctx.fillStyle = blood(rand(0.7, 0.92));
    for (let k = 0; k < 8; k++) {
      ctx.beginPath();
      ctx.arc(x + rand(-size, size) * 0.6, y + rand(-size, size) * 0.6, size * rand(0.3, 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < 18; k++) {
      const angle = rand(0, Math.PI * 2);
      const dist = size * rand(1, 3.5);
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, rand(1, size * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Drips running down from the top edge and from the upper corners.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() < 0.5 ? rand(0, width * 0.3) : rand(width * 0.7, width);
    const top = rand(0, height * 0.12);
    const length = rand(40, 260);
    const w = rand(3, 9);
    const g = ctx.createLinearGradient(0, top, 0, top + length);
    g.addColorStop(0, blood(0.85));
    g.addColorStop(1, blood(0.55));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top);
    ctx.quadraticCurveTo(x + rand(-6, 6), top + length * 0.5, x - w * 0.3, top + length);
    ctx.lineTo(x + w * 0.3, top + length);
    ctx.quadraticCurveTo(x + rand(-6, 6), top + length * 0.5, x + w / 2, top);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, top + length, w * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Keep the middle of the screen readable.
  ctx.globalCompositeOperation = 'destination-out';
  const clear = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, height * 0.55);
  clear.addColorStop(0, 'rgba(0,0,0,1)');
  clear.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  clear.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = clear;
  ctx.fillRect(0, 0, width, height);

  return canvas.toDataURL('image/png');
}
