import { h } from '../dom';
import type { GraphicsQuality, UserSettings } from '../settings';

interface PauseMenuActions {
  onResume: () => void;
  onLeave: () => void;
  onChange: (settings: UserSettings) => void;
}

/** Shown whenever the mouse is released (ESC). Settings apply immediately; quality applies next match. */
export class PauseMenu {
  readonly root = h('div', { className: 'pause-menu' });

  constructor(settings: UserSettings, actions: PauseMenuActions) {
    const current = { ...settings };
    const slider = (label: string, key: 'sensitivity' | 'fov' | 'volume', min: number, max: number, step: number) => {
      const value = h('span', { text: String(current[key]) });
      const input = h('input', { type: 'range', min, max, step, value: String(current[key]) });
      input.addEventListener('input', () => {
        current[key] = Number(input.value);
        value.textContent = input.value;
        actions.onChange({ ...current });
      });
      return h('label', { className: 'form-row' }, h('span', { text: label }), input, value);
    };
    const quality = h(
      'select',
      { className: 'input' },
      ...(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) =>
        h('option', { value: q, text: q, selected: q === current.quality }),
      ),
    );
    quality.addEventListener('change', () => {
      current.quality = quality.value as GraphicsQuality;
      actions.onChange({ ...current });
    });

    const motionBlur = h('input', { type: 'checkbox', checked: current.motionBlur });
    motionBlur.addEventListener('change', () => {
      current.motionBlur = motionBlur.checked;
      actions.onChange({ ...current });
    });

    this.root.append(
      h(
        'div',
        { className: 'panel pause-panel' },
        h('h2', { text: 'PAUSED' }),
        h('button', { className: 'btn btn-primary', text: 'Resume (click)', onclick: actions.onResume }),
        slider('Mouse sensitivity', 'sensitivity', 0.1, 4, 0.05),
        slider('Field of view', 'fov', 60, 110, 1),
        slider('Volume', 'volume', 0, 1, 0.05),
        h('label', { className: 'form-row' }, h('span', { text: 'Graphics (next match)' }), quality),
        h('label', { className: 'form-row' }, h('span', { text: 'Motion blur' }), motionBlur),
        h(
          'div',
          { className: 'controls-help' },
          ...[
            ['WASD', 'Move'],
            ['Mouse', 'Look'],
            ['LMB', 'Fire'],
            ['RMB', 'Aim'],
            ['Shift', 'Sprint'],
            ['Space', 'Jump'],
            ['C', 'Crouch'],
            ['R', 'Reload'],
            ['1 / 2 / Wheel', 'Switch weapon'],
            ['G', 'Throw grenade'],
            ['H', 'Smoke grenade'],
            ['J', 'Flashbang'],
            ['F', 'Flashlight'],
            ['B', 'Buy menu'],
            ['Tab', 'Scoreboard'],
          ].map(([k, v]) => h('div', {}, h('kbd', { text: k }), h('span', { text: v }))),
        ),
        h('button', { className: 'btn btn-danger', text: 'Leave match', onclick: actions.onLeave }),
      ),
    );
    this.hide();
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
