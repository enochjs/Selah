import React from "react";
import { View, ActivityIndicator } from "react-native";
import {
  ArrowDownToLine,
  Check,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react-native";
import type { UpdateSnapshot } from "../../domain/app-updates";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Button, Panel, Txt } from "../../shared/ui";
import { fileSize, ReleaseDetails } from "./ReleaseDetails";
import {
  updateError,
  updatePhaseText,
  updateProgress,
} from "./update-presentation";
export function UpdatePanel({
  state,
  onCheck,
  onDownload,
  onPause,
  onInstall,
  onPermission,
}: {
  state: UpdateSnapshot;
  onCheck(): void;
  onDownload(): void;
  onPause(): void;
  onInstall(): void;
  onPermission(): void;
}) {
  const { colors: c } = useTheme();
  const { bi, locale } = useI18n();
  const { release, installed, phase } = state;
  const unsupported = installed.platform === "web";
  const busy = ["downloading", "verifying", "installing"].includes(phase);
  const percentage = updateProgress(state);
  const required =
    !!release && installed.buildNumber < release.minSupportedBuild;
  const StatusIcon =
    phase === "current" ? Check : release ? ArrowDownToLine : Smartphone;
  return (
    <View style={{ gap: 24 }}>
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 12 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.primarySoft,
          }}
        >
          {state.checking ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <StatusIcon
              size={28}
              strokeWidth={1.5}
              color={c.primary}
              aria-hidden
            />
          )}
        </View>
        <Txt
          accessibilityRole="header"
          style={{
            fontSize: 21,
            textAlign: "center",
            fontFamily: fonts.medium,
          }}
        >
          {unsupported
            ? bi("始终与你，一同更新", "A little better, together")
            : state.checking
              ? bi("正在检查更新…", "Checking for updates…")
              : state.checkFailed
                ? bi("暂时无法检查更新", "Couldn't check for updates")
                : updatePhaseText(state, locale === "en")}
        </Txt>
        <Txt
          style={{
            color: c.textMuted,
            textAlign: "center",
            fontSize: 13,
            lineHeight: 21,
          }}
        >
          {bi("当前版本", "Installed version")} {installed.version}{" "}
          {installed.buildNumber > 0 ? `(${installed.buildNumber})` : ""}
        </Txt>
      </View>
      {state.checkFailed && (
        <Panel style={{ padding: 16, gap: 6 }}>
          <Txt style={{ color: c.textMuted, lineHeight: 23 }}>
            {bi(
              "请检查网络后重试，你仍可以继续使用当前版本。",
              "Check your connection and try again. You can keep using this version.",
            )}
          </Txt>
        </Panel>
      )}
      {release && (
        <Panel style={{ padding: 24, gap: 24 }}>
          {(required || release.importance === "important") && (
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: c.warmSurface,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
              }}
            >
              <Txt
                style={{
                  color: c.accentText,
                  fontSize: 12,
                  fontFamily: fonts.medium,
                }}
              >
                {required
                  ? bi("需要更新", "Update required")
                  : bi("重要更新", "Important update")}
              </Txt>
            </View>
          )}
          <ReleaseDetails release={release} />
          {required && (
            <Txt style={{ color: c.accentText, lineHeight: 23 }}>
              {bi(
                "当前版本已低于在线服务支持范围，请尽快更新。离线阅读资料会保留。",
                "This version is no longer supported by online services. Please update. Your offline reading is preserved.",
              )}
            </Txt>
          )}
          {release.artifact &&
            [
              "downloading",
              "paused",
              "verifying",
              "ready",
              "permission",
              "installing",
            ].includes(phase) && (
              <View style={{ gap: 10 }}>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={bi(
                    "更新下载进度",
                    "Update download progress",
                  )}
                  accessibilityValue={{ min: 0, max: 100, now: percentage }}
                  style={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: c.surfaceMuted,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${percentage}%`,
                      height: "100%",
                      backgroundColor: c.primary,
                    }}
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <Txt style={{ color: c.textMuted, fontSize: 12 }}>
                    {updatePhaseText(state, locale === "en")} · {percentage}%
                  </Txt>
                  <Txt style={{ color: c.textMuted, fontSize: 12 }}>
                    {fileSize(state.bytes)} / {fileSize(release.artifact.size)}
                  </Txt>
                </View>
              </View>
            )}
          {state.error && (
            <Txt
              accessibilityRole="alert"
              style={{ color: c.danger, lineHeight: 23 }}
            >
              {updateError(state.error, locale === "en")}
            </Txt>
          )}
          {phase === "permission" && (
            <Txt style={{ color: c.textMuted, lineHeight: 23 }}>
              {bi(
                "请在系统设置中允许 Selah 安装应用，返回后继续安装。无需开启其他权限。",
                "Allow installation from Selah in system settings, then return to continue.",
              )}
            </Txt>
          )}
          <View style={{ gap: 10 }}>
            {phase === "downloading" ? (
              <Button onPress={onPause} secondary style={{ minHeight: 48 }}>
                {bi("暂停下载", "Pause download")}
              </Button>
            ) : phase === "verifying" || phase === "installing" ? (
              <Button onPress={() => {}} disabled style={{ minHeight: 48 }}>
                {updatePhaseText(state, locale === "en")}
              </Button>
            ) : phase === "permission" ? (
              <>
                <Button onPress={onPermission} style={{ minHeight: 48 }}>
                  {bi("前往设置", "Open settings")}
                </Button>
                <Button onPress={onInstall} secondary style={{ minHeight: 48 }}>
                  {bi("已开启，继续安装", "Permission enabled · Continue")}
                </Button>
              </>
            ) : phase === "ready" ? (
              <Button
                onPress={onInstall}
                disabled={state.checking}
                style={{ minHeight: 48 }}
              >
                {bi("立即安装", "Install now")}
              </Button>
            ) : release.artifact ? (
              <Button
                onPress={onDownload}
                disabled={state.checking}
                style={{ minHeight: 48 }}
                icon={ArrowDownToLine}
              >
                {phase === "paused" ||
                (phase === "error" && state.error === "network")
                  ? bi("继续下载", "Resume download")
                  : phase === "error"
                    ? bi("重新下载", "Download again")
                    : bi("下载更新", "Download update")}
              </Button>
            ) : (
              <Button
                onPress={onInstall}
                disabled={state.checking}
                style={{ minHeight: 48 }}
              >
                {release.channel === "testflight"
                  ? bi("前往 TestFlight 更新", "Update in TestFlight")
                  : bi("前往应用商店更新", "Update in App Store")}
              </Button>
            )}
          </View>
        </Panel>
      )}
      {unsupported ? (
        <Txt
          style={{ color: c.textMuted, textAlign: "center", lineHeight: 24 }}
        >
          {bi(
            "网页版随网站发布更新。刷新页面即可加载最新内容；手机 App 可在这里检查并安装新版本。",
            "The web app updates with the website. Refresh to load the latest content; mobile apps can check for updates here.",
          )}
        </Txt>
      ) : (
        <Button
          onPress={onCheck}
          icon={RefreshCw}
          secondary
          disabled={state.checking || busy}
          style={{ minHeight: 48 }}
        >
          {state.checking
            ? bi("正在检查…", "Checking…")
            : bi("重新检查更新", "Check again")}
        </Button>
      )}
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 4 }}>
        <ShieldCheck
          size={18}
          strokeWidth={1.5}
          color={c.textMuted}
          aria-hidden
          style={{ marginTop: 2 }}
        />
        <Txt
          style={{ flex: 1, color: c.textMuted, fontSize: 12, lineHeight: 21 }}
        >
          {bi(
            "更新会保留你的收藏、学习记录和已下载音频。下载期间可继续阅读和聆听。",
            "Updates preserve your saved words, bookmarks and downloaded audio. Keep reading and listening while downloading.",
          )}
        </Txt>
      </View>
    </View>
  );
}
