import lionDanceUrl from "../assets/markus_lion_dance.mp3";

export default class CelebrationAudio {
  constructor() {
    this.context = null;
    this.buffer = null;
    this.loading = null;
    this.voices = new Set();
    this.enabled = false;
  }

  async load() {
    try {
      const response = await fetch(lionDanceUrl);
      if (!response.ok) throw new Error("Audio unavailable");
      return await this.context.decodeAudioData(await response.arrayBuffer());
    } catch {
      this.loading = null;
      throw new Error(
        "Lion dance audio could not load. Please try enabling sound again.",
      );
    }
  }

  async enable() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("Sound is unavailable in this browser.");
      this.context = new Context();
    }
    // Unlock playback directly from the Enable sound click, before loading the clip.
    await this.context.resume();
    if (this.context.state !== "running")
      throw new Error("Click Enable sound again to allow audio.");
    this.loading ||= this.load();
    this.buffer = await this.loading;
    this.enabled = this.context.state === "running";
  }

  play() {
    if (!this.enabled || !this.buffer || this.context?.state !== "running")
      return;
    this.stop();
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.context.destination);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
    };
    source.start();
  }

  stop() {
    for (const source of this.voices) {
      source.stop();
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
