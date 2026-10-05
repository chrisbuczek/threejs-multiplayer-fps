import type { Team } from '@mp-fps/shared';
import { formatTime, h } from '../dom';
import { createBloodOverlayImage } from './bloodOverlay';

const KILLFEED_MS = 5000;
const DAMAGE_INDICATOR_MS = 1200;
const ELIMINATION_MS = 2500;
/** Below this many hit points the screen edges get covered in blood. */
const BLOOD_OVERLAY_HP = 40;

/** Everything drawn on top of the 3D view while playing. Plain DOM, updated each frame. */
export class Hud {
  readonly root: HTMLElement;
  private readonly crosshair = h(
    'div',
    { className: 'crosshair' },
    ...['top', 'bottom', 'left', 'right'].map((s) => h('i', { className: s })),
  );
  private readonly hitmarker = h('div', { className: 'hitmarker' });
  private readonly healthFill = h('div', { className: 'health-fill' });
  private readonly healthText = h('span', { className: 'health-text' });
  private readonly weaponName = h('div', { className: 'weapon-name' });
  private readonly ammoText = h('div', { className: 'ammo' });
  private readonly reloadText = h('div', { className: 'reload-text', text: 'RELOADING' });
  private readonly grenadeText = h('div', { className: 'grenade-status' });
  private readonly smokeText = h('div', { className: 'grenade-status' });
  private readonly flashText = h('div', { className: 'grenade-status' });
  private readonly flashOverlay = h('div', { className: 'flash-overlay' });
  private flashUntil = 0;
  private flashSeconds = 0;
  private flashStrength = 0;
  private readonly scoreBar = h('div', { className: 'score-bar' });
  private readonly timer = h('div', { className: 'match-timer' });
  private readonly elimination = h('div', { className: 'elimination' });
  private eliminationTimer = 0;
  private readonly killfeed = h('div', { className: 'killfeed' });
  private readonly buyHint = h('div', { className: 'buy-hint' });
  private readonly damageLayer = h('div', { className: 'damage-layer' });
  private readonly vignette = h('div', { className: 'damage-vignette' });
  private readonly bloodOverlay = h('div', { className: 'blood-overlay' });
  private readonly nearMiss = h('div', { className: 'near-miss' });
  private readonly deathOverlay = h('div', { className: 'death-overlay' });
  private readonly scope = h('div', { className: 'scope-overlay' }, h('div', { className: 'scope-lens' }));
  private hitmarkerTimer = 0;

  constructor() {
    this.bloodOverlay.style.backgroundImage = `url(${createBloodOverlayImage()})`;
    this.root = h(
      'div',
      { className: 'hud' },
      this.vignette,
      this.bloodOverlay,
      this.nearMiss,
      this.scope,
      this.damageLayer,
      this.crosshair,
      this.hitmarker,
      h('div', { className: 'top-center' }, this.scoreBar, this.timer, this.elimination),
      this.killfeed,
      this.buyHint,
      h('div', { className: 'health-box' }, h('div', { className: 'health-bar' }, this.healthFill), this.healthText),
      h(
        'div',
        { className: 'ammo-box' },
        this.weaponName,
        this.ammoText,
        this.reloadText,
        this.grenadeText,
        this.smokeText,
        this.flashText,
      ),
      this.flashOverlay,
      this.deathOverlay,
    );
  }

  setHealth(health: number, max: number): void {
    const ratio = Math.max(0, health / max);
    this.healthFill.style.width = `${ratio * 100}%`;
    this.healthFill.classList.toggle('low', ratio < 0.35);
    this.healthText.textContent = String(Math.ceil(health));
    // Modern-shooter style: the screen edges bleed red as health drops.
    this.vignette.style.opacity = String(Math.min(1, (1 - ratio) * 1.3));
    // Blood on the lens below 40 HP, getting heavier the closer to death.
    const bleeding = health > 0 && health < BLOOD_OVERLAY_HP;
    this.bloodOverlay.style.opacity = bleeding ? String(0.45 + 0.55 * (1 - health / BLOOD_OVERLAY_HP)) : '0';
  }

  setWeapon(name: string, mag: number, reloading: boolean): void {
    this.weaponName.textContent = name;
    this.ammoText.innerHTML = '';
    this.ammoText.append(
      h('span', { className: mag === 0 ? 'empty' : '', text: String(mag) }),
      h('small', { text: ' / ∞' }),
    );
    this.reloadText.style.visibility = reloading ? 'visible' : 'hidden';
  }

  setCrosshair(gapPx: number, visible: boolean): void {
    this.crosshair.style.setProperty('--gap', `${Math.min(80, 4 + gapPx)}px`);
    this.crosshair.style.opacity = visible ? '1' : '0';
  }

  showHitmarker(kill: boolean): void {
    this.hitmarker.className = `hitmarker show ${kill ? 'kill' : ''}`;
    clearTimeout(this.hitmarkerTimer);
    this.hitmarkerTimer = window.setTimeout(() => (this.hitmarker.className = 'hitmarker'), kill ? 350 : 180);
  }

  setScores(html: HTMLElement): void {
    this.scoreBar.replaceChildren(html);
  }

  setTimer(seconds: number): void {
    this.timer.textContent = formatTime(seconds);
  }

  addKill(
    killer: { name: string; team: Team },
    victim: { name: string; team: Team },
    weapon: string,
    headshot: boolean,
    mine: boolean,
  ): void {
    const entry = h(
      'div',
      { className: `kill-entry ${mine ? 'mine' : ''}` },
      h('span', { className: `team-${killer.team}`, text: killer.name }),
      h('span', { className: 'kill-weapon', text: `[${weapon}]` }),
      headshot ? h('span', { className: 'kill-headshot', text: '✜' }) : null,
      h('span', { className: `team-${victim.team}`, text: victim.name }),
    );
    this.killfeed.prepend(entry);
    while (this.killfeed.children.length > 6) this.killfeed.lastChild?.remove();
    setTimeout(() => entry.remove(), KILLFEED_MS);
  }

  /** Seconds until each grenade type is ready again (<= 0 = ready). */
  setGrenades(left: { frag: number; smoke: number; flash: number }): void {
    const line = (el: HTMLElement, key: string, label: string, seconds: number) => {
      const ready = seconds <= 0;
      el.textContent = ready ? `[${key}] ${label}` : `[${key}] ${label} ${Math.ceil(seconds)}s`;
      el.classList.toggle('ready', ready);
    };
    line(this.grenadeText, 'G', 'GRENADE', left.frag);
    line(this.smokeText, 'H', 'SMOKE', left.smoke);
    line(this.flashText, 'J', 'FLASH', left.flash);
  }

  /** Flashbanged: pure white, held briefly, then fading back over the remaining time. */
  flashBlind(strength: number, seconds: number): void {
    if (strength * seconds < this.flashStrength * Math.max(0, (this.flashUntil - performance.now()) / 1000)) return;
    this.flashStrength = strength;
    this.flashSeconds = seconds;
    this.flashUntil = performance.now() + seconds * 1000;
  }

  /**
   * Called every frame. Returns how blurred the view should be (0..1): the blur outlasts the white,
   * so vision comes back soft and slowly sharpens.
   */
  updateFlash(): number {
    const left = (this.flashUntil - performance.now()) / 1000;
    if (left <= 0) {
      this.flashOverlay.style.opacity = '0';
      return 0;
    }
    const t = left / this.flashSeconds; // 1 → 0
    // Always 100% white at first (strength only sets how long it lasts), then an eased fade.
    this.flashOverlay.style.opacity = String(Math.min(1, (t / 0.75) ** 2));
    return Math.min(1, t / 0.9) ** 1.2;
  }

  /** "ELIMINATED <name>" under the clock after we kill someone. */
  showElimination(name: string): void {
    this.elimination.replaceChildren(h('span', { text: 'ELIMINATED ' }), h('strong', { text: name }));
    // Restart the pop-in animation even if the previous message is still showing.
    this.elimination.classList.remove('show');
    void this.elimination.offsetWidth;
    this.elimination.classList.add('show');
    clearTimeout(this.eliminationTimer);
    this.eliminationTimer = window.setTimeout(() => this.elimination.classList.remove('show'), ELIMINATION_MS);
  }

  /** Brief dark vignette when a bullet whizzes past; closeness 0..1. */
  flashNearMiss(closeness: number): void {
    this.nearMiss.style.setProperty('--strength', String(0.35 + closeness * 0.45));
    this.nearMiss.classList.remove('show');
    void this.nearMiss.offsetWidth; // restart the animation
    this.nearMiss.classList.add('show');
  }

  setBuyHint(visible: boolean): void {
    this.buyHint.style.display = visible ? 'block' : 'none';
    this.buyHint.textContent = 'Press B to change weapons';
  }

  /** angle: where the damage came from relative to where we look (0 = in front, radians clockwise). */
  showDamage(angle: number): void {
    const arrow = h('div', { className: 'damage-arrow' });
    arrow.style.transform = `rotate(${angle}rad)`;
    this.damageLayer.append(arrow);
    setTimeout(() => arrow.remove(), DAMAGE_INDICATOR_MS);
  }

  showDeath(killerName: string, seconds: number): void {
    this.deathOverlay.replaceChildren(
      h('div', { className: 'death-title', text: 'KILLED BY' }),
      h('div', { className: 'death-killer', text: killerName }),
      h('div', { className: 'muted', text: `Respawning in ${Math.max(0, Math.ceil(seconds))}` }),
    );
    this.deathOverlay.style.display = 'flex';
  }

  hideDeath(): void {
    this.deathOverlay.style.display = 'none';
  }

  setScope(visible: boolean): void {
    this.scope.style.display = visible ? 'block' : 'none';
  }

  /** Blurs only the scope image (black ring and crosshair), not the world seen through it. */
  setScopeBlur(px: number): void {
    this.scope.style.filter = px > 0.1 ? `blur(${px.toFixed(2)}px)` : '';
  }
}
