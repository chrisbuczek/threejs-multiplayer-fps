import type { MatchInfo, RoomInfo } from '@mp-fps/shared';
import { Game } from '../game/game';
import type { GameSocket } from '../net/socket';
import type { Screen } from './screen';

export class GameScreen implements Screen {
  private game: Game | null = null;

  constructor(
    private readonly socket: GameSocket,
    private readonly playerId: string,
    private readonly room: RoomInfo,
    private readonly match: MatchInfo,
  ) {}

  mount(root: HTMLElement): void {
    this.game = new Game(root, this.socket, this.playerId, this.room, this.match);
  }

  unmount(): void {
    this.game?.destroy();
    this.game = null;
  }

  updateRoom(room: RoomInfo): void {
    this.game?.updateRoom(room);
  }
}
