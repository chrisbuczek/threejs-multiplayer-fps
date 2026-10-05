import type { MatchInfo, RoomInfo } from '@mp-fps/shared';
import { SERVER_URL } from './config';
import { h, showToast } from './dom';
import { GameScreen } from './screens/gameScreen';
import { LobbyScreen } from './screens/lobbyScreen';
import { NameScreen } from './screens/nameScreen';
import { RoomListScreen, parseRoomCode } from './screens/roomListScreen';
import type { Screen } from './screens/screen';
import { GameSocket } from './net/socket';
import { savePlayerName } from './settings';

/**
 * Top-level flow: Name → Room list → Lobby ⇄ Game.
 * The server decides where we are (roomState / matchStart / leftRoom); the app just shows the right screen.
 */
export class App {
  private readonly socket = new GameSocket(SERVER_URL);
  private screen: Screen | null = null;
  private playerId = '';
  private playerName = '';
  private room: RoomInfo | null = null;
  private inviteCode = parseRoomCode(location.href);

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    this.show(new NameScreen((name) => this.login(name)));
  }

  private async login(name: string): Promise<void> {
    if (!this.socket.isOpen) {
      await this.socket.connect();
      this.listen();
    }
    this.socket.send({ type: 'hello', name });
  }

  private listen(): void {
    this.socket.on('welcome', ({ playerId, name }) => {
      this.playerId = playerId;
      this.playerName = name;
      savePlayerName(name);
      if (this.inviteCode) {
        this.socket.send({ type: 'joinRoom', roomId: this.inviteCode });
        this.inviteCode = null;
        history.replaceState(null, '', location.pathname);
      }
      this.showRoomList();
    });
    this.socket.on('error', ({ message }) => showToast(message));
    this.socket.on('roomState', ({ room }) => this.onRoomState(room));
    this.socket.on('matchStart', ({ match }) => this.startGame(match));
    this.socket.on('leftRoom', () => {
      this.room = null;
      this.showRoomList();
    });
    this.socket.onClose(() => {
      this.show(null);
      this.root.append(
        h(
          'div',
          { className: 'screen screen-center menu-bg' },
          h(
            'div',
            { className: 'panel' },
            h('h2', { text: 'Disconnected from server' }),
            h('button', { className: 'btn btn-primary', text: 'Reconnect', onclick: () => location.reload() }),
          ),
        ),
      );
    });
  }

  private onRoomState(room: RoomInfo): void {
    this.room = room;
    if (this.screen instanceof GameScreen) {
      // A finished match returns everyone to the lobby.
      if (room.status === 'lobby') this.showLobby(room);
      else this.screen.updateRoom(room);
      return;
    }
    if (this.screen instanceof LobbyScreen) this.screen.update(room);
    else this.showLobby(room);
  }

  private showRoomList(): void {
    this.show(new RoomListScreen(this.socket, this.playerName));
  }

  private showLobby(room: RoomInfo): void {
    this.show(new LobbyScreen(this.socket, this.playerId, room));
  }

  private startGame(match: MatchInfo): void {
    if (!this.room) return;
    this.show(new GameScreen(this.socket, this.playerId, this.room, match));
  }

  private show(screen: Screen | null): void {
    this.screen?.unmount();
    this.root.replaceChildren();
    this.screen = screen;
    screen?.mount(this.root);
  }
}
