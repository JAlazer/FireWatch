import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// --- HealthKit seam ---
// Real HealthKit is off-limits during the mock-data phase (see CLAUDE.md) and
// isn't available in Expo Go. Later, a real age could flow in here (via the
// HealthDataProvider); for now the user picks it on the wheel below.
function getHealthKitAge(): number | null {
  return null;
}

// The list of ages the wheel scrolls through: 13 through 100.
const AGES = Array.from({ length: 100 - 13 + 1 }, (_, i) => 13 + i);
const NOT_CHOSEN = -1; // sentinel: the wheel is on the "Select your age" row

// The four single-toggle lifestyle questions. Each key matches a Lifestyle
// field on the server.
type LifeKey = "autoimmune" | "stressed" | "smokes" | "drinks";

const LIFESTYLE: { key: LifeKey; label: string }[] = [
  { key: "autoimmune", label: "Autoimmune or inflammatory condition" },
  { key: "stressed", label: "Feeling stressed lately" },
  { key: "smokes", label: "Smoking regularly" },
  { key: "drinks", label: "Drinking alcohol regularly" },
];

const SICK_TYPES = ["Respiratory", "Stomach or digestive", "Other"];

const MED_TYPES = [
  "Beta-blocker or heart-rate medication",
  "Steroid or immune-suppressing medication",
];

// One reusable chip: outlined when off ("no"), filled color when on ("yes").
function ToggleChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// A parent yes/no question that reveals a multi-select list. Once at least one
// option is picked, the list collapses into a compact summary row with a
// chevron (▾ collapsed / ▴ expanded); tapping the summary toggles it open so
// picks can be changed. With nothing picked, the full list stays open.
function DisclosureSection({
  question,
  subLabel,
  options,
  isOpen,
  onToggleOpen,
  selected,
  onSelect,
  expanded,
  onToggleExpanded,
}: {
  question: string;
  subLabel: string;
  options: string[];
  isOpen: boolean;
  onToggleOpen: () => void;
  selected: string[];
  onSelect: (item: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const hasPicks = selected.length > 0;
  const showList = isOpen && (!hasPicks || expanded);

  return (
    <View>
      {/* parent on/off — untapping hides the whole section */}
      <View style={styles.wrapRow}>
        <ToggleChip label={question} selected={isOpen} onPress={onToggleOpen} />
      </View>

      {/* compact summary row, shown only once something is picked */}
      {isOpen && hasPicks && (
        <Pressable style={styles.summaryRow} onPress={onToggleExpanded}>
          <Text style={styles.summaryText} numberOfLines={2}>
            {selected.join(", ")}
          </Text>
          <Text style={styles.chev}>{expanded ? "▴" : "▾"}</Text>
        </Pressable>
      )}

      {/* full option list */}
      {showList && (
        <View style={styles.reveal}>
          <Text style={styles.subLabel}>
            {subLabel} <Text style={styles.hint}>(tap any)</Text>
          </Text>
          <View style={styles.wrapRow}>
            {options.map((o) => (
              <ToggleChip
                key={o}
                label={o}
                selected={selected.includes(o)}
                onPress={() => onSelect(o)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function Screen1() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Age: try HealthKit (null for now) → otherwise the user picks it on the wheel.
  // Check HealthKit FIRST: if it supplies an age, it pre-fills here (Continue
  // enabled, chip shows it, still tappable to edit). It's stubbed to null for
  // now, so today this starts empty and the placeholder + wheel below is the
  // fallback. null = no age yet.
  const [age, setAge] = useState<number | null>(getHealthKitAge());
  const [ageOpen, setAgeOpen] = useState(false); // is the wheel showing?

  // Four lifestyle toggles.
  const [life, setLife] = useState<Record<LifeKey, boolean>>({
    autoimmune: false,
    stressed: false,
    smokes: false,
    drinks: false,
  });

  // Progressive-disclosure sections. `expanded` controls whether the full
  // option list shows (true) or is collapsed to a summary row (false).
  const [sick, setSick] = useState(false);
  const [sickTypes, setSickTypes] = useState<string[]>([]);
  const [sickExpanded, setSickExpanded] = useState(false);
  const [meds, setMeds] = useState(false);
  const [medTypes, setMedTypes] = useState<string[]>([]);
  const [medsExpanded, setMedsExpanded] = useState(false);

  function toggleLife(key: LifeKey) {
    setLife((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Picking/unpicking a sub-option collapses back to the summary. (If none are
  // left, the full list stays open anyway — there's nothing to summarize.)
  function selectSickType(item: string) {
    setSickTypes((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
    setSickExpanded(false);
  }
  function selectMedType(item: string) {
    setMedTypes((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
    setMedsExpanded(false);
  }

  // Turning a parent off clears its picks and resets its expand state.
  function toggleSick() {
    setSick((prev) => {
      if (prev) {
        setSickTypes([]);
        setSickExpanded(false);
      }
      return !prev;
    });
  }
  function toggleMeds() {
    setMeds((prev) => {
      if (prev) {
        setMedTypes([]);
        setMedsExpanded(false);
      }
      return !prev;
    });
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
          This helps us know what to track. Nothing is shared without your
          say-so.
        </Text>

        {/* ---- Age (tap the chip to open the scroll wheel) ---- */}
        <Text style={styles.label}>Your age</Text>
        <View style={styles.wrapRow}>
          <ToggleChip
            label={age !== null ? `${age} years old` : "Select your age"}
            selected={age !== null}
            onPress={() => setAgeOpen((v) => !v)}
          />
        </View>
        {ageOpen && (
          <View style={styles.pickerCard}>
            <Picker
              selectedValue={age ?? NOT_CHOSEN}
              onValueChange={(value) => {
                const n = Number(value);
                setAge(n === NOT_CHOSEN ? null : n);
              }}
              itemStyle={styles.pickerItem}
              style={styles.wheel}
            >
              <Picker.Item label="Select your age" value={NOT_CHOSEN} color="#aaa" />
              {AGES.map((a) => (
                <Picker.Item key={a} label={`${a}`} value={a} />
              ))}
            </Picker>
            <Pressable style={styles.doneBtn} onPress={() => setAgeOpen(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        )}

        {/* ---- Four lifestyle toggles ---- */}
        <Text style={styles.label}>
          Which of these apply? <Text style={styles.hint}>(tap any)</Text>
        </Text>
        <View style={styles.wrapRow}>
          {LIFESTYLE.map((item) => (
            <ToggleChip
              key={item.key}
              label={item.label}
              selected={life[item.key]}
              onPress={() => toggleLife(item.key)}
            />
          ))}
        </View>

        {/* ---- Progressive disclosure: recent illness ---- */}
        <Text style={styles.label}>Recent health</Text>
        <DisclosureSection
          question="Been sick recently?"
          subLabel="What kind?"
          options={SICK_TYPES}
          isOpen={sick}
          onToggleOpen={toggleSick}
          selected={sickTypes}
          onSelect={selectSickType}
          expanded={sickExpanded}
          onToggleExpanded={() => setSickExpanded((v) => !v)}
        />

        {/* ---- Progressive disclosure: medications ---- */}
        <View style={styles.sectionGap}>
          <DisclosureSection
            question="Any relevant medications?"
            subLabel="Which kind?"
            options={MED_TYPES}
            isOpen={meds}
            onToggleOpen={toggleMeds}
            selected={medTypes}
            onSelect={selectMedType}
            expanded={medsExpanded}
            onToggleExpanded={() => setMedsExpanded((v) => !v)}
          />
        </View>
      </ScrollView>

      {/* ---- Continue pinned at the bottom ---- */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          disabled={age === null}
          onPress={() => {
            // Collect which of the six items are on, then carry everything to
            // Screen 2 — including age and the specific sick/med sub-types,
            // which used to get dropped here (Screen 2 only received the
            // top-level toggle keys before, never age/sickTypes/medTypes).
            const selectedKeys = [
              ...Object.entries(life)
                .filter(([, on]) => on)
                .map(([key]) => key),
              ...(sick ? ["sick"] : []),
              ...(meds ? ["meds"] : []),
            ];
            // Carry BIRTH DATE, not age: a stored age silently rots (they age, it
            // doesn't). Approximated from the wheel (anniversary today) until a real
            // DOB source exists — the spec is "HealthKit DOB, else DOB picker".
            // `age` is non-null here (Continue is disabled until it's picked).
            const today = new Date();
            const birthDate = new Date(
              Date.UTC(today.getUTCFullYear() - age!, today.getUTCMonth(), today.getUTCDate()),
            )
              .toISOString()
              .slice(0, 10);
            router.push({
              pathname: "/onboarding/markers",
              params: {
                selected: selectedKeys.join(","),
                birthDate,
                sickTypes: sickTypes.join(","),
                medTypes: medTypes.join(","),
              },
            });
          }}
          style={[styles.continue, age === null && styles.continueDisabled]}
        >
          <Text style={styles.continueText}>Continue</Text>
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

  // section + sub labels
  label: { fontSize: 16, fontWeight: "700", color: "#1A1A1A", marginTop: 28, marginBottom: 12 },
  subLabel: { fontSize: 15, fontWeight: "600", color: "#444", marginBottom: 10 },
  hint: { fontSize: 14, fontWeight: "400", color: "#AAA" },
  helper: { fontSize: 14, color: "#888", marginTop: 8 },

  // age scroll wheel
  pickerCard: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#ececec",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pickerItem: { fontSize: 20, color: "#1A1A1A" },
  wheel: { height: 180 },
  doneBtn: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingVertical: 12,
    alignItems: "center",
  },
  doneText: { fontSize: 16, fontWeight: "700", color: "#E55A4E" },

  // revealed subsection
  reveal: { marginTop: 14, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: "#F3C4BE" },
  sectionGap: { marginTop: 16 },

  // collapsed summary row
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
  summaryText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#1A1A1A", paddingRight: 8 },
  chev: { fontSize: 14, color: "#888" },

  // chips
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ececec",
    backgroundColor: "#FFF",
  },
  chipSelected: { backgroundColor: "#E55A4E", borderColor: "#E55A4E" },
  chipText: { fontSize: 15, color: "#444" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },

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