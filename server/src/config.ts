import { DEFAULT_SERVER_PORT } from '@mp-fps/shared';

export const PORT = Number(process.env.PORT) || DEFAULT_SERVER_PORT;

/**
 * Comma separated list of allowed browser origins, e.g. "https://my-game.vercel.app".
 * Empty = allow everything (handy for local development).
 */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
