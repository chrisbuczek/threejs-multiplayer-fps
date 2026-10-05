import {
  MATCH_END_SCREEN_SECONDS,
  type RoomInfo,
  type RoomSettings,
  type RoomStatus,
  type RoomSummary,
  type ServerMessage,
  type Team,
} from '@mp-fps/shared';
import type { Client } from './client';
import { Match } from './match';

interface Member {
  client: Client;
  team: Team;
  joinedAt: number;
}

/**
 * A room lives through: lobby → playing → ended → lobby …
 * The host is whoever created it (or the longest member after the host leaves).
 */
export class Room {
  status: RoomStatus = 'lobby';
  hostId = '';
  private readonly members = new Map<string, Member>();
  private match: Match | null = null;
  private joinCounter = 0;

  constructor(
    readonly id: string,
    public settings: RoomSettings,
    private readonly onEmpty: (room: Room) => void,
  ) {}

  get isFull(): boolean {
    return this.members.size >= this.settings.maxPlayers;
  }

  join(client: Client): void {
    const team = this.pickTeamForNewPlayer();
    this.members.set(client.id, { client, team, joinedAt: this.joinCounter++ });
    client.room = this;
    if (!this.hostId) this.hostId = client.id;
    this.broadcastRoomState();
    if (this.match) this.match.addPlayer(client, team);
  }

  leave(client: Client): void {
    if (!this.members.delete(client.id)) return;
    client.room = null;
    client.send({ type: 'leftRoom' });
    this.match?.removePlayer(client.id);

    if (this.members.size === 0) {
      this.match?.stop();
      this.onEmpty(this);
      return;
    }
    if (this.hostId === client.id) {
      const oldest = [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      this.hostId = oldest.client.id;
    }
    this.broadcastRoomState();
  }

  updateSettings(settings: RoomSettings): void {
    const modeChanged = settings.mode !== this.settings.mode;
    this.settings = settings;
    if (modeChanged) this.reassignTeams();
    this.broadcastRoomState();
  }

  switchTeam(clientId: string, team: Team): void {
    const member = this.members.get(clientId);
    if (!member || this.settings.mode !== 'tdm') return;
    member.team = team;
    this.broadcastRoomState();
  }

  startMatch(): void {
    this.status = 'playing';
    this.match = new Match(this.id, this.settings, (scores, winner) => {
      this.status = 'ended';
      this.broadcast({ type: 'matchEnd', scores, winner });
      setTimeout(() => this.returnToLobby(), MATCH_END_SCREEN_SECONDS * 1000);
    });
    this.broadcastRoomState();
    for (const m of this.members.values()) this.match.addPlayer(m.client, m.team);
  }

  broadcast(message: ServerMessage): void {
    const json = JSON.stringify(message);
    for (const m of this.members.values()) m.client.sendRaw(json);
  }

  /** Forwards gameplay messages to the running match. */
  getMatch(): Match | null {
    return this.status === 'playing' ? this.match : null;
  }

  toSummary(): RoomSummary {
    return {
      id: this.id,
      name: this.settings.name,
      map: this.settings.map,
      mode: this.settings.mode,
      playerCount: this.members.size,
      maxPlayers: this.settings.maxPlayers,
      status: this.status,
    };
  }

  toInfo(): RoomInfo {
    return {
      id: this.id,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      players: [...this.members.values()].map((m) => ({ id: m.client.id, name: m.client.name, team: m.team })),
    };
  }

  private returnToLobby(): void {
    this.match?.stop();
    this.match = null;
    if (this.members.size === 0) return;
    this.status = 'lobby';
    this.broadcastRoomState();
  }

  private broadcastRoomState(): void {
    this.broadcast({ type: 'roomState', room: this.toInfo() });
  }

  private pickTeamForNewPlayer(): Team {
    if (this.settings.mode === 'dm') return 'none';
    const reds = [...this.members.values()].filter((m) => m.team === 'red').length;
    return reds <= this.members.size - reds ? 'red' : 'blue';
  }

  private reassignTeams(): void {
    let i = 0;
    for (const m of this.members.values()) {
      m.team = this.settings.mode === 'dm' ? 'none' : i++ % 2 === 0 ? 'red' : 'blue';
    }
  }
}
