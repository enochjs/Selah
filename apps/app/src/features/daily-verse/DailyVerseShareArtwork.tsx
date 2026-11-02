import React, { type Ref, type ElementRef } from "react";
import { Image, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  layoutShareText,
  layoutShareAttribution,
  type DailyVerseSharePayload,
  type ShareImageFormat,
} from "../../domain/daily-verse-sharing";

export function DailyVerseShareArtwork({
  payload,
  format,
  captureRef,
  onReady,
  onError,
}: {
  payload: DailyVerseSharePayload;
  format: ShareImageFormat;
  captureRef: Ref<ElementRef<typeof View>>;
  onReady: () => void;
  onError: () => void;
}) {
  const layout = layoutShareText(payload, format);
  const textStyle = { color: "#ffffff", fontFamily: undefined };
  const attribution = layoutShareAttribution(payload, format);
  return (
    <View
      ref={captureRef}
      collapsable={false}
      style={{
        width: 1080,
        height: layout.height,
        backgroundColor: "#18251e",
        overflow: "hidden",
      }}
    >
      <Image
        source={{ uri: payload.imageUri }}
        resizeMode="cover"
        onLoad={onReady}
        onError={onError}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: layout.height,
        }}
      />
      <LinearGradient
        colors={[
          "rgba(16,35,27,.18)",
          "rgba(16,35,27,.50)",
          "rgba(16,35,27,.82)",
        ]}
        style={{ position: "absolute", width: 1080, height: layout.height }}
      />
      <Text
        allowFontScaling={false}
        style={{
          ...textStyle,
          position: "absolute",
          top: 90,
          left: 96,
          fontSize: 24,
          letterSpacing: 5,
        }}
      >
        SELAH · 每日经文
      </Text>
      {layout.blocks.map((block, i) => (
        <View
          key={i}
          style={{ position: "absolute", left: 96, top: block.y, width: 888 }}
        >
          <Text
            allowFontScaling={false}
            style={{
              ...textStyle,
              fontSize: 20,
              opacity: 0.8,
              marginBottom: 12,
            }}
          >
            {i === 0 ? layout.primaryVersion : layout.secondaryVersion}
          </Text>
          {block.lines.map((line, j) => (
            <Text
              allowFontScaling={false}
              key={j}
              style={{
                ...textStyle,
                fontSize: block.fontSize,
                lineHeight: block.lineHeight,
                opacity: block.secondary ? 0.88 : 1,
              }}
            >
              {line || " "}
            </Text>
          ))}
        </View>
      ))}
      <Text
        allowFontScaling={false}
        style={{
          ...textStyle,
          position: "absolute",
          top: layout.height - 292,
          left: 96,
          fontSize: 28,
        }}
      >
        {payload.reference}
      </Text>
      <Text
        allowFontScaling={false}
        style={{
          ...textStyle,
          position: "absolute",
          top: layout.height - 246,
          left: 96,
          fontSize: 22,
          opacity: 0.8,
        }}
      >
        {payload.date} · Selah
      </Text>
      <View
        style={{
          position: "absolute",
          left: 96,
          top: attribution.y,
          width: attribution.width,
        }}
      >
        {attribution.lines.map((line, i) => (
          <Text
            allowFontScaling={false}
            key={i}
            style={{
              ...textStyle,
              opacity: 0.7,
              fontSize: attribution.fontSize,
              lineHeight: attribution.lineHeight,
            }}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}
