// Locally synthesised fanfare: no downloaded tracks, external services, or audio files.
export default class CelebrationAudio {
  constructor() {
    this.context = null;
    this.output = null;
    this.voices = new Set();
    this.enabled = false;
  }

  async enable() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("Sound is unavailable in this browser.");
      this.context = new Context();
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.ratio.value = 8;
      this.output = this.context.createGain();
      this.output.gain.value = 0.32;
      this.output.connect(limiter);
      limiter.connect(this.context.destination);
    }
    await this.context.resume();
    if (this.context.state !== "running")
      throw new Error("Click Enable sound again to allow audio.");
    this.enabled = true;
  }

  track(source, end) {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
    };
    source.stop(end);
  }

  note(frequency, start, duration, volume = 0.1, type = "triangle") {
    const context = this.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.output);
    oscillator.start(start);
    this.track(oscillator, start + duration + 0.05);
  }

  play() {
    if (!this.enabled || this.context?.state !== "running") return;
    this.stop();
    const context = this.context;
    const start = context.currentTime + 0.03;
    // A soft rising rush, followed by a bass impact and ascending golden chimes.
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 1.3,
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = (Math.random() * 2 - 1) * 0.35;
    const rush = context.createBufferSource();
    rush.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(150, start);
    filter.frequency.exponentialRampToValueAtTime(4500, start + 0.85);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);
    rush.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    rush.start(start);
    this.track(rush, start + 1.3);
    this.note(65.41, start + 0.8, 1.5, 0.4, "sine");
    this.note(130.81, start + 0.8, 1.0, 0.18, "sine");
    [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach(
      (frequency, index) => {
        this.note(frequency, start + 0.85 + index * 0.11, 1.6, 0.1, "sine");
      },
    );
    // Three warm major chords and a long, shimmering finish.
    [
      [261.63, 329.63, 392],
      [349.23, 440, 523.25],
      [392, 493.88, 587.33],
      [261.63, 329.63, 392, 523.25],
    ].forEach((chord, index) => {
      const at = start + 1.6 + index * 0.65;
      chord.forEach((frequency) => {
        this.note(frequency, at, index === 3 ? 2.8 : 0.85, 0.09);
        this.note(
          frequency * 2,
          at + 0.015,
          index === 3 ? 2.5 : 0.8,
          0.035,
          "sine",
        );
      });
    });
  }

  stop() {
    for (const source of this.voices) {
      try {
        source.stop();
      } catch {
        /* An already-ended voice needs no action. */
      }
      source.disconnect();
    }
    this.voices.clear();
  }

  mute() {
    this.enabled = false;
    this.stop();
  }
  close() {
    this.mute();
    this.context?.close().catch(() => {});
  }
}
