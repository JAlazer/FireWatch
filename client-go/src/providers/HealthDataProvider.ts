// HealthDataProvider — the written contract for health-data access. Its shape is
// dictated by the REAL binding (@kingstinct/react-native-healthkit v8.2.0), not by
// what the mock happens to produce, so `implements HealthDataProvider` on the mock
// makes the typechecker reject any drift from the real binding at COMPILE time.
//
// All methods are async because the real binding does native calls. Today there is
// only one implementation (the mock), so this can't catch a mismatch yet; its value
// is that when the real HealthKit provider is written it targets a specification
// instead of reverse-engineering the mock.
//
// The mock lives in src/mock/ (generator core + MockHealthDataProvider); a real
// HealthKitProvider implementing this same interface would live here in src/providers/.

import type {
  AnchoredResult,
  CategorySample,
  QuantitySample,
  QueryAnchor,
  QueryOptions,
  StatisticOption,
  StatisticsBucket,
} from "../mock/types";

export interface AnchoredQueryOptions extends QueryOptions {
  anchor?: QueryAnchor;
  limit?: number;
}

export interface StatisticsQueryOptions extends QueryOptions {
  intervalMs: number;
  statistic: StatisticOption;
}

export interface HealthDataProvider {
  requestAuthorization(): Promise<boolean>;
  /** Wearer's date of birth, for the onboarding age pre-fill. */
  getDateOfBirth(): Promise<Date>;

  /** Point-in-time query by startDate window; currently-visible samples. */
  queryQuantitySamples(quantityType: string, options: QueryOptions): Promise<QuantitySample[]>;

  /** Incremental query: walks the change stream via the opaque anchor. */
  queryQuantitySamplesWithAnchor(quantityType: string, options?: AnchoredQueryOptions): Promise<AnchoredResult<QuantitySample>>;

  /** Bucketed statistics; bucket value is null when there's no data (not worn). */
  queryStatistics(quantityType: string, options: StatisticsQueryOptions): Promise<StatisticsBucket[]>;

  queryCategorySamples(categoryType: string, options: QueryOptions): Promise<CategorySample[]>;
}
