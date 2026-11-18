import React from "react";
import { View } from "react-native";
import { playbackRates } from "../../domain/playback";
import { readingFontSizes } from "../../domain/reading-appearance";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { Dialog, Txt } from "../../shared/ui";
import { useAppStore } from "../../state/app-store";
import { useAudio } from "../audio/AudioProvider";
import { SettingChoices } from "../settings/SettingChoices";

const contentModes = [
  { value: "zh", locale: "zh", translation: false },
  { value: "en", locale: "en", translation: false },
  { value: "zh-en", locale: "zh", translation: true },
  { value: "en-zh", locale: "en", translation: true },
] as const;
const speedOptions = playbackRates.map((value) => ({
  value,
  label: `${value}×`,
}));

export function ReaderSettingsDialog({
  visible,
  presentation,
  onClose,
  onBeforePreferenceChange,
}: {
  visible: boolean;
  presentation: "center" | "bottom";
  onClose: () => void;
  onBeforePreferenceChange: () => void;
}) {
  const { bi } = useI18n();
  const { rate, setRate } = useAudio();
  const primaryLocale = useAppStore((s) => s.primaryLocale);
  const showTranslation = useAppStore((s) => s.showTranslation);
  const fontSize = useAppStore((s) => s.fontSize);
  const lineHeight = useAppStore((s) => s.lineHeight);
  const contentValue = showTranslation
    ? primaryLocale === "zh"
      ? "zh-en"
      : "en-zh"
    : primaryLocale;
  const contentLabels = {
    zh: bi("仅中文", "Chinese only"),
    en: bi("仅英文", "English only"),
    "zh-en": bi("中文在上", "Chinese first"),
    "en-zh": bi("英文在上", "English first"),
  };
  const contentLabel = bi("内容显示", "Text display");
  const fontSizeLabel = bi("经文字号", "Text size");
  const spacingLabel = bi("经文行距", "Line spacing");
  const speedLabel = bi("播放速度", "Playback speed");

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={bi("阅读设置", "Reading settings")}
      presentation={presentation}
      width={440}
      bodyStyle={{ gap: 16, paddingHorizontal: 16 }}
    >
      <View style={{ gap: 8 }}>
        <Txt style={{ fontFamily: fonts.medium }}>{contentLabel}</Txt>
        <SettingChoices
          label={contentLabel}
          value={contentValue}
          options={contentModes.map(({ value }) => ({
            value,
            label: contentLabels[value],
          }))}
          onChange={(value) => {
            const mode = contentModes.find((mode) => mode.value === value);
            if (!mode || value === contentValue) return;
            onBeforePreferenceChange();
            useAppStore
              .getState()
              .setReadingContent(mode.locale, mode.translation);
          }}
        />
      </View>
      <View style={{ gap: 8 }}>
        <Txt style={{ fontFamily: fonts.medium }}>{fontSizeLabel}</Txt>
        <SettingChoices
          label={fontSizeLabel}
          value={fontSize}
          options={readingFontSizes.map((size) => ({
            value: size,
            label: String(size),
          }))}
          onChange={(size) => {
            if (size === fontSize) return;
            onBeforePreferenceChange();
            useAppStore.getState().setFontSize(size);
          }}
        />
      </View>
      <View style={{ gap: 8 }}>
        <Txt style={{ fontFamily: fonts.medium }}>{spacingLabel}</Txt>
        <SettingChoices
          label={spacingLabel}
          value={lineHeight}
          options={[
            { value: 1.4, label: bi("紧凑", "Compact") },
            { value: 1.6, label: bi("标准", "Standard") },
            { value: 1.8, label: bi("宽松", "Relaxed") },
          ]}
          onChange={(spacing) => {
            if (spacing === lineHeight) return;
            onBeforePreferenceChange();
            useAppStore.getState().setLineHeight(spacing);
          }}
        />
      </View>
      <View style={{ gap: 8 }}>
        <Txt style={{ fontFamily: fonts.medium }}>{speedLabel}</Txt>
        <SettingChoices
          label={speedLabel}
          value={rate}
          options={speedOptions}
          onChange={setRate}
        />
      </View>
    </Dialog>
  );
}
