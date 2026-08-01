// MAPPING LAYER — OnboardingProfile -> PhysiologyProfile.
//
// This is the ONLY place that knows about conditions. The generator is medically
// agnostic: it consumes physiology parameters (baselineShifts / episodes /
// confounds) and knows nothing about autoimmune disease, smoking, medications.
// Kept separate on purpose: if the generator encoded "autoimmune -> HRV down" and
// the scorer then reported "HRV down -> inflammation", testing the scorer against
// generated data would just recover our own assumption. Here it's explicit.
//
// SCOPE: only HRV and RestingHeartRate receive effects. HeartRate gets NONE of its
// own -- it emerges from the resting floor + activity, so shifting RHR moves HR
// automatically; an independent HR effect would break that relationship.
//
// ALL EFFECTS ARE MULTIPLICATIVE factors (1.0 = no change). Every entry carries a
// `source`: "literature" (with figure + citation) or "assumed". Disabled-metric
// effects EXIST but are `pending: true` with no value -- enabling one later means
// filling a number, not restructuring. Entries that map to nothing are declared
// no-ops (`noEffect: true`) so an intentional non-effect is distinguishable from
// an oversight.

import { Rng } from "./rng";
import type { BaselineShift, Confound, EffectSource, Episode, PhysiologyProfile } from "./profile";
import type { DateRange, ISODate } from "./types";

const HRV = "HeartRateVariabilitySDNN";
const RHR = "RestingHeartRate";
const DAY_MS = 86_400_000;

export type IllnessType = "respiratory" | "gi" | "other";
export type Medication = "beta_blocker" | "steroid";

/** The onboarding answers (mirrors the Screen 1 survey the client collects). */
export interface OnboardingProfile {
  seed: string;
  age: number;
  activityLevel?: number; // optional fitness override (not collected in onboarding v1)
  autoimmune?: boolean;
  stressed?: boolean;
  smokes?: boolean;
  drinks?: boolean;
  recentIllness?: { types: IllnessType[] } | null;
  medications?: Medication[];
  /** "Now" — recent-illness episode is positioned to end here. Defaults to range.to. */
  onboardingDate?: ISODate;
  /** Explicit episodes ADD to / override the stochastic ones (deterministic testing). */
  explicitEpisodes?: Episode[];
}

// --- effect entry shape --------------------------------------------------------
interface Eff {
  factor?: number; // absent when pending
  source: EffectSource;
  citation?: string;
  note?: string;
  pending?: boolean; // disabled metric: entry exists, no value yet
}
const lit = (factor: number, citation: string, note?: string): Eff => ({ factor, source: "literature", citation, note });
const assumed = (factor: number, note?: string): Eff => ({ factor, source: "assumed", note });
const pending = (note: string): Eff => ({ source: "assumed", pending: true, note });

// --- THE TABLE (single source of the magnitudes; documents pending & no-ops) ----
export const EFFECT_TABLE = {
  autoimmune: {
    kind: "baseline+episode",
    baseline: {
      // remission state — modest; controlled disease between flares
      [HRV]: assumed(0.92, "remission baseline"),
      [RHR]: assumed(1.02, "remission baseline"),
    },
    flare: {
      // PPG-scale already (measured on Apple Watch/Fitbit/Oura) -> NO device discount
      [HRV]: lit(0.749, "RA Forecast Study, Scientific Reports 2026", "RMSSD MESOR 28.7ms remission vs 21.5 flare; PPG-scale, no device discount"),
      [RHR]: lit(1.086, "RA Forecast Study, Scientific Reports 2026", "RHR 58.2 vs 63.2 bpm remission vs flare; PPG-scale"),
    },
  },
  smoking: {
    kind: "baseline",
    baseline: {
      [HRV]: { factor: 0.93, source: "literature", citation: "CHRIS study, PLOS ONE 2019, n=4,751 (-9.8% SDNN per 10 g/day)", note: "ECG-derived -> DISCOUNTED: PPG artifact rejection compresses variance, so ECG % is an upper bound. Discount is assumed." } as Eff,
      [RHR]: assumed(1.02, "direction established, no figure found"),
    },
  },
  drinks: {
    kind: "baseline",
    baseline: {
      [RHR]: { factor: 1.047, source: "literature", citation: "smartwatch study, n=40 (nocturnal RHR 63.6 -> 66.6 during alcohol exposure)", note: "ACUTE exposure applied to a HABITUAL flag -> application is assumed though figure is measured." } as Eff,
      [HRV]: assumed(0.95),
    },
  },
  stressed: {
    kind: "baseline",
    baseline: {
      [HRV]: assumed(0.90, "direction well established, magnitude not"),
      [RHR]: assumed(1.03),
    },
  },
  recentIllness: {
    kind: "episode",
    durationDays: [10, 14] as [number, number],
    episode: {
      [HRV]: assumed(0.80, "direction solid, magnitude assumed"),
      [RHR]: assumed(1.07),
      RespiratoryRate: pending("respiratory variant should raise this — value pending (metric disabled)"),
      OxygenSaturation: pending("respiratory variant should lower this — value pending (metric disabled)"),
    },
  },
  betaBlocker: {
    kind: "confound",
    confound: {
      // CONFOUND, not baseline: the signal changes, the inflammatory state does not.
      [HRV]: lit(1.55, "Niemelä et al., JACC", "24h HF power +62-64%, RMSSD +62-79% on atenolol/metoprolol; ECG-derived and DISCOUNTED (discount assumed)"),
      [RHR]: lit(0.88, "Niemelä et al., JACC", "resting HR lowered on beta-blockade; discounted"),
    },
  },
  steroid: {
    kind: "no-op",
    noEffect: true,
    note: "suppresses CRP/IL-6 but has NO established quantified effect on HRV or resting HR. Present deliberately.",
  },
} as const;

// --- stochastic flare generation (from the autoimmune flag) --------------------
const FLARE_RATE_PER_YEAR = 0.8; // Padova cohort: 0.80 +/- 0.79 flares/yr in remission/LDA RA
const flareEffects = () => [
  { metric: HRV, factor: EFFECT_TABLE.autoimmune.flare[HRV].factor! },
  { metric: RHR, factor: EFFECT_TABLE.autoimmune.flare[RHR].factor! },
];

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

/** Flare duration in days (BRASS registry, J Rheumatol 2014): <1wk 57%, 1-2wk 13%, >=2wk 30%. */
function flareDurationDays(rng: Rng): number {
  const u = rng.next();
  if (u < 0.57) return rng.int(3, 6);
  if (u < 0.7) return rng.int(7, 13);
  return rng.int(14, 21);
}

const addDays = (iso: ISODate, n: number): ISODate => new Date(Date.parse(iso) + n * DAY_MS).toISOString();
const rangeDays = (r: DateRange) => Math.max(1, Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY_MS));

function stochasticFlares(seed: string, range: DateRange): Episode[] {
  const rng = new Rng(seed).fork("flares");
  const days = rangeDays(range);
  const n = poisson(rng, (FLARE_RATE_PER_YEAR * days) / 365);
  const out: Episode[] = [];
  for (let i = 0; i < n; i++) {
    const start = rng.int(0, days - 1);
    const dur = flareDurationDays(rng);
    out.push({ from: addDays(range.from, start), to: addDays(range.from, Math.min(days, start + dur)), kind: "flare(stochastic)", effects: flareEffects() });
  }
  return out;
}

function illnessEpisode(o: OnboardingProfile, range: DateRange): Episode {
  const rng = new Rng(o.seed).fork("illness");
  const [lo, hi] = EFFECT_TABLE.recentIllness.durationDays;
  const dur = rng.int(lo, hi);
  const end = o.onboardingDate ?? range.to; // resolving around onboarding time
  const ep = EFFECT_TABLE.recentIllness.episode;
  return {
    from: addDays(end, -dur),
    to: end,
    kind: "illness",
    // only enabled metrics get values; resp/SpO2 are pending in the table
    effects: [
      { metric: HRV, factor: ep[HRV].factor! },
      { metric: RHR, factor: ep[RHR].factor! },
    ],
  };
}

// --- the mapping ---------------------------------------------------------------
export function toPhysiologyProfile(o: OnboardingProfile, range: DateRange): PhysiologyProfile {
  const baselineShifts: BaselineShift[] = [];
  const confounds: Confound[] = [];
  const episodes: Episode[] = [];

  const addBaseline = (on: boolean | undefined, entry: Record<string, Eff>, reason: string) => {
    if (!on) return;
    for (const [metric, e] of Object.entries(entry)) {
      if (e.pending || e.factor == null) continue; // disabled metric — no value yet
      baselineShifts.push({ metric, factor: e.factor, source: e.source, reason });
    }
  };

  addBaseline(o.autoimmune, EFFECT_TABLE.autoimmune.baseline, "autoimmune (remission)");
  addBaseline(o.smokes, EFFECT_TABLE.smoking.baseline, "smoking");
  addBaseline(o.drinks, EFFECT_TABLE.drinks.baseline, "alcohol (habitual)");
  addBaseline(o.stressed, EFFECT_TABLE.stressed.baseline, "stress");

  if (o.medications?.includes("beta_blocker")) {
    for (const [metric, e] of Object.entries(EFFECT_TABLE.betaBlocker.confound)) {
      confounds.push({ metric, factor: e.factor!, source: e.source, reason: "beta-blocker" });
    }
  }
  // steroid: declared no-op — intentionally emits nothing.

  if (o.autoimmune) episodes.push(...stochasticFlares(o.seed, range));
  if (o.recentIllness) episodes.push(illnessEpisode(o, range));
  if (o.explicitEpisodes) episodes.push(...o.explicitEpisodes);

  return { seed: o.seed, age: o.age, activityLevel: o.activityLevel, baselineShifts, episodes, confounds };
}
