import { router, Stack } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// SafeAreaProvider lets screens read the phone's "safe" insets (notch, home
// bar) so content isn't hidden behind them — needed now that we hide headers.
// headerShown: false removes the grey bar that showed internal route names.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
      {/* DEV-ONLY launcher for app/dev.tsx — floats over every screen so the dev
          panel is reachable on a physical device in Expo Go. Strip this block (and
          app/dev.tsx) to remove entirely. */}
      {__DEV__ && (
        <Pressable onPress={() => router.push("/dev")} style={styles.devFab} accessibilityLabel="Open dev panel">
          <Text style={styles.devFabText}>DEV</Text>
        </Pressable>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  devFab: {
    position: "absolute",
    right: 14,
    bottom: 96, // above the tab bar
    backgroundColor: "#3B5BFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    opacity: 0.9,
  },
  devFabText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
});
