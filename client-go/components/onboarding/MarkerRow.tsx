// One non-interactive marker row (display only). `color` tints the icon:
import { styles } from "@/app/onboarding/markers";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { View, Text } from "react-native";

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

// neutral for the always markers, the app's accent for the personalized ones.
export default function MarkerRow({ name, color }: { name: string; color: string }) {
  return (
    <View style={styles.markerRow}>
      <MaterialCommunityIcons name={MARKER_ICONS[name]} size={22} color={color} />
      <Text style={styles.markerText}>{name}</Text>
    </View>
  );
}