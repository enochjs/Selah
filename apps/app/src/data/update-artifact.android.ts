import * as Linking from "expo-linking";
import { officialStoreUrl } from "./update-artifact-store";
import { requireNativeModule } from "expo";
import { resourceServerUrl } from "../config/resources";
import {
  bridgeArtifactPort,
  type UpdateNativeBridge,
} from "./update-artifact-bridge";
export function createUpdateArtifactPort() {
  const direct = bridgeArtifactPort(
    requireNativeModule<UpdateNativeBridge>("SelahAppUpdates"),
    resourceServerUrl,
  );
  return {
    ...direct,
    install: async (release: Parameters<typeof direct.install>[0]) => {
      if (release.channel === "direct") return direct.install(release);
      await Linking.openURL(officialStoreUrl(release));
      return "opened" as const;
    },
  };
}
