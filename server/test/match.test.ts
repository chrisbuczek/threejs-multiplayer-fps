import { defaultRoomSettings, type ServerMessage, type Vec3 } from '@mp-fps/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { Client } from '../src/client';
import { now } from '../src/clock';
import { Match } from '../src/match';

/** Fake connection that just records what the server sends. */
function fakeClient(id: string) {
  const inbox: ServerMessage[] = [];
  const client = {
    id,
    name: id,
    ping: 0,
    room: null,
    isIdentified: true,
    send: (m: ServerMessage) => inbox.push(m),
    sendRaw: (json: string) => inbox.push(JSON.parse(json)),
  };
  return { client: client as unknown as Client, inbox };
}

type Internals = {
  players: Map<string, { move: { pos: Vec3 }; protectedUntil: number; health: number; alive: boolean }>;
};

let match: Match | null = null;
afterEach(() => match?.stop());

/** Puts both players in an open lane of Shipment, 5 m apart, facing each other. */
async function setup(mode: 'dm' | 'tdm') {
  match = new Match('room', { ...defaultRoomSettings('t'), mode, map: 'shipment' }, () => {});
  const shooter = fakeClient('shooter');
  const victim = fakeClient('victim');
  match.addPlayer(shooter.client, mode === 'tdm' ? 'red' : 'none');
  match.addPlayer(victim.client, mode === 'tdm' ? 'blue' : 'none');
  const players = (match as unknown as Internals).players;
  players.get('shooter')!.move.pos = { x: -10, y: 0, z: 2.5 };
  players.get('victim')!.move.pos = { x: -5, y: 0, z: 2.5 };
  for (const p of players.values()) p.protectedUntil = 0;
  await new Promise((r) => setTimeout(r, 120)); // let the pose history record a few ticks
  return { shooter, victim, players };
}

describe('match combat', () => {
  it('a headshot kills instantly and is broadcast as a headshot kill', async () => {
    const { shooter, victim, players } = await setup('dm');
    match!.handleFire('shooter', 'ak47', [{ x: 1, y: 0, z: 0 }], now());

    expect(players.get('victim')!.alive).toBe(false);
    expect(shooter.inbox).toContainEqual({ type: 'hitConfirm', headshot: true, kill: true });
    const kill = victim.inbox.find((m) => m.type === 'kill');
    expect(kill).toMatchObject({ killerId: 'shooter', victimId: 'victim', headshot: true });
  });

  it('a body shot only damages', async () => {
    const { players } = await setup('dm');
    const down = { x: 5, y: -0.45, z: 0 }; // aim at the chest
    match!.handleFire('shooter', 'ak47', [down], now());
    expect(players.get('victim')!.alive).toBe(true);
    expect(players.get('victim')!.health).toBe(100 - 34);
  });

  it('friendly fire is off in team deathmatch', async () => {
    const { players } = await setup('tdm');
    (match as unknown as { players: Map<string, { team: string }> }).players.get('victim')!.team = 'red';
    match!.handleFire('shooter', 'ak47', [{ x: 1, y: 0, z: 0 }], now());
    expect(players.get('victim')!.alive).toBe(true);
  });

  it('enforces the fire rate', async () => {
    const { players } = await setup('dm');
    const down = { x: 5, y: -0.45, z: 0 };
    match!.handleFire('shooter', 'ak47', [down], now());
    match!.handleFire('shooter', 'ak47', [down], now()); // too soon, ignored
    expect(players.get('victim')!.health).toBe(100 - 34);
  });
});
