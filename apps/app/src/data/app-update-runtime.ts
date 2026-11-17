import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AppUpdateManager,
  emptyUpdatePreferences,
} from "../domain/app-updates";
import { resourceServerUrl } from "../config/resources";
import { createUpdateArtifactPort } from "./update-artifact";
import { fetchUpdateRelease } from "./update-api";
import { bindUpdateCompatibility } from "./update-compatibility";
const key = "selah-app-updates-v1";
let runtime: AppUpdateManager | undefined;
export function appUpdateManager() {
  if (runtime) return runtime;
  runtime = new AppUpdateManager({
    artifact: createUpdateArtifactPort(),
    check: (installed) => fetchUpdateRelease(installed, resourceServerUrl()),
    async load() {
      const json = await AsyncStorage.getItem(key);
      if (!json) return emptyUpdatePreferences();
      try {
        return JSON.parse(json);
      } catch {
        return emptyUpdatePreferences();
      }
    },
    save: (value) => AsyncStorage.setItem(key, JSON.stringify(value)),
    now: Date.now,
  });
  bindUpdateCompatibility(runtime);
  return runtime;
}
