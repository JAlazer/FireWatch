// Metric registry — the generator's source of truth for WHAT it supports.
// Deliberately lives in the TS core, NOT in healthkit-calibration.json (finding
// #5a): identifiers/units/occurrence models/enabled flags describe the generator,
// not anyone's export. calibration.json holds measured-or-assumed PARAMETERS only.
//
// Adding a metric later = flip `enabled` here and fill its parameters in the
// calibration file. The five occurrence models are implemented once (occurrence.ts)
// and metrics pick one.

export type OccurrenceModel =
  | "dense-intraday" // heart rate, steps — many samples/day, bimodal cadence
  | "sparse-irregular" // HRV, SpO2 — a handful/day at irregular times
  | "once-daily" // resting HR — one computed daily summary, end of day
  | "once-nightly" // wrist temp — one reading inside the sleep window
  | "rare-episodic" // VO2 max — infrequent, absent entirely for many users
  | "sleep-session"; // sleep — CategorySample, staged sequences, night-grouped

export type SampleKind = "quantity" | "category";

export interface MetricDef {
  key: string; // short name, also the calibration.json key
  identifier: string; // HK type identifier
  unit: string | null;
  occurrence: OccurrenceModel;
  sampleKind: SampleKind;
  enabled: boolean;
}

const HK = "HKQuantityTypeIdentifier";

// Enabled initially: the three best-grounded metrics, which are also the markers
// the dashboard shows every user regardless of onboarding answers.
export const REGISTRY: Record<string, MetricDef> = {
  HeartRate: { key: "HeartRate", identifier: `${HK}HeartRate`, unit: "count/min", occurrence: "dense-intraday", sampleKind: "quantity", enabled: true },
  HeartRateVariabilitySDNN: { key: "HeartRateVariabilitySDNN", identifier: `${HK}HeartRateVariabilitySDNN`, unit: "ms", occurrence: "sparse-irregular", sampleKind: "quantity", enabled: true },
  RestingHeartRate: { key: "RestingHeartRate", identifier: `${HK}RestingHeartRate`, unit: "count/min", occurrence: "once-daily", sampleKind: "quantity", enabled: true },

  // Defined but disabled — enabling is fill-in-parameters, not add-code.
  RespiratoryRate: { key: "RespiratoryRate", identifier: `${HK}RespiratoryRate`, unit: "count/min", occurrence: "sparse-irregular", sampleKind: "quantity", enabled: false },
  OxygenSaturation: { key: "OxygenSaturation", identifier: `${HK}OxygenSaturation`, unit: "%", occurrence: "sparse-irregular", sampleKind: "quantity", enabled: false },
  AppleSleepingWristTemperature: { key: "AppleSleepingWristTemperature", identifier: `${HK}AppleSleepingWristTemperature`, unit: "degC", occurrence: "once-nightly", sampleKind: "quantity", enabled: false },
  StepCount: { key: "StepCount", identifier: `${HK}StepCount`, unit: "count", occurrence: "dense-intraday", sampleKind: "quantity", enabled: false },
  ActiveEnergyBurned: { key: "ActiveEnergyBurned", identifier: `${HK}ActiveEnergyBurned`, unit: "kcal", occurrence: "dense-intraday", sampleKind: "quantity", enabled: false },
  VO2Max: { key: "VO2Max", identifier: `${HK}VO2Max`, unit: "mL/min·kg", occurrence: "rare-episodic", sampleKind: "quantity", enabled: false },
  SleepAnalysis: { key: "SleepAnalysis", identifier: "HKCategoryTypeIdentifierSleepAnalysis", unit: null, occurrence: "sleep-session", sampleKind: "category", enabled: false },
};

export const ENABLED_METRICS: MetricDef[] = Object.values(REGISTRY).filter((m) => m.enabled);

export function metricByIdentifier(identifier: string): MetricDef | undefined {
  return Object.values(REGISTRY).find((m) => m.identifier === identifier);
}
