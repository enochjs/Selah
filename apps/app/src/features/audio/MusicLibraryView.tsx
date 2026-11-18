import React, { type PropsWithChildren, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { IconButton, Txt } from "../../shared/ui";
import { useAudio } from "./AudioProvider";
import { NowPlayingButton } from "./NowPlayingButton";

export const libraryGutter = (width: number) => (width < 760 ? 20 : 32);

export function goBackToMusic() {
  if (router.canGoBack()) router.back();
  else router.replace("/music");
}

export function MusicLibraryView({ children }: PropsWithChildren) {
  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        maxWidth: 900,
        alignSelf: "center",
      }}
    >
      {children}
    </View>
  );
}

export function MusicLibraryHeader({
  title,
  count,
  back,
  action,
}: {
  title: string;
  count?: number | null;
  back?: true;
  action?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const { bi } = useI18n();
  const { colors: c } = useTheme();
  const { track } = useAudio();
  const scriptureControl = back && width < 900 && track?.kind === "scripture";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: back ? 4 : 8,
        paddingLeft: libraryGutter(width) - (back ? 12 : 0),
        paddingRight: libraryGutter(width),
        paddingVertical: back ? 4 : 12,
      }}
    >
      {back && (
        <IconButton
          icon={ChevronLeft}
          size={20}
          targetWidth={48}
          style={{ height: 48 }}
          label={bi("返回", "Back")}
          onPress={goBackToMusic}
        />
      )}
      <View
        style={[
          { flex: 1, minWidth: 0 },
          back && {
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "baseline",
            columnGap: 8,
            paddingRight: 8,
          },
        ]}
      >
        <Txt
          accessibilityRole="header"
          style={{
            fontFamily: fonts.medium,
            fontSize: back ? 20 : 28,
            lineHeight: back ? 26 : 36,
            paddingVertical: back ? 0 : 4,
            flexShrink: back ? 1 : undefined,
          }}
          numberOfLines={2}
        >
          {title}
        </Txt>
        {typeof count === "number" && (
          <Txt style={{ color: c.textMuted, fontSize: 12, lineHeight: 18 }}>
            {bi(`${count} 首`, count === 1 ? "1 song" : `${count} songs`)}
          </Txt>
        )}
      </View>
      {scriptureControl ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <NowPlayingButton scriptureOnly />
          {action}
        </View>
      ) : (
        action
      )}
    </View>
  );
}

export function MusicLibraryRow({
  title,
  label,
  detail,
  icon: Icon,
  onPress,
}: {
  title: string;
  label?: string;
  detail?: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: c.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.primarySoft,
        }}
      >
        <Icon size={19} strokeWidth={1.6} color={c.primaryStrong} />
      </View>
      <Txt style={{ flex: 1, minWidth: 0, fontSize: 16 }} numberOfLines={2}>
        {title}
      </Txt>
      {!!detail && (
        <Txt style={{ fontSize: 13, color: c.textMuted }}>{detail}</Txt>
      )}
      <ChevronRight aria-hidden size={16} color={c.textMuted} />
    </Pressable>
  );
}

export function MusicSection({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ gap: 8 }}>
      <Txt
        accessibilityRole="header"
        style={{ fontSize: 18, lineHeight: 26, fontFamily: fonts.medium }}
      >
        {title}
      </Txt>
      {children}
    </View>
  );
}
