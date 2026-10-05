import { h } from '../dom';

const COMBO_WINDOW_MS = 4000;

/** Big animated "HEADSHOT" text. Repeated headshots within a few seconds count up a combo. */
export class HeadshotBanner {
  readonly root = h('div', { className: 'headshot-layer' });
  private combo = 0;
  private lastAt = 0;

  show(): void {
    const now = performance.now();
    this.combo = now - this.lastAt < COMBO_WINDOW_MS ? this.combo + 1 : 1;
    this.lastAt = now;

    const banner = h(
      'div',
      { className: 'headshot-banner' },
      h('span', { className: 'headshot-text', 'data-text': 'HEADSHOT', text: 'HEADSHOT' }),
      this.combo > 1 ? h('span', { className: 'headshot-combo', text: `×${this.combo}` }) : null,
    );
    this.root.replaceChildren(banner, h('div', { className: 'headshot-flash' }));
    setTimeout(() => banner.remove(), 1700);
  }
}
