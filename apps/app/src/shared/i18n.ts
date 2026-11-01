import { useMemo } from "react";
import { useAppStore } from "../state/app-store";
export function useI18n() {
  const locale = useAppStore((s) => s.locale);
  return useMemo(
    () => ({
      locale,
      bi: (zh: string, en: string) => (locale === "zh" ? zh : en),
    }),
    [locale],
  );
}
