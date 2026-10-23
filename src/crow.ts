export interface CawOptions {
  /** 1 is an average carrion crow; lower is bigger and rougher. */
  pitch?: number;
  /** Seconds. */
  length?: number;
  volume?: number;
  /** -1 left, 1 right. */
  pan?: number;
  /** 0 close, 1 far: far caws are duller. */
  distance?: number;
}

function bandpass(ctx: BaseAudioContext, freq: number, q: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/**
 * One harsh "kraa": a sawtooth that rises then falls, roughened by a fast amplitude wobble and shaped
 * by two vowel-like formants, with a little breath on top.
 */
export function caw(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, start: number, o: CawOptions = {}): void {
  const { pitch = 1, length = 0.4, volume = 0.3, pan = 0, distance = 0 } = o;
  const t = start;
  const end = t + length;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(430 * pitch, t);
  osc.frequency.linearRampToValueAtTime(560 * pitch, t + length * 0.2);
  osc.frequency.exponentialRampToValueAtTime(330 * pitch, end);

  // The rasp: the voice flutters in and out around 60-90 times a second.
  const rasp = ctx.createGain();
  rasp.gain.value = 0.65;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 62 + Math.random() * 30;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.35;
  lfo.connect(lfoDepth).connect(rasp.gain);
  osc.connect(rasp);

  const mix = ctx.createGain();
  rasp.connect(bandpass(ctx, 950 * pitch, 3.5)).connect(mix);
  const upper = ctx.createGain();
  upper.gain.value = 0.6;
  rasp.connect(bandpass(ctx, 2200, 4)).connect(upper).connect(mix);

  const breath = ctx.createBufferSource();
  breath.buffer = noise;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.18;
  breath.connect(bandpass(ctx, 1700, 1.2)).connect(breathGain).connect(mix);

  // The formant filters take a lot of level out, so `volume` is scaled up to roughly match its peak.
  const peak = volume * 2.8;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.03);
  env.gain.setValueAtTime(peak * 0.9, t + length * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 7000 - distance * 5200;

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;

  mix.connect(env).connect(lowpass).connect(panner).connect(out);

  osc.start(t);
  lfo.start(t);
  breath.start(t, Math.random() * 2);
  for (const node of [osc, lfo, breath]) node.stop(end + 0.05);
}

/** One crow calling: one to four caws in a row, each a little different. */
export function crowCalls(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, start: number, o: CawOptions & { count?: number } = {}): number {
  const count = o.count ?? 1 + Math.floor(Math.random() * 3);
  const pitch = o.pitch ?? 0.85 + Math.random() * 0.4;
  let t = start;
  for (let i = 0; i < count; i++) {
    const length = (o.length ?? 0.3 + Math.random() * 0.2) * (i === count - 1 ? 1.1 : 1);
    caw(ctx, out, noise, t, { ...o, pitch: pitch * (1 - i * 0.03), length, volume: (o.volume ?? 0.3) * (1 - i * 0.12) });
    t += length + 0.12 + Math.random() * 0.2;
  }
  return t - start;
}

/** Several crows at once, scattered across the stereo field and a couple of seconds, each calling its own. */
export function crowFlock(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, start: number, crows: number, volume = 0.25): void {
  const side = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < crows; i++) {
    crowCalls(ctx, out, noise, start + Math.random() * 1.3, {
      volume: volume * (0.6 + Math.random() * 0.5),
      pan: Math.max(-1, Math.min(1, side * 0.3 + (Math.random() * 2 - 1) * 0.7)),
      distance: 0.15 + Math.random() * 0.5,
    });
  }
}
