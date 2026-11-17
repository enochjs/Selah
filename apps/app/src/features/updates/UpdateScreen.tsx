import React, { useCallback, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import * as Network from "expo-network";
import { useFocusEffect } from "expo-router";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Button, Dialog, Txt } from "../../shared/ui";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { useAudio } from "../audio/AudioProvider";
import { useAppUpdates } from "./AppUpdatesProvider";
import { UpdatePanel } from "./UpdatePanel";
import { fileSize } from "./ReleaseDetails";
export function UpdateScreen() {
  const { colors: c } = useTheme();
  const { manager, state } = useAppUpdates();
  const { width } = useWindowDimensions();
  const { bi } = useI18n();
  const audio = useAudio();
  const notify = useAppStore((value) => value.notify);
  const [confirmation, setConfirmation] = useState<"data" | "install" | null>(
    null,
  );
  const [preparing, setPreparing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void manager.check();
    }, [manager]),
  );
  const startDownload = async () => {
    try {
      const network = await Network.getNetworkStateAsync();
      if (
        network.type === Network.NetworkStateType.NONE ||
        network.isConnected === false
      ) {
        notify(
          bi(
            "当前没有网络连接，请联网后继续。",
            "You're offline. Connect to resume the download.",
          ),
        );
      } else if (
        [
          Network.NetworkStateType.WIFI,
          Network.NetworkStateType.ETHERNET,
        ].includes(network.type!)
      )
        void manager.download();
      else setConfirmation("data");
    } catch {
      setConfirmation("data");
    }
  };
  const install = async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      await audio.prepareForUpdate();
      await manager.flush();
      setConfirmation(null);
      await manager.install();
    } catch {
      notify(
        bi(
          "暂时无法保存播放进度，请重试。",
          "Couldn't save your playback position. Try again.",
        ),
      );
    } finally {
      setPreparing(false);
    }
  };
  return (
    <>
      <ScrollView
        contentContainerStyle={{
          padding: width < 760 ? 20 : 35,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{ maxWidth: 520, width: "100%", alignSelf: "center", gap: 24 }}
        >
          <Txt
            accessibilityRole="header"
            style={{ fontFamily: fonts.medium, fontSize: 28 }}
          >
            {bi("应用更新", "App updates")}
          </Txt>
          <UpdatePanel
            state={state}
            onCheck={() => void manager.check()}
            onDownload={() => void startDownload()}
            onPause={() => manager.pause()}
            onInstall={() =>
              state.release?.artifact
                ? setConfirmation("install")
                : void install()
            }
            onPermission={() => void manager.openPermissionSettings()}
          />
        </View>
      </ScrollView>
      <Dialog
        visible={confirmation !== null}
        onClose={() => {
          if (!preparing) setConfirmation(null);
        }}
        dismissible={!preparing}
        title={
          confirmation === "data"
            ? bi("使用当前网络下载？", "Download on this connection?")
            : bi("准备安装更新", "Ready to install")
        }
        presentation={width < 600 ? "bottom" : "center"}
        width={440}
        footer={
          <View style={{ padding: 20, gap: 10 }}>
            <Button
              disabled={preparing}
              style={{ minHeight: 48 }}
              onPress={() => {
                if (confirmation === "data") {
                  setConfirmation(null);
                  void manager.download();
                } else void install();
              }}
            >
              {preparing
                ? bi("正在保存进度…", "Saving your place…")
                : confirmation === "data"
                  ? bi("继续下载", "Continue download")
                  : bi("继续安装", "Continue installation")}
            </Button>
            <Button
              secondary
              disabled={preparing}
              style={{ minHeight: 48 }}
              onPress={() => setConfirmation(null)}
            >
              {bi("稍后", "Not now")}
            </Button>
          </View>
        }
      >
        <Txt style={{ color: c.textMuted, lineHeight: 25 }}>
          {confirmation === "data"
            ? bi(
                `当前未连接到已确认的 Wi-Fi。完整更新包约 ${fileSize(state.release?.artifact?.size ?? 0)}，可能产生流量费用。`,
                `Wi-Fi has not been confirmed. The full update package is about ${fileSize(state.release?.artifact?.size ?? 0)}. Data charges may apply.`,
              )
            : bi(
                "安装期间 App 会关闭，正在播放的音频可能中断。我们会保存你的位置，更新后由你继续播放。请保留应用，直接覆盖安装。",
                "Installation closes the app and may interrupt playback. Your place will be saved for you to resume after updating. Install over the existing app.",
              )}
        </Txt>
      </Dialog>
    </>
  );
}
