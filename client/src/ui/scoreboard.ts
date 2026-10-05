import type { GameMode, ScoreEntry, Scores, Team } from '@mp-fps/shared';
import { formatTime, h } from '../dom';

/** Hold TAB to see it during a match; also used as the end-of-match screen. */
export class Scoreboard {
  readonly root = h('div', { className: 'scoreboard' });

  constructor(
    private readonly mode: GameMode,
    private readonly myId: string,
  ) {}

  show(scores: Scores, secondsLeft: number): void {
    this.render(
      scores,
      h(
        'div',
        { className: 'scoreboard-title' },
        h('span', { text: this.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'DEATHMATCH' }),
        h('span', { className: 'muted', text: formatTime(secondsLeft) }),
      ),
    );
  }

  showFinal(scores: Scores, winner: string): void {
    this.render(
      scores,
      h(
        'div',
        { className: 'scoreboard-title final' },
        h('span', { text: 'MATCH OVER' }),
        h('span', { className: 'winner', text: winner === 'Draw' ? 'DRAW' : `WINNER: ${winner}` }),
        h('span', { className: 'muted', text: 'Returning to lobby…' }),
      ),
    );
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private render(scores: Scores, title: HTMLElement): void {
    const sections =
      this.mode === 'tdm'
        ? (['red', 'blue'] as Team[]).map((team) =>
            this.table(
              scores.players.filter((p) => p.team === team),
              `${team.toUpperCase()} — ${scores.teamKills[team as 'red' | 'blue']}`,
              team,
            ),
          )
        : [this.table(scores.players, 'PLAYERS', 'none')];
    this.root.replaceChildren(title, ...sections);
    this.root.style.display = 'flex';
  }

  private table(players: ScoreEntry[], heading: string, team: Team): HTMLElement {
    const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return h(
      'div',
      { className: `score-section team-${team}` },
      h('h3', { text: heading }),
      h(
        'table',
        { className: 'table' },
        h(
          'thead',
          {},
          h('tr', {}, ...['Name', 'Kills', 'Deaths', 'K/D', 'Headshots', 'Ping'].map((t) => h('th', { text: t }))),
        ),
        h(
          'tbody',
          {},
          ...sorted.map((p) =>
            h(
              'tr',
              { className: p.id === this.myId ? 'me' : '' },
              h('td', { text: p.name }),
              h('td', { text: String(p.kills) }),
              h('td', { text: String(p.deaths) }),
              h('td', { text: (p.kills / Math.max(1, p.deaths)).toFixed(2) }),
              h('td', { text: String(p.headshots) }),
              h('td', { text: `${p.ping} ms` }),
            ),
          ),
        ),
      ),
    );
  }
}
