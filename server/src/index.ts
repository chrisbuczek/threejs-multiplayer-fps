import { ALLOWED_ORIGINS, PORT } from './config';
import { createGameServer } from './server';

createGameServer(ALLOWED_ORIGINS).listen(PORT, () => {
  console.log(`Game server listening on port ${PORT}`);
  console.log(
    ALLOWED_ORIGINS.length ? `Allowed origins: ${ALLOWED_ORIGINS.join(', ')}` : 'Allowing all origins (dev mode)',
  );
});
