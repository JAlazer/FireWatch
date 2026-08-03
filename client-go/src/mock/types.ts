// HealthKit-shaped sample types the mock generator emits and MockHealthDataProvider
// returns. These mirror the real binding's return shapes so swapping mock -> real
// HealthKit never touches calling code. See PROJECT_VISION.md and the generator spec.
//
// Change-log model (NOT a time series): `creationDate` is when a sample landed in
// the store, distinct from `startDate` (when it was measured). Anchored queries
// walk creationDate order, so they can deliver out-of-order and deleted samples.

/** ISO-8601 instant, e.g. "2026-07-26T10:16:20-04:00". */
export type ISODate = string;

/** A half-open [from, to) query window. */
export interface DateRange {
  from: ISODate;
  to: ISODate;
}

/** HKQuantitySample analogue (heart rate, HRV, resting HR, ...). */
export interface QuantitySample {
  uuid: string;
  quantity: number;
  unit: string;
  startDate: ISODate;
  endDate: ISODate;
  creationDate: ISODate; // arrival time; >= startDate, first-class (change-log)
  sourceName: string;
}

/** HKCategoryValueSleepAnalysis values, the only category type in scope now. */
export type SleepStageValue =
  | "HKCategoryValueSleepAnalysisInBed"
  | "HKCategoryValueSleepAnalysisAsleepCore"
  | "HKCategoryValueSleepAnalysisAsleepDeep"
  | "HKCategoryValueSleepAnalysisAsleepREM"
  | "HKCategoryValueSleepAnalysisAsleepUnspecified"
  | "HKCategoryValueSleepAnalysisAwake";

/** HKCategorySample analogue (sleep). */
export interface CategorySample {
  uuid: string;
  value: SleepStageValue;
  startDate: ISODate;
  endDate: ISODate;
  creationDate: ISODate;
  sourceName: string;
}

/**
 * HKStatistics bucket. `value` is nullable: null means "no data in this bucket"
 * (device not worn), which is categorically different from 0 (e.g. zero steps).
 */
export interface StatisticsBucket {
  startDate: ISODate;
  endDate: ISODate;
  value: number | null;
  unit: string;
}

export type StatisticOption = "average" | "sum" | "min" | "max";

/**
 * Opaque anchor for incremental queries. Encodes a position in creationDate
 * order (NOT startDate order). Deterministic given (profile, dateRange).
 */
export interface QueryAnchor {
  /** Number of samples already delivered in creationDate order. */
  delivered: number;
}

/** Result of an anchored query: new samples, retractions, and the next anchor. */
export interface AnchoredResult<T> {
  newAnchor: QueryAnchor;
  samples: T[];
  deletedSamples: { uuid: string }[];
}
