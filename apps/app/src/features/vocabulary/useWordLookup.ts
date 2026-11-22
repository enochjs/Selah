import { useEffect, useState } from "react";
import { lookupOffline } from "../../data/dictionary";
import { dictionaryLookup } from "../../data/dictionary-runtime";
import type { DictionaryEntry } from "../../domain/dictionary";
import { vocabularyWordId } from "../../domain/vocabulary";
import { useAppStore } from "../../state/app-store";

interface LookupState {
  id: string;
  attempt: number;
  entry: DictionaryEntry | null;
  status: "loading" | "found" | "missing" | "error";
}
export function useWordLookup(word: string, enabled = true, language = "en") {
  const id = vocabularyWordId(word, language);
  const local = lookupOffline(word, language);
  const [result, setResult] = useState<LookupState | null>(null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!word || !enabled) return;
    let active = true;
    if (lookupOffline(word, language)) return;
    void dictionaryLookup.lookup(word, language).then(
      (entry) => {
        if (active)
          setResult({
            id,
            attempt,
            entry,
            status: entry ? "found" : "missing",
          });
      },
      () => {
        if (active) setResult({ id, attempt, entry: null, status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [word, language, id, enabled, attempt]);
  // Changing words never flashes a previous result, including during review.
  const current: LookupState = local
    ? { id, attempt, entry: local, status: "found" }
    : result?.id === id && result.attempt === attempt
      ? result
      : { id, attempt, entry: null, status: "loading" };
  const meaning = current.entry?.meaning;
  useEffect(() => {
    if (!enabled || !meaning) return;
    const store = useAppStore.getState();
    const saved = store.words.find((entry) => entry.id === id);
    if (saved && !saved.meaning.trim()) store.updateMeaning(saved.id, meaning);
  }, [id, enabled, meaning]);
  return { ...current, retry: () => retry((n) => n + 1) };
}
