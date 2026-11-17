import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { appUpdateManager } from "../../data/app-update-runtime";
import type { AppUpdateManager } from "../../domain/app-updates";
const Context = createContext<AppUpdateManager | null>(null);
export function AppUpdatesProvider({ children }: PropsWithChildren) {
  const [manager] = useState(appUpdateManager);
  useEffect(() => {
    void manager.check(false);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void manager.check(false);
      else if (state === "background") {
        manager.pause();
        void manager.flush();
      }
    });
    return () => subscription.remove();
  }, [manager]);
  return <Context.Provider value={manager}>{children}</Context.Provider>;
}
export function useAppUpdates() {
  const manager = useContext(Context);
  if (!manager) throw new Error("AppUpdatesProvider is required");
  const state = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  return { manager, state };
}
