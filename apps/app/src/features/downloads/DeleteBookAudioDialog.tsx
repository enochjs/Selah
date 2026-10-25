import React from "react";
import { View, useWindowDimensions } from "react-native";
import { Trash2 } from "lucide-react-native";
import { useI18n } from "../../shared/i18n";
import { colors as c } from "../../shared/theme";
import { Button, Dialog, Txt } from "../../shared/ui";

interface DeleteBookAudioDialogProps {
  bookName: string | null;
  english: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}
export function DeleteBookAudioDialog({
  bookName,
  english,
  busy,
  error,
  onConfirm,
  onClose,
}: DeleteBookAudioDialogProps) {
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  return (
    <Dialog
      visible={bookName !== null}
      onClose={onClose}
      title={bi("删除书卷音频？", "Delete book audio?")}
      presentation={width < 900 ? "bottom" : "center"}
      dismissible={!busy}
      footer={
        <View
          style={{
            padding: 16,
            gap: 8,
            borderTopWidth: 1,
            borderColor: c.border,
          }}
        >
          <Button secondary disabled={busy} onPress={onClose}>
            {bi("保留音频", "Keep audio")}
          </Button>
          <Button
            icon={Trash2}
            disabled={busy}
            style={{ backgroundColor: c.red }}
            onPress={onConfirm}
          >
            {busy
              ? bi("正在删除…", "Deleting…")
              : bi("确认删除音频", "Delete audio")}
          </Button>
        </View>
      }
    >
      {bookName !== null && (
        <View style={{ gap: 20 }}>
          <Txt style={{ lineHeight: 24 }}>
            {bi(
              `将删除${bookName}已保存的${english ? "英文" : "中文"}音频，并移除此书卷的下载任务。以后可以重新下载。`,
              `Remove saved ${english ? "English" : "Chinese"} audio and download tasks for ${bookName}? You can download it again later.`,
            )}
          </Txt>
          <Txt style={{ color: c.muted, lineHeight: 22 }}>
            {bi(
              "经文、生词、收藏和学习记录会保留。",
              "Scripture, vocabulary, favorites, and learning history will be kept.",
            )}
          </Txt>
          {error && (
            <Txt
              accessibilityLiveRegion="polite"
              style={{ color: c.red, lineHeight: 22 }}
            >
              {error}
            </Txt>
          )}
        </View>
      )}
    </Dialog>
  );
}
