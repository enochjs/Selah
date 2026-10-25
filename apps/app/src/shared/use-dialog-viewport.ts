import { useEffect, useState } from "react";
import { Platform, type ViewStyle } from "react-native";

/** Web keyboards can resize the visual viewport without resizing the layout viewport. */
export function useDialogViewport(visible: boolean, keyboardAware: boolean) {
  const [viewport, setViewport] = useState<ViewStyle>();
  useEffect(() => {
    if (Platform.OS !== "web" || !visible || !keyboardAware) return;
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () =>
      setViewport({
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: "auto",
        width: "100%",
        height: visual.height,
        top: visual.offsetTop,
      });
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, [visible, keyboardAware]);
  return visible && keyboardAware ? viewport : undefined;
}
