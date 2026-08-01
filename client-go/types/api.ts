export interface UserCreate {
  name: string;
  email: string;
}

export interface UserResponse {
  user_id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface BiometricsCreate {
  hrv: number;
  resting_heart_rate: number;
  skin_temperature: number;
  respiratory_rate: number;
  spo2: number;
  sleep_hours: number;
}

export interface BiometricsResponse extends BiometricsCreate {
  user_id: string;
  recorded_at: string;
}

// Replaces the old shape (perceived_stress_level: number, smoking_status,
// alcohol_consumption, activity_level, works_shift_work,
// family_history_autoimmune, currently_in_flare, medications) to match
// firewatch-schema.mermaid's LIFESTYLE table directly — tiers/frequencies
// are stored as their own strings instead of being lossily mapped onto a
// 1-10 scale or a none/light/moderate/heavy scale.
export interface LifestyleProfileCreate {
  // HealthKit DOB, else DOB-picker fallback (per schema comment). Today's
  // onboarding only collects an age via a wheel (see onboarding/index.tsx),
  // so this is currently backfilled as an approximation — see
  // approximateBirthDate() in onboarding/markers.tsx. TODO: replace with a
  // real date-of-birth picker so this is exact.
  birth_date: string; // ISO date, "YYYY-MM-DD"

  // Not collected anywhere in the current onboarding flow — no question or
  // HealthKit read exists yet. Defaults to 'not_applicable' until one does.
  biological_sex: 'female' | 'male' | 'other' | 'not_applicable';

  stress_level: 'low' | 'moderate' | 'high';

  // 'never' when the person doesn't select a frequency chip on Screen 1.
  smoking_frequency: 'never' | 'occasionally' | 'daily' | 'heavy';
  drinking_frequency: 'never' | 'occasionally' | 'weekly' | 'daily';

  // Placeholder default: 'moderate'. DietSelector.tsx already exists and
  // targets this exact type, but isn't wired into either onboarding screen
  // yet — swap the hardcoded default in markers.tsx once it is.
  diet: 'very_unhealthy' | 'unhealthy' | 'moderate' | 'healthy' | 'very_healthy';

  sick_types: string[];
  med_types: string[];

  // Deduplicated union computed in markers.tsx (ALWAYS_MARKERS +
  // whatever the person's answers pulled in), stored as stable marker
  // *codes* (e.g. "hrv", "resp_rate") rather than the UI's display labels
  // (e.g. "Heart rate variability"), so a future copy change to the display
  // strings doesn't change what's persisted.
  tracked_markers: string[];

  // Per-signal opt-in. Should eventually reflect the actual OS-level
  // HealthKit authorization response (once HealthKitProvider exists), not
  // be invented client-side. For now, defaults every tracked signal to
  // true, mirroring the mock data's shape.
  healthkit_permissions: Record<string, boolean>;

  // Schema gap: firewatch-schema.mermaid's LIFESTYLE table has no column
  // for this. Kept as its own boolean here (distinct semantics from
  // sick_types' recent-illness meaning — this is a standing chronic
  // condition, and it drives its own markers independently in markers.tsx)
  // but the backend needs either a new column for it, or a decision to fold
  // it into sick_types instead, before this field can actually be persisted.
  has_autoimmune_condition: boolean;
}

export interface LifestyleProfileResponse extends LifestyleProfileCreate {
  user_id: string;
}

export interface InflammationResponse {
  user_id: string;
  score: number;
  level: number;
  insight: string;
  computed_at: string;
}