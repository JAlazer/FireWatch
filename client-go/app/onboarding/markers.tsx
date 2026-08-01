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
import { approximateBirthDate, mapDrinkingFrequency, mapSmokingFrequency, mapStressLevel } from "@/utils";
import MarkerRow from "@/components/onboarding/MarkerRow";

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
  Heavily: ["Respiratory rate", "Blood oxygen", "Skin temperature"],
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

// Stable marker codes, matching BIOMETRICS.metric_type in
// firewatch-schema.mermaid — this is what actually gets persisted in
// tracked_markers, decoupled from the UI's display labels above so a future
// copy change doesn't change what's stored.
const MARKER_CODES: Record<string, string> = {
  "Heart rate variability": "hrv",
  "Resting heart rate": "resting_hr",
  "Skin temperature": "body_temp",
  "Respiratory rate": "resp_rate",
  Sleep: "sleep_stage",
  "Blood oxygen": "spo2",
  Steps: "steps",
};





export default function Screen2() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const provider = useHealthDataProviderContext();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
 
  // Everything carried over from Screen 1. `age` wasn't previously read here
  // even though Screen 1 sent it — needed now for approximateBirthDate().
  const { selected, age, stressLevel, sickTypes, medTypes, smokeTypes, drinkTypes } =
    useLocalSearchParams<{
      selected?: string;
      age?: string;
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
 
  // Full set actually persisted to LIFESTYLE.tracked_markers — always
  // markers plus whatever was earned above, deduped, converted to stable
  // codes (see MARKER_CODES).
  const trackedMarkerCodes = [...new Set([...ALWAYS_MARKERS, ...sharedMarkers])].map(
    (m) => MARKER_CODES[m],
  );
 
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
        birth_date: approximateBirthDate(age),
        // Not collected anywhere in this onboarding yet — no question or
        // HealthKit read exists. Placeholder until one does, same pattern
        // as `diet` below.
        biological_sex: "not_applicable",
        stress_level: mapStressLevel(parsedStressLevel),
        smoking_frequency: mapSmokingFrequency(parsedSmokeTypes[0] ?? null),
        drinking_frequency: mapDrinkingFrequency(parsedDrinkTypes[0] ?? null),
        // Not asked about in this onboarding yet — placeholder until there's
        // a real diet question. DietSelector.tsx already exists and targets
        // this exact type but isn't wired into either screen yet. "moderate"
        // sits in the middle of the five-point scale so it doesn't skew the
        // inflammation score toward either extreme in the meantime.
        diet: "moderate",
        sick_types: parsedSickTypes,
        med_types: parsedMedTypes,
        tracked_markers: trackedMarkerCodes,
        // Should eventually reflect the actual OS-level HealthKit
        // authorization response (per signal), not be invented client-side.
        // Defaulting every tracked signal to true as a placeholder.
        healthkit_permissions: Object.fromEntries(
          trackedMarkerCodes.map((code) => [code, true]),
        ),
        // Schema gap: firewatch-schema.mermaid's LIFESTYLE table has no
        // column for this yet. See the comment on this field in
        // types/api.ts for the reasoning and the open decision.
        has_autoimmune_condition: chosen.has("autoimmune"),
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


export const styles = StyleSheet.create({
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