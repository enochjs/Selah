import React, { type PropsWithChildren, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Eyebrow, Panel, Txt } from "../../shared/ui";

export function HomeCard({
  label,
  action,
  children,
}: PropsWithChildren<{ label: string; action?: ReactNode }>) {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <Panel style={{ padding: width < 760 ? 20 : 24, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Eyebrow color={c.primary}>{label}</Eyebrow>
        </View>
        {action && (
          <View style={{ marginVertical: -12, marginRight: -12 }}>
            {action}
          </View>
        )}
      </View>
      {children}
    </Panel>
  );
}

export function HomeCardTitle({ children }: PropsWithChildren) {
  return (
    <Txt
      numberOfLines={2}
      style={{ fontFamily: fonts.medium, fontSize: 20, lineHeight: 28 }}
    >
      {children}
    </Txt>
  );
}
