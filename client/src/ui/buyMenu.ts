import { WEAPONS, type Loadout, type WeaponId } from '@mp-fps/shared';
import { h } from '../dom';

const STAT_BARS: { label: string; value: (id: WeaponId) => number }[] = [
  { label: 'Damage', value: (id) => Math.min(1, (WEAPONS[id].damage * WEAPONS[id].pellets) / 180) },
  { label: 'Fire rate', value: (id) => Math.min(1, WEAPONS[id].rpm / 800) },
  {
    label: 'Accuracy',
    value: (id) => 1 - Math.min(1, WEAPONS[id].hipSpread / 0.12) * 0.7 - WEAPONS[id].recoilPitch * 5,
  },
  { label: 'Mobility', value: (id) => (WEAPONS[id].moveSpeedMultiplier - 0.8) / 0.3 },
];

/** Loadout picker, available any time while alive (press B). Number keys or clicks pick a weapon. */
export class BuyMenu {
  readonly root = h('div', { className: 'buy-menu' });
  private weapons: WeaponId[] = [];

  constructor(private readonly onBuy: (id: WeaponId) => void) {}

  get isOpen(): boolean {
    return this.root.style.display === 'flex';
  }

  open(allowed: WeaponId[], loadout: Loadout | null): void {
    this.weapons = allowed;
    const owned = new Set([loadout?.primary, loadout?.secondary]);
    const cards = allowed.map((id, i) =>
      h(
        'button',
        { className: `weapon-card ${owned.has(id) ? 'owned' : ''}`, onclick: () => this.pick(i) },
        h('span', { className: 'key', text: String(i + 1) }),
        h('span', { className: 'weapon-card-name', text: WEAPONS[id].name }),
        h('span', { className: 'muted', text: WEAPONS[id].slot === 'primary' ? 'Primary' : 'Secondary' }),
        ...STAT_BARS.map((s) =>
          h(
            'div',
            { className: 'stat' },
            h('span', { text: s.label }),
            h(
              'div',
              { className: 'stat-bar' },
              h('i', { style: `width:${Math.max(5, Math.min(100, s.value(id) * 100))}%` }),
            ),
          ),
        ),
      ),
    );
    this.root.replaceChildren(
      h('div', { className: 'buy-header' }, h('h2', { text: 'CHOOSE WEAPON' })),
      h('div', { className: 'weapon-cards' }, ...cards),
      h('p', { className: 'muted', text: `Press 1–${allowed.length} or click. B to close.` }),
    );
    this.root.style.display = 'flex';
  }

  close(): void {
    this.root.style.display = 'none';
  }

  /** index = 0-based card position. */
  pick(index: number): void {
    const id = this.weapons[index];
    if (!id) return;
    this.onBuy(id);
    this.close();
  }
}
