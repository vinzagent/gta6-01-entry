// Vice Harbor radio: three synthesized stations, no audio files. Each station is a
// small procedural loop — a bass line, a chord pad and a hat pattern at its own tempo —
// sequenced live through the shared Web Audio context the SFX module already unlocked.
// Q cycles the stations; the current one is named on the HUD and remembered in the save.

export const STATIONS = [
  { name: 'NEON TIDE FM', genre: 'synthwave', bpm: 96, root: 110.0, wave: 'sawtooth', bass: [0, 0, 7, 0, 5, 0, 7, 10] },
  { name: 'PALM BEATS 88.5', genre: 'island groove', bpm: 112, root: 98.0, wave: 'triangle', bass: [0, 3, 5, 3, 0, 3, 7, 5] },
  { name: 'MIDNIGHT HARBOR', genre: 'lo night drive', bpm: 78, root: 87.31, wave: 'sine', bass: [0, 0, 3, 5, 0, 0, 10, 7] },
];

const SEMITONE = Math.pow(2, 1 / 12);

export class Radio {
  constructor(sfx) {
    this.sfx = sfx;
    this.index = 0;
    this.step = 0;
    this.timer = null;
    this.playing = false;
  }

  station() {
    return STATIONS[this.index % STATIONS.length];
  }

  /** Start the sequencer once the audio context exists; safe to call repeatedly. */
  start() {
    if (this.playing || !this.sfx.ctx) return;
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      this.playStep();
      const st = this.station();
      this.timer = window.setTimeout(tick, (60 / st.bpm / 2) * 1000);
    };
    tick();
  }

  stop() {
    this.playing = false;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Move to the next station and announce it; returns the new station record. */
  next() {
    this.index = (this.index + 1) % STATIONS.length;
    this.step = 0;
    return this.station();
  }

  setStation(i) {
    this.index = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    this.step = 0;
  }

  /** One eighth-note of the current station: bass on the pattern, a soft pad each bar. */
  playStep() {
    const ctx = this.sfx.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const st = this.station();
    const t = ctx.currentTime;
    const semis = st.bass[this.step % st.bass.length];
    const freq = st.root * Math.pow(SEMITONE, semis);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = st.wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain);
    gain.connect(this.sfx.master);
    osc.start(t);
    osc.stop(t + 0.26);
    if (this.step % 8 === 0) {
      // A detuned fifth above the root as a one-bar pad.
      const pad = ctx.createOscillator();
      const padGain = ctx.createGain();
      pad.type = 'triangle';
      pad.frequency.value = freq * 1.5;
      padGain.gain.setValueAtTime(0.0001, t);
      padGain.gain.exponentialRampToValueAtTime(0.028, t + 0.3);
      padGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      pad.connect(padGain);
      padGain.connect(this.sfx.master);
      pad.start(t);
      pad.stop(t + 1.7);
    }
    this.step += 1;
  }
}
