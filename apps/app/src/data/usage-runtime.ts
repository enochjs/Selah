import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { resourceServerUrl } from "../config/resources";
import { createUpdateArtifactPort } from "./update-artifact";
import { createUsageClient } from "./usage-client";
const storageKey = "selah-usage-v1";
let client: ReturnType<typeof createUsageClient> | undefined;
export function usageClient() {
  if (client) return client;
  const installed = createUpdateArtifactPort().installed();
  client = createUsageClient(
    {
      read: () => AsyncStorage.getItem(storageKey),
      write: (value) => AsyncStorage.setItem(storageKey, value),
      id: randomUUID,
      now: Date.now,
      async send(batch) {
        const base = resourceServerUrl();
        if (!base) throw new Error("Usage endpoint unavailable");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(new URL("/api/usage", base).toString(), {
            method: "POST",
            signal: controller.signal,
            credentials: "omit",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batch),
          });
          if (response.status !== 202) throw new Error("Usage upload failed");
        } finally {
          clearTimeout(timer);
        }
      },
    },
    {
      platform: installed.platform,
      version: /^[a-zA-Z0-9.+-]{1,40}$/.test(installed.version)
        ? installed.version
        : "unknown",
    },
  );
  return client;
}
