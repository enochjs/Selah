import React from "react";
import { Pressable, View } from "react-native";
import {
  comparisonVersions,
  resolveComparisonVersion,
} from "../../data/reading-versions";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";
import { useAppStore } from "../../state/app-store";
import { SettingChoices } from "./SettingChoices";

export function ReadingComparisonSettings({
  onBeforeChange,
}: {
  onBeforeChange?: () => void;
}) {
  const { bi } = useI18n();
  const { colors: c } = useTheme();
  const primaryLocale = useAppStore((state) => state.primaryLocale);
  const enabled = useAppStore((state) => state.showTranslation);
  const savedId = useAppStore((state) => state.comparisonVersionId);
  const selected = resolveComparisonVersion(primaryLocale, savedId);
  const switchLabel = bi("开启对照", "Show comparison");
  const comparisonLabel = bi("对照语言", "Comparison language");

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={switchLabel}
        aria-checked={enabled}
        onPress={() => {
          onBeforeChange?.();
          useAppStore.getState().setShowTranslation(!enabled);
        }}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <Txt style={{ flex: 1, fontFamily: fonts.medium }}>{switchLabel}</Txt>
        <View
          style={{
            width: 44,
            height: 26,
            padding: 3,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: enabled ? c.primary : c.textMuted,
            backgroundColor: enabled ? c.primary : c.surfaceMuted,
            alignItems: enabled ? "flex-end" : "flex-start",
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: enabled ? c.surface : c.textMuted,
            }}
          />
        </View>
      </Pressable>
      {enabled && (
        <View style={{ gap: 8 }}>
          <Txt style={{ fontFamily: fonts.medium }}>{comparisonLabel}</Txt>
          <SettingChoices
            label={comparisonLabel}
            value={selected.id}
            options={comparisonVersions(primaryLocale).map(({ id, label }) => ({
              value: id,
              label,
            }))}
            stacked
            onChange={(id) => {
              if (id === selected.id) return;
              onBeforeChange?.();
              useAppStore.getState().setComparisonVersion(id);
            }}
          />
        </View>
      )}
    </View>
  );
}
