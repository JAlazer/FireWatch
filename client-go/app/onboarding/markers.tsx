import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { STORAGE_KEY_USER_ID } from "@/constants/config";
import { useHealthDataProviderContext } from "@/providers/HealthDataProviderContext";
import { createLifestyle, createUser, saveBiometrics } from "@/services/api";
import type { LifestyleProfileCreate } from "@/types/api";

// Markers shown to everyone, regardless of what they picked on Screen 1.
const ALWAYS_MARKERS = ["Heart rate variability", "Resting heart rate"];

// A flat yes/no autoimmune flag contributes these markers.
const AUTOIMMUNE_MARKERS = ["Skin temperature", "Respiratory rate"];

// Stress level is a tier now, not a flat yes/no — higher tiers add more.
const STRESS_MARKERS: Record<string, string[]> = {
  Low: [],
  Moderate: ["Sleep"],
  High: ["Sleep", "Respiratory rate"],
};

// Smoking/drinking frequency — heavier use pulls in more markers.
const SMOKE_MARKERS: Record<string, string[]> = {
  Occasionally: ["Respiratory rate"],
  Daily: ["Respiratory rate", "Blood oxygen"],
  "Heavily (pack+/day)": ["Respiratory rate", "Blood oxygen", "Skin temperature"],
};
const DRINK_MARKERS: Record<string, string[]> = {
  Occasionally: ["Sleep"],
  Weekly: ["Sleep"],
  Daily: ["Sleep", "Respiratory rate"],
};

// Recent-illness type and flagged-medication type each contribute their own
// markers too, so a "sick" or "meds" flag isn't just a caveat — it can also
// change what gets tracked.
const SICK_TYPE_MARKERS: Record<string, string[]> = {
  Respiratory: ["Respiratory rate", "Blood oxygen"],
  "Stomach or digestive": ["Sleep"],
  Other: [],
};
const MED_TYPE_MARKERS: Record<string, string[]> = {
  "Beta-blocker or heart-rate medication": ["Heart rate variability", "Resting heart rate"],
  "Steroid or immune-suppressing medication": ["Skin temperature"],
};

// Fallback when nothing above contributed a single marker — i.e. the person
// selected no conditions, no stress level, no smoking/drinking frequency, no
// illness type, and no medication type. Sits alongside the always-shown
// HRV + Resting HR. Confirmed 2026-07 (kept after HRV/RHR became universal).
const DEFAULT_MARKERS = ["Sleep", "Steps"];

// --- Mapping this screen's answers onto LifestyleProfileCreate ---
// The backend's fields are scales/enums (perceived_stress_level: 1-10,
// smoking_status: never/former/current, alcohol_consumption: none/light/
// moderate/heavy) that predate this simplified onboarding, so these
// translate what's collected here into that shape.

// Tiers map to a representative point on the 1-10 scale rather than a range,
// since the backend only stores a single number.
function mapStressLevel(level: string | null): number {
  switch (level) {
    case "Low":
      return 3;
    case "Moderate":
      return 6;
    case "High":
      return 9;
    default:
      return 5; // no stress level given — neutral default
  }
}

// This onboarding only asks "do you currently smoke, and how often" — it
// can't distinguish a former smoker from someone who's never smoked, so "no"
// maps to "never" rather than attempting to guess "former".
function mapSmokingStatus(smokes: boolean): LifestyleProfileCreate["smoking_status"] {
  return smokes ? "current" : "never";
}

// Frequency (occasionally/weekly/daily) stands in for the backend's
// none/light/moderate/heavy scale.
function mapAlcoholConsumption(
  drinks: boolean,
  frequency: string | null,
): LifestyleProfileCreate["alcohol_consumption"] {
  if (!drinks) return "none";
  switch (frequency) {
    case "Occasionally":
      return "light";
    case "Weekly":
      return "moderate";
    case "Daily":
      return "heavy";
    default:
      return "light";
  }
}

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
// neutral for the always markers, the app's accent for the personalized ones.
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
  const router = useRouter();
  const provider = useHealthDataProviderContext();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Everything carried over from Screen 1.
  const { selected, stressLevel, sickTypes, medTypes, smokeTypes, drinkTypes } =
    useLocalSearchParams<{
      selected?: string;
      stressLevel?: string;
      sickTypes?: string;
      medTypes?: string;
      smokeTypes?: string;
      drinkTypes?: string;
    }>();
  const chosen = new Set((selected ?? "").split(",").filter(Boolean));
  const parsedStressLevel = stressLevel || null;
  const parsedSickTypes = (sickTypes ?? "").split(",").filter(Boolean);
  const parsedMedTypes = (medTypes ?? "").split(",").filter(Boolean);
  const parsedSmokeTypes = (smokeTypes ?? "").split(",").filter(Boolean);
  const parsedDrinkTypes = (drinkTypes ?? "").split(",").filter(Boolean);

  // Build the "because of what you shared" markers — the deduplicated union
  // across every data point collected on Screen 1, not just the four flat
  // conditions from before. Each category only contributes if it actually
  // has something selected (a level, a frequency, a type).
  const union = new Set<string>();
  if (chosen.has("autoimmune")) {
    AUTOIMMUNE_MARKERS.forEach((m) => union.add(m));
  }
  if (parsedStressLevel && STRESS_MARKERS[parsedStressLevel]) {
    STRESS_MARKERS[parsedStressLevel].forEach((m) => union.add(m));
  }
  parsedSmokeTypes.forEach((t) => SMOKE_MARKERS[t]?.forEach((m) => union.add(m)));
  parsedDrinkTypes.forEach((t) => DRINK_MARKERS[t]?.forEach((m) => union.add(m)));
  parsedSickTypes.forEach((t) => SICK_TYPE_MARKERS[t]?.forEach((m) => union.add(m)));
  parsedMedTypes.forEach((t) => MED_TYPE_MARKERS[t]?.forEach((m) => union.add(m)));

  const sharedMarkers = union.size > 0 ? [...union] : DEFAULT_MARKERS;

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

  async function handleFinish() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      // This onboarding doesn't collect a name/email (no separate signup
      // step exists yet), so this mirrors the placeholder the old
      // OnboardingContext used. Swap this out once there's a real
      // sign-up/account step feeding into onboarding.
      const user = await createUser({
        name: "FireWatch User",
        email: "user@firewatch.app",
      });

      // A new user has no biometrics on record yet, and /inflammation 404s
      // without one. Pull the same "latest biometrics" the dashboard/
      // insights tabs already read from (currently MockHealthDataProvider's
      // synthetic 14-day snapshot; swaps to real HealthKit data for free
      // once HealthKitProvider is implemented) — this also keeps the
      // inflammation score consistent with what those tabs show.
      const biometrics = await provider.getLatestBiometrics();
      await saveBiometrics(user.user_id, biometrics);

      const lifestylePayload: LifestyleProfileCreate = {
        // Not asked about in this onboarding yet — placeholder until there's
        // a real diet question. "moderate" sits in the middle of the
        // five-point scale so it doesn't skew the inflammation score toward
        // either extreme in the meantime.
        diet: "moderate",
        has_autoimmune_condition: chosen.has("autoimmune"),
        smoking_status: mapSmokingStatus(chosen.has("smokes")),
        alcohol_consumption: mapAlcoholConsumption(
          chosen.has("drinks"),
          parsedDrinkTypes[0] ?? null,
        ),
        medications: parsedMedTypes,
        perceived_stress_level: mapStressLevel(parsedStressLevel),
        // Not collected by this onboarding at all — defaulted until/unless
        // a question gets added for these. Flagging rather than guessing
        // silently: activity_level, works_shift_work,
        // family_history_autoimmune, and currently_in_flare have no UI here.
        activity_level: "moderate",
        works_shift_work: false,
        family_history_autoimmune: false,
        currently_in_flare: false,
      };

      await createLifestyle(user.user_id, lifestylePayload);
      await AsyncStorage.setItem(STORAGE_KEY_USER_ID, user.user_id);

      router.replace("/(tabs)/dashboard");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong finishing setup.",
      );
    } finally {
      setSubmitting(false);
    }
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
            <MarkerRow key={m} name={m} color="#1A1A1A" />
          ))}
        </View>

        {/* ---- Because of what you shared ---- */}
        <Text style={styles.label}>Because of what you shared</Text>
        <View style={styles.list}>
          {sharedMarkers.map((m) => (
            <MarkerRow key={m} name={m} color="#E55A4E" />
          ))}
        </View>

        {/* ---- Caveat note (not a marker row) ---- */}
        {caveat && (
          <View style={styles.caveat}>
            <Text style={styles.caveatText}>{caveat}</Text>
          </View>
        )}

        {/* ---- Submission error, if any ---- */}
        {submitError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      {/* ---- Finish: persists onboarding data, then hands off to the tabs ---- */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleFinish}
          disabled={submitting}
          style={[styles.continue, submitting && styles.continueDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueText}>Finish setup</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7F7" },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },

  // header block
  step: { fontSize: 14, color: "#AAA", marginBottom: 6 },
  heading: { fontSize: 28, fontWeight: "800", color: "#1A1A1A", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#888", lineHeight: 22 },

  // section labels (uppercase, letter-spaced, grey)
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#AAA",
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
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  markerText: { fontSize: 16, color: "#1A1A1A" },

  // caveat note
  caveat: {
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#ececec",
  },
  caveatText: { fontSize: 14, color: "#555", lineHeight: 20 },

  // submission error
  errorBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FDEDEC",
    borderWidth: 1,
    borderColor: "#F3C4BE",
  },
  errorText: { fontSize: 14, color: "#E55A4E", fontWeight: "600" },

  // bottom bar
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    backgroundColor: "#F7F7F7",
  },
  continue: {
    backgroundColor: "#E55A4E",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  continueDisabled: { backgroundColor: "#F3C4BE" },
  continueText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});