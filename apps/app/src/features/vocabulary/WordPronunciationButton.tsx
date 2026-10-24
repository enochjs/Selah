import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Volume2, Square } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Speech from "expo-speech";
import {
  WordPronunciation,
  type PronunciationMode,
} from "../../domain/word-pronunciation";
import type { DictionaryEntry } from "../../domain/dictionary";
import { useAudio } from "../audio/AudioProvider";
import { useI18n } from "../../shared/i18n";
import { Button, Txt } from "../../shared/ui";
import { colors as c } from "../../shared/theme";

export function WordPronunciationButton({
  word,
  entry,
  compact = false,
}: {
  word: string;
  entry?: DictionaryEntry | null;
  compact?: boolean;
}) {
  return (
    <PronunciationControl
      key={word}
      word={word}
      entry={entry}
      compact={compact}
    />
  );
}
function PronunciationControl({
  word,
  entry,
  compact,
}: {
  word: string;
  entry?: DictionaryEntry | null;
  compact?: boolean;
}) {
  const { bi } = useI18n();
  const audio = useAudio();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const completion = useRef<((error?: Error) => void) | null>(null);
  const mounted = useRef(true);
  const [mode, setMode] = useState<PronunciationMode>("idle");
  const [error, setError] = useState(false);
  const [synthesized, setSynthesized] = useState<boolean | null>(null);
  const sessionRef = useRef<WordPronunciation | null>(null);
  useEffect(() => {
    mounted.current = true;
    function waitForVoice(start: (finish: (error?: Error) => void) => void) {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          player.pause();
          void Speech.stop().catch(() => {});
          finish(new Error("Voice unavailable"));
        }, 10000);
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          if (completion.current === finish) completion.current = null;
          if (error) reject(error);
          else resolve();
        };
        completion.current = finish;
        try {
          start(finish);
        } catch {
          finish(new Error("Voice unavailable"));
        }
      });
    }
    const session = new WordPronunciation({
      stop: async () => {
        completion.current?.(new Error("Stopped"));
        try {
          player.pause();
        } catch {
          /* The hook may already have released the player. */
        }
        await Speech.stop().catch(() => {});
      },
      playAudio: (url) =>
        waitForVoice(() => {
          player.replace({ uri: url });
          player.play();
        }),
      speak: (text) =>
        waitForVoice((finish) =>
          Speech.speak(text, {
            language: "en-US",
            rate: 0.85,
            onDone: () => finish(),
            onStopped: () => finish(),
            onError: () => finish(new Error("Speech unavailable")),
          }),
        ),
    });
    sessionRef.current = session;
    return () => {
      mounted.current = false;
      sessionRef.current = null;
      void session.stop().catch(() => {});
    };
  }, [player]);

  useEffect(() => {
    if (status.error) completion.current?.(new Error("Audio unavailable"));
    else if (status.didJustFinish) completion.current?.();
  }, [status.error, status.didJustFinish]);

  return (
    <View
      style={
        compact
          ? { alignItems: "center" }
          : { alignItems: "flex-start", gap: 6, marginTop: 14 }
      }
    >
      <Button
        small
        secondary
        style={
          compact
            ? {
                width: 44,
                height: 44,
                borderRadius: 22,
                paddingHorizontal: 0,
                paddingVertical: 0,
                gap: 0,
                backgroundColor: c.lightGreen,
              }
            : undefined
        }
        icon={mode === "idle" ? Volume2 : Square}
        label={
          mode === "idle"
            ? bi(`朗读单词 ${word}`, `Pronounce ${word}`)
            : bi(`停止朗读 ${word}`, `Stop pronouncing ${word}`)
        }
        onPress={() => {
          const session = sessionRef.current;
          if (!session) return;
          if (mode !== "idle") {
            void session.stop();
            setMode("idle");
            return;
          }
          if (audio.playing) audio.toggle();
          setError(false);
          void session
            .play(word, entry?.audioUrl, (next) => {
              if (!mounted.current) return;
              setMode(next);
              if (next !== "idle") setSynthesized(next === "synthetic");
            })
            .catch(() => {
              if (mounted.current) setError(true);
            });
        }}
      >
        {compact
          ? null
          : mode === "idle"
            ? bi("单词发音", "Pronounce")
            : bi("停止朗读", "Stop")}
      </Button>
      {(!compact || error) && (
        <Txt
          accessibilityLiveRegion="polite"
          style={{
            color: error ? c.red : c.muted,
            fontSize: 10,
            maxWidth: compact ? 90 : undefined,
            marginTop: compact ? 4 : 0,
          }}
        >
          {error
            ? compact
              ? bi("发音不可用，重试", "Voice unavailable, retry")
              : bi(
                  "发音暂不可用，请检查设备音量、静音模式与英语语音设置后重试。",
                  "Voice unavailable. Check volume, silent mode and English voice settings, then retry.",
                )
            : (synthesized ?? !entry?.audioUrl)
              ? bi("设备合成朗读", "Device synthesized speech")
              : bi("词典录音", "Dictionary recording")}
        </Txt>
      )}
    </View>
  );
}
