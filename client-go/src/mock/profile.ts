// The PhysiologyProfile is the contract between the (step-4) mapping layer and the
// generator core. The core stays medically agnostic: it takes physiology
// parameters and produces samples. The mapping layer (OnboardingProfile ->
// PhysiologyProfile) is where "autoimmune -> HRV down 12%" lives, kept separate so
// testing the scorer against generated data can't just recover our own assumption.
//
// EFFECT SEMANTICS (#3): every effect is a MULTIPLICATIVE factor on the metric's
// value. 1.0 = no change, 0.88 = 12% lower, 1.1 = 10% higher. Factors compound.
// The three kinds are structurally different and never collapse:
//   - baselineShifts  move the person's centroid (age, smoking, habitual alcohol)
//   - episodes        time-windowed deviations from baseline (illness, flares)
//   - confounds       alter the emitted SIGNAL, not the underlying state (beta-blocker)

import type { ISODate } from "./types";

export type EffectSource = "literature" | "assumed";

/** A lasting shift to a metric's centroid. Provenance carried through (#11). */
export interface BaselineShift {
  metric: string; // registry key, e.g. "HeartRateVariabilitySDNN"
  factor: number; // multiplicative
  source?: EffectSource;
  reason?: string; // e.g. "smoking"
}

/**
 * One real-world event affecting SEVERAL signals at once (#1). Illness raises
 * resting HR, lowers HRV, raises temperature — one event, coherent dates. The
 * app's two-signal concordance rule is untestable unless episodes move multiple
 * metrics together.
 */
export interface Episode {
  from: ISODate;
  to: ISODate;
  kind?: string; // "illness" | "flare" — label only
  effects: { metric: string; factor: number }[];
}

/** A measurement confound: changes the signal, not the state (e.g. beta-blocker). */
export interface Confound {
  metric: string; // registry key of the affected signal
  factor: number; // multiplicative, applied at emission
  source?: EffectSource;
  reason?: string;
}

export interface PhysiologyProfile {
  seed: string; // stable per-user; drives ALL determinism incl. UUIDs
  age: number; // for age-conditioned centroids — resolved from birthDate once, at build
  birthDate?: ISODate; // source of truth for age; carried so getDateOfBirth is exact

  /**
   * Peak heart-rate excursion above resting, in bpm (fitness/activity level).
   * Optional (#2): omit to resolve from (seed, population); set explicitly to
   * generate a deliberately sedentary or athletic user, since cardiovascular
   * fitness is a confounder for resting HR and HRV independent of inflammation.
   */
  activityLevel?: number;

  baselineShifts?: BaselineShift[];
  episodes?: Episode[];
  confounds?: Confound[];
}

/** Product of compounding all baseline shifts for a metric (default 1.0). */
export function baselineFactor(profile: PhysiologyProfile, metricKey: string): number {
  return (profile.baselineShifts ?? [])
    .filter((s) => s.metric === metricKey)
    .reduce((f, s) => f * s.factor, 1);
}

/** Product of confound factors for a metric (applied at emission). */
export function confoundFactor(profile: PhysiologyProfile, metricKey: string): number {
  return (profile.confounds ?? [])
    .filter((c) => c.metric === metricKey)
    .reduce((f, c) => f * c.factor, 1);
}
