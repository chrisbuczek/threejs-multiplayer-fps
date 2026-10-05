import { defaultRoomSettings, type RoomSummary } from '@mp-fps/shared';
import { h } from '../dom';
import type { GameSocket } from '../net/socket';
import { MAP_LABELS, MODE_LABELS, STATUS_LABELS } from './labels';
import { openRoomSettingsDialog } from './roomSettingsForm';
import type { Screen } from './screen';

const REFRESH_MS = 3000;

/** Public room browser + create room + join by invite link. */
export class RoomListScreen implements Screen {
  private el: HTMLElement | null = null;
  private timer = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly socket: GameSocket,
    private readonly playerName: string,
  ) {}

  mount(root: HTMLElement): void {
    const list = h('div', { className: 'room-list' }, h('p', { className: 'muted', text: 'Loading rooms…' }));
    const invite = h('input', { className: 'input', placeholder: 'Paste invite link or room code' });

    this.unsubscribe = this.socket.on('roomList', ({ rooms }) => this.renderRooms(list, rooms));
    const refresh = () => this.socket.send({ type: 'listRooms' });

    const joinInvite = (event: Event) => {
      event.preventDefault();
      const code = parseRoomCode(invite.value);
      if (code) this.socket.send({ type: 'joinRoom', roomId: code });
    };

    this.el = h(
      'div',
      { className: 'screen menu-bg' },
      h(
        'div',
        { className: 'panel wide-panel' },
        h(
          'header',
          { className: 'panel-header' },
          h('h1', { className: 'logo small', text: 'MEDYCYNA PRAKTYCZNA FPS' }),
          h('span', { className: 'muted', text: `Playing as ${this.playerName}` }),
        ),
        h(
          'div',
          { className: 'toolbar' },
          h('button', {
            className: 'btn btn-primary',
            text: 'Create room',
            onclick: () =>
              openRoomSettingsDialog(defaultRoomSettings(this.playerName), 'Create room', (settings) =>
                this.socket.send({ type: 'createRoom', settings }),
              ),
          }),
          h('button', { className: 'btn', text: 'Refresh', onclick: refresh }),
          h(
            'form',
            { className: 'invite-form', onsubmit: joinInvite },
            invite,
            h('button', { className: 'btn', text: 'Join' }),
          ),
        ),
        list,
      ),
    );
    root.append(this.el);
    refresh();
    this.timer = window.setInterval(refresh, REFRESH_MS);
  }

  unmount(): void {
    clearInterval(this.timer);
    this.unsubscribe?.();
    this.el?.remove();
  }

  private renderRooms(container: HTMLElement, rooms: RoomSummary[]): void {
    if (rooms.length === 0) {
      container.replaceChildren(h('p', { className: 'muted empty', text: 'No public rooms yet — create one!' }));
      return;
    }
    const rows = rooms.map((room) => {
      const full = room.playerCount >= room.maxPlayers;
      return h(
        'tr',
        {},
        h('td', { className: 'strong', text: room.name }),
        h('td', { text: MAP_LABELS[room.map] }),
        h('td', { text: MODE_LABELS[room.mode] }),
        h('td', { text: `${room.playerCount}/${room.maxPlayers}` }),
        h('td', { text: STATUS_LABELS[room.status] }),
        h(
          'td',
          {},
          h('button', {
            className: 'btn btn-small',
            text: full ? 'Full' : 'Join',
            disabled: full,
            onclick: () => this.socket.send({ type: 'joinRoom', roomId: room.id }),
          }),
        ),
      );
    });
    container.replaceChildren(
      h(
        'table',
        { className: 'table' },
        h(
          'thead',
          {},
          h('tr', {}, ...['Room', 'Map', 'Mode', 'Players', 'Status', ''].map((t) => h('th', { text: t }))),
        ),
        h('tbody', {}, ...rows),
      ),
    );
  }
}

/** Accepts a full invite link (…?room=abc) or just the code. */
export function parseRoomCode(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).searchParams.get('room');
  } catch {
    return trimmed;
  }
}
