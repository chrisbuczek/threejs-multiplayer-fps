import { validateRoomSettings, type ClientMessage } from '@mp-fps/shared';
import type { Client } from './client';
import { now } from './clock';
import type { Lobby } from './lobby';
import { sanitizeName } from './validation';

/** Routes one validated message from a client to the lobby, room or match. */
export function handleMessage(lobby: Lobby, client: Client, msg: ClientMessage): void {
  if (msg.type === 'hello') {
    const name = sanitizeName(msg.name);
    if (!name) return client.send({ type: 'error', message: 'Name must be 2-16 letters or numbers' });
    client.name = name;
    return client.send({ type: 'welcome', playerId: client.id, name });
  }
  if (!client.isIdentified) return;

  const room = client.room;
  const isHost = room?.hostId === client.id;
  const match = room?.getMatch();

  switch (msg.type) {
    case 'listRooms':
      return client.send({ type: 'roomList', rooms: lobby.listPublicRooms() });

    case 'createRoom': {
      const error = validateRoomSettings(msg.settings);
      if (error) return client.send({ type: 'error', message: error });
      room?.leave(client);
      lobby.createRoom(client, msg.settings);
      return;
    }

    case 'joinRoom': {
      const target = lobby.findRoom(msg.roomId);
      if (!target) return client.send({ type: 'error', message: 'Room not found' });
      if (target === room) return;
      if (target.isFull) return client.send({ type: 'error', message: 'Room is full' });
      room?.leave(client);
      target.join(client);
      return;
    }

    case 'leaveRoom':
      return room?.leave(client);

    case 'updateSettings': {
      if (!room || !isHost || room.status !== 'lobby') return;
      const error = validateRoomSettings(msg.settings);
      if (error) return client.send({ type: 'error', message: error });
      return room.updateSettings(msg.settings);
    }

    case 'switchTeam':
      if (room?.status === 'lobby') room.switchTeam(client.id, msg.team);
      return;

    case 'startMatch':
      if (room && isHost && room.status === 'lobby') room.startMatch();
      return;

    case 'inputs':
      return match?.handleInputs(client.id, msg.inputs);
    case 'fire':
      return match?.handleFire(client.id, msg.weaponId, msg.directions, msg.viewTime);
    case 'reload':
      return match?.handleReload(client.id);
    case 'switchWeapon':
      return match?.handleSwitchWeapon(client.id, msg.slot);
    case 'buyWeapon':
      return match?.handleBuy(client.id, msg.weaponId);
    case 'flashlight':
      return match?.handleFlashlight(client.id, msg.on);
    case 'throwGrenade':
      return match?.handleThrowGrenade(client.id, msg.kind, msg.yaw, msg.pitch);

    case 'pong':
      client.ping = Math.max(0, now() - msg.t);
      return;
  }
}
