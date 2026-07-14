// 程序化音效 + 微恐环境音（WebAudio）
const MUSIC_VOLUME_KEY = 'tomb_music_volume_v1';
const SFX_VOLUME_KEY = 'tomb_sfx_volume_v1';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class AudioFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private pistolShots: HTMLAudioElement[] = [];
  private pistolShotCursor: number = 0;
  private reloadClip: HTMLAudioElement | null = null;
  private stoneDoorOpenClip: HTMLAudioElement | null = null;
  private stoneDoorOpenLayer: HTMLAudioElement | null = null;
  private reloadToken: number = 0;
  private reloadLoopsLeft: number = 0;
  private readonly reloadFallbackDuration: number = 0.99;
  private musicStarted: boolean = false;
  private musicPausedByGame: boolean = false;
  private musicVolume: number = this.loadVolume(MUSIC_VOLUME_KEY, 0.55);
  private sfxVolume: number = this.loadVolume(SFX_VOLUME_KEY, 0.9);
  private droneOsc: OscillatorNode[] = [];
  private groanTimer: number = 6;
  private heartTimer: number = 0;

  constructor() {
    this.setupMusic();
    this.setupSfxSamples();
  }

  private loadVolume(key: string, fallback: number): number {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const v = parseFloat(raw);
      return Number.isFinite(v) ? clamp01(v) : fallback;
    } catch {
      return fallback;
    }
  }

  private saveVolume(key: string, value: number): void {
    try { localStorage.setItem(key, value.toFixed(2)); } catch {}
  }

  init(): void {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx!.createGain();
      this.master.gain.value = this.sfxVolume;
      this.master.connect(this.ctx!.destination);
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.setupMusic();
  }

  private setupMusic(): void {
    if (this.music) return;
    this.music = new Audio('assets/audio/BGM.mp3');
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = this.musicVolume;
  }

  private setupSfxSamples(): void {
    if (this.pistolShots.length <= 0) {
      for (let i = 0; i < 4; i++) {
        const shot = new Audio('assets/audio/pistol---one-shot_[cut_0sec].mp3');
        shot.preload = 'auto';
        shot.volume = this.sfxVolume;
        this.pistolShots.push(shot);
      }
    }
    if (!this.reloadClip) {
      this.reloadClip = new Audio('assets/audio/pistol-reload.mp3');
      this.reloadClip.preload = 'auto';
      this.reloadClip.volume = this.sfxVolume;
      this.reloadClip.load();
    }
    if (!this.stoneDoorOpenClip) {
      this.stoneDoorOpenClip = new Audio('assets/audio/stone-door-open.mp3');
      this.stoneDoorOpenClip.preload = 'auto';
      this.stoneDoorOpenClip.volume = this.stoneDoorVolume(1.35);
      this.stoneDoorOpenClip.load();
    }
    if (!this.stoneDoorOpenLayer) {
      this.stoneDoorOpenLayer = new Audio('assets/audio/stone-door-open.mp3');
      this.stoneDoorOpenLayer.preload = 'auto';
      this.stoneDoorOpenLayer.volume = this.stoneDoorVolume(0.72);
      this.stoneDoorOpenLayer.load();
    }
  }

  private stoneDoorVolume(multiplier: number): number {
    return clamp01(this.sfxVolume * multiplier);
  }

  getMusicVolume(): number { return this.musicVolume; }
  getSfxVolume(): number { return this.sfxVolume; }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp01(value);
    this.saveVolume(MUSIC_VOLUME_KEY, this.musicVolume);
    this.setupMusic();
    if (this.music) this.music.volume = this.musicVolume;
    if (this.musicVolume <= 0) {
      if (this.music && !this.music.paused) this.music.pause();
      return;
    }
    this.startAmbient();
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clamp01(value);
    this.saveVolume(SFX_VOLUME_KEY, this.sfxVolume);
    if (this.master) {
      this.master.gain.value = this.sfxVolume;
    }
    for (const shot of this.pistolShots) shot.volume = this.sfxVolume;
    if (this.reloadClip) this.reloadClip.volume = this.sfxVolume;
    if (this.stoneDoorOpenClip) this.stoneDoorOpenClip.volume = this.stoneDoorVolume(1.35);
    if (this.stoneDoorOpenLayer) this.stoneDoorOpenLayer.volume = this.stoneDoorVolume(0.72);
  }

  private beep(
    freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay: number = 0
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  // 噪声爆发（枪声主体）
  private noise(dur: number, vol: number, lowpass: number, delay: number = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  gunshot(): void {
    this.noise(0.16, 0.4, 2200);
    this.beep(160, 0.1, 'square', 0.16, 50);
  }
  pistolShot(): void {
    this.setupSfxSamples();
    const shot = this.pistolShots[this.pistolShotCursor % this.pistolShots.length];
    this.pistolShotCursor += 1;
    shot.volume = this.sfxVolume;
    shot.currentTime = 0;
    const pending = shot.play();
    if (pending) {
      pending.catch(() => this.gunshot());
    }
  }
  click(): void {
    this.beep(980, 0.035, 'square', 0.035, 720);
    this.beep(1320, 0.025, 'triangle', 0.025, undefined, 0.025);
  }
  dryFire(): void { this.beep(900, 0.04, 'square', 0.05); }
  private getReloadClipDuration(): number {
    if (this.reloadClip && Number.isFinite(this.reloadClip.duration) && this.reloadClip.duration > 0) {
      return this.reloadClip.duration;
    }
    return this.reloadFallbackDuration;
  }

  private stopReloadLoop(): void {
    this.reloadToken += 1;
    this.reloadLoopsLeft = 0;
    if (!this.reloadClip) return;
    this.reloadClip.onended = null;
    this.reloadClip.pause();
    try { this.reloadClip.currentTime = 0; } catch {}
  }

  reloadStart(reloadDuration: number = 0): void {
    this.setupSfxSamples();
    if (!this.reloadClip) {
      this.beep(500, 0.06, 'square', 0.07, 300);
      return;
    }
    this.stopReloadLoop();
    const clipDuration = this.getReloadClipDuration();
    const loops = reloadDuration > 0 ? Math.floor(reloadDuration / clipDuration) : 1;
    if (loops <= 0) return;
    const token = this.reloadToken;
    this.reloadLoopsLeft = loops;

    const playNext = (): void => {
      if (token !== this.reloadToken || !this.reloadClip || this.reloadLoopsLeft <= 0) {
        if (this.reloadClip) this.reloadClip.onended = null;
        return;
      }
      const clip = this.reloadClip;
      this.reloadLoopsLeft -= 1;
      clip.onended = playNext;
      clip.volume = this.sfxVolume;
      clip.pause();
      try { clip.currentTime = 0; } catch {}
      const pending = clip.play();
      if (pending) {
        pending.catch(() => {
          if (token === this.reloadToken) this.beep(500, 0.06, 'square', 0.07, 300);
        });
      }
    };

    playNext();
  }
  reloadEnd(): void {
    this.stopReloadLoop();
    this.beep(700, 0.05, 'square', 0.08);
    this.beep(1100, 0.06, 'square', 0.07, undefined, 0.07);
  }
  hit(): void { this.beep(220, 0.05, 'sawtooth', 0.07, 100); }
  headshot(): void {
    this.beep(1500, 0.07, 'square', 0.1, 2200);
    this.noise(0.08, 0.18, 4000);
  }
  zombieDie(): void { this.beep(120, 0.4, 'sawtooth', 0.12, 40); }
  zombieGroan(vol: number = 0.07): void {
    this.beep(75 + Math.random() * 40, 0.7, 'sawtooth', vol, 55);
  }
  bossRoar(): void {
    this.noise(0.75, 0.34, 320);
    this.beep(58, 0.9, 'sawtooth', 0.18, 32);
    this.beep(96, 0.55, 'square', 0.08, 45, 0.12);
  }
  thunderLike(): void {
    this.noise(0.22, 0.22, 1800);
    this.beep(88, 0.24, 'sawtooth', 0.12, 44);
    this.beep(1500, 0.08, 'square', 0.06, 620, 0.02);
  }
  meleeHit(): void {
    this.noise(0.12, 0.3, 800);
    this.beep(90, 0.2, 'sawtooth', 0.14, 45);
  }
  loot(): void { this.beep(880, 0.08, 'sine', 0.08, 1320); }
  coin(): void {
    this.beep(1180, 0.05, 'square', 0.05);
    this.beep(1560, 0.08, 'square', 0.05, undefined, 0.05);
  }
  doorRumble(): void {
    // 厚重石门拖动：长低频噪声 + 低鸣
    this.noise(1.4, 0.22, 220);
    this.beep(42, 1.5, 'sine', 0.16, 30);
    this.beep(55, 1.2, 'sawtooth', 0.05, 38, 0.1);
  }
  doorOpen(): void {
    this.setupSfxSamples();
    if (!this.stoneDoorOpenClip) {
      this.doorOpenFallback();
      return;
    }
    const clip = this.stoneDoorOpenClip;
    clip.volume = this.stoneDoorVolume(1.35);
    clip.pause();
    try { clip.currentTime = 0; } catch {}
    const pending = clip.play();
    if (pending) {
      pending.catch(() => this.doorOpenFallback());
    }
    if (this.stoneDoorOpenLayer) {
      const layer = this.stoneDoorOpenLayer;
      layer.volume = this.stoneDoorVolume(0.72);
      layer.pause();
      try { layer.currentTime = 0; } catch {}
      const layerPending = layer.play();
      if (layerPending) layerPending.catch(() => {});
    }
  }
  private doorOpenFallback(): void {
    this.noise(0.9, 0.22, 360);
    this.beep(48, 0.9, 'sine', 0.14, 32);
    this.noise(0.16, 0.12, 1800, 0.74);
  }
  searchTick(): void { this.beep(600, 0.03, 'square', 0.03); }
  altar(): void {
    this.beep(440, 0.3, 'sine', 0.09, 880);
    this.beep(660, 0.4, 'sine', 0.07, 1320, 0.15);
  }
  sanityHit(): void { this.beep(2300, 0.25, 'sine', 0.06, 200); }
  extractOk(): void {
    this.beep(523, 0.12, 'triangle', 0.1);
    this.beep(659, 0.12, 'triangle', 0.1, undefined, 0.12);
    this.beep(784, 0.12, 'triangle', 0.1, undefined, 0.24);
    this.beep(1046, 0.3, 'triangle', 0.12, undefined, 0.36);
  }
  death(): void { this.beep(300, 0.8, 'sawtooth', 0.14, 40); }
  heartbeat(): void {
    this.beep(55, 0.1, 'sine', 0.22, 40);
    this.beep(50, 0.12, 'sine', 0.18, 35, 0.18);
  }

  // 暗黑低音垫（持续环境音）
  startAmbient(): void {
    this.setupMusic();
    if (!this.music) return;
    if (this.musicPausedByGame || this.musicVolume <= 0) return;
    if (this.musicStarted && !this.music.paused) return;
    this.musicStarted = true;
    const pending = this.music.play();
    if (pending) {
      pending.catch(() => {
        this.musicStarted = false;
      });
    }
  }

  pauseAmbient(): void {
    this.musicPausedByGame = true;
    if (this.music && !this.music.paused) this.music.pause();
  }

  resumeAmbient(): void {
    this.musicPausedByGame = false;
    this.startAmbient();
  }

  // 每帧：低神智心跳（已去除随机远处低吼）
  updateAmbient(dt: number, sanityRatio: number): void {
    if (sanityRatio < 0.35) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 0.6 + sanityRatio * 1.6;
        this.heartbeat();
      }
    }
  }
}
