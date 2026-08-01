// TRENDS tab — HRV + resting heart rate over time, from day one (no score needed).
// PLACEHOLDER: how these display (raw values vs deviation-from-baseline, and the
// sparklines) is pending the item-1 decision — the flare diagnostic showed HRV moves
// dramatically in raw units while resting HR's larger *sigma* move is easy to miss,
// so both likely need to read on a comparable (baseline-relative) scale.

import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TrendsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 20 }}>
      <Text style={styles.kicker}>TRENDS</Text>
      <Text style={styles.title}>Coming soon</Text>
      <Text style={styles.body}>
        Your heart-rate variability and resting heart rate over time will show here — from day one, no score needed.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  kicker: { fontSize: 13, letterSpacing: 2, color: "#9A9A9A", fontWeight: "600", marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "700", color: "#222", fontFamily: "Georgia" },
  body: { fontSize: 17, color: "#555", lineHeight: 25, marginTop: 14, fontFamily: "Georgia" },
});
