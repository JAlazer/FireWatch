// Inflammation scoring — a PURE module: samples in, {score, level} out. No server,
// no API, no DB. Implements PROJECT_VISION's model:
//   - personalized baseline (this user's own history), never population
//   - a 3-day rolling average to smooth day-to-day noise
//   - a robust MEDIAN/MAD baseline over a window that GROWS 28 -> 56 days
//   - the TWO-SIGNAL CONCORDANCE rule, with asymmetric enter/stay/exit hysteresis
//
// Directions: HRV DOWN and resting HR UP are concerning; both z-scored so positive
// directed-z always means "more inflammation". HRV is far noisier (~29% MAPE) than
// resting HR (~6% MAPE), which is why the hysteresis lets the better-measured
// signal carry state through HRV's noisy days.
//
// Cold-start / gaps: fewer than BASELINE_MIN_DAYS of data in the window -> status
// "calibrating", NO score (deliberate: no score until the baseline is trustworthy).

import type { QuantitySample } from "./types";

const DAY_MS = 86_400_000;

export const SCORING = {
  ROLL_DAYS: 3, // rolling-average window
  BASELINE_MAX_DAYS: 56, // baseline window grows toward this as data accumulates
  BASELINE_MIN_DAYS: 28, // need this many present days to exit calibrating
  Z_THRESHOLD: 1.0, // per-signal directed-z to count as "concerning"
  EXIT_DAYS: 2, // consecutive days failing STAY before dropping out of elevated
} as const;

export interface ScoreResult {
  day: string;
  status: "calibrating" | "scored";
  level: number | null; // 1 (calm) .. 5; null while calibrating
  score: number | null; // continuous severity when elevated, else 0
  hrvZ: number | null; // directed z (positive = HRV dropped)
  rhrZ: number | null; // directed z (positive = resting HR rose)
  elevated: boolean;
  reason: string;
}

const dayIndex = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);
const isoOfDay = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** One value per day: mean of that day's samples. */
function dailyMeans(samples: QuantitySample[]): Map<number, number> {
  const acc = new Map<number, { sum: number; n: number }>();
  for (const s of samples) {
    const d = Math.floor(Date.parse(s.startDate) / DAY_MS);
    const a = acc.get(d) ?? { sum: 0, n: 0 };
    a.sum += s.quantity;
    a.n += 1;
    acc.set(d, a);
  }
  const out = new Map<number, number>();
  for (const [d, a] of acc) out.set(d, a.sum / a.n);
  return out;
}

/** Mean of up-to-ROLL_DAYS daily values ending at `end` (null if none). */
function rolling(daily: Map<number, number>, end: number): number | null {
  const vals: number[] = [];
  for (let d = end - SCORING.ROLL_DAYS + 1; d <= end; d++) {
    const v = daily.get(d);
    if (v != null) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Robust baseline = median + MAD (scaled to an SD-equivalent) of the 3-day rolling
 * stat across the window ENDING just before the current rolling window (so a
 * current flare can't inflate its own baseline). Window grows to BASELINE_MAX_DAYS;
 * null if fewer than BASELINE_MIN_DAYS days have a rolling value. Flagged days are
 * NOT excluded (that would make the baseline depend on the score).
 */
function robustBaseline(daily: Map<number, number>, end: number): { center: number; scale: number } | null {
  const hi = end - SCORING.ROLL_DAYS;
  const rolls: number[] = [];
  for (let d = hi - SCORING.BASELINE_MAX_DAYS + 1; d <= hi; d++) {
    const r = rolling(daily, d);
    if (r != null) rolls.push(r);
  }
  if (rolls.length < SCORING.BASELINE_MIN_DAYS) return null;
  const center = median(rolls);
  const mad = median(rolls.map((r) => Math.abs(r - center)));
  return { center, scale: 1.4826 * mad || 1e-9 };
}

/** Directed z for both signals on a given day (null z = that signal unavailable). */
function directedZ(hrvDaily: Map<number, number>, rhrDaily: Map<number, number>, end: number) {
  const hb = robustBaseline(hrvDaily, end);
  const rb = robustBaseline(rhrDaily, end);
  if (!hb || !rb) return { ready: false as const };
  const hrvNow = rolling(hrvDaily, end);
  const rhrNow = rolling(rhrDaily, end);
  return {
    ready: true as const,
    hrvZ: hrvNow == null ? null : (hb.center - hrvNow) / hb.scale, // HRV down -> positive
    rhrZ: rhrNow == null ? null : (rhrNow - rb.center) / rb.scale, // RHR up -> positive
  };
}

function levelFor(elevated: boolean, severity: number): number {
  if (!elevated) return 1;
  if (severity < 1.5) return 2;
  if (severity < 2.25) return 3;
  if (severity < 3) return 4;
  return 5;
}

const T = SCORING.Z_THRESHOLD;
const concern = (z: number | null) => z != null && z >= T;
const contradicts = (z: number | null) => z != null && z < 0;

/**
 * Score a SEQUENCE of days with asymmetric concordance hysteresis:
 *   ENTER elevated: both signals >= threshold (true two-signal concordance)
 *   STAY  elevated: one signal >= threshold AND the other not contradicting (>= 0)
 *   EXIT: STAY fails for EXIT_DAYS consecutive days
 * The stay rule lets the better-measured RHR carry the elevated state through HRV's
 * noisy days without a fixed timer.
 */
export function scoreSeries(hrvSamples: QuantitySample[], rhrSamples: QuantitySample[], fromDay: string, toDay: string): ScoreResult[] {
  const hrvDaily = dailyMeans(hrvSamples);
  const rhrDaily = dailyMeans(rhrSamples);
  const out: ScoreResult[] = [];
  let elevated = false;
  let stale = 0;

  for (let d = dayIndex(fromDay); d <= dayIndex(toDay); d++) {
    const z = directedZ(hrvDaily, rhrDaily, d);
    if (!z.ready) {
      elevated = false;
      stale = 0;
      out.push({ day: isoOfDay(d), status: "calibrating", level: null, score: null, hrvZ: null, rhrZ: null, elevated: false, reason: `baseline not ready (need >=${SCORING.BASELINE_MIN_DAYS}d for both signals)` });
      continue;
    }
    const { hrvZ, rhrZ } = z;
    const enter = concern(hrvZ) && concern(rhrZ);
    const stay = (concern(hrvZ) && !contradicts(rhrZ)) || (concern(rhrZ) && !contradicts(hrvZ));

    let reason: string;
    if (!elevated) {
      if (enter) { elevated = true; stale = 0; reason = "ENTER: both signals concerning"; }
      else reason = "calm";
    } else if (stay) {
      stale = 0;
      reason = enter ? "STAY: both concerning" : "STAY: one signal carries (other not contradicting)";
    } else {
      stale += 1;
      if (stale >= SCORING.EXIT_DAYS) { elevated = false; reason = `EXIT: stay failed ${stale}d`; }
      else reason = `holding (stay failed ${stale}/${SCORING.EXIT_DAYS}d)`;
    }

    const severity = elevated ? Math.max(hrvZ ?? 0, rhrZ ?? 0) : 0;
    out.push({
      day: isoOfDay(d), status: "scored", level: levelFor(elevated, severity), score: round(severity),
      hrvZ: hrvZ == null ? null : round(hrvZ), rhrZ: rhrZ == null ? null : round(rhrZ), elevated,
      reason: `${reason} (HRV z=${hrvZ == null ? "-" : round(hrvZ)}, RHR z=${rhrZ == null ? "-" : round(rhrZ)})`,
    });
  }
  return out;
}

/** Single-day score (stateless; symmetric concordance). For one-off queries. */
export function score(hrvSamples: QuantitySample[], rhrSamples: QuantitySample[], onDay: string): ScoreResult {
  const only = scoreSeries(hrvSamples, rhrSamples, onDay, onDay)[0];
  return only;
}
