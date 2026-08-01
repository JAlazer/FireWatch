// MockHealthDataProvider mirrors the real HealthKit binding's surface: it returns
// in-memory sample OBJECTS (never a parsed file), so swapping to real HealthKit
// never touches calling code. It serves from a generate() store, clipped to a
// current time so it can't hand back data that in reality wouldn't have arrived
// yet (#5 -- e.g. today's resting HR, which lags ~17h).

import { generate, type GeneratedStore, type GenSample } from "./generate";
import type { PhysiologyProfile } from "./profile";
import type {
  AnchoredResult,
  CategorySample,
  DateRange,
  ISODate,
  QuantitySample,
  QueryAnchor,
  StatisticOption,
  StatisticsBucket,
} from "./types";

/** Epoch-ms "now". Injectable so tests (and deterministic replays) fix the clock. */
export type Clock = () => number;

export interface StatisticsQuery extends DateRange {
  intervalMs: number;
  statistic: StatisticOption;
}

const iso = (ms: number) => new Date(ms).toISOString();

export class MockHealthDataProvider {
  private store: GeneratedStore;
  private now: Clock;

  constructor(profile: PhysiologyProfile, range: DateRange, opts?: { now?: Clock }) {
    this.store = generate(profile, range);
    this.now = opts?.now ?? (() => Date.now());
  }

  async requestAuthorization(): Promise<boolean> {
    return true;
  }

  /** For the onboarding age pre-fill. Approx DOB = Jan 1 of (this year - age). */
  getDateOfBirth(): ISODate {
    const year = new Date(this.now()).getUTCFullYear() - this.store.profile.age;
    return new Date(Date.UTC(year, 0, 1)).toISOString();
  }

  /** A sample currently exists in the store: arrived, and not yet retracted. */
  private visible(s: GenSample): boolean {
    const now = this.now();
    return s.creationMs <= now && (s.retractedAtMs == null || s.retractedAtMs > now);
  }

  private toPublic(s: GenSample): QuantitySample {
    return {
      uuid: s.uuid,
      quantity: s.value,
      unit: s.unit ?? "",
      startDate: iso(s.startMs),
      endDate: iso(s.endMs),
      creationDate: iso(s.creationMs),
      sourceName: s.sourceName,
    };
  }

  /** Point-in-time query by startDate window; returns currently-visible samples. */
  queryQuantitySamples(identifier: string, range: DateRange): QuantitySample[] {
    const fromMs = Date.parse(range.from);
    const toMs = Date.parse(range.to);
    return this.store.samples
      .filter((s) => s.identifier === identifier && s.startMs >= fromMs && s.startMs < toMs && this.visible(s))
      .sort((a, b) => a.startMs - b.startMs)
      .map((s) => this.toPublic(s));
  }

  /**
   * Incremental query. Walks the change log in creationDate order (NOT startDate),
   * clipped to now, so it can return a sample whose startDate is older than one
   * already delivered, and can surface retractions as deletedSamples.
   */
  queryQuantitySamplesWithAnchor(identifier: string, opts?: { anchor?: QueryAnchor }): AnchoredResult<QuantitySample> {
    const now = this.now();
    const events = this.store.events.filter(
      (e) => e.tMs <= now && this.store.samples[e.index].identifier === identifier,
    );
    const delivered = opts?.anchor?.delivered ?? 0;
    const samples: QuantitySample[] = [];
    const deletedSamples: { uuid: string }[] = [];
    for (const e of events.slice(delivered)) {
      const s = this.store.samples[e.index];
      if (e.kind === "insert") samples.push(this.toPublic(s));
      else deletedSamples.push({ uuid: s.uuid });
    }
    return { newAnchor: { delivered: events.length }, samples, deletedSamples };
  }

  /** Bucketed statistics. value is null for empty buckets (unworn), never 0. */
  queryStatistics(identifier: string, q: StatisticsQuery): StatisticsBucket[] {
    const fromMs = Date.parse(q.from);
    const toMs = Date.parse(q.to);
    const unit = this.store.samples.find((s) => s.identifier === identifier)?.unit ?? "";
    const buckets: StatisticsBucket[] = [];
    for (let t = fromMs; t < toMs; t += q.intervalMs) {
      const end = Math.min(t + q.intervalMs, toMs);
      const vals = this.store.samples
        .filter((s) => s.identifier === identifier && s.startMs >= t && s.startMs < end && this.visible(s))
        .map((s) => s.value);
      buckets.push({ startDate: iso(t), endDate: iso(end), unit, value: vals.length ? aggregate(vals, q.statistic) : null });
    }
    return buckets;
  }

  /** Sleep is defined but not yet generated; returns empty for now. */
  queryCategorySamples(_identifier: string, _range: DateRange): CategorySample[] {
    return [];
  }
}

function aggregate(vals: number[], stat: StatisticOption): number {
  switch (stat) {
    case "sum":
      return vals.reduce((a, b) => a + b, 0);
    case "min":
      return Math.min(...vals);
    case "max":
      return Math.max(...vals);
    default:
      return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
}
