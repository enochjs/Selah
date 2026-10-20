// A new selection invalidates all pending media callbacks and play promises.
export function createAudioPreview(audio, onError = () => {}) {
  let generation = 0;
  let timer = null;
  let disposed = false;
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    audio.pause();
  }
  audio.onerror = () => {
    if (disposed) return;
    generation++;
    stop();
    onError("无法加载音频，请检查本地媒体文件是否齐备。");
  };
  return {
    async play(item) {
      if (disposed) return;
      const current = ++generation;
      stop();
      async function start() {
        if (disposed || current !== generation) return;
        audio.currentTime = item.start;
        try {
          await audio.play();
        } catch {
          if (!disposed && current === generation)
            onError("音频播放失败，请点击播放器重试。");
          return;
        }
        if (disposed || current !== generation) return;
        const ownTimer = setInterval(() => {
          if (disposed || current !== generation) {
            clearInterval(ownTimer);
            return;
          }
          if (audio.currentTime >= item.end) {
            audio.pause();
            clearInterval(ownTimer);
            if (timer === ownTimer) timer = null;
          }
        }, 50);
        timer = ownTimer;
      }
      if (audio.getAttribute("src") !== item.path || audio.readyState < 1) {
        audio.onloadedmetadata = start;
        audio.src = item.path;
        audio.load();
      } else await start();
    },
    dispose() {
      disposed = true;
      generation++;
      stop();
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
    },
  };
}
