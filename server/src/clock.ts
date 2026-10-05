import { performance } from 'node:perf_hooks';

/** Server time in milliseconds. Clients sync to this clock through snapshots. */
export function now(): number {
  return performance.now();
}
