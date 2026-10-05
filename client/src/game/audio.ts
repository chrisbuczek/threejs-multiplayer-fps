import type { WeaponId } from '@mp-fps/shared';
import type * as THREE from 'three';

interface GunSound {
  /** Low-pass cutoff of the noise burst: lower = deeper boom. */
  cutoff: number;
  decay: number;
  thumpFrequency: number;
  volume: number;
}

const GUN_SOUNDS: Record<WeaponId, GunSound> = {
  ak47: { cutoff: 3200, decay: 0.22, thumpFrequency: 85, volume: 0.9 },
  m4a4: { cutoff: 4200, decay: 0.18, thumpFrequency: 100, volume: 0.8 },
  awp: { cutoff: 2200, decay: 0.7, thumpFrequency: 55, volume: 1.2 },
  shotgun: { cutoff: 1800, decay: 0.45, thumpFrequency: 60, volume: 1.1 },
  minigun: { cutoff: 3300, decay: 0.07, thumpFrequency: 50, volume: 1.1 },
  deagle: { cutoff: 2600, decay: 0.32, thumpFrequency: 70, volume: 1 },
};

/**
 * All sounds are synthesized with the Web Audio API (no audio files to download).
 * Remote sounds go through an HRTF panner, so you can hear where shots and steps come from.
 */
export class GameAudio {
  private readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private readonly noise: AudioBuffer;

  constructor(volume: number) {
    this.master.gain.value = volume;
    this.master.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Browsers only allow audio after a user gesture. */
  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(volume: number): void {
    this.master.gain.value = volume;
  }

  updateListener(position: THREE.Vector3, forward: THREE.Vector3): void {
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(position.x, t);
      l.positionY.setValueAtTime(position.y, t);
      l.positionZ.setValueAtTime(position.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(position.x, position.y, position.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /** position = null means it's our own gun (no panning, full volume). */
  gunshot(weaponId: WeaponId, position: THREE.Vector3 | null): void {
    const s = GUN_SOUNDS[weaponId];
    const t = this.ctx.currentTime;
    const out = this.output(position, s.volume);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(s.cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + s.decay);
    const noiseGain = this.envelope(t, 1, s.decay);
    noise.connect(filter).connect(noiseGain).connect(out);
    noise.start(t, Math.random() * 0.5, s.decay + 0.1);

    const thump = this.ctx.createOscillator();
    thump.frequency.setValueAtTime(s.thumpFrequency * 2, t);
    thump.frequency.exponentialRampToValueAtTime(s.thumpFrequency * 0.5, t + 0.15);
    thump.connect(this.envelope(t, 0.9, 0.18)).connect(out);
    thump.start(t);
    thump.stop(t + 0.2);

    // Echo tail: a quiet, darker repeat makes shots feel like they are outdoors.
    const echo = this.ctx.createBufferSource();
    echo.buffer = this.noise;
    const echoFilter = this.ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 700;
    echo
      .connect(echoFilter)
      .connect(this.envelope(t + 0.09, 0.18, 0.6))
      .connect(out);
    echo.start(t + 0.09, Math.random() * 0.3, 0.7);
  }

  footstep(position: THREE.Vector3 | null): void {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400 + Math.random() * 300;
    filter.Q.value = 1.2;
    src
      .connect(filter)
      .connect(this.envelope(t, 0.35, 0.08))
      .connect(this.output(position, 0.5));
    src.start(t, Math.random() * 0.8, 0.1);
  }

  hitmarker(kill: boolean): void {
    this.tone(kill ? 1400 : 2200, 0.05, 0.25, 'square');
    if (kill) this.tone(900, 0.12, 0.2, 'triangle', 0.04);
  }

  /** Played on every headshot we land: a deep boom followed by a wet splash. */
  headshotHit(): void {
    const t = this.ctx.currentTime;
    // Boom: falling sub-bass punch plus a muffled noise thump.
    const boom = this.ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(140, t);
    boom.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    boom.connect(this.envelope(t, 0.9, 0.45)).connect(this.master);
    boom.start(t);
    boom.stop(t + 0.5);
    const thump = this.ctx.createBufferSource();
    thump.buffer = this.noise;
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(600, t);
    low.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    thump
      .connect(low)
      .connect(this.envelope(t, 0.8, 0.35))
      .connect(this.master);
    thump.start(t, Math.random() * 0.5, 0.4);

    // Splash: a wet burst sweeping down, then a few scattered droplets.
    const splash = this.ctx.createBufferSource();
    splash.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(3200, t + 0.02);
    band.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    splash
      .connect(band)
      .connect(this.envelope(t + 0.02, 0.7, 0.4))
      .connect(this.master);
    splash.start(t + 0.02, Math.random() * 0.5, 0.45);
    for (let i = 0; i < 6; i++) {
      const at = t + 0.08 + Math.random() * 0.3;
      const drop = this.ctx.createBufferSource();
      drop.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.value = 1200 + Math.random() * 2500;
      drop
        .connect(f)
        .connect(this.envelope(at, 0.25 + Math.random() * 0.2, 0.05))
        .connect(this.master);
      drop.start(at, Math.random(), 0.07);
    }
  }

  headshot(): void {
    this.tone(2600, 0.35, 0.35, 'sine');
    this.tone(1950, 0.35, 0.25, 'sine', 0.05);
    // Crunchy low hit.
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    src
      .connect(f)
      .connect(this.envelope(t, 0.6, 0.15))
      .connect(this.master);
    src.start(t, 0, 0.2);
  }

  reload(): void {
    this.click(0.0, 1800);
    this.click(0.35, 1200);
    this.click(0.8, 2200);
  }

  dryFire(): void {
    this.click(0, 3000);
  }

  damageTaken(): void {
    this.tone(120, 0.15, 0.4, 'sine');
  }

  /** Deep boom with a long rumbling tail. */
  explosion(position: THREE.Vector3 | null): void {
    const t = this.ctx.currentTime;
    const out = this.output(position, 2.2);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    noise
      .connect(filter)
      .connect(this.envelope(t, 1, 1.6))
      .connect(out);
    noise.start(t, Math.random() * 0.3, 1.7);

    const boom = this.ctx.createOscillator();
    boom.frequency.setValueAtTime(110, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    boom.connect(this.envelope(t, 1, 0.7)).connect(out);
    boom.start(t);
    boom.stop(t + 0.75);
  }

  /**
   * Bullet whizzing past close to us: a fast, falling hiss from where it passed.
   * closeness: 0 (2.5 m away) .. 1 (grazed us).
   */
  bulletWhiz(position: THREE.Vector3, closeness: number): void {
    const t = this.ctx.currentTime;
    const duration = 0.34;
    const out = this.output(position, 1);
    // Main swoosh: a broad band of air sweeping down in pitch as the bullet passes.
    const air = this.ctx.createBufferSource();
    air.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(3800, t);
    band.frequency.exponentialRampToValueAtTime(550, t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.6 + closeness, t + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    air.connect(band).connect(gain).connect(out);
    air.start(t, Math.random() * 0.6, duration + 0.05);
    // Low "whoomp" of displaced air underneath.
    const body = this.ctx.createBufferSource();
    body.buffer = this.noise;
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(900, t);
    low.frequency.exponentialRampToValueAtTime(200, t + duration);
    body
      .connect(low)
      .connect(this.envelope(t + duration * 0.25, 0.35 + closeness * 0.4, duration * 0.75))
      .connect(out);
    body.start(t, Math.random() * 0.6, duration + 0.05);
  }

  flashlightClick(): void {
    this.click(0, 2600);
  }

  /** Flashbang: a very sharp, loud crack. */
  flashBang(position: THREE.Vector3 | null): void {
    const t = this.ctx.currentTime;
    const out = this.output(position, 2.4);
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noise;
    const high = this.ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 900;
    crack
      .connect(high)
      .connect(this.envelope(t, 1, 0.5))
      .connect(out);
    crack.start(t, Math.random() * 0.3, 0.6);
    const boom = this.ctx.createOscillator();
    boom.frequency.setValueAtTime(90, t);
    boom.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    boom.connect(this.envelope(t, 0.7, 0.3)).connect(out);
    boom.start(t);
    boom.stop(t + 0.35);
  }

  /** Tinnitus after being flashed: a high whine that fades over `seconds`, while the world goes muffled. */
  flashRinging(strength: number, seconds: number): void {
    const t = this.ctx.currentTime;
    const ring = this.ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = 3400 + Math.random() * 400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12 + strength * 0.25, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    ring.connect(gain).connect(this.ctx.destination);
    ring.start(t);
    ring.stop(t + seconds + 0.1);
    // Duck everything else, then let it come back.
    const master = this.master.gain;
    const volume = master.value;
    master.cancelScheduledValues(t);
    master.setValueAtTime(volume, t);
    master.linearRampToValueAtTime(volume * (1 - 0.8 * strength), t + 0.05);
    master.linearRampToValueAtTime(volume, t + seconds);
  }

  /** Pin pull and a soft whoosh when throwing. */
  grenadeThrow(): void {
    this.click(0, 3200);
    const t = this.ctx.currentTime + 0.05;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    src
      .connect(f)
      .connect(this.envelope(t, 0.25, 0.25))
      .connect(this.master);
    src.start(t, Math.random(), 0.3);
  }

  dispose(): void {
    void this.ctx.close();
  }

  private click(delay: number, frequency: number): void {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = frequency;
    f.Q.value = 4;
    src
      .connect(f)
      .connect(this.envelope(t, 0.5, 0.04))
      .connect(this.master);
    src.start(t, Math.random(), 0.06);
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType, delay = 0): void {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(this.envelope(t, volume, duration)).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private envelope(start: number, peak: number, decay: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    return gain;
  }

  private output(position: THREE.Vector3 | null, volume: number): AudioNode {
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(this.master);
    if (!position) return gain;
    const panner = new PannerNode(this.ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 4,
      maxDistance: 200,
      rolloffFactor: 1.2,
      positionX: position.x,
      positionY: position.y,
      positionZ: position.z,
    });
    panner.connect(gain);
    return panner;
  }
}
