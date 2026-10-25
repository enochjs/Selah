import React, { type PropsWithChildren, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  type TextProps,
  type ViewStyle,
  type StyleProp,
  type ViewProps,
} from "react-native";
import { X, type LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "./i18n";
import { colors as c, fonts, typeScale } from "./theme";
import { useDialogViewport } from "./use-dialog-viewport";
import { useDialogMotion } from "./use-dialog-motion";

export function Txt({ style, ...props }: TextProps) {
  return (
    <Text
      {...props}
      style={[
        { fontFamily: fonts.regular, color: c.ink, fontSize: typeScale.body },
        style,
      ]}
    />
  );
}
export function Eyebrow({
  children,
  color = c.muted,
}: PropsWithChildren<{ color?: string }>) {
  return (
    <Txt
      style={{
        color,
        fontSize: typeScale.caption,
        letterSpacing: 2,
        fontFamily: fonts.bold,
      }}
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
  fillActive = false,
  visualSize,
  size = 19,
  disabled = false,
  style,
}: {
  icon: LucideIcon;
  onPress: () => void;
  label: string;
  active?: boolean;
  fillActive?: boolean;
  visualSize?: number;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dimensions = StyleSheet.flatten(style);
  const icon = (
    <Icon
      size={size}
      color={active ? c.paper : c.muted}
      fill={active && fillActive ? c.paper : "none"}
      strokeWidth={1.7}
    />
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active
            ? visualSize
              ? "transparent"
              : c.green
            : hovered
              ? c.sidebar
              : "transparent",
          opacity: disabled ? 0.3 : pressed ? 0.65 : 1,
        },
        style,
        {
          width: Math.max(
            44,
            typeof dimensions?.width === "number" ? dimensions.width : 44,
          ),
          height: Math.max(
            44,
            typeof dimensions?.height === "number" ? dimensions.height : 44,
          ),
          minWidth: 44,
          minHeight: 44,
          flexShrink: 0,
        },
      ]}
    >
      {visualSize ? (
        <View
          pointerEvents="none"
          style={{
            width: visualSize,
            height: visualSize,
            borderRadius: visualSize / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: active ? c.green : "transparent",
          }}
        >
          {icon}
        </View>
      ) : (
        icon
      )}
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
          fontSize: small ? typeScale.label : typeScale.body,
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
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ hovered }) => ({
        minHeight: 44,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 13,
        borderRadius: 8,
        backgroundColor: active ? c.green : hovered ? c.sidebar : "transparent",
      })}
    >
      <Txt
        style={{
          color: active ? "#fff" : c.muted,
          fontSize: typeScale.label,
          fontFamily: fonts.medium,
        }}
      >
        {children}
      </Txt>
    </Pressable>
  );
}
export interface DialogHeaderControls {
  onClose: () => void;
  dismissible: boolean;
}

export function Dialog({
  visible,
  onClose,
  title,
  children,
  width = 540,
  presentation = "center",
  scrollable = true,
  header,
  footer,
  bodyStyle,
  keyboardAware = false,
  onDismiss,
  heightMode = "content",
  dismissible = true,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  presentation?: "center" | "bottom";
  scrollable?: boolean;
  header?: ReactNode | ((controls: DialogHeaderControls) => ReactNode);
  footer?: ReactNode;
  bodyStyle?: StyleProp<ViewStyle>;
  keyboardAware?: boolean;
  onDismiss?: () => void;
  heightMode?: "content" | "large";
  dismissible?: boolean;
}>) {
  const { bi } = useI18n();
  const insets = useSafeAreaInsets();
  const close = () => {
    if (dismissible) onClose();
  };
  const motion = useDialogMotion(visible, presentation === "bottom", onDismiss);
  const viewport = useDialogViewport(motion.modalVisible, keyboardAware);
  return (
    <Modal
      visible={motion.modalVisible}
      transparent
      accessibilityLabel={title}
      animationType="none"
      onRequestClose={close}
      onShow={motion.onShow}
      onDismiss={motion.onDismiss}
    >
      <KeyboardAvoidingView
        enabled={keyboardAware}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          s.overlay,
          presentation === "bottom" && {
            justifyContent: "flex-end",
            padding: 0,
          },
          viewport,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[s.backdrop, motion.backdropStyle]}
        />
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => dismissible}
          onResponderRelease={close}
          accessible={false}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            s.dialog,
            { width, maxWidth: "94%", maxHeight: "85%" },
            heightMode === "large" && { height: "82%" },
            presentation === "bottom" && {
              width: "100%",
              maxWidth: "100%",
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              paddingBottom: insets.bottom,
            },
            motion.panelStyle,
          ]}
        >
          {(typeof header === "function"
            ? header({ onClose: close, dismissible })
            : header) ?? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 8,
                flexShrink: 0,
                gap: 8,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            >
              <Txt
                accessibilityRole="header"
                style={{ fontFamily: fonts.bold, fontSize: 18, flex: 1 }}
              >
                {title}
              </Txt>
              <IconButton
                icon={X}
                onPress={close}
                disabled={!dismissible}
                label={bi("关闭", "Close")}
              />
            </View>
          )}
          {scrollable ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
              contentContainerStyle={[
                { paddingHorizontal: 20, paddingVertical: 16 },
                bodyStyle,
              ]}
            >
              {children}
            </ScrollView>
          ) : (
            <View
              style={[
                { flexShrink: 1, minHeight: 0 },
                {
                  flexGrow: heightMode === "large" ? 1 : 0,
                  flexBasis: heightMode === "large" ? 0 : "auto",
                },
                bodyStyle,
              ]}
            >
              {children}
            </View>
          )}
          {footer && <View style={{ flexShrink: 0 }}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
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
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(26,36,24,.35)",
  },
  dialog: {
    backgroundColor: c.paper,
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 20px 100px rgba(25,35,20,.15)",
  },
});
