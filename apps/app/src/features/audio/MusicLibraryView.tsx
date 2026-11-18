import React, { type PropsWithChildren, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react-native";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { IconButton, Txt } from "../../shared/ui";

export const libraryGutter = (width: number) => (width < 760 ? 20 : 32);

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
  back,
  action,
}: {
  title: string;
  back?: true;
  action?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const { bi } = useI18n();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: libraryGutter(width),
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      {back && (
        <IconButton
          icon={ArrowLeft}
          targetWidth={48}
          label={bi("返回", "Back")}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/music")
          }
        />
      )}
      <Txt
        accessibilityRole="header"
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: fonts.medium,
          fontSize: back ? 22 : 28,
          lineHeight: back ? 30 : 36,
          paddingVertical: 4,
        }}
        numberOfLines={2}
      >
        {title}
      </Txt>
      {action}
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
