import React, { type Ref, type ElementRef } from "react";
import { Image, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  layoutShareText,
  shareImageGradient,
  type DailyVerseSharePayload,
  type ShareImageFormat,
} from "../../domain/daily-verse-sharing";
import { dailyVerseShareBackground } from "./share-background";

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
  return (
    <View
      ref={captureRef}
      collapsable={false}
      style={{
        width: layout.width,
        height: layout.height,
        backgroundColor: "#18251e",
        overflow: "hidden",
      }}
    >
      <Image
        source={dailyVerseShareBackground}
        resizeMode="cover"
        onLoad={onReady}
        onError={onError}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: layout.width,
          height: layout.height,
        }}
      />
      <LinearGradient
        colors={shareImageGradient}
        style={{
          position: "absolute",
          width: layout.width,
          height: layout.height,
        }}
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
          top: layout.referenceY,
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
          top: layout.dateY,
          left: 96,
          fontSize: 22,
          opacity: 0.8,
        }}
      >
        {payload.date} · Selah
      </Text>
    </View>
  );
}
