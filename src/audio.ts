// 程序化音效 + 微恐环境音（WebAudio）
export class AudioFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneOsc: OscillatorNode[] = [];
  private groanTimer: number = 6;
  private heartTimer: number = 0;

  init(): void {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx!.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx!.destination);
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
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
  dryFire(): void { this.beep(900, 0.04, 'square', 0.05); }
  reloadStart(): void { this.beep(500, 0.06, 'square', 0.07, 300); }
  reloadEnd(): void {
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
    this.noise(0.4, 0.12, 500);
    this.beep(70, 0.45, 'sine', 0.1, 45);
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
    // 已移除背景音乐（低频持续drone），仅保留事件音效与氛围音
    return;
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
