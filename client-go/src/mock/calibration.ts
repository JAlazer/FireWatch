// Typed access to healthkit-calibration.json (bundled asset). The JSON is the
// single source of truth for measured-or-assumed parameters; it is authored
// offline by data-parsing/build_calibration.py and copied here for the RN bundle.
//
// NOTE: keep src/mock/healthkit-calibration.json in sync with data-parsing/'s
// output. It is a copy so it can be bundled into the app; the authoritative
// version and its builder live in data-parsing/.
//
// These interfaces type only what the core reads. `_`-prefixed documentation
// fields in the JSON are intentionally omitted here.

import raw from "./healthkit-calibration.json";

export type SourceTag = "calibrated" | "synthesized";
export type EvidenceTag = "literature" | "assumed";
export type Distribution = "normal" | "lognormal";

export interface WearModel {
  coverage_pct: number;
  model: "per-day-bernoulli";
}

export interface DeviceBehavior {
  source: SourceTag;
  wear: WearModel;
  records_per_day: { p50: number; p95: number; mean: number };
  intra_day_gap_seconds: { p50: number | null; p95: number | null };
  sample_duration_seconds: { p50: number | null; p95: number | null };
  arrival_lag_seconds: { p50: number; p90: number; p95: number };
  hour_of_day_weights?: number[]; // absent when hour placement is emergent
}

export interface WithinPerson {
  source: SourceTag;
  distribution: Distribution;
  daily_mean_sd: number; // measured absolute (provenance)
  daily_mean_p50: number;
  lag1_autocorr: number;
  lag1_autocorr_n_pairs: number;
  cv?: number; // lognormal metrics: use this, not daily_mean_sd
  ar1_space?: "log" | "linear";
}

export interface PopulationCentroid {
  source: SourceTag;
  tag: EvidenceTag;
  unit: string;
  distribution: Distribution;
  by_age_band: Record<string, number>;
  model?: Record<string, unknown>;
}

export interface BetweenPersonSpread {
  source: SourceTag;
  tag: EvidenceTag;
  distribution: Distribution;
  sd?: number; // normal metrics
  cv?: number; // lognormal metrics
}

export interface ChangeLog {
  retraction_rate: number;
  backfill_event: { probability_per_generation: number; max_lag_days: number };
}

/** Wear: night vs day, each with its own probability; then per-metric gates. */
export interface WearModel {
  day: { hours: [number, number]; wear_prob: number };
  night: { hours: [number, number]; wear_prob: number };
}

/** Per-metric recording gate/cadence, conditional on wear. */
export interface Recording {
  gate: "wear-only" | "still-periods" | "daily-summary";
  cadence: "two-regime" | "poisson" | "none";
  background_gap_s?: number;
  burst_gap_s?: number;
  day_gate_per_hour?: number;
  night_gate_per_hour?: number;
}

const calibration = raw as unknown as {
  schema_version: string;
  change_log: ChangeLog;
  wear_model: WearModel;
  device_behavior: Record<string, DeviceBehavior & { recording: Recording }>;
  physiology: Record<string, unknown>;
};

export const SCHEMA_VERSION: string = calibration.schema_version;
export const CHANGE_LOG: ChangeLog = calibration.change_log;
export const WEAR_MODEL: WearModel = calibration.wear_model;

export function deviceBehavior(metricKey: string): DeviceBehavior & { recording: Recording } {
  const db = calibration.device_behavior[metricKey];
  if (!db) throw new Error(`No device_behavior for metric "${metricKey}"`);
  return db;
}

export function recording(metricKey: string): Recording {
  return deviceBehavior(metricKey).recording;
}

export function physiology<T = unknown>(metricKey: string): T {
  const p = calibration.physiology[metricKey];
  if (!p) throw new Error(`No physiology for metric "${metricKey}"`);
  return p as T;
}

// --- Continuous age-conditioned centroids (#9) --------------------------------
// Use the continuous form so a 29- and a 30-year-old don't jump discontinuously.
// by_age_band in the JSON is a human-readable summary only.

/** Representative age of a band label ("20-29" -> 25, "70+" -> 75). */
function bandRepAge(band: string): number {
  if (band.endsWith("+")) return parseInt(band, 10) + 5;
  const [lo, hi] = band.split("-").map((n) => parseInt(n, 10));
  return (lo + hi) / 2;
}

/** Linear interpolation across band representative ages (for metrics with no formula). */
function interpolateBands(byAgeBand: Record<string, number>, age: number): number {
  const pts = Object.entries(byAgeBand)
    .map(([band, v]) => [bandRepAge(band), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (age <= pts[0][0]) return pts[0][1];
  if (age >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (age <= pts[i][0]) {
      const [a0, v0] = pts[i - 1];
      const [a1, v1] = pts[i];
      return v0 + ((v1 - v0) * (age - a0)) / (a1 - a0);
    }
  }
  return pts[pts.length - 1][1];
}

interface HrvModel {
  ref_age: number;
  ref_value_ms_ecg: number;
  slope_pct_per_year: number;
  slope_application: "multiplicative" | "linear";
  plateau_age: number;
  apple_sdnn_ecg_offset_ms: number;
}

/** HRV SDNN Apple-scale centroid from the continuous model (finding #9/#14/#7). */
function hrvCentroidApple(age: number): number {
  const m = physiology<{ population_centroid: { model: HrvModel } }>("HeartRateVariabilitySDNN")
    .population_centroid.model;
  const a = Math.min(age, m.plateau_age);
  const decay = m.slope_application === "multiplicative"
    ? Math.pow(1 - m.slope_pct_per_year / 100, a - m.ref_age)
    : 1 - (m.slope_pct_per_year / 100) * (a - m.ref_age);
  return m.ref_value_ms_ecg * decay - m.apple_sdnn_ecg_offset_ms;
}

/** Continuous population centroid for an enabled metric at a given age. */
export function centroidForAge(metricKey: string, age: number): number {
  if (metricKey === "HeartRateVariabilitySDNN") return hrvCentroidApple(age);
  const pc = physiology<{ population_centroid: { by_age_band: Record<string, number> } }>(metricKey)
    .population_centroid;
  return interpolateBands(pc.by_age_band, age);
}
