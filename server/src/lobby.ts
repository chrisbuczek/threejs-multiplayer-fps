import type { RoomSettings, RoomSummary } from '@mp-fps/shared';
import type { Client } from './client';
import { randomId } from './ids';
import { Room } from './room';

/** Registry of all rooms on this server. */
export class Lobby {
  private readonly rooms = new Map<string, Room>();

  createRoom(host: Client, settings: RoomSettings): Room {
    const room = new Room(randomId(), settings, (r) => this.rooms.delete(r.id));
    this.rooms.set(room.id, room);
    room.join(host);
    return room;
  }

  findRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  listPublicRooms(): RoomSummary[] {
    return [...this.rooms.values()].filter((r) => !r.settings.isPrivate).map((r) => r.toSummary());
  }
}
