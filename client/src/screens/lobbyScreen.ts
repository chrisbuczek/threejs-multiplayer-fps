import { WEAPONS, type RoomInfo, type Team } from '@mp-fps/shared';
import { h, showToast } from '../dom';
import type { GameSocket } from '../net/socket';
import { MAP_LABELS, MODE_LABELS, TEAM_LABELS } from './labels';
import { openRoomSettingsDialog } from './roomSettingsForm';
import type { Screen } from './screen';

/** Waiting room before and between matches. */
export class LobbyScreen implements Screen {
  private el: HTMLElement | null = null;

  constructor(
    private readonly socket: GameSocket,
    private readonly playerId: string,
    private room: RoomInfo,
  ) {}

  mount(root: HTMLElement): void {
    this.el = h('div', { className: 'screen menu-bg' });
    root.append(this.el);
    this.render();
  }

  unmount(): void {
    this.el?.remove();
  }

  update(room: RoomInfo): void {
    this.room = room;
    this.render();
  }

  private render(): void {
    if (!this.el) return;
    const { settings } = this.room;
    const isHost = this.room.hostId === this.playerId;
    const inviteLink = `${location.origin}/?room=${this.room.id}`;

    const copyInvite = async () => {
      try {
        await navigator.clipboard.writeText(inviteLink);
        showToast('Invite link copied');
      } catch {
        showToast(inviteLink);
      }
    };

    const summary = h(
      'dl',
      { className: 'summary' },
      ...(
        [
          ['Map', MAP_LABELS[settings.map]],
          ['Mode', MODE_LABELS[settings.mode]],
          ['Health', `${settings.maxHealth} HP`],
          ['Score limit', `${settings.scoreLimit} kills`],
          ['Time limit', `${settings.timeLimitMinutes} min`],
          ['Visibility', settings.isPrivate ? 'Private' : 'Public'],
          ['Weapons', settings.allowedWeapons.map((w) => WEAPONS[w].name).join(', ')],
        ] as const
      ).flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]),
    );

    const playerItem = (p: RoomInfo['players'][number]) =>
      h(
        'li',
        { className: p.id === this.playerId ? 'me' : '' },
        h('span', { text: p.name }),
        p.id === this.room.hostId ? h('span', { className: 'badge', text: 'HOST' }) : null,
      );

    const teamColumn = (team: Team) => {
      const players = this.room.players.filter((p) => p.team === team);
      const mine = this.room.players.find((p) => p.id === this.playerId)?.team === team;
      return h(
        'div',
        { className: `team-column team-${team}` },
        h('h3', { text: `${TEAM_LABELS[team]} (${players.length})` }),
        h('ul', { className: 'player-list' }, ...players.map(playerItem)),
        mine
          ? null
          : h('button', {
              className: 'btn btn-small',
              text: 'Join this team',
              onclick: () => this.socket.send({ type: 'switchTeam', team }),
            }),
      );
    };

    const playersView =
      settings.mode === 'tdm'
        ? h('div', { className: 'teams' }, teamColumn('red'), teamColumn('blue'))
        : h('ul', { className: 'player-list' }, ...this.room.players.map(playerItem));

    const actions = isHost
      ? [
          h('button', {
            className: 'btn btn-primary',
            text: 'Start game',
            onclick: () => this.socket.send({ type: 'startMatch' }),
          }),
          h('button', {
            className: 'btn',
            text: 'Edit settings',
            onclick: () =>
              openRoomSettingsDialog(settings, 'Save', (s) =>
                this.socket.send({ type: 'updateSettings', settings: s }),
              ),
          }),
        ]
      : [
          h('p', {
            className: 'muted',
            text: this.room.status === 'lobby' ? 'Waiting for the host to start…' : 'Match in progress…',
          }),
        ];

    this.el.replaceChildren(
      h(
        'div',
        { className: 'panel wide-panel' },
        h(
          'header',
          { className: 'panel-header' },
          h('h1', { className: 'room-title', text: settings.name }),
          h('span', { className: 'muted', text: `${this.room.players.length}/${settings.maxPlayers} players` }),
        ),
        h(
          'div',
          { className: 'lobby-grid' },
          h('section', {}, h('h2', { text: 'Players' }), playersView),
          h(
            'section',
            {},
            h('h2', { text: 'Settings' }),
            summary,
            h(
              'div',
              { className: 'invite' },
              h('input', { className: 'input', value: inviteLink, readonly: true }),
              h('button', { className: 'btn', text: 'Copy invite link', onclick: copyInvite }),
            ),
          ),
        ),
        h(
          'div',
          { className: 'toolbar' },
          ...actions,
          h('button', {
            className: 'btn btn-danger',
            text: 'Leave room',
            onclick: () => this.socket.send({ type: 'leaveRoom' }),
          }),
        ),
      ),
    );
  }
}
