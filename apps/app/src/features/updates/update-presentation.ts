import type {
  UpdateFailureCode,
  UpdateSnapshot,
} from "../../domain/app-updates";
export function updateProgress(state: UpdateSnapshot) {
  const total = state.release?.artifact?.size ?? 0;
  return total > 0 ? Math.min(100, Math.floor((state.bytes / total) * 100)) : 0;
}
export function updateError(code: UpdateFailureCode, english: boolean) {
  const messages: Record<UpdateFailureCode, [string, string]> = {
    network: [
      "下载中断，请检查网络后继续下载。",
      "Download interrupted. Check your connection and resume.",
    ],
    storage: [
      "存储空间不足或暂时无法保存，请释放空间后重试。",
      "Unable to save. Free up storage and try again.",
    ],
    integrity: [
      "安装包校验未通过，请重新下载。",
      "Package verification failed. Download it again.",
    ],
    incompatible: [
      "此安装包与当前应用不兼容，暂时无法安装。",
      "This package is incompatible with the installed app.",
    ],
    permission: [
      "需要允许 Selah 安装更新，请开启权限后返回。",
      "Allow Selah to install updates, then return here.",
    ],
    unsupported: [
      "当前安装方式暂不支持此更新，请使用正式安装包。",
      "This installation cannot apply updates. Install a release build.",
    ],
    unavailable: [
      "此版本暂时无法下载，请重新检查更新。",
      "This release is unavailable. Check for updates again.",
    ],
    cancelled: [
      "下载已暂停，可以稍后继续。",
      "Download paused. You can resume later.",
    ],
  };
  return messages[code][english ? 1 : 0];
}
export function updatePhaseText(state: UpdateSnapshot, english: boolean) {
  const labels: Record<UpdateSnapshot["phase"], [string, string]> = {
    idle: ["检查是否有新版本", "Check for a new version"],
    current: ["当前已是最新版本", "You're up to date"],
    available: ["发现新版本", "A new version is available"],
    downloading: ["正在下载更新", "Downloading update"],
    paused: ["下载已暂停", "Download paused"],
    verifying: ["正在校验安装包", "Verifying package"],
    ready: ["更新已准备好", "Ready to install"],
    installing: ["正在打开安装程序", "Opening installer"],
    permission: ["允许安装更新", "Allow update installation"],
    error: ["更新暂未完成", "Update incomplete"],
  };
  return labels[state.phase][english ? 1 : 0];
}
