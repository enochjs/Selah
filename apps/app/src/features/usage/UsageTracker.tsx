import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { usePathname } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useAudio } from "../audio/AudioProvider";
import { useHymnCatalog } from "../audio/useHymns";
import { usageClient } from "../../data/usage-runtime";
import {
  createUsageSampler,
  usagePages,
  type UsageSnapshot,
} from "../../domain/usage";

export function UsageTracker() {
  const pathname = usePathname();
  const audio = useAudio();
  const catalog = useHymnCatalog("zh");
  const page = usagePages.includes(pathname) ? pathname : "/";
  const track = audio.track;
  let listening: UsageSnapshot["listening"] = null;
  if (audio.playing && !audio.buffering && track) {
    if (track.kind === "scripture" && track.bookId && track.chapter)
      listening = {
        kind: "scripture",
        contentId: `${track.bookId}:${track.chapter}:${track.locale ?? "zh"}`,
      };
    else if (
      track.kind === "hymn" &&
      catalog.tracks.some((hymn) => hymn.id === track.id)
    )
      listening = { kind: "hymn", contentId: track.id };
  }
  const current = useRef({ page, listening });
  useEffect(() => {
    current.current = { page, listening };
  });
  const sampler = useRef<ReturnType<typeof createUsageSampler> | null>(null);
  useEffect(() => {
    const client = usageClient();
    const observer = createUsageSampler((event) => {
      void client.record(event);
    }, randomUUID);
    sampler.current = observer;
    const sample = (foreground = AppState.currentState === "active") =>
      observer.update({ ...current.current, foreground }, Date.now());
    sample();
    void client.flush();
    const observationTimer = setInterval(sample, 1000);
    const uploadTimer = setInterval(() => {
      sample();
      observer.flush(Date.now());
      void client.flush();
    }, 30000);
    const subscription = AppState.addEventListener("change", (state) => {
      sample(state === "active");
      observer.flush(Date.now());
      void client.flush();
    });
    return () => {
      sample(false);
      observer.flush(Date.now());
      sampler.current = null;
      clearInterval(observationTimer);
      clearInterval(uploadTimer);
      subscription.remove();
      void client.flush();
    };
  }, []);
  useEffect(() => {
    sampler.current?.update(
      { ...current.current, foreground: AppState.currentState === "active" },
      Date.now(),
    );
  }, [page, listening?.kind, listening?.contentId]);
  return null;
}
