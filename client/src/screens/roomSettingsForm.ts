import {
  HEALTH_OPTIONS,
  MAX_PLAYERS_LIMIT,
  WEAPON_IDS,
  defaultScoreLimit,
  validateRoomSettings,
  type GameMode,
  type MapId,
  type RoomSettings,
} from '@mp-fps/shared';
import { h } from '../dom';
import { MAP_LABELS, MODE_LABELS, weaponName } from './labels';

/** Modal dialog used to create a room and (for the host) to edit its settings. */
export function openRoomSettingsDialog(
  initial: RoomSettings,
  submitLabel: string,
  onSubmit: (settings: RoomSettings) => void,
): void {
  const select = <T extends string>(options: Record<T, string>, value: T) =>
    h(
      'select',
      { className: 'input' },
      ...Object.entries(options).map(([v, label]) =>
        h('option', { value: v, text: label as string, selected: v === value }),
      ),
    );

  const name = h('input', { className: 'input', value: initial.name, maxlength: 24 });
  const map = select(MAP_LABELS, initial.map);
  const mode = select(MODE_LABELS, initial.mode);
  const health = select(
    Object.fromEntries(HEALTH_OPTIONS.map((v) => [String(v), `${v} HP`])) as Record<string, string>,
    String(initial.maxHealth),
  );
  const maxPlayers = h('input', {
    className: 'input',
    type: 'number',
    min: 2,
    max: MAX_PLAYERS_LIMIT,
    value: String(initial.maxPlayers),
  });
  const scoreLimit = h('input', {
    className: 'input',
    type: 'number',
    min: 1,
    max: 500,
    value: String(initial.scoreLimit),
  });
  const timeLimit = h('input', {
    className: 'input',
    type: 'number',
    min: 1,
    max: 60,
    value: String(initial.timeLimitMinutes),
  });
  const isPrivate = h('input', { type: 'checkbox', checked: initial.isPrivate });
  const weaponBoxes = WEAPON_IDS.map((id) => ({
    id,
    box: h('input', { type: 'checkbox', checked: initial.allowedWeapons.includes(id) }),
  }));
  const error = h('p', { className: 'form-error' });

  // Changing the mode suggests that mode's usual score limit.
  mode.addEventListener('change', () => (scoreLimit.value = String(defaultScoreLimit(mode.value as GameMode))));

  const row = (label: string, control: HTMLElement) =>
    h('label', { className: 'form-row' }, h('span', { text: label }), control);

  const close = () => overlay.remove();
  const form = h(
    'form',
    { className: 'panel dialog' },
    h('h2', { text: submitLabel === 'Create room' ? 'Create room' : 'Room settings' }),
    row('Room name', name),
    row('Map', map),
    row('Mode', mode),
    row('Player health', health),
    row('Max players', maxPlayers),
    row('Score limit (kills)', scoreLimit),
    row('Time limit (minutes)', timeLimit),
    h(
      'label',
      { className: 'form-row checkbox-row' },
      isPrivate,
      h('span', { text: 'Private room (hidden from list, join by invite link)' }),
    ),
    h(
      'fieldset',
      { className: 'weapon-checks' },
      h('legend', { text: 'Allowed weapons' }),
      ...weaponBoxes.map(({ id, box }) =>
        h('label', { className: 'checkbox-row' }, box, h('span', { text: weaponName(id) })),
      ),
    ),
    error,
    h(
      'div',
      { className: 'dialog-actions' },
      h('button', { className: 'btn', type: 'button', text: 'Cancel', onclick: close }),
      h('button', { className: 'btn btn-primary', type: 'submit', text: submitLabel }),
    ),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const settings: RoomSettings = {
      name: name.value.trim(),
      map: map.value as MapId,
      mode: mode.value as GameMode,
      isPrivate: isPrivate.checked,
      maxHealth: Number(health.value),
      allowedWeapons: weaponBoxes.filter((w) => w.box.checked).map((w) => w.id),
      maxPlayers: Number(maxPlayers.value),
      scoreLimit: Number(scoreLimit.value),
      timeLimitMinutes: Number(timeLimit.value),
    };
    const problem = validateRoomSettings(settings);
    if (problem) {
      error.textContent = problem;
      return;
    }
    close();
    onSubmit(settings);
  });

  const overlay = h('div', { className: 'overlay' }, form);
  document.body.append(overlay);
  name.focus();
}
