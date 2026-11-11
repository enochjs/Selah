import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import {
  downloadManager,
  enqueueDownloads,
  initializeDownloads,
  prepareDownloads,
  prepareHymnDownload,
  resumeDownloads,
  subscribeDownloads,
} from "../../data/offline-audio-runtime";
import type {
  OfflineAudioContextValue,
  OfflineState,
} from "../../domain/offline-audio";

const Context = createContext<OfflineAudioContextValue | null>(null);
export function OfflineAudioProvider({ children }: PropsWithChildren) {
  const state = useSyncExternalStore(
    subscribeDownloads,
    downloadManager.getSnapshot,
    downloadManager.getSnapshot,
  );
  const [error, setError] = useState(false);
  const initialize = useCallback(() => {
    setError(false);
    void initializeDownloads().catch(() => setError(true));
  }, []);
  useEffect(() => {
    void initializeDownloads().catch(() => setError(true));
    const update = (network: Network.NetworkState) => {
      const value: OfflineState["network"] =
        network.type === Network.NetworkStateType.NONE ||
        network.isConnected === false
          ? "offline"
          : [
                Network.NetworkStateType.WIFI,
                Network.NetworkStateType.ETHERNET,
              ].includes(network.type!)
            ? "wifi"
            : network.type === Network.NetworkStateType.UNKNOWN
              ? "unknown"
              : "other";
      downloadManager.setNetwork(value);
    };
    void Network.getNetworkStateAsync()
      .then(update)
      .catch(() => downloadManager.setNetwork("unknown"));
    const listener = Network.addNetworkStateListener(update);
    const lifecycle = AppState.addEventListener("change", (next) => {
      if (next !== "active")
        void downloadManager.flush().catch((error: unknown) => {
          console.warn(
            "Could not checkpoint background audio downloads",
            error,
          );
        });
    });
    return () => {
      listener.remove();
      lifecycle.remove();
    };
  }, []);
  const value = useMemo<OfflineAudioContextValue>(
    () => ({
      state,
      initializationError: error,
      retryInitialization: initialize,
      prepare: prepareDownloads,
      prepareHymn: prepareHymnDownload,
      enqueue: enqueueDownloads,
      pause: (keys) => downloadManager.pause(keys),
      resume: resumeDownloads,
      remove: (keys) => downloadManager.remove(keys),
    }),
    [state, error, initialize],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useOfflineAudio() {
  const value = useContext(Context);
  if (!value) throw new Error("OfflineAudioProvider is required");
  return value;
}
