import React, { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, View, useWindowDimensions } from "react-native";
import { router, usePathname } from "expo-router";
import { useAudio } from "../audio/AudioProvider";
import { useI18n } from "../../shared/i18n";
import { Button, Dialog, Txt } from "../../shared/ui";
import { dialogActivity } from "../../shared/dialog-activity";
import { useTheme } from "../../shared/theme-context";
import { useAppUpdates } from "./AppUpdatesProvider";
import { ReleaseDetails } from "./ReleaseDetails";
export function UpdateReminder({ dialogOpen }: { dialogOpen: boolean }) {
  const { colors: c } = useTheme();
  const { manager, state } = useAppUpdates();
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { playing, buffering } = useAudio();
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(
    AppState.currentState === "active" || AppState.currentState === null,
  );
  const [navigate, setNavigate] = useState(false);
  const dialogs = useSyncExternalStore(
    dialogActivity.subscribe,
    dialogActivity.getSnapshot,
    dialogActivity.getSnapshot,
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) =>
      setActive(next === "active"),
    );
    return () => subscription.remove();
  }, []);
  const safe =
    active &&
    !dialogOpen &&
    dialogs === 0 &&
    !playing &&
    !buffering &&
    ["/", "/me"].includes(pathname);
  useEffect(() => {
    if (!safe || !state.release || !manager.canRemind()) return;
    const timer = setTimeout(() => {
      if (!manager.canRemind()) return;
      setVisible(true);
      void manager.markReminded().catch(() => {});
    }, 1600);
    return () => clearTimeout(timer);
  }, [safe, manager, state]);
  const close = () => {
    setVisible(false);
    void manager.defer().catch(() => {});
  };
  const release = state.release;
  const required =
    !!release && state.installed.buildNumber < release.minSupportedBuild;
  return (
    <Dialog
      visible={visible && safe && !!release}
      onClose={close}
      onDismiss={() => {
        if (navigate) {
          setNavigate(false);
          router.push("/updates");
        }
      }}
      trackActivity={false}
      title={
        required
          ? bi("需要更新", "Update required")
          : bi("发现新版本", "A new version is available")
      }
      width={440}
      presentation={width < 600 ? "bottom" : "center"}
      footer={
        <View style={{ padding: 20, gap: 10 }}>
          <Button
            style={{ minHeight: 48 }}
            onPress={() => {
              setNavigate(true);
              setVisible(false);
            }}
          >
            {bi("查看更新", "View update")}
          </Button>
          <Button secondary style={{ minHeight: 48 }} onPress={close}>
            {required
              ? bi("继续离线阅读", "Continue reading offline")
              : bi("稍后提醒", "Remind me later")}
          </Button>
          {release?.importance === "normal" &&
            state.installed.buildNumber >= release.minSupportedBuild && (
              <Button
                secondary
                style={{ minHeight: 48 }}
                onPress={() => {
                  setVisible(false);
                  void manager.skip().catch(() => {});
                }}
              >
                {bi("跳过此版本", "Skip this version")}
              </Button>
            )}
        </View>
      }
    >
      {release && <ReleaseDetails release={release} />}
      {required && (
        <Txt style={{ color: c.textMuted, lineHeight: 24, marginTop: 16 }}>
          {bi(
            "当前版本已停止使用在线服务，请更新后恢复。经文、学习记录和已下载音频仍可离线使用。",
            "Online services are paused for this version. Update to restore them. Scripture, learning records and downloaded audio remain available offline.",
          )}
        </Txt>
      )}
    </Dialog>
  );
}
