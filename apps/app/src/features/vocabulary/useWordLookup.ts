import { useEffect, useState } from "react";
import { lookupOffline } from "../../data/dictionary";
import { dictionaryLookup } from "../../data/dictionary-runtime";
import type { DictionaryEntry } from "../../domain/dictionary";
import { useAppStore } from "../../state/app-store";

interface LookupState {
  word: string;
  attempt: number;
  entry: DictionaryEntry | null;
  status: "loading" | "found" | "missing" | "error";
}
export function useWordLookup(word: string, enabled = true) {
  const local = lookupOffline(word);
  const [result, setResult] = useState<LookupState | null>(null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!word || !enabled) return;
    let active = true;
    if (lookupOffline(word)) return;
    void dictionaryLookup.lookup(word).then(
      (entry) => {
        if (active)
          setResult({
            word,
            attempt,
            entry,
            status: entry ? "found" : "missing",
          });
      },
      () => {
        if (active) setResult({ word, attempt, entry: null, status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [word, enabled, attempt]);
  // Changing words never flashes a previous result, including during review.
  const current: LookupState = local
    ? { word, attempt, entry: local, status: "found" }
    : result?.word === word && result.attempt === attempt
      ? result
      : { word, attempt, entry: null, status: "loading" };
  const meaning = current.entry?.meaning;
  useEffect(() => {
    if (!enabled || !meaning) return;
    const store = useAppStore.getState();
    const saved = store.words.find((entry) => entry.word === word);
    if (saved && !saved.meaning.trim()) store.updateMeaning(saved.id, meaning);
  }, [word, enabled, meaning]);
  return { ...current, retry: () => retry((n) => n + 1) };
}
