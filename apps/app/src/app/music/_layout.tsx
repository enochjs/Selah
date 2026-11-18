import { Stack } from "expo-router";
import { useTheme } from "../../shared/theme-context";

export default function MusicLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
