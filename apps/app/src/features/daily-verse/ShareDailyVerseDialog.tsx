import React, { useEffect, useRef, useState, type ElementRef } from "react";
import { Image, Platform, View, useWindowDimensions } from "react-native";
import { Dialog, Button, Txt } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { colors } from "../../shared/theme";
import type {
  DailyVerseSharePayload,
  ShareImageFormat,
} from "../../domain/daily-verse-sharing";
import { DailyVerseShareArtwork } from "./DailyVerseShareArtwork";
import { prepareShareImage, type PreparedShareImage } from "./share-image";

export function ShareDailyVerseDialog({
  visible,
  onClose,
  payload,
}: {
  visible: boolean;
  onClose: () => void;
  payload: DailyVerseSharePayload | null;
}) {
  return visible && payload ? (
    <ShareDailyVerseDialogContent
      key={JSON.stringify(payload)}
      onClose={onClose}
      payload={payload}
    />
  ) : null;
}
function ShareDailyVerseDialogContent({
  onClose,
  payload,
}: {
  onClose: () => void;
  payload: DailyVerseSharePayload;
}) {
  const visible = true;
  const { bi } = useI18n();
  const { width, height } = useWindowDimensions();
  const captureRef = useRef<ElementRef<typeof View>>(null);
  const lock = useRef(false);
  const [format, setFormat] = useState<ShareImageFormat>("square");
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState<PreparedShareImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imageHeight = format === "square" ? 1080 : 1920;
  const previewWidth = Math.min(
    width - 80,
    format === "square" ? 340 : 230,
    Math.max(120, height * 0.85 - 318) * (1080 / imageHeight),
  );
  const scale = previewWidth / 1080;
  useEffect(() => {
    if (!visible || !payload || (Platform.OS !== "web" && !ready)) return;
    let cancelled = false;
    let result: PreparedShareImage | undefined;
    const frame = requestAnimationFrame(() => {
      void prepareShareImage(payload, format, captureRef)
        .then((value) => {
          result = value;
          if (cancelled) value.dispose();
          else setPrepared(value);
        })
        .catch((reason: unknown) => {
          if (!cancelled)
            setError(
              reason instanceof Error
                ? reason.message
                : bi(
                    "图片生成失败，请重试",
                    "Could not prepare image. Please retry.",
                  ),
            );
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      result?.dispose();
    };
  }, [visible, payload, format, ready, retry, bi]);
  const share = async () => {
    if (!prepared || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await prepared.share();
    } catch (reason: unknown) {
      if (!(reason instanceof Error && reason.name === "AbortError"))
        setError(
          reason instanceof Error
            ? reason.message
            : bi("分享失败，请重试", "Sharing failed. Please retry."),
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      visible={visible && payload !== null}
      title={bi("分享每日经文", "Share daily scripture")}
      onClose={onClose}
      dismissible={Platform.OS === "web" || !busy}
      presentation={width < 900 ? "bottom" : "center"}
      footer={
        <View style={{ padding: 16, gap: 10 }}>
          {error && (
            <Txt accessibilityLiveRegion="polite" style={{ color: colors.red }}>
              {error}
            </Txt>
          )}
          {error && !prepared && (
            <Button
              secondary
              onPress={() => {
                setError(null);
                setReady(false);
                setPrepared(null);
                setRetry((value) => value + 1);
              }}
            >
              {bi("重新生成图片", "Retry image")}
            </Button>
          )}
          {prepared?.save && (
            <Button secondary onPress={() => prepared.save?.()}>
              {bi("保存图片", "Save image")}
            </Button>
          )}
          <Button
            disabled={!prepared || busy}
            onPress={() => {
              void share();
            }}
          >
            {busy
              ? bi("正在分享…", "Sharing…")
              : prepared
                ? bi("分享图片", "Share image")
                : bi("正在生成图片…", "Preparing image…")}
          </Button>
        </View>
      }
    >
      {payload && (
        <View style={{ gap: 18, alignItems: "center" }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              secondary={format !== "square"}
              disabled={busy}
              onPress={() => {
                if (format !== "square") {
                  setPrepared(null);
                  setError(null);
                  setFormat("square");
                }
              }}
            >
              {bi("方形", "Square")} · 1:1
            </Button>
            <Button
              secondary={format !== "portrait"}
              disabled={busy}
              onPress={() => {
                if (format !== "portrait") {
                  setPrepared(null);
                  setError(null);
                  setFormat("portrait");
                }
              }}
            >
              {bi("竖版", "Portrait")} · 9:16
            </Button>
          </View>
          <View
            style={{
              width: previewWidth,
              height: imageHeight * scale,
              overflow: "hidden",
              borderRadius: 12,
              backgroundColor: colors.darkGreen,
            }}
          >
            {Platform.OS !== "web" && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 1080,
                  height: imageHeight,
                }}
              >
                <DailyVerseShareArtwork
                  key={`${payload.imageUri}-${retry}`}
                  payload={payload}
                  format={format}
                  captureRef={captureRef}
                  onReady={() => setReady(true)}
                  onError={() =>
                    setError(
                      bi(
                        "背景图片加载失败，请重试",
                        "Background image failed to load. Please retry.",
                      ),
                    )
                  }
                />
              </View>
            )}
            <View
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: colors.darkGreen,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {prepared ? (
                <Image
                  accessibilityLabel={bi(
                    "经文图片预览",
                    "Scripture image preview",
                  )}
                  source={{ uri: prepared.uri }}
                  style={{ width: previewWidth, height: imageHeight * scale }}
                />
              ) : (
                <Txt style={{ color: "#fff" }}>
                  {bi("正在生成图片…", "Preparing image…")}
                </Txt>
              )}
            </View>
          </View>
          <Txt style={{ color: colors.muted, fontSize: 12 }}>
            {format === "square" ? "1080 × 1080" : "1080 × 1920"} · PNG
          </Txt>
        </View>
      )}
    </Dialog>
  );
}
