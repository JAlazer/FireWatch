import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The four yes/no statements. Tapping one marks it as "applies to me".
// Each `key` matches a field on the server's Lifestyle model.
type StatementKey = "autoimmune" | "stressed" | "smokes" | "drinks";

const STATEMENTS: { key: StatementKey; label: string }[] = [
  { key: "autoimmune", label: "I have an ongoing autoimmune or inflammatory condition" },
  { key: "stressed", label: "I've been feeling stressed lately" },
  { key: "smokes", label: "I smoke" },
  { key: "drinks", label: "I drink alcohol regularly" },
];

// The diet scale — pick exactly one.
const DIET_SCALE = [
  "Very unhealthy",
  "Unhealthy",
  "Moderate",
  "Healthy",
  "Very healthy",
];

export default function Screen1() {
  const insets = useSafeAreaInsets(); // notch (top) + home-bar (bottom) sizes

  // Remembers which statements are toggled on (all start off/false).
  const [answers, setAnswers] = useState<Record<StatementKey, boolean>>({
    autoimmune: false,
    stressed: false,
    smokes: false,
    drinks: false,
  });

  // Remembers the single diet choice (null = nothing picked yet).
  const [diet, setDiet] = useState<string | null>(null);

  // Flip one statement between on and off.
  function toggle(key: StatementKey) {
    setAnswers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Header ---- */}
        <Text style={styles.step}>Step 1 of 2</Text>
        <Text style={styles.heading}>A little about you</Text>
        <Text style={styles.subtitle}>
          This helps us know what to track. Nothing is shared without your say-so.
        </Text>

        {/* ---- Four yes/no statements (tap any) ---- */}
        <Text style={styles.label}>
          Which of these apply? <Text style={styles.hint}>(tap any)</Text>
        </Text>
        <View style={styles.column}>
          {STATEMENTS.map((s) => {
            const selected = answers[s.key];
            return (
              <Pressable
                key={s.key}
                onPress={() => toggle(s.key)}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <Text style={[styles.rowText, selected && styles.rowTextSelected]}>
                  {s.label}
                </Text>
                {selected && <Text style={styles.check}>✓</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* ---- Diet scale (pick one) ---- */}
        <Text style={styles.label}>How would you describe your diet?</Text>
        <View style={styles.wrapRow}>
          {DIET_SCALE.map((level) => {
            const selected = diet === level;
            return (
              <Pressable
                key={level}
                onPress={() => setDiet(level)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {level}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* ---- Continue pinned at the bottom (not wired up yet) ---- */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => console.log("Screen 1 answers:", { ...answers, diet })}
          style={styles.continue}
        >
          <Text style={styles.continueText}>Continue</Text>
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
  subtitle: { fontSize: 15, color: "#777", lineHeight: 22, marginBottom: 8 },

  // section labels
  label: { fontSize: 16, fontWeight: "700", color: "#111", marginTop: 28, marginBottom: 12 },
  hint: { fontSize: 14, fontWeight: "400", color: "#aaa" },

  // yes/no statement rows
  column: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e4e4e4",
  },
  rowSelected: { borderColor: "#111", backgroundColor: "#f6f6f6" },
  rowText: { flex: 1, fontSize: 16, color: "#333", paddingRight: 8 },
  rowTextSelected: { color: "#111", fontWeight: "600" },
  check: { fontSize: 16, color: "#111", fontWeight: "700" },

  // diet chips (single pick, filled black when selected)
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e4e4e4",
  },
  chipSelected: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { fontSize: 15, color: "#333" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },

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
