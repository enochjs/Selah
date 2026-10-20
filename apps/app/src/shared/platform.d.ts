import "react-native";
declare module "react-native" {
  interface PressableStateCallbackType {
    /** React Native Web also supplies the current hover state. */
    readonly hovered?: boolean;
  }
}
