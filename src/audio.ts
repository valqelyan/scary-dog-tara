type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambient!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private snapTimer = 22;
  private beatTimer = 0;
  private dripTimer = 1.5;

  /** Must be called from a user gesture (iOS blocks audio otherwise). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.ambient = ctx.createGain();
    this.ambient.connect(this.master);
    this.makeBuffers();
    this.startAmbient();
    void ctx.resume();
  }

  pause(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private makeBuffers(): void {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const r = Math.random() * 2 - 1;
      w[i] = r;
      last = (last + 0.02 * r) / 1.02;
      b[i] = last * 3.5;
    }
  }

  private startAmbient(): void {
    const ctx = this.ctx!;

    const layer = (type: BiquadFilterType, freq: number, gain: number, lfoHz: number, lfoDepth: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoHz;
      const lg = ctx.createGain();
      lg.gain.value = lfoDepth;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.ambient);
      src.start();
      lfo.start();
    };

    layer('lowpass', 520, 0.16, 0.07, 0.09);
    layer('bandpass', 1300, 0.05, 0.12, 0.04);

    for (const [freq, gain, type] of [
      [43, 0.06, 'sine'],
      [44.3, 0.06, 'sine'],
      [86.5, 0.012, 'triangle'],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.ambient);
      o.start();
    }
  }

  private out(node: AudioNode, pan: number, bus: AudioNode = this.master): void {
    const ctx = this.ctx!;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p).connect(bus);
    } else {
      node.connect(bus);
    }
  }

  private drip(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const pan = Math.random() * 2 - 1;
    const base = 900 + Math.random() * 1100;
    const vol = 0.04 + Math.random() * 0.07;
    for (const [delay, v] of [
      [0, 1],
      [0.13, 0.3],
    ] as const) {
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base * 1.8, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g);
      this.out(g, pan * (delay ? 0.8 : 1), this.ambient);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  private burst(opts: {
    type: BiquadFilterType;
    freq: number;
    vol: number;
    attack: number;
    decay: number;
    pan: number;
    delay?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = opts.type;
    f.frequency.value = opts.freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.vol, t + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.decay);
    src.connect(f).connect(g);
    this.out(g, opts.pan);
    src.start(t, Math.random() * 2, opts.attack + opts.decay + 0.05);
  }

  step(vol: number, pitch = 1, pan = 0): void {
    this.burst({ type: 'lowpass', freq: 800 * pitch, vol, attack: 0.012, decay: 0.16, pan });
    this.burst({ type: 'bandpass', freq: 2400 * pitch, vol: vol * 0.3, attack: 0.008, decay: 0.08, pan });
  }

  snap(vol = 1, pan = Math.random() * 2 - 1): void {
    this.burst({ type: 'highpass', freq: 2200, vol: 0.5 * vol, attack: 0.002, decay: 0.05, pan });
    if (Math.random() < 0.6) {
      this.burst({ type: 'highpass', freq: 1800, vol: 0.25 * vol, attack: 0.002, decay: 0.07, pan, delay: 0.11 });
    }
  }

  setAmbient(level: number): void {
    if (!this.ctx) return;
    this.ambient.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5);
  }

  private heartbeat(vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [delay, v] of [
      [0, 1],
      [0.17, 0.7],
    ] as const) {
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  scream(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 1.7;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 4);
    shaper.curve = curve;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.setValueAtTime(0.5, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    bp.connect(shaper).connect(g).connect(this.master);

    for (const f of [520, 783, 1180, 1750]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = (Math.random() - 0.5) * 60;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.45);
      o.frequency.exponentialRampToValueAtTime(f * 1.15, t + dur);
      o.connect(bp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }

    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(ng).connect(this.master);
    n.start(t);
    n.stop(t + 0.6);

    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 1);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.9, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    sub.connect(sg).connect(this.master);
    sub.start(t);
    sub.stop(t + 1.2);
  }

  growl(seconds: number, pan = 0.3, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const end = t + seconds;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(58, t);
    osc.frequency.linearRampToValueAtTime(48, end);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.Q.value = 4;

    const am = ctx.createGain();
    am.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 26;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(am.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.5 * vol, t + 0.5);
    env.gain.setValueAtTime(0.5 * vol, end - 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(lp).connect(am).connect(env);
    this.out(env, pan);

    const n = ctx.createBufferSource();
    n.buffer = this.white;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.09, t + 0.6);
    ng.gain.exponentialRampToValueAtTime(0.0001, end);
    n.connect(bp).connect(ng);
    this.out(ng, pan);

    osc.start(t);
    lfo.start(t);
    n.start(t);
    osc.stop(end + 0.1);
    lfo.stop(end + 0.1);
    n.stop(end + 0.1);
  }

  tick(dt: number, threat = 0): void {
    if (!this.ctx) return;
    if (threat > 0.05) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        this.heartbeat(0.2 + 0.55 * threat);
        this.beatTimer = 60 / (62 + 95 * threat);
      }
    }
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.drip();
      this.dripTimer = 0.4 + Math.random() * 2.4;
    }
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snap();
      this.snapTimer = 18 + Math.random() * 35;
    }
  }
}
