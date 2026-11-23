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
  const definitionLocale = useAppStore((state) => state.primaryLocale);
  const lookupId = `${definitionLocale}:${id}`;
  const local =
    definitionLocale === "zh" ? lookupOffline(word, language) : null;
  const hasOfflineEntry = local !== null;
  const [result, setResult] = useState<LookupState | null>(null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!word || !enabled || hasOfflineEntry) return;
    let active = true;
    void dictionaryLookup.lookup(word, language, definitionLocale).then(
      (entry) => {
        if (active)
          setResult({
            id: lookupId,
            attempt,
            entry,
            status: entry ? "found" : "missing",
          });
      },
      () => {
        if (active)
          setResult({ id: lookupId, attempt, entry: null, status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [
    word,
    language,
    lookupId,
    definitionLocale,
    enabled,
    attempt,
    hasOfflineEntry,
  ]);
  // Changing words never flashes a previous result, including during review.
  const current: LookupState = local
    ? { id: lookupId, attempt, entry: local, status: "found" }
    : result?.id === lookupId && result.attempt === attempt
      ? result
      : { id: lookupId, attempt, entry: null, status: "loading" };
  const meaning =
    current.entry?.language === definitionLocale
      ? current.entry.meaning
      : undefined;
  useEffect(() => {
    if (!enabled || !meaning) return;
    const store = useAppStore.getState();
    const saved = store.words.find((entry) => entry.id === id);
    if (saved && !saved.meaning.trim()) store.updateMeaning(saved.id, meaning);
  }, [id, enabled, meaning]);
  return { ...current, definitionLocale, retry: () => retry((n) => n + 1) };
}
