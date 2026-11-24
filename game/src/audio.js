// Synthesized sound effects: every noise in Vice Harbor comes from oscillators and one noise
// buffer through the Web Audio API, so the game ships no audio files and makes no requests.
// The context is created lazily on the first user gesture (browser autoplay rules), and in
// screenshot mode nothing here is ever constructed.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = null;
  }

  /** Build the context and the looping engine/siren voices. Safe to call on every gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: a detuned sawtooth pair through a lowpass, pitch and growl follow the throttle.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineSub = ctx.createOscillator();
    engineSub.type = 'square';
    engineSub.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineSub.start();

    // Siren: a square wave whose pitch flips between two tones while the police are close.
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 760;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenHigh = false;
    this.sirenFlip = window.setInterval(() => {
      if (!this.ctx || this.sirenGain.gain.value <= 0.001) return;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 980 : 720, this.ctx.currentTime, 0.03);
    }, 340);
  }

  /** Engine voice: level 0 silences it (on foot), otherwise pitch/growl track the speed. */
  setEngine(level, speedNorm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = level <= 0 ? 0 : 0.05 + speedNorm * 0.075;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 165, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speedNorm * 1500, t, 0.08);
  }

  /** Siren voice: loudness follows how close the nearest police car is. */
  setSiren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(Math.min(0.055, level * 0.055), this.ctx.currentTime, 0.15);
  }

  /** A short two-note chime for pickups and mission cash. */
  blip(base = 660) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [0, 0.07].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * (i === 0 ? 1 : 1.335);
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, t + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.22);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t + offset);
      osc.stop(t + offset + 0.25);
    });
  }

  /** The cha-ching of a finished mission: three quick rising notes. */
  cash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const at = t + i * 0.06;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.14, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(at);
      osc.stop(at + 0.32);
    });
  }

  /** A filtered noise burst for collisions; intensity 0..1 scales the thump. */
  crash(intensity) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.12 + intensity * 0.2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400 + intensity * 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.12 + intensity * 0.3;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  /** A pistol crack: a square blip pitched down hard over a breath of filtered noise. */
  shot() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.09);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.2;
    src.connect(noiseGain);
    noiseGain.connect(this.master);
    src.start(t);
  }

  /** A low two-tone sting when a run ends, busted or wasted. */
  sting() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [196, 155.56].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const at = t + i * 0.28;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.11, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(at);
      osc.stop(at + 0.55);
    });
  }
}
