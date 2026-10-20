import React, { type PropsWithChildren } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  type TextProps,
  type ViewStyle,
  type StyleProp,
  type ViewProps,
} from "react-native";
import { X, type LucideIcon } from "lucide-react-native";
import { colors as c, fonts } from "./theme";

export function Txt({ style, ...props }: TextProps) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: fonts.regular, color: c.ink, fontSize: 14 }, style]}
    />
  );
}
export function Eyebrow({
  children,
  color = c.muted,
}: PropsWithChildren<{ color?: string }>) {
  return (
    <Txt
      style={{ color, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bold }}
    >
      {children}
    </Txt>
  );
}
export function IconButton({
  icon: Icon,
  onPress,
  label,
  active = false,
  size = 19,
  disabled = false,
  style,
}: {
  icon: LucideIcon;
  onPress: () => void;
  label: string;
  active?: boolean;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        {
          width: 38,
          height: 38,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active
            ? c.lightGreen
            : hovered
              ? c.sidebar
              : "transparent",
          opacity: disabled ? 0.3 : pressed ? 0.65 : 1,
        },
        style,
      ]}
    >
      <Icon size={size} color={active ? c.green : c.muted} strokeWidth={1.7} />
    </Pressable>
  );
}
export function Button({
  children,
  onPress,
  icon: Icon,
  secondary = false,
  small = false,
  disabled = false,
  style,
  label,
}: PropsWithChildren<{
  onPress: () => void;
  icon?: LucideIcon;
  secondary?: boolean;
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        {
          borderRadius: 10,
          paddingHorizontal: small ? 14 : 20,
          paddingVertical: small ? 10 : 14,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 9,
          backgroundColor: secondary ? c.sidebar : c.green,
          opacity: disabled ? 0.4 : pressed ? 0.7 : hovered ? 0.9 : 1,
        },
        style,
      ]}
    >
      {Icon && (
        <Icon
          size={16}
          color={secondary ? c.green : "#fff"}
          strokeWidth={1.8}
        />
      )}
      <Txt
        style={{
          fontFamily: fonts.medium,
          color: secondary ? c.green : "#fff",
          fontSize: small ? 12 : 13,
        }}
      >
        {children}
      </Txt>
    </Pressable>
  );
}
export function Panel({
  children,
  style,
  onLayout,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps["onLayout"];
}>) {
  return (
    <View
      onLayout={onLayout}
      style={[
        {
          backgroundColor: c.paper,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: c.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Pill({
  children,
  active = false,
  onPress,
}: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered }) => ({
        paddingVertical: 8,
        paddingHorizontal: 13,
        borderRadius: 8,
        backgroundColor: active ? c.green : hovered ? c.sidebar : "transparent",
      })}
    >
      <Txt
        style={{
          color: active ? "#fff" : c.muted,
          fontSize: 12,
          fontFamily: fonts.medium,
        }}
      >
        {children}
      </Txt>
    </Pressable>
  );
}
export function Dialog({
  visible,
  onClose,
  title,
  children,
  width = 540,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title: string;
  width?: number;
}>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close dialog"
        />
        <View
          accessibilityViewIsModal
          style={[s.dialog, { width, maxWidth: "94%", maxHeight: "85%" }]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 22,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <Txt style={{ fontFamily: fonts.bold, fontSize: 18 }}>{title}</Txt>
            <IconButton icon={X} onPress={onClose} label="Close" />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export const inputStyle = {
  borderWidth: 1,
  borderColor: c.border,
  backgroundColor: c.bg,
  borderRadius: 10,
  padding: 14,
  fontFamily: fonts.regular,
  fontSize: 14,
  color: c.ink,
} as const;
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,36,24,.35)",
    padding: 12,
  },
  dialog: {
    backgroundColor: c.paper,
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 20px 100px rgba(25,35,20,.15)",
  },
});
