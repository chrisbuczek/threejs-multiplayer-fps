/**
 * Keyboard + mouse state for the current frame.
 * Uses KeyboardEvent.code so WASD works the same on every keyboard layout.
 */
export class Input {
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  fireHeld = false;
  aimHeld = false;
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();
  private firePressed = false;
  private lockListeners: ((locked: boolean) => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('contextmenu', this.preventDefault);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True once per key press. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  /** True once per left click (for semi-automatic weapons). */
  wasFirePressed(): boolean {
    return this.firePressed;
  }

  async requestLock(): Promise<void> {
    try {
      await this.canvas.requestPointerLock();
    } catch {
      // Browsers refuse the lock if requested too soon after leaving it; the user can click again.
    }
  }

  onLockChanged(listener: (locked: boolean) => void): void {
    this.lockListeners.push(listener);
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.firePressed = false;
    this.pressed.clear();
    this.released.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('contextmenu', this.preventDefault);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (this.isLocked) document.exitPointerLock();
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (e.target instanceof HTMLInputElement) return;
    if (!this.held.has(e.code)) this.pressed.add(e.code);
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    this.released.add(e.code);
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.isLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.isLocked) return;
    if (e.button === 0) {
      this.fireHeld = true;
      this.firePressed = true;
    }
    if (e.button === 2) this.aimHeld = true;
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.aimHeld = false;
  };

  private readonly onWheel = (e: WheelEvent) => {
    if (this.isLocked) this.wheel += Math.sign(e.deltaY);
  };

  private readonly onLockChange = () => {
    const locked = this.isLocked;
    if (!locked) {
      this.held.clear();
      this.fireHeld = false;
      this.aimHeld = false;
    }
    this.lockListeners.forEach((l) => l(locked));
  };

  private readonly preventDefault = (e: Event) => e.preventDefault();
}
