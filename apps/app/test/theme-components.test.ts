import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";

vi.mock("react-native", () => {
  const flatten = (value: unknown): object =>
    Array.isArray(value)
      ? Object.assign({}, ...value.map(flatten))
      : (value ?? {});
  const View = ({ children, style }: PropsWithChildren<{ style?: object }>) =>
    React.createElement("div", { style: flatten(style) }, children);
  return {
    View,
    ImageBackground: View,
    Text: ({ children, style }: PropsWithChildren<{ style?: object }>) =>
      React.createElement("span", { style: flatten(style) }, children),
    Pressable: ({
      children,
      style,
    }: PropsWithChildren<{ style: (state: object) => object }>) =>
      React.createElement(
        "button",
        { style: flatten(style({ pressed: false, hovered: false })) },
        children,
      ),
    StyleSheet: { create: (value: object) => value, flatten },
  };
});
vi.mock("../src/shared/theme", () => ({
  fonts: {},
  images: {},
  typeScale: { caption: 12, label: 13, body: 14 },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
vi.mock("lucide-react-native", () => ({ Play: () => null, Pause: () => null }));
vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: PropsWithChildren) =>
    React.createElement("section", null, children),
}));
vi.mock("react-native-safe-area-context", () => ({}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({ track: null, playing: false }),
}));
vi.mock("../src/shared/use-dialog-motion", () => ({}));
vi.mock("../src/shared/use-dialog-viewport", () => ({}));
import { ThemeContext } from "../src/shared/theme-context";
import { themes } from "../src/shared/theme-palettes";
import { Button, Panel, Txt, inputStyle } from "../src/shared/ui";
import { FeaturedHymnCard } from "../src/features/audio/FeaturedHymnCard";

it.each(["olive", "mist", "night", "redemption"] as const)(
  "renders %s shared controls and featured song with matching theme foregrounds",
  (id) => {
    const theme = themes[id];
    const c = theme.colors;
    const track = {
      id: "hymn-1",
      title: "恩典",
      subtitle: "诗歌",
      kind: "hymn",
    } as AudioTrack;
    const html = renderToStaticMarkup(
      React.createElement(
        ThemeContext,
        { value: theme },
        React.createElement(
          Panel,
          null,
          React.createElement(Txt, null, "Theme"),
          React.createElement(Button, { onPress: () => {} }, "Play"),
        ),
      ),
    );
    expect(html).toContain(`background-color:${c.surface}`);
    expect(html).toContain(`color:${c.text}`);
    expect(html).toContain(`background-color:${c.primary}`);
    expect(html).toContain(`color:${c.onPrimary}`);
    expect(inputStyle(c)).toMatchObject({
      color: c.text,
      backgroundColor: c.background,
      borderColor: c.border,
    });
    const featured = renderToStaticMarkup(
      React.createElement(
        ThemeContext,
        { value: theme },
        React.createElement(FeaturedHymnCard, {
          track,
          queue: [track],
          compact: true,
        }),
      ),
    );
    expect(featured).toContain(`background-color:${c.surface}`);
    expect(featured).toContain(`color:${c.primary}`);
  },
);
