// Adapter: server WIRE format (LifestyleProfileCreate) -> canonical ON-DEVICE
// profile (OnboardingProfile, which feeds the mapping layer). The onboarding
// SCREENS keep collecting the server shape; only this adapter bridges the two, so
// the still-evolving server schema doesn't churn the screens.
//
// NOTE: LifestyleProfileCreate has no `age`, but the mapping layer needs it for
// age-conditioned centroids. Real HealthKit supplies it via getDateOfBirth; until
// then we default it (and let the caller override).

import type { LifestyleProfileCreate } from "@/types/api";
import type { OnboardingProfile } from "../mock/mapping";

const DAY = 86_400_000;

const ACTIVITY_TO_LEVEL: Record<LifestyleProfileCreate["activity_level"], number> = {
  sedentary: 25,
  light: 40,
  moderate: 55,
  active: 80,
  very_active: 110,
};

/** Map free-text medication labels to the two the mapping layer models. */
function mapMedications(meds: string[]): ("beta_blocker" | "steroid")[] {
  const joined = meds.join(" ").toLowerCase();
  const out: ("beta_blocker" | "steroid")[] = [];
  if (/beta|heart[\s-]?rate/.test(joined)) out.push("beta_blocker");
  if (/steroid|immun/.test(joined)) out.push("steroid");
  return out;
}

export function lifestyleToOnboarding(l: LifestyleProfileCreate, opts: { seed: string; age?: number; nowMs?: number }): OnboardingProfile {
  const nowMs = opts.nowMs ?? Date.now();
  const profile: OnboardingProfile = {
    seed: opts.seed,
    age: opts.age ?? 40, // schema gap: no age on LifestyleProfileCreate; HealthKit getDateOfBirth later
    activityLevel: ACTIVITY_TO_LEVEL[l.activity_level],
    autoimmune: l.has_autoimmune_condition,
    smokes: l.smoking_status === "current",
    drinks: l.alcohol_consumption === "moderate" || l.alcohol_consumption === "heavy",
    stressed: l.perceived_stress_level >= 7, // 1-10 scale; high stress
    medications: mapMedications(l.medications),
  };
  // A reported CURRENT flare -> an explicit ongoing episode so today reflects it.
  if (l.currently_in_flare) {
    profile.explicitEpisodes = [{
      from: new Date(nowMs - 8 * DAY).toISOString(),
      to: new Date(nowMs + 5 * DAY).toISOString(),
      kind: "flare(reported)",
      effects: [{ metric: "HeartRateVariabilitySDNN", factor: 0.749 }, { metric: "RestingHeartRate", factor: 1.086 }],
    }];
  }
  // diet & family_history_autoimmune are intentionally not mapped: the mapping
  // table has no effect entry for them (diet is out of scope; family history has
  // no quantified HRV/RHR effect).
  return profile;
}
