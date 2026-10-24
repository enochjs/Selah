export type PronunciationMode = "idle" | "recording" | "synthetic";
interface PronunciationPort {
  stop: () => Promise<void>;
  playAudio: (url: string) => Promise<void>;
  speak: (word: string) => Promise<void>;
}

/** A superseded request must never start a delayed voice or a fallback. */
export class WordPronunciation {
  private generation = 0;
  constructor(private readonly port: PronunciationPort) {}
  async stop() {
    this.generation++;
    await this.port.stop();
  }
  async play(
    word: string,
    audioUrl: string | undefined,
    onMode: (mode: PronunciationMode) => void,
  ) {
    const generation = ++this.generation;
    await this.port.stop();
    if (generation !== this.generation) return;
    try {
      if (audioUrl) {
        onMode("recording");
        try {
          await this.port.playAudio(audioUrl);
          return;
        } catch {
          if (generation !== this.generation) return;
          await this.port.stop();
        }
      }
      if (generation !== this.generation) return;
      onMode("synthetic");
      await this.port.speak(word);
    } catch (error) {
      if (generation === this.generation) throw error;
    } finally {
      if (generation === this.generation) onMode("idle");
    }
  }
}
