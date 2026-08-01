// A single-select row of chips (radio behavior). Tapping the already-selected
// chip clears the selection back to null (used to represent "never"/"no

import { View, Text } from "react-native";
import ToggleChip from "./ToggleChip";
import { styles } from "@/app/onboarding";

// answer" for stress/smoking/drinking).
export default function TierSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <View>
      <Text style={styles.label}>
        {label} <Text style={styles.hint}>(tap to select, tap again to clear)</Text>
      </Text>
      <View style={styles.wrapRow}>
        {options.map((opt) => (
          <ToggleChip
            key={opt}
            label={opt}
            selected={value === opt}
            onPress={() => onChange(value === opt ? null : opt)}
          />
        ))}
      </View>
    </View>
  );
}
