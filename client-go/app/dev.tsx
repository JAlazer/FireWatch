// DEV-ONLY control panel (strip this file + the __DEV__ launcher in app/_layout.tsx
// to remove entirely). Reachable via the floating "DEV" button in Expo Go.
//
// Two independent axes drive REAL generated history through buildProvider:
//   - DAYS: backdate the persisted profile's start date -> that much actual history
//   - SCENARIO: calm / flare / flare+beta_blocker
// Plus RESET (clear profile -> onboarding) and a status line.

import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DAY_BUTTONS, SCENARIOS, devProfile, devStartDate, scenarioOf, type DevScenario } from "@/src/dev/presets";
import { asyncStorageAdapter } from "@/src/storage/asyncStorage";
import { clearOnboarding, loadOnboarding, saveOnboarding } from "@/src/storage/onboardingStore";

const DAY = 86_400_000;

export default function DevScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [days, setDays] = useState(30);
  const [scenario, setScenario] = useState<DevScenario>("calm");

  useEffect(() => {
    (async () => {
      const s = await loadOnboarding(asyncStorageAdapter);
      if (s) {
        setExists(true);
        setDays(Math.max(0, Math.round((Date.now() - Date.parse(s.startDate)) / DAY)));
        setScenario(scenarioOf(s));
      }
      setLoading(false);
    })();
  }, []);

  // Write both axes together: scenario profile + backdated start date.
  async function apply(nextScenario: DevScenario, nextDays: number) {
    const now = Date.now();
    await saveOnboarding(asyncStorageAdapter, devProfile(nextScenario, now), { startDate: devStartDate(nextDays, now) });
    setScenario(nextScenario);
    setDays(nextDays);
    setExists(true);
  }

  async function reset() {
    await clearOnboarding(asyncStorageAdapter);
    router.replace("/onboarding");
  }

  if (!__DEV__) return null;
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}>
      <Text style={styles.title}>Dev panel</Text>
      <Text style={styles.status}>
        {exists ? `${days}d history` : "no profile"} · {scenario} · profile {exists ? "exists" : "none"}
      </Text>

      <Text style={styles.label}>Days of history</Text>
      <View style={styles.row}>
        {DAY_BUTTONS.map((d) => (
          <Pressable key={d} onPress={() => apply(scenario, d)} style={[styles.chip, exists && days === d && styles.chipOn]}>
            <Text style={[styles.chipText, exists && days === d && styles.chipTextOn]}>{d}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Scenario</Text>
      <View style={styles.rowWrap}>
        {SCENARIOS.map((s) => (
          <Pressable key={s} onPress={() => apply(s, days)} style={[styles.chipWide, scenario === s && styles.chipOn]}>
            <Text style={[styles.chipText, scenario === s && styles.chipTextOn]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        flare+beta_blocker is the key test: the beta-blocker (HRV up, resting HR down) opposes the flare, so it can mask a genuine flare — the app quietly reading “calm.”
      </Text>

      <View style={styles.actions}>
        <Pressable onPress={() => router.replace("/(tabs)/dashboard")} style={[styles.action, styles.actionPrimary]}>
          <Text style={styles.actionPrimaryText}>Go to dashboard</Text>
        </Pressable>
        <Pressable onPress={reset} style={[styles.action, styles.actionDanger]}>
          <Text style={styles.actionDangerText}>Reset (→ onboarding)</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.action}>
          <Text style={styles.actionText}>Close</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E0E10" },
  center: { alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  status: { color: "#8AE38A", fontSize: 13, marginTop: 6, marginBottom: 20, fontFamily: "Courier" },
  label: { color: "#9A9AA2", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: "row", gap: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#1D1D22", alignItems: "center" },
  chipWide: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#1D1D22" },
  chipOn: { backgroundColor: "#3B5BFF" },
  chipText: { color: "#C9C9D2", fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  hint: { color: "#6E6E78", fontSize: 12, lineHeight: 17, marginTop: 10 },
  actions: { marginTop: 28, gap: 10 },
  action: { paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: "#1D1D22" },
  actionText: { color: "#C9C9D2", fontSize: 15, fontWeight: "600" },
  actionPrimary: { backgroundColor: "#3B5BFF" },
  actionPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  actionDanger: { backgroundColor: "#2A1416" },
  actionDangerText: { color: "#FF6B6B", fontSize: 15, fontWeight: "600" },
});
