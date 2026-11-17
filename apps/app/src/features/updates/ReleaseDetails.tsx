import React from "react";
import { View } from "react-native";
import type { AppRelease } from "../../domain/app-updates";
import { useI18n } from "../../shared/i18n";
import { Txt } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
export function fileSize(bytes: number) {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function ReleaseDetails({ release }: { release: AppRelease }) {
  const { bi, locale } = useI18n();
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Txt
          accessibilityRole="header"
          style={{ fontSize: 26, fontFamily: fonts.medium }}
        >
          Selah {release.version}
        </Txt>
        <Txt style={{ color: c.muted, fontSize: 13, lineHeight: 21 }}>
          {bi("新版本", "New version")} ·{" "}
          {release.artifact
            ? fileSize(release.artifact.size)
            : release.channel === "testflight"
              ? "TestFlight"
              : bi("应用商店", "App Store")}
        </Txt>
      </View>
      <View style={{ height: 1, backgroundColor: c.border }} />
      <View style={{ gap: 12 }}>
        <Txt style={{ fontFamily: fonts.medium, fontSize: 15 }}>
          {bi("本次更新", "What's new")}
        </Txt>
        <Txt style={{ color: c.muted, lineHeight: 25 }}>
          {locale === "zh" ? release.notesZh : release.notesEn}
        </Txt>
      </View>
    </View>
  );
}
