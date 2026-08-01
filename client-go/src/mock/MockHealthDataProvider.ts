// MockHealthDataProvider implements HealthDataProvider (the real-binding contract),
// serving in-memory objects from a generate() store. `implements` makes the
// typechecker enforce that the mock's shape matches what the real binding returns.
//
// Arrival time (GenSample.creationMs) is kept INTERNAL -- used to order the anchor
// stream and clip to "now" -- but NEVER surfaced on a public sample, because the
// real HKQuantitySample has no creationDate. Out-of-order arrival and deletions are
// still observable, only through the anchor stream.

import type { AnchoredQueryOptions, HealthDataProvider, StatisticsQueryOptions } from "../providers/HealthDataProvider";
import { generate, type GeneratedStore, type GenSample } from "./generate";
import type { PhysiologyProfile } from "./profile";
import type { AnchoredResult, CategorySample, DeletedSample, DateRange, QuantitySample, StatisticOption, StatisticsBucket, QueryOptions } from "./types";

/** Epoch-ms "now". Injectable so tests (and deterministic replays) fix the clock. */
export type Clock = () => number;

const SOURCE_REVISION = { source: { name: "Mock Apple Watch", bundleIdentifier: "com.apple.health.mock" }, version: "1.0" };
// HKDevice IS available at runtime — exposing it lets in-app diagnostics detect the
// device era the same way we did from the export to settle the calibration window.
const DEVICE = { name: "Apple Watch", manufacturer: "Apple", model: "Watch", hardwareVersion: "MockWatch", softwareVersion: "1.0" };
const MS = (d?: Date, fallback = 0) => (d ? d.getTime() : fallback);

export class MockHealthDataProvider implements HealthDataProvider {
  private store: GeneratedStore;
  private now: Clock;

  constructor(profile: PhysiologyProfile, range: DateRange, opts?: { now?: Clock }) {
    this.store = generate(profile, range);
    this.now = opts?.now ?? (() => Date.now());
  }

  async requestAuthorization(): Promise<boolean> {
    return true;
  }

  /** Approx DOB = Jan 1 of (this year - age). */
  async getDateOfBirth(): Promise<Date> {
    // Prefer the real birth date; fall back to a Jan-1 approximation from the
    // resolved age only when no birthDate was carried (e.g. determinism fixtures).
    if (this.store.profile.birthDate) return new Date(Date.parse(this.store.profile.birthDate));
    const year = new Date(this.now()).getUTCFullYear() - this.store.profile.age;
    return new Date(Date.UTC(year, 0, 1));
  }

  /** Currently in the store: arrived (creationMs <= now) and not yet retracted. */
  private visible(s: GenSample): boolean {
    const now = this.now();
    return s.creationMs <= now && (s.retractedAtMs == null || s.retractedAtMs > now);
  }

  private toPublic(s: GenSample): QuantitySample {
    return {
      uuid: s.uuid,
      device: DEVICE,
      quantityType: s.identifier,
      quantity: s.value,
      unit: s.unit ?? "",
      startDate: new Date(s.startMs),
      endDate: new Date(s.endMs),
      sourceRevision: SOURCE_REVISION,
    };
  }

  async queryQuantitySamples(quantityType: string, options: QueryOptions): Promise<QuantitySample[]> {
    const fromMs = MS(options.from, -Infinity);
    const toMs = MS(options.to, Infinity);
    return this.store.samples
      .filter((s) => s.identifier === quantityType && s.startMs >= fromMs && s.startMs < toMs && this.visible(s))
      .sort((a, b) => a.startMs - b.startMs)
      .map((s) => this.toPublic(s));
  }

  /**
   * Incremental query. Walks the change stream in arrival (creationMs) order via
   * the opaque anchor, clipped to now -- so it can return a sample whose startDate
   * is older than one already delivered, and surface retractions as deletedSamples.
   * The anchor is a string encoding how many change-events have been consumed.
   */
  async queryQuantitySamplesWithAnchor(quantityType: string, options?: AnchoredQueryOptions): Promise<AnchoredResult<QuantitySample>> {
    const now = this.now();
    const events = this.store.events.filter((e) => e.tMs <= now && this.store.samples[e.index].identifier === quantityType);
    const delivered = options?.anchor ? parseInt(options.anchor, 10) || 0 : 0;
    const samples: QuantitySample[] = [];
    const deletedSamples: DeletedSample[] = [];
    for (const e of events.slice(delivered)) {
      const s = this.store.samples[e.index];
      if (e.kind === "insert") samples.push(this.toPublic(s));
      else deletedSamples.push({ uuid: s.uuid });
    }
    return { newAnchor: String(events.length), samples, deletedSamples };
  }

  async queryStatistics(quantityType: string, options: StatisticsQueryOptions): Promise<StatisticsBucket[]> {
    const fromMs = MS(options.from);
    const toMs = MS(options.to);
    const unit = this.store.samples.find((s) => s.identifier === quantityType)?.unit ?? "";
    const buckets: StatisticsBucket[] = [];
    for (let t = fromMs; t < toMs; t += options.intervalMs) {
      const end = Math.min(t + options.intervalMs, toMs);
      const vals = this.store.samples
        .filter((s) => s.identifier === quantityType && s.startMs >= t && s.startMs < end && this.visible(s))
        .map((s) => s.value);
      buckets.push({ startDate: new Date(t), endDate: new Date(end), unit, value: vals.length ? aggregate(vals, options.statistic) : null });
    }
    return buckets;
  }

  /** Sleep is defined but not yet generated; returns empty for now. */
  async queryCategorySamples(_categoryType: string, _options: QueryOptions): Promise<CategorySample[]> {
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
