import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { ActivityIndicator, View } from "react-native";
import * as Network from "expo-network";
import {
  downloadManager,
  enqueueDownloads,
  initializeDownloads,
  prepareDownloads,
  resumeDownloads,
  subscribeDownloads,
} from "../../data/offline-audio-runtime";
import type {
  OfflineAudioContextValue,
  OfflineState,
} from "../../domain/offline-audio";
import { useI18n } from "../../shared/i18n";
import { Button, Txt } from "../../shared/ui";
import { colors as c } from "../../shared/theme";

const Context = createContext<OfflineAudioContextValue | null>(null);
export function OfflineAudioProvider({ children }: PropsWithChildren) {
  const { bi } = useI18n();
  const state = useSyncExternalStore(
    subscribeDownloads,
    downloadManager.getSnapshot,
    downloadManager.getSnapshot,
  );
  const [error, setError] = useState(false);
  const initialize = () => {
    setError(false);
    void initializeDownloads().catch(() => setError(true));
  };
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
    return () => listener.remove();
  }, []);
  const value = useMemo<OfflineAudioContextValue>(
    () => ({
      state,
      prepare: prepareDownloads,
      enqueue: enqueueDownloads,
      pause: (keys) => downloadManager.pause(keys),
      resume: resumeDownloads,
      remove: (keys) => downloadManager.remove(keys),
    }),
    [state],
  );
  if (!state.ready)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          backgroundColor: c.bg,
        }}
      >
        {error ? (
          <>
            <Txt>
              {bi("离线资料暂时无法读取", "Could not read offline audio")}
            </Txt>
            <Button onPress={initialize}>{bi("重试", "Retry")}</Button>
          </>
        ) : (
          <ActivityIndicator color={c.green} />
        )}
      </View>
    );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useOfflineAudio() {
  const value = useContext(Context);
  if (!value) throw new Error("OfflineAudioProvider is required");
  return value;
}
