import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { Client } from './client';
import { now } from './clock';
import { Lobby } from './lobby';
import { handleMessage } from './messageHandler';
import { parseClientMessage } from './validation';

const PING_INTERVAL_MS = 2000;
const MAX_MESSAGES_PER_SECOND = 200;

/** HTTP server (for /health) with the game's WebSocket server attached. */
export function createGameServer(allowedOrigins: string[]): Server {
  const lobby = new Lobby();
  const clients = new Set<Client>();

  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, players: clients.size }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: ({ origin }: { origin: string }) => allowedOrigins.length === 0 || allowedOrigins.includes(origin),
  });

  wss.on('connection', (socket) => {
    const client = new Client(socket);
    clients.add(client);
    let messagesThisSecond = 0;
    const rateTimer = setInterval(() => (messagesThisSecond = 0), 1000);

    socket.on('message', (data) => {
      if (++messagesThisSecond > MAX_MESSAGES_PER_SECOND) return;
      const msg = parseClientMessage(data.toString());
      if (msg) handleMessage(lobby, client, msg);
    });

    socket.on('close', () => {
      clearInterval(rateTimer);
      client.room?.leave(client);
      clients.delete(client);
    });
  });

  const pingTimer = setInterval(() => {
    for (const client of clients) client.send({ type: 'ping', t: now() });
  }, PING_INTERVAL_MS);
  httpServer.on('close', () => {
    clearInterval(pingTimer);
    wss.close();
  });

  return httpServer;
}
