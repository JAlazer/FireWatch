// A parent yes/no question that reveals a multi-select list. Once at least one
// option is picked, the list collapses into a compact summary row with a
// chevron (▾ collapsed / ▴ expanded); tapping the summary toggles it open so

import { Pressable, View, Text } from "react-native";
import ToggleChip from "./ToggleChip";
import { styles } from "@/app/onboarding";

// picks can be changed. With nothing picked, the full list stays open.
export default function DisclosureSection({
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

