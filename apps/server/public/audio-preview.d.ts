export interface PreviewAudio {
  src: string;
  currentTime: number;
  readyState: number;
  onloadedmetadata: null | (() => void | Promise<void>);
  onerror: null | (() => void);
  pause(): void;
  load(): void;
  play(): Promise<void>;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
}
export function createAudioPreview(
  audio: PreviewAudio,
  onError?: (message: string) => void,
): {
  play(item: { path: string; start: number; end: number }): Promise<void>;
  dispose(): void;
};
