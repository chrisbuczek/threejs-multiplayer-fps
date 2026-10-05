import { defaultRoomSettings, type ClientMessage, type ServerMessage } from '@mp-fps/shared';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createGameServer } from '../src/server';

const server = createGameServer([]);
let url = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `ws://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

/** Minimal test client that can wait for a specific message type. */
async function connect(name: string) {
  const socket = new WebSocket(url);
  const inbox: ServerMessage[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((resolve) => socket.on('open', resolve));
  const send = (m: ClientMessage) => socket.send(JSON.stringify(m));
  const waitFor = async <T extends ServerMessage['type']>(
    type: T,
    check: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ) => {
    for (let i = 0; i < 100; i++) {
      const index = inbox.findIndex((m) => m.type === type && check(m as Extract<ServerMessage, { type: T }>));
      if (index >= 0) return inbox.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`Timed out waiting for ${type}`);
  };
  send({ type: 'hello', name });
  const welcome = await waitFor('welcome');
  return { socket, send, waitFor, id: welcome.playerId };
}

describe('rooms', () => {
  it('lists public rooms, hides private ones, and lets players join and start', async () => {
    const host = await connect('Host');
    const guest = await connect('Guest');

    host.send({ type: 'createRoom', settings: { ...defaultRoomSettings('Host'), name: 'Public' } });
    const created = await host.waitFor('roomState');
    expect(created.room.hostId).toBe(host.id);

    const other = await connect('Other');
    other.send({ type: 'createRoom', settings: { ...defaultRoomSettings('Other'), name: 'Secret', isPrivate: true } });
    const secret = await other.waitFor('roomState');

    guest.send({ type: 'listRooms' });
    const list = await guest.waitFor('roomList');
    expect(list.rooms.map((r) => r.name)).toContain('Public');
    expect(list.rooms.map((r) => r.name)).not.toContain('Secret');

    // Private rooms are still joinable with the invite id.
    guest.send({ type: 'joinRoom', roomId: secret.room.id });
    await guest.waitFor('roomState', (m) => m.room.id === secret.room.id);

    guest.send({ type: 'joinRoom', roomId: created.room.id });
    const joined = await guest.waitFor('roomState', (m) => m.room.players.length === 2);
    expect(joined.room.players[1].team).toBe('blue');

    // Only the host can start.
    guest.send({ type: 'startMatch' });
    host.send({ type: 'startMatch' });
    await guest.waitFor('matchStart');
    const spawn = await guest.waitFor('spawn');
    expect(spawn.loadout.primary).toBe('ak47');

    for (const c of [host, guest, other]) c.socket.close();
  });

  it('passes host to the next player when the host leaves', async () => {
    const a = await connect('Alice');
    const b = await connect('Bob');
    a.send({ type: 'createRoom', settings: defaultRoomSettings('Alice') });
    const room = (await a.waitFor('roomState')).room;
    b.send({ type: 'joinRoom', roomId: room.id });
    await b.waitFor('roomState', (m) => m.room.players.length === 2);
    a.send({ type: 'leaveRoom' });
    const after = await b.waitFor('roomState', (m) => m.room.players.length === 1);
    expect(after.room.hostId).toBe(b.id);
    a.socket.close();
    b.socket.close();
  });
});
