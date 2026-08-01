// Onboarding projections — ONE module, three directions, none derived from another:
//
//   raw answers ─┬─► OnboardingProfile      (rawToOnboarding)  canonical on-device
//                └─► LifestyleProfileCreate (rawToLifestyle)   server wire format
//
//   LifestyleProfileCreate ─► OnboardingProfile (lifestyleToOnboarding)  RESTORE
//
// Why direct projection and not raw -> wire -> canonical: the round-trip is lossy.
// LifestyleProfileCreate has NO birth_date, so routing on-device data through it
// would DISCARD birth date — the input the entire HRV centroid derives from. So raw
// projects to each shape independently.
//
// The RESTORE direction (wire -> canonical) is for login: a returning user on a new
// device has a server profile and no local one. It's kept but currently has NO
// caller — awaiting the login/restore flow. Its birthDate must come from elsewhere
// (HealthKit DOB), since the wire schema still lacks birth_date.
//
// FLAG FOR JOHAN (backend, do not change here): LifestyleProfileCreate needs
// birth_date. The DB schema has it; the FastAPI schema doesn't. Third instance of
// the FastAPI schemas lagging the DB, after BiometricsCreate vs the narrow
// BIOMETRICS table.

import type { LifestyleProfileCreate } from "@/types/api";
import type { IllnessType, Medication, OnboardingProfile } from "../mock/mapping";

/** The answers this onboarding actually collects (index.tsx -> markers.tsx). */
export interface RawOnboardingAnswers {
  birthDate: string; // ISO date; approximated from the age wheel until a DOB source exists
  autoimmune: boolean;
  stressLevel: string | null; // "Low" | "Moderate" | "High" | null
  smokes: boolean;
  drinks: boolean;
  drinkFrequency: string | null; // "Occasionally" | "Weekly" | "Daily" | null
  sickTypes: string[]; // raw labels: "Respiratory" | "Stomach or digestive" | "Other"
  medTypes: string[]; // raw labels (see MED label matching below)
}

const ILLNESS_BY_LABEL: Record<string, IllnessType> = {
  Respiratory: "respiratory",
  "Stomach or digestive": "gi",
  Other: "other",
};

function mapMedications(labels: string[]): Medication[] {
  const joined = labels.join(" ").toLowerCase();
  const out: Medication[] = [];
  if (/beta|heart[\s-]?rate/.test(joined)) out.push("beta_blocker");
  if (/steroid|immun/.test(joined)) out.push("steroid");
  return out;
}

// --- wire-format helpers (moved from markers.tsx; server behavior unchanged) ------
// The backend fields predate this simplified onboarding, so these translate what's
// collected here into its scales/enums.
function mapStressLevel(level: string | null): number {
  switch (level) {
    case "Low": return 3;
    case "Moderate": return 6;
    case "High": return 9;
    default: return 5; // none given — neutral midpoint
  }
}
function mapSmokingStatus(smokes: boolean): LifestyleProfileCreate["smoking_status"] {
  return smokes ? "current" : "never"; // can't tell "former" from this onboarding
}
function mapAlcoholConsumption(drinks: boolean, frequency: string | null): LifestyleProfileCreate["alcohol_consumption"] {
  if (!drinks) return "none";
  switch (frequency) {
    case "Occasionally": return "light";
    case "Weekly": return "moderate";
    case "Daily": return "heavy";
    default: return "light";
  }
}

/** raw -> canonical on-device profile (feeds the mapping layer). birthDate stays canonical. */
export function rawToOnboarding(raw: RawOnboardingAnswers, opts: { seed: string }): OnboardingProfile {
  const illnessTypes = raw.sickTypes.map((l) => ILLNESS_BY_LABEL[l]).filter(Boolean) as IllnessType[];
  return {
    seed: opts.seed,
    birthDate: raw.birthDate,
    autoimmune: raw.autoimmune,
    stressed: raw.stressLevel === "Moderate" || raw.stressLevel === "High",
    smokes: raw.smokes,
    drinks: raw.drinks,
    recentIllness: illnessTypes.length ? { types: illnessTypes } : null,
    medications: mapMedications(raw.medTypes),
  };
}

/** raw -> server wire format (fire-and-forget). NB: no birth_date until the schema gains it. */
export function rawToLifestyle(raw: RawOnboardingAnswers): LifestyleProfileCreate {
  return {
    diet: "moderate", // not collected here yet — neutral placeholder
    has_autoimmune_condition: raw.autoimmune,
    smoking_status: mapSmokingStatus(raw.smokes),
    alcohol_consumption: mapAlcoholConsumption(raw.drinks, raw.drinkFrequency),
    medications: raw.medTypes,
    perceived_stress_level: mapStressLevel(raw.stressLevel),
    activity_level: "moderate", // not collected here yet
    works_shift_work: false,
    family_history_autoimmune: false,
    currently_in_flare: false,
  };
}

/** RESTORE: server wire -> canonical on-device profile. AWAITING A CALLER (login).
 *  birthDate isn't on the wire yet, so it must be supplied (HealthKit DOB); we
 *  default it only so a restore never crashes for lack of one. */
export function lifestyleToOnboarding(l: LifestyleProfileCreate, opts: { seed: string; birthDate: string }): OnboardingProfile {
  return {
    seed: opts.seed,
    birthDate: opts.birthDate,
    autoimmune: l.has_autoimmune_condition,
    stressed: l.perceived_stress_level >= 7,
    smokes: l.smoking_status === "current",
    drinks: l.alcohol_consumption === "moderate" || l.alcohol_consumption === "heavy",
    medications: mapMedications(l.medications),
  };
}
