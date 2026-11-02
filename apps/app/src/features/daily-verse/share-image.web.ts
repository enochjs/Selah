import type { ElementRef, RefObject } from "react";
import type { View } from "react-native";
import {
  layoutShareText,
  shareImageFilename,
  layoutShareAttribution,
  type DailyVerseSharePayload,
  type ShareImageFormat,
} from "../../domain/daily-verse-sharing";
export interface PreparedShareImage {
  uri: string;
  share: () => Promise<void>;
  save?: () => void;
  dispose: () => void;
}
export async function prepareShareImage(
  payload: DailyVerseSharePayload,
  format: ShareImageFormat,
  _ref: RefObject<ElementRef<typeof View> | null>,
): Promise<PreparedShareImage> {
  await document.fonts.ready;
  const response = await fetch(payload.imageUri);
  if (!response.ok)
    throw new Error("背景图片加载失败 / Could not load background image");
  const sourceUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = sourceUrl;
  try {
    await image.decode();
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("此浏览器无法生成图片 / Image export is unavailable");
  const measure = (text: string, size: number) => {
    context.font = `${size}px sans-serif`;
    return context.measureText(text).width;
  };
  const layout = layoutShareText(payload, format, measure);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const scale = Math.max(
    canvas.width / image.width,
    canvas.height / image.height,
  );
  context.drawImage(
    image,
    (canvas.width - image.width * scale) / 2,
    (canvas.height - image.height * scale) / 2,
    image.width * scale,
    image.height * scale,
  );
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(16,35,27,.18)");
  gradient.addColorStop(0.5, "rgba(16,35,27,.50)");
  gradient.addColorStop(1, "rgba(16,35,27,.82)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "top";
  const draw = (text: string, size: number, y: number, opacity = 1) => {
    context.fillStyle = `rgba(255,255,255,${opacity})`;
    context.font = `${size}px sans-serif`;
    context.fillText(text, 96, y);
  };
  draw("SELAH · 每日经文", 24, 90);
  layout.blocks.forEach((block, i) => {
    draw(
      i === 0 ? layout.primaryVersion : layout.secondaryVersion,
      20,
      block.y,
      0.8,
    );
    block.lines.forEach((line, j) =>
      draw(
        line,
        block.fontSize,
        block.y + 32 + j * block.lineHeight,
        block.secondary ? 0.88 : 1,
      ),
    );
  });
  draw(payload.reference, 28, canvas.height - 292);
  draw(`${payload.date} · Selah`, 22, canvas.height - 246, 0.8);
  const attribution = layoutShareAttribution(payload, format, measure);
  attribution.lines.forEach((line, i) =>
    draw(
      line,
      attribution.fontSize,
      attribution.y + i * attribution.lineHeight,
      0.7,
    ),
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("图片生成失败 / Could not create image")),
      "image/png",
    ),
  );
  const file = new File([blob], shareImageFilename(payload, format), {
    type: "image/png",
  });
  const uri = URL.createObjectURL(blob);
  const save = () => {
    // Independent URL lets browser navigation finish after dialog disposal.
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
  };
  return {
    uri,
    save,
    async share() {
      // The pending operation owns this File even when the preview is disposed.
      const capturedFile = file;
      if (navigator.canShare?.({ files: [capturedFile] })) {
        await navigator.share({
          files: [capturedFile],
          title: "Selah · 每日经文",
        });
      } else save();
    },
    dispose() {
      URL.revokeObjectURL(uri);
    },
  };
}
