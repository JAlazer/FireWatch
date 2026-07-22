import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

// SafeAreaProvider lets screens read the phone's "safe" insets (notch, home
// bar) so content isn't hidden behind them — needed now that we hide headers.
// headerShown: false removes the grey bar that showed internal route names.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
