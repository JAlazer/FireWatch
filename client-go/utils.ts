import { LifestyleProfileCreate } from "./types/api";

// --- Mapping this screen's answers onto LifestyleProfileCreate ---
// firewatch-schema.mermaid's LIFESTYLE table stores stress_level /
// smoking_frequency / drinking_frequency as their own strings, so unlike the
// old backend contract, these map 1:1 onto the schema's enums instead of
// being collapsed onto a 1-10 scale or a none/light/moderate/heavy scale.
export function mapStressLevel(level: string | null): LifestyleProfileCreate["stress_level"] {
  switch (level) {
    case "Low":
      return "low";
    case "Moderate":
      return "moderate";
    case "High":
      return "high";
    default:
      return "moderate"; // no stress level given — neutral default
  }
}
 
// Not picking a frequency chip on Screen 1 means "never" — there's no
// separate on/off toggle anymore, the frequency chips themselves are the
// only signal.
export function mapSmokingFrequency(freq: string | null): LifestyleProfileCreate["smoking_frequency"] {
  switch (freq) {
    case "Occasionally":
      return "occasionally";
    case "Daily":
      return "daily";
    case "Heavily (pack+/day)":
      return "heavy";
    default:
      return "never";
  }
}
 
export function mapDrinkingFrequency(freq: string | null): LifestyleProfileCreate["drinking_frequency"] {
  switch (freq) {
    case "Occasionally":
      return "occasionally";
    case "Weekly":
      return "weekly";
    case "Daily":
      return "daily";
    default:
      return "never";
  }
}
 
// The schema stores a real birth_date (HealthKit DOB, or DOB-picker
// fallback), but Screen 1 still only collects a coarse age via a wheel.
// Until that's replaced with a real date-of-birth picker, this derives a
// placeholder birth_date (Jan 1 of the implied birth year) so the field
// isn't left empty. TODO: swap for a real DOB picker per the schema's own
// fallback note.
export function approximateBirthDate(age: string | undefined): string {
  const parsedAge = Number(age);
  const currentYear = new Date().getFullYear();
  const birthYear = Number.isFinite(parsedAge) ? currentYear - parsedAge : currentYear - 30;
  return `${birthYear}-01-01`;
}

