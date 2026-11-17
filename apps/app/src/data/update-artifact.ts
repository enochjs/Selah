import * as Linking from "expo-linking";
import { officialStoreUrl } from "./update-artifact-store";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { InstalledApp, UpdateArtifactPort } from "../domain/app-updates";
import { UpdateFailure } from "../domain/app-updates";
export function createUpdateArtifactPort(): UpdateArtifactPort {
  const native = requireOptionalNativeModule<{ installed(): InstalledApp }>(
    "SelahAppUpdates",
  );
  const unsupported = async (): Promise<never> => {
    throw new UpdateFailure("unsupported");
  };
  return {
    installed: () =>
      native?.installed() ?? {
        platform: Platform.OS === "ios" ? "ios" : "web",
        channel: "store",
        appId: "app.selah.bible",
        version:
          Platform.OS === "web"
            ? (Constants.expoConfig?.version ?? "unknown")
            : "unknown",
        buildNumber: 0,
      },
    recover: async () => false,
    download: unsupported,
    install: async (release) => {
      await Linking.openURL(officialStoreUrl(release));
      return "opened";
    },
    openPermissionSettings: unsupported,
  };
}
