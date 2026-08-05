// THE DATA SEAM. The only module the Today and Trends screens call for their content.
// Each function returns a VIEW MODEL — what the screen renders — so the screens never
// see the provider, the sample stream, score.ts or series.ts. When scoring moves
// server-side, only this file changes; the screens don't.
//
// Two concrete functions shaped by what these two screens use — NOT a generic data
// layer, no repository, no interfaces for one implementation.
//
// Async on purpose: today it's a fast local generator, later a network call. Keeping
// them async now means the screens already carry loading/error paths.
//
// The view models stay DATA — no colours (client theming, dark mode), no UI copy
// beyond the semantic level word (localization lives in the screen).

import { REGISTRY } from "@/src/mock/registry";
import { heatWord, scoreSeries, type ScoreResult } from "@/src/mock/score";
import { buildProvider } from "@/src/providers/buildProvider";
import { asyncStorageAdapter } from "@/src/storage/asyncStorage";
import { loadOnboarding } from "@/src/storage/onboardingStore";
import { baselineMedian, bucketize, dailyMeans, resolveRes, windowDays, type Point, type RangeKey, type Res } from "@/src/trends/series";

// Re-exported so the screens depend only on the seam, never on src/trends directly.
export type { Point, RangeKey } from "@/src/trends/series";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const iso = (ms: number) => new Date(ms).toISOString();

interface MetricMeta { key: "hrv" | "rhr"; label: string; unit: string }
const HRV_META: MetricMeta = { key: "hrv", label: "Heart rate variability", unit: "ms" };
const RHR_META: MetricMeta = { key: "rhr", label: "Resting heart rate", unit: "bpm" };

// ================================ TODAY ==========================================

export type DayPhase = "learning" | "provisional" | "full";

export interface MetricRow {
  key: "hrv" | "rhr";
  label: string;
  value: number | null; // current value at the shown day (null = no value yet)
  unit: string;
  // DOMAIN fact, not a rendering choice: does `series` hold deviation-from-baseline or
  // raw values? (deviation once a baseline exists; raw during early learning). The
  // screen needs it to draw the zero/baseline line — it can't infer this from length.
  mode: "deviation" | "raw";
  series: { t: number; v: number }[]; // present points only; t = day index (honest spacing)
}

export interface DailyStory {
  hasProfile: boolean;
  status: DayPhase;
  daysOfHistory: number; // DATA-producing days (see below), not calendar days
  // null while learning, and while provisional/full but still gathering enough to score.
  score: { word: string; heat: number; sentence: string } | null;
  metrics: MetricRow[]; // [hrv, rhr]
}

// Direction-aware read: HRV LOWER is concerning, resting HR HIGHER is concerning. Uses
// the same natural-sign deviations shown in the rows, so it can't contradict them.
function stateSentence(hrvDev: number | null, rhrDev: number | null): string {
  const hrvLow = hrvDev != null && hrvDev <= -1;
  const rhrHigh = rhrDev != null && rhrDev >= 1;
  if (hrvLow && rhrHigh) return "Your heart-rate variability is below your usual and your resting heart rate is above it — both point toward more strain. Consider an easier day.";
  if (rhrHigh) return "Your resting heart rate is running above your usual, while your heart-rate variability is holding. Worth keeping an eye on.";
  if (hrvLow) return "Your heart-rate variability has dipped below your usual, while your resting heart rate is steady. Worth a glance.";
  return "Your heart-rate variability and resting heart rate are both close to your usual — nothing standing out.";
}

const emptyRow = (m: MetricMeta): MetricRow => ({ ...m, value: null, mode: "raw", series: [] });

function metricRow(
  m: MetricMeta, daily: Map<number, number>, byDay: Map<number, ScoreResult>, commonDay: number | null,
  ownLatestAllowed: boolean, zOf: (r: ScoreResult) => number | null, naturalMul: 1 | -1,
): { row: MetricRow; devSigma: number | null } {
  const dayForVal = commonDay ?? (ownLatestAllowed && daily.size ? Math.max(...daily.keys()) : null);
  const value = dayForVal != null ? daily.get(dayForVal) ?? null : null;
  const devAt = (d: number): number | null => { const r = byDay.get(d); const z = r ? zOf(r) : null; return z == null ? null : naturalMul * z; };
  const devSigma = dayForVal != null ? devAt(dayForVal) : null;
  const useDeviation = devSigma != null; // deviation once a baseline exists; else raw
  const series: { t: number; v: number }[] = [];
  if (dayForVal != null) {
    for (let d = dayForVal - 6; d <= dayForVal; d++) {
      const v = useDeviation ? devAt(d) : daily.has(d) ? daily.get(d)! : null;
      if (v != null) series.push({ t: d, v });
    }
  }
  return { row: { ...m, value, mode: useDeviation ? "deviation" : "raw", series }, devSigma };
}

export async function getDailyStory(date: Date = new Date()): Promise<DailyStory> {
  const profile = await loadOnboarding(asyncStorageAdapter);
  if (!profile) return { hasProfile: false, status: "learning", daysOfHistory: 0, score: null, metrics: [emptyRow(HRV_META), emptyRow(RHR_META)] };

  const now = date.getTime();
  const provider = buildProvider(profile, { now: () => now });
  const opts = { from: new Date(Date.parse(profile.startDate)), to: new Date(now + DAY) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);

  const series = scoreSeries(hrv, rhr, profile.startDate, iso(now)); // full history -> correct hysteresis at today
  const today = series[series.length - 1] ?? null;
  const byDay = new Map(series.map((r) => [Math.floor(Date.parse(r.day) / DAY), r]));
  const hrvDaily = dailyMeans(hrv), rhrDaily = dailyMeans(rhr);
  const common = [...hrvDaily.keys()].filter((d) => rhrDaily.has(d));
  const commonDay = common.length ? Math.max(...common) : null;

  // GATE = DATA-producing days: days with BOTH signals present (resting HR only exists
  // on worn days), the same basis the scorer's readiness floor uses. Not calendar days —
  // so the UI gate and the scorer can't drift with patchy wear, and slow progress
  // honestly reflects wear compliance rather than the passage of time.
  const daysOfHistory = common.length;

  const h = metricRow(HRV_META, hrvDaily, byDay, commonDay, true, (r) => r.hrvZ, -1);
  const r = metricRow(RHR_META, rhrDaily, byDay, commonDay, false, (rr) => rr.rhrZ, 1);

  const status: DayPhase = daysOfHistory < 15 ? "learning" : daysOfHistory < 28 ? "provisional" : "full";
  const heat = today?.heat ?? null;
  const score = status !== "learning" && heat != null
    ? { word: heatWord(heat), heat, sentence: stateSentence(h.devSigma, r.devSigma) }
    : null;

  return { hasProfile: true, status, daysOfHistory, score, metrics: [h.row, r.row] };
}

// ================================ TRENDS =========================================

export interface TrendMetric { points: Point[]; baseline: number | null }
export interface TrendSeries {
  hasProfile: boolean;
  spanDays: number;
  res: Res;
  dropped: boolean; // resolution dropped to daily because history is short
  // inflammation score (0-5); baseline carries the 3.0 elevated ref line; provisional =
  // any visible bucket is in the low-confidence 15-27 data-day region (drives the note).
  score: { points: Point[]; baseline: number | null; provisional: boolean };
  hrv: TrendMetric;
  rhr: TrendMetric;
}

const SCORE_REF = 3; // the elevated threshold (heat >= 3 iff elevated) — the score's meaningful reference

export async function getTrendSeries(range: RangeKey): Promise<TrendSeries> {
  const profile = await loadOnboarding(asyncStorageAdapter);
  const noData: TrendMetric = { points: [], baseline: null };
  if (!profile) return { hasProfile: false, spanDays: 0, res: "day", dropped: false, score: { points: [], baseline: null, provisional: false }, hrv: noData, rhr: noData };

  const now = Date.now();
  const startMs = Date.parse(profile.startDate);
  const spanDays = Math.max(1, Math.floor((now - startMs) / DAY));
  const win = windowDays(range);
  const fromMs = win == null ? startMs : Math.max(startMs, now - win * DAY);

  const provider = buildProvider(profile, { now: () => now });
  // Query FULL history: HRV/RHR daily values are range-independent (window-day values are
  // identical to a windowed query, so the HRV/RHR charts are unchanged), and the SCORE
  // needs the full history for its baseline + hysteresis.
  const [hrvS, rhrS] = await Promise.all([
    provider.queryQuantitySamples(HRV, { from: new Date(startMs), to: new Date(now + DAY) }),
    provider.queryQuantitySamples(RHR, { from: new Date(startMs), to: new Date(now + DAY) }),
  ]);
  const hd = dailyMeans(hrvS), rd = dailyMeans(rhrS);
  const fromDay = Math.floor(fromMs / DAY), toDay = Math.floor(now / DAY);

  // Score daily heat, MASKED to start at the 15th DATA-day (both signals present) — the
  // same gate as the Today tab. Before that the score doesn't exist -> gaps (never
  // interpolated), and if there aren't 15 data-days yet the score series is empty.
  const commonSorted = [...hd.keys()].filter((d) => rd.has(d)).sort((a, b) => a - b);
  const day15 = commonSorted.length >= 15 ? commonSorted[14] : null;   // score starts here
  const day28 = commonSorted.length >= 28 ? commonSorted[27] : Infinity; // full confidence from here
  const scoreDaily = new Map<number, number>();
  if (day15 != null) {
    for (const r of scoreSeries(hrvS, rhrS, profile.startDate, iso(now))) {
      const d = Math.floor(Date.parse(r.day) / DAY);
      if (d >= day15 && r.heat != null) scoreDaily.set(d, r.heat);
    }
  }

  const res = resolveRes(range, spanDays);
  const dropped = (range === "1Y" || range === "ALL") && res === "day";
  const showBaseline = range === "7D" || range === "1M"; // a single 28d median isn't representative over long windows

  // Score points: bucketize, then mark PROVISIONAL buckets (15-27 data-days, before the
  // 28th) lighter by reusing the partial flag — the same visual treatment as incomplete
  // periods. Days 1-14 are already gaps (masked above); day 28+ stay solid.
  const isProvisional = (p: Point) => p.value != null && Math.floor(p.t / DAY) < day28;
  const scorePts = bucketize(scoreDaily, fromDay, toDay, res).map((p) => (isProvisional(p) ? { ...p, partial: true } : p));

  return {
    hasProfile: true, spanDays, res, dropped,
    score: { points: scorePts, baseline: showBaseline ? SCORE_REF : null, provisional: scorePts.some(isProvisional) },
    hrv: { points: bucketize(hd, fromDay, toDay, res), baseline: showBaseline ? baselineMedian(hd, toDay) : null },
    rhr: { points: bucketize(rd, fromDay, toDay, res), baseline: showBaseline ? baselineMedian(rd, toDay) : null },
  };
}
