import { INTERPOLATION_DELAY_MS } from '@mp-fps/shared';

/** Estimates the server's clock from snapshot timestamps. */
export class ServerClock {
  private offset: number | null = null;

  sync(serverTime: number): void {
    const sample = serverTime - performance.now();
    // Smooth out network jitter, but follow big changes quickly.
    if (this.offset === null || Math.abs(sample - this.offset) > 500) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.05;
  }

  now(): number {
    return performance.now() + (this.offset ?? 0);
  }

  /** The moment in server time that remote players are currently drawn at. */
  renderTime(): number {
    return this.now() - INTERPOLATION_DELAY_MS;
  }
}
