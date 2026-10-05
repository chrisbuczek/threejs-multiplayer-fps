import { DEFAULT_SERVER_PORT } from '@mp-fps/shared';

/**
 * Where the game server lives. In production set VITE_SERVER_URL (e.g. on Vercel).
 * Locally it defaults to the same host on port 3456, so it also works from other devices on your network.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${DEFAULT_SERVER_PORT}`;
