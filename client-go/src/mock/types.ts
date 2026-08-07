// Public HealthKit-shaped types, written to MATCH the real binding
// (@kingstinct/react-native-healthkit v8.2.0) so mock <-> real is a config swap.
// Verified against its type defs on 2026-07-31:
//   - HKQuantitySample has NO creationDate (only startDate/endDate as Date objects).
//     Arrival ordering is observable ONLY through the anchor stream, not a field.
//   - source is nested: sourceRevision.source.name (optional).
//   - the anchor is an opaque string; deletions carry a uuid.
//
// Internal generation still uses arrival time (GenSample.creationMs in generate.ts)
// to ORDER the anchor stream and clip to "now" -- it is just never surfaced here,
// exactly as the binding hides it.

/** ISO-8601 instant — INTERNAL only (generation/date-range plumbing). */
export type ISODate = string;
/** Internal half-open [from, to) window used by generate(). */
export interface DateRange {
  from: ISODate;
  to: ISODate;
}

// --- binding sub-types ---------------------------------------------------------
export interface HKDevice {
  name?: string;
  manufacturer?: string;
  model?: string;
  hardwareVersion?: string;
  softwareVersion?: string;
}
export interface HKSource {
  name: string;
  bundleIdentifier: string;
}
export interface HKSourceRevision {
  source: HKSource;
  version?: string;
  operatingSystemVersion?: string;
  productType?: string;
}
/** A retracted sample as the anchored query reports it (carries uuid + metadata). */
export interface DeletedSample {
  uuid: string;
  metadata?: Record<string, unknown>;
}

/** HKQuantitySample (heart rate, HRV, resting HR, ...). NO creationDate. */
export interface QuantitySample {
  uuid: string;
  device?: HKDevice;
  quantityType: string; // HKQuantityTypeIdentifier
  quantity: number;
  unit: string;
  metadata?: Record<string, unknown>;
  sourceRevision?: HKSourceRevision;
  startDate: Date;
  endDate: Date;
}

/** HKCategorySample (sleep). Apple's category `value` is a numeric enum. */
export interface CategorySample {
  uuid: string;
  categoryType: string; // HKCategoryTypeIdentifier
  value: number;
  startDate: Date;
  endDate: Date;
  metadata?: Record<string, unknown>;
  sourceRevision?: HKSourceRevision;
}

/**
 * Statistics bucket. A convenience shape (the binding's statistics-collection API
 * differs); `value` is nullable — null means "no data" (not worn), distinct from 0.
 */
export interface StatisticsBucket {
  startDate: Date;
  endDate: Date;
  value: number | null;
  unit: string;
}
export type StatisticOption = "average" | "sum" | "min" | "max";

/** Query window using Date, matching the binding's from/to options. */
export interface QueryOptions {
  from?: Date;
  to?: Date;
}

/** Opaque anchor cursor (a string, like the real binding). */
export type QueryAnchor = string;

/** Anchored-query result: new samples, deletions (with uuid), and the next anchor. */
export interface AnchoredResult<T> {
  newAnchor: QueryAnchor;
  samples: T[];
  deletedSamples: DeletedSample[];
}
