import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Markers shown to everyone, regardless of what they picked on Screen 1.
const ALWAYS_MARKERS = ["Heart rate variability", "Resting heart rate"];

// Each selected condition contributes these markers; Screen 2 shows the
// deduplicated union of all of them.
const CONDITION_MARKERS: Record<string, string[]> = {
  autoimmune: ["Skin temperature", "Respiratory rate"],
  stressed: ["Sleep"],
  smokes: ["Blood oxygen", "Respiratory rate"],
  drinks: ["Sleep"],
};

// Fallback when none of the four conditions were selected. These sit alongside
// the always-shown HRV + Resting HR. Confirmed 2026-07 (kept after HRV/RHR
// became universal).
const DEFAULT_MARKERS = ["Sleep", "Steps"];

const CONDITION_KEYS = ["autoimmune", "stressed", "smokes", "drinks"];

// The icon shown next to each possible marker.
const MARKER_ICONS: Record<
  string,
  keyof typeof MaterialCommunityIcons.glyphMap
> = {
  "Heart rate variability": "heart-pulse",
  "Resting heart rate": "heart-outline",
  "Skin temperature": "thermometer",
  "Respiratory rate": "lungs",
  Sleep: "moon-waning-crescent",
  "Blood oxygen": "water-percent",
  Steps: "walk",
};

// One non-interactive marker row (display only). `color` tints the icon:
// neutral for the always markers, an accent blue for the personalized ones.
function MarkerRow({ name, color }: { name: string; color: string }) {
  return (
    <View style={styles.markerRow}>
      <MaterialCommunityIcons name={MARKER_ICONS[name]} size={22} color={color} />
      <Text style={styles.markerText}>{name}</Text>
    </View>
  );
}

export default function Screen2() {
  const insets = useSafeAreaInsets();

  // `selected` is the comma-joined list of keys carried over from Screen 1.
  const { selected } = useLocalSearchParams<{ selected?: string }>();
  const chosen = new Set((selected ?? "").split(",").filter(Boolean));

  // Build the "because of what you shared" markers (deduplicated union).
  const activeConditions = CONDITION_KEYS.filter((k) => chosen.has(k));
  let sharedMarkers: string[];
  if (activeConditions.length === 0) {
    sharedMarkers = DEFAULT_MARKERS;
  } else {
    const union = new Set<string>();
    activeConditions.forEach((k) =>
      CONDITION_MARKERS[k].forEach((m) => union.add(m)),
    );
    sharedMarkers = [...union];
  }

  // One combined caveat note for recent illness and/or flagged medications.
  const sick = chosen.has("sick");
  const meds = chosen.has("meds");
  let caveat: string | null = null;
  if (sick && meds) {
    caveat =
      "Heads up: a recent illness can make some readings noisier for a while, and a medication you flagged can change how heart-rate signals should be read. We'll keep both in mind.";
  } else if (sick) {
    caveat =
      "Heads up: a recent illness can make some of these readings noisier for a while. We'll keep that in mind.";
  } else if (meds) {
    caveat =
      "Heads up: a medication you flagged can change how heart-rate signals should be read. We'll keep that in mind.";
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Header ---- */}
        <Text style={styles.step}>Step 2 of 2</Text>
        <Text style={styles.heading}>We&apos;ll track these for you</Text>
        <Text style={styles.subtitle}>Based on what you shared.</Text>

        {/* ---- Always ---- */}
        <Text style={styles.label}>Always</Text>
        <View style={styles.list}>
          {ALWAYS_MARKERS.map((m) => (
            <MarkerRow key={m} name={m} color="#222" />
          ))}
        </View>

        {/* ---- Because of what you shared ---- */}
        <Text style={styles.label}>Because of what you shared</Text>
        <View style={styles.list}>
          {sharedMarkers.map((m) => (
            <MarkerRow key={m} name={m} color="#4f46e5" />
          ))}
        </View>

        {/* ---- Caveat note (not a marker row) ---- */}
        {caveat && (
          <View style={styles.caveat}>
            <Text style={styles.caveatText}>{caveat}</Text>
          </View>
        )}
      </ScrollView>

      {/* ---- Finish (no-op for now — no HealthKit/Dashboard yet) ---- */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => console.log("Finish setup:", { sharedMarkers, sick, meds })}
          style={styles.continue}
        >
          <Text style={styles.continueText}>Finish setup</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },

  // header block
  step: { fontSize: 14, color: "#9a9a9a", marginBottom: 6 },
  heading: { fontSize: 28, fontWeight: "800", color: "#111", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#777", lineHeight: 22 },

  // section labels (uppercase, letter-spaced, grey)
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9a9a9a",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 28,
    marginBottom: 12,
  },

  // marker rows
  list: { gap: 10 },
  markerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ececec",
  },
  markerText: { fontSize: 16, color: "#222" },

  // caveat note
  caveat: {
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#f6f6f6",
  },
  caveatText: { fontSize: 14, color: "#555", lineHeight: 20 },

  // bottom bar
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    backgroundColor: "#fff",
  },
  continue: {
    backgroundColor: "#111",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  continueText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
